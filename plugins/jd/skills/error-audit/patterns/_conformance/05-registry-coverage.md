## Pattern: Registry Coverage Drift
**Severity:** High (used-but-undefined) / Medium (missing locale) / Low (defined-but-unused)
**Boost rule:** if in critical_paths -> +1 level
**Dimension:** Conformance
**Requires:** conformance mode (error-standard.yaml loaded)

### Detection
- Ripgrep command(s):
- Collect every code literal used in code: `rg -t ts -t js -t go --only-matching "[\"'\`]([A-Z0-9_]{3,})[\"'\`]"` then filter to the registry naming shape (domain prefix).

Composite check by orchestrator. Compare the used-code set against the registry:
1. Used but NOT in the registry -> FLAG High (an undefined code is live in code).
2. In the registry but missing a message for one of the contract `locales` -> FLAG Medium (incomplete contract; do not fix here, recommend re-running the architect skill).
3. In the registry but never used anywhere -> FLAG Low (dead code in the registry; candidate to retire, but confirm it is not used by clients before removing).

### Why this matters
The contract is only trustworthy if code and registry stay in sync. Undefined-but-used codes have no policy; defined-but-unused codes mislead; codes missing a locale ship a blank or fallback message to some users.

### Fix template
```before
# used-but-undefined: code uses PAYMENT_DECLINED, registry has no such code
```
```after
# add PAYMENT_DECLINED to error-standard.yaml with status, severity, and ko/vi/en messages
# (via jd:architect-error-system-design), then use the typed error
```

### Test cases
SHOULD match:
- a `CODE` literal used in code but absent from the registry (High)
- a registry code whose `messages` lacks one declared locale (Medium)
- a registry code with zero usages in the codebase (Low)

Should NOT match:
- a code present in both with all locales and at least one usage

### Reference
- `references/conformance-mode.md`
- contract format: architect skill `references/contract-spec.md`
