import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeIndexFiles } from '../../src/assets/make-index-files.mjs'
import { makeIndexFilesPlugin } from '../../src/assets/vite-plugin-make-indexes'

vi.mock('../../src/assets/make-index-files.mjs', () => ({ makeIndexFiles: vi.fn() }))

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.resetAllMocks()
})

function snapshot (source = 'old', index = 'old offsets') {
  return new Map([
    ['en/items.ndjson', Buffer.from(source)],
    ['en/items-name.index.bin', Buffer.from(index)],
    ['en/items-ref.index.bin', Buffer.from(index)],
    ['ru/items.ndjson', Buffer.from('unchanged language')],
    ['ru/items-name.index.bin', Buffer.from('unchanged offsets')],
    ['ru/items-ref.index.bin', Buffer.from('unchanged offsets')]
  ])
}

function pluginServer (base = '/') {
  vi.mocked(makeIndexFiles).mockReturnValue(snapshot())
  const plugin = makeIndexFilesPlugin()
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const httpServer = new EventEmitter()
  const logger = { info: vi.fn(), error: vi.fn() }
  const middlewares = { use: vi.fn() }
  const root = path.resolve('/renderer')
  ;(plugin.configResolved as Function)({ root })
  ;(plugin.configureServer as Function)({ watcher, httpServer, middlewares, config: { logger, base } })
  const request = (url: string) => {
    const headers = new Map<string, string>()
    let body: Buffer | string | undefined
    const response = { statusCode: 200, setHeader: (key: string, value: string) => headers.set(key, value), end: (bytes: Buffer | string | undefined) => { body = bytes } }
    const next = vi.fn()
    middlewares.use.mock.calls[0][0]({ url }, response, next)
    return { headers, body: body!, status: response.statusCode, next }
  }
  vi.mocked(makeIndexFiles).mockClear()
  return { plugin, watcher, httpServer, logger, root, request }
}

describe('Vite automatic indexes', () => {
  it('generates on buildStart using the configured renderer root', () => {
    const { plugin, root } = pluginServer()
    ;(plugin.buildStart as Function)()
    expect(makeIndexFiles).toHaveBeenCalledWith(path.join(root, 'public/data'))
  })

  it('publishes NDJSON edits and additions immediately, ignoring unrelated files', () => {
    const { watcher, root, logger } = pluginServer()
    watcher.emit('change', path.join(root, 'public/data/en/stats.ndjson'))
    watcher.emit('add', path.join(root, 'public/data/ru/items.ndjson'))
    watcher.emit('change', path.join(root, 'public/data/en/client_strings.js'))
    watcher.emit('change', path.join(root, '../elsewhere/items.ndjson'))
    expect(makeIndexFiles).toHaveBeenCalledTimes(2)
    expect(logger.info).toHaveBeenCalledTimes(2)
  })

  it('keeps the requested old indexes paired with source read before an edit', () => {
    const { watcher, root, request } = pluginServer()
    const source = request('/data/en/items.ndjson')
    const version = source.headers.get('X-Data-Index-Version')!
    vi.mocked(makeIndexFiles).mockReturnValueOnce(snapshot('changed source', 'changed offsets'))
    watcher.emit('change', path.join(root, 'public/data/en/items.ndjson'))
    expect(source.body.toString()).toBe('old')
    expect(request(`/data/en/items-ref.index.bin?v=${version}`).body.toString()).toBe('old offsets')
    const changed = request('/data/en/items.ndjson')
    expect(changed.body.toString()).toBe('changed source')
    expect(request(`/data/en/items-name.index.bin?v=${changed.headers.get('X-Data-Index-Version')}`).body.toString()).toBe('changed offsets')
  })

  it('fails closed on unversioned, unknown and expired indexes with bounded history', () => {
    const { watcher, root, request } = pluginServer()
    const oldVersion = request('/data/en/items.ndjson').headers.get('X-Data-Index-Version')!
    expect(request('/data/en/items-ref.index.bin').status).toBe(503)
    expect(request('/data/en/items-ref.index.bin?v=unknown').status).toBe(503)
    for (let edit = 0; edit < 17; edit++) {
      vi.mocked(makeIndexFiles).mockReturnValueOnce(snapshot(`source ${edit}`))
      watcher.emit('change', path.join(root, 'public/data/en/items.ndjson'))
    }
    expect(request(`/data/en/items-ref.index.bin?v=${oldVersion}`).status).toBe(503)
    const currentVersion = request('/data/en/items.ndjson').headers.get('X-Data-Index-Version')!
    expect(request(`/data/en/items-ref.index.bin?v=${currentVersion}`).status).toBe(200)
  })

  it('uses the configured base path and passes unrelated assets through', () => {
    const { request } = pluginServer('/nested/')
    expect(request('/nested/data/en/items.ndjson').status).toBe(200)
    expect(request('/data/en/items.ndjson').next).toHaveBeenCalledOnce()
    expect(request('/nested/data/en/client_strings.js').next).toHaveBeenCalledOnce()
  })

  it('cleans up watchers and snapshots when the server closes', () => {
    const { watcher, httpServer, request } = pluginServer()
    httpServer.emit('close')
    expect(watcher.listenerCount('change')).toBe(0)
    expect(watcher.listenerCount('add')).toBe(0)
    expect(request('/data/en/items.ndjson').status).toBe(503)
  })

  it('keeps previously valid data and unchanged languages available during an incomplete save', () => {
    vi.useFakeTimers()
    const { watcher, root, logger, request } = pluginServer()
    vi.mocked(makeIndexFiles).mockImplementationOnce(() => { throw new Error('invalid NDJSON') })
    expect(() => watcher.emit('change', path.join(root, 'public/data/en/stats.ndjson'))).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('invalid NDJSON'))
    expect(request('/data/en/items.ndjson').status).toBe(200)
    const unchanged = request('/data/ru/items.ndjson')
    expect(unchanged.status).toBe(200)
    expect(unchanged.body.toString()).toBe('unchanged language')
    const version = unchanged.headers.get('X-Data-Index-Version')!
    expect(request(`/data/ru/items-ref.index.bin?v=${version}`).body.toString()).toBe('unchanged offsets')
  })

  it('recovers a completed save without another watcher event', () => {
    vi.useFakeTimers()
    const { watcher, root, request } = pluginServer()
    vi.mocked(makeIndexFiles).mockImplementationOnce(() => { throw new Error('incomplete NDJSON') })
    watcher.emit('change', path.join(root, 'public/data/en/items.ndjson'))
    vi.mocked(makeIndexFiles).mockReturnValue(snapshot('completed save', 'completed offsets'))
    vi.advanceTimersByTime(100)
    const completed = request('/data/en/items.ndjson')
    expect(completed.status).toBe(200)
    expect(completed.body.toString()).toBe('completed save')
    const version = completed.headers.get('X-Data-Index-Version')!
    expect(request(`/data/en/items-ref.index.bin?v=${version}`).body.toString()).toBe('completed offsets')
    expect(makeIndexFiles).toHaveBeenCalledTimes(2)
  })

  it('bounds automatic retries and recovers long saves on a throttled source request', () => {
    vi.useFakeTimers()
    const { watcher, root, request, logger } = pluginServer()
    vi.mocked(makeIndexFiles).mockImplementation(() => { throw new Error('incomplete NDJSON') })
    watcher.emit('change', path.join(root, 'public/data/en/items.ndjson'))
    vi.advanceTimersByTime(10000)
    expect(makeIndexFiles).toHaveBeenCalledTimes(6)
    expect(vi.getTimerCount()).toBe(0)
    expect(request('/data/en/items.ndjson').status).toBe(200)
    expect(makeIndexFiles).toHaveBeenCalledTimes(7)
    expect(request('/data/ru/items.ndjson').status).toBe(200)
    expect(makeIndexFiles).toHaveBeenCalledTimes(7)
    expect(logger.error).toHaveBeenCalledOnce()
    vi.mocked(makeIndexFiles).mockReturnValue(snapshot('completed long save', 'completed offsets'))
    vi.advanceTimersByTime(1000)
    expect(request('/data/en/items.ndjson').body.toString()).toBe('completed long save')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('cancels pending recovery when the server closes', () => {
    vi.useFakeTimers()
    const { watcher, root, httpServer } = pluginServer()
    vi.mocked(makeIndexFiles).mockImplementation(() => { throw new Error('incomplete NDJSON') })
    watcher.emit('change', path.join(root, 'public/data/en/items.ndjson'))
    expect(vi.getTimerCount()).toBe(1)
    httpServer.emit('close')
    expect(vi.getTimerCount()).toBe(0)
    vi.advanceTimersByTime(10000)
    expect(makeIndexFiles).toHaveBeenCalledOnce()
  })
})
