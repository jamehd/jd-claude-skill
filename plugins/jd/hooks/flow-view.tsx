import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderChildren } from 'claude-code'

import type { FlowEvent, FlowFeature, FlowSnapshot } from '../types'

const PANE = 'flow-view'
const TITLE = 'Feature flow'
const POLL_MS = 2000
const FRAME_MS = 200
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const STAGES = ['idea', 'brief-review', 'building', 'acceptance', 'done'] as const
const STAGE_LABEL: Record<string, string> = {
  idea: 'idea',
  'brief-review': 'brief',
  building: 'build',
  acceptance: 'accept',
  done: 'done',
}
const PHASE_COLOR: Record<string, string> = {
  idea: 'gray',
  brief: 'cyan',
  'brief-review': 'cyan',
  build: 'yellow',
  building: 'yellow',
  verify: 'magenta',
  rework: 'yellowBright',
  acceptance: 'blue',
  done: 'green',
  stopped: 'red',
}
const EVENT_MARK: Record<string, [string, string]> = {
  start: ['▸', 'white'],
  pass: ['✔', 'green'],
  fail: ['✘', 'red'],
  wait: ['⏳', 'yellow'],
  resume: ['↻', 'cyan'],
  stop: ['■', 'red'],
  done: ['★', 'green'],
}

const EMPTY: FlowSnapshot = { found: false, waiting: [], log: [], features: [], events: [] }
const snapshot = atom({ plugin: 'jd', key: 'flowSnapshot' } as const, EMPTY, {
  shape: 'snapshot-2',
})
const frame = atom({ plugin: 'jd', key: 'flowFrame' } as const, 0)
const rootDir = atom({ plugin: 'jd', key: 'flowRoot' } as const, '')

const clean = (s: string | undefined) =>
  (s ?? '').trim().replace(/^["']|["']$/g, '').replace(/^<.*>$/, '')

const yamlValue = (yaml: string, key: string) => {
  const m = yaml.match(new RegExp(`^\\s+${key}:\\s*(\\S+)`, 'm'))
  return m ? clean(m[1]) : undefined
}

const tableField = (md: string, field: string) => {
  const m = md.match(new RegExp(`^\\|\\s*${field}\\s*\\|\\s*(.*?)\\s*\\|\\s*$`, 'mi'))
  const v = clean(m?.[1])
  return v && v.toLowerCase() !== 'none' ? v : undefined
}

const sectionRows = (md: string, heading: string) => {
  const start = md.search(new RegExp(`^##\\s+${heading}\\s*$`, 'mi'))
  if (start < 0) return []
  const body = md.slice(start).split(/\r?\n/).slice(1)
  const end = body.findIndex(l => l.startsWith('## '))
  return (end < 0 ? body : body.slice(0, end))
    .filter(l => l.trim().startsWith('|'))
    .slice(2)
    .map(l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => clean(c)))
    .filter(cells => cells.some(Boolean))
}

const frontmatter = (md: string) => {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  const out: Record<string, string> = {}
  for (const line of (m?.[1] ?? '').split(/\r?\n/)) {
    const kv = line.match(/^(\w+):\s*(.*)$/)
    if (kv?.[1]) out[kv[1]] = clean(kv[2])
  }
  return out
}

const num = (s: string | undefined) => (s && !Number.isNaN(Number(s)) ? Number(s) : undefined)

async function loadSnapshot($: EngineInterface, root: string): Promise<FlowSnapshot> {
  const at = (rel: string) => (root ? `${root}/${rel}` : rel)
  const base = { ...EMPTY, root: root || undefined }
  if (!(await $.fs.exists(at('project-board/project.yaml')))) return base
  try {
    const yaml: string = await $.fs.read(at('project-board/project.yaml'))
    const dataDir = yamlValue(yaml, 'data') ?? 'project-board/data'
    const statusPath = yamlValue(yaml, 'status') ?? `${dataDir}/STATUS.md`
    const featuresDir = yamlValue(yaml, 'features') ?? `${dataDir}/features`
    const reworkLimit = num(yamlValue(yaml, 'rework_rounds')) ?? 2

    const status: string = (await $.fs.exists(at(statusPath))) ? await $.fs.read(at(statusPath)) : ''

    const features: FlowFeature[] = []
    if (await $.fs.exists(at(featuresDir))) {
      for (const entry of await $.fs.list(at(featuresDir))) {
        if (entry.kind !== 'dir') continue
        const path = at(`${featuresDir}/${entry.name}/feature.md`)
        if (!(await $.fs.exists(path))) continue
        const fm = frontmatter(await $.fs.read(path))
        features.push({
          id: fm.id || entry.name,
          title: fm.title || entry.name,
          status: fm.status || 'idea',
          order: num(fm.order) ?? 999,
          created: fm.created || undefined,
          approvedAt: fm.approvedAt || undefined,
          fixAttempts: num(fm.featureFixAttempts),
          fixLimit: num(fm.featureFixLimit),
          reworkRound: num(fm.reworkRound),
        })
      }
    }
    features.sort((a, b) => a.order - b.order)

    const events: FlowEvent[] = []
    const eventsPath = at(`${dataDir}/flow-events.jsonl`)
    if (await $.fs.exists(eventsPath)) {
      for (const line of String(await $.fs.read(eventsPath)).split(/\r?\n/).slice(-500)) {
        if (!line.trim()) continue
        try {
          const ev = JSON.parse(line)
          if (ev && typeof ev.ts === 'string') events.push(ev)
        } catch {}
      }
    }

    return {
      ...base,
      found: true,
      reworkLimit,
      activeId: tableField(status, 'Active feature'),
      currentStep: tableField(status, 'Current step'),
      next: tableField(status, 'Next'),
      updated: tableField(status, 'Updated'),
      waiting: sectionRows(status, 'Waiting for people').map(([item, who, what]) => ({
        item: item ?? '',
        who: who ?? '',
        what: what ?? '',
      })),
      log: sectionRows(status, 'Log').map(([date, event]) => ({ date: date ?? '', event: event ?? '' })),
      features,
      events,
    }
  } catch (err) {
    return { ...base, found: true, error: String(err) }
  }
}

const duration = (ms: number) => {
  const m = Math.max(0, Math.round(ms / 60000))
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h}h${String(m % 60).padStart(2, '0')}m`
  return `${Math.floor(h / 24)}d${h % 24}h`
}

const hhmm = (t: number) => {
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const stamp = (ts: string) => {
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return ts
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${hhmm(d.getTime())}`
}

const clockOf = (ms: number) => {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0')
  const ss = String(sec % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

const meter = (used: number, limit: number) => {
  const ratio = limit > 0 ? used / limit : 0
  const color = ratio >= 1 ? 'red' : ratio >= 0.5 ? 'yellow' : 'green'
  return { filled: '▰'.repeat(Math.min(used, limit)), empty: '▱'.repeat(Math.max(0, limit - used)), color }
}

type RowKey = 'brief' | 'gateA' | 'setup' | 'plan' | 'tests' | 'implement' | 'review' | 'verify' | 'commit' | 'devenv' | 'report' | 'gateB' | 'done'

const ROADMAP: { key: RowKey; label: string; color: string }[] = [
  { key: 'brief', label: 'brief', color: 'cyan' },
  { key: 'gateA', label: 'Gate A', color: 'yellow' },
  { key: 'setup', label: '1-2 setup', color: 'yellow' },
  { key: 'plan', label: '3 plan', color: 'yellow' },
  { key: 'tests', label: '4 tests-first', color: 'yellow' },
  { key: 'implement', label: '5 implement', color: 'yellow' },
  { key: 'review', label: '6 review', color: 'magenta' },
  { key: 'verify', label: '7 verify', color: 'magenta' },
  { key: 'commit', label: '8 commit', color: 'yellow' },
  { key: 'devenv', label: '9 dev env', color: 'yellow' },
  { key: 'report', label: '10 report', color: 'yellow' },
  { key: 'gateB', label: 'Gate B', color: 'blue' },
  { key: 'done', label: 'done', color: 'green' },
]

const BUILD_STEP: Record<number, RowKey> = {
  1: 'setup',
  2: 'setup',
  3: 'plan',
  4: 'tests',
  5: 'implement',
  6: 'review',
  7: 'verify',
  8: 'commit',
  9: 'devenv',
  10: 'report',
  11: 'gateB',
}

type Row = {
  spans: { start: number; end: number }[]
  fails: number
  passes: number
  tasks: { id: string; fails: number; done: boolean }[]
  note?: string
  stopped?: boolean
}

type Roadmap = {
  rows: Record<RowKey, Row>
  current?: RowKey
  t0: number
  tEnd: number
  reworks: number
  finished: boolean
}

const rowFor = (ev: FlowEvent, current: RowKey | undefined): RowKey | undefined => {
  const step = ev.step ?? ''
  const n = step.match(/^build\s+(\d+)/i)
  if (ev.phase === 'brief') return ev.event === 'wait' || ev.event === 'resume' ? 'gateA' : 'brief'
  if (ev.phase === 'acceptance' || ev.phase === 'rework') return 'gateB'
  if (ev.phase === 'done') return 'done'
  if (ev.phase === 'verify') return 'verify'
  if (n) return BUILD_STEP[Number(n[1])] ?? current
  if (/^T-\d+/i.test(step)) return 'implement'
  return current
}

const roadmap = (events: FlowEvent[], now: number): Roadmap => {
  const rows = Object.fromEntries(
    ROADMAP.map(r => [r.key, { spans: [], fails: 0, passes: 0, tasks: [] }]),
  ) as unknown as Record<RowKey, Row>
  let current: RowKey | undefined
  let reworks = 0
  let finished = false
  let t0 = now
  let last = now
  for (const ev of events) {
    const t = new Date(ev.ts).getTime()
    if (Number.isNaN(t)) continue
    if (t < t0) t0 = t
    last = t
    const key = rowFor(ev, current)
    if (!key) continue
    if (key !== current) {
      const open = current ? rows[current].spans[rows[current].spans.length - 1] : undefined
      if (open) open.end = t
      rows[key].spans.push({ start: t, end: now })
      current = key
    }
    const row = rows[key]
    if (ev.phase === 'rework') reworks++
    if (ev.event === 'fail') row.fails++
    if (ev.event === 'pass' || ev.event === 'resume') row.passes++
    if (ev.event === 'stop') row.stopped = true
    if (ev.note) row.note = ev.note
    const task = (ev.step ?? '').match(/^(T-\d+)/i)?.[1]
    if (task) {
      let entry = row.tasks.find(x => x.id === task)
      if (!entry) {
        entry = { id: task, fails: 0, done: false }
        row.tasks.push(entry)
      }
      if (ev.event === 'fail') entry.fails++
      if (ev.event === 'pass') entry.done = true
    }
    if (ev.event === 'done' || ev.phase === 'done') finished = true
  }
  const stoppedHere = current ? Boolean(rows[current].stopped) : false
  const open = current ? rows[current].spans[rows[current].spans.length - 1] : undefined
  if (open && (finished || stoppedHere)) open.end = last
  return { rows, current, t0, tEnd: finished || stoppedHere ? last : now, reworks, finished }
}

const statusLine = (s: FlowSnapshot) => {
  if (!s.found) return undefined
  const active = s.features.find(f => f.id === s.activeId)
  if (!active) return s.next ? `flow · idle · next: ${s.next}` : 'flow · idle'
  const parts = [active.id, active.status]
  if (s.currentStep) parts.push(s.currentStep)
  if (s.waiting.length) parts.push(`⏳ ${s.waiting.length}`)
  return `flow · ${parts.join(' · ')}`
}

let lastJson = ''
let paneOpen = false

async function tick($: EngineInterface) {
  if (!paneOpen) return
  await update($, frame, n => (n + 1) % 1_000_000)
}

async function refresh($: EngineInterface) {
  const next = await loadSnapshot($, await read($, rootDir))
  const json = JSON.stringify(next)
  if (json === lastJson) return
  lastJson = json
  await update($, snapshot, () => next)
  await $.ui.status(statusLine(next))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'flow',
      description: 'Toggle the feature-flow pane; /flow <repo path> watches another repository',
      argumentHint: '[repo path]',
    })
    await refresh($)
    $.clock.every(POLL_MS, () => refresh($))
    $.clock.every(FRAME_MS, () => tick($))
    paneOpen = (await $.ui.panes()).some(p => p.id === PANE)
    return next(e)
  })

  on('command.run', { command: 'flow' }, async ($, e) => {
    const arg = e.args.trim().replace(/^["']|["']$/g, '')
    const isUp = (await $.ui.panes()).some(p => p.id === PANE)
    if (!arg && isUp) {
      paneOpen = false
      await $.ui.close({ id: PANE })
      return { text: 'Feature-flow pane closed.' }
    }
    if (arg) await update($, rootDir, () => (arg === '.' ? '' : arg.replace(/\\/g, '/').replace(/\/+$/, '')))
    lastJson = ''
    await refresh($)
    const opened = await $.ui.open({ id: PANE, title: TITLE })
    paneOpen = true
    const where = (await read($, rootDir)) || 'the working directory'
    return {
      text: opened.isPlaced
        ? `Feature-flow pane watching ${where}. Type /flow to close it.`
        : `Feature-flow pane waits for a wider terminal (${opened.reason}).`,
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE) paneOpen = false
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const s = await read($, snapshot)
    const width = Math.max(34, (e.props.bodyColumns ?? 60) - 2)
    const now = await $.clock.now()
    const f = await read($, frame)
    const spin = SPIN[f % SPIN.length]

    const Card = (props: { title: string; color?: string; aside?: string; children?: RenderChildren }) => (
      <Box flexDirection="column" borderStyle="round" borderColor={props.color ?? 'gray'} paddingX={1}>
        <Text bold color={props.color}>
          {props.title}
          {props.aside ? <Text dimColor> · {props.aside}</Text> : ''}
        </Text>
        {props.children}
      </Box>
    )

    if (!s.found) {
      return (
        <Card title="No feature flow here">
          <Text dimColor>No project-board/project.yaml in {s.root ?? 'this directory'}.</Text>
          <Text dimColor>Open a repository that runs jd:feature-flow, or type /flow &lt;repo path&gt;.</Text>
        </Card>
      )
    }
    if (s.error) return <Text color="red">Cannot read flow files: {s.error}</Text>

    const active = s.features.find(f => f.id === s.activeId)
    const stageIdx = active ? STAGES.indexOf(active.status as (typeof STAGES)[number]) : -1
    const isStopped = active?.status === 'stopped'
    const badgeColor = PHASE_COLOR[active?.status ?? ''] ?? 'gray'

    const featureEvents = s.events.filter(ev => !active || !ev.feature || ev.feature === active.id)
    const map = roadmap(featureEvents, now)
    const t0 = map.t0
    const tEnd = map.tEnd
    const span = Math.max(1, tEnd - t0)
    const labelW = 14
    const sideW = 28
    const barW = Math.max(10, width - labelW - sideW)
    const hasEvents = featureEvents.length > 0
    const currentIdx = ROADMAP.findIndex(r => r.key === map.current)
    const liveRow = map.current && !map.finished ? map.rows[map.current] : undefined
    const liveSince = liveRow && !liveRow.stopped ? liveRow.spans[liveRow.spans.length - 1]?.start : undefined

    const fix = meter(active?.fixAttempts ?? 0, active?.fixLimit ?? 3)
    const rework = meter(active?.reworkRound ?? 0, s.reworkLimit ?? 2)

    const header = active ? (
      <Card title={`${active.id}  ${active.title}`} color={isStopped ? 'red' : badgeColor}>
        <Text>
          <Text inverse bold color={badgeColor}>
            {' '}
            {isStopped || active.status === 'done' ? '' : `${spin} `}
            {active.status.toUpperCase()}{' '}
          </Text>
          {hasEvents ? <Text dimColor>  {map.finished ? 'took' : 'running'} {duration(tEnd - t0)}</Text> : ''}
        </Text>
        {isStopped ? (
          <Text color="red" bold>■ Stopped: read the stop report in STATUS.md</Text>
        ) : (
          <Text>
            {STAGES.map((stage, i) => {
              const done = stageIdx > i || active.status === 'done'
              const current = stageIdx === i && active.status !== 'done'
              const color = done ? 'green' : current ? (PHASE_COLOR[stage] ?? 'yellow') : 'gray'
              return (
                <Text>
                  <Text color={color} bold={current}>
                    {done ? '●' : current ? '◉' : '○'} {STAGE_LABEL[stage]}
                  </Text>
                  {i < STAGES.length - 1 ? <Text color={done ? 'green' : 'gray'}> ━━ </Text> : ''}
                </Text>
              )
            })}
          </Text>
        )}
        {s.currentStep && (
          <Text>
            <Text dimColor>Step    </Text>
            <Text color="yellow">{isStopped ? '■' : spin} </Text>
            <Text color="yellow" bold>{s.currentStep}</Text>
            {liveSince !== undefined ? <Text dimColor>  {clockOf(now - liveSince)}</Text> : ''}
          </Text>
        )}
        <Text>
          <Text dimColor>Fixes   </Text>
          <Text color={fix.color}>{fix.filled}</Text>
          <Text dimColor>{fix.empty}</Text> {active.fixAttempts ?? 0}/{active.fixLimit ?? 3}
          <Text dimColor>   Rework </Text>
          <Text color={rework.color}>{rework.filled}</Text>
          <Text dimColor>{rework.empty}</Text> {active.reworkRound ?? 0}/{s.reworkLimit ?? 2}
        </Text>
        {active.approvedAt && (
          <Text>
            <Text dimColor>Gate A  </Text>
            <Text color="green">✔ approved {active.approvedAt}</Text>
          </Text>
        )}
        {s.next && (
          <Text>
            <Text dimColor>Next    </Text>
            <Text color="cyan">{s.next}</Text>
          </Text>
        )}
      </Card>
    ) : (
      <Card title="No active feature" aside={s.next ? `next: ${s.next}` : undefined}>
        <Text dimColor>The queue below shows what comes next.</Text>
      </Card>
    )

    const rowDetail = (key: RowKey, row: Row): [string, string] => {
      if (key === 'implement' && row.tasks.length) {
        const list = row.tasks
          .map(t => `${t.id}${t.done ? '✔' : t.fails ? `✘${t.fails}` : '▸'}`)
          .join(' ')
        return [list, row.fails ? 'yellow' : 'green']
      }
      if (key === 'gateA') return row.passes ? ['approved', 'green'] : ['waiting for owner', 'yellow']
      if (key === 'gateB') {
        const r = map.reworks ? ` · rework ${map.reworks}` : ''
        return map.finished ? [`accepted${r}`, 'green'] : [`waiting for verdict${r}`, 'yellow']
      }
      if (row.stopped) return [`stopped ${row.note ?? ''}`.trim(), 'red']
      if (row.fails) return [`✘${row.fails} ${row.note ?? ''}`.trim(), 'red']
      return ['', 'white']
    }

    const timeline = (
      <Card
        title="Timeline"
        aside={hasEvents ? `${hhmm(t0)} → ${map.finished ? hhmm(tEnd) : 'now'} · ${duration(tEnd - t0)}` : undefined}
      >
        {!hasEvents && <Text dimColor>No flow-events.jsonl yet; tools/flow-event writes it at each step.</Text>}
        {hasEvents &&
          ROADMAP.map((def, i) => {
            const row = map.rows[def.key]
            if (row.spans.length === 0) {
              return (
                <Text dimColor>
                  {def.label.padEnd(labelW)}
                  {i < currentIdx ? '– skipped' : '○'}
                </Text>
              )
            }
            const isLive = def.key === map.current && !map.finished && !row.stopped
            const cells = Array.from({ length: barW }, () => '·')
            for (const sp of row.spans) {
              const from = Math.min(barW - 1, Math.floor(((sp.start - t0) / span) * barW))
              const to = Math.min(barW, Math.max(from + 1, Math.round(((sp.end - t0) / span) * barW)))
              for (let c = from; c < to; c++) cells[c] = '█'
            }
            if (isLive) {
              const lastSpan = row.spans[row.spans.length - 1]!
              const from = Math.min(barW - 1, Math.floor(((lastSpan.start - t0) / span) * barW))
              const len = barW - from
              if (len > 2) {
                const glow = from + (f % (len - 1))
                cells[glow] = '▓'
                if (glow > from) cells[glow - 1] = '▒'
              }
              cells[barW - 1] = f % 4 < 2 ? '▶' : '▷'
            }
            const bar = cells.join('')
            const lead = bar.match(/^·*/)?.[0] ?? ''
            const tail = bar.slice(lead.length).match(/·*$/)?.[0] ?? ''
            const body = bar.slice(lead.length, bar.length - tail.length)
            const total = row.spans.reduce((sum, sp) => sum + (sp.end - sp.start), 0)
            const [detail, detailColor] = rowDetail(def.key, row)
            const failedOnly = row.fails > 0 && row.passes === 0 && !isLive
            const mark = row.stopped ? '■' : isLive ? spin : failedOnly ? '✘' : '✔'
            const markColor = row.stopped || failedOnly ? 'red' : isLive ? def.color : 'green'
            const first = row.spans[0]
            const when = def.key === 'done' && first ? hhmm(first.start) : isLive ? clockOf(total) : duration(total)
            return (
              <Text wrap="truncate-end">
                <Text color={isLive ? def.color : undefined} bold={isLive}>
                  {def.label.padEnd(labelW)}
                </Text>
                <Text dimColor>{lead}</Text>
                <Text color={def.color}>{body}</Text>
                <Text dimColor>{tail}</Text>
                <Text bold={isLive} color={isLive ? def.color : undefined}> {when.padStart(5)}</Text>
                <Text color={markColor}> {mark}</Text>
                {detail ? <Text color={detailColor}> {detail}</Text> : ''}
              </Text>
            )
          })}
      </Card>
    )

    const recent = featureEvents.length
      ? featureEvents.slice(-6).map(ev => ({
          when: stamp(ev.ts),
          mark: EVENT_MARK[ev.event ?? ''] ?? ['•', 'white'],
          what: [ev.phase, ev.step].filter(Boolean).join(' · '),
          note: ev.note,
        }))
      : s.log.slice(-6).map(row => ({ when: row.date, mark: ['•', 'white'] as [string, string], what: row.event, note: undefined }))

    const queue = s.features.filter(f => f.status !== 'done' && f.id !== active?.id).slice(0, 5)
    const doneCount = s.features.filter(f => f.status === 'done').length

    return (
      <Box flexDirection="column">
        {header}
        {timeline}
        {s.waiting.length > 0 && (
          <Card title={`Waiting for people (${s.waiting.length})`} color="yellow">
            {s.waiting.map(w => (
              <Text wrap="truncate-end">
                <Text color="yellow">⏳ {w.item}</Text>
                <Text dimColor> {w.who} · </Text>
                {w.what}
              </Text>
            ))}
          </Card>
        )}
        <Card title="Recent">
          {recent.length === 0 && <Text dimColor>Nothing logged yet.</Text>}
          {recent.map(r => (
            <Text wrap="truncate-end">
              <Text dimColor>{r.when.padEnd(12)}</Text>
              <Text color={r.mark[1]}>{r.mark[0]} </Text>
              {r.what}
              {r.note ? <Text dimColor> ({r.note})</Text> : ''}
            </Text>
          ))}
        </Card>
        <Card title="Queue" aside={`${doneCount} done`}>
          {queue.length === 0 && <Text dimColor>Empty.</Text>}
          {queue.map((f, i) => (
            <Text wrap="truncate-end">
              <Text dimColor>{i + 1}. </Text>
              <Text color={PHASE_COLOR[f.status] ?? 'gray'}>●</Text> {f.id} {f.title}
              <Text dimColor> {f.status}</Text>
            </Text>
          ))}
        </Card>
        <Text dimColor>
          {' '}Updated {s.updated ?? '—'}{s.root ? ` · ${s.root}` : ''} · /flow closes
        </Text>
      </Box>
    )
  })
}
