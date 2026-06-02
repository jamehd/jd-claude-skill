## Pattern: Ad-hoc Error Bypassing the Standard
**Severity:** High
**Boost rule:** if in critical_paths -> Critical
**Dimension:** Conformance
**Requires:** conformance mode (error-standard.yaml loaded)

### Detection
- Ripgrep command(s):
- TypeScript generic throw: `rg -t ts -t js --line-number "throw\s+new\s+Error\("`
- TypeScript ad-hoc HTTP error: `rg -t ts --line-number "NextResponse\.json\(\s*\{\s*error:"`
- TypeScript raw status literal: `rg -t ts --line-number "status:\s*[45]\d\d"`
- Go ad-hoc HTTP error: `rg -t go --line-number "http\.Error\("`
- Go panic for normal flow: `rg -t go --line-number "panic\("`

Composite check by orchestrator:
1. For each match, decide if it is on a covered surface (TypeScript API route, render boundary, or client fetch; Go HTTP handler) per the contract's covered surfaces.
2. A covered-path match that does NOT route through the standard (typed error + central handler / WriteError) -> FLAG.
3. Off-path matches (scripts, tests, startup) are not flagged.

### Why this matters
Once a project adopts the standard, ad-hoc errors are the drift that erodes it: each one skips the registry, the HTTP mapping, the localized message, and the log/alert policy. The standard only holds if covered paths go through it.

### Fix template
```before
if (user.role !== "ADMIN")
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
```
```after
if (user.role !== "ADMIN") throw new PermissionError();
// the central withErrors handler maps PERMISSION_DENIED -> 403 + localized message
```

### Test cases
SHOULD match:
- `throw new Error("nope")` in an API route
- `NextResponse.json({ error: "Forbidden" }, { status: 403 })`
- Go `http.Error(w, err.Error(), 500)` in a handler
- Go `panic("missing field")` in request handling

Should NOT match:
- `throw new ValidationError(...)` routed through the central handler
- Go handler returning an `*AppError` to `WriteError`
- a `panic` at startup wiring (not request flow)

### Reference
- `references/conformance-mode.md`
- adapter surfaces: architect skill `adapters/typescript/GUIDE.md`, `adapters/go/GUIDE.md`
