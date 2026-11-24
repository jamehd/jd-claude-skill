# Risk tiers: verification in proportion to risk

Rigor goes where a mistake is expensive. Fast checks gate every change; slow checks run once per
build, nightly, or before a release. Every accepted scenario stays in the regression suite forever,
but not every scenario blocks every change.

Development is fast, production is strict: merging into `git.main` needs the fast and short checks
only; the long, slow evidence (full soak, nightly suite) gates the release, never the merge
(`## Release gate`).

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
| Rules given to the implementer, self-checked before done | `CLAUDE.md` rules + comment rule + error contract | + matching security checklist rows | + every security checklist row |
| Inner loop, per task and per fix (implementer) | `test_all` + the task's own scenarios | same | same |
| Review per task | spec + quality review | same | same + `jd:security-reviewer` on the task's commits |
| Whole-branch code review (build step 6) | none | once | once + `jd:security-reviewer` on the branch |
| Verification (build step 7, `jd:qa-runner`, once) | gate suite + feature scenarios + `test_all`, `test_integration`, `lint`, `gen_check`, `test_bench` | + `test_load` when a budget names it, + `test_soak_short` when a budget names `test_soak` | + conditional actions (`when`) |
| Long soak (`test_soak`) | nightly | nightly; must pass before a release | nightly; must pass before a release, on the release commit |
| Audits (`audits.always`, scoped to changes) | yes | yes | yes |

`quality.long_soak_gate` sets when the full soak must pass, for every tier: `release` (default),
`merge` (the old behaviour: it runs while the owner accepts and blocks the merge) or `build` (it
blocks step 7). A brief can choose `merge` for one feature; the owner approves that at Gate A.

## Release gate

Production is reached only through a release, and a release is strict. A commit of `git.main` may
be released only when all of these hold on that exact commit, or on an earlier commit with no
product code changed since:

- The nightly run (`jd:qa-runner` in `nightly` mode) passed: every scenario of both suites, and
  `test_bench`, `test_load`.
- The full `test_soak` passed for every feature merged since the last release that has a
  `test_soak` budget.
- No open release-blocking task (below), no feature `stopped` on a soak or nightly failure.

A nightly or full-soak failure on `git.main` creates a release-blocking fix task (priority 1,
`risk` of the failing feature, naming the failed budgets and the first failing commit); the status
file lists it under "Release readiness". The feature that introduced it stays `done`; the fix is a
normal task, and the next full soak on its commit must pass. The owner decides when to release; the
AI never deploys (`acceptance.forbidden`).

Code that money, shared or legacy data depend on stays behind a feature flag or an off-by-default
switch until its release gate has passed, when the project has such a switch; the brief names it.

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

Missing suite tooling is process debt that slows every later build. When `test_scenarios_only` or
`test_scenarios_nightly` is still pending, or the last report's gate suite took longer than
`quality.gate_suite_minutes`, the next build plans a task that delivers the action or speeds up the
slowest scenarios (scaled waits, parallel runs, moving real-time waits to `nightly`) before its
product tasks, unless the owner defers it in the brief.

## Order: reviews before long runs

Slow evidence is collected last, on code that every review has already seen:

1. Implement, task reviews, whole-branch review and audits (build steps 5–6); every Critical/High
   finding fixed.
2. Fast verification: gate suite, feature scenarios, unit, integration, lint, generation check.
3. Measurements, shortest first: `test_bench`, `test_load`, `test_soak_short`.

A fix made after step 1 is reviewed before any measurement is repeated: code review of the fix's
diff, plus `jd:security-reviewer` on that diff when the feature or the touched task is `high`.
Never start or repeat a load or soak run on code that has an unreviewed change, and never run a
review of earlier fix cycles after a measurement has already passed on them.

## Fix cycles

A fix reruns what failed plus the scenarios of the touched area through
`actions.test_scenarios_only`, then the gate verification once. It does not rerun the whole ladder
after every edit. Without `test_scenarios_only`, run the gate suite.

A failed measurement repeats only the failed action, after the fix's review. Passed measurements are
kept when the fix does not touch the code path they measure; the report says which were kept and
why.

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
- Timing measurements (`test_bench`, `test_load`, soaks) need a machine that is otherwise idle.
  Before one starts, create `<paths.data>/measure.lock` with the feature ID, action and start time;
  delete it when the action ends. While it exists, no other build starts a measurement or a
  heavy test run on that machine; it waits or does other work. A lock older than the action's
  expected duration plus one hour is stale and may be removed, with a log line in the status file.

## Pipelining features

`limits.features_active` counts features in `building` or `stopped`. A feature in `acceptance`
(waiting for the owner, a PR merge or a soak) does not block the next feature's build, provided the
next feature does not `need` it. The next feature branches from `git.main`; whichever merges second
rebases and re-runs step 7 as usual. The owner can set `limits.features_waiting` (default 2) to cap
how many features may sit in `acceptance` at once.
- Every report records wall time and token use per step (`tools/usage-report`), so the process is
  tuned from numbers.

## Owner steps

Anything only the owner can do for this feature (accounts, credentials, devices, a real site) is
listed in the brief under "Owner steps" and requested at Gate A, not discovered during the build.
