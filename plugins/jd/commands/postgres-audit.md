---
description: Audit a PostgreSQL database for performance, security, schema, configuration, and operations issues — produces severity-classified Markdown report + reviewable SQL fix scripts. Requires a read-only connection.
argument-hint: "[optional: connection URL, category filter (performance|security|schema|configuration|operations), 'dry-run', or '--anonymize']"
---

# PostgreSQL Database Audit

Invoke the `jd:postgres-audit` skill to run a comprehensive PostgreSQL audit.

**Arguments:** $ARGUMENTS

Steps:
1. Load the `jd:postgres-audit` skill via the Skill tool.
2. Resolve the connection:
   - If `$ARGUMENTS` contains a `postgres://` URL, use it and mask the password as `***` in all output.
   - Otherwise, use the `DATABASE_AUDIT_URL` env var. If neither is set, ask the user before proceeding.
3. Run preflight: verify `psql`, verify the role is read-only (refuse if it can write to user tables — point at `references/setup-audit-role.sql`), detect PostgreSQL version, list available extensions.
4. Apply scope filters from `$ARGUMENTS`:
   - Category keywords (`performance`, `security`, `schema`, `configuration`/`config`, `operations`/`ops`) → run only the matching `audits/0N-*.sql` files.
   - `dry-run` → list checks + dependencies + estimated time; do NOT connect.
   - `--anonymize` → replace table/column names with `t1`/`c1` in output.
   - `compare with last report` → diff against the most recent report under `audit-reports/`.
5. Generate `audit-reports/<YYYY-MM-DD-HHMMSS>/` with `AUDIT-REPORT.md`, `EXECUTIVE-SUMMARY.md`, `fixes-{critical,high,medium,low}.sql`, and `raw/`.
6. Print severity counts + top 5 critical findings + path to the report.

Read-only at the database level (connection-, query-, and output-layer safety). Fix SQL is generated but never executed; destructive statements are auto-commented out and require explicit uncommenting to apply.
