import { WebSocketServer, WebSocket } from 'ws'

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 8080

// In-memory presence map: userId -> WebSocket
const clients = new Map<string, WebSocket>()

type IncomingMessage =
  | { type: 'register'; userId: string }
  | { type: 'presence'; targetId: string }
  | { type: 'relay'; targetId: string; payload: unknown }

function send(ws: WebSocket, data: unknown): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data))
  }
}

const wss = new WebSocketServer({ port: PORT })

wss.on('connection', (ws) => {
  let registeredId: string | null = null

  ws.on('message', (data) => {
    let msg: IncomingMessage
    try {
      msg = JSON.parse(data.toString())
    } catch {
      return
    }

    switch (msg.type) {
      case 'register': {
        if (typeof msg.userId !== 'string' || msg.userId.length < 8 || msg.userId.length > 64) return
        // Deregister any existing connection for this ID
        const existing = clients.get(msg.userId)
        if (existing && existing !== ws) existing.terminate()
        registeredId = msg.userId
        clients.set(msg.userId, ws)
        send(ws, { type: 'registered', userId: msg.userId })
        break
      }

      case 'presence': {
        if (!registeredId) return
        send(ws, { type: 'presence', targetId: msg.targetId, online: clients.has(msg.targetId) })
        break
      }

      case 'relay': {
        if (!registeredId) return
        const target = clients.get(msg.targetId)
        if (!target) {
          send(ws, { type: 'relay-failed', targetId: msg.targetId, reason: 'offline' })
          return
        }
        send(target, { type: 'relay', fromId: registeredId, payload: msg.payload })
        break
      }
    }
  })

  const cleanup = () => {
    if (registeredId && clients.get(registeredId) === ws) {
      clients.delete(registeredId)
    }
  }

  ws.on('close', cleanup)
  ws.on('error', cleanup)
})

console.log(`Signalling server listening on :${PORT}`)
