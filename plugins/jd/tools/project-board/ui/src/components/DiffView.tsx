import { classifyDiffLine, type DiffLineKind } from '../diff.js'

const KIND_CLASS: Record<DiffLineKind, string> = {
  add: 'text-diff-add',
  del: 'text-diff-del',
  hunk: 'text-diff-hunk',
  ctx: 'text-diff-ctx',
}

export function DiffView({ diff }: { diff: string }) {
  if (!diff.trim()) return <p className="text-sm text-text-muted">(diff trống)</p>
  return (
    <pre className="max-h-96 overflow-auto rounded-lg border border-border bg-sunken p-3 font-mono text-[11.5px] leading-[1.55]">
      {diff.split('\n').map((line, i) => (
        <div key={i} className={KIND_CLASS[classifyDiffLine(line)]}>{line || ' '}</div>
      ))}
    </pre>
  )
}
