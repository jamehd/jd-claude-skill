import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server.js'
import { makeDeps } from './test-helpers.js'

let app: FastifyInstance
let cookie: { board_session: string }

beforeEach(async () => {
  app = await buildServer(makeDeps())
  const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'secret' } })
  cookie = { board_session: login.cookies.find((c) => c.name === 'board_session')!.value }
})

describe('task routes', () => {
  it('creates a task', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'New work', component: 'infra' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().id).toBe('TASK-001')
  })

  it('rejects bad create payloads', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: '' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('patches a task but refuses manual ai_running', async () => {
    await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'New work', component: 'infra' },
    })
    const ok = await app.inject({
      method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie,
      payload: { status: 'ready' },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().status).toBe('ready')
    const bad = await app.inject({
      method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie,
      payload: { status: 'ai_running' },
    })
    expect(bad.statusCode).toBe(400)
  })

  it('404s on unknown id', async () => {
    const res = await app.inject({
      method: 'PATCH', url: '/api/tasks/TASK-999', cookies: cookie, payload: { status: 'ready' },
    })
    expect(res.statusCode).toBe(404)
  })

  it('rejects invalid status enum in PATCH and leaves item unchanged', async () => {
    await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Enum test', component: 'infra' },
    })
    const bad = await app.inject({
      method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie,
      payload: { status: 'banana' },
    })
    expect(bad.statusCode).toBe(400)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    const item = board.json().items.find((i: { id: string }) => i.id === 'TASK-001')
    expect(item.status).toBe('backlog')
  })

  it('strips non-whitelisted keys: id and created are never overwritten', async () => {
    await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Whitelist test', component: 'infra' },
    })
    const res = await app.inject({
      method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie,
      payload: { id: 'HACKED', created: '1999-01-01', title: 'ok' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().id).toBe('TASK-001')
    expect(res.json().created).not.toBe('1999-01-01')
    expect(res.json().title).toBe('ok')
  })

  it('rejects invalid priority in POST', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Priority test', component: 'infra', priority: 'P9' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('job routes', () => {
  it('dispatches a ready task', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'ready' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    expect(res.statusCode).toBe(202)
    expect(res.json().state).toBe('running')
  })

  it('refuses to dispatch a non-ready task', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('starts a rescan job and refuses a second concurrent one', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rescan', cookies: cookie })
    expect(res.statusCode).toBe(202)
    expect(res.json().kind).toBe('rescan')
    const dup = await app.inject({ method: 'POST', url: '/api/rescan', cookies: cookie })
    expect(dup.statusCode).toBe(409)
  })

  it('cancels a running job', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'ready' } })
    const dispatched = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    const jobId = dispatched.json().id
    const res = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/cancel`, cookies: cookie })
    expect(res.statusCode).toBe(200)
  })

  it('404s cancel and log for unknown job', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/jobs/job-999/cancel', cookies: cookie })
    expect(c.statusCode).toBe(404)
    const l = await app.inject({ method: 'GET', url: '/api/jobs/job-999/log', cookies: cookie })
    expect(l.statusCode).toBe(404)
  })

  it('rejects path-traversal in log (..%2F)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs/..%2F..%2Fetc%2Fpasswd/log', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })

  it('rejects path-traversal in cancel (..%2F)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs/..%2Fx/cancel', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })
})

async function makeReviewTask(): Promise<string> {
  await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
    payload: { type: 'task', title: 'Reviewable', component: 'infra' } })
  await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'review' } })
  return 'TASK-001'
}

describe('review routes', () => {
  it('serves the branch diff for a review task', async () => {
    const id = await makeReviewTask()
    const res = await app.inject({ method: 'GET', url: `/api/tasks/${id}/diff`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('diff --git')
  })

  it('merges and marks done', async () => {
    const id = await makeReviewTask()
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/merge`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('done')
  })

  it('discards back to ready', async () => {
    const id = await makeReviewTask()
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/discard`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ready')
  })

  it('refuses review actions on non-review tasks', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Fresh', component: 'infra' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/merge', cookies: cookie })
    expect(res.statusCode).toBe(409)
  })
})

describe('rescan review routes', () => {
  it('404s when no rescan job has succeeded', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rescan/diff', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })

  it('refuses to discard while a rescan job is active', async () => {
    const started = await app.inject({ method: 'POST', url: '/api/rescan', cookies: cookie })
    expect(started.json().state).toBe('running')
    const res = await app.inject({ method: 'POST', url: '/api/rescan/discard', cookies: cookie })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/active|cancel/i)
  })
})
