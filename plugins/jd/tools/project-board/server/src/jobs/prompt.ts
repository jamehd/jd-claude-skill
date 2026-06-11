import { serializeItem } from '../markdown.js'
import type { BoardItem } from '../../../ui/src/types.js'
import { extractReqIds, type Requirement } from './requirements.js'

export function buildTaskPrompt(item: BoardItem, requirements?: Map<string, Requirement>): string {
  const lines = [
    `You are working in a dedicated git worktree on branch board/${item.id} of the GameSync repo.`,
    'Implement the following item. Follow the conventions in CLAUDE.md (English code/docs, error standard, tests).',
    '',
    '--- ITEM FILE ---',
    serializeItem(item),
    '--- END ITEM FILE ---',
    '',
    'You MUST finish by doing ALL of the following:',
    '1. Implement the item and run the tests relevant to your change.',
    '2. Commit every change to the current branch with clear conventional-commit messages.',
    '3. End your final output with a short summary of what you did and the test results.',
    '4. Do NOT modify anything under project-board/data/ — task state is managed by the dashboard.',
    '5. Do not push, do not merge, do not touch branches other than the current one.',
  ]

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
    '- Only write files under project-board/data/status/. Do NOT run git and do',
    '  NOT commit — the dashboard reads these files from disk.',
  ].join('\n')
}
