## Pattern: Fastify - Missing setErrorHandler
**Severity:** High
**Boost rule:** N/A
**Dimension:** A (Code-level)

### Detection
Composite check (orchestrator):
1. Is `fastify` in `package.json`? If not, SKIP.
2. Look for `setErrorHandler`:
   - Ripgrep command(s):
   - `rg -t ts -t js --files-with-matches "\.setErrorHandler\("`
3. Look for `onError` hook:
   - `rg -t ts -t js --files-with-matches "addHook\(['\"]onError['\"]"`
4. If Fastify present AND neither found -> FLAG "no custom error handler; relying on Fastify default which leaks internals".

### Why this matters
Fastify's default error serializer returns:
```json
{ "statusCode": 500, "error": "Internal Server Error", "message": "<the err.message>" }
```
This leaks `err.message` to the user - which often contains SQL fragments, internal IDs, validation rule names, etc. A custom `setErrorHandler` lets you scrub internals, log to Sentry, and return a sanitized response.

### Fix template
```after
import Fastify from 'fastify';
import * as Sentry from '@sentry/node';

const fastify = Fastify();

fastify.setErrorHandler((err, request, reply) => {
  request.log.error({ err, path: request.url }, 'http.error');

  if (err.statusCode && err.statusCode < 500) {
    // 4xx - safe to surface
    return reply.status(err.statusCode).send({
      error: { code: err.code ?? 'BAD_REQUEST', message: err.message },
    });
  }

  // 5xx - hide internals, alert
  Sentry.captureException(err);
  return reply.status(500).send({
    error: { code: 'INTERNAL', message: 'Something went wrong on our side.' },
  });
});
```

### Reference
- `references/best-practices-per-stack.md#nodejs`
- Fastify docs: https://fastify.dev/docs/latest/Reference/Errors/
