import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadProjectConfig, type ProjectConfig } from '../project-config.js'

const here = path.dirname(fileURLToPath(import.meta.url))

function configFrom(write: (file: string) => void): ProjectConfig {
  const root = mkdtempSync(path.join(tmpdir(), 'board-cfg-'))
  mkdirSync(path.join(root, 'project-board'), { recursive: true })
  write(path.join(root, 'project-board', 'project.yaml'))
  return loadProjectConfig(root).config
}

export function gamesyncConfig(): ProjectConfig {
  return configFrom((file) => copyFileSync(path.join(here, 'gamesync.project.yaml'), file))
}

export function minimalConfig(): ProjectConfig {
  return configFrom((file) => writeFileSync(file, [
    'project: Acme Billing',
    'language:',
    '  owner: ""',
    'e2e:',
    '  host: lab-rig',
    '  note: Use the staging terminal with the test card.',
    'audits:',
    '  always: [custom:security-audit]',
    '  when_ui: []',
    '  when_schema: [jd:db-audit]',
    'board:',
    '  branch_prefix: bd/',
    '',
  ].join('\n')))
}
