# Prisma Schema Static Checks

Static audit of `schema.prisma`. No database connection. Each finding is fixed in the schema (and the migration it produces), so fixes are version-controlled and never drift from the source of truth.

How to run: read the whole schema once, build a model map (fields, attributes, relations, indexes, `@@id`, `@@unique`), then apply every check below. For each finding record: id, category, severity, model and field, the offending lines as evidence, and the fix as a schema edit plus the migration it implies.

A relation field's underlying scalar column is "index-covered" when it is the leftmost column of any `@@index`, `@@unique`, or `@@id`. A composite whose leftmost column is the FK counts; a composite where the FK is not leftmost does not.

---

## P1. Missing index on a foreign-key column — Severity: High to Low

Prisma does not create an index for relation scalar fields (PostgreSQL does not either). Every relation `fields: [x]` whose column `x` is not index-covered is a finding.

Severity by how the column is used:
- **High** — the column backs a core list query (parent-to-children navigation on a hot path). Example: a worker-belongs-to-team `teamId`, a child-of-site `siteId`.
- **Medium** — the column is the target of `onDelete: Cascade`/`SetNull` on a parent that gets deleted, or backs an occasional reverse lookup. An un-indexed FK makes the referential-integrity check a sequential scan on delete.
- **Low** — rarely queried reverse relation, `onDelete: Restrict`/`SetNull` on a low-traffic table.

Detect: for each `@relation(fields: [c], ...)`, check whether `c` is leftmost in any index/unique/id. Watch the composite-leftmost rule — an FK that is the second column of a composite (a common pattern for join tables and read-tracking tables) is NOT covered.

Fix: add `@@index([c])` (or a composite leading with `c` if a sort column is always paired). Migration: `CREATE INDEX`. For a large hot table, recommend `CREATE INDEX CONCURRENTLY` via a manual migration.

## P2. Timezone-naive timestamps — Severity: Medium (systemic)

Prisma maps `DateTime` on PostgreSQL to `timestamp(3)` without time zone unless `@db.Timestamptz` is set. For event timestamps (`*_at`, check-in/out, audit times), naive timestamps drop offset semantics and are risky for any multi-timezone or cross-border app.

Detect: `DateTime` fields with no `@db.Timestamptz` and no `@db.Date`. `@db.Date` fields are intentional calendar dates, not a finding.

Report once as a systemic decision, list the affected fields. Fix: `@db.Timestamptz(6)` on event timestamps. Migration: `ALTER COLUMN ... TYPE timestamptz USING ...` — flag that it rewrites the column and needs a maintenance window on large tables, and that the intended source timezone must be stated in the `USING` clause.

## P3. Soft-delete column without a partial index — Severity: Low

When a model has a nullable `deletedAt` and the app filters `deletedAt IS NULL` on most reads, a plain `@@index([deletedAt])` is low value (most rows share the NULL value). A partial index `WHERE deleted_at IS NULL`, or a partial index on the real query column filtered by `deleted_at IS NULL`, serves the live-row queries better.

Prisma cannot express partial indexes, so the fix is a raw-SQL migration. Note where the project already does this (a documented raw partial index is a good sign, not a finding).

Detect: a `deletedAt` field plus a `@@index([deletedAt])` that stands alone. Fix: raw-SQL `CREATE INDEX ... WHERE deleted_at IS NULL`; keep it out of the Prisma index list and document it like the existing raw partial indexes.

## P4. Suboptimal or unbounded column types — Severity: Medium to Low

- **Medium** — `Decimal` without `@db.Decimal(p,s)` (defaults are lossy for money), or money stored as `Float`.
- **Low** — user-facing free text declared as unbounded `String` (maps to `text`) where a bound is part of the contract and the codebase bounds some peers with `@db.VarChar(n)` but not this one. Inconsistency, not a hard bug — `text` performs fine in PostgreSQL.

Detect: scan `String`/`Decimal`/`Float` fields and compare against sibling fields' `@db.*` usage to spot the inconsistent ones.

## P5. Cascade and referential-action review — Severity: Medium to Low

List every relation's `onDelete`/`onUpdate`. Flag:
- **Medium** — a child of an important parent with no `onDelete` set (Prisma default is `SetNull` for optional, `Restrict`/`NoAction` for required) where the implied behavior likely does not match intent (for example an audit/log row that should survive parent deletion but is `Cascade`, or a row that should block deletion but is `SetNull`).
- **Low** — inconsistent actions across sibling relations to the same parent.

This is a review prompt, not an automatic verdict: present the action map and ask the user to confirm intent. Do not "fix" cascade rules without confirmation.

## P6. Nullable foreign key that is likely required — Severity: Medium

A relation scalar declared optional (`String?`) where the business rule says it must always be set lets invalid rows exist. Mirror of runtime check 3.4, caught at the schema layer where the fix lives.

Detect: optional FK columns. Severity is a judgment call — present them and let the user confirm which are genuinely optional. Fix: make required and backfill; migration must handle existing NULLs first.

## P7. Model without a primary key — Severity: High

Every model needs `@id` or `@@id`. A model with neither is a correctness and replication risk. (Prisma usually rejects this, so it is rare, but verify for `@@ignore`d or views.)

## P8. Over-indexing — Severity: Medium

A model with many single-column indexes that overlap, or more than ~8 indexes, carries write overhead. Flag indexes that are prefixes of other indexes (redundant) and models with an unusually high index count. Cross-reference with the runtime "unused index" finding when available.

## P9. Enum and string-as-status drift — Severity: Low

Status/role/type columns modeled as free `String` instead of an `enum`, or enums whose values are referenced by raw string in code. Low priority; note as a data-quality improvement.

## P10. Json column without a documented shape — Severity: Low

`Json` columns (`layoutConfig`, `outputs`, `reasons`, `params`, `autoTextOverrides`) bypass schema validation. Note each one and recommend a documented TypeScript type or a Zod schema at the application boundary. Not a database fix; a data-integrity note.

---

## Optional: query call-site checks

If the project's data-access code is in scope, additionally scan for:
- **N+1** — a relation accessed in a loop without `include`/`select`, or repeated `findUnique` inside `map`.
- **Over-fetching** — `findMany` with no `select` on wide models on hot paths.
- **Unbounded reads** — `findMany` with no `take` on a growing table.

These are application findings (the runtime layer cannot see them and the SKILL marks them as `schema-static`). Keep them clearly separated from schema-shape findings in the report.

---

## Severity summary

| Check | Default severity |
|-------|------------------|
| P1 missing FK index (core query) | High |
| P1 missing FK index (cascade / occasional) | Medium |
| P1 missing FK index (rare reverse) | Low |
| P2 timezone-naive timestamps | Medium (systemic) |
| P3 soft-delete without partial index | Low |
| P4 lossy/unbounded types | Medium to Low |
| P5 cascade review | Medium to Low (confirm) |
| P6 nullable-but-required FK | Medium (confirm) |
| P7 model without primary key | High |
| P8 over-indexing | Medium |
| P9 enum/string drift | Low |
| P10 undocumented Json | Low |
