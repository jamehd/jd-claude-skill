## Pattern: Config File Audit
**Severity:** High
**Boost rule:** N/A
**Dimension:** C (Notification & Routing)

### Detection
Composite checks - orchestrator combines file-presence + content-presence checks.

#### 5a. Sentry config missing required fields
For each file containing `Sentry.init`:
- Required: `environment`, `release`, `tracesSampleRate`
- Recommended: `beforeSend`

- Ripgrep command(s):
- `rg -t ts -t js --files-with-matches "Sentry\.init\("`

For each file returned, orchestrator runs:
- `rg --count "environment" <file>` -> if 0, flag "missing environment"
- `rg --count "release" <file>` -> if 0, flag "missing release"
- `rg --count "tracesSampleRate" <file>` -> if 0, flag "missing tracesSampleRate"
- `rg --count "beforeSend" <file>` -> if 0, flag "missing beforeSend" (Medium - recommended not required)

#### 5b. Alert rule config without severity routing
Files matching `*alerts*.yaml`, `*alerts*.yml`, `datadog.yaml`, `sentry.yaml`, or Terraform alert resources:

- Ripgrep command(s):
- `rg --glob "*alert*.{yaml,yml}" --glob "datadog.{yaml,yml}" --line-number "severity:"`
- `rg --glob "*alert*.{yaml,yml}" --glob "datadog.{yaml,yml}" --files-with-matches "."` (list all candidates)

Orchestrator: for each candidate file, ensure at least one `severity:` key exists. If not -> FLAG.

### Why this matters
- Missing `environment` -> can't filter dev from prod alerts -> dev errors page on-call
- Missing `release` -> can't track which deploy introduced a regression
- Missing `tracesSampleRate` -> traces either off (no observability) or 100% (cost explosion)
- Missing `beforeSend` -> PII leaks to Sentry (auth tokens, request bodies)
- No severity routing in alert rules -> all alerts equal priority -> the routing matrix from `notification-routing-guide.md` cannot be applied

### Fix template
See `references/best-practices-per-stack.md#sentry-beforesend-filter` for Sentry init template.

For alert rules:
```yaml
- name: high_error_rate
  query: 'sum(rate(errors[5m])) > 0.05'
  severity: high          # required: critical | high | medium | low
  channels: ['#incidents']
```

### Test cases
SHOULD flag (5a): `sentry.config.ts` with only `Sentry.init({ dsn })` and no other fields.
Should NOT flag: clean fixture's `sentry.config.ts` (has all 4 fields).

### Reference
- `references/notification-routing-guide.md`
- `references/best-practices-per-stack.md`
