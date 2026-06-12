import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api.js'
import type { AutoState } from '../types.js'

export function SettingsPanel({ refreshKey }: { refreshKey: number }) {
  const [open, setOpen] = useState(false)
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [conc, setConc] = useState(1)
  const [maxAuto, setMaxAuto] = useState(10)
  const [thresh, setThresh] = useState(3)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(() => {
    api.getAuto().then((a) => {
      setAuto(a); setConc(a.maxConcurrent); setMaxAuto(a.maxAuto); setThresh(a.failureThreshold)
    }).catch(() => {})
  }, [])
  useEffect(() => { load() }, [load, refreshKey])

  // Close on outside click or Escape while popover is open
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('mousedown', onDown); window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey) }
  }, [open])

  async function save() {
    setBusy(true); setMsg('')
    try {
      const a = await api.setAuto({ maxConcurrent: conc, maxAuto, failureThreshold: thresh })
      setAuto(a); setMsg('Đã lưu')
    } catch (e) { setMsg(e instanceof Error ? e.message : String(e)) }
    finally { setBusy(false) }
  }

  function field(label: string, val: number, set: (n: number) => void, min: number, max?: number) {
    return (
      <label className="flex items-center justify-between gap-3 text-sm text-text-secondary">
        <span>{label}</span>
        <input type="number" min={min} max={max} value={val}
          onChange={(e) => { const n = Number(e.target.value); if (!Number.isNaN(n)) set(n) }}
          className="w-20 rounded border border-border bg-sunken px-2 py-1 text-text-primary outline-none focus:border-accent" />
      </label>
    )
  }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => { if (!open) load(); setOpen((o) => !o) }} title="Cài đặt"
        className="rounded-xl border border-border bg-surface px-3 py-2 text-text-secondary transition-colors duration-150 hover:bg-raised">⚙</button>
      {open && auto && (
        <div className="absolute right-0 z-20 mt-2 w-72 space-y-3 rounded-xl border border-border bg-surface p-4 shadow-2xl">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-text-muted">Cài đặt vận hành</h3>
          {field('Số task song song (1–8)', conc, setConc, 1, 8)}
          {field('maxAuto (auto/phiên)', maxAuto, setMaxAuto, 1)}
          {field('Ngưỡng tạm dừng auto', thresh, setThresh, 1)}
          <div className="flex items-center justify-between">
            <span className="text-xs text-text-muted">{msg}</span>
            <button disabled={busy} onClick={() => void save()}
              className="rounded bg-gradient-to-r from-accent-strong to-accent-deep px-3 py-1 text-xs font-medium text-[#e6fbff] transition-colors duration-150 hover:brightness-110 disabled:opacity-50">Lưu</button>
          </div>
        </div>
      )}
    </div>
  )
}
