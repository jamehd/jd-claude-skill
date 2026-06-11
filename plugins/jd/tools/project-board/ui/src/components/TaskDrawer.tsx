import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem, ItemStatus } from '../types.js'
import { DiffView } from './DiffView.js'

const STATUS_PILL: Record<ItemStatus, string> = {
  backlog: 'text-text-secondary bg-surface border-border',
  ready: 'text-ready bg-ready-bg border-ready-border',
  ai_running: 'text-running bg-running-bg border-running-border',
  review: 'text-ok bg-ok-bg border-ok-border',
  done: 'text-ok bg-ok-bg border-ok-border',
}

export function TaskDrawer({ item, onClose }: { item: BoardItem; onClose: () => void }) {
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDiff(null)
    setError('')
    if (item.status !== 'review') return
    let cancelled = false
    api.diff(item.id)
      .then((d) => { if (!cancelled) setDiff(d) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [item.id, item.status])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await fn(); onClose() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-10 flex w-[32rem] flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-5 shadow-[0_2px_8px_rgba(0,0,0,.3)]">
      <div className="flex items-start justify-between">
        <div>
          <div className="mb-2 flex items-center gap-2">
            <span className="rounded-full border border-border bg-sunken px-2 py-0.5 font-mono text-[10px] text-text-muted">{item.id}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${STATUS_PILL[item.status]}`}>{item.status}</span>
            <span className="font-mono text-[10px] text-text-muted">{item.component} · {item.priority}</span>
          </div>
          <h2 className="text-[18px] font-semibold leading-[1.3] text-text-primary">{item.title}</h2>
        </div>
        <button onClick={onClose} className="text-text-muted transition-colors duration-150 hover:text-text-primary">✕</button>
      </div>

      {item.status === 'ready' && (
        <button disabled={busy} onClick={() => void act(() => api.dispatch(item.id))}
          className="rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
          ⚡ Giao cho AI
        </button>
      )}

      {item.status === 'review' && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => void act(() => api.merge(item.id))}
            className="flex-1 rounded-lg border border-ok-border bg-ok-bg py-2 text-sm font-medium text-ok transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Merge</button>
          <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-raised disabled:opacity-50">Tạo PR</button>
          <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
            className="flex-1 rounded-lg border border-border py-2 text-sm font-medium text-danger transition-colors duration-150 hover:border-border-strong hover:bg-raised disabled:opacity-50">Hủy bỏ</button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}

      <div className="whitespace-pre-wrap text-[14px] leading-[1.65] text-text-primary">{item.body}</div>

      {diff !== null && (
        <>
          <h3 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Diff (main…board/{item.id})</h3>
          <DiffView diff={diff} />
        </>
      )}
    </div>
  )
}
