---
name: plan-batch
description: Use when doing the morning planning pass for a project board (repository with project-board/project.yaml) — turning rough intents or backlog items into agent-ready board tasks for unattended overnight dispatch. Triggers on "plan today", "shape the backlog", "groom tasks", "lên kế hoạch hôm nay", "chuẩn bị task cho board".
---

# Plan Batch — Morning Shaping for Unattended Dispatch

## Overview

Turn the day's rough intents and backlog into a small set of board tasks shaped
well enough that the project board can dispatch each one to a headless `jd:auto`
agent that runs UNATTENDED overnight. The agent cannot ask questions at 2am, so
every card must pre-answer everything `jd:auto` would otherwise stop on.

**Core principle:** a card is "agent-ready" only when nothing is left for the
overnight agent to guess. The output is a populated `ready` column — never code,
never a dispatch. For EVERY card, explain it to the operator — what it does, why,
and the planned approach — in terms he can follow, settle the how together, and
promote to `ready` only on his explicit OK; never self-promote. The operator then
starts the batch.

## Requires project.yaml

Read `<repo>/project-board/project.yaml` first (keys and defaults: `../../shared/project-config.md`). If it is missing, stop and offer to run the `jd:project-board` setup skill; do not shape cards without it. Values used here: `tasks.id_prefix`, `requirements.*`, `e2e.*`, `board.data_dir`.

## When to Use

- The morning planning block: shaping intents into board tasks.
- Grooming `backlog` tasks toward `ready`.
- NOT for big/ambiguous features — route those to `superpowers:brainstorming`
  for a real spec first; only emit cards that are genuinely ready.

## Flow

1. **Select** — read `backlog` from the board's `tasks/` folder (`board.data_dir`, default `project-board/data`), take the day's
   intents, propose a prioritized shortlist (WIP ~3-5), assign `P0`-`P3`.
2. **Shape each** — drive every candidate to agent-ready (see Ready-gate).
3. **Ready-gate** — passing ALL gate items is necessary but NOT sufficient:
   discuss each candidate with the operator and only promote to `status: ready`
   on his explicit per-card OK. Everything else stays `status: backlog` with a
   note on what is missing or pending discussion.
4. **Write** — serialize each card to `<board.data_dir>/tasks/<id>-<slug>.md`.
5. **Report** — list cards → ready, cards → backlog (why), the e2e-gated cards,
   independence/sequencing notes, and any card that needs a real brainstorm.

## REQUIRED: the `needsE2e` field on every card

This is the field agents most often skip, and the board's PR routing depends on
it. Every card MUST carry an explicit boolean `needsE2e` in its frontmatter —
never omit it, never leave it implicit in prose.

Decide it by this heuristic:

- `needsE2e: true` — the change touches one of the live contracts listed in `e2e.contracts`
  (the live cross-service or cross-device interfaces whose behavior only a real end-to-end run
  can confirm). When `e2e.contracts` is empty, use `false` unless the operator says otherwise.
- `needsE2e: false` — anything else: internal logic, single-component UI, refactors, docs.

Why it matters downstream (do not restate this in the card, just set the field):
the board runs `jd:auto` in board mode and routes the finished task by this flag
— `true` holds it in `review` with a `MANUAL E2E REQUIRED` marker for the
operator's manual e2e (`e2e.host` says where, `e2e.note` why); `false` lets the board open the PR
automatically as a complete cycle. Absent → the board falls back to a
conservative `review` and never auto-PRs, so a missing flag silently breaks the
non-e2e fast path.

## Ready-gate — all must hold before `status: ready`

- [ ] **Operator-approved** — this specific card was explained to the operator
      this session (what it does, why, and the planned approach), the how was
      agreed together, and he explicitly OK'd `ready`. Never self-promote, even
      when every other gate item passes.
- [ ] **Scope** stated: what's in, what's explicitly out.
- [ ] **`needsE2e`** set true/false by the heuristic above.
- [ ] **Req ID(s)** named — an existing id matching `requirements.id_pattern`
      (default `[A-Z]{2,6}-R\d+`; `requirements.id_example` shows the house style), or a concrete NEW
      id to add — with testable acceptance criteria.
- [ ] **Every overnight-blocking decision locked.** Walk `jd:auto`'s STOP list
      (architecture / schema / public API / wire contract / auth shape; anything hard to
      reverse; any genuine fork) and answer it IN the card. If a decision can't
      be made now, the card is NOT ready — hold it in `backlog`.
- [ ] **Independent** of other cards in this batch, or sequenced: flag cards that
      touch the same files/component so parallel board jobs don't collide on
      merge.

Fail any item → write `status: backlog`, `requiresShaping: true`, and a one-line
note on what's missing.

## Card format (must be a valid board file)

Frontmatter keys the board parses: `id, type, title, status, priority,
component, created, updated`, plus optional `plan`, `requiresShaping`, and
`needsE2e`. The body is markdown.

- **`id`**: the next `<tasks.id_prefix>-###` (default `TASK`; `BUG-###` for bugs), zero-padded to
  3 digits, one past the highest existing id in `<board.data_dir>/tasks/`.
- **`component`**: must match a component in the requirements map
  (`<requirements.dir>/<requirements.map>`); when no map exists, use the folder names in
  `<board.data_dir>/status/`.
- **`created`/`updated`**: today, `YYYY-MM-DD`.
- **`plan`**: keep it light — a short spec + the locked decisions. `jd:auto`
  re-plans from it; do not write a line-by-line implementation plan. For a big
  item that needed a real brainstorm, set `plan` to the committed plan file path
  (e.g. `docs/plans/<file>.md`).

Example (shaped, e2e-gated; ids and names are illustrative):

```markdown
---
id: TASK-042
type: task
title: Add a GetServerTime call to the sync service contract
status: ready
priority: P2
component: sync-service
created: 2026-06-24
updated: 2026-06-24
needsE2e: true
---

## Scope
Add a unary `GetServerTime() -> { epoch_millis }` to the sync-service contract and implement the
handler plus the client method. Additive only.

Out: clock drift correction, any UI.

## Locked decisions
- Wire format: int64 `epoch_millis`, UTC. (Not a timestamp message type — avoids codegen friction.)
- Additive to the existing contract; existing calls untouched.

## Acceptance
- Contract and regenerated stubs compile; handler returns current UTC ms.
- The client can call it through the public API.

Req: SYNC-R12 (NEW) — GetServerTime call on the sync-service contract
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reasoning about e2e in prose but no `needsE2e` field | Always set the boolean. Prose is invisible to the board's routing. |
| Inventing a slug id like `getservertime-rpc` | Use the board's `<tasks.id_prefix>-###`/`BUG-###` sequence. |
| Leaving an architecture/contract/schema choice "for the agent to decide" | Lock it in the card or hold the card in backlog. Overnight has no human. |
| Writing a long line-by-line plan | Carry spec + locked decisions; `jd:auto` plans the steps. |
| Moving a vague bug with unknown root cause to `ready` | Keep it in `backlog` until it's reproducible/unit-testable, or it ships an unverifiable hack overnight. |

## Relationship to other skills

Cards here are consumed by the project board, which dispatches each to `jd:auto`
in board mode. For genuinely big/ambiguous work, run `superpowers:brainstorming`
first and attach the resulting plan file, then shape the card.
