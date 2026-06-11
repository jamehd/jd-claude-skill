import { describe, it, expect } from 'vitest'
import { classifyDiffLine } from '../../ui/src/diff.js'

describe('classifyDiffLine', () => {
  it('classifies adds and dels', () => {
    expect(classifyDiffLine('+new line')).toBe('add')
    expect(classifyDiffLine('-old line')).toBe('del')
  })
  it('classifies headers as hunk (before single-char rules)', () => {
    expect(classifyDiffLine('@@ -1,4 +1,6 @@')).toBe('hunk')
    expect(classifyDiffLine('diff --git a/x b/x')).toBe('hunk')
    expect(classifyDiffLine('index 0000..1111 100644')).toBe('hunk')
    expect(classifyDiffLine('+++ b/file.ts')).toBe('hunk')
    expect(classifyDiffLine('--- a/file.ts')).toBe('hunk')
  })
  it('everything else is context', () => {
    expect(classifyDiffLine(' unchanged')).toBe('ctx')
    expect(classifyDiffLine('')).toBe('ctx')
  })
})
