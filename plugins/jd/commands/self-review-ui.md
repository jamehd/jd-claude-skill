---
description: Run a UI self-review against DESIGN_SYSTEM.md / theme files (or default UI quality checklist) — produces a severity-grouped report with file:line evidence.
argument-hint: "[scope path or directory — optional, defaults to detected UI source dirs]"
---

# Self-Review UI

Invoke the `jd:self-review-ui` skill to audit the frontend for design-system and UI-quality compliance.

**Scope:** $ARGUMENTS

Steps:
1. Load the `jd:self-review-ui` skill via the Skill tool.
2. If `$ARGUMENTS` is non-empty, restrict the review to that path.
3. Otherwise, auto-detect UI source directories (`src/app`, `src/components`, `app/`, `components/`, …) and report which scope was chosen before proceeding.
4. Produce the report inline — do not write report files unless I explicitly ask.
5. End with the prioritized fix list so I can act on the top items immediately.

Do not modify source code during the review. Findings only.
