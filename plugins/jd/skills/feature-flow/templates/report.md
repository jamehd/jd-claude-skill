# <ID> — Acceptance report

| Field | Value |
|---|---|
| Rework round | 0/<limits.rework_rounds> |
| Feature fix attempts | 0/<featureFixLimit> |
| Branch | feat/<ID>-<slug> |
| Build date | <date> |
| Environment | <from acceptance.environment in project.yaml> |

## Results

| Suite | Result |
|---|---|
| This feature's scenarios | <n>/<n> pass |
| Gate regression (active `gate` scenarios) | <n>/<n> pass, <minutes> min (target `quality.gate_suite_minutes`) |
| Last nightly regression on `git.main` | <date>: <n>/<n> pass |
| Unit / integration | pass |
| Lint, generation check | pass |
| Quality budgets | <n>/<n> within budget |

## Quality budgets

| ID | Budget | Measured | Result | Source |
|---|---|---|---|---|
| <ID>-Q1 | <budget> | <value> | <pass / fail> | <action and run date> |

Benchmark comparison with `git.main`: <worst change in %, threshold `quality.bench_regression_pct`>.

Long soak: <not required / passed <date> / running, ends <time> / gate: release>.

## Time and cost

From `tools/usage-report` for this branch.

| Step | Wall time | Agent time | Tokens in (cache read) | Tokens out |
|---|---|---|---|---|
| Plan and implement | | | | |
| Reviews and audits | | | | |
| Verification and fixes | | | | |
| Total | | | | |

Gate suite slowest scenarios: <ID: minutes, …>.

## Audits

| Audit | Critical | High | Medium | Low | Notes |
|---|---|---|---|---|---|
| error audit | 0 | 0 | <n> | <n> | |
| UI audit | 0 | 0 | <n> | <n> | <or "no UI surface in changes"> |
| DB audit | | | | | <or "not triggered"> |

Open Medium/Low findings become follow-up rows on the board.

## Evidence

- <link to screenshot / recording / log>

## How to start the environment

1. <steps from acceptance.environment>

## Try-it guide

Copied from [acceptance.md](acceptance.md), one block per scenario.

## Owner verdict

| Scenario | Verdict | Notes |
|---|---|---|
| <ID>-S1 | <ok / not ok> | |

Rework history:

| Round | Date | Notes from owner | Change made |
|---|---|---|---|
