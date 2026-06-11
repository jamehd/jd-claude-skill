// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useBoard } from '../../ui/src/useBoard.js'

const sockets: FakeWS[] = []

class FakeWS {
  static OPEN = 1
  onmessage: ((ev: { data: string }) => void) | null = null
  onclose: ((ev: { code: number }) => void) | null = null
  readyState = FakeWS.OPEN
  constructor(public url: string) {
    sockets.push(this)
  }
  close() {}
  send() {}
}

beforeEach(() => {
  sockets.length = 0
  globalThis.fetch = vi.fn(
    async () =>
      new Response(JSON.stringify({ items: [], invalid: [], components: [], jobs: [] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
  ) as unknown as typeof fetch
  globalThis.WebSocket = FakeWS as unknown as typeof WebSocket
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('useBoard', () => {
  it('does not refetch or reconnect when the callback prop identity changes', async () => {
    const { rerender } = renderHook(({ cb }) => useBoard(cb), { initialProps: { cb: () => {} } })
    await act(async () => {}) // let mount effect settle
    const fetchesAfterMount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
    const socketsAfterMount = sockets.length
    rerender({ cb: () => {} }) // new identity, like an inline arrow
    rerender({ cb: () => {} })
    await act(async () => {})
    expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchesAfterMount)
    expect(sockets.length).toBe(socketsAfterMount)
  })
})
