import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import type { ConsoleEvent, Job, NoteType } from '../types.js'

const NOTE_LABEL: Record<NoteType, string> = {
  user_message: 'Bạn', steer: 'Ngắt & chỉ đạo', queued: 'Đã xếp hàng', error: 'Lỗi', info: 'Hệ thống',
}

type Block =
  | { type: 'text'; text: string }
  | { type: 'tool'; toolId: string; tool: string; inputPreview: string; output?: string; isError?: boolean }
  | { type: 'system'; text: string; tone: 'muted' | 'danger' | 'user' }

function reduceEvents(events: ConsoleEvent[]): Block[] {
  const blocks: Block[] = []
  for (const e of events) {
    if (e.kind === 'text_delta') {
      const last = blocks[blocks.length - 1]
      if (last?.type === 'text') last.text += e.text
      else blocks.push({ type: 'text', text: e.text })
    } else if (e.kind === 'tool_start') {
      blocks.push({ type: 'tool', toolId: e.toolId, tool: e.tool, inputPreview: e.inputPreview })
    } else if (e.kind === 'tool_result') {
      const card = [...blocks].reverse().find((b) => b.type === 'tool' && b.toolId === e.toolId) as
        Extract<Block, { type: 'tool' }> | undefined
      if (card) { card.output = e.output; card.isError = e.isError }
    } else if (e.kind === 'note') {
      blocks.push({ type: 'system', text: `${NOTE_LABEL[e.noteType]}: ${e.text}`,
        tone: e.noteType === 'error' ? 'danger' : e.noteType === 'user_message' ? 'user' : 'muted' })
    } else if (e.kind === 'init') {
      blocks.push({ type: 'system', text: `Phiên ${e.sessionId.slice(0, 8)} · ${e.model}`, tone: 'muted' })
    } else if (e.kind === 'turn_result') {
      const cost = e.costUsd != null ? ` · $${e.costUsd.toFixed(4)}` : ''
      const dur = e.durationMs != null ? ` · ${(e.durationMs / 1000).toFixed(1)}s` : ''
      blocks.push({ type: 'system', text: `Kết thúc lượt (${e.ok ? 'ok' : 'lỗi'})${dur}${cost}`, tone: e.ok ? 'muted' : 'danger' })
    } else if (e.kind === 'raw') {
      blocks.push({ type: 'system', text: e.text, tone: 'muted' })
    }
  }
  return blocks
}

export function ConsoleView({ job, subscribe, onClose, showOpenTab }: {
  job: Job
  subscribe: (jobId: string, cb: (e: ConsoleEvent) => void) => () => void
  onClose?: () => void
  showOpenTab?: boolean
}) {
  const [events, setEvents] = useState<ConsoleEvent[]>([])
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [pinned, setPinned] = useState(true)
  const streamRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    api.jobEvents(job.id).then((history) => { if (!cancelled) setEvents(history) }).catch(() => {})
    const unsub = subscribe(job.id, (e) => setEvents((prev) => [...prev, e]))
    return () => { cancelled = true; unsub() }
  }, [job.id, subscribe])

  useEffect(() => {
    if (pinned) streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight })
  }, [events, pinned])

  const onScroll = useCallback(() => {
    const el = streamRef.current
    if (el) setPinned(el.scrollHeight - el.scrollTop - el.clientHeight < 40)
  }, [])

  async function send(mode: 'queue' | 'steer') {
    if (!text.trim()) return
    setBusy(true)
    setError('')
    try { await api.jobMessage(job.id, text.trim(), mode); setText('') }
    catch (e) { setError(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  const readOnly = job.state === 'cancelled'
  const continuing = job.state !== 'running' && !readOnly
  const blocks = reduceEvents(events)

  return (
    <div className="flex h-full flex-col bg-base">
      <header className="flex items-center gap-3 border-b border-border bg-surface px-4 py-2">
        <span className="font-mono text-[11px] text-text-muted">{job.id}</span>
        <span className="text-sm font-semibold text-text-primary">
          {job.kind === 'rescan' ? 'Re-scan dự án' : job.taskId}
        </span>
        <span className="rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-text-secondary">{job.state}</span>
        {job.sessionId && <span className="font-mono text-[10px] text-text-muted">phiên {job.sessionId.slice(0, 8)} · khúc {job.segments ?? 1}</span>}
        <span className="flex-1" />
        {showOpenTab && (
          <a href={`/console/${job.id}`} target="_blank" rel="noreferrer"
            className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">↗ Tab riêng</a>
        )}
        {onClose && <button onClick={onClose} className="text-text-muted hover:text-text-primary">✕</button>}
      </header>

      <div ref={streamRef} onScroll={onScroll} className="relative flex-1 space-y-3 overflow-y-auto p-4">
        {blocks.length === 0 && <p className="text-center text-sm text-text-muted">Chưa có sự kiện nào.</p>}
        {blocks.map((b, i) =>
          b.type === 'text' ? (
            <div key={i} className="whitespace-pre-wrap text-[14px] leading-[1.65] text-text-primary">{b.text}</div>
          ) : b.type === 'tool' ? (
            <details key={i} className="rounded-lg border border-border bg-surface">
              <summary className="cursor-pointer px-3 py-2 font-mono text-[11px] text-text-secondary">
                <span className={b.isError ? 'text-danger' : 'text-accent'}>⚙ {b.tool}</span>
                <span className="ml-2 text-text-muted">{b.inputPreview}</span>
              </summary>
              {b.output != null && (
                <pre className={`max-h-64 overflow-auto border-t border-border bg-sunken p-3 font-mono text-[11.5px] leading-[1.55] ${b.isError ? 'text-danger' : 'text-text-secondary'}`}>{b.output}</pre>
              )}
            </details>
          ) : (
            <div key={i} className={`font-mono text-[11px] ${b.tone === 'danger' ? 'text-danger' : b.tone === 'user' ? 'text-accent' : 'text-text-muted'}`}>{b.text}</div>
          ),
        )}
        {!pinned && (
          <button onClick={() => { setPinned(true); streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight }) }}
            className="sticky bottom-2 left-full rounded-full border border-border bg-raised px-3 py-1 text-xs text-text-secondary">↓ mới nhất</button>
        )}
      </div>

      <footer className="border-t border-border bg-surface p-3">
        {error && <p className="mb-2 text-xs text-danger">{error}</p>}
        <div className="flex gap-2">
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={2}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send('queue') } }}
            placeholder={readOnly ? 'Phiên đã đóng (job bị hủy)' : continuing ? 'Tiếp tục phiên — nhắn cho AI…' : 'Nhắn cho AI (Enter gửi, AI nhận khi xong lượt)…'}
            disabled={readOnly || busy}
            className="flex-1 resize-none rounded-lg border border-border bg-sunken px-3 py-2 text-[14px] text-text-primary outline-none transition-colors duration-150 focus:border-accent disabled:opacity-50"
          />
          <div className="flex flex-col gap-1">
            <button disabled={readOnly || busy || !text.trim()} onClick={() => void send('queue')}
              className="rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep px-4 py-1.5 text-xs font-semibold text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
              {continuing ? 'Tiếp tục phiên' : 'Gửi'}
            </button>
            {job.state === 'running' && (
              <button disabled={busy || !text.trim()} onClick={() => void send('steer')}
                title="Dừng lượt hiện tại ngay và chỉ đạo lại"
                className="rounded-lg border border-danger-border bg-danger-bg px-4 py-1.5 text-xs font-semibold text-danger transition-colors duration-150 hover:brightness-110 disabled:opacity-50">
                ⚡ Ngắt & chỉ đạo
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  )
}
