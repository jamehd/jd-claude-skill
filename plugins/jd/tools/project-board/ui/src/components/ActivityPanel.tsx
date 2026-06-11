import { useState } from 'react'
import { api } from '../api.js'
import type { Job } from '../types.js'

const STATE_COLOR: Record<string, string> = {
  queued: 'text-zinc-400', running: 'text-cyan-400', succeeded: 'text-green-400',
  failed: 'text-red-400', cancelled: 'text-zinc-500', interrupted: 'text-orange-400',
}

export function ActivityPanel({ jobs, logLines }: { jobs: Job[]; logLines: Record<string, string> }) {
  const latestSucceededRescan = jobs.find((j) => j.kind === 'rescan' && j.state === 'succeeded')
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase text-zinc-500">Hoạt động AI</h2>
      {jobs.length === 0 && <p className="text-sm text-zinc-600">Chưa có job nào.</p>}
      {jobs.map((job) => (
        <div key={job.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <div className="flex justify-between">
            <span>{job.id} · {job.kind === 'rescan' ? 'Re-scan' : job.taskId}</span>
            <span className={STATE_COLOR[job.state]}>{job.state}</span>
          </div>
          {job.error && <p className="mt-1 text-xs text-red-400">{job.error}</p>}
          {job.state === 'running' && (
            <>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {logLines[job.id] ?? 'Đang chờ output…'}
              </pre>
              <button onClick={() => void api.cancelJob(job.id)}
                className="mt-2 rounded bg-zinc-800 px-2 py-1 text-xs text-red-300 hover:bg-zinc-700">
                Hủy job
              </button>
            </>
          )}
          {job.kind === 'rescan' && job.state === 'succeeded' && job.id === latestSucceededRescan?.id && (
            <RescanReview />
          )}
        </div>
      ))}
    </aside>
  )
}

function RescanReview() {
  const [diff, setDiff] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState('')

  if (gone) return null
  return (
    <div className="mt-2 space-y-2">
      {diff === null ? (
        <button onClick={() => api.rescanDiff().then(setDiff).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">Xem diff</button>
      ) : (
        <pre className="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">{diff || '(diff trống)'}</pre>
      )}
      <div className="flex gap-2">
        <button onClick={() => api.rescanMerge().then(() => setGone(true)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          className="flex-1 rounded bg-green-700 px-2 py-1 text-xs hover:bg-green-600">Merge status</button>
        <button onClick={() => api.rescanDiscard().then(() => setGone(true)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          className="flex-1 rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800">Hủy bỏ</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
