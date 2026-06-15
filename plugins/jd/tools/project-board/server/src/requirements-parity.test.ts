import { describe, it, expect, beforeAll } from 'vitest'
import * as tsResolver from './jobs/requirements.js'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
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

describe('resolver parity: board TS vs shared .mjs', () => {
  let shared: any
  beforeAll(async () => { shared = await import(/* @vite-ignore */ SHARED_SPEC) })

  it('extractReqIds agrees', () => {
    const sample = 'touches CAFE-R3 and CAFE-R3 and DL-R5 but not RX-1'
    expect(shared.extractReqIds(sample)).toEqual(tsResolver.extractReqIds(sample))
  })

  it('parseRequirementDoc agrees (ids, statement, acceptance, removed)', () => {
    expect(shared.parseRequirementDoc(DOC)).toEqual(tsResolver.parseRequirementDoc(DOC))
  })

  it('parseRequirementDoc agrees on CRLF input', () => {
    const crlf = DOC.replace(/\n/g, '\r\n')
    expect(shared.parseRequirementDoc(crlf)).toEqual(tsResolver.parseRequirementDoc(crlf))
  })

  it('parseRequirementsDir agrees', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'parity-'))
    mkdirSync(path.join(root, 'docs/requirements/components'), { recursive: true })
    writeFileSync(path.join(root, 'docs/requirements/components/cafe-service.md'), DOC)
    const a = [...tsResolver.parseRequirementsDir(root).entries()]
    const b = [...shared.parseRequirementsDir(root).entries()]
    expect(b).toEqual(a)
  })
})
