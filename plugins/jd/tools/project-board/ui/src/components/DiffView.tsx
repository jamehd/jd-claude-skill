import { useMemo, useRef, useState } from 'react'
import { parseDiff, type DiffLine, type FileDiff } from '../diff.js'

const LINE_CLASS: Record<string, string> = {
  add: 'text-diff-add', del: 'text-diff-del', hunk: 'text-diff-hunk', ctx: 'text-diff-ctx', meta: 'text-text-muted',
}
const STATUS_CLASS: Record<FileDiff['status'], string> = {
  added: 'text-ok', modified: 'text-accent', deleted: 'text-danger', renamed: 'text-accent', binary: 'text-text-muted',
}
const STATUS_LABEL: Record<FileDiff['status'], string> = {
  added: 'thêm', modified: 'sửa', deleted: 'xóa', renamed: 'đổi tên', binary: 'binary',
}

function FileBlock({ file, collapsed, onToggle, anchorRef }: {
  file: FileDiff; collapsed: boolean; onToggle: () => void; anchorRef: (el: HTMLDivElement | null) => void
}) {
  return (
    <div ref={anchorRef} className="rounded-lg border border-border bg-sunken">
      <button onClick={onToggle}
        className="sticky top-0 z-10 flex w-full items-center gap-2 rounded-t-lg border-b border-border bg-raised px-3 py-1.5 text-left text-xs">
        <span className="text-text-muted">{collapsed ? '▸' : '▾'}</span>
        <span className={`font-mono uppercase ${STATUS_CLASS[file.status]}`}>{STATUS_LABEL[file.status]}</span>
        <span className="flex-1 truncate font-mono text-text-primary" title={file.path}>
          {file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
        </span>
        <span className="font-mono text-diff-add">+{file.additions}</span>
        <span className="font-mono text-diff-del">−{file.deletions}</span>
      </button>
      {!collapsed && (
        <pre className="overflow-x-auto px-3 py-2 font-mono text-[13px] leading-[1.55]">
          {file.lines.length === 0
            ? <div className="text-text-muted">{file.status === 'binary' ? '(binary)' : '(không có thay đổi nội dung)'}</div>
            : file.lines.map((l: DiffLine, i) => <div key={i} className={LINE_CLASS[l.kind]}>{l.text || ' '}</div>)}
        </pre>
      )}
    </div>
  )
}

export function DiffView({ diff, wide = false }: { diff: string; wide?: boolean }) {
  const files = useMemo(() => parseDiff(diff), [diff])
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const refs = useRef<Record<string, HTMLDivElement | null>>({})

  if (files.length === 0) return <p className="text-sm text-text-muted">(diff trống)</p>

  const adds = files.reduce((s, f) => s + f.additions, 0)
  const dels = files.reduce((s, f) => s + f.deletions, 0)
  const allCollapsed = collapsed.size === files.length
  const toggle = (p: string) => setCollapsed((c) => { const n = new Set(c); n.has(p) ? n.delete(p) : n.add(p); return n })
  const toggleAll = () => setCollapsed(allCollapsed ? new Set() : new Set(files.map((f) => f.path)))
  const jump = (p: string) => { setCollapsed((c) => { const n = new Set(c); n.delete(p); return n }); refs.current[p]?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }

  const summary = (
    <div className={wide ? 'shrink-0 overflow-y-auto pr-2' : ''}>
      <div className="mb-2 flex items-center justify-between text-xs">
        <span className="text-text-secondary">{files.length} file · <span className="text-diff-add">+{adds}</span> <span className="text-diff-del">−{dels}</span></span>
        <button onClick={toggleAll} className="rounded border border-border px-2 py-0.5 text-text-secondary transition-colors duration-150 hover:bg-raised">{allCollapsed ? 'Mở tất cả' : 'Gập tất cả'}</button>
      </div>
      <ul className="space-y-0.5 text-xs">
        {files.map((f) => (
          <li key={f.path}>
            <button onClick={() => jump(f.path)} className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left transition-colors duration-150 hover:bg-raised">
              <span className={`font-mono text-[11px] uppercase ${STATUS_CLASS[f.status]}`}>●</span>
              <span className="flex-1 truncate font-mono text-text-secondary" title={f.path}>{f.path}</span>
              <span className="font-mono text-diff-add">+{f.additions}</span>
              <span className="font-mono text-diff-del">−{f.deletions}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )

  const blocks = (
    <div className={`space-y-3 ${wide ? 'min-w-0 flex-1 overflow-y-auto' : ''}`}>
      {files.map((f) => (
        <FileBlock key={f.path} file={f} collapsed={collapsed.has(f.path)} onToggle={() => toggle(f.path)} anchorRef={(el) => { refs.current[f.path] = el }} />
      ))}
    </div>
  )

  if (wide) return <div className="flex h-full gap-4"><div className="w-64 shrink-0">{summary}</div>{blocks}</div>
  return <div className="max-h-96 overflow-y-auto">{summary}{blocks}</div>
}
