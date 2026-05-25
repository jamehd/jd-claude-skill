## Pattern: Async Without Error Handling
**Severity:** High
**Boost rule:** Critical if in critical_paths
**Dimension:** A (Code-level)

### Detection
Heuristic detection - reliable detection requires AST analysis. v1 uses ripgrep heuristics with orchestrator post-processing.

#### 2a. `Promise.all` without `.catch`
- Ripgrep command(s):
- `rg -t ts -t js --line-number "Promise\.(all|allSettled|race)\("`

For each match, orchestrator checks for `.catch` on the same chain. If absent -> FLAG.

#### 2b. Express async handler missing wrapper or try/catch
- Ripgrep command(s):
- `rg -t ts -t js --line-number "app\.(get|post|put|delete|patch)\([^,]+,\s*async"`

If `package.json` lacks `express-async-errors` AND the async handler body has no `try` -> FLAG.

#### 2c. Bare `await` at top of async function (best-effort heuristic)
- Ripgrep command(s):
- `rg -t ts -t js --line-number "^\s*(?:const|let|var)?\s*\w*\s*=?\s*await\s+\w+\("`

This catches all top-level-of-function awaits. The orchestrator post-processes:
- Skip if the line is inside a `try {` block (use bracket counting from the matched line backwards)
- Skip test files

Acknowledged limitation: bracket counting is not 100% reliable without AST. Document as best-effort.

### Why this matters
- `Promise.all` without `.catch` -> one failure rejects the whole batch, no recovery; process may crash (Node 15+)
- Express async handlers without `next(err)` -> error vanishes into middleware void (without `express-async-errors` shim)
- Bare `await` -> if the awaited promise rejects, the function's caller must handle it; commonly forgotten

### Fix template
```before
export async function login(email: string, password: string) {
  const user = await db.findUser(email);
  return user;
}
```
```after
export async function login(email: string, password: string) {
  try {
    const user = await db.findUser(email);
    return user;
  } catch (err) {
    logger.error('login.failed', { err, email });
    throw err; // or wrap in AuthError
  }
}
```

For Express:
```before
app.get('/api/users', async (req, res) => {
  const users = await db.users.findAll();
  res.json(users);
});
```
```after
// option 1: add express-async-errors to package.json + import at app entry
// option 2: wrap explicitly:
app.get('/api/users', async (req, res, next) => {
  try {
    const users = await db.users.findAll();
    res.json(users);
  } catch (err) { next(err); }
});
```

### Reference
- `references/error-taxonomy.md`
- `references/best-practices-per-stack.md#nodejs`
