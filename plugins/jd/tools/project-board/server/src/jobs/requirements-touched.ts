import { extractReqIds } from './requirements.js'

// Display string of the requirement IDs named in the Req: trailers of the given
// commit messages. Scoped to `Req:` lines so an ID mentioned elsewhere in a body
// is not counted. Reuses extractReqIds so this matches what the gate enforces.
export function formatRequirementsTouched(messages: string[]): string {
  const reqLines = messages
    .join('\n')
    .split('\n')
    .filter((l) => /^Req:/i.test(l.trim()))
  const ids = extractReqIds(reqLines.join('\n'))
  return ids.length > 0 ? ids.join(', ') : 'none'
}
