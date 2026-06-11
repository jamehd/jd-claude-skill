import { useCallback, useEffect, useRef, useState } from 'react'
import { api, UnauthorizedError } from './api.js'
import type { BoardSnapshot, ConsoleEvent, WsMessage } from './types.js'

export function useBoard(onUnauthorized: () => void) {
  const [snapshot, setSnapshot] = useState<BoardSnapshot | null>(null)
  const [previews, setPreviews] = useState<Record<string, string>>({})
  const listenersRef = useRef(new Map<string, Set<(e: ConsoleEvent) => void>>())
  const wsRef = useRef<WebSocket | null>(null)

  const subscribe = useCallback((jobId: string, cb: (e: ConsoleEvent) => void) => {
    let set = listenersRef.current.get(jobId)
    if (!set) { set = new Set(); listenersRef.current.set(jobId, set) }
    set.add(cb)
    return () => { set!.delete(cb) }
  }, [])

  const onUnauthRef = useRef(onUnauthorized)
  useEffect(() => { onUnauthRef.current = onUnauthorized })

  const refresh = useCallback(async () => {
    try {
      setSnapshot(await api.board())
    } catch (err) {
      if (err instanceof UnauthorizedError) onUnauthRef.current()
    }
  }, [])

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
        if (msg.type === 'job_event') {
          if (msg.event.kind === 'text_delta') {
            const text = msg.event.text
            setPreviews((prev) => ({ ...prev, [msg.jobId]: ((prev[msg.jobId] ?? '') + text).slice(-300) }))
          }
          listenersRef.current.get(msg.jobId)?.forEach((cb) => cb(msg.event))
        }
      }
      ws.onclose = (ev) => { if (!closed && ev.code !== 4401) { timer = setTimeout(connect, 2000) } }
    }
    connect()
    return () => { closed = true; clearTimeout(timer); wsRef.current?.close() }
  }, [refresh])

  return { snapshot, previews, subscribe, refresh }
}
