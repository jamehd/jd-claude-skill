import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import type { UsageReport, UsageBucket } from '../types.js'

function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k'
  return String(n)
}

function countdown(resetsAt: number, now: number): string {
  const s = Math.max(0, resetsAt - Math.floor(now / 1000))
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export function UsagePanel({ refreshKey }: { refreshKey: number }) {
  const [usage, setUsage] = useState<UsageReport | null>(null)
  const [now, setNow] = useState(() => Date.now())

  const load = useCallback(() => { api.getUsage().then(setUsage).catch(() => {}) }, [])
  useEffect(() => { load() }, [load, refreshKey])
  // Tick every second so the reset countdown stays live without re-fetching.
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t) }, [])

  if (!usage) return null
  const rl = usage.rateLimit
  const ok = !rl || rl.status === 'allowed'

  function windowRow(label: string, b: UsageBucket) {
    return (
      <div className="flex items-center justify-between gap-3"
        title={`input ${fmt(b.inputTokens)} · output ${fmt(b.outputTokens)} · cache read ${fmt(b.cacheReadTokens)} · cache create ${fmt(b.cacheCreationTokens)}`}>
        <span className="text-text-muted">{label}</span>
        <span className="font-mono text-text-primary">
          {fmt(b.inputTokens + b.outputTokens)} tok
          <span className="text-text-muted" title="tham khảo theo giá API — không phải tiền thật"> · ${b.costUsd.toFixed(2)}</span>
          <span className="text-text-muted"> · {b.jobs} job</span>
        </span>
      </div>
    )
  }

  return (
    <div className="flex w-72 flex-col gap-1.5 rounded-xl border border-border bg-surface px-3 py-2 text-xs">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-text-secondary">Gói AI</span>
        {rl ? (
          <>
            <span className={`rounded-full border border-current px-1.5 py-0.5 font-mono text-[11px] uppercase ${ok ? 'text-ok' : 'text-danger'}`}>
              {rl.status}{rl.isUsingOverage ? ' · overage' : ''}
            </span>
            <span className="ml-auto text-text-secondary">
              reset <span className="font-mono text-text-primary">{countdown(rl.resetsAt, now)}</span>
              <span className="text-text-muted"> ({rl.rateLimitType})</span>
            </span>
          </>
        ) : <span className="text-text-muted">chưa có dữ liệu (chạy job để bắt đầu)</span>}
      </div>
      <div className="space-y-0.5 border-t border-border pt-1.5">
        {windowRow('Cửa sổ 5h', usage.windows.fiveHour)}
        {windowRow('Hôm nay', usage.windows.today)}
        {windowRow('Tổng', usage.windows.total)}
      </div>
    </div>
  )
}
