import { extractReqIds } from '../../../shared/requirements.mjs'

const REQ_LINE = /^Req:\s*(.+)$/gim
const NONE = /^none\b\s*[—:-]?\s*(.+)?$/i

export function parseTrailers(messages) {
  const ids = new Set()
  const noneReasons = []
  for (const msg of messages) {
    for (const m of msg.matchAll(REQ_LINE)) {
      const value = m[1].trim()
      const none = value.match(NONE)
      if (none) {
        const reason = (none[1] ?? '').trim()
        if (reason) noneReasons.push(reason)
        continue
      }
      for (const id of extractReqIds(value)) ids.add(id)
    }
  }
  return { ids: [...ids], noneReasons }
}
