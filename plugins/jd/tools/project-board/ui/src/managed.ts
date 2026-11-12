import type { BoardItem } from './types.js'

export function isDraggable(item: Pick<BoardItem, 'status' | 'managed'>): boolean {
  return !item.managed && item.status !== 'ai_running' && item.status !== 'pr'
}
