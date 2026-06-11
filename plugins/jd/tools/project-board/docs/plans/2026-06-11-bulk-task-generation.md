# Bulk Task Generation from Scan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** From the re-scan status files, deterministically generate candidate tasks for each gap (missing/partial/untested requirement), let the owner select in a modal, and bulk-create them — per spec `docs/specs/2026-06-11-bulk-task-generation-design.md`.

**Architecture:** A pure server module (`candidates.ts`) parses status docs + the requirement index and maps gap rows to candidates, then dedups against existing live items. Two routes (`GET /api/scan-candidates`, `POST /api/tasks/bulk`) and a `BulkGenModal` opened from the ComponentsPanel. No AI; tokens-only UI.

**Tech Stack:** existing Fastify/React/Aurora/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `bulk-gen`, tool dir `plugins/jd/tools/project-board`. Paths below are relative to the tool dir.

**Scope note (deviation from spec, intentional):** the spec's `reconcile` candidate (from the Drift "code with no requirement" lines) is DEFERRED. The Drift section is free prose the re-scan AI writes, not reliably parseable into clean path candidates. v1 generates only the row-structured candidates (implement/complete/test), which deliver the core value. Revisit reconcile if the re-scan prompt is later changed to emit structured drift. `Candidate.kind` is therefore `'implement' | 'test'` in v1.

---

## File structure

```
ui/src/types.ts                       # + Candidate interface
server/src/jobs/candidates.ts         # NEW: parseStatusDoc, buildCandidates, dedupeCandidates
server/src/candidates.test.ts         # NEW
server/src/api/routes.ts              # + GET /api/scan-candidates, POST /api/tasks/bulk
server/src/routes.test.ts             # + bulk/candidates route tests
ui/src/api.ts                         # + scanCandidates, bulkCreate
ui/src/components/BulkGenModal.tsx    # NEW
ui/src/components/ComponentsPanel.tsx # + "Tạo task từ scan" button + modal
```

---

### Task 1: Candidate generation module (TDD)

**Files:**
- Modify: `ui/src/types.ts`
- Create: `server/src/jobs/candidates.ts`, `server/src/candidates.test.ts`

- [ ] **Step 1: Branch + Candidate type.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b bulk-gen`. Then add to `ui/src/types.ts`:

```ts
export interface Candidate {
  kind: 'implement' | 'test'
  type: ItemType
  component: string
  reqId: string
  title: string
  priority: Priority
  body: string
}
```

- [ ] **Step 2: Failing tests** `server/src/candidates.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from './jobs/candidates.js'
import type { Requirement } from './jobs/requirements.js'
import type { BoardItem } from '../ui/src/types.js'

const STATUS = `---
component: cafe-service
last_scanned: 2026-06-11
built: 71
tested: 82
---

| Req | State | Tested | Note |
|-----|-------|--------|------|
| CAFE-R3 | done | yes | fine |
| CAFE-R4 | partial | no | signature verify missing |
| CAFE-R9 | done | no | only unit-mapped |
| CAFE-R10 | missing | no | not implemented |

## Drift
- code with no referencing requirement: internal/enrich
`

const REQS = new Map<string, Requirement>([
  ['CAFE-R4', { id: 'CAFE-R4', title: 'Manifest v2 + delta', statement: 'Parses manifest v2.', acceptance: ['delta fetches only changed chunks', 'signature verified'] }],
  ['CAFE-R9', { id: 'CAFE-R9', title: 'gRPC WatchUpdates', statement: 'Server-streams events.', acceptance: ['client gets game-changed event'] }],
  ['CAFE-R10', { id: 'CAFE-R10', title: 'gRPC GetTheme', statement: 'Serves theme.', acceptance: ['theme < 1s'] }],
])

describe('parseStatusDoc', () => {
  it('reads component and rows', () => {
    const doc = parseStatusDoc(STATUS)
    expect(doc.component).toBe('cafe-service')
    expect(doc.rows).toHaveLength(4)
    expect(doc.rows[1]).toEqual({ id: 'CAFE-R4', state: 'partial', tested: false, note: 'signature verify missing' })
    expect(doc.rows[2].tested).toBe(false)
  })
})

describe('buildCandidates', () => {
  const cands = buildCandidates(REQS, [parseStatusDoc(STATUS)])
  it('missing -> implement P1, no separate test candidate', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R10')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'implement', type: 'task', priority: 'P1', component: 'cafe-service' })
    expect(c[0].title).toBe('Implement CAFE-R10: gRPC GetTheme')
    expect(c[0].body).toContain('Req: CAFE-R10')
    expect(c[0].body).toContain('theme < 1s')
  })
  it('partial -> complete P2 AND a test candidate (untested)', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R4')
    expect(c.map((x) => x.kind).sort()).toEqual(['implement', 'test'])
    expect(c.find((x) => x.kind === 'implement')!.title).toBe('Complete CAFE-R4: Manifest v2 + delta')
    expect(c.find((x) => x.kind === 'implement')!.priority).toBe('P2')
  })
  it('done+untested -> test candidate only', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R9')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'test', priority: 'P2' })
    expect(c[0].title).toBe('Add tests for CAFE-R9: gRPC WatchUpdates')
  })
  it('done+tested -> nothing', () => {
    expect(cands.filter((x) => x.reqId === 'CAFE-R3')).toHaveLength(0)
  })
})

describe('dedupeCandidates', () => {
  const cands = buildCandidates(REQS, [parseStatusDoc(STATUS)])
  it('suppresses a candidate already covered by a live item of the same kind', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Implement CAFE-R10: gRPC GetTheme', status: 'ready',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'do it\nReq: CAFE-R10',
    }]
    const out = dedupeCandidates(cands, existing)
    expect(out.find((c) => c.reqId === 'CAFE-R10' && c.kind === 'implement')).toBeUndefined()
    // a test candidate for a different req is still present
    expect(out.find((c) => c.reqId === 'CAFE-R9' && c.kind === 'test')).toBeDefined()
  })
  it('a done item does NOT suppress (gap regressed)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Implement CAFE-R10: gRPC GetTheme', status: 'done',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'Req: CAFE-R10',
    }]
    expect(dedupeCandidates(cands, existing).find((c) => c.reqId === 'CAFE-R10')).toBeDefined()
  })
})
```

- [ ] **Step 3:** Run `cd plugins/jd/tools/project-board && npx vitest run server/src/candidates.test.ts` — FAIL (module missing).

- [ ] **Step 4: Implement** `server/src/jobs/candidates.ts`:

```ts
import type { Requirement } from './requirements.js'
import type { BoardItem, Candidate, Priority } from '../../ui/src/types.js'

export interface StatusRow {
  id: string
  state: 'done' | 'partial' | 'missing'
  tested: boolean
  note: string
}
export interface StatusDoc {
  component: string
  rows: StatusRow[]
}

const STATUS_ROW = /^\|\s*([A-Z]{2,6}-R\d+)\s*\|\s*(done|partial|missing)\s*\|\s*(yes|no)\s*\|\s*(.*?)\s*\|\s*$/

export function parseStatusDoc(markdown: string): StatusDoc {
  const component = markdown.match(/^component:\s*(.+)$/m)?.[1]?.trim() ?? ''
  const rows: StatusRow[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(STATUS_ROW)
    if (m) rows.push({ id: m[1], state: m[2] as StatusRow['state'], tested: m[3] === 'yes', note: m[4].trim() })
  }
  return { component, rows }
}

function body(req: Requirement | undefined, reqId: string, lead: string): string {
  const lines = [lead]
  if (req?.statement) lines.push('', req.statement)
  if (req && req.acceptance.length > 0) {
    lines.push('', 'Acceptance:')
    for (const ac of req.acceptance) lines.push(`- ${ac}`)
  }
  lines.push('', `Req: ${reqId}`)
  return lines.join('\n')
}

export function buildCandidates(reqIndex: Map<string, Requirement>, docs: StatusDoc[]): Candidate[] {
  const out: Candidate[] = []
  for (const doc of docs) {
    for (const row of doc.rows) {
      const req = reqIndex.get(row.id)
      const title = req?.title ?? row.id
      if (row.state === 'missing') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P1',
          title: `Implement ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is missing. ${row.note}`.trim()) })
      } else if (row.state === 'partial') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Complete ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is partial. ${row.note}`.trim()) })
      }
      if (row.state !== 'missing' && !row.tested) {
        out.push({ kind: 'test', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Add tests for ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is untested. ${row.note}`.trim()) })
      }
    }
  }
  return out
}

function itemKind(item: BoardItem): 'implement' | 'test' | null {
  if (item.title.startsWith('Add tests')) return 'test'
  if (item.title.startsWith('Implement ') || item.title.startsWith('Complete ')) return 'implement'
  return null
}

export function dedupeCandidates(candidates: Candidate[], existing: BoardItem[]): Candidate[] {
  const live = existing.filter((i) => i.status !== 'done')
  return candidates.filter((c) =>
    !live.some((i) => itemKind(i) === c.kind && i.body.includes(`Req: ${c.reqId}`)))
}
```

(Note: `Priority` is imported for type-completeness of the Candidate shape; if tsc flags it as unused, drop it from the import — `Candidate` already carries the type.)

- [ ] **Step 5:** Run tests — PASS (7). Full `npx vitest run` (was 135; +7) + `npm run typecheck` clean.

- [ ] **Step 6: Commit.**

```bash
git add ui/src/types.ts server/src/jobs/candidates.ts server/src/candidates.test.ts
git commit -m "feat(board): scan-to-candidate generation (parse status, map gaps, dedup)"
```

---

### Task 2: Routes — scan-candidates + bulk-create (TDD)

**Files:**
- Modify: `server/src/api/routes.ts`
- Modify: `server/src/routes.test.ts`

- [ ] **Step 1: Failing tests** — append to `server/src/routes.test.ts`. The `makeDeps()` config `repoRoot` points at the tmp dataDir (which has no `docs/requirements`), and the tmp `statusDir` is empty, so candidates default to empty; the bulk test exercises creation directly:

```ts
describe('bulk + candidates', () => {
  it('returns an empty candidate list when no status files exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scan-candidates', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().candidates).toEqual([])
  })

  it('bulk-creates valid items and reports rejects', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: {
      items: [
        { type: 'task', title: 'Implement CAFE-R10', component: 'cafe-service', priority: 'P1', body: 'do it\nReq: CAFE-R10' },
        { type: 'task', title: 'Add tests for CAFE-R9', component: 'cafe-service', priority: 'P2', body: 'tests\nReq: CAFE-R9' },
        { type: 'task', title: '', component: 'x', body: '' }, // invalid
      ],
    }})
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.created).toHaveLength(2)
    expect(j.rejected).toHaveLength(1)
    expect(j.rejected[0].index).toBe(2)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items).toHaveLength(2)
  })

  it('400s an empty bulk payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: { items: [] } })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2:** Run `npx vitest run server/src/routes.test.ts` — new tests FAIL (404/missing routes).

- [ ] **Step 3: Implement.** In `server/src/api/routes.ts`: add `readdirSync` to the `node:fs` import (it already imports `existsSync, readFileSync`; make it `import { existsSync, readFileSync, readdirSync } from 'node:fs'`), and add these imports:

```ts
import { parseRequirementsDir } from '../jobs/requirements.js'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from '../jobs/candidates.js'
import type { ItemType, Priority } from '../../../ui/src/types.js'
```

Append inside `registerRoutes`:

```ts
  app.get('/api/scan-candidates', () => {
    const docs = []
    for (const f of readdirSync(store.statusDir).filter((f) => f.endsWith('.md'))) {
      try { docs.push(parseStatusDoc(readFileSync(path.join(store.statusDir, f), 'utf8'))) } catch { /* skip unparseable */ }
    }
    const reqIndex = parseRequirementsDir(deps.config.repoRoot)
    return { candidates: dedupeCandidates(buildCandidates(reqIndex, docs), store.scan().items) }
  })

  app.post<{ Body: { items?: { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string }[] } }>(
    '/api/tasks/bulk', (req, reply) => {
      const items = req.body?.items
      if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'items required' })
      const created: string[] = []
      const rejected: { index: number; error: string }[] = []
      items.forEach((it, index) => {
        if (!it?.type || !['task', 'bug'].includes(it.type) || !it.title?.trim() || !it.component?.trim() || !it.body?.trim()) {
          rejected.push({ index, error: 'type, title, component and body are required' })
          return
        }
        created.push(store.createItem({ type: it.type, title: it.title.trim(), component: it.component.trim(), priority: it.priority, body: it.body }).id)
      })
      if (created.length > 0) hub.broadcast({ type: 'board_update' })
      return { created, rejected }
    })
```

(`store`, `hub`, `deps` are already destructured/available at the top of `registerRoutes` as in the existing routes; `path` is already imported.)

- [ ] **Step 4:** Full `npx vitest run` (was 142; +3) + `npm run typecheck` clean.

- [ ] **Step 5: Commit.**

```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): scan-candidates and bulk-create task routes"
```

---

### Task 3: UI — api + BulkGenModal + ComponentsPanel button

**Files:**
- Modify: `ui/src/api.ts`, `ui/src/components/ComponentsPanel.tsx`
- Create: `ui/src/components/BulkGenModal.tsx`

- [ ] **Step 1: api.** In `ui/src/api.ts` add `Candidate` to the type import from `./types.js` and add to the `api` object:

```ts
  scanCandidates: () => request<{ candidates: Candidate[] }>('/api/scan-candidates'),
  bulkCreate: (items: { type: string; title: string; component: string; priority: string; body: string }[]) =>
    request<{ created: string[]; rejected: { index: number; error: string }[] }>('/api/tasks/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
```

- [ ] **Step 2: BulkGenModal.** Create `ui/src/components/BulkGenModal.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { Candidate, ItemType, Priority } from '../types.js'

type Row = Candidate & { checked: boolean }

export function BulkGenModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.scanCandidates()
      .then((r) => { if (!cancelled) setRows(r.candidates.map((c) => ({ ...c, checked: c.kind === 'implement' }))) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  const checked = rows?.filter((r) => r.checked) ?? []

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...p } : r)) : rs))
  }

  async function create() {
    if (checked.length === 0) return
    setBusy(true); setError('')
    try {
      const res = await api.bulkCreate(checked.map((r) => ({ type: r.type, title: r.title, component: r.component, priority: r.priority, body: r.body })))
      if (res.rejected.length > 0) { setError(`${res.rejected.length} mục bị từ chối`); return }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-[46rem] flex-col rounded-xl border border-border-strong bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Tạo task từ scan</h2>
          <button onClick={onClose} className="text-text-muted transition-colors duration-150 hover:text-text-primary">✕</button>
        </div>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {rows === null && <p className="text-sm text-text-muted">Đang đọc kết quả scan…</p>}
        {rows && rows.length === 0 && (
          <p className="text-sm text-text-muted">Không có gap nào cần tạo task — scan sạch hoặc đã có task. Chạy Re-scan trước nếu cần.</p>
        )}
        {rows && rows.length > 0 && (
          <div className="flex-1 space-y-1 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-sunken px-2 py-1.5">
                <input type="checkbox" checked={r.checked} onChange={(e) => patch(i, { checked: e.target.checked })} />
                <span className="w-32 shrink-0 truncate font-mono text-[10px] text-text-muted" title={r.component}>{r.component}</span>
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
          </div>
        )}
        {rows && rows.length > 0 && (
          <button disabled={busy || checked.length === 0} onClick={() => void create()}
            className="mt-3 rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
            Tạo {checked.length} mục
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: ComponentsPanel button.** In `ui/src/components/ComponentsPanel.tsx`: import the modal (`import { BulkGenModal } from './BulkGenModal.js'`), add `const [bulkOpen, setBulkOpen] = useState(false)` (useState is already imported), add a button next to the Re-scan button in the header, and render the modal. The header currently has the title + Re-scan button — change the buttons area to include both:

```tsx
        <div className="flex gap-1">
          <button onClick={() => setBulkOpen(true)}
            className="rounded bg-raised px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:brightness-110">＋ Task từ scan</button>
          <button disabled={busy} onClick={() => void rescan()}
            className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-50">↻ Re-scan</button>
        </div>
```

IMPORTANT: the existing Re-scan button may use a raw palette class (`bg-zinc-800`) — if so, the grep-gate will already be failing pre-change OR it was already tokenized. Match whatever the CURRENT Re-scan button uses for its classes (read the file); do NOT introduce a new `zinc-*` class. Use the existing token-based secondary recipe (`bg-raised`/`border-border`/`text-text-secondary`) for the new button. Then add at the end of the returned JSX (before the closing `</aside>`):

```tsx
      {bulkOpen && <BulkGenModal onClose={() => setBulkOpen(false)} />}
```

- [ ] **Step 4:** `npm run typecheck && npx vite build ui && npx vitest run` (145) + grep-gate (`grep -rnE '(zinc|cyan|red|green|orange|rose|amber)-[0-9]' ui/src || echo GREP-CLEAN`). If the grep-gate flags the pre-existing Re-scan `bg-zinc-800`, tokenize that button too (`bg-raised hover:brightness-110`) as part of this task and re-run.

- [ ] **Step 5: Commit.**

```bash
git add ui/src/api.ts ui/src/components/BulkGenModal.tsx ui/src/components/ComponentsPanel.tsx
git commit -m "feat(board-ui): bulk task generation modal from scan"
```

---

### Task 4: deploy + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` (report count) + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.18.0`; commit `chore(jd): bump plugin to 0.18.0 (bulk task generation)`. Then `git checkout main && git merge --no-ff bulk-gen && git branch -d bulk-gen && git push origin main`.

- [ ] **Step 3: Build dist + restart board.** `npm run build`; kill the :4400 process and restart open per the project-board skill (`BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 node dist/server/src/index.js`).

- [ ] **Step 4: Prove (deterministic, no AI).** With the gamesync board running (it has real status files from the last re-scan + real requirement docs):
  - `curl -s http://127.0.0.1:4400/api/scan-candidates | python3 -c "import json,sys; c=json.load(sys.stdin)['candidates']; print(len(c),'candidates'); [print(x['kind'], x['priority'], x['title']) for x in c[:8]]"` — confirm it returns implement candidates for the missing RPCs (CAFE-R10/R11/R12) and test candidates for the untested requirements (admin-web/downloader rows, etc.), each with a `Req: <ID>` body.
  - Optionally POST a 1-item bulk to confirm creation, then delete it.
  - Report the candidate count + a sample to the owner.

---

## Self-review notes

- Spec coverage: deterministic candidate generation from status + requirement docs (T1), dedup by Req+kind against live items (T1), `GET /api/scan-candidates` + `POST /api/tasks/bulk` with partial-reject (T2), Candidate type (T1), select-then-create modal + ComponentsPanel button + empty state (T3), backlog landing (store.createItem default status), deploy/prove (T4).
- **Conscious deviation:** the spec's `reconcile` candidate (from Drift prose) is deferred — Drift is unstructured AI prose, not reliably parseable; `Candidate.kind` is `'implement' | 'test'` in v1. The implement/complete/test candidates from the structured status rows deliver the core value. Flag to the owner.
- Type consistency: `Candidate {kind, type, component, reqId, title, priority, body}` defined in `ui/src/types.ts` (T1), consumed by candidates.ts, routes, api.ts, BulkGenModal. `parseStatusDoc`/`buildCandidates`/`dedupeCandidates` names consistent across T1↔T2. `store.statusDir`, `deps.config.repoRoot`, `store.scan().items`, `store.createItem` all exist today.
- Dedup honors the mandatory-description rule (every candidate body is non-blank, ends with `Req: <ID>`); bulk-create reuses the same per-item validation as single create.
