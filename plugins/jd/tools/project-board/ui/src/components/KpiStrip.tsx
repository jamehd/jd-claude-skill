import type { BoardSnapshot } from '../types.js'

export function KpiStrip({ snapshot }: { snapshot: BoardSnapshot }) {
  const open = snapshot.items.filter((i) => i.status !== 'done')
  const bugs = open.filter((i) => i.type === 'bug')
  const running = snapshot.jobs.filter((j) => j.state === 'running' || j.state === 'queued')
  const avg = snapshot.components.length
    ? Math.round(snapshot.components.reduce((s, c) => s + c.completion, 0) / snapshot.components.length)
    : 0
  const cells: [string, string | number, boolean][] = [
    ['Hoàn thiện tổng thể', `${avg}%`, true],
    ['Task đang mở', open.length - bugs.length, false],
    ['Bug đang mở', bugs.length, false],
    ['AI đang chạy', running.length, false],
  ]
  return (
    <div className="grid flex-1 grid-cols-4 gap-3">
      {cells.map(([label, value, accent]) => (
        <div key={label} className="rounded-[10px] border border-border bg-surface p-4 text-center">
          <div className={`font-mono text-2xl font-semibold ${accent ? 'text-accent' : 'text-text-primary'}`}>{value}</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-text-muted">{label}</div>
        </div>
      ))}
    </div>
  )
}
