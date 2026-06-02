---
name: architect-error-system-design
description: Use when the user wants to design, standardize, or scaffold a unified error-handling system for a project — a single canonical error contract plus the code that implements it. Triggers on "standardize errors", "design an error system", "unify error handling", "create AppError hierarchy", "chuẩn hóa hệ thống error", "thiết kế hệ thống lỗi". Writes code behind human-gated decisions. Languages today: TypeScript (Node/Next.js) and Go; pluggable for more. Emits an error-standard contract that the jd:error-audit skill can enforce.
---

# Architect: Error System Design

Design and scaffold one canonical, project-wide error system, then emit a machine-readable contract for it. This is the architect counterpart to the read-only `jd:error-audit` auditor: this skill WRITES the standard; `error-audit` (conformance mode) READS and enforces it.

The best-practice content is sourced from recognized standards and official language and framework documentation, authored in `references/`. It is NOT derived from the target project. The target project is only an input: discovery (what to fix) and the stack to generate code for. Never enshrine a project's current patterns as the standard.

## When to Use

- Stand up a unified error system where one is missing or fragmented
- Replace ad-hoc `throw new Error` / raw HTTP status responses with a typed taxonomy
- Define stable error codes, HTTP mapping, and localized user messages once, for the whole project
- Produce the `error-standard` contract that `jd:error-audit` enforces

## When NOT to Use

- Detecting error-handling gaps without changing code -> use `jd:error-audit`
- Applying one-off error fixes already listed by an audit -> apply them directly
- Languages with no adapter yet (anything other than TypeScript or Go today) -> add an adapter first

## Core Idea: Language-Agnostic Contract + Per-Language Adapters

A polyglot project shares one contract and generates idiomatic code per language:

```
            error-standard.yaml  (language-agnostic, the single source of truth)
            - taxonomy: operational vs programmer
            - code registry: stable codes + category + http status + retryable + i18n keys
            - http mapping rules
            - i18n message map (per locale)
            - logging + notification policy
                   |                                  |
        adapter: typescript                  adapter: go
        AppError hierarchy, instanceof,      typed error structs, errors.Is/As,
        central handler, error boundaries    %w wrapping, central http mapper
```

The same code (for example `AUTH_OTP_EXPIRED`) and the same localized messages serve a Go backend and a TypeScript frontend. Each adapter only decides how to express the contract idiomatically. Contract format: `references/contract-spec.md`.

## Workflow

### Step 1: Detect languages and select adapters

Detect the project's languages and frameworks (`package.json` plus Next.js for `typescript`; `go.mod` for `go`). For a monorepo, detect per workspace. Select one adapter per detected language. Announce the selection, for example: "Adapters: typescript (Next.js App Router), go (HTTP service)." If a language has no adapter, say so and continue with the ones that do.

### Step 2: Discover the current state (read-only)

Survey existing error handling so the design fixes real gaps. Record, do not copy:
- existing error module(s) and base classes/types already present (extend them, do not duplicate)
- count of generic throws (`throw new Error(`), raw HTTP status literals, ad-hoc error responses
- whether user-facing messages are hardcoded or localized
- per-surface coverage (see the TypeScript adapter's three surfaces, and the Go adapter's HTTP boundary)

If a recent `jd:error-audit` report exists, read it as the discovery baseline instead of re-scanning.

### Step 3: Design the contract (human-gated)

Decide the standard, grounded in `references/error-taxonomy.md` and the per-language best-practice references. Present these decisions and confirm before scaffolding:
- the category model (operational vs programmer) and the recovery strategy per category
- the error code registry: stable `CODE` names, each with category, HTTP status, retryable flag, severity, and i18n message keys
- HTTP status mapping rules
- the locales for user messages and the message map (respect each project's i18n system; keep every message mono-lingual per locale)
- the logging and notification policy: which categories log loud and alert, which log and return a friendly message, which stay quiet

Do not invent domain codes the project does not need; derive the initial registry from discovery plus the critical paths.

### Step 4: Scaffold per adapter

For each selected adapter, follow its `adapters/<lang>/GUIDE.md` to generate idiomatic code that implements the contract. Extend any existing error module rather than replacing it. Scaffolding writes code: stay behind the Step 3 confirmation, keep changes reviewable, and wire into the project's real integration points (route handler wrapper, auth middleware, render-level boundaries for TypeScript; the HTTP error mapper and wrap helpers for Go).

### Step 5: Emit the contract and a migration plan

- Write `error-standard.yaml` at the repo root from `templates/error-standard.example.yaml`, filled from the Step 3 decisions. This is the bridge file `jd:error-audit` conformance mode reads.
- Write a migration plan: an ordered list to move existing ad-hoc errors onto the new system, critical paths first. Keep it incremental so each step can be tested before the next.

Do not auto-migrate the whole codebase in one sweep. Scaffold the system and the first critical-path conversions; leave the rest as a reviewed plan unless the user asks to proceed.

## Relationship to jd:error-audit

| | this skill (architect) | `jd:error-audit` (auditor) |
|---|---|---|
| Verb | design + write code | read + detect |
| Modifies code | yes, human-gated | never |
| Frequency | occasional (build / evolve) | continuous (CI, jd:auto) |
| `error-standard.yaml` | produces it | reads it to check conformance |

## Adapters and References

- `adapters/typescript/GUIDE.md` — Node/Next.js App Router scaffold across its three error surfaces
- `adapters/go/GUIDE.md` — Go HTTP service scaffold
- `references/error-taxonomy.md` — operational vs programmer, recovery strategies
- `references/contract-spec.md` — the `error-standard.yaml` format
- `references/best-practices-typescript.md`
- `references/best-practices-go.md`
- `templates/error-standard.example.yaml`

## Extending to a new language

Add `adapters/<lang>/GUIDE.md` and `references/best-practices-<lang>.md`, then add a detection branch in Step 1. The contract format and the workflow stay unchanged — only the code-generation idiom is new.
