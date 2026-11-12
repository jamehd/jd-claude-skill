import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

const AC = /^\s*-\s*AC:\s*(.+)$/

function idRegexFrom(pattern) {
  return new RegExp(`\\b(?:${pattern})\\b`, 'g')
}

const DEFAULT_ID_REGEX = idRegexFrom('[A-Z]{2,6}-R\\d+')

function headingRegex(idRegex) {
  return new RegExp(`^##\\s+(?<id>${idRegex.source}):\\s*(?<title>.+)$`)
}

export function extractReqIds(text, idRegex = DEFAULT_ID_REGEX) {
  const re = idRegex.global ? idRegex : new RegExp(idRegex.source, `${idRegex.flags}g`)
  return [...new Set(text.match(re) ?? [])]
}

export function parseRequirementDoc(markdown, idRegex = DEFAULT_ID_REGEX) {
  const heading = headingRegex(idRegex)
  const reqs = []
  let cur = null
  let sawStatement = false
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const h = line.match(heading)
    if (h) {
      if (cur) reqs.push(cur)
      const title = h.groups.title.trim()
      cur = { id: h.groups.id, title, statement: '', acceptance: [], removed: /\bREMOVED\s*$/i.test(title) }
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

export function parseRequirementsDir(repoRoot, cfg = {}) {
  const index = new Map()
  const base = path.join(repoRoot, cfg.dir ?? 'docs/requirements')
  const idRegex = cfg.id_pattern ? idRegexFrom(cfg.id_pattern) : DEFAULT_ID_REGEX
  for (const sub of cfg.subdirs ?? ['components', 'capabilities']) {
    const dir = path.join(base, sub)
    if (!existsSync(dir)) continue
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.md'))) {
      try {
        for (const req of parseRequirementDoc(readFileSync(path.join(dir, file), 'utf8'), idRegex)) {
          index.set(req.id, req)
        }
      } catch { /* skip unreadable doc */ }
    }
  }
  return index
}
