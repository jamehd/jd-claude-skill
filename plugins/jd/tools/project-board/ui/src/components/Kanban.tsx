import { useState } from 'react'
import { api } from '../api.js'
import { epicOf, hasAnyEpic, groupByEpic } from '../filters.js'
import type { BoardItem, ItemStatus } from '../types.js'

const COLUMNS: { key: ItemStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready', label: 'Sẵn sàng' },
  { key: 'ai_running', label: 'AI đang làm' },
  { key: 'review', label: 'Review' },
  { key: 'pr', label: 'PR mở' },
  { key: 'done', label: 'Hoàn thành' },
  { key: 'cancelled', label: 'Đã huỷ' },
]

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-danger', P1: 'text-ready', P2: 'text-text-secondary', P3: 'text-text-muted',
}

const STATUS_EDGE: Record<ItemStatus, string> = {
  backlog: 'border-l-text-secondary',
  ready: 'border-l-ready',
  ai_running: 'border-l-running',
  review: 'border-l-ok',
  pr: 'border-l-pr',
  done: 'border-l-ok',
  cancelled: 'border-l-text-muted',
}

const TYPE_CARD: Record<string, string> = {
  task: 'bg-task-bg border-task-border',
  bug: 'bg-bug-bg border-bug-border',
}

const TYPE_BADGE: Record<string, string> = {
  task: 'text-accent', bug: 'text-danger',
}

const STATUS_PILL: Record<ItemStatus, string> = {
  backlog: 'text-text-secondary border-border',
  ready: 'text-ready border-ready-border',
  ai_running: 'text-running border-running-border',
  review: 'text-ok border-ok-border',
  pr: 'text-pr border-pr-border',
  done: 'text-ok border-ok-border',
  cancelled: 'text-text-muted border-border',
}

export function Kanban(
  { items, onSelect, selectMode, selected, onToggle }:
  { items: BoardItem[]; onSelect: (id: string) => void; selectMode: boolean;
    selected: Set<string>; onToggle: (id: string) => void },
) {
  const [error, setError] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key); else next.add(key)
      return next
    })
  }

  async function drop(e: React.DragEvent, status: ItemStatus) {
    if (status === 'ai_running' || status === 'pr') return
    const id = e.dataTransfer.getData('text/plain')
    if (!id) return
    setError('')
    if (status === 'ready') {
      const it = items.find((i) => i.id === id)
      if (it?.requiresShaping && !it.plan?.trim()) {
        setError('Task cần brainstorm + đính plan trước khi sang Ready')
        return
      }
    }
    try { await api.patchTask(id, { status }) } catch (err) { setError(err instanceof Error ? err.message : String(err)) }
  }

  function card(item: BoardItem, colLabel: string) {
    const epic = epicOf(item)
    return (
      <div key={item.id} draggable={item.status !== 'ai_running' && item.status !== 'pr'}
        onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
        onClick={() => { if (selectMode) onToggle(item.id); else onSelect(item.id) }}
        className={`cursor-pointer rounded-lg border border-l-2 p-2 text-sm transition-colors duration-150 hover:border-y-border-strong hover:border-r-border-strong ${TYPE_CARD[item.type]} ${STATUS_EDGE[item.status]}`}>
        {selectMode && (
          <input type="checkbox" checked={selected.has(item.id)} readOnly
            className="mb-1 accent-accent pointer-events-none" />
        )}
        <div className="flex items-center justify-between text-xs">
          <span className="font-mono text-text-muted">{item.id}</span>
          <span className={`font-mono ${PRIORITY_COLOR[item.priority]}`}>{item.priority}</span>
        </div>
        <div className={`mt-0.5 ${item.status === 'cancelled' ? 'text-text-muted line-through' : item.type === 'bug' ? 'text-danger' : 'text-text-primary'}`}>{item.title}</div>
        {item.pr && (
          <a href={item.pr} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}
            className="mt-1 inline-block font-mono text-[12px] text-pr hover:underline">🔗 PR</a>
        )}
        <div className="mt-1 flex items-center justify-between">
          <span className="text-xs text-text-muted">{item.component}</span>
          <span className="flex gap-1">
            {epic && (
              <span className="rounded-full border border-epic-border bg-epic-bg px-1.5 py-0.5 font-mono text-[11px] uppercase text-epic">🏷 {epic}</span>
            )}
            {item.requiresShaping && !item.plan?.trim() && (
              <span className="rounded-full border border-shape-border px-1.5 py-0.5 font-mono text-[11px] uppercase text-shape">⚙ nắn</span>
            )}
            {item.plan?.trim() && (
              <span className="rounded-full border border-ok-border px-1.5 py-0.5 font-mono text-[11px] uppercase text-ok">✓ nắn</span>
            )}
            <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] uppercase ${TYPE_BADGE[item.type]} border-current`}>{item.type}</span>
            <span className={`rounded-full border px-1.5 py-0.5 font-mono text-[11px] ${STATUS_PILL[item.status]}`}>{colLabel}</span>
          </span>
        </div>
      </div>
    )
  }

  // The terminal "Đã huỷ" column only takes board space when something is cancelled.
  const hasCancelled = items.some((i) => i.status === 'cancelled')
  const columns = COLUMNS.filter((c) => c.key !== 'cancelled' || hasCancelled)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      {error && <p className="mb-1 text-xs text-danger">{error}</p>}
      <div className={`grid flex-1 ${hasCancelled ? 'grid-cols-7' : 'grid-cols-6'} gap-2 overflow-y-auto`}>
        {columns.map((col) => {
          const colItems = items.filter((i) => i.status === col.key)
          return (
            <div key={col.key} className="flex flex-col gap-2 rounded-[10px] bg-sunken p-2"
              onDragOver={(e) => { if (col.key !== 'ai_running' && col.key !== 'pr') e.preventDefault() }}
              onDrop={(e) => void drop(e, col.key)}>
              <h3 className="px-1 text-[12px] font-semibold uppercase tracking-wider text-text-muted">
                {col.key === 'ai_running' && <span className="text-accent">◉ </span>}
                {col.label} · {colItems.length}
              </h3>
              {hasAnyEpic(colItems)
                ? groupByEpic(colItems).map((group) => {
                    const gkey = `${col.key}|${group.epic ?? '∅'}`
                    const isCollapsed = collapsed.has(gkey)
                    return (
                      <div key={gkey} className="flex flex-col gap-2">
                        <button onClick={() => toggleGroup(gkey)}
                          className={`flex items-center gap-1 rounded-md border px-1.5 py-1 text-left font-mono text-[11px] uppercase transition-colors duration-150 ${
                            group.epic
                              ? 'border-epic-border bg-epic-bg text-epic hover:brightness-125'
                              : 'border-border text-text-muted hover:bg-raised'
                          }`}>
                          <span className="text-[10px]">{isCollapsed ? '▸' : '▾'}</span>
                          <span className="truncate">{group.epic ? `🏷 ${group.epic}` : '(không epic)'}</span>
                          <span className="opacity-70">· {group.items.length}</span>
                        </button>
                        {!isCollapsed && group.items.map((item) => card(item, col.label))}
                      </div>
                    )
                  })
                : colItems.map((item) => card(item, col.label))}
            </div>
          )
        })}
      </div>
    </div>
  )
}
