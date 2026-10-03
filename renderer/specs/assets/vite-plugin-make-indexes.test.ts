import { EventEmitter } from 'node:events'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { makeIndexFiles } from '../../src/assets/make-index-files.mjs'
import { makeIndexFilesPlugin } from '../../src/assets/vite-plugin-make-indexes'

vi.mock('../../src/assets/make-index-files.mjs', () => ({ makeIndexFiles: vi.fn() }))
afterEach(() => {
  vi.useRealTimers()
  vi.resetAllMocks()
})

function pluginServer () {
  const plugin = makeIndexFilesPlugin()
  const watcher = Object.assign(new EventEmitter(), { add: vi.fn() })
  const httpServer = new EventEmitter()
  const logger = { info: vi.fn(), error: vi.fn() }
  const root = path.resolve('/renderer')
  ;(plugin.configResolved as Function)({ root })
  ;(plugin.configureServer as Function)({ watcher, httpServer, config: { logger } })
  return { plugin, watcher, httpServer, logger, root }
}

describe('Vite automatic indexes', () => {
  it('generates on buildStart using the configured renderer root', () => {
    const { plugin, root } = pluginServer()
    ;(plugin.buildStart as Function)()
    expect(makeIndexFiles).toHaveBeenCalledWith(path.join(root, 'public/data'))
  })

  it('debounces NDJSON edits and additions, ignoring unrelated files', () => {
    vi.useFakeTimers()
    const { watcher, root, logger } = pluginServer()
    watcher.emit('change', path.join(root, 'public/data/en/stats.ndjson'))
    watcher.emit('add', path.join(root, 'public/data/ru/items.ndjson'))
    watcher.emit('change', path.join(root, 'public/data/en/client_strings.js'))
    watcher.emit('change', path.join(root, '../elsewhere/items.ndjson'))
    vi.advanceTimersByTime(99)
    expect(makeIndexFiles).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(makeIndexFiles).toHaveBeenCalledTimes(1)
    expect(logger.info).toHaveBeenCalledTimes(1)
  })

  it('cleans up pending generation and watchers when the server closes', () => {
    vi.useFakeTimers()
    const { watcher, httpServer, root } = pluginServer()
    watcher.emit('change', path.join(root, 'public/data/en/stats.ndjson'))
    httpServer.emit('close')
    vi.runAllTimers()
    expect(makeIndexFiles).not.toHaveBeenCalled()
    expect(watcher.listenerCount('change')).toBe(0)
    expect(watcher.listenerCount('add')).toBe(0)
  })

  it('reports malformed data on rebuild instead of crashing the dev server', () => {
    vi.useFakeTimers()
    const { watcher, root, logger } = pluginServer()
    vi.mocked(makeIndexFiles).mockImplementationOnce(() => { throw new Error('invalid NDJSON') })
    watcher.emit('change', path.join(root, 'public/data/en/stats.ndjson'))
    expect(() => vi.runAllTimers()).not.toThrow()
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining('invalid NDJSON'))
  })
})
