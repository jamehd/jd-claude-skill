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
        <h2 className="text-xs font-semibold uppercase text-zinc-500">Thành phần</h2>
        <button
          disabled={busy}
          onClick={() => void rescan()}
          className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-50"
        >
          ↻ Re-scan
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {components.length === 0 && <p className="text-sm text-zinc-600">Chưa có dữ liệu trạng thái.</p>}
      {components.map((c) => (
        <div key={c.component} className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          onClick={() => setOpen(open === c.component ? null : c.component)}>
          <div className="flex justify-between text-sm">
            <span>{c.component}</span>
            <span className="text-cyan-400">{c.completion}%</span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-zinc-800">
            <div className="h-1.5 rounded bg-cyan-500" style={{ width: `${c.completion}%` }} />
          </div>
          {open === c.component && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{c.body}</pre>
          )}
        </div>
      ))}
    </aside>
  )
}
