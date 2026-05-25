# PostgreSQL Audit Report

**Database:** `{DB_NAME}` @ `{HOST}:{PORT}`
**PostgreSQL Version:** {PG_VERSION}
**Audit Date:** {AUDIT_TIMESTAMP_UTC}
**Audited By:** Claude Code (postgres-audit skill v1.0)
**DB Size:** {DB_SIZE}
**Tables:** {TABLE_COUNT}
**Connection User:** `{AUDIT_USER}`

---

## Executive Summary

| Severity | Count | Action SLA |
|----------|-------|-----------|
| Critical | {CRITICAL_COUNT} | Immediate (<24h) |
| High     | {HIGH_COUNT} | <1 week |
| Medium   | {MEDIUM_COUNT} | <1 month |
| Low      | {LOW_COUNT} | Backlog |

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
### C{N}. {Title}
**Category:** {Performance|Security|Schema|Configuration|Operations}
**Reference:** {CVE or doc link if applicable}
**Affected:** {tables/users/schemas affected}

**Evidence:**
```
{raw psql output}
```

**Impact:** {what breaks or risks if unfixed}

**Recommendation:** {what to do}

**Fix:** See `fixes-critical.sql` § C{N}
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

## Appendix A: Raw Audit Data

- `raw/01-performance.txt` - Performance query outputs
- `raw/02-security.txt` - Security audit raw
- `raw/03-schema.txt` - Schema audit raw
- `raw/04-configuration.txt` - Configuration values
- `raw/05-operations.txt` - Operations metrics

## Appendix B: Audit Metadata

- **Skipped checks:** {SKIPPED_COUNT}
{SKIPPED_DETAILS}
- **Audit duration:** {DURATION}
- **Queries executed:** {EXECUTED}/56
- **Timeout queries:** {TIMEOUT_COUNT}
- **Skill version:** v1.0
