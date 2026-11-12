# /jd:next

If `project-board/project.yaml` is missing, follow `setup.md` (offer to create) and stop.

Read `project.yaml`, `paths.status` and every `feature.md`. Decide from files only. Apply the
**first row that matches**:

| State | Action |
|---|---|
| A feature `stopped`, and the owner's latest message explicitly answers its stop question | Record the decision in the stop report, apply it, set the status back to `stoppedFrom`, clear `stoppedFrom`, continue from "Current step" in the status file |
| A feature `stopped`, no explicit answer | Repeat the stop question in `language.owner`; do nothing else |
| A feature `building` | Continue `build.md` from "Current step" and the first unfinished task |
| A feature `acceptance` with a PR link in its report (`git.integration: pull-request`) | Run `gh pr view`; when merged, finish `accept.md` steps 4-7; otherwise report the open PR |
| A feature `acceptance` | Remind how to try it and that `/jd:accept` is needed; then, if the next feature in the queue is `idea`, run `feature.md` for it (drafting only) |
| A feature `brief-review` | Remind the owner what needs approval; do not build |
| Nothing active | Take the first `idea` in the queue whose `needs` are all done and run `feature.md` |
| Queue empty | Run `status.md` and ask for the next requirement |

Budget after a stop: an explicit owner decision gives the stuck counter one fresh budget — raise
that task's `attemptLimit` (or the feature's `featureFixLimit`) by `limits.fix_attempts` and log it
in the stop report. Counters themselves are never reset. `Rework round` resets only when the brief
was corrected and re-approved.

Never infer approval or acceptance from vague messages. A `stopped` feature still counts toward
`limits.features_active`. Update `paths.status` before ending.
