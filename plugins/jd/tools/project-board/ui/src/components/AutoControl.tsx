import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import type { AutoState } from '../types.js'

export function AutoControl({ refreshKey }: { refreshKey: number }) {
  const [auto, setAuto] = useState<AutoState | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => { api.getAuto().then(setAuto).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, refreshKey])

  async function toggle() {
    if (!auto) return
    setBusy(true)
    try { setAuto(await api.setAuto({ enabled: !auto.enabled })) } catch { /* ignore */ } finally { setBusy(false) }
  }
  async function resume() {
    setBusy(true)
    try { setAuto(await api.setAuto({ enabled: true })) } catch { /* ignore */ } finally { setBusy(false) }
  }
  if (!auto) return null
  const label = !auto.enabled ? 'Tự động: Tắt'
    : auto.paused ? `Tự động: Tạm dừng — ${auto.pauseReason ?? ''}`
    : `Tự động: Đang chạy · ${auto.dispatched}/${auto.maxAuto}`
  const tone = !auto.enabled ? 'text-text-muted' : auto.paused ? 'text-danger' : 'text-accent'

  return (
    <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <button disabled={busy} onClick={() => void toggle()}
        className={`rounded px-2 py-1 text-xs font-medium transition-colors duration-150 ${auto.enabled ? 'bg-gradient-to-r from-accent-strong to-accent-deep text-[#e6fbff]' : 'border border-border text-text-secondary hover:bg-raised'}`}>
        {auto.enabled ? 'Tắt tự động' : 'Bật tự động'}
      </button>
      <span className={`text-xs ${tone}`}>{label}</span>
      {auto.paused && (
        <button disabled={busy} onClick={() => void resume()}
          className="rounded border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:bg-raised">Tiếp tục</button>
      )}
    </div>
  )
}
