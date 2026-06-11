import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function ComponentsPanel({ components }: { components: ComponentStatus[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function rescan() {
    setBusy(true)
    setError('')
    try { await api.rescan() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Thành phần</h2>
        <button
          disabled={busy}
          onClick={() => void rescan()}
          className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-raised disabled:opacity-50"
        >
          ↻ Re-scan
        </button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {components.length === 0 && <p className="py-8 text-center text-sm text-text-muted">Chưa có dữ liệu trạng thái.</p>}
      {components.map((c) => (
        <div key={c.component} className="cursor-pointer rounded-[10px] border border-border bg-surface p-3 transition-colors duration-150 hover:border-border-strong hover:bg-raised"
          onClick={() => setOpen(open === c.component ? null : c.component)}>
          <div className="flex justify-between text-sm text-text-primary">
            <span>{c.component}</span>
            <span className="font-mono text-accent">{c.completion}%</span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-raised">
            <div className="h-1.5 rounded bg-accent" style={{ width: `${c.completion}%` }} />
          </div>
          {open === c.component && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-text-secondary">{c.body}</pre>
          )}
        </div>
      ))}
    </aside>
  )
}
