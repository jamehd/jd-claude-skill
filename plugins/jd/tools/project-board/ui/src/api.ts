import type { AutoState, BoardItem, BoardSnapshot, Candidate, ConsoleEvent, Job, UsageReport } from './types.js'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: 'include',
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
    ...init,
  })
  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? `HTTP ${res.status}`)
  const text = await res.text()
  try { return JSON.parse(text) as T } catch { return text as T }
}

export class UnauthorizedError extends Error {}

export const api = {
  login: (password: string) => request<{ ok: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  board: () => request<BoardSnapshot>('/api/board'),
  createTask: (input: { type: string; title: string; component: string; priority?: string; body?: string }) =>
    request<BoardItem>('/api/tasks', { method: 'POST', body: JSON.stringify(input) }),
  patchTask: (id: string, patch: Record<string, unknown>) =>
    request<BoardItem>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  getBrainstormPrompt: (id: string) => request<{ prompt: string }>(`/api/tasks/${id}/brainstorm-prompt`),
  dispatch: (id: string) => request<Job>(`/api/tasks/${id}/dispatch`, { method: 'POST' }),
  rescan: () => request<Job>('/api/rescan', { method: 'POST' }),
  cancelJob: (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  jobEvents: (id: string) => request<ConsoleEvent[]>(`/api/jobs/${id}/events`),
  jobMessage: (id: string, text: string, mode: 'queue' | 'steer') =>
    request<{ ok: boolean }>(`/api/jobs/${id}/message`, { method: 'POST', body: JSON.stringify({ text, mode }) }),
  diff: (id: string) => request<string>(`/api/tasks/${id}/diff`),
  merge: (id: string) => request<BoardItem>(`/api/tasks/${id}/merge`, { method: 'POST' }),
  resolve: (id: string) => request<Job>(`/api/tasks/${id}/resolve`, { method: 'POST' }),
  pr: (id: string) => request<BoardItem>(`/api/tasks/${id}/pr`, { method: 'POST' }),
  finalizePr: (id: string) => request<BoardItem>(`/api/tasks/${id}/finalize-pr`, { method: 'POST' }),
  discard: (id: string) => request<BoardItem>(`/api/tasks/${id}/discard`, { method: 'POST' }),
  deleteTask: (id: string) => request<{ ok: boolean }>(`/api/tasks/${id}`, { method: 'DELETE' }),
  clearFinishedJobs: () => request<{ cleared: number }>('/api/jobs/clear-finished', { method: 'POST' }),
  scanCandidates: () => request<{ candidates: Candidate[] }>('/api/scan-candidates'),
  bulkCreate: (items: { type: string; title: string; component: string; priority: string; body: string; requiresShaping?: boolean }[]) =>
    request<{ created: string[]; rejected: { index: number; error: string }[] }>('/api/tasks/bulk', { method: 'POST', body: JSON.stringify({ items }) }),
  getAuto: () => request<AutoState>('/api/auto'),
  setAuto: (patch: { enabled?: boolean; maxAuto?: number; maxConcurrent?: number; failureThreshold?: number }) =>
    request<AutoState>('/api/auto', { method: 'POST', body: JSON.stringify(patch) }),
  getUsage: () => request<UsageReport>('/api/usage'),
}
