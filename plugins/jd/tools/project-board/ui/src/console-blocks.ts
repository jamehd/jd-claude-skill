import type { ConsoleEvent, NoteType } from './types.js'

export const NOTE_LABEL: Record<NoteType, string> = {
  user_message: 'Bạn', steer: 'Ngắt & chỉ đạo', queued: 'Đã xếp hàng', error: 'Lỗi', info: 'Hệ thống',
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'tool'; toolId: string; tool: string; inputPreview: string; output?: string; isError?: boolean }
  | { type: 'system'; text: string; tone: 'muted' | 'danger' | 'user' }

export type ToolBlock = Extract<Block, { type: 'tool' }>

// Folds a single event into `blocks`, MUTATING it. `toolIndex` maps toolId →
// its tool block for O(1) tool_result attachment (replaces the O(n) reverse-find).
export function foldEvent(blocks: Block[], toolIndex: Map<string, ToolBlock>, e: ConsoleEvent): void {
  if (e.kind === 'text_delta') {
    const last = blocks[blocks.length - 1]
    if (last?.type === 'text') last.text += e.text
    else blocks.push({ type: 'text', text: e.text })
  } else if (e.kind === 'tool_start') {
    const card: ToolBlock = { type: 'tool', toolId: e.toolId, tool: e.tool, inputPreview: e.inputPreview }
    blocks.push(card)
    toolIndex.set(e.toolId, card)
  } else if (e.kind === 'tool_result') {
    const card = toolIndex.get(e.toolId)
    if (card) { card.output = e.output; card.isError = e.isError }
  } else if (e.kind === 'note') {
    blocks.push({ type: 'system', text: `${NOTE_LABEL[e.noteType]}: ${e.text}`,
      tone: e.noteType === 'error' ? 'danger' : e.noteType === 'user_message' ? 'user' : 'muted' })
  } else if (e.kind === 'init') {
    blocks.push({ type: 'system', text: `Phiên ${e.sessionId.slice(0, 8)} · ${e.model}`, tone: 'muted' })
  } else if (e.kind === 'turn_result') {
    const cost = e.costUsd != null ? ` · $${e.costUsd.toFixed(4)}` : ''
    const dur = e.durationMs != null ? ` · ${(e.durationMs / 1000).toFixed(1)}s` : ''
    blocks.push({ type: 'system', text: `Kết thúc lượt (${e.ok ? 'ok' : 'lỗi'})${dur}${cost}`, tone: e.ok ? 'muted' : 'danger' })
  } else if (e.kind === 'raw') {
    blocks.push({ type: 'system', text: e.text, tone: 'muted' })
  }
}

// Thin wrapper: folds a whole event list into a fresh array. Used for seeding
// from history so the folding logic lives in exactly one place (foldEvent).
export function reduceEvents(events: ConsoleEvent[]): Block[] {
  const blocks: Block[] = []
  const toolIndex = new Map<string, ToolBlock>()
  for (const e of events) foldEvent(blocks, toolIndex, e)
  return blocks
}
