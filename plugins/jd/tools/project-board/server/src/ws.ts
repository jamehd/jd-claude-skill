import type { WebSocket } from 'ws'
import type { WsMessage } from '../../ui/src/types.js'

export class WsHub {
  private sockets = new Set<WebSocket>()

  add(socket: WebSocket): void {
    this.sockets.add(socket)
    socket.on('close', () => this.sockets.delete(socket))
  }

  broadcast(msg: WsMessage): void {
    const payload = JSON.stringify(msg)
    for (const s of this.sockets) {
      if (s.readyState === s.OPEN) s.send(payload)
    }
  }
}
