import type { BoardFilter } from '../filters.js'
import { isFilterActive, EMPTY_FILTER } from '../filters.js'
import type { Priority } from '../types.js'

const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

export function FilterBar(
  { components, filter, onChange }:
  { components: string[]; filter: BoardFilter; onChange: (f: BoardFilter) => void },
) {
  const sel = 'rounded-md border border-border bg-sunken px-2 py-1.5 text-sm text-text-primary'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={filter.component} onChange={(e) => onChange({ ...filter, component: e.target.value })}>
        <option value="all">Service: tất cả</option>
        {components.map((c) => <option key={c} value={c}>{c}</option>)}
      </select>
      <select className={sel} value={filter.shaped} onChange={(e) => onChange({ ...filter, shaped: e.target.value as BoardFilter['shaped'] })}>
        <option value="all">Nắn: tất cả</option>
        <option value="shaped">Đã nắn</option>
        <option value="unshaped">Chưa nắn</option>
      </select>
      <select className={sel} value={filter.type} onChange={(e) => onChange({ ...filter, type: e.target.value as BoardFilter['type'] })}>
        <option value="all">Loại: tất cả</option>
        <option value="task">task</option>
        <option value="bug">bug</option>
      </select>
      <select className={sel} value={filter.priority} onChange={(e) => onChange({ ...filter, priority: e.target.value as BoardFilter['priority'] })}>
        <option value="all">Ưu tiên: tất cả</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
      {isFilterActive(filter) && (
        <button onClick={() => onChange(EMPTY_FILTER)}
          className="rounded-md border border-border px-2 py-1.5 text-sm text-text-secondary transition-colors duration-150 hover:bg-raised">
          Xóa lọc
        </button>
      )}
    </div>
  )
}
