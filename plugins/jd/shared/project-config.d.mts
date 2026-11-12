export class ProjectConfigError extends Error {
  file?: string
  key?: string
  constructor(message: string, info?: { file?: string; key?: string })
}

export interface ProjectConfig {
  project: string
  language: { owner?: string; docs: string; [key: string]: unknown }
  paths?: Record<string, string>
  actions?: Record<string, { run: string; pending?: boolean; when?: string }>
  git: {
    main?: string
    remote?: string
    remote_name: string
    integration: string
    branch_pattern: string
    commit_footer?: string
    [key: string]: unknown
  }
  tasks: { id_prefix: string; [key: string]: unknown }
  requirements: {
    dir: string
    subdirs: string[]
    map: string
    id_pattern: string
    id_example?: string
    headings: { description: string; acceptance: string }
    [key: string]: unknown
  }
  e2e: { host: string; note: string; contracts: unknown[]; [key: string]: unknown }
  audits: {
    always: string[]
    when_ui: string[]
    when_schema: string[]
    ui_design_source?: string
    [key: string]: unknown
  }
  design_system?: string
  ui_dirs?: string[]
  acceptance?: { environment?: string; forbidden?: string[]; [key: string]: unknown }
  limits: { fix_attempts: number; rework_rounds: number; features_active: number; [key: string]: unknown }
  models: { large_task: string; small_task: string; [key: string]: unknown }
  board: { port: number; data_dir: string; branch_prefix: string; [key: string]: unknown }
  hooks: { req_check: boolean; conventions: boolean; [key: string]: unknown }
  [key: string]: unknown
}

export interface LoadedProjectConfig {
  found: boolean
  path: string
  config: ProjectConfig
}

export function loadProjectConfig(repoRoot: string): LoadedProjectConfig
export function requirementIdRegex(config: Pick<ProjectConfig, 'requirements'>): RegExp
export function resolveMainBranch(repoRoot: string, config: Pick<ProjectConfig, 'git'>): string
