# /jd:build <ID>

Stop immediately for anything on the stop list in SKILL.md; never touch `acceptance.forbidden`.

## Preconditions — stop and report if one fails

- Approval: the brief has `Approved by owner: <date>`. If missing and the owner typed
  `/jd:build <ID>` themselves, that is the approval: record it first. Otherwise ask and stop.
- No other feature is in `building` or `acceptance` (`limits.features_active`).
- Every `needs` ID is done.
- An action in `actions` with `pending: true` is allowed only when this feature's brief says it
  delivers that action.

## Steps

Write "Current step: build <n>" to `paths.status` as each step starts.

1. Set `building` in `feature.md` and the status file. On rework, read the report's verdict table
   and rework history first; change only what the notes require.
2. Git: if the folder is not a repository, initialise it on `git.main`, commit the existing files,
   push to `git.remote`. Then create or switch to `git.branch_pattern`, based on `git.main`.
3. Plan with superpowers:writing-plans into task files in `paths.tasks` from `templates/task.md`
   with `epic: <ID>`. Existing task files keep their `attempts`; re-planning must **never reset**
   them, only add or amend. Size tasks; model per `models.large_task` / `models.small_task`.
4. Write one automated test per scenario in `acceptance.md` first; confirm they fail; record test
   names in `acceptance.md` and `paths.scenarios`.
5. Implement with superpowers:subagent-driven-development and superpowers:test-driven-development.
   Set a task `ai_running` while it runs and `review` when its tests pass.
   - After each task run `actions.test_all`.
   - On failure use superpowers:systematic-debugging and increment that task's `attempts`.
6. Review with superpowers:requesting-code-review; add a security pass when auth, personal data,
   payment or uploads changed.
7. Rebase on `git.main`, then verify; all must pass:
   - `actions.test_scenarios` for every `active` scenario in `paths.scenarios` plus this feature's.
   - `actions.test_all`, `actions.test_integration`, `actions.lint`, `actions.gen_check`, and any
     other action whose `when` condition holds.
   - Every skill in `audits.always`, scoped to this feature's changes. The UI audit uses
     `audits.ui_design_source` and records "no UI surface in changes" when there is none. Skills in
     `audits.when_schema` when schema or queries changed.
   - Fix Critical/High findings in this feature's changes; list Medium/Low in the report and add
     follow-up features or tasks.
   - Every fix in this step increments `featureFixAttempts` in `feature.md`.
   - A `pending: true` action is reported as not yet available, never as passed.
8. Limits: when a task's `attempts` or `featureFixAttempts` reaches `limits.fix_attempts`, stop:
   write a stop report (`templates/stop-report.md`) into the task file or report and into
   `paths.status`, set `stopped`, tell the person named in it.
9. If this feature delivered actions, set their `pending` to `false` in `project.yaml`.
10. Commit with `git.commit_footer`; push the branch.
11. Start the acceptance environment (`actions.dev_up`, `actions.dev_seed`, `actions.dev_run`) and
    confirm the try-it steps work.
12. Report: `report.md` is **created once** from the template on the first build; later builds
    update it in place and keep `Rework round` and the rework history.
13. Set `acceptance` in `feature.md` and the status file. Reply with results, how to start the
    environment and the try-it guide; ask for `/jd:accept <ID> ok` or notes per scenario.

Never merge in this command.
