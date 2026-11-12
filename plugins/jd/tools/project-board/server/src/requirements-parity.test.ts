import { describe, it, expect, beforeAll } from 'vitest'
import * as tsResolver from './jobs/requirements.js'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import path from 'node:path'

// Variable specifier: keeps tsc from type-resolving the no-types .mjs (TS7016);
// vitest resolves it at runtime relative to this file.
const SHARED_SPEC = '../../../../shared/requirements.mjs'

const DOC = [
  '# cafe-service — Requirements',
  '',
  '## CAFE-R1: 24/7 core',
  'Runs as a service.',
  '- AC: stays up',
  '## CAFE-R4: Old thing REMOVED',
  'legacy.',
].join('\n')

describe('board requirements code is the shared lib', () => {
  let shared: any
  beforeAll(async () => { shared = await import(/* @vite-ignore */ SHARED_SPEC) })

  it('loads the shared lib instead of carrying its own parser', () => {
    const source = readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'jobs/requirements.ts'), 'utf8')
    expect(source).toContain("findShared('requirements.mjs')")
    expect(source).not.toMatch(/readdirSync|new RegExp|\/\^/)
  })

  it('extractReqIds agrees', () => {
    const sample = 'touches CAFE-R3 and CAFE-R3 and DL-R5 but not RX-1'
    expect(shared.extractReqIds(sample)).toEqual(tsResolver.extractReqIds(sample))
  })

  it('parseRequirementDoc agrees on LF and CRLF input', () => {
    expect(shared.parseRequirementDoc(DOC)).toEqual(tsResolver.parseRequirementDoc(DOC))
    const crlf = DOC.replace(/\n/g, '\r\n')
    expect(shared.parseRequirementDoc(crlf)).toEqual(tsResolver.parseRequirementDoc(crlf))
  })

  it('parseRequirementsDir honours the requirements layout from config', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'parity-'))
    mkdirSync(path.join(root, 'specs/areas'), { recursive: true })
    writeFileSync(path.join(root, 'specs/areas/billing.md'), '## T-12: Invoice\nIssue invoices.\n- AC: pdf\n')
    const layout = { dir: 'specs', subdirs: ['areas'], id_pattern: 'T-\\d+' }
    const a = [...tsResolver.parseRequirementsDir(root, layout).entries()]
    expect(a.map(([id]) => id)).toEqual(['T-12'])
    expect([...shared.parseRequirementsDir(root, layout).entries()]).toEqual(a)
    expect(tsResolver.parseRequirementsDir(root).size).toBe(0)
  })
})
