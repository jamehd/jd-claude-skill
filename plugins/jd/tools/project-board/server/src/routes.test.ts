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
      payload: { type: 'task', title: 'New work', component: 'infra', body: 'detailed description' },
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
      payload: { type: 'task', title: 'New work', component: 'infra', body: 'detailed description' },
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
      payload: { type: 'task', title: 'Enum test', component: 'infra', body: 'detailed description' },
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
      payload: { type: 'task', title: 'Whitelist test', component: 'infra', body: 'detailed description' },
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
      payload: { type: 'task', title: 'Priority test', component: 'infra', priority: 'P9', body: 'detailed description' },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('job routes', () => {
  it('dispatches a ready task', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detailed description' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'ready' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    expect(res.statusCode).toBe(202)
    expect(res.json().state).toBe('running')
  })

  it('refuses to dispatch a task in review or done', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detailed description' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'review' } })
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
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detailed description' } })
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
    payload: { type: 'task', title: 'Reviewable', component: 'infra', body: 'detailed description' } })
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
      payload: { type: 'task', title: 'Fresh', component: 'infra', body: 'detailed description' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/merge', cookies: cookie })
    expect(res.statusCode).toBe(409)
  })
})

describe('console routes', () => {
  async function dispatched(): Promise<{ jobId: string }> {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detailed description' } })
    await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status: 'ready' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/dispatch', cookies: cookie })
    return { jobId: res.json().id }
  }

  it('replays normalized events from the log', async () => {
    const { jobId } = await dispatched()
    await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'hello agent', mode: 'queue' } })
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/events`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    const events = res.json() as { kind: string; text?: string }[]
    expect(events.some((e) => e.kind === 'note' && e.text === 'hello agent')).toBe(true)
  })

  it('validates message payloads', async () => {
    const { jobId } = await dispatched()
    const empty = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: '   ', mode: 'queue' } })
    expect(empty.statusCode).toBe(400)
    const badMode = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'x', mode: 'shout' } })
    expect(badMode.statusCode).toBe(400)
    const missing = await app.inject({ method: 'POST', url: '/api/jobs/job-999/message', cookies: cookie,
      payload: { text: 'x', mode: 'queue' } })
    expect(missing.statusCode).toBe(404)
  })

  it('maps runner conflicts to 409', async () => {
    const { jobId } = await dispatched()
    const cancel = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/cancel`, cookies: cookie })
    expect(cancel.statusCode).toBe(200)
    const res = await app.inject({ method: 'POST', url: `/api/jobs/${jobId}/message`, cookies: cookie,
      payload: { text: 'x', mode: 'queue' } })
    expect(res.statusCode).toBe(409)
  })

  it('returns [] for a known job with no log yet', async () => {
    const { jobId } = await dispatched()
    const res = await app.inject({ method: 'GET', url: `/api/jobs/${jobId}/events`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toEqual([])
  })

  it('guards job-id params and 404s unknown event logs', async () => {
    const trav = await app.inject({ method: 'GET', url: '/api/jobs/..%2Fx/events', cookies: cookie })
    expect(trav.statusCode).toBe(404)
    const none = await app.inject({ method: 'GET', url: '/api/jobs/job-999/events', cookies: cookie })
    expect(none.statusCode).toBe(404)
  })

  it('serves the SPA for /console/<id> deep links', async () => {
    const res = await app.inject({ method: 'GET', url: '/console/job-001', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.body).toContain('<div id="root">')
  })
})

describe('bulk + candidates', () => {
  it('returns an empty candidate list when no status files exist', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/scan-candidates', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().candidates).toEqual([])
  })

  it('bulk-creates valid items and reports rejects', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: {
      items: [
        { type: 'task', title: 'Implement CAFE-R10', component: 'cafe-service', priority: 'P1', body: 'do it\nReq: CAFE-R10' },
        { type: 'task', title: 'Add tests for CAFE-R9', component: 'cafe-service', priority: 'P2', body: 'tests\nReq: CAFE-R9' },
        { type: 'task', title: '', component: 'x', body: '' }, // invalid
      ],
    }})
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.created).toHaveLength(2)
    expect(j.rejected).toHaveLength(1)
    expect(j.rejected[0].index).toBe(2)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items).toHaveLength(2)
  })

  it('400s an empty bulk payload', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: { items: [] } })
    expect(res.statusCode).toBe(400)
  })
})

describe('cache headers', () => {
  it('serves html with no-cache and hashed assets as immutable', async () => {
    const root = await app.inject({ method: 'GET', url: '/' })
    expect(root.statusCode).toBe(200)
    expect(root.headers['cache-control']).toBe('no-cache')
    const spa = await app.inject({ method: 'GET', url: '/console/job-001' })
    expect(spa.headers['cache-control']).toBe('no-cache')
    const asset = await app.inject({ method: 'GET', url: '/assets/app-test.js' })
    expect(asset.statusCode).toBe(200)
    expect(asset.headers['cache-control']).toContain('immutable')
  })
})

describe('crud + lifecycle', () => {
  async function makeTask(status?: string): Promise<string> {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detail' } })
    if (status) await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: { status } })
    return 'TASK-001'
  }

  it('rejects create without a description', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'No desc', component: 'infra' } })
    expect(res.statusCode).toBe(400)
  })

  it('deletes a task', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items).toHaveLength(0)
  })

  it('404s deleting an unknown task and 409s while a job runs', async () => {
    const unknown = await app.inject({ method: 'DELETE', url: '/api/tasks/TASK-999', cookies: cookie })
    expect(unknown.statusCode).toBe(404)
    const id = await makeTask('ready')
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })  // -> ai_running
    const busy = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}`, cookies: cookie })
    expect(busy.statusCode).toBe(409)
  })

  it('dispatches from backlog (not just ready)', async () => {
    const id = await makeTask()  // status backlog
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })
    expect(res.statusCode).toBe(202)
  })

  it('refuses dispatch from review/done', async () => {
    const id = await makeTask('review')
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/dispatch`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('clears finished jobs', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/jobs/clear-finished', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('cleared')
  })
})
