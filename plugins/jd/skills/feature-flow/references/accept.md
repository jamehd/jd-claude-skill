# /jd:accept <ID> ok | <ID> <notes per scenario>

The feature must be `acceptance`; otherwise say so and stop. Update `report.md` in place; never
recreate it.

## Verdict ok

Only when the input explicitly accepts the feature.

1. Fill the verdict table with ok for every scenario.
2. Check the branch is pushed and the report's verification is green. If `git.main` moved since
   the build, rebase and re-run `build.md` step 7 (a counted cycle); a conflict that is not
   mechanical → stop with a stop report.
3. Merge the feature branch into `git.main` (merge commit or fast-forward, not squash), push
   `git.main`, delete the remote feature branch.
4. `paths.scenarios`: this feature's scenarios → `active` (they now run in every build).
5. Task files of this feature → `done`.
6. `feature.md` → `done`; the status file names the next feature in the queue.
7. Reply with a one-line confirmation and the suggested next command.

## Verdict with notes

1. Record each note against its scenario; increment `reworkRound` in `feature.md` and the report.
2. Within `limits.rework_rounds`: add a rework history row, set `building`, continue with
   `build.md` limited to the notes.
3. Beyond `limits.rework_rounds`: change no code. Set `stopped`, write a stop report comparing the
   notes with the brief and scenarios, propose brief corrections, and ask the owner to decide.

Ambiguous input (no feature ID, or a mix of praise and concerns without a verdict) → ask for an
explicit verdict and stop.
