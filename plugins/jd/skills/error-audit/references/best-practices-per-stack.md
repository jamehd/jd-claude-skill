# Best Practices Per Stack

Idiomatic error handling patterns per language/framework. Fix files link here.

---

## Node.js / TypeScript

### Typed error class hierarchy

```ts
export class AppError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly cause?: Error,
    public readonly meta?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    Error.captureStackTrace?.(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, meta?: Record<string, unknown>) {
    super('VALIDATION', message, undefined, meta);
  }
}

export class NotFoundError extends AppError { /* ... */ }
export class PaymentError extends AppError { /* ... */ }
```

### Correlation ID via AsyncLocalStorage

```ts
import { AsyncLocalStorage } from 'node:async_hooks';

export const requestContext = new AsyncLocalStorage<{ requestId: string; userId?: string }>();

// In Express/NestJS middleware:
app.use((req, _res, next) => {
  requestContext.run({ requestId: req.headers['x-request-id'] ?? crypto.randomUUID() }, next);
});

// In logger:
logger.error({ ...requestContext.getStore(), err }, 'payment.charge_failed');
```

### Sentry beforeSend filter

```ts
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  release: process.env.GIT_SHA,
  tracesSampleRate: 0.1,
  beforeSend(event, hint) {
    // Strip PII
    if (event.request?.headers?.authorization) delete event.request.headers.authorization;
    if (event.request?.cookies) delete event.request.cookies;
    return event;
  },
});
```

---

## Go

### Wrap with `%w`

```go
if err != nil {
    return fmt.Errorf("charge customer %s: %w", customerID, err)
}
```

Use `errors.Is` / `errors.As` to inspect:

```go
var notFound *db.NotFoundError
if errors.As(err, &notFound) {
    return http.StatusNotFound
}
```

### Sentinel errors for known cases

```go
var (
    ErrCustomerNotFound = errors.New("customer not found")
    ErrInsufficientFunds = errors.New("insufficient funds")
)

if balance < amount {
    return ErrInsufficientFunds
}
```

### Structured logging with `slog`

```go
slog.Error("payment.charge_failed",
    slog.String("customer_id", customerID),
    slog.Any("err", err),
)
```

### Recovery at goroutine boundaries

```go
go func() {
    defer func() {
        if r := recover(); r != nil {
            slog.Error("background.panic", slog.Any("recover", r), slog.String("stack", string(debug.Stack())))
        }
    }()
    doBackgroundWork()
}()
```

---

## React

### ErrorBoundary at app root + per critical route

```tsx
import { ErrorBoundary } from 'react-error-boundary';

<ErrorBoundary FallbackComponent={AppErrorFallback} onError={logToSentry}>
  <App />
</ErrorBoundary>

// Per route:
<Route path="/checkout" element={
  <ErrorBoundary FallbackComponent={CheckoutErrorFallback}>
    <Checkout />
  </ErrorBoundary>
} />
```

### react-query error states

```tsx
const { data, error, isError } = useQuery({ queryKey: ['user', id], queryFn: fetchUser });
if (isError) return <ErrorState error={error} retry={refetch} />;
```

### Suspense + ErrorBoundary combo

```tsx
<ErrorBoundary FallbackComponent={ErrorFallback}>
  <Suspense fallback={<Loading />}>
    <LazyComponent />
  </Suspense>
</ErrorBoundary>
```

---

## Vue 3

### App-level error handler

```ts
const app = createApp(App);
app.config.errorHandler = (err, instance, info) => {
  Sentry.captureException(err, { extra: { info } });
};
```

### Per-component errorCaptured

```ts
export default defineComponent({
  errorCaptured(err, instance, info) {
    Sentry.captureException(err, { extra: { info } });
    return false; // stop propagation
  },
});
```

---

## Next.js (App Router)

### Required error files

- `app/error.tsx` — per-route error boundary
- `app/global-error.tsx` — catches everything including layout errors
- `app/not-found.tsx` — 404 handler

### Example `app/error.tsx`

```tsx
'use client';
import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div>
      <h2>Something went wrong</h2>
      <button onClick={reset}>Try again</button>
    </div>
  );
}
```

### Sentry SDK auto-instrumentation

Use `@sentry/nextjs` with `sentry.client.config.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`.
