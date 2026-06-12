import type { Requirement } from './requirements.js'
import type { BoardItem, Candidate } from '../../../ui/src/types.js'

export interface StatusRow {
  id: string
  state: 'done' | 'partial' | 'missing'
  tested: boolean
  note: string
}
export interface StatusDoc {
  component: string
  rows: StatusRow[]
}

const STATUS_ROW = /^\|\s*([A-Z]{2,6}-R\d+)\s*\|\s*(done|partial|missing)\s*\|\s*(yes|no)\s*\|\s*(.*?)\s*\|\s*$/

export function parseStatusDoc(markdown: string): StatusDoc {
  const component = markdown.match(/^component:\s*(.+)$/m)?.[1]?.trim() ?? ''
  const rows: StatusRow[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(STATUS_ROW)
    if (m) rows.push({ id: m[1], state: m[2] as StatusRow['state'], tested: m[3] === 'yes', note: m[4].trim() })
  }
  return { component, rows }
}

function body(req: Requirement | undefined, reqId: string, lead: string): string {
  const lines = [lead]
  if (req?.statement) lines.push('', req.statement)
  if (req && req.acceptance.length > 0) {
    lines.push('', 'Acceptance:')
    for (const ac of req.acceptance) lines.push(`- ${ac}`)
  }
  lines.push('', `Req: ${reqId}`)
  return lines.join('\n')
}

export function buildCandidates(reqIndex: Map<string, Requirement>, docs: StatusDoc[]): Candidate[] {
  const out: Candidate[] = []
  for (const doc of docs) {
    for (const row of doc.rows) {
      const req = reqIndex.get(row.id)
      const title = req?.title ?? row.id
      if (row.state === 'missing') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P1',
          title: `Implement ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is missing. ${row.note}`.trim()) })
      } else if (row.state === 'partial') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Complete ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is partial. ${row.note}`.trim()) })
      }
      if (row.state !== 'missing' && !row.tested) {
        out.push({ kind: 'test', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Add tests for ${row.id}: ${title}`, body: body(req, row.id, `Detected by scan: ${row.id} is untested. ${row.note}`.trim()) })
      }
    }
  }
  return out
}

function itemKind(item: BoardItem): 'implement' | 'test' | null {
  if (item.title.startsWith('Add tests')) return 'test'
  if (item.title.startsWith('Implement ') || item.title.startsWith('Complete ')) return 'implement'
  return null
}

function coversReq(item: BoardItem, reqId: string): boolean {
  return item.body.split('\n').some((l) => l.trim() === `Req: ${reqId}`)
}

export function dedupeCandidates(
  candidates: Candidate[],
  existing: BoardItem[],
  lastScanned?: Record<string, string>,
): Candidate[] {
  const live = existing.filter((i) => i.status !== 'done')
  const done = existing.filter((i) => i.status === 'done')
  return candidates.filter((c) => {
    // An active (non-done) task already covering this req+kind suppresses the candidate.
    if (live.some((i) => itemKind(i) === c.kind && coversReq(i, c.reqId))) return false
    // A done task finished AFTER the component's last scan is work not yet re-verified —
    // don't re-propose it until the next Re-scan reconciles status (which resurfaces it if
    // the requirement is still incomplete). Done tasks at/before the last scan do NOT suppress,
    // so a verified-still-incomplete requirement keeps surfacing.
    const scanned = lastScanned?.[c.component]
    if (scanned && done.some((i) => itemKind(i) === c.kind && coversReq(i, c.reqId) && i.updated > scanned)) return false
    return true
  })
}
