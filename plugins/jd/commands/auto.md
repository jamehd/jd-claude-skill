---
description: Autonomous end-to-end delivery — brainstorm to spec to plan to implement to review to pull request without pausing, stopping only for architectural, hard-to-reverse, or destructive decisions. Opens a PR at the end.
argument-hint: "[the feature or fix to deliver]"
---

# Auto Mode

Invoke the `jd:auto` skill to deliver the requested change end-to-end with no per-step check-ins.

**Request:** $ARGUMENTS

Steps:
1. Load the `jd:auto` skill via the Skill tool.
2. If `$ARGUMENTS` is empty, ask once for the change to deliver, then run autonomously.
3. Run the full chain: brainstorm, spec, plan, worktree, implement (subagent + TDD, tests after each task), review, commit, push, then integrate per `git.integration` (default: open a PR).
4. Pause ONLY for architectural, hard-to-reverse, or destructive decisions (see the skill's STOP list). Otherwise pick sensible defaults and record them as assumptions.
5. End by reporting the PR link, a per-task summary, and the full assumptions list.

Project values come from `project-board/project.yaml` when present (otherwise defaults). Per-task model: `models.small_task` (default Sonnet) for routine tasks, `models.large_task` (default Opus) for complex ones. Work in an isolated worktree/branch, never the base branch.
