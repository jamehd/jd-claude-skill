import { describe, it, expect } from 'vitest'
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
  it('extractReqIds agrees', async () => {
    const shared: any = await import(/* @vite-ignore */ SHARED_SPEC)
    const sample = 'touches CAFE-R3 and CAFE-R3 and DL-R5 but not RX-1'
    expect(shared.extractReqIds(sample)).toEqual(tsResolver.extractReqIds(sample))
  })

  it('parseRequirementDoc agrees (ids, statement, acceptance, removed)', async () => {
    const shared: any = await import(/* @vite-ignore */ SHARED_SPEC)
    expect(shared.parseRequirementDoc(DOC)).toEqual(tsResolver.parseRequirementDoc(DOC))
  })

  it('parseRequirementsDir agrees', async () => {
    const shared: any = await import(/* @vite-ignore */ SHARED_SPEC)
    const root = mkdtempSync(path.join(tmpdir(), 'parity-'))
    mkdirSync(path.join(root, 'docs/requirements/components'), { recursive: true })
    writeFileSync(path.join(root, 'docs/requirements/components/cafe-service.md'), DOC)
    const a = [...tsResolver.parseRequirementsDir(root).entries()]
    const b = [...shared.parseRequirementsDir(root).entries()]
    expect(b).toEqual(a)
  })
})
