import matter from 'gray-matter'
import type { BoardItem, ComponentStatus, ItemStatus, ItemType, Priority } from '../../ui/src/types.js'

export const STATUSES: ItemStatus[] = ['backlog', 'ready', 'ai_running', 'review', 'pr', 'done', 'cancelled']
export const TYPES: ItemType[] = ['task', 'bug']
export const PRIORITIES: Priority[] = ['P0', 'P1', 'P2', 'P3']

function req(data: Record<string, unknown>, key: string): string {
  const v = data[key]
  if (v === undefined || v === null || v === '') throw new Error(`missing frontmatter field: ${key}`)
  return v instanceof Date ? v.toISOString().slice(0, 10) : String(v)
}

function oneOf<T extends string>(value: string, allowed: readonly T[], key: string): T {
  if (!allowed.includes(value as T)) throw new Error(`invalid ${key}: ${value}`)
  return value as T
}

const KNOWN_KEYS = new Set(['id', 'type', 'title', 'status', 'priority', 'component', 'created', 'updated', 'job', 'pr', 'requiresShaping', 'plan', 'dependsOn'])

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
  if (data.pr) item.pr = String(data.pr)
  if (data.requiresShaping) item.requiresShaping = true
  if (data.plan) item.plan = String(data.plan)
  if (Array.isArray(data.dependsOn) && data.dependsOn.length > 0) item.dependsOn = data.dependsOn.map(String)
  const extraEntries = Object.entries(data).filter(([k]) => !KNOWN_KEYS.has(k))
  if (extraEntries.length > 0) item.extra = Object.fromEntries(extraEntries)
  return item
}

export function serializeItem(item: BoardItem): string {
  const { body, extra, ...known } = item
  const fm = { ...(extra ?? {}), ...known }
  return matter.stringify('\n' + body.trim() + '\n', fm)
}

export function parseComponentStatus(raw: string): ComponentStatus {
  const { data, content } = matter(raw)
  return {
    component: req(data, 'component'),
    built: data.built === undefined || data.built === null || data.built === '' ? 0 : Number(data.built),
    tested: data.tested === undefined || data.tested === null || data.tested === '' ? 0 : Number(data.tested),
    last_scanned: req(data, 'last_scanned'),
    body: content.trim() + '\n',
  }
}
