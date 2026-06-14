import { useState } from 'react'
import { api } from '../api.js'
import type { ItemStatus, Priority } from '../types.js'

const STATUSES: ItemStatus[] = ['backlog', 'ready', 'review', 'done']
const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

export function BulkBar(
  { ids, onClear, onDone }:
  { ids: string[]; onClear: () => void; onDone: (failedIds: string[]) => void },
) {
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  async function run(action: string, value?: string) {
    setBusy(true); setMsg('')
    try {
      const r = await api.batch(ids, action, value)
      const failed = r.results.filter((x) => !x.ok)
      setMsg(`${r.applied} ok${r.failed ? ` · ${r.failed} lỗi` : ''}`)
      onDone(failed.map((x) => x.id))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'lỗi')
    } finally { setBusy(false) }
  }

  const btn = 'rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50'
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border-strong bg-surface px-3 py-2">
      <span className="text-sm font-semibold text-text-primary">Đã chọn {ids.length}</span>
      <button disabled={busy} className={btn} onClick={() => void run('dispatch')}>Dispatch</button>
      <select disabled={busy} className={btn} defaultValue="" onChange={(e) => { if (e.target.value) void run('status', e.target.value); e.target.value = '' }}>
        <option value="">Chuyển trạng thái…</option>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <select disabled={busy} className={btn} defaultValue="" onChange={(e) => { if (e.target.value) void run('priority', e.target.value); e.target.value = '' }}>
        <option value="">Ưu tiên…</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      <button disabled={busy}
        className="rounded-md border border-danger-border bg-danger-bg px-2 py-1.5 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50"
        onClick={() => { if (confirm(`Xóa ${ids.length} mục? Sẽ dọn worktree/branch của từng task.`)) void run('delete') }}>
        Xóa
      </button>
      <button disabled={busy} className={btn} onClick={onClear}>Bỏ chọn</button>
      {msg && <span className="text-sm text-text-muted">{msg}</span>}
    </div>
  )
}
