## Pattern: Notification Routing Issues
**Severity:** High (Critical for some sub-patterns)
**Boost rule:** N/A (severity decided per sub-pattern)
**Dimension:** C (Notification & Routing)

### Detection
Multiple sub-patterns - some are pure ripgrep, some require composite logic (orchestrator combines ripgrep output with package.json inspection).

#### 3a. Sentry SDK installed but no `Sentry.init` call (CRITICAL)
Composite check executed by the orchestrator:
1. Read `package.json` - does it list `@sentry/node`, `@sentry/nextjs`, `@sentry/react`, `@sentry/browser`, or any `@sentry/*` dep?
2. Ripgrep command(s):
- `rg -t ts -t js --files-with-matches "Sentry\.init\("`
3. Decision: if step 1 YES and step 2 returns ZERO files -> FLAG (Sentry SDK present but never initialized -> errors land nowhere).

#### 3b. `Sentry.init` without `beforeSend` (no PII filter) (HIGH)
- Ripgrep command(s):
- `rg -t ts -t js -U --multiline-dotall --line-number "Sentry\.init\(\{(?:(?!beforeSend)[\s\S])*?\}\)"`

NOTE: ripgrep does not support full PCRE lookbehind. Fall back: list all files with `Sentry.init`, then for each file check absence of `beforeSend` within 30 lines after the init call.

Alternative simpler check (orchestrator-side):
- `rg -t ts -t js --files-with-matches "Sentry\.init\("` -> for each file, `rg --count "beforeSend" <file>`; if 0 -> FLAG.

#### 3c. Hardcoded webhook URL (HIGH - secret leakage)
- Ripgrep command(s):
- `rg -t ts -t js -t go --line-number "['\"](https://hooks\.slack\.com/services/[A-Z0-9/]+)['\"]"`
- `rg -t ts -t js -t go --line-number "['\"](https://[a-z0-9-]+\.pagerduty\.com/[^'\"]+)['\"]"`
- `rg -t ts -t js -t go --line-number "['\"](https://discord\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]+)['\"]"`

Hardcoded URLs leak secrets via git history and break when the targeted channel or person leaves. Move to env vars + IaC-managed routing.

### Why this matters
- No Sentry init -> errors land nowhere -> invisible incidents -> outage detected by user complaints
- No `beforeSend` -> PII (auth headers, cookies, request bodies) leaks to Sentry storage and Sentry-side viewers (third-party access)
- Hardcoded webhooks -> secret in git history forever; channel deletion breaks alerting silently

### Fix template
See `references/best-practices-per-stack.md#sentry-beforesend-filter` for init template, and `references/notification-routing-guide.md` for the severity-to-channel matrix.

```before
// Hardcoded URL in source
const SLACK_WEBHOOK = "https://hooks.slack.com/services/T00/B00/abc";
```
```after
// Env var, validated at startup
const SLACK_WEBHOOK = process.env.SLACK_WEBHOOK_URL;
if (!SLACK_WEBHOOK) throw new Error("SLACK_WEBHOOK_URL not set");
```

### Test cases
SHOULD flag (3a composite):
- `package.json` has `"@sentry/node": "..."` AND no file contains `Sentry.init(`

SHOULD flag (3b):
- `Sentry.init({ dsn: 'x', environment: 'prod' })` (no beforeSend)

Should NOT flag (3b):
- `Sentry.init({ dsn: 'x', beforeSend(e){ return e } })`

SHOULD flag (3c):
- `const webhook = 'https://hooks.slack.com/services/T00/B00/abc'`

### Reference
- `references/notification-routing-guide.md`
- `references/best-practices-per-stack.md#nodejs`
