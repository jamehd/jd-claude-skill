import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildTaskPrompt, buildRescanPrompt, buildBrainstormPrompt, buildResolvePrompt } from './jobs/prompt.js'
import type { Requirement } from './jobs/requirements.js'
import type { BoardItem } from '../../ui/src/types.js'

function item(body: string): BoardItem {
  return { id: 'TASK-001', type: 'task', title: 'Do it', status: 'ready', priority: 'P2',
    component: 'cafe-service', created: '2026-06-11', updated: '2026-06-11', body }
}

function itemFull(extra: Partial<BoardItem> = {}): BoardItem {
  return { id: 'TASK-001', type: 'task', title: 'Do X', status: 'ready', priority: 'P2',
    component: 'infra', created: '2026-06-12', updated: '2026-06-12', body: 'Build the thing.\n', ...extra }
}
const REQS = new Map<string, Requirement>([
  ['CAFE-R3', { id: 'CAFE-R3', title: 'GetTheme RPC', statement: 'Serves theme over gRPC.', acceptance: ['theme < 1s', 'tests both paths'] }],
])

describe('buildTaskPrompt with requirements', () => {
  it('injects matched requirements referenced in the body', () => {
    const p = buildTaskPrompt(item('Implement the theme RPC. Req: CAFE-R3'), REQS)
    expect(p).toContain('REQUIREMENTS YOU MUST SATISFY')
    expect(p).toContain('CAFE-R3 — GetTheme RPC')
    expect(p).toContain('Serves theme over gRPC.')
    expect(p).toContain('theme < 1s')
  })
  it('notes unknown ids without throwing', () => {
    const p = buildTaskPrompt(item('Req: CAFE-R99'), REQS)
    expect(p).toContain('CAFE-R99')
    expect(p).toMatch(/not found in docs\/requirements/i)
  })
  it('is unchanged when the body references no requirement ids', () => {
    const withReqs = buildTaskPrompt(item('just do the thing'), REQS)
    const without = buildTaskPrompt(item('just do the thing'))
    expect(withReqs).toBe(without)
    expect(withReqs).not.toContain('REQUIREMENTS YOU MUST SATISFY')
  })
})

describe('buildRescanPrompt (requirements-aware)', () => {
  const p = buildRescanPrompt()
  it('directs reading the requirement docs', () => {
    expect(p).toContain('docs/requirements/components')
  })
  it('directs writing the per-id status table format', () => {
    expect(p).toMatch(/\| ?Req ?\| ?State ?\| ?Tested/i)
  })
  it('directs the two status axes (built and tested) in frontmatter', () => {
    expect(p).toContain('built')
    expect(p).toContain('tested')
    expect(p).not.toContain('completion')
  })
  it('directs reporting drift', () => {
    expect(p.toLowerCase()).toContain('drift')
  })
  it('keeps the write-to-status-only, no-git constraint', () => {
    expect(p).toContain('project-board/data/status')
    expect(p.toLowerCase()).toMatch(/do not (run )?git|do not commit/)
  })
})

describe('buildBrainstormPrompt', () => {
  it('includes the title, body, and brainstorm/plan instructions', () => {
    const p = buildBrainstormPrompt(itemFull())
    expect(p).toContain('Do X')
    expect(p).toContain('Build the thing.')
    expect(p).toMatch(/brainstorm/i)
    expect(p).toMatch(/docs\/plans/)
  })
})

describe('buildTaskPrompt plan injection', () => {
  it('injects inline plan text', () => {
    const p = buildTaskPrompt(itemFull({ plan: 'Step 1. do it' }))
    expect(p).toContain('APPROVED PLAN')
    expect(p).toContain('Step 1. do it')
  })
  it('reads a plan file when plan is an existing repo path', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bg-'))
    mkdirSync(path.join(root, 'docs', 'plans'), { recursive: true })
    writeFileSync(path.join(root, 'docs/plans/p.md'), '# The Plan\nDetailed steps here.')
    const p = buildTaskPrompt(itemFull({ plan: 'docs/plans/p.md' }), undefined, root)
    expect(p).toContain('Detailed steps here.')
  })
  it('treats a non-existent .md path as inline text (non-fatal)', () => {
    const p = buildTaskPrompt(itemFull({ plan: 'docs/plans/missing.md' }), undefined, '/nonexistent-root')
    expect(p).toContain('docs/plans/missing.md')
    expect(p).toContain('APPROVED PLAN')
  })
  it('omits the plan block when no plan', () => {
    expect(buildTaskPrompt(itemFull())).not.toContain('APPROVED PLAN')
  })
  it('does not read a file outside repoRoot (path traversal is treated as inline)', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'bg-'))
    const secretDir = mkdtempSync(path.join(tmpdir(), 'secret-'))
    writeFileSync(path.join(secretDir, 'leak.md'), 'TOP SECRET CONTENT')
    const rel = path.join(path.relative(root, secretDir), 'leak.md') // e.g. ../secret-xxx/leak.md
    const p = buildTaskPrompt(itemFull({ plan: rel }), undefined, root)
    expect(p).not.toContain('TOP SECRET CONTENT')
    expect(p).toContain(rel) // the escaping path is kept as inline text, not read
  })
})

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

describe('buildRescanPrompt Vietnamese detail', () => {
  it('instructs a Vietnamese detail section per requirement', () => {
    const p = buildRescanPrompt()
    expect(p).toContain('## Chi tiết (Tiếng Việt)')
    expect(p).toMatch(/Mô tả:/)
    expect(p).toMatch(/Tiêu chí chấp nhận:/)
  })
})
