# Tombstone Requirements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A requirement whose title ends with `REMOVED` (a tombstone, e.g. `IDC-R7`) must never generate board candidates — neither implement nor test. Per spec `docs/specs/2026-06-15-tombstone-requirements-design.md`.

**Architecture:** Parse a `removed` flag off the requirement title; `buildCandidates` skips rows whose requirement is removed. Re-scan and the status-doc format are untouched.

**Tech Stack:** TS NodeNext ESM (`.js` import suffixes), vitest. Server-only change.

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `idc-r7-tombstone` (already created). Tool dir `plugins/jd/tools/project-board` — run npx/npm there.

**Design note:** `Requirement.removed` is OPTIONAL (`removed?: boolean`), not required, so existing `Requirement` object literals in tests (e.g. `candidates.test.ts:200`) keep compiling. The parser always sets it; consumers read `req?.removed` (absent ⇒ not a tombstone).

---

### Task 1: Parse the `removed` tombstone flag (TDD)

**Files:** Modify `server/src/jobs/requirements.ts`; Test: `server/src/requirements.test.ts`.

- [ ] **Step 1: Write the failing test** — append to the `describe('parseRequirementDoc', ...)` block (or add a new describe) in `server/src/requirements.test.ts`:
```ts
describe('parseRequirementDoc tombstones', () => {
  const DOC = `# x — Requirements

## IDC-R7: Manifest chunk-level diff — REMOVED
The server endpoint has been removed; do not reuse.

## CAFE-R4: Manifest v2 + differential update
Parses manifest v2 and applies chunk deltas.

## X-R1: Handle removed files
Cleans up files the manifest no longer lists.
`
  it('flags a requirement whose title ends with REMOVED as removed', () => {
    const byId = Object.fromEntries(parseRequirementDoc(DOC).map((r) => [r.id, r]))
    expect(byId['IDC-R7'].removed).toBe(true)
    expect(byId['CAFE-R4'].removed).toBe(false)
    // end-anchored + word-boundary: "removed" mid-title is NOT a tombstone
    expect(byId['X-R1'].removed).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd plugins/jd/tools/project-board && npx vitest run server/src/requirements.test.ts`. Expected: FAIL (`removed` is `undefined`, not `true`/`false`).

- [ ] **Step 3: Implement** in `server/src/jobs/requirements.ts`:
  - Add the optional field to the interface:
```ts
export interface Requirement {
  id: string
  title: string
  statement: string
  acceptance: string[]
  removed?: boolean
}
```
  - In `parseRequirementDoc`, where the heading is matched and `cur` is created, set `removed` from the title. Replace:
```ts
      cur = { id: h[1], title: h[2].trim(), statement: '', acceptance: [] }
```
  with:
```ts
      const title = h[2].trim()
      cur = { id: h[1], title, statement: '', acceptance: [], removed: /\bREMOVED\s*$/i.test(title) }
```

- [ ] **Step 4: Run to verify it passes** — `npx vitest run server/src/requirements.test.ts`. Expected: PASS. Then `npm run typecheck` clean.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/requirements.ts server/src/requirements.test.ts
git commit -m "feat(board): parse a 'removed' tombstone flag from requirement titles (title ending in REMOVED)"
```

---

### Task 2: Suppress candidates for removed requirements (TDD)

**Files:** Modify `server/src/jobs/candidates.ts`; Test: `server/src/candidates.test.ts`.

Context: `buildCandidates(reqIndex, docs)` loops `for (const doc of docs) { for (const row of doc.rows) { const req = reqIndex.get(row.id); ... } }` and pushes implement/test candidates based on `row.state`/`row.tested` (candidates.ts:59-80). `parseStatusDoc(markdown)` builds a `StatusDoc` with `.rows`. Tests construct a `reqIndex` as `new Map<string, Requirement>([...])` and a status doc via `parseStatusDoc(...)`.

- [ ] **Step 1: Write the failing test** — append to `server/src/candidates.test.ts`:
```ts
describe('buildCandidates skips removed (tombstone) requirements', () => {
  const STATUS = `---
component: idc-backend
last_scanned: 2026-06-15
---

| Req | State | Tested | Note |
|--|--|--|--|
| IDC-R7 | done | no | tombstone: endpoint removed |
| IDC-R8 | done | no | still real, just untested |
`
  it('emits no candidate for a removed req, but still does for a normal one', () => {
    const reqs = new Map<string, Requirement>([
      ['IDC-R7', { id: 'IDC-R7', title: 'Manifest diff — REMOVED', statement: '', acceptance: [], removed: true }],
      ['IDC-R8', { id: 'IDC-R8', title: 'Something real', statement: '', acceptance: [] }],
    ])
    const cands = buildCandidates(reqs, [parseStatusDoc(STATUS)])
    expect(cands.some((c) => c.reqId === 'IDC-R7')).toBe(false)
    // IDC-R8 is done+untested → still proposes a test candidate (unchanged behaviour)
    expect(cands.some((c) => c.reqId === 'IDC-R8' && c.kind === 'test')).toBe(true)
  })

  it('skips a removed req regardless of state (missing/partial)', () => {
    for (const state of ['missing', 'partial']) {
      const status = `---\ncomponent: c\nlast_scanned: 2026-06-15\n---\n\n| Req | State | Tested | Note |\n|--|--|--|--|\n| Z-R1 | ${state} | no | x |\n`
      const reqs = new Map<string, Requirement>([
        ['Z-R1', { id: 'Z-R1', title: 'Gone — REMOVED', statement: '', acceptance: [], removed: true }],
      ])
      expect(buildCandidates(reqs, [parseStatusDoc(status)]).length).toBe(0)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run server/src/candidates.test.ts`. Expected: FAIL (IDC-R7 / Z-R1 candidates still emitted).

- [ ] **Step 3: Implement** in `server/src/jobs/candidates.ts`, inside `buildCandidates`'s row loop, immediately after `const req = reqIndex.get(row.id)`:
```ts
      const req = reqIndex.get(row.id)
      if (req?.removed) continue // tombstone: removed requirement never generates candidates
      const detail = doc.details?.[row.id]
```
(The `const detail = ...` line already exists right after — keep it; just insert the guard between `req` and `detail`.)

- [ ] **Step 4: Run to verify it passes** — `npx vitest run server/src/candidates.test.ts` PASS; then `npx vitest run` (full suite) green; `npm run typecheck` clean.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/candidates.ts server/src/candidates.test.ts
git commit -m "feat(board): buildCandidates skips removed (tombstone) requirements"
```

---

### Task 3: Deploy + verify on the live board

- [ ] **Step 1: Final gates.** From the tool dir: `npm run typecheck && npx vitest run` green.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` `0.31.0` → `0.31.1`; commit `chore(jd): bump plugin to 0.31.1 (tombstone requirements)`. Then `git checkout main && git merge --no-ff idc-r7-tombstone -m "Merge idc-r7-tombstone: tombstone requirements skip candidates" && git branch -d idc-r7-tombstone && git push origin main`. (NOTE: per the owner's preference, PAUSE before this step and let the owner inspect the diff first.)
- [ ] **Step 3: Build + restart — ONLY when idle.** Confirm no active board jobs (`/api/jobs` none running/queued, no real `claude -p` job). Then `npm run build` from the tool dir; stop the running `node dist/server/src/index.js`; relaunch with the SAME env (`BOARD_HOST=0.0.0.0 BOARD_REPO_ROOT=/home/gamesync/source/gamesync BOARD_PORT=4400`) via nohup appending to `/home/gamesync/source/gamesync/project-board/board.log`.
- [ ] **Step 4: Verify live.** `curl -s http://127.0.0.1:4400/api/scan-candidates` →
  - MUST NOT contain any candidate with `reqId: 'IDC-R7'`.
  - MUST still contain the `reqId: 'CAFE-R4'` implement candidate.
- [ ] **Step 5: Tombstone sweep.** Grep all status docs + requirements for other tombstones (`grep -rl 'REMOVED' /home/gamesync/source/gamesync/docs/requirements/components/`) and confirm none still emit candidates (cross-check against the live `/api/scan-candidates` reqIds). Report any found.

---

## Self-review notes
- **Spec coverage:** `removed` flag parsed from title `\bREMOVED\s*$` (T1); `buildCandidates` skips removed reqs for all states/kinds (T2); deploy + live assert IDC-R7 gone & CAFE-R4 kept + tombstone sweep (T3).
- **Type consistency:** `Requirement.removed?: boolean` (optional, T1) read as `req?.removed` in `buildCandidates` (T2). Optional keeps existing `Requirement` literals in `candidates.test.ts` compiling.
- **Edge cases tested:** end-anchored/word-boundary regex (mid-title "removed" not a tombstone, T1); removed req with missing/partial/done state all suppressed (T2); a non-removed done+untested req still emits its test candidate (no over-suppression, T2).
- **No re-scan / status-doc / UI changes** (out of scope). CAFE-R4 untouched.
