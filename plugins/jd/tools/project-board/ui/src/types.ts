export type ItemType = 'task' | 'bug'
export type ItemStatus = 'backlog' | 'ready' | 'ai_running' | 'review' | 'pr' | 'done'
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
  pr?: string
  requiresShaping?: boolean
  plan?: string
  extra?: Record<string, unknown>
  body: string
}

export interface ComponentStatus {
  component: string
  built: number
  tested: number
  last_scanned: string
  body: string
}

export type JobKind = 'task' | 'rescan' | 'resolve'
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
  sessionId?: string
  segments?: number
  usage?: JobUsage
  costUsd?: number
}

export interface AutoState {
  enabled: boolean
  paused: boolean
  pauseReason?: string
  maxAuto: number
  dispatched: number
  consecutiveFailures: number
  maxConcurrent: number
  failureThreshold: number
}

export interface JobUsage {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
}

export interface RateLimitSnapshot {
  status: string
  rateLimitType: string
  resetsAt: number
  isUsingOverage: boolean
  capturedAt: string
}

export interface UsageBucket {
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costUsd: number
  jobs: number
}

export interface UsageReport {
  rateLimit: RateLimitSnapshot | null
  windows: { fiveHour: UsageBucket; today: UsageBucket; total: UsageBucket }
}

export type NoteType = 'user_message' | 'steer' | 'queued' | 'error' | 'info'

export type ConsoleEvent =
  | { kind: 'init'; sessionId: string; model: string }
  | { kind: 'text_delta'; text: string }
  | { kind: 'tool_start'; toolId: string; tool: string; inputPreview: string }
  | { kind: 'tool_result'; toolId: string; output: string; isError: boolean }
  | { kind: 'turn_result'; ok: boolean; durationMs?: number; costUsd?: number; usage?: JobUsage }
  | { kind: 'rate_limit'; status: string; rateLimitType: string; resetsAt: number; isUsingOverage: boolean }
  | { kind: 'note'; noteType: NoteType; text: string }
  | { kind: 'raw'; text: string }

export interface BoardSnapshot {
  items: BoardItem[]
  invalid: { file: string; error: string }[]
  components: ComponentStatus[]
  jobs: Job[]
}

export type WsMessage =
  | { type: 'board_update' }
  | { type: 'job_event'; jobId: string; event: ConsoleEvent }

export interface Candidate {
  kind: 'implement' | 'test'
  type: ItemType
  component: string
  reqId: string
  title: string
  priority: Priority
  body: string
}
