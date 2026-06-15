import { extractReqIds } from './requirements.js'

// Display string of the requirement IDs named in the Req: trailers of the given
// commit messages. Anchors `Req:` at line start (no trim) to match the req-check
// gate, so a Req: mentioned mid-body or indented is not counted. Reuses extractReqIds.
export function formatRequirementsTouched(messages: string[]): string {
  const reqLines = messages
    .flatMap((m) => m.split('\n'))
    .filter((l) => /^Req:/i.test(l))
  const ids = extractReqIds(reqLines.join('\n'))
  return ids.length > 0 ? ids.join(', ') : 'none'
}
