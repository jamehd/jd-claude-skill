# Risk tiers: verification in proportion to risk

Rigor goes where a mistake is expensive. Fast checks gate every change; slow checks run once per
build, nightly, or before a release. Every accepted scenario stays in the regression suite forever,
but not every scenario blocks every change.

## Tiers

| Tier | Typical work | Mistake costs |
|---|---|---|
| `low` | UI copy and layout, dev tooling, test harnesses, docs | A redo |
| `medium` | Business features, APIs, sync, background processes | An incident that a fix repairs |
| `high` | Money, writes to shared or legacy data, authentication, personal data, uploads, anything in `risk.high_paths` | Lost money or data, a breach, or something hard to reverse |

- The brief states the feature's tier and why (`templates/brief.md`); the owner approves it at Gate A.
- Each task carries `risk` in its file: the feature's tier, raised to `high` when the task touches
  `risk.high_paths` or `risk.high_topics`, lowered to `low` when it changes only tooling, tests or docs.
- Unsure → the higher tier.

## Verification ladder

| Check | `low` | `medium` | `high` |
|---|---|---|---|
| Rules given to the implementer, self-checked before done | `CLAUDE.md` rules + error contract | + matching security checklist rows | + every security checklist row |
| Inner loop, per task and per fix (implementer) | `test_all` + the task's own scenarios | same | same |
| Review per task | spec + quality review | same | same + `jd:security-reviewer` on the task's commits |
| Whole-branch code review (build step 6) | none | once | once + `jd:security-reviewer` on the branch |
| Verification (build step 7, `jd:qa-runner`, once) | gate suite + feature scenarios + `test_all`, `test_integration`, `lint`, `gen_check`, `test_bench` | + `test_load` when a budget names it, + `test_soak_short` when a budget names `test_soak` | + conditional actions (`when`) |
| Long soak (`test_soak`) | nightly | nightly; must pass before a release | must pass before merge (runs while the owner accepts) |
| Audits (`audits.always`, scoped to changes) | yes | yes | yes |

`quality.long_soak_gate` sets the default for `medium` (`release` or `merge`); a brief can raise it.
`build` restores the old behaviour (the long soak blocks step 7).

## Scenario suites

Each scenario and budget row has a `Suite`:

- `gate`: fast and deterministic; runs in `actions.test_scenarios` on every build.
- `nightly`: slow (real-time waits, real devices, long load); runs in
  `actions.test_scenarios_nightly`, which runs `gate` and `nightly` together. A build runs a
  `nightly` scenario only when it belongs to this feature.

Rules:

- The gate suite should finish within `quality.gate_suite_minutes`. When it does not, the report
  lists the slowest scenarios; the next brief proposes speeding them up (scaled timeouts, a manual
  clock, parallel runs) or moving them to `nightly`. Moving a scenario between suites is a brief
  change approved by the owner.
- A timeout or wait that a scenario must observe (offline after 10 minutes, expiry after 1 hour) is
  configurable in the product, so tests run it scaled down; the real value is checked in the
  `nightly` suite.
- When `actions.test_scenarios_nightly` does not exist, `actions.test_scenarios` runs every scenario
  (old behaviour).

## Fix cycles

A fix reruns what failed plus the scenarios of the touched area through
`actions.test_scenarios_only`, then the gate verification once. It does not rerun the whole ladder
after every edit. Without `test_scenarios_only`, run the gate suite.

## Feature size

A brief with more than `limits.feature_new_scenarios` new scenarios or a plan with more than
`limits.feature_tasks` tasks is split. The brief proposes the split (each part independently
acceptable); the owner may keep it whole by saying so explicitly.

## Agents and cost

- Plan tasks small enough for one implementer session: one area, one kind of work. Test harnesses,
  load tests and soak tooling are separate tasks from product code.
- Implementers run only the inner loop. Load, soak, the gate suite and anything longer than a few
  minutes run in the coordinator or `jd:qa-runner`, never inside an implementer that waits for them.
- Models: `low` tasks and test tooling use `models.small_task`; `high` tasks use `models.large_task`;
  `medium` by size, as the task file says.
- The coordinator keeps its own context small: it reads agent summaries, not their logs, and keeps
  state in files.
- Every report records wall time and token use per step (`tools/usage-report`), so the process is
  tuned from numbers.

## Owner steps

Anything only the owner can do for this feature (accounts, credentials, devices, a real site) is
listed in the brief under "Owner steps" and requested at Gate A, not discovered during the build.
