import type { BoardSnapshot } from '../types.js'

export function KpiStrip({ snapshot }: { snapshot: BoardSnapshot }) {
  const open = snapshot.items.filter((i) => i.status !== 'done')
  const bugs = open.filter((i) => i.type === 'bug')
  const running = snapshot.jobs.filter((j) => j.state === 'running' || j.state === 'queued')
  const n = snapshot.components.length
  const avgBuilt = n ? Math.round(snapshot.components.reduce((s, c) => s + c.built, 0) / n) : 0
  const avgTested = n ? Math.round(snapshot.components.reduce((s, c) => s + c.tested, 0) / n) : 0
  const cells: [string, string | number, 'accent' | 'ok' | 'plain'][] = [
    ['Đã làm tổng thể', `${avgBuilt}%`, 'accent'],
    ['Đã test tổng thể', `${avgTested}%`, 'ok'],
    ['Task đang mở', open.length - bugs.length, 'plain'],
    ['Bug đang mở', bugs.length, 'plain'],
    ['AI đang chạy', running.length, 'plain'],
  ]
  const tone = { accent: 'text-accent', ok: 'text-ok', plain: 'text-text-primary' }
  return (
    <div className="grid flex-1 grid-cols-5 gap-3">
      {cells.map(([label, value, color]) => (
        <div key={label} className="rounded-[10px] border border-border bg-surface p-4 text-center">
          <div className={`font-mono text-2xl font-semibold ${tone[color]}`}>{value}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        </div>
      ))}
    </div>
  )
}
