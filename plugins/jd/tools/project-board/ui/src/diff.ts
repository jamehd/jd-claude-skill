export type DiffLineKind = 'add' | 'del' | 'hunk' | 'ctx'

export function classifyDiffLine(line: string): DiffLineKind {
  if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('@@')
    || line.startsWith('diff --git') || line.startsWith('index ')) return 'hunk'
  if (line.startsWith('+')) return 'add'
  if (line.startsWith('-')) return 'del'
  return 'ctx'
}

export interface DiffLine { kind: DiffLineKind | 'meta'; text: string }

export interface FileDiff {
  path: string
  oldPath?: string
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'binary'
  additions: number
  deletions: number
  lines: DiffLine[]
}

export function parseDiff(raw: string): FileDiff[] {
  if (!raw.trim()) return []
  const files: FileDiff[] = []
  let cur: FileDiff | null = null
  const flush = () => { if (cur) files.push(cur) }
  for (const line of raw.split('\n')) {
    if (line.startsWith('diff --git ')) {
      flush()
      const m = line.match(/^diff --git a\/(.+) b\/(.+)$/)
      const newPath = m?.[2] ?? m?.[1] ?? ''
      cur = { path: newPath, status: 'modified', additions: 0, deletions: 0, lines: [] }
      continue
    }
    if (!cur) continue
    if (line.startsWith('new file mode')) { cur.status = 'added'; continue }
    if (line.startsWith('deleted file mode')) { cur.status = 'deleted'; continue }
    if (line.startsWith('rename from ')) { cur.oldPath = line.slice(12); cur.status = 'renamed'; continue }
    if (line.startsWith('rename to ')) { cur.path = line.slice(10); cur.status = 'renamed'; continue }
    if (line.startsWith('Binary files')) { if (cur.status === 'modified') cur.status = 'binary'; continue }
    if (line.startsWith('index ') || line.startsWith('old mode') || line.startsWith('new mode')
      || line.startsWith('similarity index') || line.startsWith('dissimilarity index')
      || line.startsWith('copy from') || line.startsWith('copy to')) continue
    if (line.startsWith('--- ')) { if (line === '--- /dev/null') cur.status = 'added'; continue }
    if (line.startsWith('+++ ')) { if (line === '+++ /dev/null') cur.status = 'deleted'; continue }
    if (line.startsWith('@@')) { cur.lines.push({ kind: 'hunk', text: line }); continue }
    if (line.startsWith('+')) { cur.additions++; cur.lines.push({ kind: 'add', text: line }); continue }
    if (line.startsWith('-')) { cur.deletions++; cur.lines.push({ kind: 'del', text: line }); continue }
    cur.lines.push({ kind: 'ctx', text: line })
  }
  flush()
  return files
}
