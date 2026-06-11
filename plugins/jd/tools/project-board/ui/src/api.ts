import type { BoardItem, BoardSnapshot, ConsoleEvent, Job } from './types.js'

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
  patchTask: (id: string, patch: Record<string, string>) =>
    request<BoardItem>(`/api/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  dispatch: (id: string) => request<Job>(`/api/tasks/${id}/dispatch`, { method: 'POST' }),
  rescan: () => request<Job>('/api/rescan', { method: 'POST' }),
  rescanDiff: () => request<string>('/api/rescan/diff'),
  rescanMerge: () => request<{ ok: boolean }>('/api/rescan/merge', { method: 'POST' }),
  rescanDiscard: () => request<{ ok: boolean }>('/api/rescan/discard', { method: 'POST' }),
  cancelJob: (id: string) => request<{ ok: boolean }>(`/api/jobs/${id}/cancel`, { method: 'POST' }),
  jobLog: (id: string) => request<string>(`/api/jobs/${id}/log`),
  jobEvents: (id: string) => request<ConsoleEvent[]>(`/api/jobs/${id}/events`),
  jobMessage: (id: string, text: string, mode: 'queue' | 'steer') =>
    request<{ ok: boolean }>(`/api/jobs/${id}/message`, { method: 'POST', body: JSON.stringify({ text, mode }) }),
  diff: (id: string) => request<string>(`/api/tasks/${id}/diff`),
  merge: (id: string) => request<BoardItem>(`/api/tasks/${id}/merge`, { method: 'POST' }),
  pr: (id: string) => request<BoardItem>(`/api/tasks/${id}/pr`, { method: 'POST' }),
  discard: (id: string) => request<BoardItem>(`/api/tasks/${id}/discard`, { method: 'POST' }),
}
