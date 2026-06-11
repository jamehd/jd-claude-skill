import { useEffect, useState } from 'react'
import { Login } from './components/Login.js'
import { KpiStrip } from './components/KpiStrip.js'
import { ComponentsPanel } from './components/ComponentsPanel.js'
import { Kanban } from './components/Kanban.js'
import { QuickAdd } from './components/QuickAdd.js'
import { ActivityPanel } from './components/ActivityPanel.js'
import { TaskDrawer } from './components/TaskDrawer.js'
import { ConsoleView } from './components/ConsoleView.js'
import { useBoard } from './useBoard.js'

export default function App() {
  const [authed, setAuthed] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [consoleJob, setConsoleJob] = useState<string | null>(null)
  const { snapshot, previews, subscribe, refresh } = useBoard(() => setAuthed(false))

  useEffect(() => {
    if (!consoleJob) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setConsoleJob(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [consoleJob])

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-text-secondary">Đang tải…</div>

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <KpiStrip snapshot={snapshot} />
        <button onClick={() => setAdding(true)}
          className="rounded-lg bg-gradient-to-r from-accent-strong to-accent-deep px-4 py-3 font-medium text-[#e6fbff] shadow-[0_0_18px_rgba(67,217,232,.18)] transition-colors duration-150 hover:brightness-110">⊕ Thêm task / bug</button>
      </div>
      {snapshot.invalid.length > 0 && (
        <div className="rounded-lg border border-danger-border bg-danger-bg p-2 text-xs text-danger">
          <span className="font-semibold">File lỗi không đọc được: </span>
          {snapshot.invalid.map((f) => `${f.file} (${f.error})`).join(' · ')}
        </div>
      )}
      <div className="flex min-h-0 flex-1 gap-3">
        <ComponentsPanel components={snapshot.components} />
        <Kanban items={snapshot.items} onSelect={setSelected} />
        <ActivityPanel jobs={snapshot.jobs} previews={previews} onOpenConsole={setConsoleJob} />
      </div>
      {adding && <QuickAdd components={snapshot.components} onClose={() => setAdding(false)} />}
      {selected && snapshot.items.find((i) => i.id === selected) && (
        <TaskDrawer item={snapshot.items.find((i) => i.id === selected)!} components={snapshot.components}
          onClose={() => setSelected(null)} onOpenConsole={(jobId) => { setConsoleJob(jobId); setSelected(null) }} />
      )}
      {consoleJob && snapshot.jobs.find((j) => j.id === consoleJob) && (
        <div className="fixed inset-3 z-30 overflow-hidden rounded-xl border border-border-strong shadow-2xl">
          <ConsoleView job={snapshot.jobs.find((j) => j.id === consoleJob)!} subscribe={subscribe}
            onClose={() => setConsoleJob(null)} showOpenTab />
        </div>
      )}
    </div>
  )
}
