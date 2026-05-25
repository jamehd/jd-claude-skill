## Pattern: Logging Sensitive Data
**Severity:** Critical
**Boost rule:** N/A (already Critical)
**Dimension:** B (Observability & Logging)

### Detection
- Ripgrep command(s):
- `rg -t ts -t js -t go -i --line-number "(console|logger|log|slog|fmt\.Print[lf]?n?)\.(log|info|warn|error|debug|Info|Error|Warn|Debug|Printf|Println)\([^)]*\b(password|passwd|pwd|token|jwt|bearer|api[_-]?key|secret|ssn|cccd|cmnd|credit[_-]?card|cvv|cvc|mat[_-]?khau)\b"`

False-positive guards:
- Skip if match is inside a comment (`//`, `#`, `/*`)
- Skip if match is in a `.test.*`, `.spec.*`, or `__tests__/` file
- Skip if the keyword is the literal redaction config (e.g., `redact: ['password']`)

### Why this matters
Logging passwords or tokens persists them in log storage indefinitely (Datadog, Splunk, CloudWatch, plain files). Anyone with log access - internal users, attackers post-breach, third-party log ingestion vendors - can extract credentials. This is the single most common cause of "we got hacked through our own logs."

### Fix template
```before
logger.info('login attempt', { email, password });
```
```after
logger.info('login.attempt', { email }); // never password
```

For tokens: log a HASH or PREFIX only:
```after
logger.info('token.issued', { tokenPrefix: token.substring(0, 8) + '...' });
```

### Test cases
SHOULD match:
- `logger.info('login', { password: req.body.password })`
- `console.log("token=" + accessToken)`
- `slog.Info("auth", slog.String("api_key", key))`
- `log.Printf("user=%s pwd=%s", u, p)`

Should NOT match:
- `// logger.info('login', { password })` (comment)
- `redactKeys: ['password', 'token']` (config, not a log call)
- File `auth.test.ts` containing the above (test file)
- `logger.info('login', { passwordHash })` (not the keyword `password` alone)

### Reference
- `references/sensitive-data-patterns.md`
- `references/best-practices-per-stack.md#sentry-beforesend-filter`
