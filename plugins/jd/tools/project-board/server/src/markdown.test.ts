import { describe, it, expect } from 'vitest'
import { parseItem, serializeItem, parseComponentStatus } from './markdown.js'

const RAW = `---
id: TASK-012
type: task
title: Implement GetTheme RPC
status: ready
priority: P1
component: cafe-service
created: 2026-06-11
updated: 2026-06-11
---

Implement GetTheme.

## Acceptance
- returns theme
`

describe('parseItem', () => {
  it('parses frontmatter and body', () => {
    const item = parseItem(RAW)
    expect(item.id).toBe('TASK-012')
    expect(item.type).toBe('task')
    expect(item.status).toBe('ready')
    expect(item.priority).toBe('P1')
    expect(item.component).toBe('cafe-service')
    expect(item.body).toContain('## Acceptance')
  })

  it('round-trips through serializeItem', () => {
    const item = parseItem(RAW)
    const again = parseItem(serializeItem(item))
    expect(again).toEqual(item)
  })

  it('throws on missing required field', () => {
    expect(() => parseItem(RAW.replace('component: cafe-service\n', ''))).toThrow(/component/)
  })

  it('throws on invalid status', () => {
    expect(() => parseItem(RAW.replace('status: ready', 'status: bogus'))).toThrow(/status/)
  })

  it('round-trips job field', () => {
    const withJob = RAW.replace('updated: 2026-06-11', 'updated: 2026-06-11\njob: job-007')
    const item = parseItem(withJob)
    expect(item.job).toBe('job-007')
    const again = parseItem(serializeItem(item))
    expect(again.job).toBe('job-007')
  })

  it('normalizes unquoted dates to YYYY-MM-DD strings', () => {
    const item = parseItem(RAW)
    expect(item.created).toBe('2026-06-11')
  })
})

describe('unknown frontmatter keys', () => {
  it('preserves extra keys through serialize → parse round-trip', () => {
    const withExtra = RAW.replace('updated: 2026-06-11', 'updated: 2026-06-11\nowner: alice')
    const item = parseItem(withExtra)
    expect(item.extra).toEqual({ owner: 'alice' })
    const serialized = serializeItem(item)
    expect(serialized).toContain('owner: alice')
    const again = parseItem(serialized)
    expect(again.extra).toEqual({ owner: 'alice' })
  })
})

describe('parseComponentStatus', () => {
  it('parses built, tested and body', () => {
    const cs = parseComponentStatus(`---
component: cafe-service
built: 90
tested: 75
last_scanned: 2026-06-11
---

Summary.

## Gaps
- [ ] GetTheme RPC
`)
    expect(cs.component).toBe('cafe-service')
    expect(cs.built).toBe(90)
    expect(cs.tested).toBe(75)
    expect(cs.body).toContain('## Gaps')
  })

  it('defaults built and tested to 0 when absent', () => {
    const cs = parseComponentStatus(`---
component: cafe-service
last_scanned: 2026-06-11
---

Summary.
`)
    expect(cs.built).toBe(0)
    expect(cs.tested).toBe(0)
  })
})

describe('pr status and pr field', () => {
  const RAW_PR = `---
id: TASK-009
type: task
title: With a PR
status: pr
priority: P2
component: cafe-service
created: 2026-06-12
updated: 2026-06-12
pr: https://github.com/jamehd/gamesync/pull/7
---

body here
`
  it('accepts the pr status', () => {
    expect(parseItem(RAW_PR).status).toBe('pr')
  })
  it('parses and round-trips the pr url field', () => {
    const item = parseItem(RAW_PR)
    expect(item.pr).toBe('https://github.com/jamehd/gamesync/pull/7')
    expect(parseItem(serializeItem(item))).toEqual(item)
  })
  it('does not sweep pr into extra', () => {
    const item = parseItem(RAW_PR)
    expect(item.extra).toBeUndefined()
  })
})
