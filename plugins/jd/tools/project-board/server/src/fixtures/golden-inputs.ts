import type { BoardItem } from '../../../ui/src/types.js'
import type { Requirement } from '../jobs/requirements.js'
import type { StatusDoc } from '../jobs/candidates.js'

export function goldenItem(extra: Partial<BoardItem> = {}): BoardItem {
  return {
    id: 'TASK-007', type: 'task', title: 'Serve theme over gRPC', status: 'ready', priority: 'P2',
    component: 'cafe-service', created: '2026-06-11', updated: '2026-06-12',
    body: 'Implement the theme RPC.\n\nReq: CAFE-R3\nReq: CAFE-R99\n', ...extra,
  }
}

export const GOLDEN_REQS = new Map<string, Requirement>([
  ['CAFE-R3', { id: 'CAFE-R3', title: 'GetTheme RPC', statement: 'Serves theme over gRPC.', acceptance: ['theme < 1s', 'tests both paths'] }],
])

export const GOLDEN_PLAN = '# Plan\n\n1. Add the RPC.\n2. Test it.\n'

export const GOLDEN_STATUS_DOCS: StatusDoc[] = [{
  component: 'cafe-service',
  rows: [
    { id: 'CAFE-R3', state: 'missing', tested: false, note: 'nothing yet' },
    { id: 'CAFE-R4', state: 'partial', tested: false, note: 'half done' },
    { id: 'CAFE-R5', state: 'done', tested: false, note: '' },
  ],
  details: { 'CAFE-R4': { statement: 'Phân tích manifest v2.', acceptance: ['chỉ tải chunk đổi'] } },
}]

export const GOLDEN_REQ_INDEX = new Map<string, Requirement>([
  ...GOLDEN_REQS,
  ['CAFE-R4', { id: 'CAFE-R4', title: 'Manifest', statement: 'Parse manifest v2.', acceptance: ['delta only'] }],
  ['CAFE-R5', { id: 'CAFE-R5', title: 'Cache', statement: 'Cache chunks.', acceptance: [] }],
])
