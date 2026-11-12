import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serializeItem } from '../markdown.js'
import type { BoardItem } from '../../../ui/src/types.js'
import { requirementIdRegex, type ProjectConfig } from '../project-config.js'
import { extractReqIds, type Requirement } from './requirements.js'

const LOCALIZED_DETAIL_HEADING: Record<string, string> = { vi: 'Chi tiết (Tiếng Việt)' }

export function languageName(code: string): string {
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(code) ?? code
  } catch {
    return code
  }
}

function trimSlashes(dir: string): string {
  return dir.replace(/[\\/]+$/, '')
}

function auditList(names: string[]): string {
  return names.map((n) => n.replace(/^jd:/, '')).join(', ')
}

function auditSummary(cfg: ProjectConfig): string {
  const parts: string[] = []
  if (cfg.audits.always.length > 0) parts.push(`${auditList(cfg.audits.always)} always`)
  if (cfg.audits.when_ui.length > 0) parts.push(`${auditList(cfg.audits.when_ui)} when the diff changes UI`)
  if (cfg.audits.when_schema.length > 0) parts.push(`${auditList(cfg.audits.when_schema)} when the diff changes the database schema`)
  parts.push('never e2e')
  return parts.join('; ')
}

export function e2eHostSuffix(cfg: ProjectConfig): string {
  return cfg.e2e.host ? ` on ${cfg.e2e.host}` : ''
}

export function e2eReviewNote(cfg: ProjectConfig): string {
  const base = `MANUAL E2E REQUIRED — run e2e${e2eHostSuffix(cfg)} and verify before merging.`
  return cfg.e2e.note.trim() ? `${base}\n${cfg.e2e.note.trim()}` : base
}

function idExample(cfg: ProjectConfig): string {
  const ex = cfg.requirements.id_example
  return typeof ex === 'string' ? ex : ''
}

function requirementLines(
  ids: string[],
  requirements: Map<string, Requirement>,
  cfg: ProjectConfig,
  style: { prefix: string; ac: string; missingNote: string },
): string[] {
  const lines: string[] = []
  for (const id of ids) {
    const r = requirements.get(id)
    if (r) {
      lines.push(`${style.prefix}${r.id} — ${r.title}: ${r.statement}`)
      for (const ac of r.acceptance) lines.push(`${style.ac}AC: ${ac}`)
    } else {
      lines.push(`${style.prefix}${id}: not found in ${trimSlashes(cfg.requirements.dir)}${style.missingNote}`)
    }
  }
  return lines
}

export function buildTaskPrompt(item: BoardItem, cfg: ProjectConfig, requirements?: Map<string, Requirement>, repoRoot?: string): string {
  const flag = item.extra?.needsE2e
  const needsE2e = flag === true || flag === 'true'
  const branch = `${cfg.board.branch_prefix}${item.id}`
  const dataDir = trimSlashes(cfg.board.data_dir)
  const reqDir = trimSlashes(cfg.requirements.dir)

  const lines = [
    `You are running headless in a dedicated git worktree on branch ${branch} of the ${cfg.project} repo, dispatched by the project board.`,
    `Deliver this task by running the \`jd:auto\` skill in BOARD MODE. Follow CLAUDE.md (${languageName(cfg.language.docs)} code/docs, error standard, tests).`,
    '',
    '--- ITEM FILE ---',
    serializeItem(item),
    '--- END ITEM FILE ---',
    '',
    'BOARD MODE rules (these override jd:auto defaults):',
    `- You are already in worktree ${branch}; do NOT create another worktree and do NOT switch branches.`,
    "- If a plan is attached below, treat it as jd:auto's spec+plan and implement from it; otherwise self-brainstorm as usual.",
    `- Run the full jd:auto chain: implement (TDD), then review + domain audits (${auditSummary(cfg)}), then verify.`,
    '- Commit on the CURRENT branch only. Do NOT push, do NOT open a PR, do NOT merge, do NOT touch other branches — the board owns review, PR, and merge.',
    `- Do NOT modify anything under ${dataDir}/ — task state is managed by the dashboard.`,
  ]

  const example = idExample(cfg)
  lines.push(
    '',
    'You MUST finish by doing ALL of the following:',
    '1. Implement the item and run the tests relevant to your change.',
    '2. Commit every change to the current branch with clear conventional-commit messages.',
    '3. End your final output with a short summary of what you did and the test results.',
    '4. If your change adds or alters externally observable behavior, add or update the matching',
    `   requirement under ${reqDir}/ on this same branch, and end the relevant commit(s)`,
    `   with a "Req: <ID>" trailer${example ? ` (e.g. "Req: ${example}")` : ''}. Use "Req: none — <reason>" ONLY for a`,
    '   behavior-neutral change (refactor, comment, test-only).',
    '5. End your final output with a line: "Requirements touched: <ID[, ID...] | none>" naming the',
    '   requirement IDs your commits carry.',
  )

  if (needsE2e) {
    lines.push(
      '6. This task is flagged needsE2e and cannot be verified headless. End your final output with a',
      `   line "MANUAL E2E REQUIRED" so the board holds it in review for manual e2e${e2eHostSuffix(cfg)}.`,
    )
    if (cfg.e2e.note.trim()) lines.push(`   ${cfg.e2e.note.trim()}`)
  } else {
    lines.push(
      '6. This task is not e2e-gated: once you finish and the tests pass, the board will open the PR',
      '   automatically — do not open it yourself.',
    )
  }

  const ids = extractReqIds(item.body, requirementIdRegex(cfg))
  if (requirements && ids.length > 0) {
    lines.push('', '--- REQUIREMENTS YOU MUST SATISFY ---')
    lines.push(...requirementLines(ids, requirements, cfg, { prefix: '', ac: '  ', missingNote: ' (proceed from the task description)' }))
    lines.push('--- END REQUIREMENTS ---')
  }

  if (item.plan?.trim()) {
    const p = item.plan.trim()
    let planText = item.plan
    // A single-line *.md value that resolves to a file INSIDE repoRoot is a committed
    // plan file; read it. The containment check rejects `../` escapes from the owner-entered path.
    if (repoRoot && !p.includes('\n') && /\.md$/.test(p)) {
      const root = path.resolve(repoRoot)
      const abs = path.resolve(root, p)
      if ((abs === root || abs.startsWith(root + path.sep)) && existsSync(abs)) {
        planText = readFileSync(abs, 'utf8')
      }
    }
    lines.push('', '--- APPROVED PLAN — FOLLOW IT ---', planText.trim(), '--- END APPROVED PLAN ---')
  }

  return lines.join('\n')
}

export function buildResolvePrompt(
  item: BoardItem,
  cfg: ProjectConfig,
  requirements?: Map<string, Requirement>,
  mainBranch = 'main',
): string {
  const dataDir = trimSlashes(cfg.board.data_dir)
  const lines = [
    `You are in a git worktree on branch ${cfg.board.branch_prefix}${item.id} of the ${cfg.project} repo.`,
    `${mainBranch} has advanced and this branch now CONFLICTS with it. Your job is to bring the`,
    `branch up to date with ${mainBranch} and resolve the conflict — do NOT re-implement from scratch.`,
    '',
    `Task: ${item.title}`,
    '',
    item.body.trim(),
    '',
    'Do ALL of the following:',
    `1. Run \`git merge ${mainBranch}\` to bring ${mainBranch}'s changes into this branch.`,
    `2. Resolve EVERY conflict, preserving BOTH this task's intent AND ${mainBranch}'s changes.`,
    '3. Run the tests relevant to the changed files and make them pass.',
    '4. Commit the resolution (git add + git commit). Do NOT push, do NOT touch other branches,',
    `   and do NOT modify anything under ${dataDir}/.`,
    `5. Verify \`git diff ${mainBranch}...HEAD\` no longer reports conflicts.`,
    '6. End with a short summary of what conflicted and how you resolved it.',
  ]
  const ids = extractReqIds(item.body, requirementIdRegex(cfg))
  if (requirements && ids.length > 0) {
    lines.push('', '--- REQUIREMENTS THIS TASK MUST STILL SATISFY ---')
    lines.push(...requirementLines(ids, requirements, cfg, { prefix: '', ac: '  ', missingNote: '' }))
    lines.push('--- END REQUIREMENTS ---')
  }
  return lines.join('\n')
}

export function buildBrainstormPrompt(item: BoardItem, cfg: ProjectConfig, requirements?: Map<string, Requirement>): string {
  const lines = [
    `Brainstorm and shape board task ${item.id} for the ${cfg.project} project before it is executed.`,
    '',
    `Title: ${item.title}`,
    '',
    'Description:',
    item.body.trim(),
  ]
  const ids = extractReqIds(item.body, requirementIdRegex(cfg))
  if (requirements && ids.length > 0) {
    lines.push('', 'Requirements this task must satisfy:')
    lines.push(...requirementLines(ids, requirements, cfg, { prefix: '- ', ac: '    ', missingNote: '' }))
  }
  lines.push(
    '',
    'Use the superpowers brainstorming skill to turn this into a design, then writing-plans to produce an implementation plan.',
    'Write the spec under docs/specs/ and the plan under docs/plans/.',
    'When done, attach the plan to this board task: paste the plan into the task plan field, or set the plan field to the plan file path (e.g. docs/plans/<file>.md). The task can then move to Ready.',
  )
  return lines.join('\n')
}

export function buildRescanPrompt(cfg: ProjectConfig): string {
  const dataDir = trimSlashes(cfg.board.data_dir)
  const reqDir = trimSlashes(cfg.requirements.dir)
  const componentDir = cfg.requirements.subdirs[0] ?? 'components'
  const ownerLang = cfg.language.owner?.trim() ?? ''
  const lang = ownerLang ? languageName(ownerLang) : ''
  const { description, acceptance } = cfg.requirements.headings

  const lines = [
    `You are working in the ${cfg.project} repository root.`,
    'Reconcile project status against the living requirements. For EACH component',
    `that has a requirements doc at ${reqDir}/${componentDir}/<component>.md:`,
    '1. Read the requirement doc — each "## <ID>: <title>" with its acceptance criteria.',
    '2. Inspect the component code and its tests to judge each requirement.',
    `3. Write ${dataDir}/status/<component>.md with this exact shape:`,
    '',
    '---',
    'component: <component>',
    'last_scanned: <today YYYY-MM-DD>',
    'built: <integer percent = round(100 * (count(State==done) + 0.5*count(State==partial)) / total requirements)>',
    'tested: <integer percent = round(100 * count(Tested==yes) / total requirements)>',
    '---',
    '',
    '| Req | State | Tested | Note |',
    '|-----|-------|--------|------|',
    '| <ID> | done\\|partial\\|missing | yes\\|no | short note |',
    '',
    '## Drift',
    '- requirements with no implementation',
    '- code with no referencing requirement',
    '- acceptance criteria with no test',
    '',
    'Rules:',
    '- State is one of done / partial / missing; Tested is yes / no.',
    '- built credits done as 1 and partial as 0.5 of a requirement.',
    '- tested counts only requirements whose Tested column is yes.',
  ]
  if (lang) {
    lines.push(`- Write the "Note" column text in ${lang} (keep State/Tested values and the table structure in English).`)
  }
  lines.push(
    `- Only write files under ${dataDir}/status/. Do NOT run git and do`,
    '  NOT commit — the dashboard reads these files from disk.',
  )
  if (lang) {
    lines.push(
      '',
      `After the table and Drift, also write a ${lang} detail section so the board reads in ${lang}:`,
      '',
      `## ${LOCALIZED_DETAIL_HEADING[ownerLang] ?? `Details (${lang})`}`,
      '',
      'For EACH requirement <ID> in this component, a block:',
      '### <ID>',
      `${description}: <the requirement statement, translated to ${lang}>`,
      `${acceptance}:`,
      `- <each acceptance criterion, translated to ${lang}>`,
      '',
      `Keep code tokens, file paths, identifiers, and \`backtick\` snippets unchanged inside the ${lang} text; translate only the natural-language prose.`,
    )
  }
  return lines.join('\n')
}
