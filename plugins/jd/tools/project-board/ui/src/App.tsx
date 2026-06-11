import { useState } from 'react'
import { Login } from './components/Login.js'
import { KpiStrip } from './components/KpiStrip.js'
import { ComponentsPanel } from './components/ComponentsPanel.js'
import { Kanban } from './components/Kanban.js'
import { QuickAdd } from './components/QuickAdd.js'
import { ActivityPanel } from './components/ActivityPanel.js'
import { TaskDrawer } from './components/TaskDrawer.js'
import { useBoard } from './useBoard.js'

export default function App() {
  const [authed, setAuthed] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const { snapshot, logLines, refresh } = useBoard(() => setAuthed(false))

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-zinc-400">Đang tải…</div>

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <KpiStrip snapshot={snapshot} />
        <button onClick={() => setAdding(true)}
          className="rounded-xl bg-cyan-600 px-4 py-3 font-medium hover:bg-cyan-500">⊕ Thêm task / bug</button>
      </div>
      {snapshot.invalid.length > 0 && (
        <div className="rounded-lg border border-orange-900 bg-orange-950/40 p-2 text-xs text-orange-300">
          <span className="font-semibold">File lỗi không đọc được: </span>
          {snapshot.invalid.map((f) => `${f.file} (${f.error})`).join(' · ')}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        <ComponentsPanel components={snapshot.components} />
        <Kanban items={snapshot.items} onSelect={setSelected} />
        <ActivityPanel jobs={snapshot.jobs} logLines={logLines} />
      </div>
      {adding && <QuickAdd components={snapshot.components} onClose={() => setAdding(false)} />}
      {selected && snapshot.items.find((i) => i.id === selected) && (
        <TaskDrawer item={snapshot.items.find((i) => i.id === selected)!} onClose={() => setSelected(null)} />
      )}
    </div>
  )
}
