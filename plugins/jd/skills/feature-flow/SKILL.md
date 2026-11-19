---
name: feature-flow
description: Use only in repositories that contain project-board/project.yaml (otherwise offer setup) — running a project through the feature lifecycle — owner gives requirements and accepts, AI drafts briefs with numbered acceptance scenarios, builds with subagents test-first, re-runs every accepted scenario, audits, and merges only after acceptance. Entry points /jd:status, /jd:next, /jd:feature, /jd:build, /jd:accept. Triggers on "continue", "next feature", "new feature", "approve brief", "accept feature", "làm tiếp", "tính năng mới", "duyệt brief", "nghiệm thu", "trạng thái dự án".
---

# Feature Flow

People say **what** they want and check **whether it works**. AI does everything in between.
Every accepted scenario stays in the regression suite forever; verification is proportional to risk
(`references/tiers.md`). When a limit is hit the AI stops and asks instead of looping.

## Before anything

1. Find `project-board/project.yaml` in the repository root. If it is missing, follow
   `references/setup.md` and stop.
2. Read `project.yaml`, then the status file at `paths.status`.
3. Load the reference for the command being run:

| Command | Reference |
|---|---|
| `/jd:status` | `references/status.md` |
| `/jd:next` | `references/next.md` |
| `/jd:feature <ID or text>` | `references/feature.md` |
| `/jd:build <ID>` | `references/build.md` |
| `/jd:accept <ID> ok or notes` | `references/accept.md` |
| no `project.yaml` | `references/setup.md` |

`references/tiers.md` (risk tiers, scenario suites, feature size, agent cost) applies to
`/jd:feature` and `/jd:build`.

Plain requests map to these commands. Talk to people in `language.owner`; write files in
`language.docs`.

## Roles

| Step | Who |
|---|---|
| Requirements, brief approval (Gate A) | Owner |
| Brief and scenarios, plan, build, test, audit, dev environment, merge | AI |
| Acceptance on dev (Gate B) | Owner (later a tester; owner signs off large features) |
| Resolve a stop | Owner for business questions; a developer for technical ones when the team has one |

Agents shipped with the jd plugin (subagent types `jd:<name>`; if the agent type is not available, use a
general-purpose subagent and give it `../../agents/<name>.md` (relative to this skill) as its
instructions):

| Agent | Used for |
|---|---|
| `jd:qa-runner` | Build verification and nightly regression: runs scenarios and actions, read-only, reports pass/fail with evidence |
| `jd:security-reviewer` | Independent security review of `high` tasks and branches (auth, personal data, payment, uploads, `risk.high_paths`) |

## Data layout (all under the target repository)

| Item | Location | Template |
|---|---|---|
| Project config | `project-board/project.yaml` | `templates/project.yaml` |
| Status | `paths.status` | `templates/status.md` |
| Feature | `paths.features/<ID>/feature.md` | `templates/feature.md` |
| Brief | `paths.features/<ID>/brief.md` | `templates/brief.md` |
| Scenarios | `paths.features/<ID>/acceptance.md` | `templates/acceptance.md` |
| Report | `paths.features/<ID>/report.md` | `templates/report.md` |
| Technical task | `paths.tasks/<task ID>-<slug>.md` | `templates/task.md` |
| Scenario catalogue | `paths.scenarios` | `templates/scenarios.md` |
| Owner action | `paths.owner_actions/<ID>.md` | `templates/owner-action.md` |
| Stop report | inside the status file and the card or report | `templates/stop-report.md` |

Files are the source of truth. Never keep state or counters only in memory.

## Feature statuses

| Status | Meaning | Next |
|---|---|---|
| `idea` | Requested, brief not written | AI drafts (`/jd:feature`) |
| `brief-review` | Brief and scenarios ready | Owner approves or corrects |
| `building` | Approved, AI building | AI (`/jd:build`) |
| `acceptance` | On dev with report and try-it guide | Owner verdict (`/jd:accept`) |
| `done` | Accepted and integrated (PR merged, or merged by the AI) | — |
| `stopped` | Limit or STOP decision hit; stop report in the status file | Person named in the report |

The queue is every feature not `done`, sorted by `order` in `feature.md`. `needs` lists feature IDs
and owner-action IDs that must be done first.

## Gates

- **Gate A**: no code before the owner approves the brief explicitly, in words or by typing
  `/jd:build <ID>`. Record the line `Approved by owner: <date>` in the brief and `approvedAt` in
  `feature.md`.
- **Gate B**: only `/jd:accept <ID> ok` (or an equally explicit statement) accepts. Then the AI
  integrates the feature branch as `git.integration` says (`references/accept.md`).
- Never infer approval or acceptance from vague replies such as "ok", "tiếp", "good"; ask.

## Limits

| Limit | Key | On reaching it |
|---|---|---|
| Fix attempts per technical task (`attempts` vs `attemptLimit`) | `limits.fix_attempts` | Stop with a stop report |
| Feature fix-and-verify cycles (`featureFixAttempts` vs `featureFixLimit`) | `limits.fix_attempts` | Stop with a stop report |
| Rework rounds after owner rejection | `limits.rework_rounds` | Re-examine the brief with the owner instead of changing code |
| Features in `building` or `stopped` at once | `limits.features_active` | Draft the next brief only |
| Features in `acceptance` at once (waiting for owner, PR or soak) | `limits.features_waiting` (2) | Draft the next brief only |

Stop immediately, regardless of counters, for: architecture or contracts not fixed by the
project's design docs; irreversible data actions; deleting work not created in this run;
anything in `acceptance.forbidden`; a missing tool, credential or service with no offline path.

## Always

- Crashes, leaks and performance are numeric quality budgets in the brief, measured by actions
  (`references/quality.md`); a budget is a scenario like any other.
- Every build verifies once with the gate suite (every `active` scenario in suite `gate`) plus all of
  the feature's own scenarios, then runs every skill in `audits.always` (and `audits.when_schema`
  when schema or queries changed). `nightly` scenarios and the long soak run on the schedule in
  `references/tiers.md`.
- Fast to merge, strict to release: merge needs the gate suite, reviews and short measurements;
  the nightly suite and the full soak gate the release (`references/tiers.md`, "Release gate").
  Reviews finish before long runs; a fix is reviewed before anything is re-measured.
- Each feature and task has a risk tier (`low`, `medium`, `high`) that sets its reviews and checks.
- One branch per feature (`git.branch_pattern`); integrate only at Gate B: the PR is opened or the merge done by `/jd:accept`, and a merged PR is
  completed by `/jd:accept` or `/jd:next` (`git.integration`: `pull-request` by default, or
  `merge-after-acceptance`).
- `approvedAt` in `feature.md` is the authoritative Gate A record.
- Task files use the project-board task format but are never set to `ready`, so board
  auto-dispatch cannot pick them up.
- End every command by updating the status file and `feature.md`.
