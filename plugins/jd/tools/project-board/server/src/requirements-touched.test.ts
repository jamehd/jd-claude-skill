import { describe, it, expect } from 'vitest'
import { formatRequirementsTouched } from './jobs/requirements-touched.js'

describe('formatRequirementsTouched', () => {
  it('lists ids from Req: trailers across commits, deduped in order', () => {
    const msgs = ['feat: theme\n\nReq: CAFE-R3', 'fix: dl\n\nReq: DL-R5, IDC-R1', 'chore\n\nReq: CAFE-R3']
    expect(formatRequirementsTouched(msgs)).toBe('CAFE-R3, DL-R5, IDC-R1')
  })

  it('returns none when there is no Req: trailer', () => {
    expect(formatRequirementsTouched(['feat: x', 'fix: y'])).toBe('none')
  })

  it('ignores ids that appear outside a Req: trailer line', () => {
    expect(formatRequirementsTouched(['feat: relates to CAFE-R3 in the body, not a trailer'])).toBe('none')
  })

  it('treats Req: none — reason as none', () => {
    expect(formatRequirementsTouched(['chore: rename\n\nReq: none — pure refactor'])).toBe('none')
  })

  it('handles an empty list', () => {
    expect(formatRequirementsTouched([])).toBe('none')
  })

  it('ignores an indented Req: line (gate anchors at column 0)', () => {
    expect(formatRequirementsTouched(['feat: x\n\n  Req: CAFE-R3'])).toBe('none')
  })
})
