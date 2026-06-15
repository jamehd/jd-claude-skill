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
  details?: Record<string, { statement: string; acceptance: string[] }>
}

const STATUS_ROW = /^\|\s*([A-Z]{2,6}-R\d+)\s*\|\s*(done|partial|missing)\s*\|\s*(yes|no)\s*\|\s*(.*?)\s*\|\s*$/

export function parseStatusDoc(markdown: string): StatusDoc {
  const component = markdown.match(/^component:\s*(.+)$/m)?.[1]?.trim() ?? ''
  const rows: StatusRow[] = []
  for (const line of markdown.split('\n')) {
    const m = line.match(STATUS_ROW)
    if (m) rows.push({ id: m[1], state: m[2] as StatusRow['state'], tested: m[3] === 'yes', note: m[4].trim() })
  }
  const details: Record<string, { statement: string; acceptance: string[] }> = {}
  const lines = markdown.split('\n')
  let curId: string | null = null
  let inAcc = false
  for (const line of lines) {
    const h = line.match(/^###\s+([A-Z]{2,6}-R\d+)\s*$/)
    if (h) { curId = h[1]; details[curId] = { statement: '', acceptance: [] }; inAcc = false; continue }
    if (!curId) continue
    const mo = line.match(/^Mô tả:\s*(.*)$/)
    if (mo) { details[curId].statement = mo[1].trim(); inAcc = false; continue }
    if (/^Tiêu chí chấp nhận:\s*$/.test(line)) { inAcc = true; continue }
    if (inAcc) {
      const b = line.match(/^-\s+(.*)$/)
      if (b) { details[curId].acceptance.push(b[1].trim()); continue }
      if (line.trim() === '') continue
      inAcc = false
    }
  }
  return { component, rows, details: Object.keys(details).length ? details : undefined }
}

function body(detail: { statement: string; acceptance: string[] } | undefined, req: Requirement | undefined, reqId: string, lead: string): string {
  const statement = detail?.statement || req?.statement
  const acceptance = (detail?.acceptance.length ? detail.acceptance : req?.acceptance) ?? []
  const lines = [lead]
  if (statement) lines.push('', statement)
  if (acceptance.length > 0) {
    lines.push('', 'Tiêu chí chấp nhận:')
    for (const ac of acceptance) lines.push(`- ${ac}`)
  }
  lines.push('', `Req: ${reqId}`)
  return lines.join('\n')
}

export function buildCandidates(reqIndex: Map<string, Requirement>, docs: StatusDoc[]): Candidate[] {
  const out: Candidate[] = []
  for (const doc of docs) {
    for (const row of doc.rows) {
      const req = reqIndex.get(row.id)
      if (req?.removed) continue // tombstone: removed requirement never generates candidates
      const detail = doc.details?.[row.id]
      const title = req?.title ?? row.id
      if (row.state === 'missing') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P1',
          title: `Hiện thực ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} chưa làm. ${row.note}`.trim()) })
      } else if (row.state === 'partial') {
        out.push({ kind: 'implement', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Hoàn thiện ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} làm dở dang. ${row.note}`.trim()) })
      }
      if (row.state !== 'missing' && !row.tested) {
        out.push({ kind: 'test', type: 'task', component: doc.component, reqId: row.id, priority: 'P2',
          title: `Thêm test cho ${row.id}: ${title}`, body: body(detail, req, row.id, `Scan phát hiện: ${row.id} chưa có test. ${row.note}`.trim()) })
      }
    }
  }
  return out
}

function itemKind(item: BoardItem): 'implement' | 'test' | null {
  if (item.title.startsWith('Thêm test') || item.title.startsWith('Add tests')) return 'test'
  if (item.title.startsWith('Hiện thực ') || item.title.startsWith('Hoàn thiện ')
    || item.title.startsWith('Implement ') || item.title.startsWith('Complete ')) return 'implement'
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
