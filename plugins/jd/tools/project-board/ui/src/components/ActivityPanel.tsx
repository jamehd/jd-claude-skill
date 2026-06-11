import { useState } from 'react'
import { api } from '../api.js'
import type { Job } from '../types.js'
import { DiffView } from './DiffView.js'

const STATE_PILL: Record<string, string> = {
  queued: 'text-text-muted bg-surface border-border',
  running: 'text-running bg-running-bg border-running-border',
  succeeded: 'text-ok bg-ok-bg border-ok-border',
  failed: 'text-danger bg-danger-bg border-danger-border',
  cancelled: 'text-text-muted bg-surface border-border',
  interrupted: 'text-ready bg-ready-bg border-ready-border',
}

export function ActivityPanel({ jobs, logLines }: { jobs: Job[]; logLines: Record<string, string> }) {
  const latestSucceededRescan = jobs.find((j) => j.kind === 'rescan' && j.state === 'succeeded')
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto">
      <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Hoạt động AI</h2>
      {jobs.length === 0 && <p className="py-8 text-center text-sm text-text-muted">Chưa có job nào.</p>}
      {jobs.map((job) => (
        <div key={job.id} className={`rounded-[10px] border bg-surface p-3 text-sm ${job.state === 'running' ? 'border-running-border shadow-[0_0_18px_rgba(67,217,232,.18)]' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-text-secondary">{job.id} · {job.kind === 'rescan' ? 'Re-scan' : job.taskId}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${STATE_PILL[job.state]}`}>{job.state}</span>
          </div>
          {job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
          {job.state === 'running' && (
            <>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-sunken p-2 font-mono text-[11.5px] leading-[1.55] text-text-secondary">
                {logLines[job.id] ?? 'Đang chờ output…'}
              </pre>
              <button onClick={() => void api.cancelJob(job.id)}
                className="mt-2 rounded-lg border border-border px-2 py-1 text-xs text-danger transition-colors duration-150 hover:border-border-strong hover:bg-raised">
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
          className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-raised">Xem diff</button>
      ) : (
        <DiffView diff={diff} />
      )}
      <div className="flex gap-2">
        <button onClick={() => api.rescanMerge().then(() => setGone(true)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          className="flex-1 rounded-lg border border-ok-border bg-ok-bg px-2 py-1 text-xs text-ok transition-colors duration-150 hover:brightness-110">Merge status</button>
        <button onClick={() => api.rescanDiscard().then(() => setGone(true)).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))}
          className="flex-1 rounded-lg border border-border px-2 py-1 text-xs text-danger transition-colors duration-150 hover:border-border-strong hover:bg-raised">Hủy bỏ</button>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  )
}
