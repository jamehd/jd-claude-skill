# <ID> — <feature name>

| Field | Value |
|---|---|
| Requested by | <person>, <date> |
| Original request | "<owner's words, verbatim>" |
| Branch | feat/<ID>-<slug> |
| Risk tier | <low / medium / high> — <one-line reason> |
| Size | <n> new scenarios (limit `limits.feature_new_scenarios`), about <n> tasks (limit `limits.feature_tasks`) |

Approved by owner: —

## Goal

<One or two sentences: what changes for which user, and why it matters.>

## Out of scope

- <item>

## Depends on

| Kind | ID | State |
|---|---|---|
| Feature | <ID> | <status> |
| Owner action | <ID> | <done / waiting> |

## Delivers

<Project actions (keys under `actions` in project.yaml) this feature creates, or "none".>

## Overlaps with existing features

| Feature | Shared behaviour | Intersection scenarios |
|---|---|---|
| <ID> | <what both touch> | <ID>-S<n> |

## Owner steps

What only the owner can provide, requested now so the build does not wait.

| Step | Needed for | By when |
|---|---|---|
| <e.g. test account in the legacy dev system> | <ID>-S<n> | <before build / before acceptance> |

Write "none" when the AI can do everything.

## Quality budgets

Numbers, never adjectives. One row per budget; each becomes a `<ID>-Q<n>` row in acceptance.md.
Write "none" with the reason when the feature has no performance, resource or stability risk.

| Kind | What | Budget | Under what condition | Measured by | Suite |
|---|---|---|---|---|---|
| performance | <operation> | <e.g. p95 < 200 ms> | <load, data size, hardware> | <action: test_bench / test_load> | gate |
| resources | <process> | <e.g. CPU < 2 %, RAM < 100 MB> | <target hardware, duration> | <test_load / test_soak> | gate / nightly |
| stability | <process or app> | <e.g. no crash, memory and thread count flat> | <e.g. 24 h with simulated traffic> | <test_soak> | nightly |

Long soak gate: <release / merge> (default from `quality.long_soak_gate`; `high` is always merge).

## Acceptance scenarios

See [acceptance.md](acceptance.md). Count: <n> new, <n> intersection; <n> in `gate`, <n> in `nightly`.

## Open questions for the owner

1. <question> — recommendation: <answer the AI would choose>

## Evidence the report will contain

- Scenario results (new and full regression)
- <screenshots / recordings for UI scenarios>
- Audit summary
- Quality budgets: measured value against each budget
- Try-it guide for the acceptance environment
