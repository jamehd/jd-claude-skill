# <ID> — Acceptance scenarios

Scenario IDs are permanent. Changing or retiring one needs owner approval in a brief.

| ID | Given | When | Then | Timing | Suite | Automated test |
|---|---|---|---|---|---|---|
| <ID>-S1 | <starting state> | <action by a person or system> | <result observable in the acceptance environment> | <e.g. within 10 s> | <gate / nightly> | <test name, filled at build> |

## Quality budgets

Measured by actions, not by people. Each row also goes into the scenario catalogue and is re-checked
like any other scenario once accepted.

| ID | Measure | Budget | Condition | Action | Suite | Automated test |
|---|---|---|---|---|---|---|
| <ID>-Q1 | <e.g. p95 latency of check-in API> | <e.g. < 200 ms> | <e.g. 50 sites x 100 clients> | <test_load> | <gate / nightly> | <test name, filled at build> |

## Try it yourself

### <ID>-S1 — <short title>

1. <which account / which screen>
2. <action>
3. Expected: <what you should see>
