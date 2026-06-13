# Re-scan Vietnamese Projection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Re-scan writes a Vietnamese statement/AC projection into the status doc; `buildCandidates` uses it (falling back to the English requirement docs) — so new scan tasks are fully Vietnamese and re-derivable from the English spec. Per spec `docs/specs/2026-06-13-rescan-vi-projection-design.md`.

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `rescan-vi`, tool dir `plugins/jd/tools/project-board`.

---

### Task 1: parseStatusDoc details + buildCandidates VN/fallback (TDD)

**Files:** Modify `server/src/jobs/candidates.ts`; Test: `server/src/candidates.test.ts`.

- [ ] **Step 1: Branch.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b rescan-vi`.

- [ ] **Step 2: Failing tests** — append to `server/src/candidates.test.ts`:
```ts
describe('parseStatusDoc details (Vietnamese)', () => {
  const DOC = `---
component: cafe-service
last_scanned: 2026-06-13
built: 71
tested: 82
---

| Req | State | Tested | Note |
|-----|-------|--------|------|
| CAFE-R4 | partial | no | ghi chú |

## Chi tiết (Tiếng Việt)

### CAFE-R4
Mô tả: Phân tích manifest v2 và tải delta.
Tiêu chí chấp nhận:
- delta chỉ tải các chunk thay đổi
- chữ ký được xác minh
`
  it('parses Vietnamese statement + AC per requirement', () => {
    const doc = parseStatusDoc(DOC)
    expect(doc.details?.['CAFE-R4']?.statement).toBe('Phân tích manifest v2 và tải delta.')
    expect(doc.details?.['CAFE-R4']?.acceptance).toEqual(['delta chỉ tải các chunk thay đổi', 'chữ ký được xác minh'])
  })
  it('no detail section → details empty/undefined, rows intact', () => {
    const doc = parseStatusDoc(`---\ncomponent: x\nlast_scanned: 2026-06-13\n---\n\n| Req | State | Tested | Note |\n|--|--|--|--|\n| X-R1 | done | yes | ok |\n`)
    expect(doc.rows).toHaveLength(1)
    expect(doc.details?.['X-R1']).toBeUndefined()
  })
})

describe('buildCandidates uses Vietnamese details (fallback English)', () => {
  const REQS = new Map([['CAFE-R4', { id: 'CAFE-R4', title: 'Manifest v2', statement: 'Parses manifest v2.', acceptance: ['delta only', 'sig verified'] }]])
  it('prefers the status-doc Vietnamese statement/AC', () => {
    const doc = parseStatusDoc(`---\ncomponent: cafe-service\nlast_scanned: 2026-06-13\n---\n\n| Req | State | Tested | Note |\n|--|--|--|--|\n| CAFE-R4 | partial | no | n |\n\n## Chi tiết (Tiếng Việt)\n\n### CAFE-R4\nMô tả: Phân tích manifest v2.\nTiêu chí chấp nhận:\n- chỉ tải chunk đổi\n`)
    const c = buildCandidates(REQS, [doc]).find((x) => x.reqId === 'CAFE-R4' && x.kind === 'implement')!
    expect(c.body).toContain('Phân tích manifest v2.')
    expect(c.body).toContain('chỉ tải chunk đổi')
    expect(c.body).not.toContain('Parses manifest v2.')   // English not used when VN present
    expect(c.body).toContain('Req: CAFE-R4')
  })
  it('falls back to English reqIndex when no VN detail', () => {
    const doc = parseStatusDoc(`---\ncomponent: cafe-service\nlast_scanned: 2026-06-13\n---\n\n| Req | State | Tested | Note |\n|--|--|--|--|\n| CAFE-R4 | partial | no | n |\n`)
    const c = buildCandidates(REQS, [doc]).find((x) => x.reqId === 'CAFE-R4' && x.kind === 'implement')!
    expect(c.body).toContain('Parses manifest v2.')
    expect(c.body).toContain('delta only')
  })
})
```

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/candidates.test.ts` — FAIL.

- [ ] **Step 4: Implement in `server/src/jobs/candidates.ts`.**

Extend the interface:
```ts
export interface StatusDoc {
  component: string
  rows: StatusRow[]
  details?: Record<string, { statement: string; acceptance: string[] }>
}
```

In `parseStatusDoc`, after building `rows`, parse the detail section. Add a helper that scans lines for `### <ID>` blocks under `## Chi tiết (Tiếng Việt)`:
```ts
  const details: Record<string, { statement: string; acceptance: string[] }> = {}
  const lines = markdown.split('\n')
  let curId: string | null = null
  let inAcc = false
  for (const line of lines) {
    const h = line.match(/^###\s+([A-Z]{2,6}-R\d+)\s*$/)
    if (h) { curId = h[1]; details[curId] = { statement: '', acceptance: [] }; inAcc = false; continue }
    if (!curId) continue
    const mo = line.match(/^Mô tả:\s*(.*)$/)
    if (mo) { details[curId].statement = mo[1].trim(); inAcc = false; continue }
    if (/^Tiêu chí chấp nhận:\s*$/.test(line)) { inAcc = true; continue }
    if (inAcc) {
      const b = line.match(/^-\s+(.*)$/)
      if (b) { details[curId].acceptance.push(b[1].trim()); continue }
      if (line.trim() === '') continue
      inAcc = false   // a non-bullet, non-blank line ends the AC list
    }
  }
  return { component, rows, details: Object.keys(details).length ? details : undefined }
```
(Place after the `rows` loop; return `details` only when non-empty so `details` is undefined for docs without the section.)

Change `body()` to take the VN detail + English req fallback:
```ts
function body(detail: { statement: string; acceptance: string[] } | undefined, req: Requirement | undefined, reqId: string, lead: string): string {
  const statement = detail?.statement || req?.statement
  const acceptance = (detail?.acceptance.length ? detail.acceptance : req?.acceptance) ?? []
  const lines = [lead]
  if (statement) lines.push('', statement)
  if (acceptance.length > 0) {
    lines.push('', 'Tiêu chí chấp nhận:')
    for (const ac of acceptance) lines.push(`- ${ac}`)
  }
  lines.push('', `Req: ${reqId}`)
  return lines.join('\n')
}
```

In `buildCandidates`, look up the detail per row and pass it to every `body(...)` call:
```ts
  for (const doc of docs) {
    for (const row of doc.rows) {
      const req = reqIndex.get(row.id)
      const detail = doc.details?.[row.id]
      const title = req?.title ?? row.id
      if (row.state === 'missing') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P1',
          title: `Hiện thực ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} chưa làm. ${row.note}`.trim()) })
      } else if (row.state === 'partial') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Hoàn thiện ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} làm dở dang. ${row.note}`.trim()) })
      }
      if (row.state !== 'missing' && !row.tested) {
        out.push({ kind: 'test', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Thêm test cho ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} chưa có test. ${row.note}`.trim()) })
      }
    }
  }
```

- [ ] **Step 5:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean.

- [ ] **Step 6: Commit.**
```bash
git add server/src/jobs/candidates.ts server/src/candidates.test.ts
git commit -m "feat(board): buildCandidates uses Vietnamese statement/AC from the status doc (fallback English)"
```

---

### Task 2: Re-scan emits the Vietnamese detail section (TDD)

**Files:** Modify `server/src/jobs/prompt.ts`; Test: `server/src/prompt.test.ts`.

- [ ] **Step 1: Failing test** — append to `server/src/prompt.test.ts`:
```ts
describe('buildRescanPrompt Vietnamese detail', () => {
  it('instructs a Vietnamese detail section per requirement', () => {
    const p = buildRescanPrompt()
    expect(p).toContain('## Chi tiết (Tiếng Việt)')
    expect(p).toMatch(/Mô tả:/)
    expect(p).toMatch(/Tiêu chí chấp nhận:/)
  })
})
```

- [ ] **Step 2:** Run — FAIL.

- [ ] **Step 3: Implement in `server/src/jobs/prompt.ts`** `buildRescanPrompt`. After the existing status-table + Drift instructions (and before/with the existing Rules), add instructions to ALSO write the detail section. Append to the returned array (adapt to its current shape — it returns `[...].join('\n')`):
```ts
    '',
    'After the table and Drift, also write a Vietnamese detail section so the board reads',
    'in Vietnamese:',
    '',
    '## Chi tiết (Tiếng Việt)',
    '',
    'For EACH requirement <ID> in this component, a block:',
    '### <ID>',
    'Mô tả: <the requirement statement, translated to Vietnamese>',
    'Tiêu chí chấp nhận:',
    '- <each acceptance criterion, translated to Vietnamese>',
    '',
    'Keep code tokens, file paths, identifiers, and `backtick` snippets unchanged inside',
    'the Vietnamese text. Translate only the natural-language prose.',
```
(Keep the existing rules, including "Write the Note column in Vietnamese". Ensure the `## Chi tiết (Tiếng Việt)` literal appears verbatim so the parser matches.)

- [ ] **Step 4:** `npx vitest run` (full suite + new) green; `npm run typecheck` clean.

- [ ] **Step 5: Commit.**
```bash
git add server/src/jobs/prompt.ts server/src/prompt.test.ts
git commit -m "feat(board): rescan prompt emits a Vietnamese detail section (statement + AC)"
```

---

### Task 3: deploy 0.28.0 + prove

- [ ] **Step 1: Gates.** `npm run typecheck && npx vitest run` green.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.28.0`; commit `chore(jd): bump plugin to 0.28.0 (rescan VI projection)`. Then `git checkout main && git merge --no-ff rescan-vi && git branch -d rescan-vi && git push origin main`.
- [ ] **Step 3: Build + restart — ONLY when no jobs running.** Rebuild + relaunch as usual.
- [ ] **Step 4: Prove (read path, without spending an AI re-scan).** Manually append a `## Chi tiết (Tiếng Việt)` block for ONE requirement to its component's status doc in `project-board/data/status/<c>.md` (e.g. a real candidate's req), then `curl /api/scan-candidates` and confirm that candidate's body now shows the Vietnamese statement/AC (not English). Remove the manual block afterward OR leave it. Report. Then tell the owner: **run Re-scan once** to populate the Vietnamese detail for all components — after that, every new scan candidate is fully Vietnamese, re-derivable from the English spec.

---

## Self-review notes
- Spec coverage: status-doc VN detail parse (T1 parseStatusDoc), buildCandidates VN-with-English-fallback (T1 body), rescan emits the section (T2 prompt), deploy + prove (T3).
- Type consistency: `StatusDoc.details?: Record<string,{statement,acceptance}>`; `body(detail, req, reqId, lead)`; `buildCandidates` passes `doc.details?.[row.id]`. `Req: <ID>` literal + VN title prefix + English req-title unchanged.
- Back-compat: docs without the section → `details` undefined → buildCandidates falls back to English reqIndex (today's behavior). The 75 existing tasks untouched. Two-axis status (frontmatter + table) unaffected.
- Sync: Re-scan is the one action that regenerates the VN projection from the English spec.
