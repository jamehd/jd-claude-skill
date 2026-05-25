# Sample Report (reference)

This is what an `AUDIT-REPORT.md` looks like after running the skill against the bundled fixture `examples/test-projects/nodejs-nestjs-broken/`. Use it to understand the report format before running on your own project.

---

# Error Handling Audit Report

**Project:** nodejs-nestjs-broken
**Date:** 2026-05-25 14:30
**Skill version:** error-audit v1.0
**Stacks detected:** nodejs/nestjs
**Critical paths used:** src/payment/**, src/auth/**  (auto-detected, confirmed by user)
**Config source:** auto-detect (no error-audit.config.yaml found)

---

## Executive Summary

- Critical: 3
- High: 3
- Medium: 1
- Low: 0

**Total findings:** 7

## Top 5 Must-Fix Now

1. [Critical] Password logged in plaintext at `src/auth/login.ts:5` → see `fixes-critical/B1-password-in-log-login.md`
2. [Critical] Password logged in plaintext at `src/payment/charge.ts:19` → see `fixes-critical/B2-password-in-log-payment.md`
3. [Critical] Stack trace exposed to user at `src/api/error-handler.ts:7` → see `fixes-critical/E1-stack-trace-leak.md`
4. [High] Unhandled promise rejection in payment charge at `src/payment/charge.ts:5` → see `fixes-high/A1-unhandled-promise-payment.md`
5. [High] `await` outside try/catch in login at `src/auth/login.ts:11` → see `fixes-high/A2-await-no-try-login.md`

---

## Findings by Dimension

### A. Code-level Patterns (Node.js)

#### Finding A.1 — Unhandled Promise Rejection in Payment Charge
**Severity:** High (boosted from Medium — in critical_path `src/payment/`)
**Pattern:** `nodejs/01-promise-handling`
**Location:** `src/payment/charge.ts:5`
**Code:**
```ts
return chargeProvider.charge(amount, paymentMethodToken).then(result => saveTransaction(result));
```
**Why:** `.then()` without `.catch()` → unhandled rejection. In Node 15+, this crashes the process. In payment flow specifically: user charged but record not saved → reconciliation hell.
**Fix:** See `fixes-high/A1-unhandled-promise-payment.md`

#### Finding A.2 — `await` Outside try/catch in Login
**Severity:** High (boosted from Medium — in critical_path `src/auth/`)
**Pattern:** `nodejs/02-async-error-handling`
**Location:** `src/auth/login.ts:11`
**Code:**
```ts
const user = await db.findUser(email);
```
**Why:** If `db.findUser` rejects, the error propagates to the caller with no logging. Login is critical path: failures must be logged with context for triage.
**Fix:** See `fixes-high/A2-await-no-try-login.md`

#### Finding A.3 — Generic Error Class in Auth
**Severity:** Medium
**Pattern:** `nodejs/03-error-class-taxonomy`
**Location:** `src/auth/login.ts:8`
**Code:**
```ts
if (!email) throw new Error('email required');
```
**Why:** Plain `Error` cannot be distinguished by `instanceof` checks. HTTP layer can't map to 400 vs 500. Use `ValidationError extends AppError`.
**Fix:** See `fixes-medium/A3-error-taxonomy.md`

### B. Observability & Logging

#### Finding B.1 — Password Logged in Plaintext (Login)
**Severity:** Critical
**Pattern:** `_common/01-logging-sensitive-data`
**Location:** `src/auth/login.ts:5`
**Code:**
```ts
logger.info('login attempt', { email, password });
```
**Why:** Password persisted to log storage forever. Anyone with log access can extract credentials. Most common cause of "we got hacked through our own logs."
**Fix:** See `fixes-critical/B1-password-in-log-login.md`

#### Finding B.2 — Password Logged in Plaintext (Payment)
**Severity:** Critical
**Pattern:** `_common/01-logging-sensitive-data`
**Location:** `src/payment/charge.ts:19`
**Code:**
```ts
logger.info('payment attempt', { customerId, password, amount });
```
**Why:** Same as B.1, in payment flow.
**Fix:** See `fixes-critical/B2-password-in-log-payment.md`

#### Finding B.3 — Swallow Catch with console.log(e.message)
**Severity:** High (boosted from Medium — in critical_path `src/payment/`)
**Pattern:** `_common/02-logging-quality`
**Location:** `src/payment/charge.ts:13`
**Code:**
```ts
} catch (e) {
  console.log(e.message);
}
```
**Why:** Discards stack trace and context. Refund failures in payment flow vanish silently.
**Fix:** See `fixes-high/B3-swallow-catch-payment.md`

### C. Notification & Routing

#### Finding C.1 — Sentry SDK Installed But Never Initialized
**Severity:** Critical
**Pattern:** `_common/03-notification-routing` (sub-pattern 3a)
**Location:** `package.json` (lists `@sentry/node`); no `Sentry.init(` in any source file
**Why:** Sentry SDK is in dependencies but never initialized → errors are never captured → invisible incidents → user complaints are your only signal.
**Fix:** See `fixes-critical/C1-sentry-not-initialized.md`

### E. User-facing Messaging

#### Finding E.1 — Stack Trace Exposed in HTTP Response
**Severity:** Critical
**Pattern:** `_common/04-user-messaging` (sub-pattern 4a)
**Location:** `src/api/error-handler.ts:7`
**Code:**
```ts
res.status(500).json({
  error: err.message,
  stack: err.stack,
});
```
**Why:** Stack traces leak file paths, framework versions, library versions. Attackers map your stack to known CVEs. err.message often contains SQL fragments.
**Fix:** See `fixes-critical/E1-stack-trace-leak.md`

---

## Coverage Matrix

| Pattern | Files scanned | Findings | Skipped reason |
|---------|---------------|----------|----------------|
| _common/01-logging-sensitive-data | 5 | 2 | — |
| _common/02-logging-quality | 5 | 1 | — |
| _common/03-notification-routing | 5 | 1 | — |
| _common/04-user-messaging | 5 | 1 | — |
| _common/05-config-files | 0 | 0 | no Sentry.init file |
| nodejs/01-promise-handling | 5 | 1 | — |
| nodejs/02-async-error-handling | 5 | 1 | — |
| nodejs/03-error-class-taxonomy | 5 | 1 | — |
| nodejs/04-express | 5 | 0 | — |
| nodejs/05-nestjs | 5 | 0 | (no @Catch filter, but no controller code either) |
| nodejs/06-fastify | 0 | 0 | fastify not in package.json |

## Patterns Skipped

- `frontend/*` — no React/Vue/Next.js detected
- `go/*` — no go.mod found
- `nodejs/06-fastify.md` — fastify not in package.json
- `_common/05-config-files.md` (5a) — no Sentry.init file to inspect (covered by C.1 instead)

---

## Recommendations Summary

1. **Adopt typed error class hierarchy** (AppError + subclasses) → see `references/best-practices-per-stack.md#nodejs-typed-error-class-hierarchy`
2. **Initialize Sentry with beforeSend filter** → see `references/best-practices-per-stack.md#sentry-beforesend-filter`
3. **Never log credentials** — remove `password` from log payloads, audit all `logger.*` calls → see `references/sensitive-data-patterns.md`
4. **Hide internals from user** — return sanitized error messages, log full err server-side → see `references/error-taxonomy.md#programmer-errors`
5. **Configure severity routing** for alerts → see `references/notification-routing-guide.md`

---

## How to use this report

1. Fix Critical first (security / money loss). SLA: 24h. See `fixes-critical/` (3 files).
2. Schedule High for current sprint. SLA: 1 week. See `fixes-high/` (3 files).
3. Add Medium to backlog. See `fixes-medium/` (1 file).
4. Review Low monthly. See `fixes-low/` (0 files this run).

For severity rubric and rationale, see `references/severity-classification.md`.
For notification routing baseline (who to alert), see `references/notification-routing-guide.md`.
