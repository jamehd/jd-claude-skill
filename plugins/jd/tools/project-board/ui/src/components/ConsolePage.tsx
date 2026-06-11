import { useState } from 'react'
import { Login } from './Login.js'
import { ConsoleView } from './ConsoleView.js'
import { useBoard } from '../useBoard.js'

export function ConsolePage({ jobId }: { jobId: string }) {
  const [authed, setAuthed] = useState(true)
  const { snapshot, subscribe, refresh } = useBoard(() => setAuthed(false))

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-text-secondary">Đang tải…</div>
  const job = snapshot.jobs.find((j) => j.id === jobId)
  if (!job) return <div className="p-8 text-text-secondary">Không tìm thấy job {jobId}.</div>
  return <div className="h-screen"><ConsoleView job={job} subscribe={subscribe} /></div>
}
