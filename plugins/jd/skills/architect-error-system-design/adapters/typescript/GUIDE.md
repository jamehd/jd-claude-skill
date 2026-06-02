# Adapter: TypeScript (Node / Next.js App Router)

Generates idiomatic code that implements `error-standard.yaml` for a TypeScript project. Extend any existing error module rather than replacing it. Verify current Next.js APIs against official docs before generating.

## Detection

Selected when `package.json` is present. The Next.js App Router preset applies when `next` is a dependency and an `app/` directory exists. A plain Node service uses only the module and the central handler parts (no render-surface files).

## Target module layout

Generate (or extend) an `errors` module. If a base `AppError` already exists, build on it.

```
lib/errors/
  base.ts        AppError (code, cause) + category subclasses
  codes.ts       generated from error-standard.yaml: code -> { category, httpStatus, retryable, severity }
  http.ts        codeToHttpStatus(code) and the response shape builder
  messages.ts    code -> i18n key wiring (delegates to the project i18n system, e.g. next-intl)
  handler.ts     central handler for API routes
  index.ts       re-exports
```

## Base and subclasses (base.ts)

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: unknown, options?: { cause?: unknown }) {
    super("VALIDATION", message, options);
  }
}
// AuthError, PermissionError, NotFoundError, ConflictError, RateLimitError,
// ExternalServiceError, InternalError ... one per category in the contract.
```

## Central API handler (handler.ts)

One wrapper for every `app/api/**/route.ts`, composed with the auth middleware so error mapping is uniform.

```ts
export function withErrors(handler: RouteHandler): RouteHandler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      const { code, httpStatus, message } = toErrorResponse(e); // maps via codes.ts + messages.ts
      return NextResponse.json({ code, message }, { status: httpStatus });
    }
  };
}
```

- `toErrorResponse` maps a known `AppError` to its registry status and localized message; an unknown error maps to `INTERNAL` / 500 with the generic message and a loud log.
- Never serialize `error.message` or stack for unexpected errors.
- Validation failure (Zod `safeParse`) is converted to `ValidationError` with field details, status 400.

## Render surfaces

- `app/global-error.tsx` and per-segment `app/**/error.tsx`: map the caught error to a localized, user-safe screen. Reuse existing boundary files; wire them to `messages.ts`.
- `app/not-found.tsx`: a thrown `NotFoundError` should trigger Next.js `notFound()` so this renders.

## Client surface

- A React Error Boundary for client component trees.
- A fetch wrapper that reads `{ code }` from API error responses and resolves the localized message by code; it never shows raw server text.

## Localization

Wire `messages` from the contract into the project i18n system (next-intl in the preset): generate message entries keyed by code into the locale files, and resolve by code plus active locale. Keep each locale's string mono-lingual.

## Migration

After scaffolding, convert critical paths first: replace each `NextResponse.json({ error }, { status })` and `throw new Error(` with a typed error plus `withErrors`. List the rest as an ordered plan; do not sweep the whole codebase at once.
