# Per-project config

`db-audit` is per-project: which layers run depends on the project. One project audits Prisma plus PostgreSQL; another audits PostgreSQL only; another uses a different stack. The skill resolves this without a config file by auto-detecting, but a config file pins the choice for repeatable CI runs.

## Resolution order

1. `db-audit.config.json` at the target repo root — used verbatim if present.
2. A layer or category named in the invocation — restricts the run for that invocation.
3. Auto-detect — Prisma schema present enables schema-static; a read-only connection present enables runtime.

## Fields

Copy `db-audit.config.example.json` to `db-audit.config.json` at the repo root and edit:

- `layers.schemaStatic.enabled` — run the static layer.
- `layers.schemaStatic.adapter` — `prisma` today.
- `layers.schemaStatic.schemaPath` — path to `schema.prisma` (or a schema folder for multi-file schemas).
- `layers.schemaStatic.scanCallSites` / `callSiteGlobs` — opt in to N+1 and over-fetch checks over data-access code.
- `layers.runtime.enabled` — run the runtime layer.
- `layers.runtime.engine` — `postgres` today.
- `layers.runtime.connectionEnv` — env var holding the read-only connection string. Never put a connection string in this file.
- `layers.runtime.categories` — subset of `performance`, `security`, `schema`, `configuration`, `operations`.
- `output.dir` / `output.gitignore` — where reports go and whether to add that folder to `.gitignore`.

## Examples

Prisma + PostgreSQL (such as CrewOS): both layers enabled — see the example file.

PostgreSQL only (no ORM): `layers.schemaStatic.enabled = false`, `layers.runtime.enabled = true`.

Schema review in CI (no database): `layers.runtime.enabled = false`, `layers.schemaStatic.enabled = true`.
