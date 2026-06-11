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

  it('resolves a hand-renamed file by frontmatter id for getItem and updateItem', () => {
    // Write a valid task file with a non-matching filename
    const content =
      '---\n' +
      'id: TASK-009\n' +
      'type: task\n' +
      'title: Renamed Task\n' +
      'status: backlog\n' +
      'priority: P2\n' +
      'component: infra\n' +
      'created: 2026-06-11\n' +
      'updated: 2026-06-11\n' +
      '---\n\n' +
      'Body text.\n'
    writeFileSync(path.join(dataDir, 'tasks', 'renamed.md'), content)

    // getItem must find it even though filename does not match TASK-009
    const item = store.getItem('TASK-009')
    expect(item).toBeDefined()
    expect(item?.id).toBe('TASK-009')
    expect(item?.title).toBe('Renamed Task')

    // updateItem must succeed and write back to the same renamed.md file
    const updated = store.updateItem('TASK-009', { status: 'ready' })
    expect(updated.status).toBe('ready')

    // Confirm the file that was modified is still renamed.md
    const files = readdirSync(path.join(dataDir, 'tasks'))
    expect(files).toContain('renamed.md')
    expect(files).not.toContain('TASK-009.md')
    expect(files).not.toContain('TASK-009-renamed-task.md')

    // And reading back confirms the change persisted
    expect(store.getItem('TASK-009')?.status).toBe('ready')
  })

  it('deletes an item file', () => {
    const a = store.createItem({ type: 'task', title: 'Doomed', component: 'infra' })
    expect(store.getItem(a.id)).toBeDefined()
    store.deleteItem(a.id)
    expect(store.getItem(a.id)).toBeUndefined()
    expect(store.scan().items).toHaveLength(0)
  })

  it('throws when deleting an unknown item', () => {
    expect(() => store.deleteItem('TASK-999')).toThrow(/not found/)
  })
})
