## Pattern: fmt.Errorf Without %w (no error chain)
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** A (Code-level)

### Detection
- Ripgrep command(s):
- `rg -t go --line-number "fmt\.Errorf\("`

Orchestrator post-processes: for each match, check if the same line (or the same `fmt.Errorf(...)` call across lines) contains `%w`. If not -> FLAG.

Quick heuristic (no orchestrator): two-step grep
- `rg -t go --files-with-matches "fmt\.Errorf\("` -> list candidate files
- For each: `rg -t go "fmt\.Errorf\([^)]*\)" <file> | rg -v "%w"` -> any output = violation

### Why this matters
`fmt.Errorf("save failed: " + err.Error())` flattens `err` into a string. Callers cannot:
- Use `errors.Is(err, sql.ErrNoRows)` to check if it was a "not found"
- Use `errors.As(err, &myErr)` to extract typed error info
- Unwrap to inspect the original

`fmt.Errorf("save failed: %w", err)` preserves the chain. Required for modern Go error handling.

### Fix template
```before
return fmt.Errorf("save transaction failed: " + err.Error())
```
```after
return fmt.Errorf("save transaction for %s: %w", customerID, err)
```

### Test cases
SHOULD match (flag):
- `fmt.Errorf("save failed: " + err.Error())`
- `fmt.Errorf("got error: %v", err)` (uses `%v` not `%w` - same loss of chain)

Should NOT flag:
- `fmt.Errorf("save customer %s: %w", id, err)`
- `errors.New("static message")` (different function; no wrap needed)

### Reference
- `references/best-practices-per-stack.md#go`
- Go blog: https://go.dev/blog/go1.13-errors
