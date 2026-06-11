import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem, ComponentStatus, Priority } from '../types.js'
import { DiffView } from './DiffView.js'

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']
const CAN_EXECUTE = ['backlog', 'ready', 'failed']

export function TaskDrawer({ item, components, onClose, onOpenConsole }: {
  item: BoardItem
  components: ComponentStatus[]
  onClose: () => void
  onOpenConsole?: (jobId: string) => void
}) {
  const [title, setTitle] = useState(item.title)
  const [description, setDescription] = useState(item.body.trim())
  const [priority, setPriority] = useState<Priority>(item.priority)
  const [component, setComponent] = useState(item.component)
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setTitle(item.title); setDescription(item.body.trim()); setPriority(item.priority)
    setComponent(item.component); setConfirmDelete(false); setError('')
  }, [item.id]) // seed only on item change, not on every board refresh

  useEffect(() => {
    setDiff(null)
    if (item.status !== 'review') return
    let cancelled = false
    api.diff(item.id).then((d) => { if (!cancelled) setDiff(d) }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [item.id, item.status])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const dirty = title !== item.title || description !== item.body.trim() || priority !== item.priority || component !== item.component
  const canSave = dirty && title.trim() && description.trim()

  async function act(fn: () => Promise<unknown>, close = true) {
    setBusy(true); setError('')
    try { await fn(); if (close) onClose() }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-10 bg-[rgba(8,13,20,.7)]" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()}
        className="absolute inset-y-0 right-0 flex w-[34rem] flex-col gap-3 overflow-y-auto border-l border-border bg-surface p-5 shadow-2xl">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-xs text-text-muted">{item.id} · {item.status}</div>
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>
        </div>

        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="rounded-md border border-border bg-sunken px-3 py-2 text-lg font-semibold text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8}
          placeholder="Mô tả chi tiết (bắt buộc)"
          className="resize-none rounded-md border border-border bg-sunken px-3 py-2 text-[14px] leading-[1.65] text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
        <div className="flex gap-2">
          <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-border bg-sunken px-2 py-2 text-text-primary">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>

        <button disabled={!canSave || busy}
          onClick={() => {
            const t = title.trim(), d = description.trim()
            void act(async () => { await api.patchTask(item.id, { title: t, body: d, priority, component }); setTitle(t); setDescription(d) }, false)
          }}
          className="rounded-md border border-border py-2 text-sm font-medium text-text-secondary transition-colors duration-150 hover:bg-raised hover:border-border-strong disabled:opacity-40">
          {dirty ? 'Lưu thay đổi' : 'Đã lưu'}
        </button>

        {error && <p className="text-sm text-danger">{error}</p>}

        <div className="border-t border-border pt-3">
          {CAN_EXECUTE.includes(item.status) && (
            <button disabled={busy} onClick={() => void act(() => api.dispatch(item.id), false)}
              className="w-full rounded-md bg-gradient-to-r from-accent-strong to-accent-deep py-2 font-semibold text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
              ⚡ Giao cho AI
            </button>
          )}
          {item.job && onOpenConsole && (
            <button onClick={() => onOpenConsole(item.job!)}
              className="mt-2 w-full rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">Mở console</button>
          )}
          {item.status === 'review' && (
            <div className="mt-2 flex gap-2">
              <button disabled={busy} onClick={() => void act(() => api.merge(item.id))}
                className="flex-1 rounded-md border border-ok-border bg-ok-bg py-2 text-sm font-medium text-ok transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Merge</button>
              <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
                className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50">Tạo PR</button>
              <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
                className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Hủy bỏ</button>
            </div>
          )}
        </div>

        {diff !== null && (
          <>
            <h3 className="text-xs font-semibold uppercase text-text-muted">Diff (main…board/{item.id})</h3>
            <DiffView diff={diff} />
          </>
        )}

        <div className="mt-auto border-t border-border pt-3">
          {confirmDelete ? (
            <div className="space-y-2">
              <p className="text-sm text-danger">Xóa {item.id}? Không hoàn tác được.</p>
              <div className="flex gap-2">
                <button disabled={busy} onClick={() => void act(() => api.deleteTask(item.id))}
                  className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Xóa hẳn</button>
                <button onClick={() => setConfirmDelete(false)}
                  className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">Thôi</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setConfirmDelete(true)}
              className="text-sm text-text-muted transition-colors duration-150 hover:text-danger">Xóa mục này</button>
          )}
        </div>
      </div>
    </div>
  )
}
