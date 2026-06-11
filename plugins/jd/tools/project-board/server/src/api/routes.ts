import type { FastifyInstance } from 'fastify'
import path from 'node:path'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import type { ServerDeps } from '../server.js'
import type { ItemStatus, ItemType, Priority } from '../../../ui/src/types.js'
import { STATUSES, PRIORITIES } from '../markdown.js'
import { SAFE_ID } from '../jobs/git.js'
import { normalizeLine } from '../jobs/events.js'
import { parseRequirementsDir } from '../jobs/requirements.js'
import { parseStatusDoc, buildCandidates, dedupeCandidates } from '../jobs/candidates.js'

interface CreateBody { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string }
interface PatchBody { title?: string; status?: ItemStatus; priority?: Priority; component?: string; body?: string }

// Patchable user-supplied fields; id/created/type are immutable after creation.
const PATCH_WHITELIST = ['title', 'status', 'priority', 'component', 'body'] as const

// Statuses settable by users; ai_running is system-only.
const USER_STATUSES = STATUSES.filter((s) => s !== 'ai_running')

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
    if (!store.getItem(req.params.id)) return reply.code(404).send({ error: 'not found' })

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

    const item = store.updateItem(req.params.id, patch as Parameters<typeof store.updateItem>[1])
    hub.broadcast({ type: 'board_update' })
    return item
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/dispatch', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (!['backlog', 'ready', 'failed'].includes(item.status)) {
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
    if (item.status === 'ai_running') {
      return reply.code(409).send({ error: 'a job is running on this task; cancel it first' })
    }
    store.deleteItem(item.id)
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
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
    store.appendToBody(item.id, `PR: ${url}`)
    const updated = store.updateItem(item.id, { status: 'done' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })

  app.post<{ Params: { id: string } }>('/api/tasks/:id/discard', (req, reply) => {
    const item = requireReview(req.params.id, reply)
    if (!item) return reply
    deps.git.removeWorktree(item.id)
    store.appendToBody(item.id, `Branch board/${item.id} discarded on ${new Date().toISOString().slice(0, 10)}.`)
    const updated = store.updateItem(item.id, { status: 'ready' })
    hub.broadcast({ type: 'board_update' })
    return updated
  })

  app.get('/api/scan-candidates', () => {
    const docs = []
    for (const f of readdirSync(store.statusDir).filter((f) => f.endsWith('.md'))) {
      try { docs.push(parseStatusDoc(readFileSync(path.join(store.statusDir, f), 'utf8'))) } catch { /* skip unparseable */ }
    }
    const reqIndex = parseRequirementsDir(deps.config.repoRoot)
    return { candidates: dedupeCandidates(buildCandidates(reqIndex, docs), store.scan().items) }
  })

  app.post<{ Body: { items?: { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string }[] } }>(
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
        created.push(store.createItem({ type: it.type, title: it.title.trim(), component: it.component.trim(), priority: it.priority, body: it.body }).id)
      })
      if (created.length > 0) hub.broadcast({ type: 'board_update' })
      return { created, rejected }
    })
}
