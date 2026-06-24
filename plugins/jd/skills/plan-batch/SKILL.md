---
name: plan-batch
description: Use when doing the morning planning pass for the GameSync project board — turning rough intents or backlog items into agent-ready board tasks for unattended overnight dispatch. Triggers on "plan today", "shape the backlog", "groom tasks", "lên kế hoạch hôm nay", "chuẩn bị task cho board".
---

# Plan Batch — Morning Shaping for Unattended Dispatch

## Overview

Turn the day's rough intents and backlog into a small set of board tasks shaped
well enough that the project board can dispatch each one to a headless `jd:auto`
agent that runs UNATTENDED overnight. The agent cannot ask questions at 2am, so
every card must pre-answer everything `jd:auto` would otherwise stop on.

**Core principle:** a card is "agent-ready" only when nothing is left for the
overnight agent to guess. The output is a populated `ready` column — never code,
never a dispatch. Discuss EVERY card with the operator and promote it to `ready`
only on his explicit OK; never self-promote. The operator then starts the batch.

## When to Use

- The morning planning block: shaping intents into board tasks.
- Grooming `backlog` tasks toward `ready`.
- NOT for big/ambiguous features — route those to `superpowers:brainstorming`
  for a real spec first; only emit cards that are genuinely ready.

## Flow

1. **Select** — read `backlog` from `project-board/data/tasks/`, take the day's
   intents, propose a prioritized shortlist (WIP ~3-5), assign `P0`-`P3`.
2. **Shape each** — drive every candidate to agent-ready (see Ready-gate).
3. **Ready-gate** — passing ALL gate items is necessary but NOT sufficient:
   discuss each candidate with the operator and only promote to `status: ready`
   on his explicit per-card OK. Everything else stays `status: backlog` with a
   note on what is missing or pending discussion.
4. **Write** — serialize each card to `project-board/data/tasks/<id>-<slug>.md`.
5. **Report** — list cards → ready, cards → backlog (why), the e2e-gated cards,
   independence/sequencing notes, and any card that needs a real brainstorm.

## REQUIRED: the `needsE2e` field on every card

This is the field agents most often skip, and the board's PR routing depends on
it. Every card MUST carry an explicit boolean `needsE2e` in its frontmatter —
never omit it, never leave it implicit in prose.

Decide it by this heuristic:

- `needsE2e: true` — the change touches the live cross-service contract:
  packer ↔ IDC content API, OR cafe-service ↔ menu-game gRPC (proto / RPC
  handlers / the client in launcher user mode).
- `needsE2e: false` — anything else: backend-internal logic, admin-web only,
  download core internals, refactors, docs.

Why it matters downstream (do not restate this in the card, just set the field):
the board runs `jd:auto` in board mode and routes the finished task by this flag
— `true` holds it in `review` with a `MANUAL E2E REQUIRED` marker for the
operator's afternoon e2e on cafe-win; `false` lets the board open the PR
automatically as a complete cycle. Absent → the board falls back to a
conservative `review` and never auto-PRs, so a missing flag silently breaks the
non-e2e fast path.

## Ready-gate — all must hold before `status: ready`

- [ ] **Operator-approved** — this specific card was discussed with the operator
      this session and he explicitly OK'd `ready`. Never self-promote, even when
      every other gate item passes.
- [ ] **Scope** stated: what's in, what's explicitly out.
- [ ] **`needsE2e`** set true/false by the heuristic above.
- [ ] **Req ID(s)** named — an existing `CAFE-R#`/`DL-R#`/`WEB-R#`/`PACK-R#`/
      `IDC-R#`, or a concrete NEW id to add — with testable acceptance criteria.
- [ ] **Every overnight-blocking decision locked.** Walk `jd:auto`'s STOP list
      (architecture / schema / public API / proto / auth shape; anything hard to
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

- **`id`**: the next `TASK-###` (or `BUG-###` for bugs), zero-padded to 3 digits,
  one past the highest existing id in `project-board/data/tasks/`.
- **`component`**: must match a component in `docs/requirements/.component-map.json`
  (e.g. `cafe-service`, `admin-web`, `idc_backend`, `launcher`).
- **`created`/`updated`**: today, `YYYY-MM-DD`.
- **`plan`**: keep it light — a short spec + the locked decisions. `jd:auto`
  re-plans from it; do not write a line-by-line implementation plan. For a big
  item that needed a real brainstorm, set `plan` to the committed plan file path
  (e.g. `docs/plans/<file>.md`).

Example (shaped, e2e-gated):

```markdown
---
id: TASK-042
type: task
title: Add GetServerTime RPC to the cafe-service gRPC contract
status: ready
priority: P2
component: cafe-service
created: 2026-06-24
updated: 2026-06-24
needsE2e: true
---

## Scope
Add a unary `GetServerTime() -> { epoch_millis }` to the Cafe Service ↔ Menu Game
proto and implement the handler + the user-mode client method. Additive only.

Out: NTP drift correction, any menu-game UI.

## Locked decisions
- Wire format: int64 `epoch_millis`, UTC. (Not google.protobuf.Timestamp — avoids
  well-known-types codegen friction.)
- Additive to the existing proto; existing RPCs untouched.

## Acceptance
- Proto + regenerated Go/TS stubs compile; handler returns current UTC ms.
- User-mode client can call it through the preload API.

Req: CAFE-R12 (NEW) — GetServerTime RPC on the Cafe Service gRPC contract
```

## Common Mistakes

| Mistake | Fix |
|---|---|
| Reasoning about e2e in prose but no `needsE2e` field | Always set the boolean. Prose is invisible to the board's routing. |
| Inventing a slug id like `getservertime-rpc` | Use the board's `TASK-###`/`BUG-###` sequence. |
| Leaving an architecture/proto/schema choice "for the agent to decide" | Lock it in the card or hold the card in backlog. Overnight has no human. |
| Writing a long line-by-line plan | Carry spec + locked decisions; `jd:auto` plans the steps. |
| Moving a vague bug with unknown root cause to `ready` | Keep it in `backlog` until it's reproducible/unit-testable, or it ships an unverifiable hack overnight. |

## Relationship to other skills

Cards here are consumed by the project board, which dispatches each to `jd:auto`
in board mode. For genuinely big/ambiguous work, run `superpowers:brainstorming`
first and attach the resulting plan file, then shape the card.
