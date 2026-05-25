# Expected Findings - nodejs-nestjs-broken

## Critical (3 expected)
1. `_common/01-logging-sensitive-data` at `src/auth/login.ts:5` - `password` in `logger.info`
2. `_common/01-logging-sensitive-data` at `src/payment/charge.ts:18` - `password` in `logger.info`
3. `_common/04-user-messaging` at `src/api/error-handler.ts:5` - `err.stack` in response body

## High (3 expected; boosted from Medium because in critical_paths)
4. `nodejs/01-promise-handling` at `src/payment/charge.ts:5` - `.then` without `.catch` (boosted: critical_path src/payment/)
5. `nodejs/02-async-error-handling` at `src/auth/login.ts:13` - `await` outside try/catch (boosted: critical_path src/auth/)
6. `_common/02-logging-quality` at `src/payment/charge.ts:11` - swallow catch with `console.log(e.message)` (boosted)

## Medium (1 expected)
7. `nodejs/03-error-class-taxonomy` at `src/auth/login.ts:9` - generic `Error` throw (reports as Medium with `critical_paths_present: yes`)

## Total expected
- Critical: 3
- High: 3
- Medium: 1
- Low: 0
