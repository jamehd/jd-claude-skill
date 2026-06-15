function prefixOf(id) {
  return id.slice(0, id.indexOf('-R'))
}

export function evaluateRange({ touched, trailers, definedIds }) {
  const failures = []
  const hasNone = trailers.noneReasons.length > 0
  for (const comp of touched) {
    if (hasNone) continue
    const label = comp.doc ?? comp.prefixes.join('/')
    const matching = trailers.ids.filter((id) => comp.prefixes.includes(prefixOf(id)))
    if (matching.length === 0) {
      failures.push(`missing Req anchor for ${label} — add a "Req: <ID>" trailer (or "Req: none — <reason>")`)
      continue
    }
    for (const id of matching) {
      if (!definedIds.has(id)) {
        const doc = comp.doc ?? `the matching ${prefixOf(id)} requirements doc`
        failures.push(`${id} referenced but not defined in ${doc} — add the requirement`)
      }
    }
  }
  return { ok: failures.length === 0, failures }
}

export function evaluateWorktree({ touched, changedDocs }) {
  const reminders = []
  for (const comp of touched) {
    if (!comp.doc) continue
    if (!changedDocs.has(comp.doc)) {
      reminders.push(`You changed code mapped to ${comp.doc} but did not touch that requirements doc. Per Definition of Done, add/update the requirement and put "Req: <ID>" in the commit.`)
    }
  }
  return { reminders }
}
