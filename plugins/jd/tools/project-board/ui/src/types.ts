export type ItemType = 'task' | 'bug'
export type ItemStatus = 'backlog' | 'ready' | 'ai_running' | 'review' | 'done'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface BoardItem {
  id: string
  type: ItemType
  title: string
  status: ItemStatus
  priority: Priority
  component: string
  created: string
  updated: string
  job?: string
  extra?: Record<string, unknown>
  body: string
}

export interface ComponentStatus {
  component: string
  completion: number
  last_scanned: string
  body: string
}

export type JobKind = 'task' | 'rescan'
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'

export interface Job {
  id: string
  kind: JobKind
  taskId?: string
  branch?: string
  state: JobState
  startedAt?: string
  endedAt?: string
  error?: string
}

export interface BoardSnapshot {
  items: BoardItem[]
  invalid: { file: string; error: string }[]
  components: ComponentStatus[]
  jobs: Job[]
}

export type WsMessage =
  | { type: 'board_update' }
  | { type: 'job_log'; jobId: string; line: string }
