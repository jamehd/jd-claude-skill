## Pattern: Goroutine Without Panic Recovery
**Severity:** High
**Boost rule:** Critical if in critical_paths
**Dimension:** A (Code-level)

### Detection
- Ripgrep command(s):
- `rg -t go --line-number "^\s*go\s+func\("`
- `rg -t go --line-number "^\s*go\s+\w+\("`

For each match, orchestrator inspects 20 lines after the `go func()` opening brace - does it contain `defer.*recover`? If not -> FLAG.

Quick heuristic without orchestrator:
- `rg -t go -U --multiline-dotall "go\s+func\([^)]*\)\s*\{[\s\S]*?\}\s*\(\)"` -> for each match, check if it contains `defer.*recover`

#### 3b. panic() in library code (not main)
- Ripgrep command(s):
- `rg -t go --line-number "panic\(" --glob "!main.go" --glob "!*_test.go"`

Library code should return errors, not panic. Panic is reserved for unrecoverable invariant violations during program startup.

### Why this matters
A panic in a goroutine that has no `recover` will:
- Crash the entire process (Go runtime does not isolate goroutine panics)
- Wipe out all in-flight requests on other goroutines
- Leave no useful log unless you have a global panic handler set up at process level

Library functions that `panic()` force every caller to wrap them in `defer recover()` - bad API design.

### Fix template
```before
go func() {
    notifyCustomer(customerID, result)
}()
```
```after
go func() {
    defer func() {
        if r := recover(); r != nil {
            slog.Error("notify.panic",
                slog.Any("recover", r),
                slog.String("stack", string(debug.Stack())),
            )
        }
    }()
    notifyCustomer(customerID, result)
}()
```

For library code: return errors instead of panicking.

### Test cases
SHOULD match (3a):
- `go func() { doWork() }()` - no `defer recover`

SHOULD match (3b):
- `panic("unexpected nil")` in `service.go`

Should NOT match:
- `panic("unrecoverable")` in `main.go` (allowed at startup for fail-fast)
- `panic(...)` in `*_test.go` (test fixtures)
- `go func() { defer func(){ recover() }(); doWork() }()` - has recover

### Reference
- `references/best-practices-per-stack.md#go`
