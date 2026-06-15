import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRange, evaluateWorktree } from './verdict.mjs'

const cafe = { doc: 'cafe-service.md', prefixes: ['CAFE'] }
const shared = { doc: null, prefixes: ['DL', 'USER', 'PACK'] }

test('passes when a defined, matching-prefix id is referenced', () => {
  const r = evaluateRange({
    touched: [cafe],
    trailers: { ids: ['CAFE-R3'], noneReasons: [] },
    definedIds: new Set(['CAFE-R3']),
  })
  assert.deepEqual(r, { ok: true, failures: [] })
})

test('fails with missing-anchor when no trailer at all', () => {
  const r = evaluateRange({
    touched: [cafe],
    trailers: { ids: [], noneReasons: [] },
    definedIds: new Set(['CAFE-R3']),
  })
  assert.equal(r.ok, false)
  assert.match(r.failures[0], /missing Req anchor for cafe-service\.md/)
})

test('fails when a matching id is referenced but undefined', () => {
  const r = evaluateRange({
    touched: [cafe],
    trailers: { ids: ['CAFE-R9'], noneReasons: [] },
    definedIds: new Set(['CAFE-R3']),
  })
  assert.equal(r.ok, false)
  assert.match(r.failures[0], /CAFE-R9 referenced but not defined/)
})

test('Req: none with a reason satisfies any component', () => {
  const r = evaluateRange({
    touched: [cafe, shared],
    trailers: { ids: [], noneReasons: ['pure refactor'] },
    definedIds: new Set(),
  })
  assert.deepEqual(r, { ok: true, failures: [] })
})

test('null-doc component is satisfied by any of its prefixes', () => {
  const r = evaluateRange({
    touched: [shared],
    trailers: { ids: ['USER-R2'], noneReasons: [] },
    definedIds: new Set(['USER-R2']),
  })
  assert.equal(r.ok, true)
})

test('an id for the wrong component does not satisfy a touched component', () => {
  const r = evaluateRange({
    touched: [cafe],
    trailers: { ids: ['DL-R5'], noneReasons: [] },
    definedIds: new Set(['DL-R5']),
  })
  assert.equal(r.ok, false)
  assert.match(r.failures[0], /missing Req anchor for cafe-service\.md/)
})

test('worktree mode reminds when component code changed but its doc did not', () => {
  const r = evaluateWorktree({ touched: [cafe], changedDocs: new Set() })
  assert.equal(r.reminders.length, 1)
  assert.match(r.reminders[0], /cafe-service\.md/)
})

test('worktree mode is silent when the doc co-changed', () => {
  const r = evaluateWorktree({ touched: [cafe], changedDocs: new Set(['cafe-service.md']) })
  assert.deepEqual(r.reminders, [])
})

test('worktree mode never reminds for null-doc components', () => {
  const r = evaluateWorktree({ touched: [shared], changedDocs: new Set() })
  assert.deepEqual(r.reminders, [])
})
