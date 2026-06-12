import { describe, it, expect } from 'vitest'
import { classifyDiffLine, parseDiff } from '../../ui/src/diff.js'

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

describe('parseDiff', () => {
  it('returns [] for empty or whitespace input', () => {
    expect(parseDiff('')).toEqual([])
    expect(parseDiff('   \n  ')).toEqual([])
  })

  it('parses a 2-file diff correctly', () => {
    const raw = [
      'diff --git a/src/a.ts b/src/a.ts',
      'index 1111111..2222222 100644',
      '--- a/src/a.ts',
      '+++ b/src/a.ts',
      '@@ -1,3 +1,3 @@',
      ' context line',
      '-old line',
      '+new line',
      'diff --git a/src/b.ts b/src/b.ts',
      'index 3333333..4444444 100644',
      '--- a/src/b.ts',
      '+++ b/src/b.ts',
      '@@ -1,2 +1,3 @@',
      ' context line',
      '+added line',
    ].join('\n')

    const files = parseDiff(raw)
    expect(files).toHaveLength(2)

    const a = files[0]
    expect(a.path).toBe('src/a.ts')
    expect(a.status).toBe('modified')
    expect(a.additions).toBe(1)
    expect(a.deletions).toBe(1)

    // plumbing lines (+++, ---, diff --git) must be excluded
    const lineTexts = a.lines.map(l => l.text)
    expect(lineTexts.some(t => t.startsWith('---'))).toBe(false)
    expect(lineTexts.some(t => t.startsWith('+++'))).toBe(false)
    expect(lineTexts.some(t => t.startsWith('diff --git'))).toBe(false)
    // hunk header must be present
    expect(a.lines.some(l => l.kind === 'hunk')).toBe(true)

    const b = files[1]
    expect(b.path).toBe('src/b.ts')
    expect(b.additions).toBe(1)
    expect(b.deletions).toBe(0)
  })

  it('detects added files via new file mode and --- /dev/null', () => {
    const raw = [
      'diff --git a/n.ts b/n.ts',
      'new file mode 100644',
      'index 0000000..1234567',
      '--- /dev/null',
      '+++ b/n.ts',
      '@@ -0,0 +1 @@',
      '+export const x = 1',
    ].join('\n')

    const files = parseDiff(raw)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('n.ts')
    expect(files[0].status).toBe('added')
    expect(files[0].additions).toBe(1)
  })

  it('detects deleted files via deleted file mode and +++ /dev/null', () => {
    const raw = [
      'diff --git a/old.ts b/old.ts',
      'deleted file mode 100644',
      'index 1234567..0000000',
      '--- a/old.ts',
      '+++ /dev/null',
      '@@ -1 +0,0 @@',
      '-export const x = 1',
    ].join('\n')

    const files = parseDiff(raw)
    expect(files).toHaveLength(1)
    expect(files[0].status).toBe('deleted')
    expect(files[0].deletions).toBe(1)
  })

  it('detects renamed files via rename from/to headers', () => {
    const raw = [
      'diff --git a/old.ts b/new.ts',
      'similarity index 95%',
      'rename from old.ts',
      'rename to new.ts',
      'index 1111111..2222222 100644',
      '--- a/old.ts',
      '+++ b/new.ts',
      '@@ -1,3 +1,3 @@',
      ' context',
      '-old content',
      '+new content',
    ].join('\n')

    const files = parseDiff(raw)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('new.ts')
    expect(files[0].oldPath).toBe('old.ts')
    expect(files[0].status).toBe('renamed')
  })

  it('detects binary files', () => {
    const raw = [
      'diff --git a/img.png b/img.png',
      'index 1111111..2222222 100644',
      'Binary files a/img.png and b/img.png differ',
    ].join('\n')

    const files = parseDiff(raw)
    expect(files).toHaveLength(1)
    expect(files[0].path).toBe('img.png')
    expect(files[0].status).toBe('binary')
  })
})
