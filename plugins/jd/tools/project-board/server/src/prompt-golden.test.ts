import { describe, it, expect } from 'vitest'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildTaskPrompt, buildResolvePrompt, buildBrainstormPrompt, buildRescanPrompt, e2eReviewNote } from './jobs/prompt.js'
import { buildCandidates } from './jobs/candidates.js'
import { gamesyncConfig, minimalConfig } from './fixtures/load.js'
import { goldenItem, GOLDEN_REQS, GOLDEN_PLAN, GOLDEN_STATUS_DOCS, GOLDEN_REQ_INDEX } from './fixtures/golden-inputs.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const golden = (name: string) => readFileSync(path.join(here, 'fixtures/golden', name), 'utf8')
const G = gamesyncConfig()

describe('GameSync config reproduces the original prompts byte-for-byte', () => {
  it('task prompts', () => {
    expect(buildTaskPrompt(goldenItem({ body: 'Just do it.\n' }), G)).toBe(golden('task-basic.txt'))
    expect(buildTaskPrompt(goldenItem({ extra: { needsE2e: true } }), G)).toBe(golden('task-e2e-true.txt'))
    expect(buildTaskPrompt(goldenItem({ extra: { needsE2e: false } }), G)).toBe(golden('task-e2e-false.txt'))
    expect(buildTaskPrompt(goldenItem(), G, GOLDEN_REQS)).toBe(golden('task-reqs.txt'))
    expect(buildTaskPrompt(goldenItem({ plan: GOLDEN_PLAN }), G, GOLDEN_REQS)).toBe(golden('task-plan.txt'))
  })

  it('task prompt with a plan file', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'gold-'))
    mkdirSync(path.join(root, 'docs/plans'), { recursive: true })
    writeFileSync(path.join(root, 'docs/plans/p.md'), GOLDEN_PLAN)
    expect(buildTaskPrompt(goldenItem({ plan: 'docs/plans/p.md' }), G, GOLDEN_REQS, root)).toBe(golden('task-plan-file.txt'))
  })

  it('resolve, brainstorm, rescan', () => {
    expect(buildResolvePrompt(goldenItem({ body: 'Just do it.\n' }), G)).toBe(golden('resolve.txt'))
    expect(buildResolvePrompt(goldenItem(), G, GOLDEN_REQS)).toBe(golden('resolve-reqs.txt'))
    expect(buildBrainstormPrompt(goldenItem({ body: 'Just do it.\n' }), G)).toBe(golden('brainstorm.txt'))
    expect(buildBrainstormPrompt(goldenItem(), G, GOLDEN_REQS)).toBe(golden('brainstorm-reqs.txt'))
    expect(buildRescanPrompt(G)).toBe(golden('rescan.txt'))
  })

  it('runner e2e review note', () => {
    expect(e2eReviewNote(G)).toBe(golden('e2e-review-note.txt'))
  })

  it('candidates', () => {
    const out = JSON.stringify(buildCandidates(GOLDEN_REQ_INDEX, GOLDEN_STATUS_DOCS, G), null, 2)
    expect(out).toBe(golden('candidates.json'))
  })
})

describe('a minimal config drives the text and leaks no GameSync wording', () => {
  const M = minimalConfig()
  const FORBIDDEN = /GameSync|cafe-win|CAFE-R|DL-R|Hyundai|IDC|menu-game|packer|Vietnam|Tiếng|Tiêu chí|Mô tả|Hiện thực/
  const needsE2e = goldenItem({ body: 'Do it.\n', extra: { needsE2e: true } })
  const outputs = {
    task: buildTaskPrompt(needsE2e, M),
    resolve: buildResolvePrompt(goldenItem({ body: 'Do it.\n' }), M),
    brainstorm: buildBrainstormPrompt(goldenItem({ body: 'Do it.\n' }), M),
    rescan: buildRescanPrompt(M),
    note: e2eReviewNote(M),
  }

  it('contains no forbidden term', () => {
    for (const [name, text] of Object.entries(outputs)) expect(text, name).not.toMatch(FORBIDDEN)
  })

  it('uses project, branch prefix, e2e host and note', () => {
    expect(outputs.task).toContain('branch bd/TASK-007 of the Acme Billing repo')
    expect(outputs.task).toContain('manual e2e on lab-rig.')
    expect(outputs.task).toContain('Use the staging terminal with the test card.')
    expect(outputs.note).toBe('MANUAL E2E REQUIRED — run e2e on lab-rig and verify before merging.\nUse the staging terminal with the test card.')
    expect(outputs.resolve).toContain('branch bd/TASK-007 of the Acme Billing repo')
    expect(outputs.brainstorm).toContain('for the Acme Billing project')
    expect(outputs.rescan).toContain('Acme Billing repository')
  })

  it('builds the audit sentence from audits.*', () => {
    expect(outputs.task).toContain('domain audits (custom:security-audit always; db-audit when the diff changes the database schema; never e2e)')
    expect(outputs.task).not.toContain('ui-design-audit')
  })

  it('adds no language instructions when language.owner is empty', () => {
    expect(outputs.rescan).not.toMatch(/translated to|detail section|"Note" column text in/)
    expect(outputs.rescan).not.toContain('Acceptance criteria:')
  })

  it('does not print a Req example without requirements.id_example', () => {
    expect(outputs.task).toContain('with a "Req: <ID>" trailer. Use')
  })

  it('does not name a host when e2e.host is empty', () => {
    const noHost = { ...M, e2e: { ...M.e2e, host: '', note: '' } }
    expect(e2eReviewNote(noHost)).toBe('MANUAL E2E REQUIRED — run e2e and verify before merging.')
  })

  it('writes the owner-language section from language.owner and the configured headings', () => {
    const cfg = { ...M, language: { ...M.language, owner: 'fr' } }
    const rescan = buildRescanPrompt(cfg)
    expect(rescan).toContain('"Note" column text in French')
    expect(rescan).toContain('## Details (French)')
    expect(rescan).toContain('Description: <the requirement statement, translated to French>')
    expect(rescan).toContain('Acceptance criteria:')
  })
})
