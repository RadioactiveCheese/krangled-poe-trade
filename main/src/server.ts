import { WebSocketServer, type WebSocket } from 'ws'
import { type AddressInfo } from 'net'
import { createServer } from 'http'
import { EventEmitter } from 'events'
import * as fs from 'fs'
import * as path from 'path'
import { app } from 'electron'
import { IpcEvent, IpcEventPayload, HostState } from '../../ipc/types'
import { ConfigStore } from './host-files/ConfigStore'
import { ThemeStore } from './host-files/ThemeStore'
import { addFileUploadRoutes } from './host-files/file-uploads'
import type { AppUpdater } from './AppUpdater'
import type { Logger } from './RemoteLogger'

async function readJsonBody (req: import('http').IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > 600 * 1024) throw new Error('Request body is too large.')
    chunks.push(bytes)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>
}

function sendJson (res: import('http').ServerResponse, statusCode: number, body: unknown) {
  res.statusCode = statusCode
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}

function isLoopbackRequest (req: import('http').IncomingMessage): boolean {
  const address = req.socket.remoteAddress
  return address === '::1' || address?.startsWith('127.') === true || address?.startsWith('::ffff:127.') === true
}

function requireLoopback (req: import('http').IncomingMessage, res: import('http').ServerResponse): boolean {
  if (isLoopbackRequest(req)) return true
  sendJson(res, 403, { error: 'Theme files can only be changed from this computer.' })
  return false
}

export const server = createServer()
const websocketServer = new WebSocketServer({ noServer: true })
let lastActiveClient: WebSocket

addFileUploadRoutes(server)

if (!process.env.VITE_DEV_SERVER_URL) {
  server.addListener('request', (req, res) => {
    if (req.url?.startsWith('/config') || req.url?.startsWith('/user-theme') || req.url?.startsWith('/uploads') || req.url?.startsWith('/proxy')) return

    const filePath = (req.url === '/') ? '/index.html' : req.url!
    switch (path.extname(filePath)) {
      case '.html': res.setHeader('content-type', 'text/html'); break;
      case '.js': res.setHeader('content-type', 'text/javascript'); break;
      case '.json': res.setHeader('content-type', 'application/json'); break;
      case '.svg': res.setHeader('content-type', 'image/svg+xml'); break;
    }

    fs.createReadStream(path.join(__dirname, filePath))
      .pipe(res)
  })
}

const evBus = new EventEmitter()

export function onEventAnyClient<Name extends IpcEvent['name']> (
  name: Name,
  cb: (payload: IpcEventPayload<Name>) => void
) {
  evBus.on(name, cb)
}

export function sendEventTo (
  target: 'last-active' | 'any' | 'broadcast',
  event: IpcEvent
) {
  const msg = JSON.stringify(event)
  if (target === 'broadcast') {
    for (const client of websocketServer.clients) {
      client.send(msg)
    }
  } else {
    lastActiveClient.send(msg)
  }
}

export interface ServerEvents {
  onEventAnyClient: typeof onEventAnyClient
  sendEventTo: typeof sendEventTo
}
export const eventPipe = {
  onEventAnyClient,
  sendEventTo
}

server.on('upgrade', (req, socket, head) => {
  if (req.url !== '/events') {
    return req.destroy()
  }
  websocketServer.handleUpgrade(req, socket, head, (ws) => {
    websocketServer.emit('connection', ws, req)
  })
})

export async function startServer (
  appUpdater: AppUpdater,
  logger: Logger
): Promise<number> {
  const configStore = new ConfigStore(eventPipe)
  const themeStore = new ThemeStore()

  websocketServer.on('connection', (socket) => {
    lastActiveClient = socket
    socket.on('message', (bytes) => {
      const event = JSON.parse(bytes.toString('utf-8')) as IpcEvent
      if (event.name === 'CLIENT->MAIN::used-recently') {
        lastActiveClient = socket
      }
      evBus.emit(event.name, event.payload)
    })
    socket.on('close', () => {
      const clients = websocketServer.clients
      if (clients.size === 1) {
        lastActiveClient = clients.values().next().value!
        evBus.emit('CLIENT->MAIN::used-recently', { isOverlay: true })
      }
    })
    sendEventTo('last-active', {
      name: 'MAIN->CLIENT::log-entry',
      payload: { message: logger.history }
    })
  })

  server.addListener('request', async (req, res) => {
    if (req.url === '/user-themes') {
      try {
        if (req.method === 'GET') {
          sendJson(res, 200, await themeStore.list())
        } else if (req.method === 'POST') {
          if (!requireLoopback(req, res)) return
          const body = await readJsonBody(req)
          sendJson(res, 201, await themeStore.import(String(body.filename ?? ''), String(body.css ?? '')))
        } else {
          sendJson(res, 405, { error: 'Method not allowed.' })
        }
      } catch (error) {
        sendJson(res, 400, { error: (error as Error).message })
      }
      return
    }
    if (req.url === '/user-themes/duplicate' && req.method === 'POST') {
      if (!requireLoopback(req, res)) return
      try {
        const body = await readJsonBody(req)
        sendJson(res, 201, await themeStore.duplicate(String(body.filename ?? '')))
      } catch (error) {
        sendJson(res, 400, { error: (error as Error).message })
      }
      return
    }
    if (req.url === '/user-themes/open' && req.method === 'POST') {
      if (!requireLoopback(req, res)) return
      try {
        await themeStore.openFolder()
        sendJson(res, 200, { ok: true })
      } catch (error) {
        sendJson(res, 500, { error: (error as Error).message })
      }
      return
    }
    if (req.url?.startsWith('/user-theme?')) {
      try {
        const filename = new URL(req.url, 'http://localhost').searchParams.get('file') ?? ''
        res.setHeader('content-type', 'text/css; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(await themeStore.load(filename))
      } catch {
        res.statusCode = 404
        res.end('/* Theme file not found */')
      }
      return
    }
    if (req.url === '/config') {
      res.setHeader('content-type', 'application/json')
      const resBody: HostState = {
        version: app.getVersion(),
        updater: appUpdater.info,
        contents: await configStore.load()
      }
      res.end(JSON.stringify(resBody))
    }
  })

  let port = (process.env.VITE_DEV_SERVER_URL) ? 8584 : 0
  let host = '127.0.0.1'
  // --listen=[host][:port]
  const listenOpt = process.argv.find(arg => arg.startsWith('--listen'))
  if (listenOpt) {
    const [hostArg, portArg] = listenOpt.split('=')[1].split(':')
    if (hostArg) host = hostArg
    if (portArg) port = parseInt(portArg, 10)
  }

  return new Promise((resolve, reject) => {
    server.listen({ port, host })
      .once('error', reject)
      .once('listening', () => {
        resolve((server.address() as AddressInfo).port)
      })
  })
}
