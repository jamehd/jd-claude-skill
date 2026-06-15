import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { extractReqIds, parseRequirementDoc, parseRequirementsDir } from './requirements.mjs'

test('extractReqIds returns unique prefixed ids', () => {
  assert.deepEqual(extractReqIds('touches CAFE-R3 and CAFE-R3 and DL-R5'), ['CAFE-R3', 'DL-R5'])
  assert.deepEqual(extractReqIds('no ids here'), [])
})

test('parseRequirementDoc reads id, statement, acceptance', () => {
  const md = [
    '# cafe-service — Requirements',
    '',
    '## CAFE-R3: GetTheme RPC',
    'Cafe Service serves Menu Game branding over gRPC.',
    '- AC: a client receives the updated theme < 1s',
    '- AC: tests cover request and push paths',
  ].join('\n')
  const reqs = parseRequirementDoc(md)
  assert.equal(reqs.length, 1)
  assert.equal(reqs[0].id, 'CAFE-R3')
  assert.equal(reqs[0].title, 'GetTheme RPC')
  assert.equal(reqs[0].statement, 'Cafe Service serves Menu Game branding over gRPC.')
  assert.equal(reqs[0].acceptance.length, 2)
})

test('parseRequirementsDir indexes components and capabilities', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'reqdir-'))
  mkdirSync(path.join(root, 'docs/requirements/components'), { recursive: true })
  writeFileSync(path.join(root, 'docs/requirements/components/cafe-service.md'), '## CAFE-R1: core\nStatement.\n')
  const index = parseRequirementsDir(root)
  assert.ok(index.has('CAFE-R1'))
  assert.equal(index.has('CAFE-R9'), false)
})
