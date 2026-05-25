# Database Health Report - Executive Summary

**Database:** {DB_NAME} | **Date:** {DATE}

## Health Score: {SCORE}/100

| Area | Score | Status |
|------|-------|--------|
| Performance | {PERF_SCORE}/100 | {PERF_STATUS} |
| Security | {SEC_SCORE}/100 | {SEC_STATUS} |
| Schema Quality | {SCHEMA_SCORE}/100 | {SCHEMA_STATUS} |
| Configuration | {CONFIG_SCORE}/100 | {CONFIG_STATUS} |
| Operations | {OPS_SCORE}/100 | {OPS_STATUS} |

## What needs to happen this week:
{ACTIONS_THIS_WEEK}

## Estimated ROI:
{ROI_LIST}

## Full report:
See `AUDIT-REPORT.md` for technical details.

---
*Health score formula: 100 - (Critical x 20) - (High x 5) - (Medium x 1) - (Low x 0.2), capped at 0-100 per category.*
