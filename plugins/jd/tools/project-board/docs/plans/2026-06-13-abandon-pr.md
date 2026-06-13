# Abandon Closed PR Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A board action for `pr`-status tasks whose PR was closed-not-merged: "Làm lại" (→ backlog) or "Bỏ hẳn" (→ delete), both cleaning worktree + local branch + remote GitHub branch. Per spec `docs/specs/2026-06-13-abandon-pr-design.md`.

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `abandon-pr`, tool dir `plugins/jd/tools/project-board`.

---

### Task 1: git.deleteRemoteBranch (TDD, real git)

**Files:** Modify `server/src/jobs/git.ts`; Test: `server/src/git.test.ts`.

- [ ] **Step 1: Branch.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b abandon-pr`.

- [ ] **Step 2: Failing test** — append to `server/src/git.test.ts` (uses the `sh(cwd,...args)` helper + `beforeEach` temp `repo` + `git = new BoardGit(repo)`):
```ts
it('deleteRemoteBranch removes the pushed board/<id> ref from origin', () => {
  const bare = mkdtempSync(path.join(tmpdir(), 'board-remote-'))
  sh(bare, 'init', '--bare', '-b', 'main')
  sh(repo, 'remote', 'add', 'origin', bare)
  git.createWorktree('TASK-200')               // branch board/TASK-200 from main
  sh(repo, 'push', 'origin', 'board/TASK-200')
  expect(sh(repo, 'ls-remote', '--heads', 'origin', 'board/TASK-200').trim()).not.toBe('')
  git.deleteRemoteBranch('TASK-200')
  expect(sh(repo, 'ls-remote', '--heads', 'origin', 'board/TASK-200').trim()).toBe('')
  git.removeWorktree('TASK-200')
})
```
(`mkdtempSync`/`tmpdir`/`path` are already imported in git.test.ts.)

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/git.test.ts` — FAIL (`deleteRemoteBranch` missing).

- [ ] **Step 4: Implement in `server/src/jobs/git.ts`** (near `createPr`):
```ts
  // Deletes the remote branch (e.g. after a PR was closed without merging).
  deleteRemoteBranch(taskId: string): void {
    this.assertSafeId(taskId)
    this.git(['push', 'origin', '--delete', this.branchName(taskId)])
  }
```

- [ ] **Step 5:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean.

- [ ] **Step 6: Commit.**
```bash
git add server/src/jobs/git.ts server/src/git.test.ts
git commit -m "feat(board): BoardGit.deleteRemoteBranch (git push origin --delete board/<id>)"
```

---

### Task 2: POST /api/tasks/:id/abandon-pr (TDD)

**Files:** Modify `server/src/api/routes.ts`, `server/src/test-helpers.ts` (fake git), `server/src/jobs/runner.ts` (RunnerDeps fake — if a fake git lives there); Test: `server/src/routes.test.ts`.

- [ ] **Step 1:** Ensure the fake git used by route/runner tests has a `deleteRemoteBranch` (mirror how `removeWorktree`/`isPrMerged` are faked). Add `deleteRemoteBranch: vi.fn()` (or a no-op) to the fake git in `test-helpers.ts` and any inline fake-git objects the tests build (search for `isPrMerged:` to find them). The `GitOps` interface in `server.ts`/`git.ts` must include `deleteRemoteBranch(taskId: string): void`.

- [ ] **Step 2: Failing tests** — append to `server/src/routes.test.ts` (reuse the harness that creates a `pr`-status task — the finalize-pr tests do this; mirror them):
```ts
describe('abandon-pr (closed PR)', () => {
  it('reopen: pr task -> backlog, pr cleared, worktree + remote branch cleaned', async () => {
    const id = await makePrTask(app, cookie)        // adapt to the finalize-pr test's setup
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/abandon-pr`, cookies: cookie, payload: { mode: 'reopen' } })
    expect(res.statusCode).toBe(200)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    const t = board.json().items.find((i: { id: string }) => i.id === id)
    expect(t.status).toBe('backlog')
    expect(t.pr).toBeFalsy()
  })
  it('delete: pr task removed', async () => {
    const id = await makePrTask(app, cookie)
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/abandon-pr`, cookies: cookie, payload: { mode: 'delete' } })
    expect(res.statusCode).toBe(200)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items.find((i: { id: string }) => i.id === id)).toBeUndefined()
  })
  it('409 for a non-pr task; 400 for a bad mode', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie, payload: { type: 'task', title: 't', component: 'infra', body: 'b' } })
    const id = c.json().id
    expect((await app.inject({ method: 'POST', url: `/api/tasks/${id}/abandon-pr`, cookies: cookie, payload: { mode: 'reopen' } })).statusCode).toBe(409)
    const prId = await makePrTask(app, cookie)
    expect((await app.inject({ method: 'POST', url: `/api/tasks/${prId}/abandon-pr`, cookies: cookie, payload: { mode: 'nope' } })).statusCode).toBe(400)
  })
})
```
READ the finalize-pr route tests to copy the EXACT way they put a task into `pr` status (likely: create task → set review → fake git createPr returns a url → POST /pr; or directly via the store). Define `makePrTask` accordingly (or inline it). Keep the assertion intents.

- [ ] **Step 3:** Run — FAIL (route missing).

- [ ] **Step 4: Implement** in `server/src/api/routes.ts` (near `finalize-pr`):
```ts
  app.post<{ Params: { id: string }; Body: { mode?: string } }>('/api/tasks/:id/abandon-pr', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status !== 'pr') return reply.code(409).send({ error: `task is ${item.status}, not pr` })
    const mode = req.body?.mode
    if (mode !== 'reopen' && mode !== 'delete') {
      return reply.code(400).send({ error: 'mode must be reopen or delete' })
    }
    // Local cleanup always; remote branch best-effort (offline / already-gone must not block).
    try { deps.git.removeWorktree(item.id) } catch { /* best-effort */ }
    let remote = 'ok'
    try { deps.git.deleteRemoteBranch(item.id) } catch (e) { remote = e instanceof Error ? e.message.slice(0, 120) : 'failed' }
    if (mode === 'delete') {
      store.deleteItem(item.id)
      hub.broadcast({ type: 'board_update' })
      return reply.send({ ok: true, deleted: true, remote })
    }
    const updated = store.updateItem(item.id, { status: 'backlog', pr: '' })
    hub.broadcast({ type: 'board_update' })
    return reply.send({ ...updated, remote })
  })
```

- [ ] **Step 5:** Full suite + typecheck green. Commit:
```bash
git add server/src/api/routes.ts server/src/test-helpers.ts server/src/routes.test.ts
git commit -m "feat(board): POST /api/tasks/:id/abandon-pr (reopen->backlog or delete; cleans local+remote)"
```

---

### Task 3: UI — abandon-PR buttons in the drawer

**Files:** Modify `ui/src/api.ts`, `ui/src/components/TaskDrawer.tsx`.

- [ ] **Step 1: api.ts.** Add:
```ts
  abandonPr: (id: string, mode: 'reopen' | 'delete') =>
    request<unknown>(`/api/tasks/${id}/abandon-pr`, { method: 'POST', body: JSON.stringify({ mode }) }),
```

- [ ] **Step 2: TaskDrawer.** READ the `status === 'pr'` block (it shows the `item.pr` link + the "PR đã merge → dọn" finalize button). Below the finalize button, add a closed-PR row:
```tsx
              <div className="mt-2 border-t border-border pt-2">
                <p className="mb-1 text-xs text-text-muted">PR bị đóng (không merge)?</p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => void act(() => api.abandonPr(item.id, 'reopen'))}
                    className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50">
                    Làm lại (→ backlog)
                  </button>
                  <button disabled={busy} onClick={() => { if (confirm(`Bỏ hẳn ${item.id}? Xóa task + branch (local + GitHub).`)) void act(() => api.abandonPr(item.id, 'delete')) }}
                    className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                    Bỏ hẳn
                  </button>
                </div>
              </div>
```
(`act(fn)` closes the drawer on success by default — good, since the task leaves `pr`. Use the page `confirm()` for the destructive "Bỏ hẳn", consistent with a clear guard; or reuse the drawer's existing confirm pattern if preferred. Verify token classes `border-danger-border`/`bg-danger-bg`/`text-danger`/`border-border`/`bg-raised`/`text-text-secondary`/`text-text-muted` exist in index.css.)

- [ ] **Step 3: Gates.** `npm run typecheck` clean; `npx vite build ui` ok; `npx vitest run` green; grep-gate clean.

- [ ] **Step 4: Commit.**
```bash
git add ui/src/api.ts ui/src/components/TaskDrawer.tsx
git commit -m "feat(board-ui): closed-PR cleanup buttons (Làm lại / Bỏ hẳn) on pr tasks"
```

---

### Task 4: deploy 0.30.0 + prove on TASK-012

- [ ] **Step 1: Gates.** `npm run typecheck && npx vite build ui && npx vitest run` + grep-gate clean.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.30.0`; commit `chore(jd): bump plugin to 0.30.0 (abandon closed PR)`. Then `git checkout main && git merge --no-ff abandon-pr && git branch -d abandon-pr && git push origin main`.
- [ ] **Step 3: Build + restart — ONLY when no jobs running.** Rebuild + relaunch as usual.
- [ ] **Step 4: Prove on the real abandoned task TASK-012** (status `pr`, PR #16 closed, feature dropped → "Bỏ hẳn"):
  - Confirm local + remote branch exist first: `cd /home/gamesync/source/gamesync && git ls-remote --heads origin board/TASK-012` (present).
  - `curl -s -X POST http://127.0.0.1:4400/api/tasks/TASK-012/abandon-pr -H 'content-type: application/json' -d '{"mode":"delete"}'` → `{ ok:true, deleted:true, remote:"ok" }`.
  - Verify: TASK-012 gone from `/api/board`; `.board-worktrees/TASK-012` gone; `git branch --list board/TASK-012` empty; `git ls-remote --heads origin board/TASK-012` empty.
  - Report. (CAFE-R4 will be re-suggested by scan since its requirement is still partial — note this; descoping is a separate spec decision.)

---

## Self-review notes
- Spec coverage: `deleteRemoteBranch` (T1), abandon-pr route reopen/delete + best-effort remote (T2), drawer buttons (T3), deploy + live prove on TASK-012 (T4).
- Type consistency: `deleteRemoteBranch(taskId)` on `BoardGit` + the `GitOps` interface + fake git; route reads `deps.git.{removeWorktree,deleteRemoteBranch}`; `api.abandonPr(id, mode)`. `pr` cleared via `updateItem(..., { pr: '' })` (parse drops empty).
- Safety: 409 for non-pr; 400 for bad mode; local cleanup + transition always succeed even if the remote delete throws (best-effort, result reported). finalize-pr (merged path) untouched.
- Note: abandoning cleans task/branches, not the requirement; re-suggestion is expected unless the requirement is descoped (separate).
