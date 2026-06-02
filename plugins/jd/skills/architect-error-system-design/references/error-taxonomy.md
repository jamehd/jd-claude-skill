# Error Taxonomy

The model the designed system is built on. Language-agnostic.

## Two categories

### Operational errors
Expected runtime conditions. The code is correct; the world is not.
- Downstream timeout or 5xx
- Invalid user input
- Resource not found
- Permission denied, rate limit hit, conflict (duplicate)

Handle: classify with a stable code, log with context, retry if transient, return a localized user message. Do not alert a human unless the aggregate rate spikes.

### Programmer errors
Bugs. An invariant is violated.
- Null/undefined dereference, wrong shape
- Assertion failure, unreachable branch reached
- Misconfiguration at startup

Handle: fail fast, log loudly with full stack, alert immediately, show the user a generic message. Do not attempt recovery.

The split drives every other decision: HTTP status (4xx operational vs 5xx programmer), retryable or not, alert or not, user message specific or generic.

## Recovery strategies

| Strategy | When |
|----------|------|
| Retry with backoff | Transient operational (network, downstream 5xx) |
| Circuit breaker | Repeated downstream failure; fail fast for a cooldown |
| Fallback / degraded mode | A reduced result is acceptable (serve cache) |
| Fail fast | Programmer errors, or operational errors with no safe fallback |

## Stable error codes

Every error carries a stable, machine-readable `CODE` (for example `AUTH_OTP_EXPIRED`, `DOC_UPLOAD_TOO_LARGE`). The code is the join key across the whole system:
- code -> HTTP status
- code -> retryable flag and recovery strategy
- code -> localized user message (per locale)
- code -> log severity and whether to alert

Codes are part of the contract and must stay stable once shipped (clients and dashboards depend on them). Group them by domain prefix.

## Boundaries: where errors are translated

An error crosses two boundaries:
1. Internal -> transport (HTTP): map the typed error to a status and a safe response body. Never leak stack traces or internal messages to the client.
2. Transport -> user (UI): map the code to a localized message the user can act on.

A well-designed system translates exactly once at each boundary, from the code, not from the raw message string.

## Anti-patterns

- Catching the base error type and swallowing it (hides programmer errors as if operational)
- Returning null/empty on failure instead of a typed error (caller cannot tell "not found" from "broken")
- Logging then re-throwing with no added context
- Hardcoding user-facing message strings at the throw site instead of mapping from the code (blocks localization)
- Treating everything as Critical (alert fatigue) or everything as Low (incidents found only by user complaints)

## References
- The operational vs programmer distinction (Joyent Node.js error handling guide)
- Graceful degradation (Google SRE book)
- RFC 7807 / RFC 9457 Problem Details for HTTP APIs (optional transport shape)
