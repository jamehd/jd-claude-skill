# Adapter: Go (HTTP service)

Generates idiomatic Go that implements `error-standard.yaml`. Extend any existing error package rather than replacing it.

## Detection

Selected when `go.mod` is present. The HTTP-service preset applies when the module imports `net/http` (or a router such as chi/echo/gin); a library module uses only the typed errors and wrapping parts (no HTTP mapper).

## Target package layout

```
internal/errors/
  app_error.go    AppError type (Code, Message, cause) + Unwrap
  codes.go        generated from error-standard.yaml: code -> { category, httpStatus, retryable, severity }
  constructors.go NewValidationError, NewNotFoundError, NewAuthError, ...
  http.go         WriteError(w, r, err): central error -> HTTP mapper
  messages.go     code + locale -> user message (from the contract)
```

## Typed error (app_error.go)

```go
package errors

type AppError struct {
    Code    string
    Message string
    cause   error
}

func (e *AppError) Error() string { return e.Code + ": " + e.Message }
func (e *AppError) Unwrap() error { return e.cause }

func New(code, message string, cause error) *AppError {
    return &AppError{Code: code, Message: message, cause: cause}
}
```

## Constructors (constructors.go)

One per category, each fixing the code from the registry:

```go
func NewNotFoundError(message string, cause error) *AppError { return New("NOT_FOUND", message, cause) }
func NewValidationError(message string, cause error) *AppError { return New("VALIDATION", message, cause) }
```

## Wrapping and inspection

- Wrap with context: `return fmt.Errorf("load worker %s: %w", id, err)`.
- At the boundary, extract the typed error: `var ae *errors.AppError; if errors.As(err, &ae) { ... }`.
- Use `errors.Is` for sentinels. Never compare error strings.

## HTTP mapper (http.go)

```go
func WriteError(w http.ResponseWriter, r *http.Request, err error) {
    var ae *AppError
    if !errors.As(err, &ae) {
        // unexpected -> programmer error
        slog.Error("unhandled error", "err", err, "path", r.URL.Path)
        writeJSON(w, http.StatusInternalServerError, body{Code: "INTERNAL", Message: genericMessage(r)})
        return
    }
    status := httpStatusFor(ae.Code)        // from codes.go
    msg := messageFor(ae.Code, localeOf(r)) // from messages.go
    if status >= 500 {
        slog.Error("app error", "code", ae.Code, "err", ae, "path", r.URL.Path)
    } else {
        slog.Warn("app error", "code", ae.Code, "path", r.URL.Path)
    }
    writeJSON(w, status, body{Code: ae.Code, Message: msg})
}
```

- Unexpected (non-`AppError`) maps to 500 with a generic message and an error-level log.
- Never write `err.Error()` to the client for unexpected errors.

## Logging

Use `log/slog`, once at the boundary, with the code and request context. Programmer-category codes log at error level and follow the alert policy; operational codes log at warn/info.

## Localization

`messageFor(code, locale)` resolves the user message from the contract's `messages` map. Do not hardcode user-facing strings at the call site.

## Migration

Convert handlers to return errors and rely on `WriteError` at the boundary, critical paths first. Replace any `panic` used for validation or not-found with the typed error. List the rest as an ordered plan.
