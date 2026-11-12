---
description: Morning planning pass for the project board — turn rough intents and backlog items into agent-ready board tasks for unattended overnight dispatch. Produces a populated `ready` column, never code and never a dispatch.
argument-hint: "[optional: the day's rough intents, or a backlog task id to groom]"
---

# Plan Batch — Morning Shaping for Unattended Dispatch

Invoke the `jd:plan-batch` skill to shape the day's intents and backlog into agent-ready board tasks.

**Intents:** $ARGUMENTS

Steps:
1. Load the `jd:plan-batch` skill via the Skill tool. It requires `project-board/project.yaml`; if missing, offer the `jd:project-board` setup instead.
2. Select: read `backlog` from the board's `tasks/` folder, fold in the intents from `$ARGUMENTS`, and propose a prioritized shortlist (WIP ~3-5) with `P0`-`P3`.
3. Shape each candidate to the Ready-gate — pre-answer everything a headless `jd:auto` agent would otherwise stop on at 2am.
4. Route big or ambiguous features to `superpowers:brainstorming` for a real spec first; only emit cards that are genuinely ready.
5. Write shaped cards into the `ready` column. Do NOT write code and do NOT dispatch — the operator reviews `ready` and starts the batch.
