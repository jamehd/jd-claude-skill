# Best practices: TypeScript (Node / Next.js)

Independent best-practice reference. Sourced from the language and framework conventions, not from any target project. When generating, verify current framework APIs against official docs.

## Typed error hierarchy

- One base `AppError extends Error` carrying a stable `code`, plus `cause` for chaining (native `Error` `cause` option). Set `name = this.constructor.name`.
- One subclass per error category or per code group: `ValidationError`, `AuthError`, `PermissionError`, `NotFoundError`, `ConflictError`, `RateLimitError`, `ExternalServiceError`, `InternalError`.
- Throw the typed error with a `code`, never `throw new Error('string')` on covered paths.
- Discriminate with `instanceof` or by `code`, never by parsing the message string.
- Preserve the cause chain: `throw new ExternalServiceError('FCM send failed', { cause: e })`.

## Three error surfaces (Next.js App Router)

A project with both UI and API has three distinct surfaces; the system must cover all three from the one contract.

1. API route handlers (`app/api/**/route.ts`)
   - A single central handler wraps every route (compose it with the auth middleware wrapper). It catches, maps the error to `{ code, message }` plus the registry HTTP status, and returns `NextResponse.json`.
   - Never leak `error.message` or stack to the client for programmer errors; return the generic mapped message.
   - Validation (for example Zod `safeParse` failure) becomes a `ValidationError` with field details, status 400.

2. Server Components and rendering
   - `error.tsx` (per route segment) and `global-error.tsx` catch render-time errors; `not-found.tsx` handles the not-found signal. These map the error to a localized, user-safe screen.
   - Throwing a typed `NotFoundError` should reach `not-found.tsx`; other typed errors reach the nearest `error.tsx`.

3. Client components
   - A React Error Boundary catches render errors in client trees.
   - A fetch/client wrapper reads `{ code }` from API error responses and maps the code to a localized message; it does not display raw server text.

## Localization

- User messages come from the contract's `messages` map via the project's i18n system, keyed by `code`. Do not hardcode user-facing strings at the throw site.
- Keep each localized string mono-lingual.

## Logging and transport

- Log at the boundary, once, with the code and context; do not log-and-rethrow at every layer.
- Optional transport shape: RFC 9457 Problem Details (`application/problem+json`) with `type`, `title`, `status`, plus the `code`.

## Anti-patterns

- `catch (e) {}` or `catch (e) { console.log(e) }` with no rethrow or handling
- Returning `NextResponse.json({ error: 'Forbidden' }, { status: 403 })` ad-hoc instead of mapping from a typed error and code
- `throw new Error(\`...\`)` on a covered path
- Hardcoding English (or any single language) user messages in a multi-locale app
