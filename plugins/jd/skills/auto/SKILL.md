---
name: auto
description: Use when the user runs /jd:auto or asks to work autonomously — autonomous end-to-end delivery of a defined feature or fix. Drives brainstorm to spec to plan to implement to review to pull request without pausing for input, stopping ONLY for architectural, hard-to-reverse, or destructive decisions. Triggers on "/jd:auto", "auto mode", "tự động hóa", "chạy tự động", "next liên tục".
---

# Auto Mode (Autonomous Delivery)

Run the full delivery chain end-to-end with no per-step check-ins, then commit to a branch and open a PR. This is the opposite of Manual mode, which pauses at every phase to confirm. By invoking /jd:auto the user has pre-authorized the entire chain including the final PR.

## Core principle

Keep moving. When a decision has a reasonable default, pick it, record it as an assumption, and continue. Halt only for decisions the user must own.

**Violating the letter of the STOP list is violating the spirit of auto mode.** Asking when you should not defeats the mode; proceeding when you should stop risks irreversible harm. Both are failures.

## When to use

- "/jd:auto <request>"
- User asks to run autonomously / "tự động" / "next liên tục"
- NOT for open exploration where the goal itself is unknown. Auto mode delivers a defined change; it does not invent what to build from a blank slate.

## The chain — run in order, do not stop between phases

1. **Brainstorm** — Load superpowers:brainstorming. Explore intent, requirements, and edge cases yourself. Resolve open questions with sensible defaults instead of asking. Record every assumption.
2. **Spec** — Write a short spec: scope, the decisions you made, and an explicit **Assumptions** list. This is the audit trail the user reviews later.
3. **Plan** — Load superpowers:writing-plans. Break into independent, testable tasks. Assign model per task (Sonnet for routine, Opus 4.8 for complex).
4. **Worktree** — Load superpowers:using-git-worktrees. Isolate work in a fresh worktree/branch off the base branch. Never work on the base branch directly.
5. **Implement (subagent-driven)** — Load superpowers:subagent-driven-development + superpowers:test-driven-development. One task at a time. Dispatch each task to a subagent on the model matched to its size (see **Subagent model selection**). Run the project's tests after each task; do not defer the suite to the end.
6. **Review** — three layers, in order:
   1. **General review** — Load superpowers:requesting-code-review and collect findings.
   2. **Domain audits** — Run only the audits relevant to what the diff touched (see **Domain review routing**) and collect findings.
   3. **Fix** — Apply fixes per the **Fix policy** below, through a subagent with TDD, then re-run the affected tests.
   4. **Verify** — Load superpowers:verification-before-completion. Run the commands and confirm output before claiming done.

### Fix policy

- **Severity:** Auto-fix **Critical and High** findings. Record **Medium and Low** in the end-of-run report for the user to decide later — do not fix them.
- **Scope:** Only fix findings inside **this change's diff**. Findings the audits surface in pre-existing code outside the diff go to the report as "out of scope, not fixed" — do not expand the PR to fix them.
- **After fixing:** re-run the affected tests and re-verify. If a Critical/High fix would itself require a STOP-list decision (schema change, destructive migration), stop and ask instead of forcing it.
7. **Pull request** — Load superpowers:finishing-a-development-branch. Commit, push the branch, open the PR, report the link.

## STOP and ask — ONLY these

Pause for input only when a decision is one of:

- **Architectural / long lock-in:** DB schema shape, public API contract, auth model, a dependency hard to swap later.
- **Hard to reverse:** data migration, deleting or overwriting files you did not create this session, dropping columns, force-push, rewriting history, deleting branches.
- **Destructive or outward-facing beyond the planned PR:** sending messages or emails, deploying to prod, publishing, anything touching real users or external services.
- **Genuine fork:** two or more reasonable options diverge materially AND a wrong pick wastes significant work AND nothing in the request, codebase, CLAUDE.md, or memory points to one.

If none apply, do NOT stop. Pick the default, log the assumption, continue.

## Do NOT stop for

- Naming, file placement, UX wording, ordering, formatting. Follow conventions and move on.
- "Which library for X" when one already exists in the repo. Use it.
- Anything covered by CLAUDE.md, DESIGN_SYSTEM.md, or memory. Those ARE the decision.
- "Is this good enough to continue?" Verify and continue.

## Red flags — you are rationalizing

- "I'll just ask to be safe" on a reversible choice. That breaks auto mode. Pick a default.
- "I'll just proceed" on something in the STOP list. Stop and ask.
- "The request is a bit vague so I'll keep asking." Make defaults, record assumptions, deliver.

## Domain review routing

In review step 2, decide from the diff which domain audits to run. Run an audit only when its trigger is in the change; skip the rest and note what you skipped.

| Audit | Run when the diff touches | Notes |
|-------|---------------------------|-------|
| `jd:self-review-ui` | Frontend/UI: components, pages, styles, theme/design-system files | Scope it to the changed UI paths. |
| `jd:db-audit` | DB schema (Prisma), migrations, or query-heavy data-access code | The static (prisma) layer needs only the schema file and always runs when a schema is present. The runtime (postgres) layer needs a read-only DB connection (`DATABASE_AUDIT_URL` or a passed URL); if none is configured, run the static layer only and record the runtime layer as skipped — do NOT stop to ask. |
| `jd:error-audit` | New or changed error handling, logging, or critical paths (payment/auth/upload) | Scope it to the changed paths. |

If the diff touches none of these (e.g. docs or config only), skip all three and say so. Multiple may apply at once — run each relevant one. These audits are read-only; treat their findings as input to the general review, not a reason to halt unless a finding hits the STOP list.

## Subagent model selection

Match the subagent's model to the task size when dispatching in step 5:

- **Large task → Opus.** Cross-cutting changes, new architecture or schema, tricky algorithms, security-sensitive code, anything where a wrong approach is costly to unwind.
- **Medium / small task → Sonnet.** Routine CRUD, UI wiring, copy and i18n, config, tests, mechanical edits, well-scoped changes that follow an existing pattern.

When a task sits on the line, size up: more files, more unknowns, or higher blast radius means Opus; otherwise Sonnet. State the chosen model in the plan for each task.

## Guardrails (always on)

- English for code and docs; no redundant comments; no icons or symbols.
- Web PWA follows Hyundai Premium v3 tokens; never hardcode hex.
- Commit footer: Co-Authored-By line. PR body footer: Generated with Claude Code.
- Tests must actually pass. Evidence before "done".

## End of run — report

- PR link
- One-line summary per task
- The full **Assumptions** list, surfaced prominently so the user can correct anything you decided

This assumptions log is the contract: in auto mode the user trades per-step approval for a clear record of every decision made on their behalf.
