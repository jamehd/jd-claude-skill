import { readFileSync } from 'node:fs'
import { matchAny } from './glob.mjs'

export function loadMap(mapPath) {
  return JSON.parse(readFileSync(mapPath, 'utf8'))
}

export function classifyChanges(changedFiles, map) {
  const exclude = map.exclude ?? []
  const relevant = changedFiles.filter((f) => !matchAny(f, exclude))
  const touched = []
  const seen = new Set()
  for (const comp of map.components) {
    if (relevant.some((f) => matchAny(f, comp.globs))) {
      const key = `${comp.doc}|${(comp.prefixes ?? []).join(',')}`
      if (!seen.has(key)) {
        seen.add(key)
        touched.push(comp)
      }
    }
  }
  return touched
}
