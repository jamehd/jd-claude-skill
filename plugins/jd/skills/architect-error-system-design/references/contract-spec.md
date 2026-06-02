# Contract spec: error-standard.yaml

The single source of truth for the project's error system. Language-agnostic: every adapter generates code from this file, and `jd:error-audit` conformance mode reads it to check that code conforms.

Place it at the repo root as `error-standard.yaml`.

## Top-level fields

- `version` — contract schema version (integer). Bump on breaking changes to the format.
- `locales` — ordered list of user-message locales (for example `[ko, vi, en]`). The first is the fallback.
- `categories` — the taxonomy buckets. At minimum `operational` and `programmer`; projects may add sub-buckets (`validation`, `auth`, `not_found`, `conflict`, `rate_limit`, `external`, `internal`).
- `defaults` — fallback policy applied to any code that omits a field: `http_status`, `retryable`, `severity`, `alert`, `log_level`.
- `codes` — the registry. The heart of the contract.
- `policy` — logging and notification rules per category.

## A code entry

Each entry under `codes` is keyed by the stable `CODE` and has:

- `category` — one of `categories`.
- `http_status` — integer; the status the transport boundary returns.
- `retryable` — boolean; whether a client may retry.
- `severity` — `critical | high | medium | low`.
- `alert` — boolean; whether crossing this error pages a human.
- `log_level` — `error | warn | info`.
- `messages` — map of locale to a user-facing string. Every locale in `locales` must be present. Each string is mono-lingual for its locale; never embed another language inside a localized string.
- `internal` — optional; a developer-facing note. Never sent to clients.

## Naming rules

- Codes are `SCREAMING_SNAKE_CASE`, grouped by domain prefix: `AUTH_`, `DOC_`, `TEAM_`, `NOTICE_`, `ATTENDANCE_`.
- Codes are stable once shipped. To retire one, mark it deprecated in `internal`; do not reuse the name.
- HTTP status follows the category: operational maps to 4xx (or 503 for downstream), programmer maps to 5xx.

## What adapters read

- TypeScript adapter: generates the `AppError` subclass per code (or a code-to-class map), the code-to-HTTP map, and wires `messages` into the project's i18n system.
- Go adapter: generates the typed error constructors per code, the code-to-HTTP mapper, and a code-to-message lookup.

## What error-audit reads

Conformance mode checks, for example:
- every thrown typed error uses a `CODE` present in the registry
- no raw `throw new Error(` / ad-hoc HTTP status on covered paths
- every code has a message for every locale
- HTTP mapping at the boundary matches the registry

See `templates/error-standard.example.yaml` for a filled example.
