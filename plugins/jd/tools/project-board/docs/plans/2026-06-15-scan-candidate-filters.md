# Scan-Candidate Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four client-side filters (Service / kind / priority / type) to the "Tạo task từ scan" modal, where "Tạo N mục" creates only checked-AND-visible candidates. Per spec `docs/specs/2026-06-15-scan-candidate-filters-design.md`.

**Architecture:** A pure `applyCandidateFilter` predicate in `ui/src/filters.ts` (testable), consumed by `BulkGenModal`, which keeps original row indices so inline edits/checkboxes still target the right row and create operates on the visible-checked subset.

**Tech Stack:** React 19 + Vite + Tailwind 4 `@theme` tokens (Aurora). vitest. TS NodeNext ESM (`.js` import suffixes). Frontend-only — no backend change.

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `scan-filters` (already created). Tool dir `plugins/jd/tools/project-board` — run npx/npm there.

---

### Task 1: Pure candidate-filter predicate (TDD)

**Files:** Modify `ui/src/filters.ts`; Test: `ui/src/filters.test.ts`.

Context: `filters.ts` already exports the board filter (`BoardFilter`/`applyFilters`/`isShaped`/`EMPTY_FILTER`) and imports `Priority` (and now also needs nothing new beyond it). `Candidate` (ui/src/types.ts) is `{ kind: 'implement'|'test'; type: 'task'|'bug'; component: string; reqId: string; title: string; priority: Priority; body: string }`.

- [ ] **Step 1: Write the failing test** — append to `ui/src/filters.test.ts`:
```ts
import {
  applyCandidateFilter, isCandidateFilterActive, EMPTY_CANDIDATE_FILTER,
} from './filters.js'

describe('candidate filters', () => {
  type C = { component: string; kind: 'implement' | 'test'; priority: 'P0' | 'P1' | 'P2' | 'P3'; type: 'task' | 'bug' }
  const rows: C[] = [
    { component: 'cafe-service', kind: 'implement', priority: 'P1', type: 'task' },
    { component: 'idc-backend', kind: 'test', priority: 'P2', type: 'task' },
    { component: 'cafe-service', kind: 'test', priority: 'P0', type: 'bug' },
  ]

  it('isCandidateFilterActive is false only for the empty filter', () => {
    expect(isCandidateFilterActive(EMPTY_CANDIDATE_FILTER)).toBe(false)
    expect(isCandidateFilterActive({ ...EMPTY_CANDIDATE_FILTER, kind: 'test' })).toBe(true)
    expect(isCandidateFilterActive({ ...EMPTY_CANDIDATE_FILTER, component: 'idc-backend' })).toBe(true)
  })

  it('empty filter returns all rows', () => {
    expect(applyCandidateFilter(rows, EMPTY_CANDIDATE_FILTER)).toHaveLength(3)
  })

  it('filters by component, kind, priority, type and AND-composes', () => {
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, component: 'cafe-service' })).toHaveLength(2)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, kind: 'test' })).toHaveLength(2)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, priority: 'P0' })).toHaveLength(1)
    expect(applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, type: 'bug' })).toHaveLength(1)
    // AND: cafe-service + test → only the P0 bug row
    const both = applyCandidateFilter(rows, { ...EMPTY_CANDIDATE_FILTER, component: 'cafe-service', kind: 'test' })
    expect(both).toHaveLength(1)
    expect(both[0].priority).toBe('P0')
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd plugins/jd/tools/project-board && npx vitest run ui/src/filters.test.ts`. Expected: FAIL (exports not found).

- [ ] **Step 3: Implement** — append to `ui/src/filters.ts` (keep the existing board-filter exports untouched; `Priority` is already imported at the top):
```ts
export interface CandidateFilter {
  component: string // 'all' or a component name
  kind: 'all' | 'implement' | 'test'
  priority: 'all' | Priority
  type: 'all' | 'task' | 'bug'
}

export const EMPTY_CANDIDATE_FILTER: CandidateFilter =
  Object.freeze({ component: 'all', kind: 'all', priority: 'all', type: 'all' })

type CandidateFilterable = { component: string; kind: 'implement' | 'test'; priority: Priority; type: 'task' | 'bug' }

export function isCandidateFilterActive(f: CandidateFilter): boolean {
  return f.component !== 'all' || f.kind !== 'all' || f.priority !== 'all' || f.type !== 'all'
}

export function applyCandidateFilter<T extends CandidateFilterable>(rows: T[], f: CandidateFilter): T[] {
  return rows.filter((r) => {
    if (f.component !== 'all' && r.component !== f.component) return false
    if (f.kind !== 'all' && r.kind !== f.kind) return false
    if (f.priority !== 'all' && r.priority !== f.priority) return false
    if (f.type !== 'all' && r.type !== f.type) return false
    return true
  })
}
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run ui/src/filters.test.ts` PASS; `npm run typecheck` clean.

- [ ] **Step 5: Commit.**
```bash
git add ui/src/filters.ts ui/src/filters.test.ts
git commit -m "feat(board-ui): applyCandidateFilter predicate (component/kind/priority/type)"
```

---

### Task 2: Filters + visible-checked create in BulkGenModal

**Files:** Modify `ui/src/components/BulkGenModal.tsx`.

Context — current `BulkGenModal.tsx` shape (read it fully first):
- `type Row = Candidate & { checked: boolean }`; `const [rows, setRows] = useState<Row[] | null>(null)`.
- `const checked = rows?.filter((r) => r.checked) ?? []` — currently ALL checked.
- `patch(i, p)` updates `rows[i]`; the list does `rows.map((r, i) => ( <div key={i}> … patch(i, …) … </div> ))`.
- `create()` submits `checked.map(...)` to `api.bulkCreate`.
- Create button: `disabled={busy || checked.length === 0}` label `Tạo {checked.length} mục`.

Make these edits:

- [ ] **Step 1: Imports + filter state.** Add to the imports:
```ts
import { applyCandidateFilter, isCandidateFilterActive, EMPTY_CANDIDATE_FILTER, type CandidateFilter } from '../filters.js'
```
Add state next to the others:
```ts
  const [filter, setFilter] = useState<CandidateFilter>(EMPTY_CANDIDATE_FILTER)
```

- [ ] **Step 2: Derive visible rows (keeping original index) and visible-checked.** After `const checked = ...` (replace that line) compute index-preserving visibles:
```ts
  // Pair each row with its ORIGINAL index so patch()/checkbox still target the right row after filtering.
  const visible = (rows ?? []).map((r, i) => ({ r, i })).filter(({ r }) => applyCandidateFilter([r], filter).length === 1)
  const visibleChecked = visible.filter(({ r }) => r.checked)
```

- [ ] **Step 3: setCheckedForVisible helper.** Add near `patch`:
```ts
  function setCheckedForVisible(value: boolean) {
    const ids = new Set(visible.map(({ i }) => i))
    setRows((rs) => (rs ? rs.map((r, j) => (ids.has(j) ? { ...r, checked: value } : r)) : rs))
  }
```

- [ ] **Step 4: Filter row UI.** Distinct component list comes from `rows`. Insert this block immediately AFTER the `{error && ...}` line and BEFORE the `{rows === null && ...}` line, so it only shows when there are rows:
```tsx
        {rows && rows.length > 0 && (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {(() => {
              const sel = 'rounded-md border border-border bg-sunken px-2 py-1 text-xs text-text-primary'
              const components = [...new Set(rows.map((r) => r.component))].sort()
              return (
                <>
                  <select className={sel} value={filter.component} onChange={(e) => setFilter({ ...filter, component: e.target.value })}>
                    <option value="all">Service: tất cả</option>
                    {components.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <select className={sel} value={filter.kind} onChange={(e) => setFilter({ ...filter, kind: e.target.value as CandidateFilter['kind'] })}>
                    <option value="all">Loại scan: tất cả</option>
                    <option value="implement">implement</option>
                    <option value="test">test</option>
                  </select>
                  <select className={sel} value={filter.priority} onChange={(e) => setFilter({ ...filter, priority: e.target.value as CandidateFilter['priority'] })}>
                    <option value="all">Ưu tiên: tất cả</option>
                    <option value="P0">P0</option><option value="P1">P1</option><option value="P2">P2</option><option value="P3">P3</option>
                  </select>
                  <select className={sel} value={filter.type} onChange={(e) => setFilter({ ...filter, type: e.target.value as CandidateFilter['type'] })}>
                    <option value="all">Loại: tất cả</option>
                    <option value="task">task</option>
                    <option value="bug">bug</option>
                  </select>
                  {isCandidateFilterActive(filter) && (
                    <button onClick={() => setFilter(EMPTY_CANDIDATE_FILTER)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                      Xóa lọc
                    </button>
                  )}
                  <span className="ml-auto flex gap-2">
                    <button onClick={() => setCheckedForVisible(true)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                      Chọn tất cả (đang lọc)
                    </button>
                    <button onClick={() => setCheckedForVisible(false)}
                      className="rounded-md border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                      Bỏ chọn (đang lọc)
                    </button>
                  </span>
                </>
              )
            })()}
          </div>
        )}
```

- [ ] **Step 5: Render the visible rows (preserving index).** Replace the list block `{rows.map((r, i) => ( … ))}` with iteration over `visible`, using the original index `i` for `patch`/`key`:
```tsx
            {visible.map(({ r, i }) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-sunken px-2 py-1.5">
                <input type="checkbox" checked={r.checked} onChange={(e) => patch(i, { checked: e.target.checked })} />
                <span className="w-32 shrink-0 truncate font-mono text-[12px] text-text-muted" title={r.component}>{r.component}</span>
                <input value={r.title} onChange={(e) => patch(i, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-border bg-base px-2 py-1 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
                <select value={r.type} onChange={(e) => patch(i, { type: e.target.value as ItemType })}
                  className="rounded border border-border bg-base px-1 py-1 text-xs text-text-primary">
                  <option value="task">task</option>
                  <option value="bug">bug</option>
                </select>
                <select value={r.priority} onChange={(e) => patch(i, { priority: e.target.value as Priority })}
                  className="rounded border border-border bg-base px-1 py-1 text-xs text-text-primary">
                  <option>P0</option><option>P1</option><option>P2</option><option>P3</option>
                </select>
              </div>
            ))}
```
(`ItemType`/`Priority` are already imported in this file. Keep the surrounding `{rows && rows.length > 0 && ( <div className="flex-1 space-y-1 overflow-y-auto"> … </div> )}` wrapper as-is.)

- [ ] **Step 6: create() + button use visible-checked.** Change `create()` to submit `visibleChecked`:
```ts
  async function create() {
    if (visibleChecked.length === 0) return
    setBusy(true); setError('')
    try {
      const res = await api.bulkCreate(visibleChecked.map(({ r }) => ({ type: r.type, title: r.title, component: r.component, priority: r.priority, body: r.body, requiresShaping: r.kind === 'implement' })))
      if (res.rejected.length > 0) { setError(`${res.rejected.length} mục bị từ chối`); return }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }
```
Update the create button (replace the old `checked`-based disabled/label):
```tsx
          <button disabled={busy || visibleChecked.length === 0} onClick={() => void create()}
            className="mt-3 rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
            Tạo {visibleChecked.length} mục
          </button>
```
Delete the now-unused `const checked = rows?.filter((r) => r.checked) ?? []` line (replaced by `visibleChecked` in Step 2).

- [ ] **Step 7: Verify.** `npm run typecheck` clean; `npx vite build ui` ok; `npx vitest run` full suite green.

- [ ] **Step 8: grep-gate (tokens-only).** `grep -nE '#[0-9a-fA-F]{3,8}|\[rgba?\(|\[hsl' ui/src/components/BulkGenModal.tsx` — confirm NO NEW color literals (the file already contains the pre-existing `bg-[rgba(8,13,20,.7)]` backdrop and `text-[#e6fbff]` gradient-button classes; those are allowed/pre-existing — your additions must add none).

- [ ] **Step 9: Commit.**
```bash
git add ui/src/components/BulkGenModal.tsx
git commit -m "feat(board-ui): filters + visible-checked create in scan-candidate modal"
```

---

### Task 3: Deploy 0.31.2

- [ ] **Step 1: Final gates.** From the tool dir: `npm run typecheck && npx vite build ui && npx vitest run` all green; grep-gate clean.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` `0.31.1` → `0.31.2`; commit `chore(jd): bump plugin to 0.31.2 (scan-candidate filters)`. Then `git checkout main && git merge --no-ff scan-filters -m "Merge scan-filters: filters in scan-candidate modal" && git branch -d scan-filters && git push origin main`. (PAUSE before this step and let the owner inspect the diff first, per their standing preference.)
- [ ] **Step 3: Build + restart — ONLY when idle.** Confirm `/api/jobs` shows no running/queued job and no real `claude -p` job. Then `npm run build` from the tool dir; stop the running `node dist/server/src/index.js`; relaunch with the SAME env (`BOARD_HOST=0.0.0.0 BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400`) via nohup, appending to `/home/gamesync/source/gamesync/project-board/board.log`.
- [ ] **Step 4: Verify.** `curl -s http://127.0.0.1:4400/api/board >/dev/null` responds. Open the board → "Thêm task / bug" path that opens the scan modal (the bulk-gen entry) → confirm the four filter selects appear, narrowing the list updates "Tạo N mục", and "Chọn tất cả (đang lọc)" only affects visible rows.

---

## Self-review notes
- **Spec coverage:** pure predicate + 4 axes + AND + isActive + empty-returns-all (T1); modal filter row, index-preserving render, select-all/clear-visible, visible-checked create + label (T2); deploy + manual verify (T3).
- **Type consistency:** `CandidateFilter`/`EMPTY_CANDIDATE_FILTER`/`applyCandidateFilter`/`isCandidateFilterActive` defined in T1 (filters.ts), consumed with identical names in T2. `applyCandidateFilter` is generic over `{component,kind,priority,type}`, satisfied by `Row = Candidate & {checked}`. Create still calls `api.bulkCreate` with the same field mapping; only the input set changed (all-checked → visible-checked) and the iterand shape is now `{r,i}` (mapped via `({r}) => ...`).
- **Index-preservation:** T2 pairs `{r,i}` BEFORE filtering so `patch(i,…)`/checkbox target the original `rows` index — avoids the classic "filtered map index ≠ source index" bug.
- **YAGNI/out-of-scope honored:** no backend change, no persistence, no title search, board `FilterBar` not reused (separate axes).
