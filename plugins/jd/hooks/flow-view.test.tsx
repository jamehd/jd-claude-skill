import { expect, test } from 'claude-code/testing'

const PANE = {
  plugin: 'jd',
  component: 'Pane',
  requestId: 'flow-view',
  props: {
    title: 'Feature flow',
    isFocused: false,
    bodyColumns: 70,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

const FILES: Record<string, string> = {
  'project-board/project.yaml': 'paths:\n  data: project-board/data\n  features: project-board/data/features\n  status: project-board/data/STATUS.md\n',
  'project-board/data/STATUS.md': [
    '# Status', '', '| Field | Value |', '|---|---|',
    '| Updated | 2026-11-24 |', '| Active feature | F-012 |', '| Current step | build task 3/7 |', '| Next | wait for AI |',
    '', '## Waiting for people', '', '| Item | Who | What is needed |', '|---|---|---|',
    '| OA-3 | owner | SMS provider key |',
    '', '## Log', '', '| Date | Event |', '|---|---|', '| 2026-11-24 | F-012 approved |',
  ].join('\n'),
  'project-board/data/features/F-012/feature.md':
    '---\nid: F-012\ntitle: "OTP login"\nstatus: building\norder: 1\nfeatureFixAttempts: 1\nfeatureFixLimit: 3\nreworkRound: 0\napprovedAt: 2026-11-24\n---\n',
  'project-board/data/features/F-013/feature.md':
    '---\nid: F-013\ntitle: "Profile page"\nstatus: brief-review\norder: 2\n---\n',
  'project-board/data/flow-events.jsonl': [
    '{"ts":"2026-11-24T08:00:00","feature":"F-012","phase":"brief","event":"start"}',
    '{"ts":"2026-11-24T08:20:00","feature":"F-012","phase":"brief","event":"wait"}',
    '{"ts":"2026-11-24T08:30:00","feature":"F-012","phase":"brief","event":"resume"}',
    '{"ts":"2026-11-24T08:31:00","feature":"F-012","phase":"build","event":"start","step":"build 1"}',
    '{"ts":"2026-11-24T08:35:00","feature":"F-012","phase":"build","event":"start","step":"build 3"}',
    '{"ts":"2026-11-24T08:45:00","feature":"F-012","phase":"build","event":"start","step":"build 4"}',
    '{"ts":"2026-11-24T08:58:00","feature":"F-012","phase":"build","event":"start","step":"T-001"}',
    '{"ts":"2026-11-24T09:15:00","feature":"F-012","phase":"build","event":"pass","step":"T-001"}',
    '{"ts":"2026-11-24T09:16:00","feature":"F-012","phase":"build","event":"start","step":"T-002"}',
    '{"ts":"2026-11-24T09:30:00","feature":"F-012","phase":"build","event":"fail","step":"T-002","note":"attempt 1/3"}',
    '{"ts":"2026-11-24T09:42:00","feature":"F-012","phase":"build","event":"pass","step":"T-002"}',
    '{"ts":"2026-11-24T09:43:00","feature":"F-012","phase":"build","event":"start","step":"build 6"}',
    '{"ts":"2026-11-24T09:50:00","feature":"F-012","phase":"verify","event":"start","step":"build 7"}',
    '{"ts":"2026-11-24T10:03:00","feature":"F-012","phase":"verify","event":"fail","step":"build 7","note":"S-04"}',
    '{"ts":"2026-11-24T10:15:00","feature":"F-012","phase":"verify","event":"start","step":"build 7"}',
  ].join('\n'),
}

const rel = (p: string) => {
  const n = p.replace(/\\/g, '/')
  const at = n.indexOf('project-board/')
  return at < 0 ? n : n.slice(at)
}

test('the pane draws stepper, timeline, waiting items and queue', async ($, on) => {
  on('command.register', () => ({ value: { command: 'flow' } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: new Date('2026-11-24T10:30:00').getTime() }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('fs.exists', (_, e) => ({
    value: rel(e.path) in FILES || ['project-board/data/features', 'project-board/data/features/F-012', 'project-board/data/features/F-013'].includes(rel(e.path)),
  }))
  on('fs.read', (_, e) => ({ value: FILES[rel(e.path)] ?? '' }))
  on('fs.list', () => ({
    value: [
      { name: 'F-012', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
      { name: 'F-013', kind: 'dir', size: 0, mtimeMs: 0, isLink: false },
    ],
  }))

  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /OTP login/ }))?.text).toContain('F-012')
  expect((await ui.find({ type: 'Text', text: /build task 3\/7/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /SMS provider key/ }))).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /F-013/ }))?.text).toContain('brief-review')
  expect((await ui.find({ type: 'Text', text: /▶/ }))).toBeTruthy()
  expect(await ui.find({ type: 'Text', text: /T-002✔/ })).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /^4 tests/ }))?.text).toContain('✔')
  expect((await ui.find({ type: 'Text', text: /^8 commit/ }))?.text).toContain('○')
  expect((await ui.find({ type: 'Text', text: /^Gate A/ }))?.text).toContain('approved')
  await ui.unmount()
})

const mountWith = async ($: any, on: any, files: Record<string, string>) => {
  on('command.register', () => ({ value: { command: 'flow' } }))
  on('session.start', (_: unknown, e: any) => ({ cwd: e.cwd }))
  on('clock.every', () => ({ value: undefined }))
  on('clock.now', () => ({ value: new Date('2026-11-24T10:30:00').getTime() }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.panes', () => ({ value: [] }))
  on('fs.exists', (_: unknown, e: any) => ({
    value: rel(e.path) in files || ['project-board/data/features', 'project-board/data/features/F-012'].includes(rel(e.path)),
  }))
  on('fs.read', (_: unknown, e: any) => ({ value: files[rel(e.path)] ?? '' }))
  on('fs.list', () => ({ value: [{ name: 'F-012', kind: 'dir', size: 0, mtimeMs: 0, isLink: false }] }))
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  return $.ui.mount({ ...PANE, surface: 'terminal' })
}

test('recent events are newest first, whatever order the file holds them in', async ($, on) => {
  const lines = (FILES['project-board/data/flow-events.jsonl'] ?? '').split('\n')
  const shuffled = [lines[14], ...lines.slice(0, 5), lines[12], ...lines.slice(5, 12), lines[13]].join('\n')
  const ui = await mountWith($, on, { ...FILES, 'project-board/data/flow-events.jsonl': shuffled })
  const rows = (await ui.findAll({ type: 'Text', text: /^11-24 \d\d:\d\d\s+\S/ })).map((r: { text?: string }) => (r.text ?? '').slice(6, 11))
  expect(rows).toEqual(['10:15', '10:03', '09:50', '09:43', '09:42', '09:30'])
  await ui.unmount()
})

test('without events the status log is shown newest first', async ($, on) => {
  const files = { ...FILES }
  delete files['project-board/data/flow-events.jsonl']
  files['project-board/data/STATUS.md'] = (files['project-board/data/STATUS.md'] ?? '').replace(
    '| 2026-11-24 | F-012 approved |',
    '| 2026-11-24 | F-012 approved |\n| 2026-11-20 | F-012 brief drafted |\n| 2026-11-25 | F-012 build started |',
  )
  const ui = await mountWith($, on, files)
  const rows = (await ui.findAll({ type: 'Text', text: /^2026-11-\d\d\s+\S/ })).map((r: { text?: string }) => (r.text ?? '').slice(0, 10))
  expect(rows).toEqual(['2026-11-25', '2026-11-24', '2026-11-20'])
  await ui.unmount()
})
