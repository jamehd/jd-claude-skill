## Pattern: Hardcoded User Message Instead of Code Lookup
**Severity:** Medium
**Boost rule:** if in critical_paths -> High
**Dimension:** Conformance
**Requires:** conformance mode (error-standard.yaml loaded)

### Detection
- Ripgrep command(s):
- TypeScript: `rg -t ts -t js --line-number "new\s+\w*Error\(\s*[\"'\`][^\"'\`]{6,}[\"'\`]"`
- TypeScript response: `rg -t ts --line-number "message:\s*[\"'\`][^\"'\`]{6,}[\"'\`]"`
- Go: `rg -t go --line-number "New\w*Error\(\s*\"[^\"]{6,}\""`

Composite check by orchestrator:
1. A literal human-readable message string passed at the throw or response site, on a covered path.
2. If the contract declares `locales` (the project is multi-locale) and the message is not resolved by `code` through the i18n system -> FLAG.
3. Internal developer notes (the typed error's internal message) are allowed; the check targets the USER-facing message.

### Why this matters
The contract maps `code -> messages[locale]`. A hardcoded message at the call site cannot be localized, drifts from the contract, and in a multi-language app ships one language to all users. It also tends to leak internal phrasing to clients.

### Fix template
```before
return NextResponse.json({ message: "You do not have permission" }, { status: 403 });
```
```after
// message resolved by code from error-standard.yaml via the i18n system
throw new PermissionError();
```

### Test cases
SHOULD match:
- `new ValidationError("Email is required")` used as the user message in a multi-locale project
- `{ message: "You do not have permission" }` in a response body

Should NOT match:
- a message resolved by `code` + active locale through i18n
- a single-locale project (no `locales` in the contract)
- an internal-only developer note not sent to the client

### Reference
- `references/conformance-mode.md`
- no mixed-language strings: keep each localized message mono-lingual
