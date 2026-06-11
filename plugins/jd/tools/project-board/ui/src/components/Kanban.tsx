import { useState } from 'react'
import { api } from '../api.js'
import type { BoardItem, ItemStatus } from '../types.js'

const COLUMNS: { key: ItemStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready', label: 'Sẵn sàng' },
  { key: 'ai_running', label: 'AI đang làm' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Hoàn thành' },
]

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-danger', P1: 'text-ready', P2: 'text-text-secondary', P3: 'text-text-muted',
}

const STATUS_EDGE: Record<ItemStatus, string> = {
  backlog: 'border-l-text-secondary',
  ready: 'border-l-ready',
  ai_running: 'border-l-running',
  review: 'border-l-ok',
  done: 'border-l-ok',
}

export function Kanban({ items, onSelect }: { items: BoardItem[]; onSelect: (id: string) => void }) {
  const [error, setError] = useState('')

  async function drop(e: React.DragEvent, status: ItemStatus) {
    if (status === 'ai_running') return
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    setError('')
    try { await api.patchTask(id, { status }) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className="grid flex-1 grid-cols-5 gap-2 overflow-y-auto">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col gap-2 rounded-[10px] bg-sunken p-2"
            onDragOver={(e) => { if (col.key !== 'ai_running') e.preventDefault() }}
            onDrop={(e) => void drop(e, col.key)}>
            <h3 className="px-1 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              {col.key === 'ai_running' && <span className="text-accent">◉ </span>}
              {col.label} · {items.filter((i) => i.status === col.key).length}
            </h3>
            {items.filter((i) => i.status === col.key).map((item) => (
              <div key={item.id} draggable={item.status !== 'ai_running'}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                onClick={() => onSelect(item.id)}
                className={`cursor-pointer rounded-lg border-y border-r border-l-2 border-border ${STATUS_EDGE[item.status]} bg-surface p-2 text-sm transition-colors duration-150 hover:border-border-strong hover:bg-raised`}>
                <div className="flex justify-between font-mono text-xs">
                  <span className="text-text-muted">{item.id}</span>
                  <span className={PRIORITY_COLOR[item.priority]}>{item.priority}</span>
                </div>
                <div className={item.type === 'bug' ? 'text-danger' : 'text-text-primary'}>{item.title}</div>
                <div className="text-xs text-text-muted">{item.component}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
