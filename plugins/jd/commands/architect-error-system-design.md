---
description: Design and scaffold a unified, project-wide error system — a language-agnostic error contract (codes, HTTP mapping, localized messages, log/alert policy) plus idiomatic code per language. Languages today: TypeScript (Node/Next.js) and Go. Writes code behind human-gated decisions. Emits error-standard.yaml for jd:error-audit to enforce.
argument-hint: "[optional: language (typescript|go), or a path to scope discovery]"
---

# Architect: Error System Design

Invoke the `jd:architect-error-system-design` skill.

**Arguments:** $ARGUMENTS

Steps:
1. Load the `jd:architect-error-system-design` skill via the Skill tool.
2. Detect languages and select adapters (typescript for `package.json`/Next.js, go for `go.mod`). A language in `$ARGUMENTS` restricts to that adapter. Announce the selection.
3. Discover the current error handling (read-only): existing error module, generic throws, raw HTTP status responses, whether user messages are localized. If a recent `jd:error-audit` report exists, use it as the baseline.
4. Design the contract and confirm with the user before writing code: category model, code registry, HTTP mapping, locales and messages, log/alert policy.
5. Scaffold idiomatic code per adapter, extending any existing error module; wire into the real integration points (route handler wrapper and auth middleware, render boundaries for TypeScript; the HTTP mapper and wrap helpers for Go).
6. Emit `error-standard.yaml` at the repo root and an ordered migration plan (critical paths first).

The best-practice standard is independent of the target project; the project is only discovery input and the stack to generate for. Code changes are human-gated and reviewable; do not sweep the whole codebase at once.
