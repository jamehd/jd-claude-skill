import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { ServerDeps } from '../server.js'
import type { ItemStatus, ItemType, Priority } from '../../../ui/src/types.js'
import { PRIORITIES } from '../markdown.js'
import { gatedReadyStatus } from '../store.js'
import { SAFE_ID } from '../jobs/git.js'
import { normalizeLine } from '../jobs/events.js'
import { parseRequirementsDir } from '../jobs/requirements.js'
import { buildBrainstormPrompt } from '../jobs/prompt.js'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from '../jobs/candidates.js'

interface CreateBody { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string }
interface PatchBody { title?: string; status?: ItemStatus; priority?: Priority; component?: string; body?: string; requiresShaping?: boolean; plan?: string }
type BatchAction = 'delete' | 'dispatch' | 'status' | 'priority' | 'component'
interface BatchBody { ids?: unknown; action?: unknown; value?: unknown }

// Patchable user-supplied fields; id/created/type are immutable after creation.
const PATCH_WHITELIST = ['title', 'status', 'priority', 'component', 'body', 'requiresShaping', 'plan'] as const

// Statuses settable by users; ai_running and pr are system-managed.
const USER_STATUSES: ItemStatus[] = ['backlog', 'ready', 'review', 'done']

export function registerRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { store, hub } = deps

  app.get('/api/board', () => ({
    ...store.scan(),
    components: store.componentStatuses(),
    jobs: deps.runner?.listJobs() ?? [],
  }))

  app.post<{ Body: CreateBody }>('/api/tasks', (req, reply) => {
    const { type, title, component, priority, body } = req.body ?? {}
    if (!type || !['task', 'bug'].includes(type) || !title?.trim() || !component?.trim() || !body?.trim()) {
      return reply.code(400).send({ error: 'type, title, component and description are required' })
    }
    if (priority !== undefined && !PRIORITIES.includes(priority)) {
      return reply.code(400).send({ error: `invalid priority: ${priority}` })
    }
    const item = store.createItem({ type, title: title.trim(), component: component.trim(), priority, body })
    hub.broadcast({ type: 'board_update' })
    return reply.code(201).send(item)
  })

  app.patch<{ Params: { id: string }; Body: PatchBody }>('/api/tasks/:id', (req, reply) => {
    if (req.body?.status === 'ai_running') {
      return reply.code(400).send({ error: 'ai_running is system-managed; use dispatch' })
    }
    const current = store.getItem(req.params.id)
    if (!current) return reply.code(404).send({ error: 'not found' })

    const raw = req.body ?? {}
    const patch: Partial<Record<(typeof PATCH_WHITELIST)[number], unknown>> = {}
    for (const key of PATCH_WHITELIST) {
      if (key in raw) patch[key] = (raw as Record<string, unknown>)[key]
    }

    if (Object.keys(patch).length === 0) {
      return reply.code(400).send({ error: 'no updatable fields' })
    }

    if (patch.status !== undefined && !USER_STATUSES.includes(patch.status as (typeof USER_STATUSES)[number])) {
      return reply.code(400).send({ error: `invalid status: ${patch.status}` })
    }
    if (patch.priority !== undefined && !PRIORITIES.includes(patch.priority as Priority)) {
      return reply.code(400).send({ error: `invalid priority: ${patch.priority}` })
    }
    if (patch.requiresShaping !== undefined && typeof patch.requiresShaping !== 'boolean') {
      return reply.code(400).send({ error: 'requiresShaping must be a boolean' })
    }
    if (patch.plan !== undefined && typeof patch.plan !== 'string') {
      return reply.code(400).send({ error: 'plan must be a string' })
    }
    // Gate: a task flagged for shaping cannot reach 'ready' without an attached plan.
    // Evaluate effective values so a single patch may set requiresShaping/plan alongside status.
    if (patch.status === 'ready') {
      const requiresShaping = 'requiresShaping' in patch ? Boolean(patch.requiresShaping) : Boolean(current.requiresShaping)
      const planRaw = 'plan' in patch ? patch.plan : current.plan
      const plan = typeof planRaw === 'string' ? planRaw.trim() : ''
      if (requiresShaping && !plan) {
        return reply.code(409).send({ error: 'Task cần brainstorm + đính plan trước khi sang Ready' })
      }
    }

    const item = store.updateItem(req.params.id, patch as Parameters<typeof store.updateItem>[1])
    hub.broadcast({ type: 'board_update' })
    return item
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/dispatch', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (!['backlog', 'ready'].includes(item.status)) {
      return reply.code(409).send({ error: `cannot dispatch a task in '${item.status}'` })
    }
    try {
      return reply.code(202).send(deps.runner.dispatchTask(item.id))
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post('/api/rescan', (_req, reply) => {
    try {
      return reply.code(202).send(deps.runner.dispatchRescan())
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
  })

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    if (!deps.runner.getJob(req.params.id)) return reply.code(404).send({ error: 'not found' })
    deps.runner.cancel(req.params.id)
    return { ok: true }
  })

  app.get<{ Params: { id: string } }>('/api/jobs/:id/log', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const file = path.join(store.jobsDir, `${req.params.id}.log`)
    if (!existsSync(file)) return reply.code(404).send({ error: 'no log' })
    return reply.type('text/plain').send(readFileSync(file, 'utf8'))
  })

  app.get<{ Params: { id: string } }>('/api/jobs/:id/events', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    if (!deps.runner.getJob(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const file = path.join(store.jobsDir, `${req.params.id}.log`)
    if (!existsSync(file)) return []
    const events = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
      .flatMap((l) => normalizeLine(l))
    return events
  })

  app.post<{ Params: { id: string }; Body: { text?: string; mode?: string } }>('/api/jobs/:id/message', (req, reply) => {
    if (!SAFE_ID.test(req.params.id)) return reply.code(404).send({ error: 'not found' })
    const text = req.body?.text?.trim()
    const mode = req.body?.mode
    if (!text || (mode !== 'queue' && mode !== 'steer')) {
      return reply.code(400).send({ error: 'text and mode (queue|steer) are required' })
    }
    if (!deps.runner.getJob(req.params.id)) return reply.code(404).send({ error: 'not found' })
    try {
      deps.runner.message(req.params.id, text, mode)
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
  })

  app.delete<{ Params: { id: string } }>('/api/tasks/:id', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    const liveJob = deps.runner.listJobs().some(
      (j) => (j.state === 'running' || j.state === 'queued') && j.taskId === item.id,
    )
    if (liveJob) {
      return reply.code(409).send({ error: 'a job is running on this task; cancel it first' })
    }
    store.deleteItem(item.id)
    try { deps.git.removeWorktree(item.id) } catch { /* best-effort */ }
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
  })

  app.post<{ Body: BatchBody }>('/api/tasks/batch', (req, reply) => {
    const { ids, action, value } = req.body ?? {}
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every((x) => typeof x === 'string' && SAFE_ID.test(x))) {
      return reply.code(400).send({ error: 'ids must be a non-empty array of valid task ids' })
    }
    const ACTIONS: BatchAction[] = ['delete', 'dispatch', 'status', 'priority', 'component']
    if (typeof action !== 'string' || !ACTIONS.includes(action as BatchAction)) {
      return reply.code(400).send({ error: `invalid action: ${String(action)}` })
    }
    if (action === 'status' && !USER_STATUSES.includes(value as ItemStatus)) {
      return reply.code(400).send({ error: `invalid status: ${String(value)}` })
    }
    if (action === 'priority' && !PRIORITIES.includes(value as Priority)) {
      return reply.code(400).send({ error: `invalid priority: ${String(value)}` })
    }
    if (action === 'component' && (typeof value !== 'string' || !value.trim())) {
      return reply.code(400).send({ error: 'component value is required' })
    }

    const results = (ids as string[]).map((id) => {
      const item = store.getItem(id)
      if (!item) return { id, ok: false, error: 'not found' }
      try {
        switch (action) {
          case 'delete': {
            const liveJob = deps.runner.listJobs().some(
              (j) => (j.state === 'running' || j.state === 'queued') && j.taskId === id)
            if (liveJob) return { id, ok: false, error: 'a job is running; cancel it first' }
            store.deleteItem(id)
            try { deps.git.removeWorktree(id) } catch { /* best-effort */ }
            return { id, ok: true }
          }
          case 'dispatch': {
            if (!['backlog', 'ready'].includes(item.status)) {
              return { id, ok: false, error: `cannot dispatch a task in '${item.status}'` }
            }
            deps.runner.dispatchTask(id)
            return { id, ok: true }
          }
          case 'status': {
            if (value === 'ready' && item.requiresShaping && !item.plan?.trim()) {
              return { id, ok: false, error: 'cần brainstorm + plan trước khi sang Ready' }
            }
            store.updateItem(id, { status: value as ItemStatus })
            return { id, ok: true }
          }
          case 'priority':
            store.updateItem(id, { priority: value as Priority })
            return { id, ok: true }
          case 'component':
            store.updateItem(id, { component: (value as string).trim() })
            return { id, ok: true }
          default:
            return { id, ok: false, error: `unhandled action` }
        }
      } catch (err) {
        return { id, ok: false, error: err instanceof Error ? err.message : String(err) }
      }
    })

    const applied = results.filter((r) => r.ok).length
    if (applied > 0) hub.broadcast({ type: 'board_update' })
    return reply.send({ applied, failed: results.length - applied, results })
  })

  app.post('/api/jobs/clear-finished', (_req, reply) => {
    const cleared = deps.runner.clearFinished()
    hub.broadcast({ type: 'board_update' })
    return reply.send({ cleared })
  })

  function requireReview(id: string, reply: { code: (n: number) => { send: (b: unknown) => unknown } }) {
    const item = store.getItem(id)
    if (!item) { reply.code(404).send({ error: 'not found' }); return undefined }
    if (item.status !== 'review') { reply.code(409).send({ error: `task is ${item.status}, not review` }); return undefined }
    return item
  }

  app.get<{ Params: { id: string } }>('/api/tasks/:id/diff', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    return reply.type('text/plain').send(deps.git.branchDiff(item.id))
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/resolve', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    if (!deps.git.hasWorktree(item.id)) {
      return reply.code(409).send({ error: 'worktree đã mất — hãy chạy lại task' })
    }
    return reply.code(202).send(deps.runner.dispatchResolve(item.id))
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/merge', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    try {
      deps.git.mergeBranch(item.id, `board: ${item.id} ${item.title}`)
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
    const updated = store.updateItem(item.id, { status: 'done' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/pr', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    let url: string
    try {
      url = deps.git.createPr(item.id, `${item.id}: ${item.title}`, item.body)
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) })
    }
    const updated = store.updateItem(item.id, { pr: url, status: 'pr' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/finalize-pr', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status !== 'pr') return reply.code(409).send({ error: `task is ${item.status}, not pr` })
    let merged: boolean
    try {
      merged = deps.git.isPrMerged(item.id)
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : String(err) })
    }
    if (!merged) return reply.code(409).send({ error: 'PR chưa được merge' })
    deps.git.removeWorktree(item.id)
    // Best-effort remote cleanup: GitHub may already have auto-deleted the head
    // branch on merge, in which case the delete fails harmlessly — never block
    // marking the task done over a dangling remote branch.
    let remote = 'ok'
    try { deps.git.deleteRemoteBranch(item.id) } catch (e) { remote = e instanceof Error ? e.message.slice(0, 120) : 'failed' }
    const updated = store.updateItem(item.id, { status: 'done' })
    hub.broadcast({ type: 'board_update' })
    return reply.send({ ...updated, remote })
  })

  app.post<{ Params: { id: string }; Body: { mode?: string } }>('/api/tasks/:id/abandon-pr', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status !== 'pr') return reply.code(409).send({ error: `task is ${item.status}, not pr` })
    const mode = req.body?.mode
    if (mode !== 'reopen' && mode !== 'delete') {
      return reply.code(400).send({ error: 'mode must be reopen or delete' })
    }
    try { deps.git.removeWorktree(item.id) } catch { /* best-effort */ }
    let remote = 'ok'
    try { deps.git.deleteRemoteBranch(item.id) } catch (e) { remote = e instanceof Error ? e.message.slice(0, 120) : 'failed' }
    if (mode === 'delete') {
      store.deleteItem(item.id)
      hub.broadcast({ type: 'board_update' })
      return reply.send({ ok: true, deleted: true, remote })
    }
    const updated = store.updateItem(item.id, { status: 'backlog', pr: '' })
    hub.broadcast({ type: 'board_update' })
    return reply.send({ ...updated, remote })
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/discard', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    deps.git.removeWorktree(item.id)
    store.appendToBody(item.id, `Branch board/${item.id} discarded on ${new Date().toISOString().slice(0, 10)}.`)
    const updated = store.updateItem(item.id, { status: gatedReadyStatus(item) })
    hub.broadcast({ type: 'board_update' })
    return updated
  })

  app.get('/api/scan-candidates', () => {
    const docs = []
    for (const f of readdirSync(store.statusDir).filter((f) => f.endsWith('.md'))) {
      try { docs.push(parseStatusDoc(readFileSync(path.join(store.statusDir, f), 'utf8'))) } catch { /* skip unparseable */ }
    }
    const reqIndex = parseRequirementsDir(deps.config.repoRoot)
    const lastScanned = Object.fromEntries(store.componentStatuses().map((s) => [s.component, s.last_scanned]))
    return { candidates: dedupeCandidates(buildCandidates(reqIndex, docs), store.scan().items, lastScanned) }
  })

  app.get<{ Params: { id: string } }>('/api/tasks/:id/brainstorm-prompt', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    const reqIndex = parseRequirementsDir(deps.config.repoRoot)
    return { prompt: buildBrainstormPrompt(item, reqIndex) }
  })

  app.get('/api/auto', () => deps.runner.getAuto())

  app.get('/api/usage', () => deps.runner.getUsage())

  app.post<{ Body: { enabled?: boolean; maxAuto?: number; maxConcurrent?: number; failureThreshold?: number } }>('/api/auto', (req, reply) => {
    const { enabled, maxAuto, maxConcurrent, failureThreshold } = req.body ?? {}
    if (maxAuto !== undefined && (typeof maxAuto !== 'number' || maxAuto < 1)) {
      return reply.code(400).send({ error: 'maxAuto must be a positive number' })
    }
    if (maxConcurrent !== undefined && (typeof maxConcurrent !== 'number' || maxConcurrent < 1 || maxConcurrent > 8)) {
      return reply.code(400).send({ error: 'maxConcurrent must be between 1 and 8' })
    }
    if (failureThreshold !== undefined && (typeof failureThreshold !== 'number' || failureThreshold < 1)) {
      return reply.code(400).send({ error: 'failureThreshold must be a positive number' })
    }
    return deps.runner.setAuto({ enabled, maxAuto, maxConcurrent, failureThreshold })
  })

  app.post<{ Body: { items?: { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string; requiresShaping?: boolean }[] } }>(
    '/api/tasks/bulk', (req, reply) => {
      const items = req.body?.items
      if (!Array.isArray(items) || items.length === 0) return reply.code(400).send({ error: 'items required' })
      const created: string[] = []
      const rejected: { index: number; error: string }[] = []
      items.forEach((it, index) => {
        if (!it?.type || !['task', 'bug'].includes(it.type) || !it.title?.trim() || !it.component?.trim() || !it.body?.trim()) {
          rejected.push({ index, error: 'type, title, component and body are required' })
          return
        }
        if (it.priority !== undefined && !PRIORITIES.includes(it.priority)) {
          rejected.push({ index, error: `invalid priority: ${it.priority}` })
          return
        }
        created.push(store.createItem({ type: it.type, title: it.title.trim(), component: it.component.trim(), priority: it.priority, body: it.body, requiresShaping: it.requiresShaping === true }).id)
      })
      if (created.length > 0) hub.broadcast({ type: 'board_update' })
      return { created, rejected }
    })
}
