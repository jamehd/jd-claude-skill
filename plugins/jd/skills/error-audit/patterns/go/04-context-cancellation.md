## Pattern: Context Cancellation Not Handled
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** A (Code-level)

### Detection
Heuristic - requires composite check by orchestrator. Reliable detection requires AST.

- Ripgrep command(s):
- `rg -t go --line-number "func\s+\w+\([^)]*ctx\s+context\.Context"`

For each function with a `ctx context.Context` parameter, the orchestrator scans the body for any of:
- `ctx.Done()`
- `ctx.Err()`
- `<-ctx.Done()`

If the function body does NOT use the ctx (and has loops or downstream calls), it ignores cancellation -> FLAG.

NOTE: many functions correctly pass ctx to downstream calls without explicitly checking it (which is fine). Pattern is best-effort; user must verify.

### Why this matters
- Long-running operations that ignore `ctx` keep running after the caller gave up (request canceled, deadline exceeded)
- Wastes CPU/RAM/DB connections on work nobody will use
- Worst case: holds locks past the deadline, blocking other requests

The standard pattern is to either pass `ctx` to all downstream calls (preferred) OR check `ctx.Err()` periodically in loops.

### Fix template
```before
func ProcessBatch(ctx context.Context, items []Item) error {
    for _, item := range items {
        process(item) // no ctx, no cancel check
    }
    return nil
}
```
```after
func ProcessBatch(ctx context.Context, items []Item) error {
    for _, item := range items {
        if err := ctx.Err(); err != nil {
            return fmt.Errorf("batch cancelled: %w", err)
        }
        if err := process(ctx, item); err != nil {
            return fmt.Errorf("process item %s: %w", item.ID, err)
        }
    }
    return nil
}
```

### Reference
- `references/best-practices-per-stack.md#go`
- Go docs: https://pkg.go.dev/context
