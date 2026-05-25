# Error Taxonomy

How to think about errors so you can decide how to handle them.

## Two categories

### Operational errors
Expected runtime conditions. The code is correct; the world is not.
- Network failure (downstream API timeout)
- Validation failure (invalid user input)
- Resource not found (record deleted)
- Rate limit hit

**Handle**: log with context, retry if transient, return a friendly user message, do not page anyone unless aggregate rate spikes.

### Programmer errors
Bugs. The code is wrong.
- Null reference (`undefined.foo`)
- Type errors (wrong shape)
- Assertion failures
- Unreachable branch reached

**Handle**: crash fast, log loudly with full stack, alert immediately, show generic error page to user. Do NOT try to recover — the program's invariants are violated.

## Recovery strategies

| Strategy | When to use |
|----------|-------------|
| **Retry** with exponential backoff | Transient operational errors (network, 5xx from downstream) |
| **Circuit breaker** | Repeated downstream failure — fail fast for a period to give downstream time to recover |
| **Fallback / degraded mode** | Service can run with reduced functionality (use cache when API down) |
| **Fail fast** | Programmer errors, or operational errors with no safe fallback |

## Anti-patterns

- ❌ Catching `Error` (base) and swallowing — hides programmer errors as if they were operational
- ❌ Returning `null` on error instead of throwing typed error — caller can't distinguish "not found" from "system broken"
- ❌ Logging then re-throwing without adding context — wraps stack but tells you nothing new
- ❌ Treating all errors as Critical — alert fatigue → real Criticals ignored
- ❌ Treating all errors as Low — incidents detected only by user complaints

## Reference
- Joyent Node.js error handling guide (the canonical operational vs programmer distinction)
- Google SRE book chapter on graceful degradation
