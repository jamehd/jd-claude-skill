import type { ConsoleEvent, NoteType } from '../../../ui/src/types.js'

const NOTE_TYPES: NoteType[] = ['user_message', 'steer', 'queued', 'error', 'info']

function preview(value: unknown, max: number): string {
  const s = typeof value === 'string' ? value : JSON.stringify(value) ?? ''
  return s.length > max ? s.slice(0, max) : s
}

export function normalizeLine(line: string): ConsoleEvent[] {
  let o: Record<string, unknown>
  try {
    o = JSON.parse(line) as Record<string, unknown>
  } catch {
    return [{ kind: 'raw', text: line }]
  }
  if (typeof o !== 'object' || o === null) return [{ kind: 'raw', text: line }]

  if (typeof o._board === 'string') {
    if (o._board === 'raw') return [{ kind: 'raw', text: String(o.text ?? '') }]
    const noteType = (NOTE_TYPES as string[]).includes(o._board) ? (o._board as NoteType) : 'info'
    return [{ kind: 'note', noteType, text: String(o.text ?? '') }]
  }

  const msg = (o.message ?? {}) as { content?: unknown }

  if (o.type === 'system' && o.subtype === 'init') {
    return [{ kind: 'init', sessionId: String(o.session_id ?? ''), model: String(o.model ?? '') }]
  }
  if (o.type === 'stream_event') {
    const ev = o.event as { type?: string; delta?: { type?: string; text?: string } } | undefined
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta') {
      return [{ kind: 'text_delta', text: ev.delta.text ?? '' }]
    }
    return []
  }
  if (o.type === 'assistant' && Array.isArray(msg.content)) {
    return (msg.content as Record<string, unknown>[])
      .filter((b) => b?.type === 'tool_use')
      .map((b) => ({
        kind: 'tool_start' as const,
        toolId: String(b.id ?? ''),
        tool: String(b.name ?? ''),
        inputPreview: preview(b.input, 200),
      }))
  }
  if (o.type === 'user' && Array.isArray(msg.content)) {
    return (msg.content as Record<string, unknown>[])
      .filter((b) => b?.type === 'tool_result')
      .map((b) => ({
        kind: 'tool_result' as const,
        toolId: String(b.tool_use_id ?? ''),
        output: preview(b.content, 4000),
        isError: Boolean(b.is_error),
      }))
  }
  if (o.type === 'rate_limit_event') {
    const info = (o.rate_limit_info ?? {}) as Record<string, unknown>
    return [{
      kind: 'rate_limit',
      status: String(info.status ?? 'unknown'),
      rateLimitType: String(info.rateLimitType ?? ''),
      resetsAt: typeof info.resetsAt === 'number' ? info.resetsAt : 0,
      isUsingOverage: Boolean(info.isUsingOverage),
    }]
  }
  if (o.type === 'result') {
    const u = (o.usage ?? undefined) as Record<string, unknown> | undefined
    const usage = u ? {
      inputTokens: Number(u.input_tokens ?? 0),
      outputTokens: Number(u.output_tokens ?? 0),
      cacheReadTokens: Number(u.cache_read_input_tokens ?? 0),
      cacheCreationTokens: Number(u.cache_creation_input_tokens ?? 0),
    } : undefined
    return [{
      kind: 'turn_result',
      ok: o.subtype === 'success',
      durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : undefined,
      costUsd: typeof o.total_cost_usd === 'number' ? o.total_cost_usd : undefined,
      usage,
    }]
  }
  return []
}
