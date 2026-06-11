import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem } from '../types.js'

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
    <div className="fixed inset-y-0 right-0 z-10 flex w-[32rem] flex-col gap-3 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-zinc-500">{item.id} · {item.component} · {item.priority} · {item.status}</div>
          <h2 className="text-lg font-semibold">{item.title}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>

      {item.status === 'ready' && (
        <button disabled={busy} onClick={() => void act(() => api.dispatch(item.id))}
          className="rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500 disabled:opacity-50">
          ⚡ Giao cho AI
        </button>
      )}

      {item.status === 'review' && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => void act(() => api.merge(item.id))}
            className="flex-1 rounded-md bg-green-700 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50">Merge</button>
          <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
            className="flex-1 rounded-md bg-zinc-700 py-2 text-sm font-medium hover:bg-zinc-600 disabled:opacity-50">Tạo PR</button>
          <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
            className="flex-1 rounded-md bg-red-900 py-2 text-sm font-medium hover:bg-red-800 disabled:opacity-50">Hủy bỏ</button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">{item.body}</pre>

      {diff !== null && (
        <>
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Diff (main…board/{item.id})</h3>
          <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">{diff || '(diff trống)'}</pre>
        </>
      )}
    </div>
  )
}
