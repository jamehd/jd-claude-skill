---
name: postgres-audit
description: Use when user wants to audit, health-check, review, or analyze a PostgreSQL database for performance issues, security vulnerabilities, schema problems, or configuration tuning. Triggers on phrases like "audit postgres", "check database health", "find slow queries", "review db security", "postgres performance review". Requires a read-only DB connection. Outputs Markdown report + SQL fix scripts.
---

# PostgreSQL Database Audit

Comprehensive PostgreSQL audit covering Performance & Operations, Security & Access, Schema & Data Quality, and Configuration & Tuning. Produces a Markdown report classified by severity (Critical/High/Medium/Low) plus reviewable SQL fix scripts.

## When to Use

Invoke this skill when the user:
- Asks to audit, health-check, or review a PostgreSQL database
- Reports performance issues and wants root cause analysis
- Needs a pre-production security review
- Wants to verify DB best practices before a major release
- Investigates after an incident

## When NOT to Use

- Auditing non-PostgreSQL databases (MySQL, Oracle, SQL Server)
- Application code analysis (ORM patterns, N+1 detection) - this skill is DB-only
- Real-time monitoring or dashboards
- Generating schema migrations
- Executing fixes - this skill generates fix SQL but never runs it

## Prerequisites Checklist

Before running, verify:
- [ ] `psql` CLI installed and accessible (`psql --version`)
- [ ] Read-only connection string (env var `DATABASE_AUDIT_URL` or runtime input)
- [ ] User role has SELECT on pg_catalog, pg_stat_*, information_schema (use `references/setup-audit-role.sql` if needed)
- [ ] `pg_stat_statements` extension installed (recommended; some performance audits skipped without it)

## Workflow

### Step 1: Preflight Check

Verify environment:
```bash
psql --version
psql "$DATABASE_AUDIT_URL" -c "SELECT version();"
```

Detect PostgreSQL version:
```sql
SELECT current_setting('server_version_num')::int / 10000 AS major;
```

Verify read-only role - try a write that should fail:
```sql
CREATE TEMP TABLE _audit_write_test (x INT);
DROP TABLE _audit_write_test;
```
If the user can ALTER/INSERT on user tables (not just temp), REFUSE and instruct user to create read-only role using `references/setup-audit-role.sql`.

Check available extensions:
```sql
SELECT extname FROM pg_extension;
```
Note which are missing: `pg_stat_statements`, `pgaudit`, `pg_buffercache`.

### Step 2: Environment Detection

Gather DB size and classify:
```sql
SELECT
    pg_size_pretty(pg_database_size(current_database())) AS db_size,
    pg_database_size(current_database()) AS bytes,
    (SELECT count(*) FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog', 'information_schema')) AS table_count;
```

Classification:
- Small: <10 GB - standard thresholds
- Medium: 10-100 GB - standard thresholds
- Large: >100 GB - higher tolerance (vacuum_age 14d instead of 7d, skip bloat checks on tables <1GB)

### Step 3: Run Audits

Create output directory:
```bash
TIMESTAMP=$(date -u +"%Y-%m-%d-%H%M%S")
OUTDIR="audit-reports/${TIMESTAMP}"
mkdir -p "${OUTDIR}/raw"
```

Run each audit sequentially:
```bash
for audit in audits/01-performance.sql audits/02-security.sql audits/03-schema.sql audits/04-configuration.sql audits/05-operations.sql; do
    name=$(basename "$audit" .sql)
    psql "$DATABASE_AUDIT_URL" -f "$audit" -o "${OUTDIR}/raw/${name}.txt" 2>&1 || true
done
```

Category filter (if user specified scope):
- "performance" -> audits/01-performance.sql
- "security" -> audits/02-security.sql
- "schema" -> audits/03-schema.sql
- "configuration" or "config" -> audits/04-configuration.sql
- "operations" or "ops" -> audits/05-operations.sql

### Step 4: Classify Findings

Parse raw output for each audit. For each finding:
- Read severity from comments at top of each check (see `references/thresholds.md`)
- Apply environment adjustment (small/medium/large)
- Append to internal findings list with: id, category, severity, title, evidence (raw query output), recommendation

### Step 5: Generate Output Files

Use templates from `templates/`:

5a. **AUDIT-REPORT.md** (`${OUTDIR}/AUDIT-REPORT.md`):
- Start from `templates/report-template.md`
- Replace placeholders ({DB_NAME}, {PG_VERSION}, etc.)
- Group findings by severity, each as a subsection
- Reference fix script section for each finding

5b. **EXECUTIVE-SUMMARY.md** (`${OUTDIR}/EXECUTIVE-SUMMARY.md`):
- Start from `templates/executive-summary-template.md`
- Calculate health score per category (formula at template bottom)
- List top 3 actions for the week
- Estimate ROI (disk freed, queries sped up, vulnerabilities patched)

5c. **fixes-{severity}.sql** (4 files: critical, high, medium, low):
- Start from `templates/fix-script-template.sql`
- One BEGIN/COMMIT block per finding
- DESTRUCTIVE operations (DROP, REVOKE, ALTER) auto-commented out
- Include verification queries before/after each fix
- Mark dangerous fixes with `-- REQUIRES DOWNTIME` or `-- REQUIRES MAINTENANCE WINDOW`

### Step 6: Summary to User

Display in terminal:
- Counts by severity
- Top 5 critical findings (one-liners)
- Path to full report
- Recommended next actions
- Reminder: "Fix scripts generated at {path}. REVIEW before running."

## Safety Rules

This skill is READ-ONLY at the database level. THREE layers of safety:

### Layer 1: Connection-level
- Verify user role lacks CREATE/INSERT/UPDATE/DELETE/ALTER on user tables BEFORE running
- Session settings applied on connect:
  - `default_transaction_read_only = on`
  - `statement_timeout = '30s'`
  - `lock_timeout = '2s'`
  - `idle_in_transaction_session_timeout = '10s'`

### Layer 2: Query-level
- All audit queries are SELECT only
- Bloat estimation skipped on tables >10GB unless user explicitly allows
- NEVER call `pg_stat_statements_reset()` or other destructive system functions
- No LOCK TABLE, no active VACUUM/ANALYZE

### Layer 3: Output-level
- Fix scripts GENERATED but NEVER EXECUTED
- Destructive operations (DROP, REVOKE) auto-commented out in fix scripts; user must explicitly uncomment to apply
- Audit report folder auto-added to `.gitignore`

## Severity Classification

See `references/thresholds.md` for complete threshold table.

**Critical** - Immediate action (<24h):
- Public schema CREATE for PUBLIC role (CVE-2018-1058)
- Trust authentication in pg_hba.conf
- max_connections >90% used
- Query mean_exec_time >10s
- Orphaned replication slot retaining >10GB WAL
- Sequence >80% of int4 max (wraparound imminent)

**High** - Action within 1 week:
- Query mean_exec_time >1s (top 10)
- Table bloat >50% on tables >1GB
- Missing FK indexes on tables >10k rows
- Unused indexes >100MB total
- Cache hit ratio <95%
- md5 authentication (use scram-sha-256)
- SECURITY DEFINER functions

**Medium** - Action within 1 month:
- Datatype suboptimal (CHAR(n), MONEY, TIMESTAMP without TZ)
- Missing NOT NULL on FK columns
- Tables without primary key
- Stale statistics (last_analyze >7 days)
- Default privileges audit

**Low** - Best practice improvements:
- Naming convention violations
- Tables with >50 columns (denormalization smell)
- Dormant login roles (cleanup candidates)

## Output Structure

```
audit-reports/{YYYY-MM-DD-HHMMSS}/
├── AUDIT-REPORT.md          # Main technical report
├── EXECUTIVE-SUMMARY.md     # 1-page for non-tech stakeholder
├── fixes-critical.sql       # Run after manual review
├── fixes-high.sql
├── fixes-medium.sql
├── fixes-low.sql
└── raw/                     # Raw psql output per category
    ├── 01-performance.txt
    ├── 02-security.txt
    ├── 03-schema.txt
    ├── 04-configuration.txt
    └── 05-operations.txt
```

## Invocation Patterns

| User says | Behavior |
|-----------|----------|
| "audit postgres database" | Use `$DATABASE_AUDIT_URL`, confirm with user before running |
| "audit postgres at postgres://audit@host/db" | Parse URL, mask password in all output, run |
| "audit postgres security and performance only" | Run only 01-performance.sql + 02-security.sql |
| "audit postgres dry-run" | List 56 checks + dependencies + estimated time; do NOT connect |
| "audit postgres, compare with last report" | Run + diff with most recent report in audit-reports/ |
| "audit postgres --anonymize" | Replace table/column names with t1/c1 in output |

## Edge Cases

| Case | Behavior |
|------|----------|
| pg_stat_statements not installed | Skip checks 1.1-1.3, note in report Appendix B |
| User lacks pg_monitor role | Skip system-view checks, add warning to report |
| Connection drops mid-audit | Retry 3x with backoff (2s/4s/8s), save partial report |
| PostgreSQL <13 | Adapt pg_stat_statements queries (total_exec_time -> total_time) |
| PostgreSQL <10 | Refuse - suggest upgrade |
| Empty database (no tables) | Skip schema audit, run config only |
| Connection string contains password | Mask password as `***` in ALL output |
| Disk full while writing report | Fallback to `/tmp/postgres-audit-emergency/`, warn user |
| Audit running >10 min | Pause and ask user before continuing |
| Replica (read-only standby) | Skip replication slots check from master perspective |

## Version Compatibility

See `references/pg-version-matrix.md`.

Quick reference:
- PG 13-17: Full support
- PG 10-12: Partial (some queries adapted)
- PG <10: Unsupported

## References

- `references/thresholds.md` - All severity thresholds in one place
- `references/pg-version-matrix.md` - Per-version query adaptations
- `references/postgres-best-practices.md` - DBA best practices summary
- `references/setup-audit-role.sql` - One-time read-only role setup script
- `examples/sample-report.md` - Example of generated report
