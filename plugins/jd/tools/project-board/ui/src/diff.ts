export type DiffLineKind = 'add' | 'del' | 'hunk' | 'ctx'

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')
    || line.startsWith('diff --git') || line.startsWith('index ')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}
