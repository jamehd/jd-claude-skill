# Notification Routing Guide

The matrix: severity → recipient → channel → response-time. Skill audits configs against this baseline.

## The Matrix

| Severity | Recipient | Channel | Response time | Examples |
|----------|-----------|---------|---------------|----------|
| **Critical** | On-call engineer + Engineering lead | PagerDuty / SMS / phone call | < 15 min | Payment service down, DB unreachable, security breach, data corruption |
| **High** | Dev team owning service | Slack `#incidents` + Sentry alert | < 4 hours | Elevated error rate, 5xx spike, critical flow degraded |
| **Medium** | Dev team | Sentry digest (daily email) | Next sprint | Handled exception, user-impacting but isolated |
| **Low** | Dev team | App log only, monthly review | Backlog | Edge case, validation error, retry succeeded |

## Anti-patterns the skill flags

These are patterns in code/config that violate the matrix. Skill detects and reports them.

### 1. Single-channel-for-everything
**Symptom**: All `logger.error` / `Sentry.captureException` go to the same Slack channel regardless of severity.
**Risk**: Noise → ignored → real Criticals missed.
**Fix**: Add severity-based routing (Sentry alert rules, Slack channel split by severity).

### 2. Critical via email only
**Symptom**: PagerDuty / SMS / phone call not configured; Critical alerts go to email or daily digest.
**Risk**: Latency too high — outage extended.
**Fix**: Wire PagerDuty (or equivalent) for Critical paths.

### 3. Low / Medium paging
**Symptom**: PagerDuty rule fires on every `logger.error`, even validation failures.
**Risk**: Alert fatigue — engineers stop responding.
**Fix**: Restrict PagerDuty rules to Critical-only patterns or rate-threshold-based triggers.

### 4. No severity in alert config
**Symptom**: `alerts.yaml` / Sentry rules have no `severity` field — all alerts are equal.
**Risk**: Priority loss; no way to triage.
**Fix**: Add `severity: critical|high|medium|low` to every alert rule.

### 5. Hardcoded recipients
**Symptom**: Slack webhook URLs, on-call emails hardcoded in source.
**Risk**: Person leaves → alerts go nowhere. Also secret leakage.
**Fix**: Move to env vars + IaC-managed routing rules.

## What this skill CANNOT verify

- Whether anyone actually reads Slack channel #alerts (requires org access)
- Whether on-call rotation is up to date (no API access in v1)
- Whether ops team has paging device on (no telemetry access)

Skill audits code + config only. The matrix above is the baseline; user must confirm org-side that the recipients are real and reachable.
