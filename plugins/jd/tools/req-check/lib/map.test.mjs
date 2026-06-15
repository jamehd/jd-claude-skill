import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyChanges } from './map.mjs'

const MAP = {
  components: [
    { globs: ['cafe-service/**'], doc: 'cafe-service.md', prefixes: ['CAFE'] },
    { globs: ['idc_backend/**'], doc: 'idc-backend.md', prefixes: ['IDC'] },
    { globs: ['launcher/src/shared/**'], doc: null, prefixes: ['DL', 'USER', 'PACK'] },
  ],
  exclude: ['**/*.md', 'docs/**', '**/*_test.go'],
}

test('maps a changed file to its component', () => {
  const touched = classifyChanges(['cafe-service/internal/api.go'], MAP)
  assert.equal(touched.length, 1)
  assert.equal(touched[0].doc, 'cafe-service.md')
  assert.deepEqual(touched[0].prefixes, ['CAFE'])
})

test('drops excluded files', () => {
  assert.deepEqual(classifyChanges(['cafe-service/README.md'], MAP), [])
  assert.deepEqual(classifyChanges(['cafe-service/api_test.go'], MAP), [])
  assert.deepEqual(classifyChanges(['docs/requirements/components/cafe-service.md'], MAP), [])
})

test('an excluded file does not cancel a real change in the same set', () => {
  const touched = classifyChanges(['cafe-service/api.go', 'cafe-service/README.md'], MAP)
  assert.equal(touched.length, 1)
})

test('dedupes when multiple files hit the same component', () => {
  const touched = classifyChanges(['cafe-service/a.go', 'cafe-service/b.go'], MAP)
  assert.equal(touched.length, 1)
})

test('a null-doc component is reported with its prefixes', () => {
  const touched = classifyChanges(['launcher/src/shared/util.ts'], MAP)
  assert.equal(touched.length, 1)
  assert.equal(touched[0].doc, null)
  assert.deepEqual(touched[0].prefixes, ['DL', 'USER', 'PACK'])
})

test('files outside the map are ignored', () => {
  assert.deepEqual(classifyChanges(['some/other/file.go'], MAP), [])
})
