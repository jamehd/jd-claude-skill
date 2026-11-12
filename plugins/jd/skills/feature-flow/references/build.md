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
- No other feature is in `building`, `acceptance` or `stopped` (`limits.features_active`).
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

## Steps

Write "Current step: build <n>" to `paths.status` as each step starts.

1. Set `building` in `feature.md` and the status file. On rework, read the report's verdict table
   and rework history first; change only what the notes require.
2. Git: if the folder is not a repository, initialise it on `git.main`, commit the existing files,
   push to `git.remote`. Then create or switch to `git.branch_pattern`, based on `git.main`.
3. Plan with superpowers:writing-plans into task files in `paths.tasks` from `templates/task.md`
   (IDs `T-NNN`, `epic: <ID>`). Existing task files keep their counters; re-planning must
   **never reset** them, only add or amend.
   Quote titles and values that contain `:` in the frontmatter, or the board skips the file.
4. Write one automated test per scenario in `acceptance.md` first; confirm they fail; record test
   names in `acceptance.md` and `paths.scenarios`.
5. Implement with superpowers:subagent-driven-development and superpowers:test-driven-development,
   one task at a time, models per `models.large_task` / `models.small_task`. Set a task
   `ai_running` while it runs and `review` when its tests pass.
   - After each task run `actions.test_all` (once it is not pending).
   - On failure use superpowers:systematic-debugging and increment that task's `attempts`; check
     the limit before every new attempt.
   - When this feature creates an action named in "Delivers", run it once; if it works, set its
     `pending: false` in `project.yaml` immediately so the following steps use it.
6. Review with superpowers:requesting-code-review. When auth, personal data, payment or uploads
   changed, also dispatch the `jd:security-reviewer` agent with the branch range
   (`git merge-base <git.main> HEAD`..`HEAD`) and the brief. Critical/High findings from either
   review must be fixed; fixing findings is a counted cycle.
7. Rebase on `git.main`, then verify; all must pass:
   - Dispatch the `jd:qa-runner` agent with this feature's ID and the `when` conditions that hold. It
     runs `actions.test_scenarios` for every `active` scenario in `paths.scenarios` plus this
     feature's, then `actions.test_all`, `actions.test_integration`, `actions.lint`,
     `actions.gen_check` and the matching conditional actions. Only its `QA RESULT: PASS` counts;
     copy its tables into the report. `FLAKY` and `NO TEST` are failures.
   - Every skill in `audits.always`, scoped to this feature's changes. The UI audit uses
     `design_system` and records "no UI surface in changes" when there is none. Skills in
     `audits.when_schema` when schema or queries changed.
   - Fix Critical/High findings in this feature's changes (counted cycle); list Medium/Low in the
     report and add follow-up features or tasks.
   - A still-pending action is reported as not yet available, never as passed.
8. Commit with `git.commit_footer`; push the branch.
9. Start the acceptance environment (`actions.dev_up`, `actions.dev_seed`, `actions.dev_run`) and
   confirm the try-it steps work; any fix here is a counted cycle and repeats step 7.
10. Report: `report.md` is **created once** from the template on the first build; later builds
    update it in place and keep `Rework round` and the rework history.
11. Set `acceptance` in `feature.md` and the status file. Reply with results, how to start the
    environment and the try-it guide; ask for `/jd:accept <ID> ok` or notes per scenario.
