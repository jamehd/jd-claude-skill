# Conformance mode

When a project has adopted a canonical error system (produced by `jd:architect-error-system-design`), it ships an `error-standard.yaml` contract at the repo root. Conformance mode checks that the code conforms to THAT project standard, not only to generic best practices.

This is the enforcement half of the architect/audit pair: the architect skill WRITES `error-standard.yaml`; this mode READS it and verifies the codebase against it.

## Activation

- Auto: if `error-standard.yaml` exists at the project root, run conformance checks in addition to the normal dimensions, and say so.
- Explicit: the invocation contains `conformance` — run ONLY the conformance checks.
- Off: no contract file and no `conformance` argument — skip; the normal best-practice audit is unchanged.

If `conformance` is requested but no contract file is found, stop and point the user at `jd:architect-error-system-design` to generate one.

## Loading the contract

Parse `error-standard.yaml` (format: the architect skill's `references/contract-spec.md`). Build:
- the set of registry codes
- per code: `http_status`, `category`, required locales (from top-level `locales`)
- the project's covered surfaces (TypeScript API/render/client, Go HTTP boundary)

This registry is the input every conformance check below reads.

## Checks

Run `patterns/_conformance/*`. They are language-aware (TypeScript and Go). Each is a composite check: a ripgrep sweep plus a comparison against the loaded registry.

- `01-unknown-error-code` — a typed error uses a `code` not in the registry. High.
- `02-ad-hoc-error-on-covered-path` — raw `throw new Error(` / ad-hoc HTTP status / Go `http.Error`/`panic` for normal flow, bypassing the standard. High on covered paths.
- `03-http-status-mismatch` — a boundary returns a status that disagrees with the registry for that code. High.
- `04-hardcoded-user-message` — a user-facing string literal at the throw or response site instead of resolving by code through i18n. Medium.
- `05-registry-coverage` — used codes missing from the registry (High), registry codes never used (Low), registry codes missing a locale message (Medium).

## Severity and boosting

Use the same rubric and `critical_paths` boost rule as the rest of the skill (`references/severity-classification.md`). A conformance violation inside a critical path boosts one level.

## Reporting

Conformance findings appear in the same report under a "Conformance" dimension, labeled with the offending `code` and the contract rule violated. The executive summary states a single conformance verdict: the percent of covered error sites that use the standard.

## Boundary with the architect skill

This mode never edits code and never edits the contract. If the contract itself is incomplete (a code missing a locale), report it as a finding and recommend re-running `jd:architect-error-system-design`; do not fix the contract here.
