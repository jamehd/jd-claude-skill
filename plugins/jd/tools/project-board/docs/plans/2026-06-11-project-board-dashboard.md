# GameSync Project Board Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the LAN-hosted Mission Control dashboard (`project-board/`) that tracks project status from markdown files and dispatches tasks to headless Claude Code in isolated git worktrees, per the approved spec `docs/superpowers/specs/2026-06-11-project-dashboard-design.md`.

**Architecture:** A single Node package at `project-board/app`: Fastify server (REST + WebSocket, password-gated) that scans/watches `project-board/data/*.md` as the source of truth, plus a Job Runner that creates `board/<task-id>` worktrees and spawns `claude -p`. A Vite React SPA (served statically in prod) renders the single-screen Mission Control UI.

**Tech Stack:** TypeScript (ESM), Fastify 5 (`@fastify/cookie`, `@fastify/websocket`, `@fastify/static`), gray-matter, chokidar, Vitest; React 19 + Vite + Tailwind 4.

**Conventions:** All code/comments/docs in English. UI labels in Vietnamese. No redundant comments. Commit after every task.

---

## File structure

```
project-board/
├── app/
│   ├── package.json, tsconfig.json, vitest.config.ts, .env.example
│   ├── server/src/
│   │   ├── config.ts              # env loading
│   │   ├── markdown.ts            # task/status file parse + serialize
│   │   ├── store.ts               # scan, watch, create/update items
│   │   ├── ws.ts                  # WebSocket hub (broadcast)
│   │   ├── server.ts              # buildServer(): fastify app + auth + routes
│   │   ├── index.ts               # entrypoint
│   │   ├── api/routes.ts          # board/task/job/review REST routes
│   │   └── jobs/
│   │       ├── git.ts             # worktree/branch/diff/merge/pr helpers
│   │       ├── prompt.ts          # prompt templates (task job, rescan job)
│   │       └── runner.ts          # job state machine + process spawning
│   └── ui/                        # Vite root
│       ├── index.html, vite.config.ts
│       └── src/
│           ├── main.tsx, App.tsx, api.ts, useBoard.ts, types.ts
│           └── components/ (Login, KpiStrip, ComponentsPanel, Kanban,
│                            QuickAdd, TaskDrawer, ActivityPanel)
└── data/
    ├── tasks/                     # TASK-NNN-*.md, BUG-NNN-*.md
    ├── status/                    # <component>.md  (seeded in Task 14)
    └── jobs/                      # job-NNN.log / job-NNN.json (gitignored)
```

Shared API types live in `ui/src/types.ts` and are imported by the server too (single package, no duplication).

---

### Task 1: Scaffold `project-board/app`

**Files:**
- Create: `project-board/app/package.json`
- Create: `project-board/app/tsconfig.json`
- Create: `project-board/app/vitest.config.ts`
- Create: `project-board/app/.env.example`
- Create: `project-board/data/.gitignore`
- Create: `project-board/data/tasks/.gitkeep`, `project-board/data/status/.gitkeep`

- [ ] **Step 1: Create package.json**

`project-board/app/package.json`:

```json
{
  "name": "gamesync-project-board",
  "private": true,
  "type": "module",
  "scripts": {
    "dev:server": "tsx watch server/src/index.ts",
    "dev:ui": "vite ui",
    "build": "tsc -p tsconfig.json && vite build ui",
    "start": "node dist/server/src/index.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@fastify/cookie": "^11.0.0",
    "@fastify/static": "^8.0.0",
    "@fastify/websocket": "^11.0.0",
    "chokidar": "^4.0.0",
    "dotenv": "^16.4.0",
    "fastify": "^5.0.0",
    "gray-matter": "^4.0.3"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@types/ws": "^8.5.0",
    "@vitejs/plugin-react": "^4.3.0",
    "@tailwindcss/vite": "^4.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "tailwindcss": "^4.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vite": "^6.0.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

`project-board/app/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "jsx": "react-jsx",
    "strict": true,
    "skipLibCheck": true,
    "outDir": "dist",
    "rootDir": ".",
    "types": ["node"]
  },
  "include": ["server/src/**/*.ts", "ui/src/types.ts"]
}
```

- [ ] **Step 3: Create vitest config**

`project-board/app/vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['server/src/**/*.test.ts'],
    environment: 'node',
  },
})
```

- [ ] **Step 4: Create .env.example and data dirs**

`project-board/app/.env.example`:

```bash
BOARD_PASSWORD=change-me
BOARD_PORT=4400
BOARD_HOST=0.0.0.0
# BOARD_REPO_ROOT defaults to ../../ relative to project-board/app
# BOARD_JOB_TIMEOUT_MS=7200000
# BOARD_MAX_JOBS=1
# BOARD_CLAUDE_BIN=claude
```

`project-board/data/.gitignore`:

```
jobs/
```

Create empty `project-board/data/tasks/.gitkeep` and `project-board/data/status/.gitkeep`.

- [ ] **Step 5: Install and verify**

Run: `cd project-board/app && npm install && npx vitest run`
Expected: install succeeds; vitest reports "no test files found" (exit 0 with passWithNoTests off is exit 1 — add `passWithNoTests: true` to `vitest.config.ts` test block if it fails).

- [ ] **Step 6: Commit**

```bash
git add project-board docs/superpowers/plans/2026-06-11-project-board-dashboard.md
git commit -m "feat(board): scaffold project-board app package"
```

(Do NOT commit `project-board/app/node_modules`; root `.gitignore` already ignores `node_modules`. Verify with `git status` before committing.)

---

### Task 2: Shared types + markdown parse/serialize

**Files:**
- Create: `project-board/app/ui/src/types.ts`
- Create: `project-board/app/server/src/markdown.ts`
- Test: `project-board/app/server/src/markdown.test.ts`

- [ ] **Step 1: Define shared types**

`project-board/app/ui/src/types.ts`:

```ts
export type ItemType = 'task' | 'bug'
export type ItemStatus = 'backlog' | 'ready' | 'ai_running' | 'review' | 'done'
export type Priority = 'P0' | 'P1' | 'P2' | 'P3'

export interface BoardItem {
  id: string
  type: ItemType
  title: string
  status: ItemStatus
  priority: Priority
  component: string
  created: string
  updated: string
  job?: string
  body: string
}

export interface ComponentStatus {
  component: string
  completion: number
  last_scanned: string
  body: string
}

export type JobKind = 'task' | 'rescan'
export type JobState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'interrupted'

export interface Job {
  id: string
  kind: JobKind
  taskId?: string
  branch?: string
  state: JobState
  startedAt?: string
  endedAt?: string
  error?: string
}

export interface BoardSnapshot {
  items: BoardItem[]
  invalid: { file: string; error: string }[]
  components: ComponentStatus[]
  jobs: Job[]
}

export type WsMessage =
  | { type: 'board_update' }
  | { type: 'job_log'; jobId: string; line: string }
```

- [ ] **Step 2: Write failing tests**

`project-board/app/server/src/markdown.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseItem, serializeItem, parseComponentStatus } from './markdown.js'

const RAW = `---
id: TASK-012
type: task
title: Implement GetTheme RPC
status: ready
priority: P1
component: cafe-service
created: 2026-06-11
updated: 2026-06-11
---

Implement GetTheme.

## Acceptance
- returns theme
`

describe('parseItem', () => {
  it('parses frontmatter and body', () => {
    const item = parseItem(RAW)
    expect(item.id).toBe('TASK-012')
    expect(item.type).toBe('task')
    expect(item.status).toBe('ready')
    expect(item.priority).toBe('P1')
    expect(item.component).toBe('cafe-service')
    expect(item.body).toContain('## Acceptance')
  })

  it('round-trips through serializeItem', () => {
    const item = parseItem(RAW)
    const again = parseItem(serializeItem(item))
    expect(again).toEqual(item)
  })

  it('throws on missing required field', () => {
    expect(() => parseItem(RAW.replace('component: cafe-service\n', ''))).toThrow(/component/)
  })

  it('throws on invalid status', () => {
    expect(() => parseItem(RAW.replace('status: ready', 'status: bogus'))).toThrow(/status/)
  })
})

describe('parseComponentStatus', () => {
  it('parses completion and body', () => {
    const cs = parseComponentStatus(`---
component: cafe-service
completion: 90
last_scanned: 2026-06-11
---

Summary.

## Gaps
- [ ] GetTheme RPC
`)
    expect(cs.component).toBe('cafe-service')
    expect(cs.completion).toBe(90)
    expect(cs.body).toContain('## Gaps')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/markdown.test.ts`
Expected: FAIL — cannot find module './markdown.js'

- [ ] **Step 4: Implement markdown.ts**

`project-board/app/server/src/markdown.ts`:

```ts
import matter from 'gray-matter'
import type { BoardItem, ComponentStatus, ItemStatus, ItemType, Priority } from '../../ui/src/types.js'

const STATUSES: ItemStatus[] = ['backlog', 'ready', 'ai_running', 'review', 'done']
const TYPES: ItemType[] = ['task', 'bug']
const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

function req(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  if (v === undefined || v === null || v === '') throw new Error(`missing frontmatter field: ${key}`)
  return String(v)
}

function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!allowed.includes(value as T)) throw new Error(`invalid ${key}: ${value}`)
  return value as T
}

export function parseItem(raw: string): BoardItem {
  const { data, content } = matter(raw)
  const item: BoardItem = {
    id: req(data, 'id'),
    type: oneOf(req(data, 'type'), TYPES, 'type'),
    title: req(data, 'title'),
    status: oneOf(req(data, 'status'), STATUSES, 'status'),
    priority: oneOf(req(data, 'priority'), PRIORITIES, 'priority'),
    component: req(data, 'component'),
    created: req(data, 'created'),
    updated: req(data, 'updated'),
    body: content.trim() + '\n',
  }
  if (data.job) item.job = String(data.job)
  return item
}

export function serializeItem(item: BoardItem): string {
  const { body, ...fm } = item
  return matter.stringify('\n' + body.trim() + '\n', fm)
}

export function parseComponentStatus(raw: string): ComponentStatus {
  const { data, content } = matter(raw)
  return {
    component: req(data, 'component'),
    completion: Number(req(data, 'completion')),
    last_scanned: req(data, 'last_scanned'),
    body: content.trim() + '\n',
  }
}
```

Note: gray-matter parses unquoted `2026-06-11` as a Date — `req()` stringifies it. If the round-trip test fails on `created`, normalize in `req`: `v instanceof Date ? v.toISOString().slice(0, 10) : String(v)`.

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd project-board/app && npx vitest run server/src/markdown.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add project-board/app/ui/src/types.ts project-board/app/server/src/markdown.ts project-board/app/server/src/markdown.test.ts
git commit -m "feat(board): markdown task/status parsing with shared types"
```

---

### Task 3: BoardStore — scan, create, update, watch

**Files:**
- Create: `project-board/app/server/src/store.ts`
- Test: `project-board/app/server/src/store.test.ts`

- [ ] **Step 1: Write failing tests**

`project-board/app/server/src/store.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { BoardStore } from './store.js'

let dataDir: string
let store: BoardStore

beforeEach(() => {
  dataDir = mkdtempSync(path.join(tmpdir(), 'board-'))
  mkdirSync(path.join(dataDir, 'tasks'), { recursive: true })
  mkdirSync(path.join(dataDir, 'status'), { recursive: true })
  mkdirSync(path.join(dataDir, 'jobs'), { recursive: true })
  store = new BoardStore(dataDir)
})

describe('BoardStore', () => {
  it('creates an item with sequential id and slug filename', () => {
    const a = store.createItem({ type: 'task', title: 'Fix GetTheme RPC!', component: 'cafe-service' })
    expect(a.id).toBe('TASK-001')
    expect(a.status).toBe('backlog')
    expect(a.priority).toBe('P2')
    const b = store.createItem({ type: 'task', title: 'Another', component: 'admin-web' })
    expect(b.id).toBe('TASK-002')
    const bug = store.createItem({ type: 'bug', title: 'Crash', component: 'launcher-user' })
    expect(bug.id).toBe('BUG-001')
    const files = readdirSync(path.join(dataDir, 'tasks'))
    expect(files).toContain('TASK-001-fix-gettheme-rpc.md')
  })

  it('lists items and reports invalid files without throwing', () => {
    store.createItem({ type: 'task', title: 'Good', component: 'infra' })
    writeFileSync(path.join(dataDir, 'tasks', 'broken.md'), '---\nid: X\n---\nno required fields\n')
    const snap = store.scan()
    expect(snap.items).toHaveLength(1)
    expect(snap.invalid).toHaveLength(1)
    expect(snap.invalid[0].file).toBe('broken.md')
  })

  it('updates an item and bumps updated date', () => {
    const a = store.createItem({ type: 'task', title: 'Good', component: 'infra' })
    const updated = store.updateItem(a.id, { status: 'ready', priority: 'P0' })
    expect(updated.status).toBe('ready')
    expect(store.getItem(a.id)?.priority).toBe('P0')
  })

  it('appends a note to the body', () => {
    const a = store.createItem({ type: 'task', title: 'Good', component: 'infra' })
    store.appendToBody(a.id, '## AI result\nfailed: timeout')
    expect(store.getItem(a.id)?.body).toContain('## AI result')
  })

  it('reads component status files', () => {
    writeFileSync(path.join(dataDir, 'status', 'infra.md'),
      '---\ncomponent: infra\ncompletion: 50\nlast_scanned: 2026-06-11\n---\n\nHalf done.\n')
    expect(store.componentStatuses()).toHaveLength(1)
    expect(store.componentStatuses()[0].completion).toBe(50)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/store.test.ts`
Expected: FAIL — cannot find module './store.js'

- [ ] **Step 3: Implement store.ts**

`project-board/app/server/src/store.ts`:

```ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'
import { parseItem, serializeItem, parseComponentStatus } from './markdown.js'
import type { BoardItem, ComponentStatus, ItemType, Priority } from '../../ui/src/types.js'

export interface CreateItemInput {
  type: ItemType
  title: string
  component: string
  priority?: Priority
  body?: string
}

export interface ScanResult {
  items: BoardItem[]
  invalid: { file: string; error: string }[]
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function slugify(title: string): string {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

export class BoardStore {
  readonly tasksDir: string
  readonly statusDir: string
  readonly jobsDir: string
  private watcher?: FSWatcher

  constructor(readonly dataDir: string) {
    this.tasksDir = path.join(dataDir, 'tasks')
    this.statusDir = path.join(dataDir, 'status')
    this.jobsDir = path.join(dataDir, 'jobs')
  }

  scan(): ScanResult {
    const items: BoardItem[] = []
    const invalid: { file: string; error: string }[] = []
    for (const file of readdirSync(this.tasksDir).filter((f) => f.endsWith('.md'))) {
      try {
        items.push(parseItem(readFileSync(path.join(this.tasksDir, file), 'utf8')))
      } catch (err) {
        invalid.push({ file, error: err instanceof Error ? err.message : String(err) })
      }
    }
    items.sort((a, b) => a.id.localeCompare(b.id))
    return { items, invalid }
  }

  componentStatuses(): ComponentStatus[] {
    const out: ComponentStatus[] = []
    for (const file of readdirSync(this.statusDir).filter((f) => f.endsWith('.md'))) {
      try {
        out.push(parseComponentStatus(readFileSync(path.join(this.statusDir, file), 'utf8')))
      } catch {
        // invalid status files are skipped; tasks scan() reports its own invalids
      }
    }
    out.sort((a, b) => a.component.localeCompare(b.component))
    return out
  }

  getItem(id: string): BoardItem | undefined {
    const file = this.fileFor(id)
    return file ? parseItem(readFileSync(file, 'utf8')) : undefined
  }

  taskFileRelPath(id: string): string | undefined {
    const file = this.fileFor(id)
    return file ? path.join('project-board/data/tasks', path.basename(file)) : undefined
  }

  createItem(input: CreateItemInput): BoardItem {
    const prefix = input.type === 'task' ? 'TASK' : 'BUG'
    const existing = this.scan().items.filter((i) => i.id.startsWith(prefix + '-'))
    const max = existing.reduce((m, i) => Math.max(m, Number(i.id.split('-')[1])), 0)
    const id = `${prefix}-${String(max + 1).padStart(3, '0')}`
    const item: BoardItem = {
      id,
      type: input.type,
      title: input.title,
      status: 'backlog',
      priority: input.priority ?? 'P2',
      component: input.component,
      created: today(),
      updated: today(),
      body: (input.body ?? input.title) + '\n',
    }
    writeFileSync(path.join(this.tasksDir, `${id}-${slugify(input.title)}.md`), serializeItem(item))
    return item
  }

  updateItem(id: string, patch: Partial<Omit<BoardItem, 'id' | 'created'>>): BoardItem {
    const file = this.fileFor(id)
    if (!file) throw new Error(`item not found: ${id}`)
    const item = { ...parseItem(readFileSync(file, 'utf8')), ...patch, updated: today() }
    writeFileSync(file, serializeItem(item))
    return item
  }

  appendToBody(id: string, text: string): BoardItem {
    const item = this.getItem(id)
    if (!item) throw new Error(`item not found: ${id}`)
    return this.updateItem(id, { body: item.body.trim() + '\n\n' + text.trim() + '\n' })
  }

  watch(onChange: () => void): void {
    let timer: NodeJS.Timeout | undefined
    this.watcher = chokidar
      .watch([this.tasksDir, this.statusDir], { ignoreInitial: true })
      .on('all', () => {
        clearTimeout(timer)
        timer = setTimeout(onChange, 200)
      })
  }

  async close(): Promise<void> {
    await this.watcher?.close()
  }

  private fileFor(id: string): string | undefined {
    const file = readdirSync(this.tasksDir).find((f) => f === `${id}.md` || f.startsWith(`${id}-`))
    return file ? path.join(this.tasksDir, file) : undefined
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-board/app && npx vitest run server/src/store.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add project-board/app/server/src/store.ts project-board/app/server/src/store.test.ts
git commit -m "feat(board): BoardStore with scan/create/update/watch over markdown files"
```

---

### Task 4: Config, WebSocket hub, Fastify server with auth

**Files:**
- Create: `project-board/app/server/src/config.ts`
- Create: `project-board/app/server/src/ws.ts`
- Create: `project-board/app/server/src/server.ts`
- Test: `project-board/app/server/src/server.test.ts`

- [ ] **Step 1: Implement config.ts**

`project-board/app/server/src/config.ts`:

```ts
import 'dotenv/config'
import path from 'node:path'

export interface Config {
  port: number
  host: string
  password: string
  repoRoot: string
  dataDir: string
  jobTimeoutMs: number
  maxConcurrentJobs: number
  claudeBin: string
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  if (!env.BOARD_PASSWORD) throw new Error('BOARD_PASSWORD is required (set it in project-board/app/.env)')
  const repoRoot = path.resolve(env.BOARD_REPO_ROOT ?? path.resolve(process.cwd(), '../..'))
  return {
    port: Number(env.BOARD_PORT ?? 4400),
    host: env.BOARD_HOST ?? '0.0.0.0',
    password: env.BOARD_PASSWORD,
    repoRoot,
    dataDir: path.join(repoRoot, 'project-board/data'),
    jobTimeoutMs: Number(env.BOARD_JOB_TIMEOUT_MS ?? 7_200_000),
    maxConcurrentJobs: Number(env.BOARD_MAX_JOBS ?? 1),
    claudeBin: env.BOARD_CLAUDE_BIN ?? 'claude',
  }
}
```

- [ ] **Step 2: Implement ws.ts**

`project-board/app/server/src/ws.ts`:

```ts
import type { WebSocket } from 'ws'
import type { WsMessage } from '../../ui/src/types.js'

export class WsHub {
  private sockets = new Set<WebSocket>()

  add(socket: WebSocket): void {
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
  }

  broadcast(msg: WsMessage): void {
    const payload = JSON.stringify(msg)
    for (const s of this.sockets) {
      if (s.readyState === s.OPEN) s.send(payload)
    }
  }
}
```

- [ ] **Step 3: Write failing auth tests**

`project-board/app/server/src/server.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { buildServer, type ServerDeps } from './server.js'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'

export function makeDeps(): ServerDeps {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'board-srv-'))
  for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
  return {
    config: {
      port: 0, host: '127.0.0.1', password: 'secret', repoRoot: dataDir,
      dataDir, jobTimeoutMs: 1000, maxConcurrentJobs: 1, claudeBin: 'claude',
    },
    store: new BoardStore(dataDir),
    hub: new WsHub(),
    runner: null as never, // replaced in Task 9 tests; routes guard on null
  }
}

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
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/server.test.ts`
Expected: FAIL — cannot find module './server.js'

- [ ] **Step 5: Implement server.ts**

`project-board/app/server/src/server.ts`:

```ts
import Fastify, { type FastifyInstance } from 'fastify'
import cookie from '@fastify/cookie'
import websocket from '@fastify/websocket'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Config } from './config.js'
import type { BoardStore } from './store.js'
import type { WsHub } from './ws.js'
import type { JobRunner } from './jobs/runner.js'
import { registerRoutes } from './api/routes.js'

export interface ServerDeps {
  config: Config
  store: BoardStore
  hub: WsHub
  runner: JobRunner
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })
  const sessions = new Set<string>()

  await app.register(cookie)
  await app.register(websocket)

  const uiDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../ui/dist')
  if (existsSync(uiDist)) {
    await app.register(fastifyStatic, { root: uiDist })
  }

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
    const open = req.url === '/api/login' || !req.url.startsWith('/api')
    if (open || sessions.has(req.cookies.board_session ?? '')) return done()
    reply.code(401).send({ error: 'unauthorized' })
  })

  app.get('/ws', { websocket: true }, (socket, req) => {
    if (!sessions.has(req.cookies.board_session ?? '')) {
      socket.close(4401, 'unauthorized')
      return
    }
    deps.hub.add(socket)
  })

  registerRoutes(app, deps)
  return app
}
```

- [ ] **Step 6: Create a stub routes file so the server compiles**

`project-board/app/server/src/api/routes.ts` (stub; Task 5 expands it):

```ts
import type { FastifyInstance } from 'fastify'
import type { ServerDeps } from '../server.js'

export function registerRoutes(app: FastifyInstance, deps: ServerDeps): void {
  app.get('/api/board', () => {
    const { items, invalid } = deps.store.scan()
    return { items, invalid, components: deps.store.componentStatuses(), jobs: deps.runner?.listJobs() ?? [] }
  })
}
```

Also create a placeholder so the `JobRunner` type import resolves —
`project-board/app/server/src/jobs/runner.ts` (replaced in Task 8):

```ts
import type { Job } from '../../../ui/src/types.js'

export class JobRunner {
  listJobs(): Job[] {
    return []
  }
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd project-board/app && npx vitest run server/src/server.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 8: Commit**

```bash
git add project-board/app/server/src/config.ts project-board/app/server/src/ws.ts project-board/app/server/src/server.ts project-board/app/server/src/server.test.ts project-board/app/server/src/api/routes.ts project-board/app/server/src/jobs/runner.ts
git commit -m "feat(board): fastify server with password auth, ws hub, config"
```

---

### Task 5: Task CRUD routes

**Files:**
- Modify: `project-board/app/server/src/api/routes.ts`
- Test: `project-board/app/server/src/routes.test.ts`

- [ ] **Step 1: Write failing tests**

`project-board/app/server/src/routes.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildServer } from './server.js'
import { makeDeps } from './server.test.js'

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
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/routes.test.ts`
Expected: FAIL — 404 on POST /api/tasks

- [ ] **Step 3: Expand routes.ts**

Replace `project-board/app/server/src/api/routes.ts` with:

```ts
import type { FastifyInstance } from 'fastify'
import type { ServerDeps } from '../server.js'
import type { ItemStatus, ItemType, Priority } from '../../../ui/src/types.js'

interface CreateBody { type?: ItemType; title?: string; component?: string; priority?: Priority; body?: string }
interface PatchBody { title?: string; status?: ItemStatus; priority?: Priority; component?: string; body?: string }

export function registerRoutes(app: FastifyInstance, deps: ServerDeps): void {
  const { store, hub } = deps

  app.get('/api/board', () => ({
    ...store.scan(),
    components: store.componentStatuses(),
    jobs: deps.runner?.listJobs() ?? [],
  }))

  app.post<{ Body: CreateBody }>('/api/tasks', (req, reply) => {
    const { type, title, component, priority, body } = req.body ?? {}
    if (!type || !['task', 'bug'].includes(type) || !title?.trim() || !component?.trim()) {
      return reply.code(400).send({ error: 'type, title and component are required' })
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
    const item = store.updateItem(req.params.id, req.body ?? {})
    hub.broadcast({ type: 'board_update' })
    return item
  })
}
```

- [ ] **Step 4: Run all tests**

Run: `cd project-board/app && npx vitest run`
Expected: PASS (markdown, store, server, routes)

- [ ] **Step 5: Commit**

```bash
git add project-board/app/server/src/api/routes.ts project-board/app/server/src/routes.test.ts
git commit -m "feat(board): task CRUD routes with system-managed ai_running guard"
```

---

### Task 6: Server entrypoint + file watcher wiring

**Files:**
- Create: `project-board/app/server/src/index.ts`

- [ ] **Step 1: Implement index.ts**

`project-board/app/server/src/index.ts`:

```ts
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { loadConfig } from './config.js'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'
import { JobRunner } from './jobs/runner.js'
import { buildServer } from './server.js'

const config = loadConfig()
for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(config.dataDir, d), { recursive: true })

const store = new BoardStore(config.dataDir)
const hub = new WsHub()
const runner = new JobRunner() // Task 9 wires real dependencies

store.watch(() => hub.broadcast({ type: 'board_update' }))

const app = await buildServer({ config, store, hub, runner })
await app.listen({ port: config.port, host: config.host })
app.log.info(`project board on http://${config.host}:${config.port}`)
```

- [ ] **Step 2: Smoke-test the server**

```bash
cd project-board/app
cp .env.example .env   # then set BOARD_PASSWORD=devpass in .env
BOARD_PASSWORD=devpass npx tsx server/src/index.ts &
sleep 2
curl -s -X POST http://127.0.0.1:4400/api/login -H 'content-type: application/json' -d '{"password":"devpass"}' -c /tmp/board-cookies
curl -s http://127.0.0.1:4400/api/board -b /tmp/board-cookies
kill %1
```

Expected: login returns `{"ok":true}`; board returns JSON with `items`, `invalid`, `components`, `jobs`.

- [ ] **Step 3: Commit**

```bash
git add project-board/app/server/src/index.ts
git commit -m "feat(board): server entrypoint with fs watcher wiring"
```

---

### Task 7: Git helpers — worktree, diff, merge, PR

**Files:**
- Create: `project-board/app/server/src/jobs/git.ts`
- Test: `project-board/app/server/src/git.test.ts`

- [ ] **Step 1: Write failing tests (against a throwaway git repo)**

`project-board/app/server/src/git.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import { BoardGit } from './jobs/git.js'

let repo: string
let git: BoardGit

function sh(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' })
}

beforeEach(() => {
  repo = mkdtempSync(path.join(tmpdir(), 'board-git-'))
  sh(repo, 'init', '-b', 'main')
  sh(repo, 'config', 'user.email', 'test@test')
  sh(repo, 'config', 'user.name', 'test')
  writeFileSync(path.join(repo, 'a.txt'), 'hello\n')
  sh(repo, 'add', '.')
  sh(repo, 'commit', '-m', 'init')
  git = new BoardGit(repo)
})

describe('BoardGit', () => {
  it('creates and removes a worktree with branch', () => {
    const wt = git.createWorktree('TASK-001')
    expect(wt).toContain('.board-worktrees')
    expect(sh(repo, 'branch', '--list', 'board/TASK-001').trim()).not.toBe('')
    git.removeWorktree('TASK-001')
    expect(sh(repo, 'branch', '--list', 'board/TASK-001').trim()).toBe('')
  })

  it('produces a diff for branch changes', () => {
    const wt = git.createWorktree('TASK-002')
    writeFileSync(path.join(wt, 'a.txt'), 'changed\n')
    sh(wt, 'commit', '-am', 'change')
    expect(git.branchDiff('TASK-002')).toContain('-hello')
    git.removeWorktree('TASK-002')
  })

  it('squash-merges a branch into main and cleans up', () => {
    const wt = git.createWorktree('TASK-003')
    writeFileSync(path.join(wt, 'b.txt'), 'new file\n')
    sh(wt, 'add', '.')
    sh(wt, 'commit', '-m', 'add b')
    git.mergeBranch('TASK-003', 'board: TASK-003 add b')
    expect(sh(repo, 'log', '--oneline', '-1')).toContain('TASK-003')
    expect(sh(repo, 'branch', '--list', 'board/TASK-003').trim()).toBe('')
  })

  it('refuses to merge when the main working tree is dirty', () => {
    git.createWorktree('TASK-004')
    writeFileSync(path.join(repo, 'a.txt'), 'dirty\n')
    expect(() => git.mergeBranch('TASK-004', 'msg')).toThrow(/dirty|clean/i)
    git.removeWorktree('TASK-004')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/git.test.ts`
Expected: FAIL — cannot find module './jobs/git.js'

- [ ] **Step 3: Implement git.ts**

`project-board/app/server/src/jobs/git.ts`:

```ts
import { execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

export class BoardGit {
  constructor(readonly repoRoot: string) {}

  private git(args: string[], cwd = this.repoRoot): string {
    return execFileSync('git', args, { cwd, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  }

  worktreePath(taskId: string): string {
    return path.join(this.repoRoot, '.board-worktrees', taskId)
  }

  branchName(taskId: string): string {
    return `board/${taskId}`
  }

  createWorktree(taskId: string): string {
    this.removeWorktree(taskId) // re-dispatch after a kept-for-inspection failure starts fresh
    const wt = this.worktreePath(taskId)
    mkdirSync(path.dirname(wt), { recursive: true })
    this.git(['worktree', 'add', '-b', this.branchName(taskId), wt, 'main'])
    return wt
  }

  removeWorktree(taskId: string): void {
    try { this.git(['worktree', 'remove', '--force', this.worktreePath(taskId)]) } catch { /* already gone */ }
    try { this.git(['branch', '-D', this.branchName(taskId)]) } catch { /* already gone */ }
  }

  branchDiff(taskId: string): string {
    return this.git(['diff', `main...${this.branchName(taskId)}`])
  }

  changedFiles(taskId: string): string[] {
    return this.git(['diff', '--name-only', `main...${this.branchName(taskId)}`])
      .split('\n').filter(Boolean)
  }

  mergeBranch(taskId: string, message: string): void {
    if (this.git(['status', '--porcelain']).trim() !== '') {
      throw new Error('main working tree is dirty; commit or stash before merging')
    }
    const branch = this.git(['rev-parse', '--abbrev-ref', 'HEAD']).trim()
    if (branch !== 'main') throw new Error(`repo is on ${branch}, expected main`)
    this.git(['merge', '--squash', this.branchName(taskId)])
    this.git(['commit', '-m', message])
    this.removeWorktree(taskId)
  }

  createPr(taskId: string, title: string, body: string): string {
    this.git(['push', '-u', 'origin', this.branchName(taskId)])
    return execFileSync('gh',
      ['pr', 'create', '--head', this.branchName(taskId), '--title', title, '--body', body],
      { cwd: this.repoRoot, encoding: 'utf8' }).trim()
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd project-board/app && npx vitest run server/src/git.test.ts`
Expected: PASS (4 tests). (`createPr` is exercised manually later — it needs a GitHub remote.)

- [ ] **Step 5: Add `.board-worktrees/` to the repo root `.gitignore`**

Append the line `.board-worktrees/` to the repo root `.gitignore`.

- [ ] **Step 6: Commit**

```bash
git add project-board/app/server/src/jobs/git.ts project-board/app/server/src/git.test.ts .gitignore
git commit -m "feat(board): git worktree/diff/merge/pr helpers"
```

---

### Task 8: Job Runner state machine (TDD with fake process)

**Files:**
- Replace: `project-board/app/server/src/jobs/runner.ts`
- Create: `project-board/app/server/src/jobs/prompt.ts`
- Test: `project-board/app/server/src/runner.test.ts`

- [ ] **Step 1: Implement prompt.ts (pure functions, no test needed beyond runner tests)**

`project-board/app/server/src/jobs/prompt.ts`:

```ts
import { serializeItem } from '../markdown.js'
import type { BoardItem } from '../../../ui/src/types.js'

export function buildTaskPrompt(item: BoardItem, taskFileRel: string): string {
  return [
    `You are working in a dedicated git worktree on branch board/${item.id} of the GameSync repo.`,
    'Implement the following item. Follow the conventions in CLAUDE.md (English code/docs, error standard, tests).',
    '',
    '--- ITEM FILE ---',
    serializeItem(item),
    '--- END ITEM FILE ---',
    '',
    'You MUST finish by doing ALL of the following:',
    `1. Run the tests relevant to your change and make them pass.`,
    `2. Edit ${taskFileRel}: set frontmatter "status" to "review" and append an "## AI result" section`,
    '   (what you did, files touched, test command + result).',
    '3. Commit every change to the current branch with clear conventional-commit messages.',
    'Do not push, do not merge, do not touch branches other than the current one.',
  ].join('\n')
}

export function buildRescanPrompt(): string {
  return [
    'You are working in a dedicated git worktree of the GameSync repo.',
    'Survey the whole repository and refresh the project status files under project-board/data/status/.',
    'For each component (idc-backend, admin-web, cafe-service, launcher-downloader, launcher-user, launcher-packer, infra):',
    '- assess implementation completeness (features done / partial / missing, test coverage, TODO markers)',
    '- rewrite project-board/data/status/<component>.md keeping the frontmatter schema:',
    '  component, completion (integer percent), last_scanned (today, YYYY-MM-DD), then a summary paragraph and a "## Gaps" checklist.',
    'Only modify files under project-board/data/status/. Commit the result to the current branch.',
  ].join('\n')
}
```

- [ ] **Step 2: Write failing runner tests**

`project-board/app/server/src/runner.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { BoardStore } from './store.js'
import { WsHub } from './ws.js'
import { JobRunner, type SpawnFn, type GitOps } from './jobs/runner.js'

class FakeProc extends EventEmitter {
  stdout = new EventEmitter()
  stderr = new EventEmitter()
  killed = false
  kill() { this.killed = true; this.emit('exit', 143) }
}

function setup() {
  const dataDir = mkdtempSync(path.join(tmpdir(), 'board-run-'))
  for (const d of ['tasks', 'status', 'jobs']) mkdirSync(path.join(dataDir, d), { recursive: true })
  const store = new BoardStore(dataDir)
  const item = store.createItem({ type: 'task', title: 'Do work', component: 'infra' })
  store.updateItem(item.id, { status: 'ready' })

  let proc: FakeProc
  const spawnFn: SpawnFn = vi.fn(() => { proc = new FakeProc(); return proc as never })
  const git: GitOps = {
    createWorktree: vi.fn(() => path.join(dataDir, 'wt')),
    removeWorktree: vi.fn(),
    changedFiles: vi.fn(() => []),
  }
  const runner = new JobRunner({
    store, hub: new WsHub(), git, spawnFn,
    jobsDir: path.join(dataDir, 'jobs'), claudeBin: 'claude', timeoutMs: 50, maxConcurrent: 1,
  })
  return { store, runner, git, spawnFn, item, proc: () => proc!, dataDir }
}

describe('JobRunner', () => {
  it('dispatch runs a job: worktree, ai_running, success when task reaches review', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    expect(job.state).toBe('running')
    expect(t.git.createWorktree).toHaveBeenCalledWith(t.item.id)
    expect(t.store.getItem(t.item.id)?.status).toBe('ai_running')

    t.store.updateItem(t.item.id, { status: 'review' })
    t.proc().emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
  })

  it('marks job failed and resets task when exit is 0 but status never moved', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.proc().emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    const item = t.store.getItem(t.item.id)!
    expect(item.status).toBe('ready')
    expect(item.body).toContain('## AI result')
  })

  it('fails on nonzero exit', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.proc().emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
  })

  it('kills the process on timeout', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'), { timeout: 2000 })
    expect(t.proc().killed).toBe(true)
  })

  it('queues a second dispatch while one is running', () => {
    const t = setup()
    const second = t.store.createItem({ type: 'task', title: 'More', component: 'infra' })
    t.store.updateItem(second.id, { status: 'ready' })
    t.runner.dispatchTask(t.item.id)
    const job2 = t.runner.dispatchTask(second.id)
    expect(job2.state).toBe('queued')
  })

  it('writes a log file and job metadata', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.proc().stdout.emit('data', Buffer.from('working...\n'))
    t.proc().emit('exit', 1)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('failed'))
    const files = readdirSync(path.join(t.dataDir, 'jobs'))
    expect(files).toContain(`${job.id}.log`)
    expect(files).toContain(`${job.id}.json`)
    expect(readFileSync(path.join(t.dataDir, 'jobs', `${job.id}.log`), 'utf8')).toContain('working...')
  })

  it('rescan succeeds when status files changed', async () => {
    const t = setup()
    ;(t.git.changedFiles as ReturnType<typeof vi.fn>).mockReturnValue(['project-board/data/status/infra.md'])
    const job = t.runner.dispatchRescan()
    t.proc().emit('exit', 0)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('succeeded'))
  })

  it('cancel kills and resets the task', async () => {
    const t = setup()
    const job = t.runner.dispatchTask(t.item.id)
    t.runner.cancel(job.id)
    await vi.waitFor(() => expect(t.runner.getJob(job.id)?.state).toBe('cancelled'))
    expect(t.store.getItem(t.item.id)?.status).toBe('ready')
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/runner.test.ts`
Expected: FAIL — JobRunner constructor/methods missing

- [ ] **Step 4: Implement the real runner.ts**

Replace `project-board/app/server/src/jobs/runner.ts` with:

```ts
import { appendFileSync, writeFileSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import type { BoardStore } from '../store.js'
import type { WsHub } from '../ws.js'
import type { Job, JobKind } from '../../../ui/src/types.js'
import { buildTaskPrompt, buildRescanPrompt } from './prompt.js'

export type SpawnFn = (bin: string, args: string[], opts: { cwd: string }) => ChildProcess

export interface GitOps {
  createWorktree(taskId: string): string
  removeWorktree(taskId: string): void
  changedFiles(taskId: string): string[]
}

export interface RunnerDeps {
  store: BoardStore
  hub: WsHub
  git: GitOps
  jobsDir: string
  claudeBin: string
  timeoutMs: number
  maxConcurrent: number
  spawnFn?: SpawnFn
}

const RESCAN_ID = 'RESCAN'

export class JobRunner {
  private jobs = new Map<string, Job>()
  private queue: Job[] = []
  private running = new Map<string, { proc: ChildProcess; timer: NodeJS.Timeout }>()
  private spawnFn: SpawnFn

  constructor(private deps?: RunnerDeps) {
    this.spawnFn = deps?.spawnFn ?? spawn
    if (deps) this.recoverInterrupted()
  }

  listJobs(): Job[] {
    return [...this.jobs.values()].sort((a, b) => b.id.localeCompare(a.id))
  }

  getJob(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  dispatchTask(taskId: string): Job {
    return this.enqueue('task', taskId)
  }

  dispatchRescan(): Job {
    return this.enqueue('rescan', undefined)
  }

  cancel(jobId: string): void {
    const job = this.jobs.get(jobId)
    if (!job) return
    if (job.state === 'queued') {
      this.queue = this.queue.filter((j) => j.id !== jobId)
      this.finish(job, 'cancelled', 'cancelled while queued')
      return
    }
    this.running.get(jobId)?.proc.kill('SIGTERM')
    job.state = 'cancelled'
    this.persist(job)
  }

  private enqueue(kind: JobKind, taskId?: string): Job {
    const job: Job = { id: this.nextJobId(), kind, taskId, state: 'queued' }
    this.jobs.set(job.id, job)
    this.persist(job)
    this.queue.push(job)
    this.pump()
    return job
  }

  private pump(): void {
    if (!this.deps) return
    while (this.running.size < this.deps.maxConcurrent && this.queue.length > 0) {
      this.start(this.queue.shift()!)
    }
  }

  private start(job: Job): void {
    const { store, git, hub, jobsDir, claudeBin, timeoutMs } = this.deps!
    const wtId = job.kind === 'task' ? job.taskId! : RESCAN_ID
    job.branch = `board/${wtId}`
    job.startedAt = new Date().toISOString()
    job.state = 'running'

    let cwd: string
    try {
      cwd = git.createWorktree(wtId)
    } catch (err) {
      this.finish(job, 'failed', `worktree: ${err instanceof Error ? err.message : err}`)
      return
    }

    let prompt: string
    if (job.kind === 'task') {
      const item = store.getItem(job.taskId!)
      if (!item) {
        git.removeWorktree(wtId)
        this.finish(job, 'failed', `task not found: ${job.taskId}`)
        return
      }
      store.updateItem(item.id, { status: 'ai_running', job: job.id })
      prompt = buildTaskPrompt(item, store.taskFileRelPath(item.id)!)
    } else {
      prompt = buildRescanPrompt()
    }
    this.persist(job)
    hub.broadcast({ type: 'board_update' })

    const proc = this.spawnFn(claudeBin, ['-p', prompt, '--dangerously-skip-permissions'], { cwd })
    const logFile = path.join(jobsDir, `${job.id}.log`)
    const onData = (chunk: Buffer) => {
      const line = chunk.toString()
      appendFileSync(logFile, line)
      hub.broadcast({ type: 'job_log', jobId: job.id, line })
    }
    proc.stdout?.on('data', onData)
    proc.stderr?.on('data', onData)

    const timer = setTimeout(() => {
      job.error = `timeout after ${timeoutMs}ms`
      proc.kill('SIGTERM')
    }, timeoutMs)

    this.running.set(job.id, { proc, timer })
    proc.on('exit', (code) => {
      clearTimeout(timer)
      this.running.delete(job.id)
      if (job.state === 'cancelled') {
        this.afterFailure(job, 'cancelled by user')
        this.finishKeepState(job)
      } else if (job.error) {
        this.afterFailure(job, job.error)
        this.finish(job, 'failed', job.error)
      } else if (code !== 0) {
        this.afterFailure(job, `claude exited with code ${code}`)
        this.finish(job, 'failed', `exit code ${code}`)
      } else if (this.completedSuccessfully(job)) {
        this.finish(job, 'succeeded')
      } else {
        const reason = job.kind === 'task'
          ? 'process exited 0 but task status is not "review"'
          : 'process exited 0 but no files under project-board/data/status changed'
        this.afterFailure(job, reason)
        this.finish(job, 'failed', reason)
      }
      this.pump()
    })
  }

  private completedSuccessfully(job: Job): boolean {
    const { store, git } = this.deps!
    if (job.kind === 'task') {
      return store.getItem(job.taskId!)?.status === 'review'
    }
    return git.changedFiles(RESCAN_ID).some((f) => f.startsWith('project-board/data/status/'))
  }

  private afterFailure(job: Job, reason: string): void {
    const { store } = this.deps!
    if (job.kind !== 'task') return
    try {
      store.updateItem(job.taskId!, { status: 'ready' })
      store.appendToBody(job.taskId!, `## AI result\nJob ${job.id} failed: ${reason}\nWorktree/branch kept for inspection: board/${job.taskId}`)
    } catch { /* task file may be unparseable after a bad AI edit; job error is still recorded */ }
  }

  private finish(job: Job, state: Job['state'], error?: string): void {
    job.state = state
    if (error) job.error = error
    this.finishKeepState(job)
  }

  private finishKeepState(job: Job): void {
    job.endedAt = new Date().toISOString()
    this.persist(job)
    this.deps?.hub.broadcast({ type: 'board_update' })
  }

  private persist(job: Job): void {
    if (!this.deps) return
    writeFileSync(path.join(this.deps.jobsDir, `${job.id}.json`), JSON.stringify(job, null, 2))
  }

  private nextJobId(): string {
    const nums = [...this.jobs.keys()].map((id) => Number(id.split('-')[1]))
    if (this.deps) {
      for (const f of readdirSync(this.deps.jobsDir)) {
        const m = f.match(/^job-(\d+)\.json$/)
        if (m) nums.push(Number(m[1]))
      }
    }
    return `job-${String(Math.max(0, ...nums) + 1).padStart(3, '0')}`
  }

  private recoverInterrupted(): void {
    const { jobsDir, store } = this.deps!
    for (const f of readdirSync(jobsDir).filter((f) => f.endsWith('.json'))) {
      const job = JSON.parse(readFileSync(path.join(jobsDir, f), 'utf8')) as Job
      if (job.state === 'running' || job.state === 'queued') {
        job.state = 'interrupted'
        job.error = 'server restarted mid-job; worktree kept for inspection'
        if (job.kind === 'task' && job.taskId && store.getItem(job.taskId)?.status === 'ai_running') {
          store.updateItem(job.taskId, { status: 'ready' })
        }
        this.persist(job)
      }
      this.jobs.set(job.id, job)
    }
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd project-board/app && npx vitest run server/src/runner.test.ts`
Expected: PASS (8 tests). Also run the full suite: `npx vitest run` — the Task 4/5 tests must still pass (`JobRunner` now takes optional deps; `new JobRunner()` in tests/entrypoint still compiles).

- [ ] **Step 6: Update index.ts to wire the real runner**

In `project-board/app/server/src/index.ts`, replace the runner line:

```ts
import { BoardGit } from './jobs/git.js'

const git = new BoardGit(config.repoRoot)
const runner = new JobRunner({
  store, hub, git,
  jobsDir: path.join(config.dataDir, 'jobs'),
  claudeBin: config.claudeBin,
  timeoutMs: config.jobTimeoutMs,
  maxConcurrent: config.maxConcurrentJobs,
})
```

- [ ] **Step 7: Commit**

```bash
git add project-board/app/server/src/jobs project-board/app/server/src/runner.test.ts project-board/app/server/src/index.ts
git commit -m "feat(board): job runner state machine with claude headless dispatch"
```

---

### Task 9: Dispatch, rescan, cancel, log routes

**Files:**
- Modify: `project-board/app/server/src/api/routes.ts`
- Modify: `project-board/app/server/src/routes.test.ts` (add cases)
- Modify: `project-board/app/server/src/server.test.ts` (makeDeps gets a real runner with fake spawn)

- [ ] **Step 1: Upgrade makeDeps to provide a real JobRunner with a fake spawn**

In `server.test.ts`, replace `runner: null as never` with:

```ts
    runner: new JobRunner({
      store, hub, jobsDir: path.join(dataDir, 'jobs'),
      git: {
        createWorktree: () => dataDir,
        removeWorktree: () => {},
        changedFiles: () => [],
      },
      claudeBin: 'claude', timeoutMs: 60_000, maxConcurrent: 1,
      spawnFn: () => {
        const e = new EventEmitter() as never as ChildProcess
        ;(e as { stdout?: unknown }).stdout = new EventEmitter()
        ;(e as { stderr?: unknown }).stderr = new EventEmitter()
        ;(e as { kill?: unknown }).kill = () => (e as EventEmitter).emit('exit', 143)
        return e
      },
    }),
```

with imports `import { JobRunner } from './jobs/runner.js'`, `import { EventEmitter } from 'node:events'`, `import type { ChildProcess } from 'node:child_process'` — and restructure `makeDeps` so `store`, `hub`, `dataDir` are consts used by both fields.

- [ ] **Step 2: Add failing route tests**

Append to `routes.test.ts`:

```ts
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

  it('starts a rescan job', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/rescan', cookies: cookie })
    expect(res.statusCode).toBe(202)
    expect(res.json().kind).toBe('rescan')
  })

  it('serves a job log', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/jobs/job-999/log', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 3: Run tests to verify the new ones fail**

Run: `cd project-board/app && npx vitest run server/src/routes.test.ts`
Expected: new tests FAIL with 404 (routes missing)

- [ ] **Step 4: Add routes**

Append to `registerRoutes` in `routes.ts`:

```ts
  app.post<{ Params: { id: string } }>('/api/tasks/:id/dispatch', (req, reply) => {
    const item = store.getItem(req.params.id)
    if (!item) return reply.code(404).send({ error: 'not found' })
    if (item.status !== 'ready') {
      return reply.code(409).send({ error: `task is ${item.status}; only ready tasks can be dispatched` })
    }
    return reply.code(202).send(deps.runner.dispatchTask(item.id))
  })

  app.post('/api/rescan', (_req, reply) => reply.code(202).send(deps.runner.dispatchRescan()))

  app.post<{ Params: { id: string } }>('/api/jobs/:id/cancel', (req, reply) => {
    if (!deps.runner.getJob(req.params.id)) return reply.code(404).send({ error: 'not found' })
    deps.runner.cancel(req.params.id)
    return { ok: true }
  })

  app.get<{ Params: { id: string } }>('/api/jobs/:id/log', (req, reply) => {
    const file = path.join(store.jobsDir, `${req.params.id}.log`)
    if (!existsSync(file)) return reply.code(404).send({ error: 'no log' })
    return reply.type('text/plain').send(readFileSync(file, 'utf8'))
  })
```

Add imports at the top of `routes.ts`: `import path from 'node:path'`, `import { existsSync, readFileSync } from 'node:fs'`.

- [ ] **Step 5: Run all tests**

Run: `cd project-board/app && npx vitest run`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add project-board/app/server/src/api/routes.ts project-board/app/server/src/routes.test.ts project-board/app/server/src/server.test.ts
git commit -m "feat(board): dispatch/rescan/cancel/log routes"
```

---

### Task 10: Review routes — diff, merge, PR, discard

**Files:**
- Modify: `project-board/app/server/src/api/routes.ts`
- Modify: `project-board/app/server/src/server.test.ts` (extend fake git)
- Modify: `project-board/app/server/src/routes.test.ts`

- [ ] **Step 1: Extend the GitOps interface used by routes**

Routes need diff/merge/pr in addition to runner ops. In `jobs/git.ts`, `BoardGit` already implements them. Extend `GitOps` in `jobs/runner.ts`:

```ts
export interface GitOps {
  createWorktree(taskId: string): string
  removeWorktree(taskId: string): void
  changedFiles(taskId: string): string[]
  branchDiff(taskId: string): string
  mergeBranch(taskId: string, message: string): void
  createPr(taskId: string, title: string, body: string): string
}
```

Expose git on ServerDeps: add `git: GitOps` to the `ServerDeps` interface in `server.ts`, pass `git` in `index.ts` (`buildServer({ config, store, hub, runner, git })`). Extend BOTH fake git objects — the one in `server.test.ts` AND the one in `runner.test.ts` `setup()` (otherwise the Task 8 tests stop type-checking) — to:

```ts
      git: {
        createWorktree: () => dataDir,
        removeWorktree: () => {},
        changedFiles: () => [],
        branchDiff: () => 'diff --git a/x b/x',
        mergeBranch: () => {},
        createPr: () => 'https://github.com/example/pr/1',
      },
```

- [ ] **Step 2: Add failing review-route tests**

Append to `routes.test.ts`:

```ts
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
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd project-board/app && npx vitest run server/src/routes.test.ts`
Expected: review-route tests FAIL with 404

- [ ] **Step 4: Implement review routes**

Append to `registerRoutes` in `routes.ts`:

```ts
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
```

- [ ] **Step 5: Add rescan review routes (the rescan branch needs the same review gate)**

Export the worktree id from `jobs/runner.ts` (`export const RESCAN_ID = 'RESCAN'` — change the existing `const`), then append to `registerRoutes`:

```ts
  function latestRescan() {
    return deps.runner.listJobs().find((j) => j.kind === 'rescan' && j.state === 'succeeded')
  }

  app.get('/api/rescan/diff', (_req, reply) => {
    if (!latestRescan()) return reply.code(404).send({ error: 'no succeeded rescan job' })
    return reply.type('text/plain').send(deps.git.branchDiff(RESCAN_ID))
  })

  app.post('/api/rescan/merge', (_req, reply) => {
    if (!latestRescan()) return reply.code(404).send({ error: 'no succeeded rescan job' })
    try {
      deps.git.mergeBranch(RESCAN_ID, 'board: refresh project status (rescan)')
    } catch (err) {
      return reply.code(409).send({ error: err instanceof Error ? err.message : String(err) })
    }
    hub.broadcast({ type: 'board_update' })
    return { ok: true }
  })

  app.post('/api/rescan/discard', (_req, reply) => {
    deps.git.removeWorktree(RESCAN_ID)
    hub.broadcast({ type: 'board_update' })
    return reply.send({ ok: true })
  })
```

Import `RESCAN_ID` in `routes.ts`: `import { RESCAN_ID } from '../jobs/runner.js'`.

Add to `routes.test.ts` (the makeDeps fake git `branchDiff` already returns a diff):

```ts
describe('rescan review routes', () => {
  it('404s when no rescan job has succeeded', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/rescan/diff', cookies: cookie })
    expect(res.statusCode).toBe(404)
  })
})
```

(The succeeded path is covered by manual e2e step 7 — driving a fake job to `succeeded` through inject alone isn't worth the plumbing.)

- [ ] **Step 6: Run all tests**

Run: `cd project-board/app && npx vitest run`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add project-board/app/server/src
git commit -m "feat(board): review routes (diff/merge/pr/discard) incl. rescan gate"
```

---

### Task 11: UI scaffold — Vite, Tailwind, login, data hooks

**Files:**
- Create: `project-board/app/ui/index.html`
- Create: `project-board/app/ui/vite.config.ts`
- Create: `project-board/app/ui/src/main.tsx`
- Create: `project-board/app/ui/src/index.css`
- Create: `project-board/app/ui/src/api.ts`
- Create: `project-board/app/ui/src/useBoard.ts`
- Create: `project-board/app/ui/src/App.tsx`
- Create: `project-board/app/ui/src/components/Login.tsx`

- [ ] **Step 1: Vite config and entry**

`project-board/app/ui/vite.config.ts`:

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:4400',
      '/ws': { target: 'ws://127.0.0.1:4400', ws: true },
    },
  },
})
```

`project-board/app/ui/index.html`:

```html
<!doctype html>
<html lang="vi" class="dark">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>GameSync Project Board</title>
  </head>
  <body class="bg-zinc-950 text-zinc-100">
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`project-board/app/ui/src/index.css`:

```css
@import "tailwindcss";
```

`project-board/app/ui/src/main.tsx`:

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 2: API client**

`project-board/app/ui/src/api.ts`:

```ts
import type { BoardItem, BoardSnapshot, Job } from './types.js'

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
  diff: (id: string) => request<string>(`/api/tasks/${id}/diff`),
  merge: (id: string) => request<BoardItem>(`/api/tasks/${id}/merge`, { method: 'POST' }),
  pr: (id: string) => request<BoardItem>(`/api/tasks/${id}/pr`, { method: 'POST' }),
  discard: (id: string) => request<BoardItem>(`/api/tasks/${id}/discard`, { method: 'POST' }),
}
```

- [ ] **Step 3: useBoard hook (fetch + WebSocket refresh)**

`project-board/app/ui/src/useBoard.ts`:

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, UnauthorizedError } from './api.js'
import type { BoardSnapshot, WsMessage } from './types.js'

export function useBoard(onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [logLines, setLogLines] = useState<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.board())
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
    }
  }, [onUnauthorized])

  useEffect(() => {
    void refresh()
    let closed = false
    function connect() {
      const ws = new WebSocket(`ws://${location.host}/ws`)
      wsRef.current = ws
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as WsMessage
        if (msg.type === 'board_update') void refresh()
        if (msg.type === 'job_log') {
          setLogLines((prev) => ({ ...prev, [msg.jobId]: ((prev[msg.jobId] ?? '') + msg.line).slice(-20_000) }))
        }
      }
      ws.onclose = () => { if (!closed) setTimeout(connect, 2000) }
    }
    connect()
    return () => { closed = true; wsRef.current?.close() }
  }, [refresh])

  return { snapshot, logLines, refresh }
}
```

- [ ] **Step 4: Login + App shell**

`project-board/app/ui/src/components/Login.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../api.js'

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.login(password)
      onSuccess()
    } catch {
      setError('Sai mật khẩu')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={submit} className="w-80 space-y-4 rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-lg font-semibold">GameSync Project Board</h1>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)}
          placeholder="Mật khẩu" autoFocus
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-cyan-500"
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500">Đăng nhập</button>
      </form>
    </div>
  )
}
```

`project-board/app/ui/src/App.tsx` (shell only; panels arrive in Tasks 12–13):

```tsx
import { useState } from 'react'
import { Login } from './components/Login.js'
import { useBoard } from './useBoard.js'

export default function App() {
  const [authed, setAuthed] = useState(true)
  const { snapshot, logLines, refresh } = useBoard(() => setAuthed(false))

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-zinc-400">Đang tải…</div>

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <header className="text-sm text-zinc-500">GameSync Project Board — {snapshot.items.length} mục</header>
      <main className="text-zinc-400">Panels come in Tasks 12–13.</main>
    </div>
  )
}
```

- [ ] **Step 5: Verify dev build**

```bash
cd project-board/app
npx tsc -p tsconfig.json --noEmit
npx vite build ui
```

Expected: both succeed. Then manual check: run `npm run dev:server` + `npm run dev:ui`, open the Vite URL, log in with the dev password, see the shell with item count.

- [ ] **Step 6: Commit**

```bash
git add project-board/app/ui
git commit -m "feat(board): ui scaffold with login and live board hook"
```

---

### Task 12: UI — KPI strip, components panel, kanban with quick-add

**Files:**
- Create: `project-board/app/ui/src/components/KpiStrip.tsx`
- Create: `project-board/app/ui/src/components/ComponentsPanel.tsx`
- Create: `project-board/app/ui/src/components/Kanban.tsx`
- Create: `project-board/app/ui/src/components/QuickAdd.tsx`
- Modify: `project-board/app/ui/src/App.tsx`

- [ ] **Step 1: KpiStrip**

`project-board/app/ui/src/components/KpiStrip.tsx`:

```tsx
import type { BoardSnapshot } from '../types.js'

export function KpiStrip({ snapshot }: { snapshot: BoardSnapshot }) {
  const open = snapshot.items.filter((i) => i.status !== 'done')
  const bugs = open.filter((i) => i.type === 'bug')
  const running = snapshot.jobs.filter((j) => j.state === 'running' || j.state === 'queued')
  const avg = snapshot.components.length
    ? Math.round(snapshot.components.reduce((s, c) => s + c.completion, 0) / snapshot.components.length)
    : 0
  const cells: [string, string | number][] = [
    ['Hoàn thiện tổng thể', `${avg}%`],
    ['Task đang mở', open.length - bugs.length],
    ['Bug đang mở', bugs.length],
    ['AI đang chạy', running.length],
  ]
  return (
    <div className="grid grid-cols-4 gap-3">
      {cells.map(([label, value]) => (
        <div key={label} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 text-center">
          <div className="text-2xl font-semibold text-cyan-400">{value}</div>
          <div className="text-xs text-zinc-500">{label}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 2: ComponentsPanel with rescan button**

`project-board/app/ui/src/components/ComponentsPanel.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function ComponentsPanel({ components }: { components: ComponentStatus[] }) {
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  return (
    <aside className="flex w-64 flex-col gap-2 overflow-y-auto">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase text-zinc-500">Thành phần</h2>
        <button
          disabled={busy}
          onClick={async () => { setBusy(true); try { await api.rescan() } finally { setBusy(false) } }}
          className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700 disabled:opacity-50"
        >
          ↻ Re-scan
        </button>
      </div>
      {components.map((c) => (
        <div key={c.component} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
          onClick={() => setOpen(open === c.component ? null : c.component)}>
          <div className="flex justify-between text-sm">
            <span>{c.component}</span>
            <span className="text-cyan-400">{c.completion}%</span>
          </div>
          <div className="mt-1 h-1.5 rounded bg-zinc-800">
            <div className="h-1.5 rounded bg-cyan-500" style={{ width: `${c.completion}%` }} />
          </div>
          {open === c.component && (
            <pre className="mt-2 whitespace-pre-wrap text-xs text-zinc-400">{c.body}</pre>
          )}
        </div>
      ))}
    </aside>
  )
}
```

- [ ] **Step 3: Kanban with HTML5 drag-and-drop**

`project-board/app/ui/src/components/Kanban.tsx`:

```tsx
import { api } from '../api.js'
import type { BoardItem, ItemStatus } from '../types.js'

const COLUMNS: { key: ItemStatus; label: string }[] = [
  { key: 'backlog', label: 'Backlog' },
  { key: 'ready', label: 'Sẵn sàng' },
  { key: 'ai_running', label: 'AI đang làm' },
  { key: 'review', label: 'Review' },
  { key: 'done', label: 'Hoàn thành' },
]

const PRIORITY_COLOR: Record<string, string> = {
  P0: 'text-red-400', P1: 'text-orange-400', P2: 'text-zinc-400', P3: 'text-zinc-600',
}

export function Kanban({ items, onSelect }: { items: BoardItem[]; onSelect: (id: string) => void }) {
  async function drop(e: React.DragEvent, status: ItemStatus) {
    if (status === 'ai_running') return
    const id = e.dataTransfer.getData('text/plain')
    if (id) await api.patchTask(id, { status })
  }

  return (
    <div className="grid flex-1 grid-cols-5 gap-2 overflow-y-auto">
      {COLUMNS.map((col) => (
        <div key={col.key} className="flex flex-col gap-2 rounded-xl bg-zinc-900/60 p-2"
          onDragOver={(e) => col.key !== 'ai_running' && e.preventDefault()}
          onDrop={(e) => void drop(e, col.key)}>
          <h3 className="px-1 text-xs font-semibold uppercase text-zinc-500">
            {col.label} · {items.filter((i) => i.status === col.key).length}
          </h3>
          {items.filter((i) => i.status === col.key).map((item) => (
            <div key={item.id} draggable={item.status !== 'ai_running'}
              onDragStart={(e) => e.dataTransfer.setData('text/plain', item.id)}
              onClick={() => onSelect(item.id)}
              className="cursor-pointer rounded-lg border border-zinc-800 bg-zinc-900 p-2 text-sm hover:border-cyan-700">
              <div className="flex justify-between text-xs text-zinc-500">
                <span>{item.id}</span>
                <span className={PRIORITY_COLOR[item.priority]}>{item.priority}</span>
              </div>
              <div className={item.type === 'bug' ? 'text-red-300' : ''}>{item.title}</div>
              <div className="text-xs text-zinc-600">{item.component}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 4: QuickAdd modal**

`project-board/app/ui/src/components/QuickAdd.tsx`:

```tsx
import { useState } from 'react'
import { api } from '../api.js'
import type { ComponentStatus } from '../types.js'

export function QuickAdd({ components, onClose }: { components: ComponentStatus[]; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [type, setType] = useState<'task' | 'bug'>('task')
  const [component, setComponent] = useState(components[0]?.component ?? 'infra')
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    try {
      await api.createTask({ type, title, component })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi không xác định')
    }
  }

  return (
    <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/60" onClick={onClose}>
      <form onSubmit={submit} onClick={(e) => e.stopPropagation()}
        className="w-96 space-y-3 rounded-xl border border-zinc-700 bg-zinc-900 p-5">
        <h2 className="font-semibold">Thêm mục mới</h2>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tiêu đề"
          className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none focus:border-cyan-500" />
        <div className="flex gap-2">
          <select value={type} onChange={(e) => setType(e.target.value as 'task' | 'bug')}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2">
            <option value="task">Task</option>
            <option value="bug">Bug</option>
          </select>
          <select value={component} onChange={(e) => setComponent(e.target.value)}
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-2">
            {components.map((c) => <option key={c.component}>{c.component}</option>)}
          </select>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button className="w-full rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500">Tạo</button>
      </form>
    </div>
  )
}
```

- [ ] **Step 5: Wire into App.tsx**

Replace `project-board/app/ui/src/App.tsx`:

```tsx
import { useState } from 'react'
import { Login } from './components/Login.js'
import { KpiStrip } from './components/KpiStrip.js'
import { ComponentsPanel } from './components/ComponentsPanel.js'
import { Kanban } from './components/Kanban.js'
import { QuickAdd } from './components/QuickAdd.js'
import { useBoard } from './useBoard.js'

export default function App() {
  const [authed, setAuthed] = useState(true)
  const [adding, setAdding] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const { snapshot, logLines, refresh } = useBoard(() => setAuthed(false))

  if (!authed) return <Login onSuccess={() => { setAuthed(true); void refresh() }} />
  if (!snapshot) return <div className="p-8 text-zinc-400">Đang tải…</div>

  return (
    <div className="flex h-screen flex-col gap-3 p-3">
      <div className="flex items-start gap-3">
        <div className="flex-1"><KpiStrip snapshot={snapshot} /></div>
        <button onClick={() => setAdding(true)}
          className="rounded-xl bg-cyan-600 px-4 py-3 font-medium hover:bg-cyan-500">⊕ Thêm task / bug</button>
      </div>
      <div className="flex min-h-0 flex-1 gap-3">
        <ComponentsPanel components={snapshot.components} />
        <Kanban items={snapshot.items} onSelect={setSelected} />
        {/* ActivityPanel + TaskDrawer mount here in Task 13; `selected`/`logLines` are used there */}
      </div>
      {adding && <QuickAdd components={snapshot.components} onClose={() => { setAdding(false) }} />}
      {selected && null}
    </div>
  )
}
```

- [ ] **Step 6: Verify**

Run: `cd project-board/app && npx tsc -p tsconfig.json --noEmit && npx vite build ui`
Expected: success. Manual: with dev servers running, create an item via the modal, drag it Backlog → Sẵn sàng, edit the markdown file by hand in an editor and watch the board refresh.

- [ ] **Step 7: Commit**

```bash
git add project-board/app/ui
git commit -m "feat(board): mission-control panels — kpi, components, kanban, quick add"
```

---

### Task 13: UI — task drawer with dispatch/review actions + AI activity panel

**Files:**
- Create: `project-board/app/ui/src/components/TaskDrawer.tsx`
- Create: `project-board/app/ui/src/components/ActivityPanel.tsx`
- Modify: `project-board/app/ui/src/App.tsx`

- [ ] **Step 1: ActivityPanel**

`project-board/app/ui/src/components/ActivityPanel.tsx`:

```tsx
import { api } from '../api.js'
import type { Job } from '../types.js'

const STATE_COLOR: Record<string, string> = {
  queued: 'text-zinc-400', running: 'text-cyan-400', succeeded: 'text-green-400',
  failed: 'text-red-400', cancelled: 'text-zinc-500', interrupted: 'text-orange-400',
}

export function ActivityPanel({ jobs, logLines }: { jobs: Job[]; logLines: Record<string, string> }) {
  return (
    <aside className="flex w-72 flex-col gap-2 overflow-y-auto">
      <h2 className="text-xs font-semibold uppercase text-zinc-500">Hoạt động AI</h2>
      {jobs.length === 0 && <p className="text-sm text-zinc-600">Chưa có job nào.</p>}
      {jobs.map((job) => (
        <div key={job.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-sm">
          <div className="flex justify-between">
            <span>{job.id} · {job.kind === 'rescan' ? 'Re-scan' : job.taskId}</span>
            <span className={STATE_COLOR[job.state]}>{job.state}</span>
          </div>
          {job.error && <p className="mt-1 text-xs text-red-400">{job.error}</p>}
          {job.state === 'running' && (
            <>
              <pre className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap rounded bg-zinc-950 p-2 text-xs text-zinc-400">
                {logLines[job.id] ?? 'Đang chờ output…'}
              </pre>
              <button onClick={() => void api.cancelJob(job.id)}
                className="mt-2 rounded bg-zinc-800 px-2 py-1 text-xs text-red-300 hover:bg-zinc-700">
                Hủy job
              </button>
            </>
          )}
          {job.kind === 'rescan' && job.state === 'succeeded' && (
            <RescanReview />
          )}
        </div>
      ))}
    </aside>
  )
}

function RescanReview() {
  const [diff, setDiff] = useState<string | null>(null)
  const [gone, setGone] = useState(false)
  const [error, setError] = useState('')

  if (gone) return null
  return (
    <div className="mt-2 space-y-2">
      {diff === null ? (
        <button onClick={() => api.rescanDiff().then(setDiff).catch((e) => setError(String(e.message ?? e)))}
          className="rounded bg-zinc-800 px-2 py-1 text-xs hover:bg-zinc-700">Xem diff</button>
      ) : (
        <pre className="max-h-40 overflow-auto rounded bg-zinc-950 p-2 text-xs text-zinc-400">{diff || '(diff trống)'}</pre>
      )}
      <div className="flex gap-2">
        <button onClick={() => api.rescanMerge().then(() => setGone(true)).catch((e) => setError(String(e.message ?? e)))}
          className="flex-1 rounded bg-green-700 px-2 py-1 text-xs hover:bg-green-600">Merge status</button>
        <button onClick={() => api.rescanDiscard().then(() => setGone(true)).catch((e) => setError(String(e.message ?? e)))}
          className="flex-1 rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800">Hủy bỏ</button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
```

Add `import { useState } from 'react'` to the top of `ActivityPanel.tsx`.

- [ ] **Step 2: TaskDrawer**

`project-board/app/ui/src/components/TaskDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { api } from '../api.js'
import type { BoardItem } from '../types.js'

export function TaskDrawer({ item, onClose }: { item: BoardItem; onClose: () => void }) {
  const [diff, setDiff] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setDiff(null)
    if (item.status === 'review') {
      api.diff(item.id).then(setDiff).catch((e) => setError(String(e.message ?? e)))
    }
  }, [item.id, item.status])

  async function act(fn: () => Promise<unknown>) {
    setBusy(true)
    setError('')
    try { await fn(); onClose() } catch (e) { setError(e instanceof Error ? e.message : String(e)) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-10 flex w-[32rem] flex-col gap-3 overflow-y-auto border-l border-zinc-800 bg-zinc-900 p-5 shadow-2xl">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-zinc-500">{item.id} · {item.component} · {item.priority} · {item.status}</div>
          <h2 className="text-lg font-semibold">{item.title}</h2>
        </div>
        <button onClick={onClose} className="text-zinc-500 hover:text-zinc-200">✕</button>
      </div>

      {item.status === 'ready' && (
        <button disabled={busy} onClick={() => void act(() => api.dispatch(item.id))}
          className="rounded-md bg-cyan-600 py-2 font-medium hover:bg-cyan-500 disabled:opacity-50">
          ⚡ Giao cho AI
        </button>
      )}

      {item.status === 'review' && (
        <div className="flex gap-2">
          <button disabled={busy} onClick={() => void act(() => api.merge(item.id))}
            className="flex-1 rounded-md bg-green-700 py-2 text-sm font-medium hover:bg-green-600 disabled:opacity-50">Merge</button>
          <button disabled={busy} onClick={() => void act(() => api.pr(item.id))}
            className="flex-1 rounded-md bg-zinc-700 py-2 text-sm font-medium hover:bg-zinc-600 disabled:opacity-50">Tạo PR</button>
          <button disabled={busy} onClick={() => void act(() => api.discard(item.id))}
            className="flex-1 rounded-md bg-red-900 py-2 text-sm font-medium hover:bg-red-800 disabled:opacity-50">Hủy bỏ</button>
        </div>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <pre className="whitespace-pre-wrap rounded-lg bg-zinc-950 p-3 text-sm text-zinc-300">{item.body}</pre>

      {diff !== null && (
        <>
          <h3 className="text-xs font-semibold uppercase text-zinc-500">Diff (main…board/{item.id})</h3>
          <pre className="max-h-96 overflow-auto rounded-lg bg-zinc-950 p-3 text-xs text-zinc-400">{diff || '(diff trống)'}</pre>
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Mount both in App.tsx**

In `App.tsx`, add imports and replace the two placeholder lines:

```tsx
import { ActivityPanel } from './components/ActivityPanel.js'
import { TaskDrawer } from './components/TaskDrawer.js'
```

Inside the flex row, after `<Kanban …/>`, add:

```tsx
        <ActivityPanel jobs={snapshot.jobs} logLines={logLines} />
```

Replace `{selected && null}` with:

```tsx
      {selected && snapshot.items.find((i) => i.id === selected) && (
        <TaskDrawer item={snapshot.items.find((i) => i.id === selected)!} onClose={() => setSelected(null)} />
      )}
```

- [ ] **Step 4: Verify**

Run: `cd project-board/app && npx tsc -p tsconfig.json --noEmit && npx vite build ui && npx vitest run`
Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add project-board/app/ui
git commit -m "feat(board): task drawer with dispatch/review actions and AI activity panel"
```

---

### Task 14: Seed status data, README, manual e2e

**Files:**
- Create: `project-board/data/status/{idc-backend,admin-web,cafe-service,launcher-downloader,launcher-user,launcher-packer,infra}.md`
- Create: `project-board/README.md`

- [ ] **Step 1: Seed the seven status files from the 2026-06-11 assessment**

Each file follows the same schema. Contents (abridged values from the assessment — write all seven):

`project-board/data/status/idc-backend.md`:

```markdown
---
component: idc-backend
completion: 95
last_scanned: 2026-06-11
---

12 domains implemented (games, releases, manifests v2 + diff + multipart, auth + HW lock, cafes, sync, 3-tier chunk cache, cache orchestrator P1-P6, MQTT, P2P bootstrap). 94 test files.

## Gaps
- [ ] Payments/Subscriptions HTTP handlers (service layer done)
- [ ] Cache orchestrator backlog: MQTT subscriber (P3.5), off-peak throttle (P6.1), FS reconciliation (P5.1)
- [ ] Error envelope mirror sunset (step 8)
```

`project-board/data/status/admin-web.md`:

```markdown
---
component: admin-web
completion: 90
last_scanned: 2026-06-11
---

17 pages wired to the backend (games, users, cafes, cache inspector/admin, GC, prewarm, MQTT console).

## Gaps
- [ ] Metrics page uses hardcoded mock data
- [ ] Billing/Subscriptions UI missing
- [ ] Game version creation form (button exists, no modal)
- [ ] No automated tests
```

`project-board/data/status/cafe-service.md`:

```markdown
---
component: cafe-service
completion: 90
last_scanned: 2026-06-11
---

Production-grade download core: CAS chunk store with ref-count + GC, resume, delta updates, multi-source (HTTP + P2P race), multi-disk scheduler, 20+ admin endpoints, MQTT auto-update, full libp2p. 81 test files.

## Gaps
- [ ] gRPC contract: only ListGames + WatchUpdates of the 7 architecture RPCs
- [ ] GetTheme / GetVPNProfile / RegisterPC / ReportLaunch / ReportEvent not implemented
- [ ] cafe-credential.enc stored plaintext — DPAPI wrap TODO (internal/idc/store_windows.go)
- [ ] VPN profile handling absent
```

`project-board/data/status/launcher-downloader.md`:

```markdown
---
component: launcher-downloader
completion: 95
last_scanned: 2026-06-11
---

All core screens present (enroll, library, queue, settings, logout/switch account, P2P page); cafe-service bridge fully functional; no mock data.

## Gaps
- [ ] No automated tests
- [ ] No telemetry instrumentation
- [ ] npm run build broken (missing @bufbuild/protobuf) — verify via vitest/tsc single-file
```

`project-board/data/status/launcher-user.md`:

```markdown
---
component: launcher-user
completion: 70
last_scanned: 2026-06-11
---

Core works: ListGames + WatchUpdates over gRPC, BootRoom launch flow, kiosk lock.

## Gaps
- [ ] Theme management not wired (no GetTheme upstream)
- [ ] Telemetry/ReportEvent not implemented (TODO in error-handler.ts)
- [ ] Advanced status/progress rendering minimal
```

`project-board/data/status/launcher-packer.md`:

```markdown
---
component: launcher-packer
completion: 100
last_scanned: 2026-06-11
---

Full 4-step publish pipeline (scan, diff, auto-tune, checkpoint resume, upload, manifest signing). Task lifecycle tested.

## Gaps
- [ ] None known
```

`project-board/data/status/infra.md`:

```markdown
---
component: infra
completion: 60
last_scanned: 2026-06-11
---

Code-complete features gated on infrastructure and pilot deployment.

## Gaps
- [ ] P2P bootstrap: 3 VPS (HN/HCM/DN), DNS bootstrap-{1,2,3}.gamesync.vn, firewall, code-signing cert
- [ ] 10 Gbps hardware rig for Phase 3.3 perf gate
- [ ] Pilot cafe deployment + data collection
- [ ] QA deferred items: AV scanner compat (H.5), 10G NIC stress (I.2), Windows TCP tuning (I.3)
```

- [ ] **Step 2: Write project-board/README.md**

```markdown
# GameSync Project Board

Personal LAN dashboard for tracking GameSync development and dispatching tasks
to headless Claude Code. Spec: `docs/superpowers/specs/2026-06-11-project-dashboard-design.md`.

## Run

\`\`\`bash
cd project-board/app
cp .env.example .env       # set BOARD_PASSWORD
npm install
npm run build
npm start                  # serves UI + API on http://192.168.1.36:4400
\`\`\`

Dev mode: `npm run dev:server` and `npm run dev:ui` in two shells (Vite proxies /api and /ws).

## Data

- `data/tasks/` — one markdown file per task/bug (frontmatter: id, type, status, priority, component)
- `data/status/` — per-component completion summaries; refresh with the Re-scan button
- `data/jobs/` — AI job logs/metadata (gitignored)

Edit any file by hand; the board live-reloads via the file watcher.
```

- [ ] **Step 3: Manual end-to-end check (requires real `claude` binary)**

1. `npm run build && npm start` with `BOARD_PASSWORD` set; open `http://192.168.1.36:4400` from another LAN machine; log in.
2. Verify KPI strip shows component average from the seeded files; expand a component to see gaps.
3. Create `TASK-001` ("Add a comment line to project-board/README.md"), drag to Sẵn sàng, open drawer, ⚡ Giao cho AI.
4. Watch live log in the Activity panel; wait for the task to land in Review.
5. Open the drawer: confirm diff shows the change; press Merge; confirm task hits Hoàn thành and `git log` on main shows the squash commit; worktree and branch are gone.
6. Dispatch a second task and press Hủy job mid-run; confirm the task returns to Sẵn sàng with the failure note appended.
7. Press Re-scan; confirm a rescan job runs and its result appears as a reviewable diff touching only `data/status/`.
8. Restart the server mid-job; confirm the job shows `interrupted` and the task is back to Sẵn sàng.

- [ ] **Step 4: Commit**

```bash
git add project-board/data/status project-board/README.md
git commit -m "feat(board): seed component status data and README"
```

---

## Self-review notes

- **Spec coverage:** data model (T2–T3), auth + server (T4), CRUD (T5), watcher (T3/T6), git ops (T7), job runner incl. timeout/interrupted/completion detection (T8), dispatch/rescan/cancel/log routes (T9), review gate diff/merge/PR/discard (T10), Mission Control UI incl. system-managed ai_running column and Vietnamese labels (T11–T13), seeded status + run docs + e2e (T14). Phase C is out of scope per spec; the queue in T8 leaves the hook.
- **Known judgment calls locked here:** merge requires clean main checkout (surfaces 409 otherwise); PR path marks the task done with the PR URL appended; rescan worktree is named `board/RESCAN` and reuses the task review flow via changed-files detection.
- **Type consistency:** all server and UI code imports the single `ui/src/types.ts`.
