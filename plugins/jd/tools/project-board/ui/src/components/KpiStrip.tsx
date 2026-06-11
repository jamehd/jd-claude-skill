import type { BoardSnapshot } from '../types.js'

export function KpiStrip({ snapshot }: { snapshot: BoardSnapshot }) {
  const open = snapshot.items.filter((i) => i.status !== 'done')
  const bugs = open.filter((i) => i.type === 'bug')
  const running = snapshot.jobs.filter((j) => j.state === 'running' || j.state === 'queued')
  const avg = snapshot.components.length
    ? Math.round(snapshot.components.reduce((s, c) => s + c.completion, 0) / snapshot.components.length)
    : 0
  const cells: [string, string | number][] = [
    ['Hoàn thiện tổng thể', `${avg}%`],
    ['Task đang mở', open.length - bugs.length],
    ['Bug đang mở', bugs.length],
    ['AI đang chạy', running.length],
  ]
  return (
    <div className="grid flex-1 grid-cols-4 gap-3">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <div className="text-2xl font-semibold text-cyan-400">{value}</div>
          <div className="text-xs text-zinc-500">{label}</div>
        </div>
      ))}
    </div>
  )
}
