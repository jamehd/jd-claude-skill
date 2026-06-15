import { describe, it, expect } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractReqIds, parseRequirementDoc, parseRequirementsDir } from './jobs/requirements.js'

const DOC = `---
component: cafe-service
---

# cafe-service — Requirements

## CAFE-R1: 24/7 background service
Runs as a Windows service, alive independent of the UI.
- AC: keeps running after the UI closes
- AC: exposes HTTP on :7890

## CAFE-R3: GetTheme RPC
Serves Menu Game branding over gRPC.
- AC: client receives theme < 1s
`

describe('extractReqIds', () => {
  it('finds unique req ids and ignores noise', () => {
    expect(extractReqIds('implements CAFE-R3 and CAFE-R3 and IDC-R12; not A-R1 or CAFER3'))
      .toEqual(['CAFE-R3', 'IDC-R12'])
  })
  it('returns empty for no ids', () => {
    expect(extractReqIds('just a normal description')).toEqual([])
  })
})

describe('parseRequirementDoc', () => {
  it('parses headings, statements, and acceptance criteria', () => {
    const reqs = parseRequirementDoc(DOC)
    expect(reqs.map((r) => r.id)).toEqual(['CAFE-R1', 'CAFE-R3'])
    expect(reqs[0].title).toBe('24/7 background service')
    expect(reqs[0].statement).toContain('Windows service')
    expect(reqs[0].acceptance).toEqual(['keeps running after the UI closes', 'exposes HTTP on :7890'])
    expect(reqs[1].acceptance).toEqual(['client receives theme < 1s'])
  })
})

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
    expect(byId['X-R1'].removed).toBe(false)
  })
})

describe('parseRequirementsDir', () => {
  it('indexes requirements from components and capabilities dirs by id', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'reqs-'))
    mkdirSync(path.join(root, 'docs/requirements/components'), { recursive: true })
    mkdirSync(path.join(root, 'docs/requirements/capabilities'), { recursive: true })
    writeFileSync(path.join(root, 'docs/requirements/components/cafe-service.md'), DOC)
    const index = parseRequirementsDir(root)
    expect(index.get('CAFE-R1')?.title).toBe('24/7 background service')
    expect(index.get('CAFE-R3')?.acceptance).toHaveLength(1)
    expect(index.has('NOPE-R9')).toBe(false)
  })
  it('returns an empty map when the requirements dir is absent', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'reqs-empty-'))
    expect(parseRequirementsDir(root).size).toBe(0)
  })
})
