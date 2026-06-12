# PR Lifecycle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A proper PR lifecycle on the board — "Tạo PR" moves a task to a new `pr` (PR open) status with the PR link surfaced, and a gh-verified "PR đã merge → dọn" action removes the branch + worktree and sets `done` only once the PR is truly merged — per spec `docs/specs/2026-06-12-pr-lifecycle-design.md`.

**Architecture:** Add a system-managed `pr` status + a `pr` URL frontmatter field; the `/pr` route stops marking `done` and sets `pr`; a new `/finalize-pr` route verifies merge via `git.isPrMerged` (gh) then cleans up and sets `done`; DELETE also removes the worktree. UI gains a "PR mở" column, a pr color token, a card PR link, and a drawer finalize button.

**Tech Stack:** existing Fastify/React/Aurora/vitest stack; `gh` CLI (installed + authed on this box).

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `pr-lifecycle`, tool dir `plugins/jd/tools/project-board`. Paths relative to the tool dir.

---

## File structure

```
ui/src/types.ts                       # ItemStatus + 'pr'; BoardItem.pr?
server/src/markdown.ts                # STATUSES + 'pr'; known-keys + 'pr'; parse/serialize pr
server/src/markdown.test.ts           # pr status + pr field round-trip
server/src/jobs/git.ts                # + isPrMerged
server/src/jobs/runner.ts             # GitOps + isPrMerged
server/src/test-helpers.ts            # fake git + isPrMerged
server/src/runner.test.ts             # fake git stubs + isPrMerged
server/src/api/routes.ts              # /pr changed; + /finalize-pr; DELETE worktree cleanup; PATCH excludes pr
server/src/routes.test.ts             # pr-flow route tests
ui/src/index.css                      # --color-pr / -bg / -border
ui/src/api.ts                         # + finalizePr
ui/src/components/Kanban.tsx          # pr column + edge/pill + PR link
ui/src/components/TaskDrawer.tsx      # pr-state finalize action + PR link
DESIGN_SYSTEM.md                      # pr status color + card PR link note
```

---

### Task 1: `pr` status + `pr` URL field (TDD)

**Files:**
- Modify: `ui/src/types.ts`, `server/src/markdown.ts`, `server/src/markdown.test.ts`

- [ ] **Step 1: Branch.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b pr-lifecycle`

- [ ] **Step 2: Types.** In `ui/src/types.ts`:
  - `ItemStatus`: add `'pr'` → `export type ItemStatus = 'backlog' | 'ready' | 'ai_running' | 'review' | 'pr' | 'done'`
  - `BoardItem`: add `pr?: string` (the PR URL) next to the existing `job?: string`.

- [ ] **Step 3: Failing tests** — append to `server/src/markdown.test.ts`:

```ts
describe('pr status and pr field', () => {
  const RAW_PR = `---
id: TASK-009
type: task
title: With a PR
status: pr
priority: P2
component: cafe-service
created: 2026-06-12
updated: 2026-06-12
pr: https://github.com/jamehd/gamesync/pull/7
---

body here
`
  it('accepts the pr status', () => {
    expect(parseItem(RAW_PR).status).toBe('pr')
  })
  it('parses and round-trips the pr url field', () => {
    const item = parseItem(RAW_PR)
    expect(item.pr).toBe('https://github.com/jamehd/gamesync/pull/7')
    expect(parseItem(serializeItem(item))).toEqual(item)
  })
  it('does not sweep pr into extra', () => {
    const item = parseItem(RAW_PR)
    expect(item.extra).toBeUndefined()
  })
})
```

- [ ] **Step 4: Run** `cd plugins/jd/tools/project-board && npx vitest run server/src/markdown.test.ts` — FAIL (invalid status `pr` / pr in extra).

- [ ] **Step 5: Implement** in `server/src/markdown.ts`:
  - Add `'pr'` to the `STATUSES` array (so `oneOf` accepts it). The current array is `['backlog', 'ready', 'ai_running', 'review', 'done']` → make it `['backlog', 'ready', 'ai_running', 'review', 'pr', 'done']`.
  - Add `'pr'` to the known-frontmatter-keys set used to compute `extra` (the set currently lists id, type, title, status, priority, component, created, updated, job) → add `pr`.
  - In `parseItem`, after the `if (data.job) item.job = String(data.job)` line, add `if (data.pr) item.pr = String(data.pr)`.
  - `serializeItem` already spreads all non-body fields, so `pr` serializes automatically once it's on the item.

- [ ] **Step 6:** Tests PASS. Full `npx vitest run` (was 150; +3) + `npm run typecheck` clean.

- [ ] **Step 7: Commit.**

```bash
git add ui/src/types.ts server/src/markdown.ts server/src/markdown.test.ts
git commit -m "feat(board): add pr status and pr-url field"
```

---

### Task 2: git isPrMerged + PR routes + DELETE cleanup (TDD)

**Files:**
- Modify: `server/src/jobs/git.ts`, `server/src/jobs/runner.ts` (GitOps), `server/src/test-helpers.ts`, `server/src/runner.test.ts`, `server/src/api/routes.ts`, `server/src/routes.test.ts`

- [ ] **Step 1: git.isPrMerged.** In `server/src/jobs/git.ts` add to `BoardGit`:

```ts
  isPrMerged(taskId: string): boolean {
    this.assertSafeId(taskId)
    let out: string
    try {
      out = execFileSync('gh', ['pr', 'view', this.branchName(taskId), '--json', 'state', '-q', '.state'],
        { cwd: this.repoRoot, encoding: 'utf8' }).trim()
    } catch (e: unknown) {
      const stderr = (e as { stderr?: string }).stderr?.trim()
      const base = e instanceof Error ? e.message : String(e)
      throw new Error(stderr ? `${stderr}\n${base}` : base)
    }
    return out === 'MERGED'
  }
```

- [ ] **Step 2: GitOps + fakes.** In `server/src/jobs/runner.ts` add to the `GitOps` interface: `isPrMerged(taskId: string): boolean`. In `server/src/test-helpers.ts` fake git add `isPrMerged: () => true`. In `server/src/runner.test.ts` add `isPrMerged: vi.fn(() => true)` (or `() => true`) to each fake-git object so they still satisfy the interface.

- [ ] **Step 3: Failing route tests** — append to `server/src/routes.test.ts`. Use the existing `makeReviewTask()` helper (creates TASK-001 in `review`). Note the fake git's `createPr` returns `'https://github.com/example/pr/1'` and `isPrMerged` returns `true`; for the not-merged case override per-test via the captured `deps`:

```ts
describe('pr lifecycle routes', () => {
  it('Tạo PR moves the task to pr status with the pr url, not done', async () => {
    const id = await makeReviewTask()
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('pr')
    expect(res.json().pr).toBe('https://github.com/example/pr/1')
  })

  it('finalize-pr on a merged PR cleans up and marks done', async () => {
    const id = await makeReviewTask()
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('done')
    expect((deps.git.removeWorktree as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(id)
  })

  it('finalize-pr 409s when the PR is not merged', async () => {
    const id = await makeReviewTask()
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    ;(deps.git.isPrMerged as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('finalize-pr 409s on a non-pr task', async () => {
    const id = await makeReviewTask() // status review, no PR created
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('DELETE also removes the worktree', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Doomed', component: 'infra', body: 'x' } })
    const res = await app.inject({ method: 'DELETE', url: '/api/tasks/TASK-001', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect((deps.git.removeWorktree as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('TASK-001')
  })
})
```

This requires the fake git's `removeWorktree`/`isPrMerged` to be `vi.fn(...)`. In `test-helpers.ts` make them `vi.fn(() => {})` / `vi.fn(() => true)` so the route tests can assert calls and override. (Import `vi` from vitest in test-helpers.) The `deps` is already module-scoped in routes.test.ts (from the zombie-fix harness change).

- [ ] **Step 4: Run** — new tests FAIL.

- [ ] **Step 5: Implement routes.** In `server/src/api/routes.ts`:

Change the existing `/pr` handler body (after `createPr`) from setting done to setting pr:

```ts
  app.post<{ Params: { id: string } }>('/api/tasks/:id/pr', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    let url: string
    try {
      url = deps.git.createPr(item.id, `${item.id}: ${item.title}`, item.body)
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) })
    }
    const updated = store.updateItem(item.id, { pr: url, status: 'pr' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })
```

Add the finalize route:

```ts
  app.post<{ Params: { id: string } }>('/api/tasks/:id/finalize-pr', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status !== 'pr') return reply.code(409).send({ error: `task is ${item.status}, not pr` })
    let merged: boolean
    try {
      merged = deps.git.isPrMerged(item.id)
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) })
    }
    if (!merged) return reply.code(409).send({ error: 'PR chưa được merge' })
    deps.git.removeWorktree(item.id)
    const updated = store.updateItem(item.id, { status: 'done' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })
```

In the DELETE handler, after `store.deleteItem(item.id)` add the worktree cleanup:

```ts
    store.deleteItem(item.id)
    try { deps.git.removeWorktree(item.id) } catch { /* best-effort */ }
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
```

Also: the PATCH route's user-status whitelist must exclude `pr`. Find `USER_STATUSES` (the list of statuses a manual PATCH may set — currently all except `ai_running`). Ensure it is exactly `['backlog', 'ready', 'review', 'done']` (i.e. excludes BOTH `ai_running` and `pr`). If it was derived as "all STATUSES except ai_running", change it to also drop `pr` (define it as an explicit list).

- [ ] **Step 6:** Full `npx vitest run` (was 153; +5) + `npm run typecheck` clean.

- [ ] **Step 7: Commit.**

```bash
git add server/src/jobs/git.ts server/src/jobs/runner.ts server/src/test-helpers.ts server/src/runner.test.ts server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): isPrMerged + pr/finalize-pr routes + delete worktree cleanup"
```

---

### Task 3: UI — pr column, token, PR link, finalize button

**Files:**
- Modify: `ui/src/index.css`, `ui/src/api.ts`, `ui/src/components/Kanban.tsx`, `ui/src/components/TaskDrawer.tsx`, `DESIGN_SYSTEM.md`

- [ ] **Step 1: Tokens.** In `ui/src/index.css` `@theme` add (a distinct indigo, separate from accent/ready/ok/running/danger):

```css
  --color-pr: #8b9cf7;
  --color-pr-bg: #181a2e;
  --color-pr-border: #2e3360;
```

- [ ] **Step 2: api.** In `ui/src/api.ts` add to the `api` object:

```ts
  finalizePr: (id: string) => request<BoardItem>(`/api/tasks/${id}/finalize-pr`, { method: 'POST' }),
```

- [ ] **Step 3: Kanban.** In `ui/src/components/Kanban.tsx`:
  - `COLUMNS`: insert `{ key: 'pr', label: 'PR mở' }` between the `review` and `done` entries.
  - `STATUS_EDGE`: add `pr: 'border-l-pr'`.
  - `STATUS_PILL`: add `pr: 'text-pr border-pr-border'`.
  - `pr` is system-managed: in the drop handler, treat `pr` like `ai_running` (not a drop target); cards in `pr` are not draggable. Wherever the code checks `col.key !== 'ai_running'` for drop-eligibility and `item.status !== 'ai_running'` for `draggable`, extend to also exclude `'pr'` (e.g. `item.status !== 'ai_running' && item.status !== 'pr'`).
  - Card PR link: in the card body, when `item.pr` is set, render a small link that opens the PR and does not trigger the drawer:
    ```tsx
    {item.pr && (
      <a href={item.pr} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
        className="mt-1 inline-block font-mono text-[10px] text-pr hover:underline">🔗 PR</a>
    )}
    ```

- [ ] **Step 4: TaskDrawer.** In `ui/src/components/TaskDrawer.tsx`, add a `pr`-state action block alongside the existing `review` block. When `item.status === 'pr'`:
  - show the PR link prominently;
  - show a "PR đã merge → dọn" button calling `api.finalizePr(item.id)` via the existing `act(...)` helper (which surfaces errors inline and closes on success). The 409-not-merged error message shows inline.

```tsx
      {item.status === 'pr' && (
        <div className="border-t border-border pt-3">
          {item.pr && (
            <a href={item.pr} target="_blank" rel="noreferrer"
              className="mb-2 block font-mono text-xs text-pr hover:underline">🔗 {item.pr}</a>
          )}
          <button disabled={busy} onClick={() => void act(() => api.finalizePr(item.id))}
            className="w-full rounded-md border border-pr-border bg-pr-bg py-2 text-sm font-medium text-pr transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
            PR đã merge → dọn
          </button>
        </div>
      )}
```

(Place it where the review-actions block lives; the review block stays gated on `item.status === 'review'`.)

- [ ] **Step 5: DESIGN_SYSTEM.** In `DESIGN_SYSTEM.md`: add `pr` to the status color table (token `--color-pr` indigo, used for the `pr` edge + pill), and note in the card recipe that a `pr` card carries a "🔗 PR" link to the open pull request; add a one-line Drawer note for the "PR đã merge → dọn" finalize action.

- [ ] **Step 6:** `npm run typecheck && npx vite build ui && npx vitest run` (158) + grep-gate (`grep -rnE '(zinc|cyan|red|green|orange|rose|amber)-[0-9]' ui/src || echo GREP-CLEAN`). Confirm the built CSS contains `text-pr`, `bg-pr-bg`, `border-pr-border`, `border-l-pr`.

- [ ] **Step 7: Commit.**

```bash
git add ui/src/index.css ui/src/api.ts ui/src/components/Kanban.tsx ui/src/components/TaskDrawer.tsx DESIGN_SYSTEM.md
git commit -m "feat(board-ui): pr column, pr token, card PR link, finalize button"
```

---

### Task 4: deploy + clean up TASK-003 + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vite build ui && npx vitest run` (report count) + grep-gate clean.

- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.19.0`; commit `chore(jd): bump plugin to 0.19.0 (pr lifecycle)`. Then `git checkout main && git merge --no-ff pr-lifecycle && git branch -d pr-lifecycle && git push origin main`.

- [ ] **Step 3: Build dist + restart board.** `npm run build`; kill the :4400 process; restart open: `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 node dist/server/src/index.js`.

- [ ] **Step 4: Clean up the lingering TASK-003 worktree** (left by the old PR flow). In `/home/gamesync/source/gamesync`:
  ```bash
  git worktree remove --force .board-worktrees/TASK-003 2>/dev/null || true
  git branch -D board/TASK-003 2>/dev/null || true
  git worktree prune
  git worktree list   # confirm no board/* worktrees remain
  ```
  (If TASK-003 is still an active task on the board in `review`/`pr`, leave its task item alone — only remove the orphaned worktree/branch.)

- [ ] **Step 5: Prove (no real PR needed for the wiring).** With the board running, confirm the new surfaces exist:
  - `curl -s http://127.0.0.1:4400/api/board >/dev/null` → 200.
  - In the UI (manual, owner): a `review` task shows "Tạo PR"; clicking it (real gh) moves the task to the "PR mở" column with a 🔗 PR link; the drawer shows "PR đã merge → dọn"; clicking finalize before merging returns the 409 "PR chưa được merge"; after merging the PR on GitHub, finalize moves it to Done and the branch/worktree are gone.
  - Report the deployed version + that the PR column/link/finalize are live.

---

## Self-review notes

- Spec coverage: `pr` status + `pr` field (T1), git isPrMerged (T2), `/pr`→pr-not-done (T2), `/finalize-pr` gh-verified (T2), DELETE worktree cleanup (T2), PATCH excludes pr (T2), pr column + token + card PR link + drawer finalize (T3), DESIGN_SYSTEM (T3), deploy + TASK-003 cleanup (T4).
- Type consistency: `ItemStatus` gains `'pr'` (T1) consumed by Kanban COLUMNS/STATUS_EDGE/STATUS_PILL (T3) and the routes; `BoardItem.pr?` (T1) read by `/pr` route + card/drawer; `GitOps.isPrMerged` (T2) implemented on BoardGit + all fakes; `api.finalizePr` (T3) ↔ `/api/tasks/:id/finalize-pr` (T2). The fake git's `removeWorktree`/`isPrMerged` become `vi.fn` so route tests can assert/override.
- The local Merge path (`/merge` → done, removes worktree) is unchanged; only the PR path gains the `pr` interim state. `pr` is system-managed (not a manual PATCH target, not drag-target) — mirrors `ai_running`.
- gh is installed + authed on this box (verified), so createPr + isPrMerged work in T4's real proof.
