import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

export interface Requirement {
  id: string
  title: string
  statement: string
  acceptance: string[]
  removed?: boolean
}

const REQ_ID = /\b[A-Z]{2,6}-R\d+\b/g
const HEADING = /^##\s+([A-Z]{2,6}-R\d+):\s*(.+)$/
const AC = /^\s*-\s*AC:\s*(.+)$/

export function extractReqIds(text: string): string[] {
  return [...new Set(text.match(REQ_ID) ?? [])]
}

export function parseRequirementDoc(markdown: string): Requirement[] {
  const reqs: Requirement[] = []
  let cur: Requirement | null = null
  let sawStatement = false
  for (const line of markdown.split('\n')) {
    const h = line.match(HEADING)
    if (h) {
      if (cur) reqs.push(cur)
      const title = h[2].trim()
      cur = { id: h[1], title, statement: '', acceptance: [], removed: /\bREMOVED\s*$/i.test(title) }
      sawStatement = false
      continue
    }
    if (!cur) continue
    const ac = line.match(AC)
    if (ac) { cur.acceptance.push(ac[1].trim()); continue }
    if (!sawStatement && line.trim() && !line.startsWith('#')) {
      cur.statement = line.trim()
      sawStatement = true
    }
  }
  if (cur) reqs.push(cur)
  return reqs
}

export function parseRequirementsDir(repoRoot: string): Map<string, Requirement> {
  const index = new Map<string, Requirement>()
  const base = path.join(repoRoot, 'docs/requirements')
  for (const sub of ['components', 'capabilities']) {
    const dir = path.join(base, sub)
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      try {
        for (const req of parseRequirementDoc(readFileSync(path.join(dir, file), 'utf8'))) {
          index.set(req.id, req)
        }
      } catch { /* skip unreadable doc */ }
    }
  }
  return index
}
