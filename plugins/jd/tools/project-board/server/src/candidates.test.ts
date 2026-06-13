import { describe, it, expect } from 'vitest'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from './jobs/candidates.js'
import type { Requirement } from './jobs/requirements.js'
import type { BoardItem } from '../../ui/src/types.js'

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
    expect(c[0].title).toBe('Hiện thực CAFE-R10: gRPC GetTheme')
    expect(c[0].body).toContain('Scan phát hiện: CAFE-R10 chưa làm')
    expect(c[0].body).toContain('Req: CAFE-R10')
    expect(c[0].body).toContain('theme < 1s')
    expect(c[0].body).toContain('Tiêu chí chấp nhận:')
  })
  it('partial -> complete P2 AND a test candidate (untested)', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R4')
    expect(c.map((x) => x.kind).sort()).toEqual(['implement', 'test'])
    expect(c.find((x) => x.kind === 'implement')!.title).toBe('Hoàn thiện CAFE-R4: Manifest v2 + delta')
    expect(c.find((x) => x.kind === 'implement')!.priority).toBe('P2')
  })
  it('done+untested -> test candidate only', () => {
    const c = cands.filter((x) => x.reqId === 'CAFE-R9')
    expect(c).toHaveLength(1)
    expect(c[0]).toMatchObject({ kind: 'test', priority: 'P2' })
    expect(c[0].title).toBe('Thêm test cho CAFE-R9: gRPC WatchUpdates')
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
  it('Vietnamese title live item suppresses the matching candidate', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-002', type: 'task', title: 'Thêm test cho CAFE-R9: gRPC WatchUpdates', status: 'ready',
      priority: 'P2', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'do it\nReq: CAFE-R9',
    }]
    const out = dedupeCandidates(cands, existing)
    expect(out.find((c) => c.reqId === 'CAFE-R9' && c.kind === 'test')).toBeUndefined()
    // implement candidate for a different req is still present
    expect(out.find((c) => c.reqId === 'CAFE-R10' && c.kind === 'implement')).toBeDefined()
  })
  it('CAFE-R12 live item does NOT suppress CAFE-R1 candidate (substring false-match regression)', () => {
    const STATUS_BOTH = `---
component: cafe-service
last_scanned: 2026-06-11
built: 71
tested: 82
---

| Req | State | Tested | Note |
|-----|-------|--------|------|
| CAFE-R1 | missing | no | not implemented |
| CAFE-R12 | missing | no | not implemented |
`
    const REQS_BOTH = new Map<string, Requirement>([
      ['CAFE-R1', { id: 'CAFE-R1', title: 'gRPC ListGames', statement: 'Lists games.', acceptance: [] }],
      ['CAFE-R12', { id: 'CAFE-R12', title: 'gRPC RegisterPC', statement: 'Registers PC.', acceptance: [] }],
    ])
    const candidates = buildCandidates(REQS_BOTH, [parseStatusDoc(STATUS_BOTH)])

    // A live item covers CAFE-R12 only
    const existing: BoardItem[] = [{
      id: 'TASK-010', type: 'task', title: 'Implement CAFE-R12: gRPC RegisterPC', status: 'ready',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'do it\nReq: CAFE-R12',
    }]
    const out = dedupeCandidates(candidates, existing)
    // CAFE-R1 must survive — it shares a prefix with CAFE-R12 but is a distinct requirement
    expect(out.find((c) => c.reqId === 'CAFE-R1' && c.kind === 'implement')).toBeDefined()
    // CAFE-R12 is covered by the live item and must be suppressed
    expect(out.find((c) => c.reqId === 'CAFE-R12' && c.kind === 'implement')).toBeUndefined()
  })

  it('a done item does NOT suppress (gap regressed)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Implement CAFE-R10: gRPC GetTheme', status: 'done',
      priority: 'P1', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11',
      body: 'Req: CAFE-R10',
    }]
    expect(dedupeCandidates(cands, existing).find((c) => c.reqId === 'CAFE-R10')).toBeDefined()
  })

  it('suppresses a candidate whose done task finished AFTER the last scan (pending re-verification)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Complete CAFE-R4: Manifest v2 + delta', status: 'done',
      priority: 'P2', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-12',
      body: 'Req: CAFE-R4',
    }]
    const out = dedupeCandidates(cands, existing, { 'cafe-service': '2026-06-11' })
    // implement candidate is hidden — the work was just done, the scan hasn't re-verified yet
    expect(out.find((c) => c.reqId === 'CAFE-R4' && c.kind === 'implement')).toBeUndefined()
    // the test candidate (no done test task) is still proposed
    expect(out.find((c) => c.reqId === 'CAFE-R4' && c.kind === 'test')).toBeDefined()
  })

  it('does NOT suppress when the done task is at/before the last scan (scan re-verified the gap)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Complete CAFE-R4: Manifest v2 + delta', status: 'done',
      priority: 'P2', component: 'cafe-service', created: '2026-06-09', updated: '2026-06-10',
      body: 'Req: CAFE-R4',
    }]
    const out = dedupeCandidates(cands, existing, { 'cafe-service': '2026-06-11' })
    expect(out.find((c) => c.reqId === 'CAFE-R4' && c.kind === 'implement')).toBeDefined()
  })

  it('without lastScanned, a done task never suppresses (back-compat)', () => {
    const existing: BoardItem[] = [{
      id: 'TASK-001', type: 'task', title: 'Complete CAFE-R4: Manifest v2 + delta', status: 'done',
      priority: 'P2', component: 'cafe-service', created: '2026-06-11', updated: '2026-06-12',
      body: 'Req: CAFE-R4',
    }]
    expect(dedupeCandidates(cands, existing).find((c) => c.reqId === 'CAFE-R4' && c.kind === 'implement')).toBeDefined()
  })
})

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
    const doc = parseStatusDoc(`---\ncomponent: x\nlast_scanned: 2026-06-13\n---\n\n| Req | State | Tested | Note |\n|--|--|--|--|\n| CS-R1 | done | yes | ok |\n`)
    expect(doc.rows).toHaveLength(1)
    expect(doc.details?.['CS-R1']).toBeUndefined()
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
