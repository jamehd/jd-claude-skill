# /jd:accept <ID> ok | <ID> <notes per scenario>

The feature must be `acceptance`; otherwise say so and stop. Update `report.md` in place; never
recreate it.

## Verdict ok

Only when the input explicitly accepts the feature.

1. Fill the verdict table with ok for every scenario.
2. Check the branch is pushed and the report's verification is green. If `git.main` moved since
   the build, rebase and re-run `build.md` step 7 (a counted cycle); a conflict that is not
   mechanical → stop with a stop report.
   When the brief chose `merge` for the long soak (`tiers.md`): still running → record the verdict, report when
   it ends and stop; `/jd:next` continues here when it is done. Failed → a counted cycle: fix,
   re-run `build.md` step 7, start the soak again, and ask the owner to re-check only the scenarios
   the fix touched.
3. Integrate according to `git.integration` (default `pull-request`):
   - `pull-request`: look up an existing open PR for the feature branch
     (`gh pr list --head <branch> --state open --json url`) and reuse it; only when none exists open
     one into `git.main` with `gh pr create`. Record the PR link in `report.md` once, and leave the feature `acceptance`. Do not merge. Tell the person
     to merge the PR. The feature becomes `done` only after the PR is merged: a later
     `/jd:accept <ID>` or `/jd:next` runs `gh pr view` and acts on the state:
     - `MERGED`: continue with steps 4-8.
     - `OPEN`: report that the PR awaits merge and stop.
     - `CLOSED` without merge: set `stopped` with `stoppedFrom: acceptance`, write a stop report
       (PR closed unmerged), and ask the owner whether to reopen, recreate or abandon.
     - `gh` unavailable or not authenticated: ask the person to confirm explicitly that the PR was
       merged, record the confirmation and its date in `report.md`, then continue with steps 4-8.
   - `merge-after-acceptance`: merge the feature branch into `git.main` (merge commit or
     fast-forward, not squash), push `git.main`, delete the remote feature branch.
4. `paths.scenarios`: this feature's scenarios → `active` (they now run in every build).
5. Task files of this feature → `done`.
6. `feature.md` → `done`; the status file names the next feature in the queue. When the feature has
   a `test_soak` budget and its soak gates the release, add it under "Release readiness" as
   waiting for the nightly full soak.
7. Run `node <plugin>/tools/flow-metrics/metrics.mjs --repo <repository root>` (`<plugin>` is two folders
   above this skill); it writes `<paths.data>/metrics/metrics.json` and `metrics.md`. Skip the commit when
   unchanged. `pull-request`: never commit to `git.main`; commit them with the next feature branch's first
   commit (or the current rework/PR branch). `merge-after-acceptance`: include them in the push to `git.main`.
8. Reply with a one-line confirmation (and the PR link when one was opened) and the suggested next
   command.

## Verdict with notes

1. Record each note against its scenario, with a reason slug from `references/reasons.md` (several distinct slugs, comma-separated, when the round's notes differ); increment `reworkRound` in `feature.md` and the report.
2. Within `limits.rework_rounds`: add a rework history row (including its Reason column), set `building`, continue with
   `build.md` limited to the notes. Under `pull-request`, keep the existing PR open: push the
   rework commits to the same feature branch and note the round in the PR.
3. Beyond `limits.rework_rounds`: change no code. Set `stopped`, write a stop report comparing the
   notes with the brief and scenarios, propose brief corrections, and ask the owner to decide.
   Under `pull-request`, close the open PR with a comment pointing to the stop report; a new PR is
   opened after the brief is settled.

Ambiguous input (no feature ID, or a mix of praise and concerns without a verdict) → ask for an
explicit verdict and stop.
