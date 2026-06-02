## Pattern: Unknown Error Code (not in registry)
**Severity:** High
**Boost rule:** if in critical_paths -> Critical
**Dimension:** Conformance
**Requires:** conformance mode (error-standard.yaml loaded)

### Detection
- Ripgrep command(s):
- TypeScript: `rg -t ts -t js --line-number "new\s+AppError\(\s*[\"'\`]([A-Z0-9_]+)[\"'\`]|code:\s*[\"'\`]([A-Z0-9_]+)[\"'\`]"`
- Go: `rg -t go --line-number "errors\.New\(\s*\"([A-Z0-9_]+)\"|Code:\s*\"([A-Z0-9_]+)\""`

Composite check by orchestrator:
1. Extract the code literal from each match.
2. Compare against the set of registry codes loaded from `error-standard.yaml`.
3. If the code is NOT in the registry -> FLAG (the throw uses a code the contract does not define).

### Why this matters
An off-registry code breaks the contract's joins: it has no defined HTTP status, no localized message, no log/alert policy. Clients and dashboards keyed on registry codes will not recognize it.

### Fix template
```before
throw new AppError("DOC_TOO_BIG", "file too large");
```
```after
// add DOC_UPLOAD_TOO_LARGE to error-standard.yaml (via the architect skill), then:
throw new DocUploadTooLargeError();
```

### Test cases
SHOULD match (when code absent from registry):
- `new AppError("MYSTERY_CODE", ...)`
- Go `New("ADHOC_CODE", ...)`

Should NOT match:
- a code that exists in the registry
- a typed subclass whose code is registry-defined

### Reference
- `references/conformance-mode.md`
- contract format: architect skill `references/contract-spec.md`
