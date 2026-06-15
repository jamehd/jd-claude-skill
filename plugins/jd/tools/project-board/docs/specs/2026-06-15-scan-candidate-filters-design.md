# Scan-Candidate Filters — Design Spec

Date: 2026-06-15
Status: approved (brainstorm with jamehd)
Lives in: jd-claude-skill, `plugins/jd/tools/project-board`.

## Problem

The "Tạo task từ scan" modal (`BulkGenModal`) lists every scan candidate at once
with a per-row checkbox. On a real board the candidate list is long (dozens), so
finding the ones worth importing is tedious. Add client-side filters so the owner
can narrow the list before selecting + creating.

## Decision (locked)

| Topic | Decision |
|---|---|
| Filter axes | Four, AND-composed: **Service** (component), **Loại scan** (`kind`: implement/test), **Ưu tiên** (priority), **Loại** (`type`: task/bug). |
| Filter target | Filters the candidate rows in `BulkGenModal` by their CURRENT value (priority/type are editable inline, so the filter reflects edits). |
| Create semantics | "Tạo N mục" creates rows that are **checked AND currently visible** (checked ∩ filtered). Hidden-but-checked rows are NOT created. |
| Select helpers | "Chọn tất cả (đang lọc)" / "Bỏ chọn (đang lọc)" set/clear `checked` on the currently-visible rows only. |
| Backend | Unchanged. `/api/scan-candidates` still returns the full list; filtering is purely client-side. |
| Out of scope | Persisting the filter, free-text/title search, filtering by reqId, changing the backend. |

## Pure predicate (`ui/src/filters.ts`)

Add alongside the existing board filter helpers (testable, no React):

```ts
export interface CandidateFilter {
  component: string // 'all' or a component name
  kind: 'all' | 'implement' | 'test'
  priority: 'all' | Priority
  type: 'all' | 'task' | 'bug'
}

export const EMPTY_CANDIDATE_FILTER: CandidateFilter =
  { component: 'all', kind: 'all', priority: 'all', type: 'all' }

// Operates on any object carrying these four fields (Candidate or the modal's Row).
type Filterable = { component: string; kind: 'implement' | 'test'; priority: Priority; type: 'task' | 'bug' }

export function isCandidateFilterActive(f: CandidateFilter): boolean {
  return f.component !== 'all' || f.kind !== 'all' || f.priority !== 'all' || f.type !== 'all'
}

export function applyCandidateFilter<T extends Filterable>(rows: T[], f: CandidateFilter): T[] {
  return rows.filter((r) => {
    if (f.component !== 'all' && r.component !== f.component) return false
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    if (f.priority !== 'all' && r.priority !== f.priority) return false
    if (f.type !== 'all' && r.type !== f.type) return false
    return true
  })
}
```

(The existing `BoardFilter`/`applyFilters`/`isShaped` stay untouched — candidates
have no `shaped` axis and use `kind` instead, so this is a separate, parallel
filter type in the same module.)

## BulkGenModal changes

State: add `const [filter, setFilter] = useState<CandidateFilter>(EMPTY_CANDIDATE_FILTER)`.

Rendering:
- A filter row under the header: four `<select>` (Service / Loại scan / Ưu tiên /
  Loại) + a "Xóa lọc" button shown only when `isCandidateFilterActive`. The Service
  options are the distinct `component`s present in `rows`. Tokens-only styling
  (reuse the modal's existing select classes).
- The list maps over `rows` keeping the ORIGINAL index, then filters by the
  predicate, so `patch(originalIndex, …)` still targets the right row:
  `rows.map((r, i) => ({ r, i })).filter(({ r }) => matches)`. Use `applyCandidateFilter`
  via a small adapter, or filter the `{r,i}` pairs with the same predicate logic —
  whichever keeps the original index intact for `patch`/checkbox.
- "Chọn tất cả (đang lọc)" / "Bỏ chọn (đang lọc)" buttons set `checked` true/false
  on exactly the currently-visible rows (by original index).

Create:
- `visibleChecked = (visible rows).filter((r) => r.checked)`.
- The create button label is `Tạo {visibleChecked.length} mục`, disabled when
  `visibleChecked.length === 0`, and `create()` submits `visibleChecked` (the
  existing mapping to `api.bulkCreate` is unchanged — only the input set changes
  from all-checked to visible-checked).

## Testing

- **`ui/src/filters.test.ts`** (extend): `applyCandidateFilter` for each axis and
  AND-composition; `isCandidateFilterActive` true/false; empty filter returns all.
  Use plain candidate-shaped objects.
- **BulkGenModal**: not unit-tested beyond types; `npm run typecheck`,
  `npx vite build ui`, and the tokens-only grep-gate must pass. Manual check after
  deploy: filtering narrows the list, "Tạo N" reflects visible-checked, and a
  checked row hidden by a filter is not created.
- Full suite + typecheck stay green.

## Out of scope

- Persisting the filter across opens (URL/localStorage).
- Title/free-text search or reqId filter.
- Any backend or `/api/scan-candidates` change.
- Reusing the board's `FilterBar` component (different axes; a small inline filter
  row in the modal is clearer than overloading that component).
