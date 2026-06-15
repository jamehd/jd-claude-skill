import { test } from 'node:test'
import assert from 'node:assert/strict'
import { globToRegExp, matchAny } from './glob.mjs'

test('matches a directory subtree with trailing **', () => {
  const re = globToRegExp('cafe-service/**')
  assert.ok(re.test('cafe-service/internal/api.go'))
  assert.ok(re.test('cafe-service/main.go'))
  assert.equal(re.test('idc_backend/main.go'), false)
})

test('** / matches zero or more leading directories', () => {
  const re = globToRegExp('**/*.test.mjs')
  assert.ok(re.test('a/b/c.test.mjs'))
  assert.ok(re.test('c.test.mjs'))
  assert.equal(re.test('c.mjs'), false)
})

test('single * does not cross a path separator', () => {
  const re = globToRegExp('docs/*.md')
  assert.ok(re.test('docs/readme.md'))
  assert.equal(re.test('docs/sub/readme.md'), false)
})

test('matches an exact literal path', () => {
  const re = globToRegExp('launcher/src/main/main.ts')
  assert.ok(re.test('launcher/src/main/main.ts'))
  assert.equal(re.test('launcher/src/main/other.ts'), false)
})

test('matchAny is true when any glob matches', () => {
  assert.ok(matchAny('docs/x.md', ['src/**', 'docs/**']))
  assert.equal(matchAny('lib/x.js', ['src/**', 'docs/**']), false)
})
