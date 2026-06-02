---
name: db-audit
description: Use when the user wants to audit, health-check, review, or analyze a project's database for performance, security, schema, or configuration issues. Audits in two layers — a static layer over the ORM schema (Prisma today; pluggable) and a runtime layer over the live database (PostgreSQL today; pluggable). Per-project config selects which layers run. Triggers on "audit the database", "db health check", "review prisma schema", "find slow queries", "review db security". Static layer needs only the schema file; runtime layer needs a read-only DB connection. Outputs a unified Markdown report classified by severity plus reviewable fix scripts.
---

# Database Audit

A layered database audit. Two independent layers that can run alone or together:

- **schema-static** — reads the ORM schema (and, optionally, query call sites) from source. No database connection. Runs in CI. Findings are fixed in version-controlled code. Adapter today: `prisma`.
- **runtime** — runs read-only queries against a live database for production-grounded evidence (slow queries, bloat, index usage, configuration). Needs a read-only connection. Engine today: `postgres` (the former `postgres-audit` skill, unchanged, now a layer here).

The point of one skill over two is the **cross-reference**: a static finding ("FK column has no `@@index`") is confirmed or refuted by runtime evidence ("that column is sequentially scanned in production" / "this declared index is never used"). Neither layer alone produces that. See `references/cross-reference.md`.

## When to Use

- Audit, health-check, or review a project's database
- Review an ORM schema (Prisma) for missing indexes, unsafe types, cascade rules
- Root-cause a performance issue with production evidence
- Pre-production or pre-release database review
- Post-incident investigation

## When NOT to Use

- Real-time monitoring or dashboards
- Generating ORM migrations (this skill recommends; it does not migrate)
- Executing fixes (fix scripts are generated, never run)
- Databases with no supported layer (no Prisma schema and no PostgreSQL connection)

## Per-Project Scope

The set of layers is per-project. This is the core idea: one project audits Prisma plus PostgreSQL, another audits PostgreSQL only, another a different stack. Resolve scope in this order:

1. **Explicit config** — if `db-audit.config.json` exists at the target repo root, use it verbatim. Format and fields: `config/db-audit.config.example.json` and `config/README.md`.
2. **CLI scope override** — a category or layer named in the invocation (`prisma`, `runtime`, `schema`, `performance`, ...) restricts the run.
3. **Auto-detect** — with no config and no override:
   - If `prisma/schema.prisma` (or a `schema.prisma` resolvable from the Prisma config) exists, enable `schema-static` with the `prisma` adapter.
   - If a read-only connection is available (`DATABASE_AUDIT_URL`, or a URL passed in the invocation), enable `runtime` with the `postgres` engine.
   - If neither is available, ask the user which layer to run and how to reach the schema or database.

Announce the resolved scope before running, for example: "Scope: schema-static (prisma) + runtime (postgres)."

## Workflow

### Step 1: Resolve scope

Apply the order above. Print the resolved layers and adapters. If a requested layer cannot run (no schema file, or no connection), say so and continue with the layers that can.

### Step 2: Preflight per layer

- **schema-static / prisma** — locate the schema file. Confirm it parses (the project's own `prisma` tooling is the source of truth; do not invent models). No connection or write access needed.
- **runtime / postgres** — run the existing preflight in `layers/runtime-postgres`: verify `psql`, verify the role is read-only (refuse if it can write to user tables; point at `layers/runtime-postgres/references/setup-audit-role.sql`), detect the PostgreSQL major version, list extensions. Apply the session safety settings (read-only transaction, statement and lock timeouts).

### Step 3: Run the enabled layers

- **schema-static / prisma** — follow `layers/schema-prisma/CHECKS.md`. Read the schema, apply each check, record findings with id, category, severity, the model/field, the evidence (the offending schema lines), and the fix as a schema edit plus the migration it implies.
- **runtime / postgres** — create the output directory, then run each audit SQL into `raw/`, exactly as before:
  ```bash
  TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
  OUTDIR="audit-reports/${TIMESTAMP}"
  mkdir -p "${OUTDIR}/raw"
  for audit in layers/runtime-postgres/audits/0*.sql; do
      name=$(basename "$audit" .sql)
      psql "$DATABASE_AUDIT_URL" -f "$audit" -o "${OUTDIR}/raw/${name}.txt" 2>&1 || true
  done
  ```
  Category keywords map to single audit files (`performance`, `security`, `schema`, `configuration`/`config`, `operations`/`ops`).

### Step 4: Classify and cross-reference

- Classify each finding by severity using `layers/runtime-postgres/references/thresholds.md` (runtime) and the severity column in `layers/schema-prisma/CHECKS.md` (static). Apply the runtime environment adjustment (small/medium/large) where relevant.
- When both layers ran, correlate per `references/cross-reference.md`. Promote, demote, or merge findings:
  - Static "missing FK index" plus runtime "high sequential scans on that table" -> single finding, severity raised, runtime evidence attached.
  - Static "declared index" plus runtime "index never scanned" -> single finding, drop or question the index.
  - A finding present in only one layer stays, labeled with its source layer.

### Step 5: Generate output

Into `audit-reports/{YYYY-MM-DD-HHMMSS}/`:

- **AUDIT-REPORT.md** from `templates/report-template.md` — findings grouped by severity, each labeled with its source layer(s) and any cross-reference note.
- **EXECUTIVE-SUMMARY.md** from `templates/executive-summary-template.md`.
- **Fixes**, split by layer because they apply differently:
  - `fixes-schema.prisma.md` — schema edits (the `@@index`, `@db.Timestamptz`, cascade, nullability changes) and, for each, the migration it produces. Never edit the project schema directly; this is a reviewable patch.
  - `fixes-runtime-{critical,high,medium,low}.sql` from `templates/fix-script-template.sql` — destructive statements auto-commented, verification queries included, downtime markers where needed.
- `raw/` — raw runtime query output per category (runtime layer only).

### Step 6: Summary to user

Print: resolved scope; counts by severity; the top 5 findings as one-liners (note which were cross-confirmed by both layers); the report path; and the reminder that fix scripts and schema patches are generated but never applied — review before running.

## Safety Rules

- **schema-static** never connects to a database and never writes to the project. Schema fixes are emitted as a reviewable patch file, not applied.
- **runtime** is read-only at the database level, with the same three layers of safety as before: connection-level (read-only role and session timeouts), query-level (SELECT only, no resets, no locks, bloat skipped on very large tables unless allowed), and output-level (fix scripts generated but never executed, destructive statements commented out, the report folder added to `.gitignore`).

## Invocation Patterns

| User says | Behavior |
|-----------|----------|
| "audit the database" | Resolve scope (config, else auto-detect), run all enabled layers |
| "audit prisma schema" | Run schema-static / prisma only |
| "review db performance" | Runtime performance audit; if Prisma present, also run its index and type checks |
| "audit postgres at postgres://audit@host/db" | Runtime only against that URL, password masked in all output |
| "db-audit dry-run" | List enabled layers and their checks; do NOT connect |
| "db-audit, compare with last report" | Run, then diff against the most recent report under `audit-reports/` |

## Layers and References

- `layers/schema-prisma/CHECKS.md` — Prisma static check catalog (the value-add of this layer)
- `layers/schema-prisma/README.md` — how the Prisma adapter runs and how it is detected
- `layers/runtime-postgres/audits/` — the five runtime SQL audit packs
- `layers/runtime-postgres/references/` — thresholds, version matrix, best practices, read-only role setup
- `references/cross-reference.md` — how static and runtime findings are correlated
- `config/` — per-project config format and example
- `templates/` — unified report, executive summary, runtime fix script
- `examples/sample-report.md` — example runtime report

## Extending

To add a stack, drop in an adapter and let scope resolution find it:

- New ORM (Drizzle, TypeORM): add `layers/schema-<orm>/CHECKS.md` and a README, extend auto-detect in Step 1.
- New engine (MySQL): add `layers/runtime-<engine>/` with its own audit packs and references.

The orchestrator (this file) and the report templates stay engine-agnostic.
