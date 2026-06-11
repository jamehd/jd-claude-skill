import { api } from '../api.js'
import type { Job } from '../types.js'

const STATE_PILL: Record<string, string> = {
  queued: 'text-text-muted bg-surface border-border',
  running: 'text-running bg-running-bg border-running-border',
  succeeded: 'text-ok bg-ok-bg border-ok-border',
  failed: 'text-danger bg-danger-bg border-danger-border',
  cancelled: 'text-text-muted bg-surface border-border',
  interrupted: 'text-ready bg-ready-bg border-ready-border',
}

export function ActivityPanel({ jobs, previews, onOpenConsole }: {
  jobs: Job[]
  previews: Record<string, string>
  onOpenConsole: (jobId: string) => void
}) {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">Hoạt động AI</h2>
        <button onClick={() => void api.clearFinishedJobs()}
          className="rounded bg-raised px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:brightness-110">Dọn xong</button>
      </div>
      {jobs.length === 0 && <p className="py-8 text-center text-sm text-text-muted">Chưa có job nào.</p>}
      {jobs.map((job) => (
        <div key={job.id} className={`rounded-[10px] border bg-surface p-3 text-sm ${job.state === 'running' ? 'border-running-border shadow-[0_0_18px_rgba(67,217,232,.18)]' : 'border-border'}`}>
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-text-secondary">{job.id} · {job.kind === 'rescan' ? 'Re-scan' : job.taskId}</span>
            <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] ${STATE_PILL[job.state]}`}>{job.state}</span>
          </div>
          {job.error && <p className="mt-1 text-xs text-danger">{job.error}</p>}
          {job.state === 'running' && (
            <p className="mt-2 line-clamp-2 font-mono text-[11px] text-text-muted">{previews[job.id] ?? 'Đang chờ output…'}</p>
          )}
          <div className="mt-2 flex gap-2">
            <button onClick={() => onOpenConsole(job.id)}
              className="rounded-lg border border-border px-2 py-1 text-xs text-text-secondary transition-colors duration-150 hover:border-border-strong hover:bg-raised">
              Mở console
            </button>
            {job.state === 'running' && (
              <button onClick={() => void api.cancelJob(job.id)}
                className="rounded-lg border border-border px-2 py-1 text-xs text-danger transition-colors duration-150 hover:border-border-strong hover:bg-raised">
                Hủy job
              </button>
            )}
          </div>
        </div>
      ))}
    </aside>
  )
}
