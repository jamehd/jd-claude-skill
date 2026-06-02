## Pattern: HTTP Status Disagrees With Registry
**Severity:** High
**Boost rule:** if in critical_paths -> Critical
**Dimension:** Conformance
**Requires:** conformance mode (error-standard.yaml loaded)

### Detection
- Ripgrep command(s):
- Locate the central mapper(s): TypeScript `rg -t ts --line-number "codeToHttpStatus|httpStatus"`; Go `rg -t go --line-number "httpStatusFor|func WriteError"`.
- Locate any per-site status paired with a code: `rg -t ts -t js -t go --line-number -U "([A-Z0-9_]{3,})[\"'\`]?[^\\n]{0,60}(status|StatusCode)[^\\n]{0,10}([45]\\d\\d)"`

Composite check by orchestrator:
1. For each (code, status) pair found at a boundary, look up the registry `http_status` for that code.
2. If the emitted status differs from the registry value -> FLAG.
3. Also flag the central mapper if its code-to-status table diverges from the registry (the mapper should be generated from the contract, not hand-maintained).

### Why this matters
The contract promises a stable status per code. A handler that returns a different status for the same code makes the API self-contradictory and breaks clients that branch on status.

### Fix template
```before
// registry: NOT_FOUND -> 404
return NextResponse.json({ code: "NOT_FOUND" }, { status: 400 });
```
```after
return NextResponse.json({ code: "NOT_FOUND" }, { status: codeToHttpStatus("NOT_FOUND") }); // 404
```

### Test cases
SHOULD match:
- a site emitting status 400 for a code the registry maps to 404
- a hand-maintained mapper whose entry contradicts the registry

Should NOT match:
- a site whose status equals the registry value
- a status derived through the generated mapper

### Reference
- `references/conformance-mode.md`
- contract format: architect skill `references/contract-spec.md`
