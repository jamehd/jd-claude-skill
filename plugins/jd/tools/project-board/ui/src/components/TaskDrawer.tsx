import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem, ComponentStatus, Priority } from '../types.js'
import { DiffModal } from './DiffModal.js'
import { DiffView } from './DiffView.js'

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']
const CAN_EXECUTE = ['backlog', 'ready']
const SHAPEABLE: string[] = ['backlog', 'ready']

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
  const [diffOpen, setDiffOpen] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [plan, setPlan] = useState(item.plan ?? '')
  const [brainstorm, setBrainstorm] = useState<string | null>(null)
  const [mergeConflict, setMergeConflict] = useState(false)

  useEffect(() => {
    setTitle(item.title); setDescription(item.body.trim()); setPriority(item.priority)
    setComponent(item.component); setConfirmDelete(false); setError('')
    setPlan(item.plan ?? ''); setBrainstorm(null); setMergeConflict(false)
  }, [item.id]) // seed only on item change, not on every board refresh

  useEffect(() => {
    setDiff(null)
    if (item.status !== 'review') return
    let cancelled = false
    api.diff(item.id).then((d) => { if (!cancelled) setDiff(d) }).catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : String(e)) })
    return () => { cancelled = true }
  }, [item.id, item.status])

  useEffect(() => {
    // When the diff modal is open it owns Escape; don't also close the drawer underneath.
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !diffOpen) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, diffOpen])

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

        {SHAPEABLE.includes(item.status) && (
          <div className="rounded-md border border-border bg-sunken p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-text-secondary">
                {item.requiresShaping ? (item.plan?.trim() ? '✓ Đã nắn (plan đã đính)' : '⚙ Cần brainstorm trước khi sang Ready') : 'Không cần brainstorm'}
              </span>
              <button disabled={busy} onClick={() => void act(() => api.patchTask(item.id, { requiresShaping: !item.requiresShaping }), false)}
                className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                {item.requiresShaping ? 'Bỏ yêu cầu nắn' : 'Đánh dấu cần nắn'}
              </button>
            </div>
            {item.requiresShaping && (
              <>
                <button disabled={busy}
                  onClick={() => void act(async () => {
                    const { prompt } = await api.getBrainstormPrompt(item.id)
                    setBrainstorm(prompt)
                    try { await navigator.clipboard?.writeText(prompt) } catch { /* http LAN: manual copy below */ }
                  }, false)}
                  className="mt-2 w-full rounded border border-border py-1.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">
                  Brainstorm → copy prompt cho terminal
                </button>
                {brainstorm !== null && (
                  <textarea readOnly value={brainstorm} rows={4} onFocus={(e) => e.currentTarget.select()}
                    className="mt-2 w-full resize-none rounded border border-border bg-base px-2 py-1 font-mono text-[12px] text-text-secondary outline-none" />
                )}
                <textarea value={plan} onChange={(e) => setPlan(e.target.value)} rows={3}
                  placeholder="Dán plan (markdown) hoặc đường dẫn docs/plans/….md"
                  className="mt-2 w-full resize-none rounded border border-border bg-sunken px-2 py-1 text-xs text-text-primary outline-none transition-colors duration-150 focus:border-accent" />
                <button disabled={busy || plan === (item.plan ?? '')}
                  onClick={() => void act(() => api.patchTask(item.id, { plan }), false)}
                  className="mt-1 rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-40">
                  {plan === (item.plan ?? '') ? 'Plan đã lưu' : 'Lưu plan'}
                </button>
              </>
            )}
          </div>
        )}

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
            <>
              <div className="mt-2 flex gap-2">
                <button disabled={busy}
                  onClick={() => {
                    setMergeConflict(false)
                    void act(async () => {
                      try { await api.merge(item.id) }
                      catch (e) { if (e instanceof Error && /conflict/i.test(e.message)) setMergeConflict(true); throw e }
                    })
                  }}
                  className="flex-1 rounded-md border border-ok-border bg-ok-bg py-2 text-sm font-medium text-ok transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Merge</button>
                <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
                  className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50">Tạo PR</button>
                <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
                  className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Hủy bỏ</button>
              </div>
              {mergeConflict && (
                <button disabled={busy} onClick={() => void act(() => api.resolve(item.id), false)}
                  className="mt-2 w-full rounded-md border border-accent bg-raised py-2 text-sm font-medium text-accent transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                  🤖 AI đồng bộ main + vá conflict
                </button>
              )}
            </>
          )}
          {item.status === 'pr' && (
            <div className="mt-2">
              {item.pr && (
                <a href={item.pr} target="_blank" rel="noreferrer"
                  className="mb-2 block font-mono text-xs text-pr hover:underline">🔗 {item.pr}</a>
              )}
              <button disabled={busy} onClick={() => void act(() => api.finalizePr(item.id))}
                className="w-full rounded-md border border-pr-border bg-pr-bg py-2 text-sm font-medium text-pr transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                PR đã merge → dọn
              </button>
              <div className="mt-2 border-t border-border pt-2">
                <p className="mb-1 text-xs text-text-muted">PR bị đóng (không merge)?</p>
                <div className="flex gap-2">
                  <button disabled={busy} onClick={() => void act(() => api.abandonPr(item.id, 'reopen'))}
                    className="flex-1 rounded-md border border-border py-2 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised disabled:opacity-50">
                    Làm lại (→ backlog)
                  </button>
                  <button disabled={busy} onClick={() => { if (confirm(`Bỏ hẳn ${item.id}? Xóa task + branch (local + GitHub).`)) void act(() => api.abandonPr(item.id, 'delete')) }}
                    className="flex-1 rounded-md border border-danger-border bg-danger-bg py-2 text-sm font-medium text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                    Bỏ hẳn
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {diff !== null && (
          <>
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-text-muted">Diff (main…board/{item.id})</h3>
              <button onClick={() => setDiffOpen(true)}
                className="rounded border border-border px-2 py-0.5 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">⤢ Mở rộng</button>
            </div>
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
      {diffOpen && diff && <DiffModal id={item.id} diff={diff} onClose={() => setDiffOpen(false)} />}
    </div>
  )
}
