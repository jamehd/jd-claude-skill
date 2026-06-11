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
  P0: 'text-red-400', P1: 'text-orange-400', P2: 'text-zinc-400', P3: 'text-zinc-600',
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
      {error && <p className="mb-1 text-xs text-red-400">{error}</p>}
      <div className="grid flex-1 grid-cols-5 gap-2 overflow-y-auto">
        {COLUMNS.map((col) => (
          <div key={col.key} className="flex flex-col gap-2 rounded-xl bg-zinc-900/60 p-2"
            onDragOver={(e) => { if (col.key !== 'ai_running') e.preventDefault() }}
            onDrop={(e) => void drop(e, col.key)}>
            <h3 className="px-1 text-xs font-semibold uppercase text-zinc-500">
              {col.label} · {items.filter((i) => i.status === col.key).length}
            </h3>
            {items.filter((i) => i.status === col.key).map((item) => (
              <div key={item.id} draggable={item.status !== 'ai_running'}
                onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
                onClick={() => onSelect(item.id)}
                className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm hover:border-cyan-700">
                <div className="flex justify-between text-xs text-zinc-500">
                  <span>{item.id}</span>
                  <span className={PRIORITY_COLOR[item.priority]}>{item.priority}</span>
                </div>
                <div className={item.type === 'bug' ? 'text-red-300' : ''}>{item.title}</div>
                <div className="text-xs text-zinc-600">{item.component}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
