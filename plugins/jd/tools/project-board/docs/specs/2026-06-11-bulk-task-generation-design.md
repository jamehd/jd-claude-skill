# Bulk Task Generation from Scan — Design Spec

Date: 2026-06-11
Status: approved (brainstorm session with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board` (board tool feature;
not a gamesync product doc).

## Purpose

The Re-scan job reconciles the living requirements into a per-requirement status
table (State done/partial/missing, Tested yes/no) plus a Drift section. Today,
turning those gaps into board work means hand-typing each task. This feature
generates candidate tasks/bugs from the scan deterministically and lets the owner
select which to create in one batch — closing the loop from "scan found a gap" to
"there's a task to fix it."

## Decisions (locked during brainstorm)

| Topic | Decision |
|---|---|
| Generation | Deterministic, server-side: read the status files + requirement docs, emit one candidate per gap. No AI run — the requirements layer already supplies rich content. |
| Curation | Select-then-create: a review screen lists candidates with checkboxes + quick edits; the owner picks, then bulk-creates. No blind create-all. |
| Default type | TASK; per-row toggle to BUG in the review screen. |
| Dedup | Skip a candidate if a non-`done` item already references the same `Req: <ID>` with the same kind. |
| New items land in | `backlog` (normal new-item status); the owner dispatches them as usual. |

## Candidate generation (deterministic)

A new server module reads, per component that has both a requirement doc
(`docs/requirements/components/<c>.md` under `BOARD_REPO_ROOT`) and a status file
(`project-board/data/status/<c>.md`):
- the requirement index (id → {title, statement, acceptance}) via the existing
  `parseRequirementsDir`;
- the status rows (`| <ID> | State | Tested | Note |`) and the `## Drift` section,
  parsed from the status markdown.

It emits candidates per this mapping:

| Scan signal | kind | type | title | priority | body |
|---|---|---|---|---|---|
| State `missing` | `implement` | task | `Implement <ID>: <reqTitle>` | P1 | statement + ACs + "Detected by scan: missing" + `Req: <ID>` |
| State `partial` | `implement` | task | `Complete <ID>: <reqTitle>` | P2 | statement + ACs + status note + `Req: <ID>` |
| Tested `no` (State done or partial) | `test` | task | `Add tests for <ID>: <reqTitle>` | P2 | the ACs (which need tests) + status note + `Req: <ID>` |
| Drift line "code with no referencing requirement: <path>" | `reconcile` | task | `Reconcile: <path>` | P3 | the drift line + "add a requirement covering this or remove the code" |

Notes:
- A `missing` requirement implies untested, so it yields only the `implement`
  candidate (no separate `test` candidate) to avoid noise.
- Drift "requirement with no implementation" overlaps with `missing` State →
  not emitted separately. Drift "acceptance criteria with no test" overlaps with
  `test` → not emitted separately. Only the "code with no requirement" drift
  line becomes a `reconcile` candidate.
- Each candidate carries `component` (from the status file), a `kind`, and the
  `reqId` (or path, for reconcile). `body` always non-blank (satisfies the
  mandatory-description rule; `Req: <ID>` lets dispatch re-inject the requirement).

## Dedup

Before returning candidates, the server scans existing board items
(`store.scan().items`). A candidate is suppressed if an existing item with status
≠ `done` has a body referencing the same `Req: <ID>` AND the same kind marker.
Kind is detected from the existing title/body prefix (`Implement`/`Complete` →
implement, `Add tests` → test, `Reconcile` → reconcile). This keeps re-runs from
duplicating live work; a gap whose task was completed (status done) can resurface
if it regresses.

## API

| Route | Behavior |
|---|---|
| `GET /api/scan-candidates` | Returns `{ candidates: Candidate[] }` — the deduped candidate list across all components. Read-only. |
| `POST /api/tasks/bulk` | Body `{ items: { type, title, component, priority, body }[] }`. Validates each (same rules as single create: type∈task/bug, non-blank title/component/body). Creates each via `store.createItem`, returns `{ created: string[] }` (the new ids). One `board_update` broadcast. Partial failure: items that fail validation are reported in `{ rejected: {index, error}[] }`; valid ones still create. |

`Candidate` shape (shared type in `ui/src/types.ts`):
```ts
interface Candidate {
  kind: 'implement' | 'test' | 'reconcile'
  type: 'task' | 'bug'        // default suggestion; UI can flip
  component: string
  reqId?: string              // present for implement/test
  title: string
  priority: Priority
  body: string
}
```

## UI

- A **"Tạo task từ scan"** button in the ComponentsPanel header (next to
  "Re-scan").
- Clicking it fetches `/api/scan-candidates` and opens a modal (Aurora recipe:
  backdrop, surface panel, scrollable). Candidates are grouped by component.
- Each row: a checkbox, an editable title input, a type toggle (task/bug), a
  priority select, and the component (read-only). Default-checked: `implement`
  candidates (missing/partial); default-unchecked: `test` and `reconcile`
  (owner opts in). A per-group and a global "select all / none".
- Footer: "Tạo N mục" (N = checked count) → `POST /api/tasks/bulk` with the
  checked rows; on success, close the modal (the board refreshes via WS).
- Empty state: if no candidates (everything covered), show "Không có gap nào
  cần tạo task — scan sạch hoặc đã có task." with a hint to Re-scan first.

## Error handling

- `/api/scan-candidates` with no status files yet → empty candidate list (not an
  error); UI shows the empty state suggesting Re-scan.
- A status file present but unparseable → that component is skipped (logged),
  others still produce candidates.
- Bulk create partial failure → created ids returned + rejected list surfaced in
  the modal; the modal stays open showing which rows failed.

## Testing

- Server (vitest): candidate generation from fixture requirement + status docs —
  missing→implement P1, partial→complete P2, untested→test P2, drift→reconcile
  P3; the overlap-suppression rules (missing doesn't also emit test; drift
  dup-with-missing/untested suppressed); dedup against an existing non-done item
  referencing the same Req+kind; empty when no status files.
- Server: `POST /api/tasks/bulk` — creates N items, returns ids, broadcasts;
  validates (rejects blank-body/bad-type rows while creating the valid ones);
  404/empty handled.
- UI: not unit-tested beyond types; manual e2e (open modal, select, create,
  confirm items appear in backlog).
- Full suite + typecheck + grep-gate stay green.

## Out of scope

- AI-proposed/enriched candidates (deterministic only).
- Auto-dispatch of created tasks (they land in backlog; dispatch is manual/Phase C).
- Behavioral-bug detection (the scan finds gaps, not defects; BUG type is a
  manual per-row choice).
- A persisted "ignore this gap" list (re-runs simply re-surface unconverted gaps;
  dedup only covers gaps that already have a live task).
