import { describe, it, expect } from 'vitest'
import { normalizeLine } from './jobs/events.js'

describe('normalizeLine', () => {
  it('maps system init', () => {
    expect(normalizeLine(JSON.stringify({ type: 'system', subtype: 'init', session_id: 's-1', model: 'claude-x' })))
      .toEqual([{ kind: 'init', sessionId: 's-1', model: 'claude-x' }])
  })
  it('maps text deltas from stream events', () => {
    expect(normalizeLine(JSON.stringify({
      type: 'stream_event',
      event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'hello' } },
    }))).toEqual([{ kind: 'text_delta', text: 'hello' }])
  })
  it('ignores non-text stream events', () => {
    expect(normalizeLine(JSON.stringify({ type: 'stream_event', event: { type: 'message_start' } }))).toEqual([])
  })
  it('maps every tool_use block in an assistant message', () => {
    const events = normalizeLine(JSON.stringify({
      type: 'assistant',
      message: { content: [
        { type: 'text', text: 'running' },
        { type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } },
        { type: 'tool_use', id: 't2', name: 'Read', input: { file_path: '/x' } },
      ] },
    }))
    expect(events).toHaveLength(2)
    expect(events[0]).toMatchObject({ kind: 'tool_start', toolId: 't1', tool: 'Bash' })
    expect(events[1]).toMatchObject({ kind: 'tool_start', toolId: 't2', tool: 'Read' })
  })
  it('maps tool results from user messages', () => {
    expect(normalizeLine(JSON.stringify({
      type: 'user',
      message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok', is_error: false }] },
    }))).toEqual([{ kind: 'tool_result', toolId: 't1', output: 'ok', isError: false }])
  })
  it('maps result events', () => {
    expect(normalizeLine(JSON.stringify({ type: 'result', subtype: 'success', duration_ms: 1200, total_cost_usd: 0.05 })))
      .toEqual([{ kind: 'turn_result', ok: true, durationMs: 1200, costUsd: 0.05 }])
  })
  it('maps board note lines and raw board lines', () => {
    expect(normalizeLine(JSON.stringify({ _board: 'user_message', text: 'do X' })))
      .toEqual([{ kind: 'note', noteType: 'user_message', text: 'do X' }])
    expect(normalizeLine(JSON.stringify({ _board: 'raw', text: 'stderr junk' })))
      .toEqual([{ kind: 'raw', text: 'stderr junk' }])
  })
  it('falls back to raw for unparseable lines and never throws', () => {
    expect(normalizeLine('not json at all')).toEqual([{ kind: 'raw', text: 'not json at all' }])
    expect(normalizeLine(JSON.stringify({ type: 'mystery' }))).toEqual([])
  })
  it('truncates oversized tool previews/outputs', () => {
    const big = 'x'.repeat(10_000)
    const [start] = normalizeLine(JSON.stringify({
      type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Bash', input: { c: big } }] },
    }))
    expect((start as { inputPreview: string }).inputPreview.length).toBeLessThanOrEqual(200)
    const [res] = normalizeLine(JSON.stringify({
      type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't', content: big, is_error: true }] },
    }))
    expect((res as { output: string }).output.length).toBeLessThanOrEqual(4000)
    expect((res as { isError: boolean }).isError).toBe(true)
  })
})
