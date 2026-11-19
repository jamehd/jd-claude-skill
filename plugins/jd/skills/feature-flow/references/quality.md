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
| `actions.test_load` | Every build of a `medium` or `high` feature with a `test_load` budget, and nightly | Every measured value within its budget |
| `actions.test_soak_short` | Build step 7 of a `medium` or `high` feature with a `test_soak` budget | No crash; trends within budget over the short run |
| `actions.test_soak` | Nightly on `git.main`; gates the release (`tiers.md`), or the merge when the brief chose `merge` | Every measured value within its budget; no crash |

The short soak lasts at least `quality.soak_short_hours` (default 2): long enough to catch failures
that recur every few tens of minutes, short enough to fit a build.

## Soaks fail fast

A soak checks its budgets while it runs, at least every `quality.soak_check_minutes` (default 60),
and stops with a non-zero exit on the first violation of an absolute budget (crash, lost or
duplicated data, a resource above its limit, a dependency marked down), printing the values
measured so far. Budgets that compare the end with the start (a trend over 24 h) are judged at the
end, but a trend already beyond twice its allowance at a check also stops the run. A soak action
that cannot do this is a quality-tooling gap: the build plans a task to add it.

Each action prints the measured values in its output so `jd:qa-runner` can compare them with the
budgets. A budget whose value does not appear in the output is a failure (`NO MEASUREMENT`).
A pending quality action is reported as not yet available; a feature whose own budgets depend on
it cannot pass step 7 unless the feature delivers that action. Without `test_soak_short`, step 7
skips the soak and the long soak becomes a merge gate for that feature.

A budget row names its full-length action (`test_soak`); the short soak is the merge evidence, the
full soak the release evidence. A full soak that fails on `git.main` becomes a release-blocking fix
task (`tiers.md`); when the brief chose `merge`, a failure before merge is a counted cycle
(`accept.md`).

## Measuring tools are tested before they measure

A task that delivers or changes a measuring tool (load generator, soak runner, benchmark, fuzzer)
ends with one short dry run in build step 5: load at the brief's stated condition for one minute,
soak for ten minutes. It passes when every budget of the brief appears in the output and the tool
reaches the stated condition (for example the offered rate is at least the budget's load). A tool
that cannot reach the condition is fixed in its task, never discovered at verification.

## Headroom and noisy measurements

- Gate A: when a budget has an earlier measurement (a previous report, the nightly run) above
  `quality.headroom_pct` (default 80) of its limit, the brief lists it under Open questions with the
  measured value: raise the limit, plan a performance task, or accept the risk.
- Timing budgets (latency, throughput, duration) are noisy. A timing budget that fails by no more
  than `quality.timing_retry_pct` (default 10) of its limit is measured twice more on an idle
  machine and judged by the median of the three runs; all three values go into the report. A larger
  miss, or any non-timing budget, is a failure on the first run.

## When a budget fails

Profile first (CPU, heap, thread or goroutine dumps), fix the cause, then re-measure. Raising a
budget needs the owner's approval in the brief, like changing a scenario.
