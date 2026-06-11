import { serializeItem } from '../markdown.js'
import type { BoardItem } from '../../../ui/src/types.js'

export function buildTaskPrompt(item: BoardItem): string {
  return [
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
  ].join('\n')
}

export function buildRescanPrompt(): string {
  return [
    'You are working in a dedicated git worktree of the GameSync repo.',
    'Survey the whole repository and refresh the project status files under project-board/data/status/.',
    'For each component (idc-backend, admin-web, cafe-service, launcher-downloader, launcher-user, launcher-packer, infra):',
    '- assess implementation completeness (features done / partial / missing, test coverage, TODO markers)',
    '- rewrite project-board/data/status/<component>.md keeping the frontmatter schema:',
    '  component, completion (integer percent), last_scanned (today, YYYY-MM-DD), then a summary paragraph and a "## Gaps" checklist.',
    'Only modify files under project-board/data/status/. Commit the result to the current branch.',
  ].join('\n')
}
