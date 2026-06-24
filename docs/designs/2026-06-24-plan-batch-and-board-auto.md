# Design — Morning planning (`jd:plan-batch`) + board dispatch via `jd:auto`

Status: proposed (2026-06-24)
Repos touched: `jd-claude-skill` (new skill, `jd:auto` edit, project-board tool)

## Context — the daily fleet rhythm

The operator (solo) runs a fixed 24h pipeline offset at noon, fully manual (no cron):

- **Morning** — discuss + decide the day's work; shape it into agent-ready board
  tasks. Detailed-brainstormed tasks move `backlog → ready`.
- **Noon** — he starts the batch on the Project Board (Auto Mode picks `ready`
  tasks, or he drags one to AI). Agents run unattended through the night.
- **Afternoon** — acceptance (nghiệm thu): review finished jobs, run e2e by hand on
  cafe-win where required, then merge.

This design makes the morning shaping a skill and routes ALL board dispatch through
`jd:auto`, with a smart e2e gate.

## Part 1 — `jd:plan-batch` (morning skill)

Purpose: turn the day's rough intents + board backlog into a small set of
agent-ready board tasks in `ready`, shaped so unattended overnight dispatch does not
stall. Ends at a populated `ready` column. No code, no dispatch.

- Input: operator intents + existing `backlog` tasks (`project-board/data/tasks/*.md`).
- Output: board task `.md` files written into `project-board/data/tasks/` —
  shaped → `status: ready`, under-shaped → `status: backlog` (`requiresShaping: true`).
- Consumer: board dispatch → `jd:auto` (board mode, Part 2).

### Flow

1. **Select** — read backlog, ask for today's intents, help prioritize a shortlist
   (WIP ~3–5), assign `P0–P3`.
2. **Shape each** — drive every candidate to agent-ready by resolving everything the
   overnight agent would otherwise guess or stall on:
   - `title`, `component` (match `.component-map.json`), `type`, `priority`
   - scope (in / explicitly out)
   - Req ID(s) (existing or new) + acceptance criteria as testable ACs
   - **lock every `jd:auto` STOP-list decision** (architecture/schema/API/auth,
     hard-to-reverse, genuine forks) inside the card — overnight has no human
   - **independence check** — flag cards touching the same component/files; sequence
     by priority or split/merge so parallel board jobs do not collide on merge
   - **`needsE2e`** flag (see Part 3)
   - assumption-log instruction (log assumptions, do not stall)
   - Plan stays light: `jd:auto` re-plans from the spec + locked decisions, so the
     card carries the spec + decisions, not a line-by-line plan.
3. **Ready-gate** — a card may be written `ready` only if it passes ALL: scope clear,
   Req ID + ACs, every STOP-list decision locked, independent (or sequenced), spec
   complete. Otherwise write `backlog` + `requiresShaping: true` with a note on what
   is missing. (Stricter than the board's built-in gate, which only checks `plan`.)
4. **Write** — serialize each card to `project-board/data/tasks/<id>.md` with correct
   frontmatter. Never touch other board state.
5. **Report** — N → ready, M → backlog (why), independence/sequencing notes, the list
   of **e2e-gated cards**, and any card needing a full brainstorm first.

## Part 2 — Board dispatch via `jd:auto` (board mode)

The board has a single dispatch path (`runner.ts` → `buildTaskPrompt`), so both Auto
Mode and manual drag are covered by changing that path to invoke `jd:auto`.

### `jd:auto` — add a "Board mode" section

When the dispatch prompt declares board mode, `jd:auto`:

- **skips worktree creation** — already in `.board-worktrees/<id>` on `board/<id>`;
- **uses the attached plan/spec as its spec+plan** when present (skip redundant
  brainstorm; still record assumptions for gaps); a bare drag with no plan falls back
  to the normal self-brainstorm;
- **always commits on the current branch only — never push, never open a PR, never
  touch other branches** (the board owns review→merge/PR);
- **never touches `project-board/data/`**;
- keeps everything else: implement (TDD, subagent-driven), review + domain audits
  (**error-audit always; ui-design-audit when UI changes; never e2e**), verification,
  tests, Req trailers + "Requirements touched" footer, assumptions report.

### project-board changes

- **`buildTaskPrompt`** — rewrite to instruct delivery via `jd:auto` (board mode),
  keeping the requirements injection + Req-trailer enforcement + "Requirements
  touched" footer. Pass `needsE2e` into the prompt so the agent ends with the right
  marker.
- **`runner.ts` post-job (success)** — branch on `needsE2e`:
  - `needsE2e: false` → board pushes the branch and opens a PR (`git.openPr`), sets
    status `pr`, records the PR url. A complete autonomous cycle.
  - `needsE2e: true` → board leaves status `review` and records a prominent
    **"MANUAL E2E REQUIRED"** note on the task; the human runs e2e on cafe-win in the
    afternoon, then merges via the board UI.
  The agent itself always just commits on the branch; the board owns all push/PR/merge.
- **tests** — update `prompt.test.ts` for the jd:auto-driven prompt; add runner tests
  for the `needsE2e` branch (PR opened vs review+marker).

### Why agent never opens the PR

Centralizes git in the board (it already has `git.openPr` + a `pr` status/field),
avoids needing `gh` auth inside each headless worktree, keeps the agent uniform, and
prevents double-merge (board-local merge vs remote PR).

## Part 3 — the `needsE2e` gate

- **Decided by** `jd:plan-batch` during shaping. Heuristic default `true` when scope
  touches the live cross-service e2e surface: packer publish, IDC content API
  contract, cafe-service download/gRPC, or the menu-game proto. Operator confirms.
- **Stored** as frontmatter `needsE2e: true|false`; round-trips through the board's
  `extra` map (no schema change).
- **Surfaced** (report + marker, no UI change): plan-batch morning report lists
  e2e-gated cards; the job's final report and the task body carry "MANUAL E2E
  REQUIRED"; e2e tasks stop at `review`, non-e2e tasks reach `pr` automatically.

## Non-goals

No cron / auto-start (operator pushes start). No e2e inside auto (afternoon, manual,
cafe-win). Not for big/ambiguous features — those route to a real brainstorm/spec
first; plan-batch only emits genuinely-ready cards.

## Ship steps

- `jd:auto` edit → bump plugin version + push + `claude plugin update` + restart.
- project-board edit → `npm run build` + restart the board server (192.168.1.36:4400).
- `jd:plan-batch` new skill → ships with the same plugin version bump + reinstall.
