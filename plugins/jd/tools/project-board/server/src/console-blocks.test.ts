import { describe, expect, it } from 'vitest'
import { NOTE_LABEL, foldEvent, reduceEvents } from '../../ui/src/console-blocks.js'
import type { Block, ToolBlock } from '../../ui/src/console-blocks.js'
import type { ConsoleEvent } from '../../ui/src/types.js'

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function fresh(): { blocks: Block[]; index: Map<string, ToolBlock> } {
  return { blocks: [], index: new Map() }
}

function fold(events: ConsoleEvent[]): Block[] {
  const { blocks, index } = fresh()
  for (const e of events) foldEvent(blocks, index, e)
  return blocks
}

// ---------------------------------------------------------------------------
// text_delta
// ---------------------------------------------------------------------------

describe('text_delta', () => {
  it('consecutive deltas merge into ONE text block', () => {
    const blocks = fold([
      { kind: 'text_delta', text: 'Hello' },
      { kind: 'text_delta', text: ', ' },
      { kind: 'text_delta', text: 'world' },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'text', text: 'Hello, world' })
  })

  it('text_delta after a tool card starts a NEW text block', () => {
    const blocks = fold([
      { kind: 'text_delta', text: 'before' },
      { kind: 'tool_start', toolId: 't1', tool: 'Read', inputPreview: 'foo.ts' },
      { kind: 'text_delta', text: 'after' },
    ])
    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({ type: 'text', text: 'before' })
    expect(blocks[1]).toMatchObject({ type: 'tool' })
    expect(blocks[2]).toMatchObject({ type: 'text', text: 'after' })
  })
})

// ---------------------------------------------------------------------------
// tool_start / tool_result
// ---------------------------------------------------------------------------

describe('tool cards', () => {
  it('tool_start pushes a card with the correct fields', () => {
    const blocks = fold([
      { kind: 'tool_start', toolId: 'tid-1', tool: 'Bash', inputPreview: 'ls /' },
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'tool', toolId: 'tid-1', tool: 'Bash', inputPreview: 'ls /' })
  })

  it('tool_result attaches output+isError to the matching card (O(1) index path)', () => {
    const { blocks, index } = fresh()
    foldEvent(blocks, index, { kind: 'tool_start', toolId: 'tid-2', tool: 'Read', inputPreview: 'x.ts' })
    foldEvent(blocks, index, { kind: 'tool_result', toolId: 'tid-2', output: 'content', isError: false })

    const card = blocks[0] as ToolBlock
    expect(card.output).toBe('content')
    expect(card.isError).toBe(false)
  })

  it('tool_result with isError=true marks the card', () => {
    const { blocks, index } = fresh()
    foldEvent(blocks, index, { kind: 'tool_start', toolId: 'tid-3', tool: 'Bash', inputPreview: 'bad' })
    foldEvent(blocks, index, { kind: 'tool_result', toolId: 'tid-3', output: 'error output', isError: true })

    const card = blocks[0] as ToolBlock
    expect(card.isError).toBe(true)
    expect(card.output).toBe('error output')
  })

  it('tool_result with unknown toolId is a no-op — no crash, no new block', () => {
    const { blocks, index } = fresh()
    foldEvent(blocks, index, { kind: 'tool_result', toolId: 'ghost', output: 'x', isError: false })
    expect(blocks).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// note events
// ---------------------------------------------------------------------------

describe('note events', () => {
  it('error noteType → danger tone with Vietnamese label prefix', () => {
    const blocks = fold([{ kind: 'note', noteType: 'error', text: 'something went wrong' }])
    expect(blocks).toHaveLength(1)
    const b = blocks[0]
    expect(b).toMatchObject({ type: 'system', tone: 'danger' })
    expect((b as Extract<Block, { type: 'system' }>).text).toBe(`${NOTE_LABEL.error}: something went wrong`)
  })

  it('user_message noteType → user tone', () => {
    const blocks = fold([{ kind: 'note', noteType: 'user_message', text: 'hello' }])
    expect(blocks[0]).toMatchObject({ type: 'system', tone: 'user' })
    expect((blocks[0] as Extract<Block, { type: 'system' }>).text).toContain(NOTE_LABEL.user_message)
  })

  it('steer, queued, info noteTypes → muted tone', () => {
    for (const noteType of ['steer', 'queued', 'info'] as const) {
      const blocks = fold([{ kind: 'note', noteType, text: 'msg' }])
      expect(blocks[0]).toMatchObject({ type: 'system', tone: 'muted' })
      expect((blocks[0] as Extract<Block, { type: 'system' }>).text).toContain(NOTE_LABEL[noteType])
    }
  })
})

// ---------------------------------------------------------------------------
// init + turn_result
// ---------------------------------------------------------------------------

describe('init', () => {
  it('renders a muted system line with truncated sessionId and model', () => {
    const blocks = fold([{ kind: 'init', sessionId: 'abcdef123456', model: 'claude-opus' }])
    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({ type: 'system', tone: 'muted' })
    expect((blocks[0] as Extract<Block, { type: 'system' }>).text).toContain('abcdef12')
    expect((blocks[0] as Extract<Block, { type: 'system' }>).text).toContain('claude-opus')
  })
})

describe('turn_result', () => {
  it('ok=true → muted tone with duration and cost', () => {
    const blocks = fold([{ kind: 'turn_result', ok: true, durationMs: 2500, costUsd: 0.00123 }])
    expect(blocks[0]).toMatchObject({ type: 'system', tone: 'muted' })
    const text = (blocks[0] as Extract<Block, { type: 'system' }>).text
    expect(text).toContain('ok')
    expect(text).toContain('2.5s')
    expect(text).toContain('$0.0012')
  })

  it('ok=false → danger tone', () => {
    const blocks = fold([{ kind: 'turn_result', ok: false }])
    expect(blocks[0]).toMatchObject({ type: 'system', tone: 'danger' })
    const text = (blocks[0] as Extract<Block, { type: 'system' }>).text
    expect(text).toContain('lỗi')
  })

  it('omits duration/cost lines when fields are absent', () => {
    const blocks = fold([{ kind: 'turn_result', ok: true }])
    const text = (blocks[0] as Extract<Block, { type: 'system' }>).text
    expect(text).not.toContain('s')
    expect(text).not.toContain('$')
  })
})

// ---------------------------------------------------------------------------
// raw
// ---------------------------------------------------------------------------

describe('raw', () => {
  it('maps to a muted system line verbatim', () => {
    const blocks = fold([{ kind: 'raw', text: 'some raw text' }])
    expect(blocks[0]).toMatchObject({ type: 'system', tone: 'muted', text: 'some raw text' })
  })
})

// ---------------------------------------------------------------------------
// reduceEvents parity
// ---------------------------------------------------------------------------

describe('reduceEvents parity', () => {
  it('equals folding events one-by-one — determinism check', () => {
    const history: ConsoleEvent[] = [
      { kind: 'init', sessionId: 'sess-abc-123', model: 'test-model' },
      { kind: 'text_delta', text: 'Part 1 ' },
      { kind: 'text_delta', text: 'Part 2' },
      { kind: 'tool_start', toolId: 'x1', tool: 'Read', inputPreview: 'file.ts' },
      { kind: 'tool_result', toolId: 'x1', output: 'file contents', isError: false },
      { kind: 'text_delta', text: 'after tool' },
      { kind: 'note', noteType: 'info', text: 'done' },
      { kind: 'turn_result', ok: true, durationMs: 1000, costUsd: 0.001 },
    ]

    const viaReduce = reduceEvents(history)
    const viaOneByOne = fold(history)

    expect(viaReduce).toEqual(viaOneByOne)
  })

  it('empty history → empty blocks array', () => {
    expect(reduceEvents([])).toEqual([])
  })
})
