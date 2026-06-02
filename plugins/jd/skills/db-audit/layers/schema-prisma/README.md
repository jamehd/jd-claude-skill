# schema-static layer — Prisma adapter

Static audit of a Prisma schema. No database connection.

## Detection

This adapter is enabled when scope resolution finds a Prisma schema:
- `db-audit.config.json` sets `layers.schemaStatic.adapter = "prisma"`, or
- auto-detect finds `prisma/schema.prisma`, a `schema.prisma` referenced by `prisma.config.ts`/`prisma.config.js`, or a `prisma.schema` path in `package.json`.

A multi-file Prisma schema (a `schema` folder) is supported: read every `*.prisma` under it and merge models before applying checks.

## Inputs

- Required: the schema file(s). The project's own Prisma tooling is the source of truth — do not invent or assume models.
- Optional: the data-access code path, to enable the query call-site checks in `CHECKS.md`.

## Output

Findings feed the unified report. Schema fixes are emitted to `fixes-schema.prisma.md` as a reviewable patch: the exact schema edit plus the migration it implies. This adapter never edits the project schema and never runs a migration.

## Checks

See `CHECKS.md`. The catalog covers missing FK indexes, timezone-naive timestamps, soft-delete partial indexes, lossy or unbounded types, cascade and nullability review, missing primary keys, over-indexing, enum drift, and undocumented Json columns, plus optional N+1 and over-fetch checks over call sites.

## Relationship to the runtime layer

Some checks overlap the runtime PostgreSQL audit on purpose (missing FK index, timestamp type, datatype). The difference is where the fix lives: the runtime layer would emit `CREATE INDEX`/`ALTER` against the live database, which then drifts from `schema.prisma` at the next `prisma migrate`. This layer puts the fix in the schema. When both layers run, `references/cross-reference.md` merges the pair into one finding with runtime evidence attached.
