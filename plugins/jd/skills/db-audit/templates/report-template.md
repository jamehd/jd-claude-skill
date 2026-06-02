# Database Audit Report

**Project:** `{PROJECT_NAME}`
**Scope:** {RESOLVED_SCOPE}
**Audit Date:** {AUDIT_TIMESTAMP_UTC}
**Audited By:** Claude Code (db-audit skill)

**schema-static (prisma):** schema `{SCHEMA_PATH}`, {MODEL_COUNT} models
**runtime (postgres):** `{DB_NAME}` @ `{HOST}:{PORT}`, PostgreSQL {PG_VERSION}, {DB_SIZE}, {TABLE_COUNT} tables, user `{AUDIT_USER}`

(Omit the line for any layer that did not run.)

---

## Executive Summary

| Severity | Count | Action SLA |
|----------|-------|-----------|
| Critical | {CRITICAL_COUNT} | Immediate (<24h) |
| High     | {HIGH_COUNT} | <1 week |
| Medium   | {MEDIUM_COUNT} | <1 month |
| Low      | {LOW_COUNT} | Backlog |

**Cross-confirmed findings (static + runtime):** {CROSS_CONFIRMED_COUNT}

**Top 3 risks:**
1. {TOP_RISK_1}
2. {TOP_RISK_2}
3. {TOP_RISK_3}

**Quick wins (low effort, high impact):**
{QUICK_WINS_LIST}

---

## CRITICAL Findings

{CRITICAL_FINDINGS_BLOCK}

<!--
Finding template:
### C{N}. {Title}   [{static | runtime | static + runtime}]
**Category:** {Performance|Security|Schema|Configuration|Operations}
**Affected:** {model.field / table.column}
**Reference:** {CVE, check id (P1, 3.4, ...), or doc link}

**Evidence:**
```
{schema lines for static, raw psql output for runtime, both if cross-confirmed}
```

**Impact:** {what breaks or risks if unfixed}

**Recommendation:** {what to do}

**Fix:** {static -> fixes-schema.prisma.md section} / {runtime -> fixes-runtime-{severity}.sql section}
-->

---

## HIGH Findings

{HIGH_FINDINGS_BLOCK}

---

## MEDIUM Findings

{MEDIUM_FINDINGS_BLOCK}

---

## LOW Findings

{LOW_FINDINGS_BLOCK}

---

## Appendix A: Fixes

- `fixes-schema.prisma.md` — schema edits plus the migration each implies (static layer). Review and apply via `prisma migrate`.
- `fixes-runtime-critical.sql` / `-high` / `-medium` / `-low` — runtime SQL fixes. Destructive statements are commented out. Review before running.

## Appendix B: Raw Audit Data (runtime layer)

- `raw/01-performance.txt`
- `raw/02-security.txt`
- `raw/03-schema.txt`
- `raw/04-configuration.txt`
- `raw/05-operations.txt`

## Appendix C: Audit Metadata

- **Layers run:** {LAYERS_RUN}
- **Static checks applied:** {STATIC_CHECKS_APPLIED}
- **Runtime queries executed:** {RUNTIME_EXECUTED}
- **Skipped checks:** {SKIPPED_COUNT}
{SKIPPED_DETAILS}
- **Audit duration:** {DURATION}
