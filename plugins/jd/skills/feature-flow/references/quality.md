# Quality budgets: crashes, leaks, performance

Review cannot prove these; only running and measuring can. Every budget is a number with a
condition, written in the brief, checked by an action, and re-checked forever once accepted.

## What to budget

| Risk | Budget examples | Typical evidence |
|---|---|---|
| Crash | No crash under malformed input, lost network, concurrent use; crash-free rate in pilot | Race detector or sanitizers in tests, fuzz tests on every parser of external input, crash reporting in apps and long-running processes |
| Leak | Memory, threads or goroutines, handles and connections flat over the soak duration | Leak checks in unit tests, `test_soak` printing start and end values |
| Performance | p95 latency under stated load, throughput, start-up time, CPU and RAM on target hardware | `test_bench` compared with `git.main`, `test_load` printing percentiles, profiles when a budget fails |

## Actions

| Action | When it runs | Pass rule |
|---|---|---|
| `actions.test_bench` | Every build | No benchmark slower than `git.main` by more than `quality.bench_regression_pct` |
| `actions.test_load` | Every build of a feature with a `test_load` budget, and nightly | Every measured value within its budget |
| `actions.test_soak` | Nightly; in a build only when the feature has a `test_soak` budget and no soak result exists for its branch | Every measured value within its budget; no crash |

Each action prints the measured values in its output so `jd:qa-runner` can compare them with the
budgets. A budget whose value does not appear in the output is a failure (`NO MEASUREMENT`).
A pending quality action is reported as not yet available; a feature whose own budgets depend on
it cannot pass step 7 unless the feature delivers that action.

## When a budget fails

Profile first (CPU, heap, thread or goroutine dumps), fix the cause, then re-measure. Raising a
budget needs the owner's approval in the brief, like changing a scenario.
