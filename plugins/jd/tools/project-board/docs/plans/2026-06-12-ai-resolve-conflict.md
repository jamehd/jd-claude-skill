# AI Resolve Merge Conflict Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a headless `claude` job resolve a review task's merge conflict in its existing worktree (merge main + resolve + commit), triggered by a contextual button when a Merge fails with a conflict — per spec `docs/specs/2026-06-12-ai-resolve-conflict-design.md`.

**Architecture:** A new `resolve` job kind runs in the task's existing worktree (not recreated). `start()` gains a `resolve` branch; the completion checks treat `resolve` like `task` (`!== 'rescan'`). A `buildResolvePrompt` instructs the agent to merge main + resolve + commit. A route + a drawer button (shown on a conflict) drive it.

**Tech Stack:** existing Fastify/React 19/Tailwind 4 (Aurora)/vitest stack.

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `ai-resolve-conflict`, tool dir `plugins/jd/tools/project-board`.

---

## File structure

```
ui/src/types.ts                       # JobKind += 'resolve'
server/src/jobs/prompt.ts             # buildResolvePrompt
server/src/prompt.test.ts             # buildResolvePrompt test
server/src/jobs/runner.ts             # dispatchResolve, start() resolve branch, kind!=='rescan' checks
server/src/runner.test.ts             # resolve dispatch/start/success tests
server/src/api/routes.ts              # POST /api/tasks/:id/resolve
server/src/routes.test.ts             # resolve route tests
ui/src/api.ts                         # resolve(id)
ui/src/components/TaskDrawer.tsx       # conflict → "AI đồng bộ main + vá" button
```

---

### Task 1: JobKind + buildResolvePrompt (TDD)

**Files:** Modify `ui/src/types.ts`, `server/src/jobs/prompt.ts`; Test: `server/src/prompt.test.ts`.

- [ ] **Step 1: Branch + type.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b ai-resolve-conflict`. In `ui/src/types.ts` change `export type JobKind = 'task' | 'rescan'` to `export type JobKind = 'task' | 'rescan' | 'resolve'`.

- [ ] **Step 2: Failing test** — append to `server/src/prompt.test.ts` (it already imports from `./jobs/prompt.js` and has an `itemFull()`/`item()` helper — reuse it; add `buildResolvePrompt` to the import):

```ts
describe('buildResolvePrompt', () => {
  it('instructs merge-main + resolve + commit and includes the task title', () => {
    const p = buildResolvePrompt(itemFull({ title: 'Add tests for X', body: 'do it\nReq: CAFE-R4' }))
    expect(p).toMatch(/git merge main/)
    expect(p).toMatch(/conflict/i)
    expect(p).toContain('Add tests for X')
    expect(p).toMatch(/do NOT push/i)
  })
  it('injects requirement context when resolvable', () => {
    const reqs = new Map([['CAFE-R4', { id: 'CAFE-R4', title: 'Manifest', statement: 'Parses v2.', acceptance: ['delta only'] }]])
    const p = buildResolvePrompt(itemFull({ body: 'x\nReq: CAFE-R4' }), reqs)
    expect(p).toContain('CAFE-R4')
    expect(p).toContain('delta only')
  })
})
```
(If the helper is named `item` not `itemFull`, use the real one. If `prompt.test.ts` doesn't exist, create it mirroring the existing prompt tests — but it does exist from the usage-panel work.)

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/prompt.test.ts` — FAIL.

- [ ] **Step 4: Implement `buildResolvePrompt` in `server/src/jobs/prompt.ts`** (after `buildTaskPrompt`; reuse `extractReqIds` + the `Requirement` type already imported):

```ts
export function buildResolvePrompt(item: BoardItem, requirements?: Map<string, Requirement>): string {
  const lines = [
    `You are in a git worktree on branch board/${item.id} of the GameSync repo.`,
    'main has advanced and this branch now CONFLICTS with it. Your job is to bring the',
    'branch up to date with main and resolve the conflict — do NOT re-implement from scratch.',
    '',
    `Task: ${item.title}`,
    '',
    item.body.trim(),
    '',
    'Do ALL of the following:',
    '1. Run `git merge main` to bring main’s changes into this branch.',
    '2. Resolve EVERY conflict, preserving BOTH this task’s intent AND main’s changes.',
    '3. Run the tests relevant to the changed files and make them pass.',
    '4. Commit the resolution (git add + git commit). Do NOT push, do NOT touch other branches,',
    '   and do NOT modify anything under project-board/data/.',
    '5. Verify `git diff main...HEAD` no longer reports conflicts.',
    '6. End with a short summary of what conflicted and how you resolved it.',
  ]
  const ids = extractReqIds(item.body)
  if (requirements && ids.length > 0) {
    lines.push('', '--- REQUIREMENTS THIS TASK MUST STILL SATISFY ---')
    for (const id of ids) {
      const r = requirements.get(id)
      if (r) {
        lines.push(`${r.id} — ${r.title}: ${r.statement}`)
        for (const ac of r.acceptance) lines.push(`  AC: ${ac}`)
      } else {
        lines.push(`${id}: not found in docs/requirements`)
      }
    }
    lines.push('--- END REQUIREMENTS ---')
  }
  return lines.join('\n')
}
```

- [ ] **Step 5:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean.

- [ ] **Step 6: Commit.**
```bash
git add ui/src/types.ts server/src/jobs/prompt.ts server/src/prompt.test.ts
git commit -m "feat(board): JobKind resolve + buildResolvePrompt"
```

---

### Task 2: Runner — dispatchResolve + resolve branch (TDD)

**Files:** Modify `server/src/jobs/runner.ts`; Test: `server/src/runner.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/runner.test.ts` (read `setup()`: fake `git` has `createWorktree`/`worktreePath`/`hasWorktree`/`changedFiles` as `vi.fn`s; `procs`/`sendInit`/`feedLine` drive a job; tasks via `store`). Adapt to the real fake-git shape.

```ts
describe('AI resolve conflict', () => {
  function reviewTask(t: ReturnType<typeof setup>) {
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra' }).id
    t.store.updateItem(id, { status: 'review' })
    return id
  }

  it('dispatchResolve runs in the EXISTING worktree (does not recreate it)', () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const createSpy = t.git.createWorktree as ReturnType<typeof vi.fn>
    const id = reviewTask(t)
    const job = t.runner.dispatchResolve(id)
    expect(job.kind).toBe('resolve')
    expect(createSpy).not.toHaveBeenCalled()                 // existing worktree reused
    expect(t.git.worktreePath as ReturnType<typeof vi.fn>).toHaveBeenCalledWith(id)
    expect(t.store.getItem(id)?.status).toBe('ai_running')
  })

  it('a successful resolve (changedFiles>0) returns the task to review', async () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    const id = reviewTask(t)
    t.runner.dispatchResolve(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })

  it('resolve with no worktree fails clearly and leaves ai_running', async () => {
    const t = setup()
    ;(t.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const id = reviewTask(t)
    const job = t.runner.dispatchResolve(id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    expect(t.runner.getJob(job.id)?.error).toMatch(/worktree/i)
    expect(t.store.getItem(id)?.status).not.toBe('ai_running')
  })
})
```
(Match the real fake-git accessor names. If `worktreePath` isn't a spy, assert behavior another way — the key intent: `createWorktree` is NOT called for a resolve job. If the no-worktree failure path leaves the task as-is rather than resetting, assert the job failed + error message; adjust the status assertion to the real behavior without weakening the "createWorktree not called" + "fails with worktree message" intents.)

- [ ] **Step 2:** Run — FAIL (`dispatchResolve` missing).

- [ ] **Step 3: Implement in `server/src/jobs/runner.ts`.**

(a) Add the method near `dispatchTask` (line ~127):
```ts
  dispatchResolve(taskId: string): Job {
    return this.enqueue('resolve', taskId)
  }
```

(b) In `start()`, add a `resolve` branch BEFORE the final `else` (rescan). The existing structure is `if (job.kind === 'task') { createWorktree … } else { rescan }`. Change to:
```ts
    if (job.kind === 'task') {
      job.branch = `board/${job.taskId!}`
      try {
        cwd = git.createWorktree(job.taskId!)
      } catch (err) {
        this.finish(job, 'failed', `worktree: ${err instanceof Error ? err.message : err}`)
        return
      }
      const item = store.getItem(job.taskId!)
      if (!item) {
        git.removeWorktree(job.taskId!)
        this.finish(job, 'failed', `task not found: ${job.taskId}`)
        return
      }
      store.updateItem(item.id, { status: 'ai_running', job: job.id })
      prompt = buildTaskPrompt(item, parseRequirementsDir(this.deps!.repoRoot), this.deps!.repoRoot)
    } else if (job.kind === 'resolve') {
      job.branch = `board/${job.taskId!}`
      if (!git.hasWorktree(job.taskId!)) {
        this.finish(job, 'failed', 'worktree missing; re-run the task instead')
        return
      }
      const item = store.getItem(job.taskId!)
      if (!item) {
        this.finish(job, 'failed', `task not found: ${job.taskId}`)
        return
      }
      cwd = git.worktreePath(job.taskId!)
      store.updateItem(item.id, { status: 'ai_running', job: job.id })
      prompt = buildResolvePrompt(item, parseRequirementsDir(this.deps!.repoRoot))
    } else {
      // Rescan writes status files directly to disk in the live repo; no worktree.
      cwd = this.deps!.repoRoot
      this.statusSnapshots.set(job.id, this.snapshotStatusDir())
      this.porcelainSnapshots.set(job.id, new Set(this.deps!.git.porcelain()))
      prompt = buildRescanPrompt()
    }
```
Add `buildResolvePrompt` to the import from `./prompt.js` at the top.

(c) Completion: treat `resolve` like `task` (branch-work). Change the three `job.kind === 'task'` checks to `job.kind !== 'rescan'`:
- in `completedSuccessfully` (~586): `if (job.kind !== 'rescan') { return this.deps!.git.changedFiles(job.taskId!).length > 0 }`
- in the onSegmentExit success branch (~543): `if (job.kind !== 'rescan') { this.afterSuccess(job); this.finish(job, 'succeeded') } else { …rescan… }`
- in the failure reason (~555): `const reason = job.kind !== 'rescan' ? 'process exited 0 but no commits found on the branch' : 'process exited 0 but no files under project-board/data/status changed'`

(`afterSuccess` already sets the task to `review` and notes changed files — correct for resolve.)

- [ ] **Step 4:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean. Adapt test harness mechanics only.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/runner.ts server/src/runner.test.ts
git commit -m "feat(board): dispatchResolve — resolve job runs in the existing worktree, returns to review"
```

---

### Task 3: Route — POST /api/tasks/:id/resolve (TDD)

**Files:** Modify `server/src/api/routes.ts`; Test: `server/src/routes.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/routes.test.ts` (the fake git/runner in the route harness: ensure `hasWorktree` can be stubbed; read how other git-backed routes like `/merge` are tested and mirror). Cover: 202 for a review task with a worktree; 409 for a non-review task; 409 when no worktree.

```ts
describe('resolve route', () => {
  it('202 for a review task with a worktree', async () => {
    // create a task and move it to review via the test harness's helper/store,
    // ensure the fake git hasWorktree → true (match how other tests set fake-git returns)
    const id = await makeReviewTaskWithWorktree(app, cookie)   // adapt to the harness
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/resolve`, cookies: cookie })
    expect(res.statusCode).toBe(202)
  })
  it('409 for a non-review task', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie, payload: { type: 'task', title: 't', component: 'infra', body: 'b' } })
    const id = c.json().id   // backlog
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/resolve`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })
  it('409 when the worktree is gone', async () => {
    const id = await makeReviewTaskNoWorktree(app, cookie)      // hasWorktree → false
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/resolve`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })
})
```
READ `server/src/routes.test.ts` first: it has a fake git + a way to set a task to `review` (the `/merge`/`/diff` tests do this). Reuse that exact mechanism for `hasWorktree`/review setup instead of the placeholder helpers above; keep the three assertions (202 / 409-not-review / 409-no-worktree).

- [ ] **Step 2:** Run — FAIL (route missing).

- [ ] **Step 3: Implement** — add near `/api/tasks/:id/merge` in `server/src/api/routes.ts` (reuse the existing `requireReview` helper):
```ts
  app.post<{ Params: { id: string } }>('/api/tasks/:id/resolve', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    if (!deps.git.hasWorktree(item.id)) {
      return reply.code(409).send({ error: 'worktree đã mất — hãy chạy lại task' })
    }
    return reply.code(202).send(deps.runner.dispatchResolve(item.id))
  })
```
(Confirm the route harness's fake git exposes `hasWorktree`; if not, add it to the test-helpers fake git returning a controllable value.)

- [ ] **Step 4:** Full suite + typecheck green. Commit:
```bash
git add server/src/api/routes.ts server/src/routes.test.ts
git commit -m "feat(board): POST /api/tasks/:id/resolve (dispatch AI conflict resolution)"
```

---

### Task 4: UI — conflict button in the drawer

**Files:** Modify `ui/src/api.ts`, `ui/src/components/TaskDrawer.tsx`.

- [ ] **Step 1: api.ts.** Add:
```ts
  resolve: (id: string) => request<Job>(`/api/tasks/${id}/resolve`, { method: 'POST' }),
```
(`Job` is already imported in api.ts; confirm.)

- [ ] **Step 2: TaskDrawer.** READ the file: the review actions are the `{item.status === 'review' && (...)}` block with Merge/Tạo PR/Hủy bỏ; `act(fn, close)` wraps actions and sets `error` on throw; state is re-seeded on `item.id` change.
  - Add state: `const [mergeConflict, setMergeConflict] = useState(false)`.
  - Re-seed on item change: in the existing `useEffect([item.id])` seeding block add `setMergeConflict(false)`.
  - Change the Merge button's handler to detect a conflict. Currently it is `onClick={() => void act(() => api.merge(item.id))}`. Replace with a handler that clears the flag, runs merge, and on a conflict error sets the flag:
```tsx
              <button disabled={busy} onClick={() => {
                setMergeConflict(false)
                void act(async () => {
                  try { await api.merge(item.id) }
                  catch (e) { if (e instanceof Error && /conflict/i.test(e.message)) setMergeConflict(true); throw e }
                })
              }}
                className="flex-1 rounded-md border border-ok-border bg-ok-bg py-2 text-sm font-medium text-ok transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Merge</button>
```
  (Keep the other review buttons as-is. `act` already surfaces the error message; the re-throw preserves that.)
  - Below the review actions row (still within the `status === 'review'` block), add the conflict button:
```tsx
              {mergeConflict && (
                <button disabled={busy} onClick={() => void act(() => api.resolve(item.id), false)}
                  className="mt-2 w-full rounded-md border border-accent bg-raised py-2 text-sm font-medium text-accent transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                  🤖 AI đồng bộ main + vá conflict
                </button>
              )}
```
  (After resolve dispatches, the task becomes `ai_running`; the drawer's existing "Mở console" button lets the owner watch. When it returns to `review`, Merge again.)
  - Verify token classes (`border-accent`, `bg-raised`, `text-accent`, `border-ok-border`, `bg-ok-bg`, `text-ok`) exist in `index.css`; substitute real names if needed.

- [ ] **Step 3: Gates.** `npm run typecheck` clean; `npx vite build ui` ok; `npx vitest run` green; grep-gate clean:
```bash
grep -rnE '(zinc|cyan|red|green|orange|rose|amber|slate|gray|neutral|stone|emerald|teal|sky|blue|indigo|violet|purple|fuchsia|pink|lime|yellow)-[0-9]' ui/src && echo GREP-DIRTY || echo GREP-CLEAN
```

- [ ] **Step 4: Commit.**
```bash
git add ui/src/api.ts ui/src/components/TaskDrawer.tsx
git commit -m "feat(board-ui): show 'AI resolve conflict' button when a merge conflicts"
```

---

### Task 5: deploy 0.25.0 + prove

- [ ] **Step 1: Gates.** `npm run typecheck && npx vite build ui && npx vitest run` + grep-gate clean.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.25.0`; commit `chore(jd): bump plugin to 0.25.0 (AI resolve conflict)`. Then `git checkout main && git merge --no-ff ai-resolve-conflict && git branch -d ai-resolve-conflict && git push origin main`.
- [ ] **Step 3: Build dist + restart — ONLY when no jobs running** (`curl /api/board` → 0 running/queued; else wait). Rebuild + relaunch `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`.
- [ ] **Step 4: Prove.**
  - `curl -s -o /dev/null -w '%{http_code}' -X POST http://127.0.0.1:4400/api/tasks/<a-backlog-id>/resolve` → 409 (not review).
  - For a real review task whose branch conflicts (e.g. TASK-075 if still conflicting): clicking Merge in the UI surfaces the conflict and shows the "🤖 AI đồng bộ main + vá conflict" button; clicking it dispatches a resolve job (task → ai_running, console watchable); on completion the task returns to review and Merge then succeeds. Report the live check of the endpoint + that the button wiring renders.

---

## Self-review notes

- Spec coverage: `JobKind resolve` + `buildResolvePrompt` (T1), `dispatchResolve` + existing-worktree `start()` branch + `!== 'rescan'` completion (T2), route with review+worktree guards (T3), conflict-triggered drawer button (T4), deploy (T5).
- Type consistency: `JobKind` extended once (types.ts); `buildResolvePrompt(item, requirements?)` signature used by runner; `dispatchResolve` returns `Job`; `api.resolve` returns `Job`. `requireReview`/`git.hasWorktree`/`afterSuccess` are existing surfaces.
- Safety: resolve never recreates the worktree (preserves work) and never touches main (all in the worktree); failure leaves main untouched and the task recoverable; review gate stays (no auto-merge). Restart guarded on no-running-jobs.
- The three `kind === 'task'` → `kind !== 'rescan'` edits are the only behavioral change to existing job handling; rescan path unchanged, task path unchanged (task is still `!== 'rescan'`).
