import { describe, it, expect, beforeEach } from 'vitest'
import { buildServer, type ServerDeps } from './server.js'
import { makeDeps } from './test-helpers.js'

export { makeDeps }

function makeOpenDeps(): ServerDeps {
  const deps = makeDeps()
  const { password: _pw, ...rest } = deps.config
  deps.config = rest as ServerDeps['config']
  return deps
}

describe('open mode (no password)', () => {
  let deps: ServerDeps
  beforeEach(() => { deps = makeOpenDeps() })

  it('GET /api/board without any cookie returns 200', async () => {
    const app = await buildServer(deps)
    const res = await app.inject({ method: 'GET', url: '/api/board' })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('items')
  })

  it('POST /api/tasks without a cookie returns 201', async () => {
    const app = await buildServer(deps)
    const res = await app.inject({
      method: 'POST',
      url: '/api/tasks',
      headers: { 'content-type': 'application/json' },
      payload: { type: 'task', title: 'open-mode task', priority: 'P2', component: 'test', body: 'detailed description' },
    })
    expect(res.statusCode).toBe(201)
  })
})

describe('auth', () => {
  let deps: ServerDeps
  beforeEach(() => { deps = makeDeps() })

  it('rejects API calls without a session', async () => {
    const app = await buildServer(deps)
    const res = await app.inject({ method: 'GET', url: '/api/board' })
    expect(res.statusCode).toBe(401)
  })

  it('rejects wrong password', async () => {
    const app = await buildServer(deps)
    const res = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'nope' } })
    expect(res.statusCode).toBe(401)
  })

  it('login with query string succeeds when password is correct', async () => {
    const app = await buildServer(deps)
    const res = await app.inject({ method: 'POST', url: '/api/login?cb=1', payload: { password: 'secret' } })
    expect(res.statusCode).toBe(200)
  })

  it('logs in and allows subsequent calls via cookie', async () => {
    const app = await buildServer(deps)
    const login = await app.inject({ method: 'POST', url: '/api/login', payload: { password: 'secret' } })
    expect(login.statusCode).toBe(200)
    const cookie = login.cookies.find((c) => c.name === 'board_session')
    expect(cookie).toBeDefined()
    const res = await app.inject({
      method: 'GET', url: '/api/board',
      cookies: { board_session: cookie!.value },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json()).toHaveProperty('items')
  })
})
