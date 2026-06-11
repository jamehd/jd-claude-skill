import { useCallback, useEffect, useRef, useState } from 'react'
import { api, UnauthorizedError } from './api.js'
import type { BoardSnapshot, WsMessage } from './types.js'

export function useBoard(onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [logLines, setLogLines] = useState<Record<string, string>>({})
  const wsRef = useRef<WebSocket | null>(null)

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.board())
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthorized()
    }
  }, [onUnauthorized])

  useEffect(() => {
    void refresh()
    let closed = false
    let timer: ReturnType<typeof setTimeout> | undefined
    function connect() {
      if (closed) return
      const ws = new WebSocket(`ws://${location.host}/ws`)
      wsRef.current = ws
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data) as WsMessage
        if (msg.type === 'board_update') void refresh()
        if (msg.type === 'job_log') {
          setLogLines((prev) => ({ ...prev, [msg.jobId]: ((prev[msg.jobId] ?? '') + msg.line).slice(-20_000) }))
        }
      }
      ws.onclose = (ev) => { if (!closed && ev.code !== 4401) { timer = setTimeout(connect, 2000) } }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close() }
  }, [refresh])

  return { snapshot, logLines, refresh }
}
