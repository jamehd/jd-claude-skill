# Brainstorm Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gate the `→ ready` transition so a non-trivial task cannot be auto-dispatched until a plan is attached, while trivial tasks flow freely — per spec `docs/specs/2026-06-12-brainstorm-gate-design.md`.

**Architecture:** Two new task frontmatter fields (`requiresShaping`, `plan`). The server blocks `→ ready` when `requiresShaping && !plan`. Bulk-gen defaults `requiresShaping` by candidate kind. Brainstorm stays in the terminal: a route assembles a kickoff prompt; the attached plan is injected into the dispatch prompt. UI adds a badge, a drag guard, a toggle, a Brainstorm (copy-prompt) button, and a plan field.

**Tech Stack:** existing Fastify/React 19/Tailwind 4 (Aurora tokens)/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `brainstorm-gate`, tool dir `plugins/jd/tools/project-board`. Paths below are relative to the tool dir.

---

## File structure

```
ui/src/types.ts                       # BoardItem += requiresShaping, plan
server/src/markdown.ts                 # known-keys + parse requiresShaping/plan
server/src/store.ts                    # CreateItemInput += requiresShaping; createItem sets it
server/src/markdown.test.ts            # round-trip tests
server/src/api/routes.ts               # gate on →ready, patch whitelist, bulk default, brainstorm-prompt route
server/src/routes.test.ts              # gate + bulk-default + route tests
server/src/jobs/prompt.ts              # buildBrainstormPrompt + plan injection in buildTaskPrompt
server/src/jobs/runner.ts              # pass repoRoot to buildTaskPrompt
server/src/prompt.test.ts              # prompt tests (create if absent)
ui/src/api.ts                          # patchTask type, getBrainstormPrompt, bulkCreate += requiresShaping
ui/src/components/Kanban.tsx           # badge + drag guard
ui/src/components/TaskDrawer.tsx       # toggle, Brainstorm button, plan field
ui/src/components/BulkGenModal.tsx     # map candidate.kind → requiresShaping
ui/src/index.css                       # --color-shape token
DESIGN_SYSTEM.md                       # document the badge + token
```

---

### Task 1: Data model + persistence (TDD)

**Files:** Modify `ui/src/types.ts`, `server/src/markdown.ts`, `server/src/store.ts`; Test: `server/src/markdown.test.ts`.

- [ ] **Step 1: Branch + types.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b brainstorm-gate`. In `ui/src/types.ts`, add two optional fields to `BoardItem`, right after `pr?: string`:

```ts
  pr?: string
  requiresShaping?: boolean
  plan?: string
```

- [ ] **Step 2: Failing tests** — append to `server/src/markdown.test.ts` (read the file first to match its import style and the existing `parseItem`/`serializeItem` test pattern):

```ts
describe('shaping fields', () => {
  const base = [
    '---', 'id: TASK-001', 'type: task', 'title: A task', 'status: backlog',
    'priority: P2', 'component: infra', 'created: 2026-06-12', 'updated: 2026-06-12',
  ]

  it('parses requiresShaping and plan when present', () => {
    const raw = [...base, 'requiresShaping: true', 'plan: docs/plans/x.md', '---', '', 'body'].join('\n')
    const item = parseItem(raw)
    expect(item.requiresShaping).toBe(true)
    expect(item.plan).toBe('docs/plans/x.md')
  })

  it('omits them when absent (backward compatible)', () => {
    const raw = [...base, '---', '', 'body'].join('\n')
    const item = parseItem(raw)
    expect(item.requiresShaping).toBeUndefined()
    expect(item.plan).toBeUndefined()
  })

  it('does not sweep requiresShaping/plan into extra', () => {
    const raw = [...base, 'requiresShaping: true', 'plan: inline plan text', '---', '', 'body'].join('\n')
    const item = parseItem(raw)
    expect(item.extra).toBeUndefined()
  })

  it('round-trips requiresShaping and plan', () => {
    const raw = [...base, 'requiresShaping: true', 'plan: docs/plans/x.md', '---', '', 'body'].join('\n')
    const again = parseItem(serializeItem(parseItem(raw)))
    expect(again.requiresShaping).toBe(true)
    expect(again.plan).toBe('docs/plans/x.md')
  })
})
```

- [ ] **Step 3:** Run `cd plugins/jd/tools/project-board && npx vitest run server/src/markdown.test.ts` — FAIL (fields not parsed; possibly swept into `extra`).

- [ ] **Step 4: Implement in `server/src/markdown.ts`.** Add the two keys to `KNOWN_KEYS`:

```ts
const KNOWN_KEYS = new Set(['id', 'type', 'title', 'status', 'priority', 'component', 'created', 'updated', 'job', 'pr', 'requiresShaping', 'plan'])
```

In `parseItem`, after the existing `if (data.pr) item.pr = String(data.pr)` line, add (truthy-guarded, mirroring `job`/`pr` so falsy/empty values stay absent):

```ts
  if (data.requiresShaping) item.requiresShaping = true
  if (data.plan) item.plan = String(data.plan)
```

`serializeItem` needs no change — it spreads known fields, so `requiresShaping`/`plan` serialize only when set on the item.

- [ ] **Step 5: Implement in `server/src/store.ts`.** Add `requiresShaping` to `CreateItemInput`:

```ts
export interface CreateItemInput {
  type: ItemType
  title: string
  component: string
  priority?: Priority
  body?: string
  requiresShaping?: boolean
}
```

In `createItem`, after the `item` object is built and before `writeFileSync(...)`, add:

```ts
    if (input.requiresShaping) item.requiresShaping = true
```

(`updateItem` already accepts `Partial<Omit<BoardItem,'id'|'created'>>`, which covers `requiresShaping`/`plan` — no change needed.)

- [ ] **Step 6: store test** — append to `server/src/store.test.ts` (read it first for the `setup()`/tmpdir harness):

```ts
it('createItem defaults requiresShaping off; honors the flag', () => {
  const { store } = setup()
  const a = store.createItem({ type: 'task', title: 'plain', component: 'infra' })
  expect(a.requiresShaping).toBeUndefined()
  const b = store.createItem({ type: 'task', title: 'gated', component: 'infra', requiresShaping: true })
  expect(b.requiresShaping).toBe(true)
  expect(store.getItem(b.id)?.requiresShaping).toBe(true)
})
```

(If the store tests live inside another file or the harness differs, adapt to the real harness — keep the assertion intent.)

- [ ] **Step 7:** `npx vitest run` (full suite green) + `npm run typecheck` clean.

- [ ] **Step 8: Commit.**

```bash
git add plugins/jd/tools/project-board/ui/src/types.ts plugins/jd/tools/project-board/server/src/markdown.ts plugins/jd/tools/project-board/server/src/store.ts plugins/jd/tools/project-board/server/src/markdown.test.ts plugins/jd/tools/project-board/server/src/store.test.ts
git commit -m "feat(board): requiresShaping + plan task fields"
```

---

### Task 2: Gate on →ready + bulk defaults (TDD)

**Files:** Modify `server/src/api/routes.ts`; Test: `server/src/routes.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/routes.test.ts` (match its harness: how `app`, `cookie`, and a created task are obtained; create tasks via the POST route or the store the harness exposes):

```ts
describe('shaping gate', () => {
  async function makeTask(extra: Record<string, unknown> = {}) {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'gated', component: 'infra', body: 'do it' } })
    const id = res.json().id
    if (Object.keys(extra).length) {
      await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: extra })
    }
    return id
  }

  it('blocks →ready when requiresShaping and no plan', async () => {
    const id = await makeTask({ requiresShaping: true })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/brainstorm|plan/i)
  })

  it('allows →ready once a plan is attached', async () => {
    const id = await makeTask({ requiresShaping: true })
    await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { plan: 'docs/plans/x.md' } })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ready')
  })

  it('allows →ready freely when not requiresShaping', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(200)
  })

  it('allows setting requiresShaping and plan together with →ready', async () => {
    const id = await makeTask({ requiresShaping: true })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { plan: 'p', status: 'ready' } })
    expect(res.statusCode).toBe(200)
  })

  it('rejects a non-boolean requiresShaping', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { requiresShaping: 'yes' } })
    expect(res.statusCode).toBe(400)
  })

  it('bulk-create defaults requiresShaping from the per-item flag', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: { items: [
      { type: 'task', title: 'impl', component: 'infra', priority: 'P1', body: 'b', requiresShaping: true },
      { type: 'task', title: 'test', component: 'infra', priority: 'P2', body: 'b' },
    ] } })
    expect(res.statusCode).toBe(200)
    const ids = res.json().created
    // read them back via the board
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    const items = board.json().items as { id: string; requiresShaping?: boolean }[]
    const impl = items.find((i) => i.id === ids[0])
    const test = items.find((i) => i.id === ids[1])
    expect(impl?.requiresShaping).toBe(true)
    expect(test?.requiresShaping).toBeUndefined()
  })
})
```

- [ ] **Step 2:** Run — FAIL (gate + bulk flag not implemented; non-boolean accepted).

- [ ] **Step 3: Implement the patch whitelist + validation + gate** in `server/src/api/routes.ts`.

Add the two fields to `PatchBody` and `PATCH_WHITELIST`:

```ts
interface PatchBody { title?: string; status?: ItemStatus; priority?: Priority; component?: string; body?: string; requiresShaping?: boolean; plan?: string }
```
```ts
const PATCH_WHITELIST = ['title', 'status', 'priority', 'component', 'body', 'requiresShaping', 'plan'] as const
```

In the PATCH handler, change the existence check to keep the current item, and add validation + the gate. Replace:

```ts
    if (!store.getItem(req.params.id)) return reply.code(404).send({ error: 'not found' })
```
with:
```ts
    const current = store.getItem(req.params.id)
    if (!current) return reply.code(404).send({ error: 'not found' })
```

After the existing priority validation block (just before `const item = store.updateItem(...)`), add:

```ts
    if (patch.requiresShaping !== undefined && typeof patch.requiresShaping !== 'boolean') {
      return reply.code(400).send({ error: 'requiresShaping must be a boolean' })
    }
    if (patch.plan !== undefined && typeof patch.plan !== 'string') {
      return reply.code(400).send({ error: 'plan must be a string' })
    }
    if (patch.status === 'ready') {
      const requiresShaping = 'requiresShaping' in patch ? Boolean(patch.requiresShaping) : Boolean(current.requiresShaping)
      const planRaw = 'plan' in patch ? patch.plan : current.plan
      const plan = typeof planRaw === 'string' ? planRaw.trim() : ''
      if (requiresShaping && !plan) {
        return reply.code(409).send({ error: 'Task cần brainstorm + đính plan trước khi sang Ready' })
      }
    }
```

- [ ] **Step 4: Bulk default by per-item flag.** In the `/api/tasks/bulk` route, widen the item type and pass the flag through. Change the route's `Body` generic item shape to include `requiresShaping?: boolean`, and the `store.createItem(...)` call to:

```ts
        created.push(store.createItem({ type: it.type, title: it.title.trim(), component: it.component.trim(), priority: it.priority, body: it.body, requiresShaping: it.requiresShaping === true }).id)
```

(The full generic becomes `Body: { items?: { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string; requiresShaping?: boolean }[] }`.)

- [ ] **Step 5:** `npx vitest run` (full suite) + `npm run typecheck` green.

- [ ] **Step 6: Commit.**

```bash
git add plugins/jd/tools/project-board/server/src/api/routes.ts plugins/jd/tools/project-board/server/src/routes.test.ts
git commit -m "feat(board): hard gate on →ready until shaped; bulk requiresShaping default"
```

---

### Task 3: Brainstorm prompt + plan injection (TDD)

**Files:** Modify `server/src/jobs/prompt.ts`, `server/src/api/routes.ts`, `server/src/jobs/runner.ts`; Test: `server/src/prompt.test.ts` (create if it does not exist).

- [ ] **Step 1: Failing tests** — in `server/src/prompt.test.ts` (create the file if absent; import from `./jobs/prompt.js`):

```ts
import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildTaskPrompt, buildBrainstormPrompt } from './jobs/prompt.js'
import type { BoardItem } from '../../ui/src/types.js'

function item(extra: Partial<BoardItem> = {}): BoardItem {
  return { id: 'TASK-001', type: 'task', title: 'Do X', status: 'ready', priority: 'P2',
    component: 'infra', created: '2026-06-12', updated: '2026-06-12', body: 'Build the thing.\n', ...extra }
}

describe('buildBrainstormPrompt', () => {
  it('includes the title, body, and brainstorm/plan instructions', () => {
    const p = buildBrainstormPrompt(item())
    expect(p).toContain('Do X')
    expect(p).toContain('Build the thing.')
    expect(p).toMatch(/brainstorm/i)
    expect(p).toMatch(/docs\/plans/)
  })
})

describe('buildTaskPrompt plan injection', () => {
  it('injects inline plan text', () => {
    const p = buildTaskPrompt(item({ plan: 'Step 1. do it' }))
    expect(p).toContain('APPROVED PLAN')
    expect(p).toContain('Step 1. do it')
  })

  it('reads a plan file when plan is an existing repo path', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bg-'))
    mkdirSync(path.join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(path.join(root, 'docs/plans/p.md'), '# The Plan\nDetailed steps here.')
    const p = buildTaskPrompt(item({ plan: 'docs/plans/p.md' }), undefined, root)
    expect(p).toContain('Detailed steps here.')
    expect(p).not.toContain('docs/plans/p.md\n--- END') // file content was injected, not the path
  })

  it('treats a non-existent .md path as inline text (non-fatal)', () => {
    const p = buildTaskPrompt(item({ plan: 'docs/plans/missing.md' }), undefined, '/nonexistent-root')
    expect(p).toContain('docs/plans/missing.md')
    expect(p).toContain('APPROVED PLAN')
  })

  it('omits the plan block when no plan', () => {
    expect(buildTaskPrompt(item())).not.toContain('APPROVED PLAN')
  })
})
```

- [ ] **Step 2:** Run `npx vitest run server/src/prompt.test.ts` — FAIL (`buildBrainstormPrompt` missing; no plan injection; signature lacks `repoRoot`).

- [ ] **Step 3: Implement in `server/src/jobs/prompt.ts`.** Add imports at the top:

```ts
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
```

Change `buildTaskPrompt`'s signature to accept `repoRoot` and inject the plan before `return`:

```ts
export function buildTaskPrompt(item: BoardItem, requirements?: Map<string, Requirement>, repoRoot?: string): string {
```

Just before `return lines.join('\n')`, add:

```ts
  if (item.plan?.trim()) {
    const p = item.plan.trim()
    let planText = item.plan
    // A single-line *.md value that resolves under repoRoot is a committed plan file; read it.
    if (repoRoot && !p.includes('\n') && /\.md$/.test(p) && existsSync(path.join(repoRoot, p))) {
      planText = readFileSync(path.join(repoRoot, p), 'utf8')
    }
    lines.push('', '--- APPROVED PLAN — FOLLOW IT ---', planText.trim(), '--- END APPROVED PLAN ---')
  }
```

Add `buildBrainstormPrompt` (exported) below `buildTaskPrompt`:

```ts
export function buildBrainstormPrompt(item: BoardItem, requirements?: Map<string, Requirement>): string {
  const lines = [
    `Brainstorm and shape board task ${item.id} for the GameSync project before it is executed.`,
    '',
    `Title: ${item.title}`,
    '',
    'Description:',
    item.body.trim(),
  ]
  const ids = extractReqIds(item.body)
  if (requirements && ids.length > 0) {
    lines.push('', 'Requirements this task must satisfy:')
    for (const id of ids) {
      const r = requirements.get(id)
      if (r) {
        lines.push(`- ${r.id} — ${r.title}: ${r.statement}`)
        for (const ac of r.acceptance) lines.push(`    AC: ${ac}`)
      } else {
        lines.push(`- ${id}: not found in docs/requirements`)
      }
    }
  }
  lines.push(
    '',
    'Use the superpowers brainstorming skill to turn this into a design, then writing-plans to produce an implementation plan.',
    'Write the spec under docs/specs/ and the plan under docs/plans/.',
    'When done, attach the plan to this board task: paste the plan into the task plan field, or set the plan field to the plan file path (e.g. docs/plans/<file>.md). The task can then move to Ready.',
  )
  return lines.join('\n')
}
```

- [ ] **Step 4: Thread repoRoot at the dispatch call site** in `server/src/jobs/runner.ts`. Find the `buildTaskPrompt(item` call (in `dispatchTask`/segment start) and pass the repo root as the 3rd arg. Read the runner to find how it accesses config — it is `this.deps.config.repoRoot` (the same `config` the routes use via `deps.config.repoRoot`). If `RunnerDeps` does not expose `config`, use the repo root it already has for git/worktrees (e.g. `this.deps.git`'s repoRoot or a `repoRoot` field) — confirm by reading. Concretely the call becomes:

```ts
    buildTaskPrompt(item, this.requirements, this.deps.config.repoRoot)
```

(Match the real variable names for the requirements map and the config accessor that exist in the file. If requirements are loaded lazily, keep that as-is and only add the 3rd argument.)

- [ ] **Step 5: Add the brainstorm-prompt route** in `server/src/api/routes.ts`. Import `buildBrainstormPrompt` alongside the existing prompt imports (add to the top imports):

```ts
import { buildBrainstormPrompt } from '../jobs/prompt.js'
```

Add the route (near the other `/api/tasks/:id/*` routes):

```ts
  app.get<{ Params: { id: string } }>('/api/tasks/:id/brainstorm-prompt', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    const reqIndex = parseRequirementsDir(deps.config.repoRoot)
    return { prompt: buildBrainstormPrompt(item, reqIndex) }
  })
```

- [ ] **Step 6: Route test** — append to `server/src/routes.test.ts`:

```ts
it('GET /api/tasks/:id/brainstorm-prompt returns a prompt', async () => {
  const c = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
    payload: { type: 'task', title: 'Shape me', component: 'infra', body: 'details' } })
  const id = c.json().id
  const res = await app.inject({ method: 'GET', url: `/api/tasks/${id}/brainstorm-prompt`, cookies: cookie })
  expect(res.statusCode).toBe(200)
  expect(res.json().prompt).toContain('Shape me')
})
```

- [ ] **Step 7:** `npx vitest run` (full suite) + `npm run typecheck` green.

- [ ] **Step 8: Commit.**

```bash
git add plugins/jd/tools/project-board/server/src/jobs/prompt.ts plugins/jd/tools/project-board/server/src/jobs/runner.ts plugins/jd/tools/project-board/server/src/api/routes.ts plugins/jd/tools/project-board/server/src/prompt.test.ts plugins/jd/tools/project-board/server/src/routes.test.ts
git commit -m "feat(board): brainstorm-prompt route + approved-plan injection at dispatch"
```

---

### Task 4: UI — badge, drag guard, toggle, Brainstorm button, plan field

**Files:** Modify `ui/src/api.ts`, `ui/src/components/Kanban.tsx`, `ui/src/components/TaskDrawer.tsx`, `ui/src/components/BulkGenModal.tsx`, `ui/src/index.css`, `DESIGN_SYSTEM.md`.

- [ ] **Step 1: api.ts.** Loosen `patchTask` to accept non-string values and add `getBrainstormPrompt`; widen `bulkCreate`'s item type. Change:

```ts
  patchTask: (id: string, patch: Record<string, unknown>) =>
    request<BoardItem>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
```
add:
```ts
  getBrainstormPrompt: (id: string) => request<{ prompt: string }>(`/api/tasks/${id}/brainstorm-prompt`),
```
and widen `bulkCreate`:
```ts
  bulkCreate: (items: { type: string; title: string; component: string; priority: string; body: string; requiresShaping?: boolean }[]) =>
    request<{ created: string[]; rejected: { index: number; error: string }[] }>('/api/tasks/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
```

- [ ] **Step 2: token.** In `ui/src/index.css`, read the `@theme` block and the existing `--color-pr*` tokens. Add a `--color-shape` token (a warm/amber hue, distinct from `accent`/`ready`/`pr`/`ok`/`danger`) following the exact same declaration style as `--color-pr`. Example (match the file's real syntax/values):

```css
  --color-shape: #d8a657;
```

(If the design uses bg/border variants for badges, add `--color-shape-bg`/`--color-shape-border` too; the card badge below only needs `text-shape` and `border-shape`/`border-current`.)

- [ ] **Step 3: Kanban badge + drag guard.** In `ui/src/components/Kanban.tsx`:

Guard the drop onto `ready`. In `drop`, after `if (!id) return` and `setError('')`, add:

```ts
    if (status === 'ready') {
      const it = items.find((i) => i.id === id)
      if (it?.requiresShaping && !it.plan?.trim()) {
        setError('Task cần brainstorm + đính plan trước khi sang Ready')
        return
      }
    }
```

Add a badge on the card. In the bottom badge row (the `<span className="flex gap-1">…</span>` group), prepend a shaping badge before the type/status pills:

```tsx
                    {item.requiresShaping && !item.plan?.trim() && (
                      <span className="rounded-full border border-shape px-1.5 py-0.5 font-mono text-[9px] uppercase text-shape">⚙ nắn</span>
                    )}
                    {item.plan?.trim() && (
                      <span className="rounded-full border border-ok-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-ok">✓ nắn</span>
                    )}
```

(If `border-shape` is not generated, add the token variant in Step 2 or use `border-current`. Keep tokens-only — no raw palette classes.)

- [ ] **Step 4: TaskDrawer — toggle, Brainstorm, plan field.** In `ui/src/components/TaskDrawer.tsx`:

Add a `SHAPEABLE` const near the top (after `CAN_EXECUTE`):

```ts
const SHAPEABLE: string[] = ['backlog', 'ready']
```

Add state (with the other `useState`s):

```ts
  const [plan, setPlan] = useState(item.plan ?? '')
  const [brainstorm, setBrainstorm] = useState<string | null>(null)
```

Re-seed `plan` on item change — extend the existing `useEffect([item.id])` seeding block to also `setPlan(item.plan ?? ''); setBrainstorm(null)`.

Render the shaping section (place it right after the title/description/priority Save block, before the `border-t` execute section):

```tsx
        {SHAPEABLE.includes(item.status) && (
          <div className="rounded-md border border-border bg-sunken p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                {item.requiresShaping ? (item.plan?.trim() ? '✓ Đã nắn (plan đã đính)' : '⚙ Cần brainstorm trước khi sang Ready') : 'Không cần brainstorm'}
              </span>
              <button disabled={busy} onClick={() => void act(() => api.patchTask(item.id, { requiresShaping: !item.requiresShaping }), false)}
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                {item.requiresShaping ? 'Bỏ yêu cầu nắn' : 'Đánh dấu cần nắn'}
              </button>
            </div>
            {item.requiresShaping && (
              <>
                <button disabled={busy}
                  onClick={() => void act(async () => {
                    const { prompt } = await api.getBrainstormPrompt(item.id)
                    setBrainstorm(prompt)
                    try { await navigator.clipboard?.writeText(prompt) } catch { /* http LAN: manual copy below */ }
                  }, false)}
                  className="mt-2 w-full rounded border border-border py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                  Brainstorm → copy prompt cho terminal
                </button>
                {brainstorm !== null && (
                  <textarea readOnly value={brainstorm} rows={4} onFocus={(e) => e.currentTarget.select()}
                    className="mt-2 w-full resize-none rounded border border-border bg-base px-2 py-1 font-mono text-[11px] text-text-secondary outline-none" />
                )}
                <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3}
                  placeholder="Dán plan (markdown) hoặc đường dẫn docs/plans/….md"
                  className="mt-2 w-full resize-none rounded border border-border bg-sunken px-2 py-1 text-xs text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
                <button disabled={busy || plan === (item.plan ?? '')}
                  onClick={() => void act(() => api.patchTask(item.id, { plan }), false)}
                  className="mt-1 rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-40">
                  {plan === (item.plan ?? '') ? 'Plan đã lưu' : 'Lưu plan'}
                </button>
              </>
            )}
          </div>
        )}
```

(Use the real token class names found in `index.css` — `bg-base`/`bg-sunken`/`bg-surface` etc. must exist; substitute if the project names differ. Keep tokens-only for the grep-gate.)

- [ ] **Step 5: BulkGenModal — default by candidate kind.** Read `ui/src/components/BulkGenModal.tsx`, find where selected `Candidate`s are mapped into the `api.bulkCreate([...])` payload, and add `requiresShaping: c.kind === 'implement'` to each mapped item (the candidate variable name in scope may be `c`/`cand`/`candidate` — match it). This makes bulk-gen `Implement/Complete` tasks default to needs-shaping and `Add tests` tasks default trivial, per spec.

- [ ] **Step 6: DESIGN_SYSTEM.md.** Add a short note: the `--color-shape` token and the two card badges (`⚙ nắn` = requiresShaping & no plan; `✓ nắn` = plan attached), and that the plan/shaping controls live in the TaskDrawer for `backlog`/`ready` tasks.

- [ ] **Step 7: Gates.** From the tool dir: `npm run typecheck` clean; `npx vite build ui` succeeds; `npx vitest run` green; grep-gate clean:

```bash
grep -rnE '(zinc|cyan|red|green|orange|rose|amber|slate|gray|neutral|stone|emerald|teal|sky|blue|indigo|violet|purple|fuchsia|pink|lime|yellow)-[0-9]' ui/src && echo GREP-DIRTY || echo GREP-CLEAN
```

- [ ] **Step 8: Commit.**

```bash
git add plugins/jd/tools/project-board/ui/src/api.ts plugins/jd/tools/project-board/ui/src/components/Kanban.tsx plugins/jd/tools/project-board/ui/src/components/TaskDrawer.tsx plugins/jd/tools/project-board/ui/src/components/BulkGenModal.tsx plugins/jd/tools/project-board/ui/src/index.css plugins/jd/tools/project-board/DESIGN_SYSTEM.md
git commit -m "feat(board-ui): shaping badge, drag guard, toggle, brainstorm copy, plan field"
```

---

### Task 5: deploy 0.21.0 + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` (report count) + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.21.0`; commit `chore(jd): bump plugin to 0.21.0 (brainstorm gate)`. Then `git checkout main && git merge --no-ff brainstorm-gate && git branch -d brainstorm-gate && git push origin main`.

- [ ] **Step 3: Build dist + restart board** on :4400 (kill the running `dist/server/src/index.js`, rebuild `npm run build`, relaunch with `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`).

- [ ] **Step 4: Prove.**
  - Create a gated task and try to move it to ready without a plan → expect 409:
    ```bash
    ID=$(curl -s -X POST http://127.0.0.1:4400/api/tasks -H 'content-type: application/json' -d '{"type":"task","title":"prove gate","component":"infra","body":"x"}' | node -e 'process.stdin.on("data",d=>console.log(JSON.parse(d).id))')
    curl -s -X PATCH http://127.0.0.1:4400/api/tasks/$ID -H 'content-type: application/json' -d '{"requiresShaping":true}' >/dev/null
    curl -s -o /dev/null -w '%{http_code}\n' -X PATCH http://127.0.0.1:4400/api/tasks/$ID -H 'content-type: application/json' -d '{"status":"ready"}'   # expect 409
    curl -s -X PATCH http://127.0.0.1:4400/api/tasks/$ID -H 'content-type: application/json' -d '{"plan":"docs/plans/x.md"}' >/dev/null
    curl -s -o /dev/null -w '%{http_code}\n' -X PATCH http://127.0.0.1:4400/api/tasks/$ID -H 'content-type: application/json' -d '{"status":"ready"}'   # expect 200
    curl -s http://127.0.0.1:4400/api/tasks/$ID/brainstorm-prompt | head -c 120; echo
    ```
  - Delete the prove task afterwards (`curl -s -X DELETE http://127.0.0.1:4400/api/tasks/$ID`).
  - In the UI: a Backlog task shows the shaping section; a needs-shaping task without a plan cannot be dragged to Ready (shows the nudge); attaching a plan opens the gate; the Brainstorm button copies the kickoff prompt.

---

## Self-review notes

- Spec coverage: fields + defaults (T1, T2 bulk + single-create default-off), hard gate on →ready (T2), brainstorm-in-terminal handoff via kickoff prompt route (T3), plan injection at dispatch with file-or-inline + non-fatal missing path (T3), no headless brainstorm (no job spawned anywhere), UI badge/guard/toggle/Brainstorm/plan field + by-origin bulk default (T4), deploy default-safe (T5; old tasks read requiresShaping=false → unchanged behavior).
- Type consistency: `requiresShaping?: boolean` + `plan?: string` on `BoardItem` (T1), parsed/serialized (T1), patched + gated (T2), injected (T3), rendered + sent (T4). `buildTaskPrompt(item, requirements?, repoRoot?)` 3rd arg added and the runner call updated (T3). `Candidate.kind` already exists (`implement`/`test`) — BulkGenModal maps it to `requiresShaping` (T4).
- Backward compatibility: absent fields → `requiresShaping` undefined (falsy) → gate never fires for legacy tasks; they flow to Ready as before.
- Safety: gate is server-side (source of truth); client drag guard is a UX nicety with the 409 as backstop; auto-dispatch only sees `ready`, so gating `→ ready` is sufficient. No auto-merge change; review gate intact.
- Clipboard on http LAN: `navigator.clipboard?.writeText` is optional-chained and wrapped; the prompt is always shown in a selectable readonly textarea so manual copy works without a secure context.
- `auto.json`/data ignored already; no new persisted runtime file added.
