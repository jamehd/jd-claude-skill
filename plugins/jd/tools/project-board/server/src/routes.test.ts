import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server.js'
import { makeDeps } from './test-helpers.js'
import type { ServerDeps } from './server.js'

let app: FastifyInstance
let deps: ServerDeps
let cookie: { board_session: string }

beforeEach(async () => {
  deps = makeDeps()
  app = await buildServer(deps)
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

describe('pr lifecycle routes', () => {
  it('Tạo PR moves the task to pr status with the pr url, not done', async () => {
    const id = await makeReviewTask()
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('pr')
    expect(res.json().pr).toBe('https://github.com/example/pr/1')
  })

  it('finalize-pr on a merged PR cleans up and marks done', async () => {
    const id = await makeReviewTask()
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('done')
    expect((deps.git.removeWorktree as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith(id)
  })

  it('finalize-pr 409s when the PR is not merged', async () => {
    const id = await makeReviewTask()
    await app.inject({ method: 'POST', url: `/api/tasks/${id}/pr`, cookies: cookie })
    ;(deps.git.isPrMerged as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('finalize-pr 409s on a non-pr task', async () => {
    const id = await makeReviewTask() // status review, no PR created
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/finalize-pr`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('DELETE also removes the worktree', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Doomed', component: 'infra', body: 'x' } })
    const res = await app.inject({ method: 'DELETE', url: '/api/tasks/TASK-001', cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect((deps.git.removeWorktree as ReturnType<typeof vi.fn>)).toHaveBeenCalledWith('TASK-001')
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

  it('rejects a bulk item with an invalid priority (P9)', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: {
      items: [
        { type: 'task', title: 'Valid item', component: 'infra', priority: 'P1', body: 'ok' },
        { type: 'task', title: 'Bad priority', component: 'infra', priority: 'P9', body: 'nope' },
      ],
    }})
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect(j.created).toHaveLength(1)
    expect(j.rejected).toHaveLength(1)
    expect(j.rejected[0].index).toBe(1)
    expect(j.rejected[0].error).toMatch(/invalid priority/)
  })
})

describe('shaping gate', () => {
  // Creates TASK-001 and optionally applies an extra PATCH (e.g. {requiresShaping:true}).
  async function makeTask(extra?: Record<string, unknown>): Promise<string> {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Work', component: 'infra', body: 'detail' } })
    if (extra) await app.inject({ method: 'PATCH', url: '/api/tasks/TASK-001', cookies: cookie, payload: extra })
    return 'TASK-001'
  }

  it('blocks →ready when requiresShaping and no plan', async () => {
    const id = await makeTask({ requiresShaping: true })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(409)
    expect(res.json().error).toMatch(/brainstorm|plan/i)
  })

  it('allows →ready once a plan is attached', async () => {
    const id = await makeTask({ requiresShaping: true })
    await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { plan: 'docs/plans/x.md' } })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ready')
  })

  it('allows →ready freely when not requiresShaping', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { status: 'ready' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ready')
  })

  it('allows requiresShaping task to go ready when plan+status set in the SAME patch', async () => {
    const id = await makeTask({ requiresShaping: true })
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { plan: 'p', status: 'ready' } })
    expect(res.statusCode).toBe(200)
    expect(res.json().status).toBe('ready')
  })

  it('rejects a non-boolean requiresShaping', async () => {
    const id = await makeTask()
    const res = await app.inject({ method: 'PATCH', url: `/api/tasks/${id}`, cookies: cookie, payload: { requiresShaping: 'yes' } })
    expect(res.statusCode).toBe(400)
  })

  it('bulk-create defaults requiresShaping from the per-item flag', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/tasks/bulk', cookies: cookie, payload: {
      items: [
        { type: 'task', title: 'Needs shaping', component: 'infra', body: 'shape me', requiresShaping: true },
        { type: 'task', title: 'Plain', component: 'infra', body: 'no shaping' },
      ],
    }})
    expect(res.statusCode).toBe(200)
    expect(res.json().created).toHaveLength(2)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    const items = board.json().items as { id: string; requiresShaping?: boolean }[]
    const first = items.find((i) => i.id === 'TASK-001')!
    const second = items.find((i) => i.id === 'TASK-002')!
    expect(first.requiresShaping).toBe(true)
    expect(second.requiresShaping).toBeUndefined()
  })
})

describe('brainstorm-prompt route', () => {
  it('GET /api/tasks/:id/brainstorm-prompt returns a prompt', async () => {
    const c = await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Shape me', component: 'infra', body: 'details' } })
    const id = c.json().id
    const res = await app.inject({ method: 'GET', url: `/api/tasks/${id}/brainstorm-prompt`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    expect(res.json().prompt).toContain('Shape me')
  })

  it('returns 404 for an unknown task id', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/tasks/TASK-999/brainstorm-prompt', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })
})

describe('auto routes', () => {
  it('GET /api/auto returns the disabled default shape', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body).toMatchObject({ enabled: false, paused: false, dispatched: 0 })
    expect(typeof body.maxAuto).toBe('number')
    expect(typeof body.maxConcurrent).toBe('number')
  })

  it('POST /api/auto enables and sets maxAuto; subsequent GET reflects change', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { enabled: true, maxAuto: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ enabled: true, maxAuto: 5 })
    const get = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    expect(get.json().enabled).toBe(true)
  })

  it('POST /api/auto can disable after enabling', async () => {
    await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { enabled: true } })
    const res = await app.inject({ method: 'POST', url: '/api/auto', cookies: cookie, payload: { enabled: false } })
    expect(res.statusCode).toBe(200)
    expect(res.json().enabled).toBe(false)
  })

  it('POST /api/auto rejects a non-positive maxAuto', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { maxAuto: 0 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('settings via /api/auto', () => {
  it('GET /api/auto includes failureThreshold and maxConcurrent', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auto', cookies: cookie })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(typeof body.failureThreshold).toBe('number')
    expect(typeof body.maxConcurrent).toBe('number')
  })

  it('POST sets maxConcurrent and failureThreshold', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { maxConcurrent: 3, failureThreshold: 5 },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toMatchObject({ maxConcurrent: 3, failureThreshold: 5 })
  })

  it('rejects maxConcurrent below 1 or above 8', async () => {
    const low = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { maxConcurrent: 0 },
    })
    expect(low.statusCode).toBe(400)
    const high = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { maxConcurrent: 9 },
    })
    expect(high.statusCode).toBe(400)
  })

  it('rejects failureThreshold below 1', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/auto', cookies: cookie,
      payload: { failureThreshold: 0 },
    })
    expect(res.statusCode).toBe(400)
  })
})

describe('usage route', () => {
  it('GET /api/usage returns rateLimit + three buckets', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/usage', cookies: cookie })
    expect(res.statusCode).toBe(200)
    const j = res.json()
    expect('rateLimit' in j).toBe(true)
    expect(j.windows).toHaveProperty('fiveHour')
    expect(j.windows).toHaveProperty('today')
    expect(j.windows.total).toHaveProperty('inputTokens')
    expect(j.windows.total).toHaveProperty('jobs')
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

  it('deletes a zombie ai_running task that has no live job', async () => {
    const id = await makeTask()
    // Force the orphaned state directly, bypassing the PATCH guard; no job dispatched.
    deps.store.updateItem(id, { status: 'ai_running' })
    expect(deps.runner.listJobs().some((j) => j.taskId === id)).toBe(false)
    const res = await app.inject({ method: 'DELETE', url: `/api/tasks/${id}`, cookies: cookie })
    expect(res.statusCode).toBe(200)
    const board = await app.inject({ method: 'GET', url: '/api/board', cookies: cookie })
    expect(board.json().items.find((i: { id: string }) => i.id === id)).toBeUndefined()
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

describe('resolve route', () => {
  it('202 for a review task with an existing worktree', async () => {
    const id = await makeReviewTask()
    ;(deps.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(true)
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/resolve`, cookies: cookie })
    expect(res.statusCode).toBe(202)
  })

  it('409 for a non-review (backlog) task', async () => {
    await app.inject({ method: 'POST', url: '/api/tasks', cookies: cookie,
      payload: { type: 'task', title: 'Fresh', component: 'infra', body: 'detail' } })
    const res = await app.inject({ method: 'POST', url: '/api/tasks/TASK-001/resolve', cookies: cookie })
    expect(res.statusCode).toBe(409)
  })

  it('409 when hasWorktree returns false for a review task', async () => {
    const id = await makeReviewTask()
    ;(deps.git.hasWorktree as ReturnType<typeof vi.fn>).mockReturnValue(false)
    const res = await app.inject({ method: 'POST', url: `/api/tasks/${id}/resolve`, cookies: cookie })
    expect(res.statusCode).toBe(409)
  })
})
