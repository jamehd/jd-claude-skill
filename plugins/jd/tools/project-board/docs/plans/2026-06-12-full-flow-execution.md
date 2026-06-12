# Full-Flow Task Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Plan-attached tasks execute via `superpowers:subagent-driven-development`; the board enforces a per-component test gate after the implement commit before a task reaches `review` — per spec `docs/specs/2026-06-12-full-flow-execution-design.md`.

**Architecture:** `buildTaskPrompt` switches to a skill-driven instruction when a plan is attached. The runner, on a successful implement (kind `!== 'rescan'`, exit 0 + ≥1 commit), runs the component's test command (`data/test-commands.json`) as a non-blocking child process reusing the existing proc machinery; pass → review, fail → ready/backlog.

**Tech Stack:** existing Fastify/vitest stack (no UI change).

**Repo:** all in `/home/gamesync/source/jd-claude-skill`, branch `full-flow-exec`, tool dir `plugins/jd/tools/project-board`.

---

## File structure

```
server/src/jobs/prompt.ts             # buildTaskPrompt: skill-driven when plan attached
server/src/prompt.test.ts             # prompt test
server/src/jobs/runner.ts             # testCommandFor + startTestGate + onSegmentExit hook
server/src/runner.test.ts             # test-gate tests
project-board/data/test-commands.json # (deploy step) gamesync seed — in the target repo, gitignored
```

---

### Task 1: Skill-driven prompt when a plan is attached (TDD)

**Files:** Modify `server/src/jobs/prompt.ts`; Test: `server/src/prompt.test.ts`.

- [ ] **Step 1: Branch.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b full-flow-exec`.

- [ ] **Step 2: Failing tests** — append to `server/src/prompt.test.ts` (uses `itemFull`):
```ts
describe('buildTaskPrompt skill-driven', () => {
  it('references subagent-driven-development when a plan is attached', () => {
    const p = buildTaskPrompt(itemFull({ plan: 'Step 1. do it' }))
    expect(p).toMatch(/subagent-driven-development/)
    expect(p).toContain('APPROVED PLAN')
  })
  it('does NOT reference the skill when there is no plan', () => {
    const p = buildTaskPrompt(itemFull())
    expect(p).not.toMatch(/subagent-driven-development/)
  })
})
```

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/prompt.test.ts` — FAIL.

- [ ] **Step 4: Implement in `server/src/jobs/prompt.ts`.** In `buildTaskPrompt`, the current step 1 line is `'1. Implement the item and run the tests relevant to your change.'` inside the `lines` array. Make the instruction conditional on `item.plan`. Replace the fixed instruction block so that when a plan is attached the agent is told to use the skill. Concretely, after building the base `lines` (header + ITEM FILE) but adjust the numbered MUST-DO list: keep it, but PREPEND a skill directive when `item.plan?.trim()`:
```ts
  if (item.plan?.trim()) {
    lines.push(
      '',
      'An approved implementation plan is provided below (APPROVED PLAN). Execute it using',
      'the `superpowers:subagent-driven-development` skill: a fresh implementer per task (TDD),',
      'then a spec-compliance review and a code-quality review, fixing issues before moving on.',
    )
  }
```
Place this push BEFORE the existing `'You MUST finish by doing ALL of the following:'` block (so the skill directive + the existing finish-requirements + the APPROVED PLAN block all appear). The existing requirements (commit, summary, don't touch data/, don't push) stay for both cases. Verify the APPROVED PLAN block (added by the earlier plan-injection feature) still renders after.

- [ ] **Step 5:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean.

- [ ] **Step 6: Commit.**
```bash
git add server/src/jobs/prompt.ts server/src/prompt.test.ts
git commit -m "feat(board): plan-attached tasks instruct subagent-driven-development"
```

---

### Task 2: Board test gate (TDD)

**Files:** Modify `server/src/jobs/runner.ts`; Test: `server/src/runner.test.ts`.

- [ ] **Step 1: Failing tests** — append to `server/src/runner.test.ts`. The fake `spawnFn` records each spawn in `t.spawnCalls` (array of arg arrays) and pushes a FakeProc to `t.procs`; `sendInit(i)` + `procs[i].emit('exit', code)` drive proc `i`. The test-gate spawns a SECOND proc (`bash -lc <cmd>`). Write `data/test-commands.json` via `t.dataDir`.

```ts
import { writeFileSync as writeFileSyncNode } from 'node:fs'   // if not already imported

describe('board test gate', () => {
  function gatedTask(t: ReturnType<typeof setup>) {
    const id = t.store.createItem({ type: 'task', title: 'x', component: 'infra' }).id
    t.store.updateItem(id, { status: 'ready' })
    return id
  }
  function setCmd(t: ReturnType<typeof setup>, map: Record<string, string>) {
    writeFileSyncNode(`${t.dataDir}/test-commands.json`, JSON.stringify(map))
  }

  it('runs the component test command after a successful implement; pass → review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    setCmd(t, { infra: 'echo ok' })
    const id = gatedTask(t)
    t.runner.dispatchTask(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)                                 // implement done
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2)) // test gate spawned
    expect(t.spawnCalls[1][0]).toContain('bash')               // bash -lc <cmd>  (adapt to how spawnFn is called)
    expect(t.store.getItem(id)?.status).toBe('ai_running')     // not review yet — gate running
    t.procs[1].emit('exit', 0)                                 // gate passes
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
  })

  it('a failing test gate keeps the task out of review', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    setCmd(t, { infra: 'exit 1' })
    const id = gatedTask(t)
    t.runner.dispatchTask(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.spawnCalls.length).toBe(2))
    t.procs[1].emit('exit', 1)                                 // gate fails
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).not.toBe('review'))
    expect(t.store.getItem(id)?.status).toBe('ready')           // or 'backlog' if gated; assert not review + not ai_running
  })

  it('no configured command → straight to review (single spawn)', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['a.ts'])
    // no test-commands.json
    const id = gatedTask(t)
    t.runner.dispatchTask(id)
    t.sendInit(0)
    t.procs[0].emit('exit', 0)
    await vi.waitFor(() => expect(t.store.getItem(id)?.status).toBe('review'))
    expect(t.spawnCalls.length).toBe(1)                         // no gate spawn
  })
})
```
Adapt to the real fake-spawn shape: how the bin/args are recorded in `spawnCalls` (assert the gate spawn uses `bash` with `-lc` and the command), and how a proc's exit is emitted. Keep the intents: gate spawns after implement, pass→review, fail→not-review, no-config→review-single-spawn.

- [ ] **Step 2:** Run — FAIL (no gate).

- [ ] **Step 3: Implement in `server/src/jobs/runner.ts`.**

(a) `testCommandFor`:
```ts
  private testCommandFor(job: Job): string | undefined {
    if (!job.taskId) return undefined
    const item = this.deps!.store.getItem(job.taskId)
    if (!item) return undefined
    try {
      const map = JSON.parse(readFileSync(path.join(this.deps!.store.dataDir, 'test-commands.json'), 'utf8')) as Record<string, string>
      const cmd = map[item.component]
      return cmd && cmd.trim() ? cmd : undefined
    } catch { return undefined }   // missing/corrupt config → no gate
  }
```

(b) `startTestGate` (reuses `running`/`armTimer`/`logFile`/`emit`/`finish`/`afterSuccess`/`afterFailure`/`pump`):
```ts
  private startTestGate(job: Job, cmd: string): void {
    this.note(job, 'info', `Test gate: ${cmd}`)
    const cwd = this.cwds.get(job.id) ?? this.deps!.git.worktreePath(job.taskId!)
    const proc = this.spawnFn('bash', ['-lc', cmd], { cwd })
    this.running.set(job.id, { proc, steering: false, buffer: '' })
    this.armTimer(job)
    const onChunk = (b: Buffer) => {
      const text = b.toString()
      appendFileSync(this.logFile(job), JSON.stringify({ _board: 'raw', text }) + '\n')
      this.emit(job, { kind: 'raw', text })
    }
    proc.stdout?.on('data', onChunk)
    proc.stderr?.on('data', onChunk)
    proc.on('exit', (code) => {
      if (this.running.get(job.id)?.proc !== proc) return     // superseded (e.g. cancelled)
      this.running.delete(job.id)
      this.clearTimer(job.id)
      if (code === 0) {
        this.afterSuccess(job)
        this.finish(job, 'succeeded')
      } else {
        this.afterFailure(job, `test gate failed (exit ${code}): ${cmd}`)
        this.finish(job, 'failed')
      }
      this.pump()
    })
  }
```

(c) Hook in `onSegmentExit`'s success branch. The current code is:
```ts
    if (this.completedSuccessfully(job)) {
      if (job.kind !== 'rescan') {
        this.afterSuccess(job)
        this.finish(job, 'succeeded')
      } else {
        const strayReason = this.checkRescanStray(job)
        if (strayReason) this.finish(job, 'failed', strayReason)
        else this.finish(job, 'succeeded')
      }
    } else { … afterFailure … }
    this.pump()
```
Change the `job.kind !== 'rescan'` success branch to run the gate when a command exists (and return early so the trailing `pump()` doesn't double-fire — the gate's exit handler pumps):
```ts
      if (job.kind !== 'rescan') {
        const cmd = this.testCommandFor(job)
        if (cmd) { this.startTestGate(job, cmd); return }   // async; finalize on gate exit
        this.afterSuccess(job)
        this.finish(job, 'succeeded')
      } else { … rescan unchanged … }
```
(Confirm `appendFileSync`/`readFileSync`/`path` are imported in runner.ts — they are.)

- [ ] **Step 4:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean. Adapt only test-harness mechanics (how the fake spawn records bash + how exit is emitted on the gate proc); never weaken assertions.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/runner.ts server/src/runner.test.ts
git commit -m "feat(board): enforced per-component test gate before a task reaches review"
```

---

### Task 3: deploy 0.26.0 + seed + prove

- [ ] **Step 1: Gates.** `cd plugins/jd/tools/project-board && npm run typecheck && npx vitest run` green (grep-gate not needed — no UI change, but run it: clean).
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.26.0`; commit `chore(jd): bump plugin to 0.26.0 (full-flow execution)`. Then `git checkout main && git merge --no-ff full-flow-exec && git branch -d full-flow-exec && git push origin main`.
- [ ] **Step 3: Seed the test-commands config in the gamesync data dir** (NOT in the jd repo — it lives in the target repo, gitignored):
```bash
cat > /home/gamesync/source/gamesync/project-board/data/test-commands.json <<'JSON'
{
  "cafe-service": "cd cafe-service && go test ./...",
  "idc-backend": "cd idc_backend && go test ./...",
  "launcher-downloader": "cd launcher && npm ci && npx vitest run",
  "launcher-user": "cd launcher && npm ci && npx vitest run",
  "launcher-packer": "cd launcher && npm ci && npx vitest run",
  "admin-web": "cd admin-web && npm ci && npm run lint"
}
JSON
```
(Adjust the `cd <subdir>` to the real component code layout; confirm each subdir exists under the gamesync root before finalizing. `infra` intentionally omitted — its tasks skip the gate.)
- [ ] **Step 4: Build dist + restart — ONLY when no jobs running** (`curl /api/board` → 0 running/queued; else wait). Rebuild + relaunch `BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400 BOARD_HOST=0.0.0.0 nohup node dist/server/src/index.js > project-board/board.log 2>&1 &`.
- [ ] **Step 5: Prove.**
  - `cat /home/gamesync/source/gamesync/project-board/data/test-commands.json` exists with the map.
  - The gate is unit-proven; a full live prove would require running a real task. Confirm the board is live (`curl /api/auto` → 200) and report that the gate engages on the next dispatched task whose component has a command (its console will show "Test gate: <cmd>" then the test output; pass → review, fail → ready).

---

## Self-review notes

- Spec coverage: skill-driven prompt when plan attached (T1), enforced per-component test gate reusing proc machinery (T2), seed + deploy (T3). Trivial (no-plan) tasks unchanged prompt; no-config components skip the gate.
- Type consistency: `testCommandFor`/`startTestGate` private on JobRunner; gate stored as a `SegmentEntry` (`{proc, steering:false, buffer:''}`) in `running`; reuses `armTimer`/`clearTimer`/`logFile`/`emit`/`afterSuccess`/`afterFailure`/`finish`/`pump`. `kind !== 'rescan'` already covers task + resolve (so resolve jobs are also gated — desirable).
- Safety: gate is non-blocking (spawned child); holds the concurrency slot via `running`; cancel/shutdown kill it (in `running`); timeout via `armTimer`; a missing/corrupt config → no gate (never throws). Main is untouched (gate runs in the worktree). Fail → task out of review, worktree kept, log appended.
- Cost: the skill-driven prompt makes plan-tasks spawn nested subagents (heavier); the gate is the independent enforcement. Documented.
