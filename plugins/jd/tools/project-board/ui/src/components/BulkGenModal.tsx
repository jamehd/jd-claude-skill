import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { Candidate, ItemType, Priority } from '../types.js'

type Row = Candidate & { checked: boolean }

export function BulkGenModal({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    api.scanCandidates()
      .then((r) => { if (!cancelled) setRows(r.candidates.map((c) => ({ ...c, checked: c.kind === 'implement' }))) })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [])

  const checked = rows?.filter((r) => r.checked) ?? []

  function patch(i: number, p: Partial<Row>) {
    setRows((rs) => (rs ? rs.map((r, j) => (j === i ? { ...r, ...p } : r)) : rs))
  }

  async function create() {
    if (checked.length === 0) return
    setBusy(true); setError('')
    try {
      const res = await api.bulkCreate(checked.map((r) => ({ type: r.type, title: r.title, component: r.component, priority: r.priority, body: r.body, requiresShaping: r.kind === 'implement' })))
      if (res.rejected.length > 0) { setError(`${res.rejected.length} mục bị từ chối`); return }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="flex max-h-[80vh] w-[46rem] flex-col rounded-xl border border-border-strong bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-semibold text-text-primary">Tạo task từ scan</h2>
          <button onClick={onClose} className="text-text-muted transition-colors duration-150 hover:text-text-primary">✕</button>
        </div>
        {error && <p className="mb-2 text-sm text-danger">{error}</p>}
        {rows === null && <p className="text-sm text-text-muted">Đang đọc kết quả scan…</p>}
        {rows && rows.length === 0 && (
          <p className="text-sm text-text-muted">Không có gap nào cần tạo task — scan sạch hoặc đã có task. Chạy Re-scan trước nếu cần.</p>
        )}
        {rows && rows.length > 0 && (
          <div className="flex-1 space-y-1 overflow-y-auto">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2 rounded-md border border-border bg-sunken px-2 py-1.5">
                <input type="checkbox" checked={r.checked} onChange={(e) => patch(i, { checked: e.target.checked })} />
                <span className="w-32 shrink-0 truncate font-mono text-[12px] text-text-muted" title={r.component}>{r.component}</span>
                <input value={r.title} onChange={(e) => patch(i, { title: e.target.value })}
                  className="min-w-0 flex-1 rounded border border-border bg-base px-2 py-1 text-sm text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
                <select value={r.type} onChange={(e) => patch(i, { type: e.target.value as ItemType })}
                  className="rounded border border-border bg-base px-1 py-1 text-xs text-text-primary">
                  <option value="task">task</option>
                  <option value="bug">bug</option>
                </select>
                <select value={r.priority} onChange={(e) => patch(i, { priority: e.target.value as Priority })}
                  className="rounded border border-border bg-base px-1 py-1 text-xs text-text-primary">
                  <option>P0</option><option>P1</option><option>P2</option><option>P3</option>
                </select>
              </div>
            ))}
          </div>
        )}
        {rows && rows.length > 0 && (
          <button disabled={busy || checked.length === 0} onClick={() => void create()}
            className="mt-3 rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
            Tạo {checked.length} mục
          </button>
        )}
      </div>
    </div>
  )
}
