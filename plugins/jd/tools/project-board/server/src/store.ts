import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
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
        // invalid status files are skipped silently; scan() handles task invalids
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

  deleteItem(id: string): void {
    const file = this.fileFor(id)
    if (!file) throw new Error(`item not found: ${id}`)
    unlinkSync(file)
  }

  appendToBody(id: string, text: string): BoardItem {
    const item = this.getItem(id)
    if (!item) throw new Error(`item not found: ${id}`)
    return this.updateItem(id, { body: item.body.trim() + '\n\n' + text.trim() + '\n' })
  }

  watch(onChange: () => void): void {
    if (this.watcher) {
      void this.watcher.close()
    }
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
    const files = readdirSync(this.tasksDir)
    // Fast path: filename encodes the id
    const match = files.find((f) => f === `${id}.md` || f.startsWith(`${id}-`))
    if (match) return path.join(this.tasksDir, match)
    // Fallback: scan frontmatter for hand-renamed files
    for (const f of files.filter((f) => f.endsWith('.md'))) {
      try {
        const item = parseItem(readFileSync(path.join(this.tasksDir, f), 'utf8'))
        if (item.id === id) return path.join(this.tasksDir, f)
      } catch {
        // skip unparseable files
      }
    }
    return undefined
  }
}
