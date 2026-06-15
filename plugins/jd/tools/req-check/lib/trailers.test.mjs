import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTrailers } from './trailers.mjs'

test('collects ids from Req trailers across commits', () => {
  const r = parseTrailers(['feat: x\n\nReq: CAFE-R3', 'fix: y\n\nReq: DL-R5, IDC-R1'])
  assert.deepEqual(r.ids.sort(), ['CAFE-R3', 'DL-R5', 'IDC-R1'])
  assert.deepEqual(r.noneReasons, [])
})

test('captures Req: none with a reason', () => {
  const r = parseTrailers(['chore: rename\n\nReq: none — pure refactor, no behavior change'])
  assert.deepEqual(r.ids, [])
  assert.equal(r.noneReasons.length, 1)
})

test('Req: none without a reason is not counted', () => {
  const r = parseTrailers(['chore: x\n\nReq: none'])
  assert.deepEqual(r.noneReasons, [])
})

test('ignores commits with no Req trailer', () => {
  const r = parseTrailers(['feat: no trailer here'])
  assert.deepEqual(r.ids, [])
  assert.deepEqual(r.noneReasons, [])
})
