# Vietnamese Scan Candidates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Generated scan-candidate framing (titles, lead, "Acceptance" label) + Re-scan notes in Vietnamese — per spec `docs/specs/2026-06-12-vietnamese-candidates-design.md`. `Req: <ID>` stays literal; `itemKind` recognizes VI + EN prefixes.

**Repo:** `/home/gamesync/source/jd-claude-skill`, branch `vi-candidates`, tool dir `plugins/jd/tools/project-board`.

---

### Task 1: Localize candidates + itemKind + rescan note (TDD)

**Files:** Modify `server/src/jobs/candidates.ts`, `server/src/jobs/prompt.ts`; Test: `server/src/candidates.test.ts`.

- [ ] **Step 1: Branch.** `cd /home/gamesync/source/jd-claude-skill && git checkout -b vi-candidates`.

- [ ] **Step 2: Update the failing tests** — in `server/src/candidates.test.ts`, change the `buildCandidates` assertions to the Vietnamese strings:
  - missing → `c[0].title` is `Hiện thực CAFE-R10: gRPC GetTheme`; body contains `Scan phát hiện: CAFE-R10 chưa làm`.
  - partial → implement title `Hoàn thiện CAFE-R4: Manifest v2 + delta`.
  - untested → test title `Thêm test cho CAFE-R9: gRPC WatchUpdates`.
  - body still contains `Req: CAFE-R10` and now `Tiêu chí chấp nhận:` (where AC present). The requirement statement (e.g. `theme < 1s`) stays unchanged (English).
  - In the dedup tests, the live-item titles can stay English (`Implement CAFE-R10…`) to prove back-compat; ADD one dedup case with a Vietnamese-titled live item (`Thêm test cho CAFE-R9: …`, body `Req: CAFE-R9`) that suppresses the CAFE-R9 test candidate.

- [ ] **Step 3:** `cd plugins/jd/tools/project-board && npx vitest run server/src/candidates.test.ts` — FAIL (still English).

- [ ] **Step 4: Implement in `server/src/jobs/candidates.ts`.**

Translate `buildCandidates` titles + leads:
```ts
      if (row.state === 'missing') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P1',
          title: `Hiện thực ${row.id}: ${title}`, body: body(req, row.id, `Scan phát hiện: ${row.id} chưa làm. ${row.note}`.trim()) })
      } else if (row.state === 'partial') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Hoàn thiện ${row.id}: ${title}`, body: body(req, row.id, `Scan phát hiện: ${row.id} làm dở dang. ${row.note}`.trim()) })
      }
      if (row.state !== 'missing' && !row.tested) {
        out.push({ kind: 'test', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Thêm test cho ${row.id}: ${title}`, body: body(req, row.id, `Scan phát hiện: ${row.id} chưa có test. ${row.note}`.trim()) })
      }
```

In `body()`, translate the label (keep `Req:` literal):
```ts
  if (req && req.acceptance.length > 0) {
    lines.push('', 'Tiêu chí chấp nhận:')
    for (const ac of req.acceptance) lines.push(`- ${ac}`)
  }
  lines.push('', `Req: ${reqId}`)
```

In `itemKind`, recognize Vietnamese AND English prefixes:
```ts
function itemKind(item: BoardItem): 'implement' | 'test' | null {
  if (item.title.startsWith('Thêm test') || item.title.startsWith('Add tests')) return 'test'
  if (item.title.startsWith('Hiện thực ') || item.title.startsWith('Hoàn thiện ')
    || item.title.startsWith('Implement ') || item.title.startsWith('Complete ')) return 'implement'
  return null
}
```

- [ ] **Step 5: Rescan note in Vietnamese** — in `server/src/jobs/prompt.ts` `buildRescanPrompt`, add a rule so the AI writes the Note column in Vietnamese. After the existing "Rules:" bullets, add a line, e.g.:
```ts
    '- Write the "Note" column text in Vietnamese (the State/Tested values and table structure stay in English).',
```
(Place it among the existing rule bullets in the returned array.)

- [ ] **Step 6:** `npx vitest run` (full suite + updated) green; `npm run typecheck` clean.

- [ ] **Step 7: Commit.**
```bash
git add server/src/jobs/candidates.ts server/src/jobs/prompt.ts server/src/candidates.test.ts
git commit -m "feat(board): Vietnamese scan-candidate framing + rescan notes (Req: marker + EN dedup kept)"
```

---

### Task 2: deploy 0.27.0 + prove

- [ ] **Step 1: Gates.** `npm run typecheck && npx vitest run` green.
- [ ] **Step 2: Version + merge + push.** Bump `plugins/jd/.claude-plugin/plugin.json` → `0.27.0`; commit `chore(jd): bump plugin to 0.27.0 (vietnamese candidates)`. Then `git checkout main && git merge --no-ff vi-candidates && git branch -d vi-candidates && git push origin main`.
- [ ] **Step 3: Build + restart — ONLY when no jobs running.** Rebuild + relaunch as usual.
- [ ] **Step 4: Prove.** `curl -s http://127.0.0.1:4400/api/scan-candidates | node -e '…'` → candidate titles start with `Hiện thực`/`Hoàn thiện`/`Thêm test cho`; bodies contain `Scan phát hiện:` + `Req: <ID>`. (Existing English tasks still dedupe — no duplicate candidates appear for reqs already covered.) Note: existing English tasks on the board are unchanged; only NEW candidates are Vietnamese; Re-scan notes become Vietnamese on the next re-scan.

---

## Self-review notes
- Spec coverage: titles/leads/label localized (T1 buildCandidates+body), itemKind VI+EN (T1), rescan note VI (T1 prompt), deploy (T2). `Req:` literal kept; requirement statement/AC untouched.
- Back-compat: itemKind matches old English titles, so the 50+ already-created English test/implement tasks still dedup and classify; `Candidate.kind` set explicitly (not from title) so requiresShaping/test-split unaffected.
- Risk: low — string + classifier change; dedup `Req: <ID>` line-match unchanged.
