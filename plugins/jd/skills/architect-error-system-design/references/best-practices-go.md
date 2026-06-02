# Best practices: Go

Independent best-practice reference. Sourced from Go language conventions and the standard library, not from any target project.

## Errors are values

- Return errors; do not use `panic` for ordinary control flow. Reserve `panic` for truly unrecoverable programmer errors, and `recover` only at process and goroutine boundaries.
- Never discard an error with `_ =` on a covered path. Handle it or wrap and return it.

## Typed errors and a stable code

- Define a typed error that carries the contract `code`:
  ```go
  type AppError struct {
      Code    string
      Message string
      cause   error
  }
  func (e *AppError) Error() string { return e.Code + ": " + e.Message }
  func (e *AppError) Unwrap() error { return e.cause }
  ```
- Provide a constructor per code group (`NewValidationError`, `NewNotFoundError`, `NewAuthError`, ...), each fixing the `Code`, category, and HTTP status from the registry.
- Use sentinel errors (`var ErrNotFound = ...`) only for simple comparisons; prefer typed errors when you need a code and metadata.

## Wrapping and inspection

- Wrap with `%w` to preserve the chain: `fmt.Errorf("load worker %s: %w", id, err)`.
- Inspect with `errors.Is` (sentinel match) and `errors.As` (extract a typed error). Never compare error strings.
- Add context when wrapping; do not log-and-return at every layer (that produces duplicate, noisy logs).

## HTTP boundary

- One central mapper translates an error to an HTTP response: `errors.As` to extract the `*AppError`, read the registry HTTP status and the localized message, write the response body. A non-`AppError` (unexpected) maps to 500 with a generic message and a loud log.
- Never write the raw `err.Error()` to the client for unexpected errors.

## Logging

- Use structured logging (`log/slog`): log once at the boundary with the code, category, and request context.
- Programmer-category errors log at error level and trigger alerting per the policy; operational errors log at warn/info without paging.

## Localization

- The HTTP mapper looks up the user message by `code` and the request locale from the contract's `messages` map. Do not hardcode user-facing strings at the call site.

## Anti-patterns

- `if err != nil { return err }` everywhere with no context (lose the trail) — wrap with `%w` and a message
- `_ = doThing()` swallowing an error
- Comparing `err.Error() == "not found"`
- `panic` for validation or not-found
- Writing `err.Error()` straight into an HTTP response
