import { existsSync, readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import yaml from './vendor/js-yaml.mjs'

export class ProjectConfigError extends Error {
  constructor(message, { file, key } = {}) {
    super(message)
    this.name = 'ProjectConfigError'
    this.file = file
    this.key = key
  }
}

const DEFAULTS = {
  language: { docs: 'en' },
  git: { integration: 'pull-request', remote_name: 'origin', branch_pattern: 'feat/<ID>-<slug>' },
  tasks: { id_prefix: 'TASK' },
  requirements: {
    dir: 'docs/requirements',
    subdirs: ['components', 'capabilities'],
    map: '.component-map.json',
    id_pattern: '[A-Z]{2,6}-R\\d+',
    headings: { description: 'Description', acceptance: 'Acceptance criteria' }
  },
  e2e: { host: '', note: '', contracts: [] },
  audits: { always: ['jd:error-audit'], when_ui: ['jd:ui-design-audit'], when_schema: ['jd:db-audit'] },
  limits: { fix_attempts: 3, rework_rounds: 2, features_active: 1 },
  models: { large_task: 'opus', small_task: 'sonnet' },
  board: { port: 4400, data_dir: 'project-board/data', branch_prefix: 'board/' },
  hooks: { req_check: true, conventions: true }
}

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function kindOf(v) {
  if (Array.isArray(v)) return 'a list'
  if (isPlainObject(v)) return 'a mapping'
  if (typeof v === 'number') return 'a number'
  if (typeof v === 'boolean') return 'a boolean'
  return 'a string'
}

function mergeWithDefaults(defaults, user, file, prefix) {
  const out = { ...user }
  for (const [name, def] of Object.entries(defaults)) {
    const key = prefix ? `${prefix}.${name}` : name
    const value = user[name]
    if (value === undefined || value === null) {
      out[name] = structuredClone(def)
    } else if (isPlainObject(def)) {
      if (!isPlainObject(value)) throw new ProjectConfigError(`${file}: "${key}" must be a mapping`, { file, key })
      out[name] = mergeWithDefaults(def, value, file, key)
    } else if (kindOf(value) !== kindOf(def)) {
      throw new ProjectConfigError(`${file}: "${key}" must be ${kindOf(def)}, got ${kindOf(value)}`, { file, key })
    }
  }
  return out
}

export function loadProjectConfig(repoRoot) {
  const file = path.join(repoRoot, 'project-board', 'project.yaml')
  const found = existsSync(file)
  let raw = {}
  if (found) {
    try {
      raw = yaml.load(readFileSync(file, 'utf8')) ?? {}
    } catch (err) {
      throw new ProjectConfigError(`${file}: ${err.message}`, { file })
    }
    if (!isPlainObject(raw)) throw new ProjectConfigError(`${file}: top level must be a mapping`, { file })
  }
  const config = mergeWithDefaults(DEFAULTS, raw, file, '')
  if (typeof config.project !== 'string' || !config.project) config.project = path.basename(path.resolve(repoRoot))
  if (config.git.main !== undefined && typeof config.git.main !== 'string') {
    throw new ProjectConfigError(`${file}: "git.main" must be a string`, { file, key: 'git.main' })
  }
  try {
    new RegExp(config.requirements.id_pattern)
  } catch {
    throw new ProjectConfigError(`${file}: "requirements.id_pattern" is not a valid regular expression`, {
      file,
      key: 'requirements.id_pattern'
    })
  }
  return { found, path: file, config }
}

export function requirementIdRegex(config) {
  return new RegExp(`\\b(?:${config.requirements.id_pattern})\\b`, 'g')
}

export function resolveMainBranch(repoRoot, config) {
  if (config.git?.main) return config.git.main
  const remote = config.git?.remote_name ?? 'origin'
  try {
    const ref = execFileSync('git', ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim()
    const name = ref.startsWith(`${remote}/`) ? ref.slice(remote.length + 1) : ref
    if (name) return name
  } catch { /* not a git repo or no remote HEAD */ }
  return 'main'
}
