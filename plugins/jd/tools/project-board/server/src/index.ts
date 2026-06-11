import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'
import { JobRunner } from './jobs/runner.js'
import { BoardGit } from './jobs/git.js'
import { buildServer } from './server.js'

const config = loadConfig()
for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(config.dataDir, d), { recursive: true })

const store = new BoardStore(config.dataDir)
const hub = new WsHub()
const git = new BoardGit(config.repoRoot)
const runner = new JobRunner({
  store, hub, git,
  jobsDir: path.join(config.dataDir, 'jobs'),
  claudeBin: config.claudeBin,
  timeoutMs: config.jobTimeoutMs,
  maxConcurrent: config.maxConcurrentJobs,
})

store.watch(() => hub.broadcast({ type: 'board_update' }))

const app = await buildServer({ config, store, hub, runner, git })
await app.listen({ port: config.port, host: config.host })
app.log.info(`project board on http://${config.host}:${config.port}`)

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, () => {
    runner.shutdown()
    void app.close().finally(() => process.exit(0))
    setTimeout(() => process.exit(1), 5000).unref()
  })
}
