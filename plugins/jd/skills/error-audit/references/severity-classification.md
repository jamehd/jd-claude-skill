# Severity Classification

Severity decides who is paged and how fast. Skill uses this rubric to classify every finding.

## Rubric

| Severity | Criteria | Fix SLA |
|----------|----------|---------|
| **Critical** | Security leak (password/token/PII in logs/response) / Money loss path / Production down / Data corruption | < 24h |
| **High** | Critical user flow degraded / Missing observability infra (no Sentry init, no error middleware) / Unhandled in payment-auth | < 1 week |
| **Medium** | Tech debt / Inconsistent patterns / Missing context (no correlation ID) / Poor UX (generic message) | Next sprint |
| **Low** | Code style / Minor i18n / Outdated comments in error paths / Wrong log level non-critical | Backlog |

## Boost rule

A finding's BASE severity comes from its pattern file. The skill BOOSTS severity by one level if the file location is inside a `critical_paths` entry (auto-detected or user-configured):

- Low → Medium
- Medium → High
- High → Critical
- Critical → Critical (no further boost)

The boost rule applies once per finding. The report shows both base and boosted severity for transparency: `Severity: High (boosted from Medium — in critical_path src/payment/**)`.

## Examples

- `catch(e){}` in `src/profile/avatar.ts` → **Medium** (avatar bug, app continues)
- `catch(e){}` in `src/payment/charge.ts` → **High** (boosted from Medium — money loss path)
- `logger.info("login", { password })` anywhere → **Critical** (security; no further boost)
- `console.log` in error path in `src/util/format.ts` → **Low** (code style)
- `console.log` in error path in `src/auth/oauth.ts` → **Medium** (boosted from Low)
