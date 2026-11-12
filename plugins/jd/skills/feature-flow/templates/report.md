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
| Full regression (all active scenarios) | <n>/<n> pass |
| Unit / integration | pass |
| Lint, generation check | pass |

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
