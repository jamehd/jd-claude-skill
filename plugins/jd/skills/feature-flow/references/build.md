# /jd:build <ID>

Stop immediately for anything on the stop list in SKILL.md; never touch `acceptance.forbidden`.
Stay on the feature branch: do **not** run superpowers:finishing-a-development-branch or
superpowers:using-git-worktrees, and never merge here. Merging happens only in `accept.md`.

## Preconditions — stop and report if one fails

- Status: the feature is `brief-review` (first build), or `building` (resume or rework).
  `idea` → run `feature.md` instead and stop. `stopped` → resume only through `next.md`.
- Approval: `approvedAt` in `feature.md` is set. If it is empty, the status is `brief-review`, and
  the owner typed `/jd:build <ID>` themselves, that is the approval: set `approvedAt`, write
  `Approved by owner: <date>` in the brief, set its scenarios to `approved`. Otherwise ask and stop.
- `acceptance.md` exists and has at least one scenario.
- Fewer than `limits.features_active` other features are in `building` or `stopped`, and fewer than
  `limits.features_waiting` are in `acceptance`, none of which this feature `needs`
  (`tiers.md`, "Pipelining features").
- Every `needs` ID is done.
- An action with `pending: true` is allowed only when the brief's "Delivers" section names it.

## Counters

- A task's `attempts` counts failed fix cycles for that task; its limit is `attemptLimit` in the
  task file (default `limits.fix_attempts`).
- `featureFixAttempts` in `feature.md` counts fix-and-verify cycles in steps 6, 7 and 11 (one per
  cycle, however many findings it fixes); its limit is `featureFixLimit` (default
  `limits.fix_attempts`).
- Counters are never reset. When a counter reaches its limit: write a stop report
  (`templates/stop-report.md`) into the task file or report and into `paths.status`, set
  `stoppedFrom` to the current status, set `stopped`, tell the person named in it, and end.
- Every stop report follows `templates/stop-report.md`, including its `## Stops` row.

## Steps

Write "Current step: build <n>" to `paths.status` as each step starts.

1. Set `building` in `feature.md` and the status file; on the first build (from `brief-review`) overwrite `pluginVersion` from
   `<plugin>/.claude-plugin/plugin.json` (`<plugin>` is two folders above this skill); rework keeps it. On rework, read the report's verdict table
   and rework history first; change only what the notes require.
2. Git: if the folder is not a repository, initialise it on `git.main`, commit the existing files,
   push to `git.remote`. Then create or switch to `git.branch_pattern`, based on `git.main`.
3. Plan with superpowers:writing-plans into task files in `paths.tasks` from `templates/task.md`
   (IDs `T-NNN`, `epic: <ID>`). Existing task files keep their counters; re-planning must
   **never reset** them, only add or amend.
   - Set `risk` on every task (`tiers.md`) and size tasks for one implementer session; test
     harnesses, load and soak tooling are their own tasks.
   - More than `limits.feature_tasks` tasks → stop and propose a split to the owner, unless the
     brief records that the owner kept the feature whole.
   - Process debt first (`tiers.md`): a missing `test_scenarios_only` or `test_scenarios_nightly`,
     a gate suite slower than `quality.gate_suite_minutes`, or a soak that cannot fail fast gets
     its own task ahead of the product tasks, unless the brief records that the owner deferred it.
   Quote titles and values that contain `:` in the frontmatter, or the board skips the file.
4. Write one automated test per scenario and per quality budget in `acceptance.md` first; confirm they fail; record test
   names in `acceptance.md` and `paths.scenarios`. Put each test in the suite its row names
   (`gate` or `nightly`); waits the product must observe use scaled, configurable values in `gate`.
5. Implement with superpowers:subagent-driven-development and superpowers:test-driven-development,
   one task at a time, models per the task's `risk` and size (`tiers.md`). Set a task
   `ai_running` while it runs and `review` when its tests pass.
   - Every implementer prompt carries the rules the reviews will apply, so findings are prevented
     instead of found late: the project's `CLAUDE.md` rules, the comment rule (Rule 2 of
     `../start-conversation/SKILL.md`), the error contract
     (`error-standard.yaml` when the repository has one), and for `medium` and `high` tasks the
     checklist rows of `../../agents/security-reviewer.md` that match the task's area. Before
     reporting done, the implementer checks its own diff against them and records the result
     under "Self-check" in the task file; an item it could not satisfy is written there, not hidden.
   - Implementers run the inner loop only: `actions.test_all` and the task's own scenarios through
     `actions.test_scenarios_only`. They never run or wait for the gate suite, load or soak.
   - Each task review uses superpowers:requesting-code-review for spec and quality; a `high` task
     also gets `jd:security-reviewer` on its commits. Critical/High findings are fixed within the
     task (they count against its `attempts`). The quality review also checks the diff against the
     comment rule: each forbidden comment the diff adds is a Minor finding, fixed in the task
     without counting against `attempts`.
   - On failure use superpowers:systematic-debugging and increment that task's `attempts`; check
     the limit before every new attempt.
   - When this feature creates an action named in "Delivers", run it once; if it works, set its
     `pending: false` in `project.yaml` immediately so the following steps use it. A measuring tool
     gets the short dry run in `quality.md` before its task is done.
6. Whole-branch review, by the feature's tier: `low` skips it (task reviews suffice); `medium`
   runs superpowers:requesting-code-review once over the branch; `high` also dispatches
   `jd:security-reviewer` with the branch range (`git merge-base <git.main> HEAD`..`HEAD`) and the
   brief. Critical/High findings must be fixed; fixing findings is a counted cycle. Run the skills
   in `audits.always` here too, so all findings are fixed in one cycle before verification.
   Every review of this feature ends here: after step 6 the code is frozen except for fixes, and
   each fix is reviewed on its own diff before anything is re-measured (`tiers.md`, "Order").
7. Rebase on `git.main`, then verify once, fast checks before measurements (`tiers.md`, "Order");
   take `measure.lock` for the measurements; all must pass:
   - Dispatch the `jd:qa-runner` agent in gate mode with this feature's ID, its tier and the `when`
     conditions that hold. It runs the gate suite plus every scenario of this feature, then
     `actions.test_all`, `actions.test_integration`, `actions.lint`, `actions.gen_check`, the
     matching conditional actions and the quality actions the tier calls for (`tiers.md`,
     `quality.md`). Only its `QA RESULT: PASS` counts; copy its tables into the report. `FLAKY`
     and `NO TEST` are failures.
   - The audits from step 6 are already done; rerun them only on code changed since.
     The UI audit uses `design_system` and records "no UI surface in changes" when there is none.
     Skills in `audits.when_schema` when schema or queries changed.
   - A failure is a counted cycle: fix, review the fix's diff (code review; plus
     `jd:security-reviewer` when the feature or the touched task is `high`), rerun the failed and
     touched scenarios with `actions.test_scenarios_only`, then dispatch `jd:qa-runner` in gate mode
     once more. Measurements that passed and whose code path the fix did not touch are kept.
   - List Medium/Low findings in the report and add follow-up features or tasks.
   - A still-pending action is reported as not yet available, never as passed.
   - The full `test_soak` does not run here by default: it runs nightly on `git.main` and gates the
     release (`tiers.md`). Only when the brief chose `merge`, start it on the verified commit in the
     background and continue; its result is checked in `accept.md`.
8. Commit with `git.commit_footer`; push the branch.
9. Start the acceptance environment (`actions.dev_up`, `actions.dev_seed`, `actions.dev_run`) and
   confirm the try-it steps work; any fix here is a counted cycle and repeats step 7.
10. Report: `report.md` is **created once** from the template on the first build; later builds
    update it in place and keep `Rework round` and the rework history. Fill "Time and cost" with
    `node <plugin>/tools/usage-report/usage.mjs --repo <repository root> --since <first commit of the branch>`
    (`<plugin>` is two folders above this skill), and the gate suite duration against
    `quality.gate_suite_minutes`. Fill the `Plugin version` row from `pluginVersion`.
11. Set `acceptance` in `feature.md` and the status file. Reply with results, how to start the
    environment and the try-it guide; ask for `/jd:accept <ID> ok` or notes per scenario. When a
    long soak is running for this feature, say when it ends and that the merge waits for it.
    Otherwise say that the full soak runs nightly after merge and gates the release. Then, when the
    queue has a next feature whose brief is approved, continue with it (`tiers.md`, "Pipelining
    features").
