## Pattern: Fetch Without Error Handling
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** A (Code-level), E (User-facing)

### Detection

#### 4a. fetch().then() without .catch()
- Ripgrep command(s):
- `rg -t ts -t tsx -t js -t jsx --line-number "fetch\([^)]+\)\.then\("`

For each match, orchestrator checks if a `.catch(` follows within 5 lines. If not -> FLAG.

#### 4b. await fetch() outside try/catch
- Ripgrep command(s):
- `rg -t ts -t tsx -t js -t jsx --line-number "await\s+fetch\("`

Orchestrator: same heuristic as `nodejs/02-async-error-handling` - look at the enclosing function and check for try block. If `await fetch` is at top-level of an async function without try -> FLAG.

#### 4c. Missing res.ok check after fetch
- Ripgrep command(s):
- `rg -t ts -t tsx -t js -t jsx -U --multiline-dotall --line-number "fetch\([^)]+\)[\s\S]{0,200}?\.json\("`

For each match, check if `res.ok` or `response.ok` appears between `fetch(` and `.json()`. If not -> FLAG.

NOTE: `fetch` does NOT throw on HTTP 4xx/5xx - only on network errors. Without checking `res.ok`, the code happily parses the error body as JSON and treats it as success.

### Why this matters
- Unhandled fetch rejection in a useEffect -> uncaught promise rejection -> user sees broken UI with no feedback
- Missing `res.ok` check -> 401/404/500 responses are treated as success - downstream code crashes or shows wrong data
- No retry/timeout -> transient network failures look like permanent errors

### Fix template
```before
useEffect(() => {
  fetch('/api/cart').then(r => r.json()).then(setData);
}, []);
```
```after
useEffect(() => {
  let aborted = false;
  (async () => {
    try {
      const r = await fetch('/api/cart');
      if (!r.ok) throw new Error(`Cart fetch failed: ${r.status}`);
      const data = await r.json();
      if (!aborted) setData(data);
    } catch (err) {
      console.error('cart.fetch_failed', err);
      if (!aborted) setError(err);
    }
  })();
  return () => { aborted = true; };
}, []);
```

Or use react-query / SWR which handles error states idiomatically:
```after
const { data, error, isError, refetch } = useQuery({
  queryKey: ['cart'],
  queryFn: async () => {
    const r = await fetch('/api/cart');
    if (!r.ok) throw new Error(`Cart fetch failed: ${r.status}`);
    return r.json();
  },
});
if (isError) return <ErrorView error={error} onRetry={refetch} />;
```

### Reference
- `references/best-practices-per-stack.md#react`
- MDN: https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API/Using_Fetch
