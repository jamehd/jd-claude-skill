import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { existsSync, readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from './config.js'
import type { BoardStore } from './store.js'
import type { WsHub } from './ws.js'
import type { JobRunner, GitOps } from './jobs/runner.js'
import { registerRoutes } from './api/routes.js'

export interface ServerDeps {
  config: Config
  store: BoardStore
  hub: WsHub
  runner: JobRunner
  git: GitOps
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })
  const sessions = new Set<string>()

  await app.register(cookie)
  await app.register(websocket)

  const uiDist = deps.config.uiDistDir ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ui/dist')
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, {
      root: uiDist,
      cacheControl: false,
      setHeaders: (res, filePath) => {
        if (filePath.endsWith('.html')) {
          res.setHeader('cache-control', 'no-cache')
        } else if (filePath.includes('/assets/')) {
          res.setHeader('cache-control', 'public, max-age=31536000, immutable')
        }
      },
    })
  }

  if (deps.config.password) {
    app.post<{ Body: { password?: string } }>('/api/login', (req, reply) => {
      if (req.body?.password !== deps.config.password) {
        return reply.code(401).send({ error: 'wrong password' })
      }
      const sid = randomUUID()
      sessions.add(sid)
      reply.setCookie('board_session', sid, { path: '/', httpOnly: true, sameSite: 'lax' })
      return { ok: true }
    })

    app.addHook('onRequest', (req, reply, done) => {
      const path = req.url.split('?')[0]
      const open = path === '/api/login' || !path.startsWith('/api')
      if (open || sessions.has(req.cookies.board_session ?? '')) return done()
      reply.code(401).send({ error: 'unauthorized' })
    })

    // /ws is not under /api so the hook passes it through;
    // auth is enforced here at upgrade time to prevent unauthenticated streaming
    app.get('/ws', { websocket: true }, (socket, req) => {
      if (!sessions.has(req.cookies.board_session ?? '')) {
        socket.close(4401, 'unauthorized')
        return
      }
      deps.hub.add(socket)
    })
  } else {
    app.get('/ws', { websocket: true }, (socket) => {
      deps.hub.add(socket)
    })
  }

  registerRoutes(app, deps)

  const uiIndex = path.join(uiDist, 'index.html')
  if (existsSync(uiIndex)) {
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.header('cache-control', 'no-cache').type('text/html').send(readFileSync(uiIndex, 'utf8'))
      }
      reply.code(404).send({ error: 'not found' })
    })
  }

  return app
}
