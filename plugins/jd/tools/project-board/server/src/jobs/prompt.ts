import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { serializeItem } from '../markdown.js'
import type { BoardItem } from '../../../ui/src/types.js'
import { extractReqIds, type Requirement } from './requirements.js'

export function buildTaskPrompt(item: BoardItem, requirements?: Map<string, Requirement>, repoRoot?: string): string {
  const lines = [
    `You are working in a dedicated git worktree on branch board/${item.id} of the GameSync repo.`,
    'Implement the following item. Follow the conventions in CLAUDE.md (English code/docs, error standard, tests).',
    '',
    '--- ITEM FILE ---',
    serializeItem(item),
    '--- END ITEM FILE ---',
  ]

  if (item.plan?.trim()) {
    lines.push(
      '',
      'An approved implementation plan is provided below (APPROVED PLAN). Execute it using',
      'the `superpowers:subagent-driven-development` skill: a fresh implementer per task (TDD),',
      'then a spec-compliance review and a code-quality review, fixing issues before moving on.',
    )
  }

  lines.push(
    '',
    'You MUST finish by doing ALL of the following:',
    '1. Implement the item and run the tests relevant to your change.',
    '2. Commit every change to the current branch with clear conventional-commit messages.',
    '3. End your final output with a short summary of what you did and the test results.',
    '4. Do NOT modify anything under project-board/data/ — task state is managed by the dashboard.',
    '5. Do not push, do not merge, do not touch branches other than the current one.',
  )

  const ids = extractReqIds(item.body)
  if (requirements && ids.length > 0) {
    lines.push('', '--- REQUIREMENTS YOU MUST SATISFY ---')
    for (const id of ids) {
      const r = requirements.get(id)
      if (r) {
        lines.push(`${r.id} — ${r.title}: ${r.statement}`)
        for (const ac of r.acceptance) lines.push(`  AC: ${ac}`)
      } else {
        lines.push(`${id}: not found in docs/requirements (proceed from the task description)`)
      }
    }
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

export function buildResolvePrompt(item: BoardItem, requirements?: Map<string, Requirement>): string {
  const lines = [
    `You are in a git worktree on branch board/${item.id} of the GameSync repo.`,
    'main has advanced and this branch now CONFLICTS with it. Your job is to bring the',
    'branch up to date with main and resolve the conflict — do NOT re-implement from scratch.',
    '',
    `Task: ${item.title}`,
    '',
    item.body.trim(),
    '',
    'Do ALL of the following:',
    '1. Run `git merge main` to bring main\'s changes into this branch.',
    '2. Resolve EVERY conflict, preserving BOTH this task\'s intent AND main\'s changes.',
    '3. Run the tests relevant to the changed files and make them pass.',
    '4. Commit the resolution (git add + git commit). Do NOT push, do NOT touch other branches,',
    '   and do NOT modify anything under project-board/data/.',
    '5. Verify `git diff main...HEAD` no longer reports conflicts.',
    '6. End with a short summary of what conflicted and how you resolved it.',
  ]
  const ids = extractReqIds(item.body)
  if (requirements && ids.length > 0) {
    lines.push('', '--- REQUIREMENTS THIS TASK MUST STILL SATISFY ---')
    for (const id of ids) {
      const r = requirements.get(id)
      if (r) {
        lines.push(`${r.id} — ${r.title}: ${r.statement}`)
        for (const ac of r.acceptance) lines.push(`  AC: ${ac}`)
      } else {
        lines.push(`${id}: not found in docs/requirements`)
      }
    }
    lines.push('--- END REQUIREMENTS ---')
  }
  return lines.join('\n')
}

export function buildBrainstormPrompt(item: BoardItem, requirements?: Map<string, Requirement>): string {
  const lines = [
    `Brainstorm and shape board task ${item.id} for the GameSync project before it is executed.`,
    '',
    `Title: ${item.title}`,
    '',
    'Description:',
    item.body.trim(),
  ]
  const ids = extractReqIds(item.body)
  if (requirements && ids.length > 0) {
    lines.push('', 'Requirements this task must satisfy:')
    for (const id of ids) {
      const r = requirements.get(id)
      if (r) {
        lines.push(`- ${r.id} — ${r.title}: ${r.statement}`)
        for (const ac of r.acceptance) lines.push(`    AC: ${ac}`)
      } else {
        lines.push(`- ${id}: not found in docs/requirements`)
      }
    }
  }
  lines.push(
    '',
    'Use the superpowers brainstorming skill to turn this into a design, then writing-plans to produce an implementation plan.',
    'Write the spec under docs/specs/ and the plan under docs/plans/.',
    'When done, attach the plan to this board task: paste the plan into the task plan field, or set the plan field to the plan file path (e.g. docs/plans/<file>.md). The task can then move to Ready.',
  )
  return lines.join('\n')
}

export function buildRescanPrompt(): string {
  return [
    'You are working in the GameSync repository root.',
    'Reconcile project status against the living requirements. For EACH component',
    'that has a requirements doc at docs/requirements/components/<component>.md:',
    '1. Read the requirement doc — each "## <ID>: <title>" with its acceptance criteria.',
    '2. Inspect the component code and its tests to judge each requirement.',
    '3. Write project-board/data/status/<component>.md with this exact shape:',
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
    '- Write the "Note" column text in Vietnamese (keep State/Tested values and the table structure in English).',
    '- Only write files under project-board/data/status/. Do NOT run git and do',
    '  NOT commit — the dashboard reads these files from disk.',
    '',
    'After the table and Drift, also write a Vietnamese detail section so the board reads in Vietnamese:',
    '',
    '## Chi tiết (Tiếng Việt)',
    '',
    'For EACH requirement <ID> in this component, a block:',
    '### <ID>',
    'Mô tả: <the requirement statement, translated to Vietnamese>',
    'Tiêu chí chấp nhận:',
    '- <each acceptance criterion, translated to Vietnamese>',
    '',
    'Keep code tokens, file paths, identifiers, and `backtick` snippets unchanged inside the Vietnamese text; translate only the natural-language prose.',
  ].join('\n')
}
