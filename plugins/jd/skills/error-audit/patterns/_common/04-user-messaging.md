## Pattern: User-Facing Messaging Issues
**Severity:** Critical (stack/error.message leak), Medium (generic message no recovery)
**Boost rule:** N/A for security leak (already Critical); Low -> Medium for generic-message in critical_paths
**Dimension:** E (User-facing Messaging)

### Detection
Multiple sub-patterns:

#### 4a. Stack trace exposed in HTTP response (CRITICAL - security leak)
- Ripgrep command(s):
- `rg -t ts -t js --line-number "res\.(send|json|status\([0-9]+\)\.json)\([^)]*\b(err|error)\.stack\b"`
- `rg -t ts -t js --line-number "stack:\s*(err|error)\.stack"`

#### 4b. err.message returned raw to user (CRITICAL - leaks internals)
- Ripgrep command(s):
- `rg -t ts -t js --line-number "res\.(send|json)\([^)]*\b(err|error)\.message\b"`
- `rg -t ts -t js --line-number "error:\s*(err|error)\.message"`

#### 4c. Generic "Something went wrong" without recovery action (MEDIUM)
- Ripgrep command(s):
- `rg -t ts -t js -t tsx -t jsx -i --line-number "['\"]Something went wrong['\"]"`

Then check surrounding 3 lines for `button`, `retry`, `reset`, `onClick`, or call-to-action. If absent -> FLAG (dead-end error message).

### Why this matters
- **Stack traces reveal:** file paths, framework versions, library versions, sometimes internal IPs/db names. Pen testers love these.
- **err.message often includes:** SQL fragments, internal IDs, validation rule names, sometimes user PII from validation errors.
- **Generic messages with no next action** -> user is stuck -> support ticket -> CS cost + churn.

### Fix template
```before
res.status(500).json({ error: err.message, stack: err.stack });
```
```after
logger.error('http.error', { err, path: req.path, userId: req.user?.id });
res.status(500).json({
  error: {
    code: 'INTERNAL',
    message: 'Something went wrong on our side. Please try again later.',
    requestId: req.id, // so user can quote it to support
  }
});
```

For user-facing UI:
```before
<div>Something went wrong</div>
```
```after
<div>
  <p>Something went wrong. Please try again.</p>
  <button onClick={retry}>Try again</button>
  <p>If it persists, contact support@example.com (Request ID: {requestId}).</p>
</div>
```

### Test cases
SHOULD match (4a):
- `res.status(500).json({ stack: err.stack })`
- `res.send(err.stack)`

SHOULD match (4b):
- `res.json({ error: err.message })`

SHOULD match (4c, with no nearby button/retry):
- `<div>Something went wrong</div>`

### Reference
- `references/error-taxonomy.md#programmer-errors`
- `references/best-practices-per-stack.md#react`
