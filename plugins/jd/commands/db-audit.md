---
description: Audit a project's database in two layers — static over the Prisma schema and runtime over the live PostgreSQL database. Per-project scope (auto-detected or from db-audit.config.json). Produces a unified severity-classified report plus reviewable schema and SQL fixes. The runtime layer needs a read-only connection; the static layer needs only the schema file.
argument-hint: "[optional: layer (prisma|runtime), category (performance|security|schema|configuration|operations), connection URL, or 'dry-run']"
---

# Database Audit

Invoke the `jd:db-audit` skill to run a layered database audit.

**Arguments:** $ARGUMENTS

Steps:
1. Load the `jd:db-audit` skill via the Skill tool.
2. Resolve scope: `db-audit.config.json` at the repo root if present, else a layer or category in `$ARGUMENTS`, else auto-detect (Prisma schema present enables the static layer; a read-only connection enables the runtime layer). Announce the resolved scope.
3. Per-layer preflight:
   - static / prisma: locate and parse `schema.prisma`. No connection needed.
   - runtime / postgres: verify `psql`, verify the role is read-only (refuse if it can write to user tables — point at `layers/runtime-postgres/references/setup-audit-role.sql`), detect the PostgreSQL version, list extensions. Use `DATABASE_AUDIT_URL` or a `postgres://` URL in `$ARGUMENTS` (mask the password as `***` in all output).
4. Apply `$ARGUMENTS`:
   - `prisma` or `runtime` -> run only that layer.
   - category keyword -> restrict the runtime layer to that audit file.
   - `dry-run` -> list enabled layers and their checks; do NOT connect.
   - `compare with last report` -> diff against the most recent report under `.jd/db-audit/`.
5. Run the enabled layers, classify, and cross-reference static against runtime where both ran.
6. Generate `.jd/db-audit/<YYYY-MM-DD-HHMMSS>/` with `AUDIT-REPORT.md`, `EXECUTIVE-SUMMARY.md`, `fixes-schema.prisma.md` (static), `fixes-runtime-{critical,high,medium,low}.sql` (runtime), and `raw/`.
7. Print the resolved scope, severity counts, the top 5 findings (note which were cross-confirmed), and the report path.

Static findings are fixed in the schema; runtime findings as reviewable SQL. Nothing is applied automatically — schema patches and fix scripts are generated for review, destructive statements commented out.
