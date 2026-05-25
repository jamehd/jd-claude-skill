## Pattern: Ignored Error Return
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** A (Code-level)

### Detection
- Ripgrep command(s):
- `rg -t go --line-number "_\s*=\s*\w+\([^)]*\)\s*$"`
- `rg -t go --line-number "_\s*,\s*_\s*:?=\s*\w+\("`

False-positive guards:
- Skip test files (`*_test.go`)
- Skip if the function genuinely returns no error (orchestrator may need a signature check; for v1, flag and let user verify)

### Why this matters
`_ = riskyFunc()` silently discards a returned error. The compiler accepts it; runtime accepts it; but if `riskyFunc` fails, you have no signal. Common causes:
- Developer was annoyed by linter complaining about unused variable
- Quick prototyping that never got hardened
- Misunderstanding of which functions can fail

The fix is almost always: assign to `err`, check it, handle or wrap and return.

### Fix template
```before
_ = chargeProvider(amount)
```
```after
if err := chargeProvider(amount); err != nil {
    return fmt.Errorf("charge customer %s: %w", customerID, err)
}
```

For functions where the error genuinely doesn't matter (rare - usually only `os.Setenv` etc. for test setup):
```after
_ = os.Setenv("FOO", "bar") // documented: only used in tests, failure is harmless
```

### Test cases
SHOULD match:
- `_ = chargeProvider(amount)`
- `_ = fmt.Sprintf(...)` (false positive - fmt.Sprintf returns string only, no error; acceptable, manual review)

Should NOT match (no underscore assignment):
- `result := chargeProvider(amount)`
- `if err := chargeProvider(amount); err != nil`

### Reference
- `references/error-taxonomy.md`
- `references/best-practices-per-stack.md#go`
