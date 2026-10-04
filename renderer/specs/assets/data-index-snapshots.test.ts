import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it, vi } from 'vitest'
import { createServer } from 'vite'
import fnv1a from '@sindresorhus/fnv1a'
import { makeIndexFilesPlugin } from '../../src/assets/vite-plugin-make-indexes'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'krangled-index-http-'))
for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
  const folder = path.join(root, 'public/data', language)
  fs.mkdirSync(folder, { recursive: true })
  fs.writeFileSync(path.join(folder, 'items.ndjson'), JSON.stringify({ namespace: 'ITEM', name: 'Target item', refName: 'Target item' }) + '\n')
  fs.writeFileSync(path.join(folder, 'stats.ndjson'), JSON.stringify({ ref: 'Target stat', matchers: [{ string: 'Target text' }] }) + '\n')
  fs.writeFileSync(path.join(folder, 'client_strings.js'), 'export default {}')
}
afterAll(() => fs.rmSync(root, { recursive: true, force: true }))

describe('development data/index HTTP pairing', () => {
  it.each([
    { save: 'malformed items', kind: 'items', partial: '{"namespace":' },
    { save: 'empty items', kind: 'items', partial: '' },
    { save: 'empty stats', kind: 'stats', partial: '' },
    { save: 'missing-final-newline items', kind: 'items', partial: '{"namespace":"ITEM","name":"Partial item","refName":"Partial item"} ' },
    { save: 'missing-final-newline stats', kind: 'stats', partial: '{"ref":"Partial stat","matchers":[{"string":"Partial text"}]} ' }
  ])('serves validated languages during a $save save and recovers without another watch event', async ({ save, kind, partial }) => {
    const recoveryRoot = path.join(root, `recovery-${save.replaceAll(' ', '-')}`)
    for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
      const folder = path.join(recoveryRoot, 'public/data', language)
      fs.mkdirSync(folder, { recursive: true })
      fs.writeFileSync(path.join(folder, 'items.ndjson'), JSON.stringify({ namespace: 'ITEM', name: 'Target item', refName: 'Target item' }) + '\n')
      fs.writeFileSync(path.join(folder, 'stats.ndjson'), JSON.stringify({ ref: 'Target stat', matchers: [{ string: 'Target text' }] }) + '\n')
    }
    const server = await createServer({
      configFile: false, root: recoveryRoot, logLevel: 'silent', plugins: [makeIndexFilesPlugin()],
      optimizeDeps: { noDiscovery: true },
      server: { host: '127.0.0.1', port: 0, watch: { ignored: ['**/*.ndjson'] } }
    })
    try {
      await server.listen()
      const address = server.httpServer!.address() as { port: number }
      const origin = `http://127.0.0.1:${address.port}`
      const file = path.join(recoveryRoot, `public/data/en/${kind}.ndjson`)
      const snapshots = new Map<string, { source: string, version: string, indexes: Map<string, Buffer> }>()
      for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
        for (const dataset of ['items', 'stats']) {
          const key = `${language}/${dataset}`
          const response = await fetch(`${origin}/data/${key}.ndjson`)
          expect(response.status).toBe(200)
          const version = response.headers.get('X-Data-Index-Version')!
          const indexes = new Map<string, Buffer>()
          for (const suffix of dataset === 'items' ? ['name', 'ref'] : ['ref', 'matcher']) {
            const index = `${key}-${suffix}.index.bin`
            const result = await fetch(`${origin}/data/${index}?v=${version}`)
            expect(result.status).toBe(200)
            indexes.set(index, Buffer.from(await result.arrayBuffer()))
          }
          snapshots.set(key, { source: await response.text(), version, indexes })
        }
      }
      const original = snapshots.get(`en/${kind}`)!.source
      // The only change event is the explicit one during the incomplete write.
      // Completing the write cannot notify the plugin through this watcher.
      await server.watcher.unwatch(file)
      const changes = vi.fn()
      server.watcher.on('change', changed => {
        if (path.resolve(changed) === path.resolve(file)) changes()
      })
      fs.writeFileSync(file, partial)
      server.watcher.emit('change', file)
      for (const [key, snapshot] of snapshots) {
        const unchanged = await fetch(`${origin}/data/${key}.ndjson`)
        expect(unchanged.status).toBe(200)
        expect(unchanged.headers.get('X-Data-Index-Version')).toBe(snapshot.version)
        expect(await unchanged.text()).toBe(snapshot.source)
        for (const [index, bytes] of snapshot.indexes) {
          const response = await fetch(`${origin}/data/${index}?v=${snapshot.version}`)
          expect(response.status).toBe(200)
          expect(response.headers.get('X-Data-Index-Version')).toBe(snapshot.version)
          expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes)
        }
      }
      const prefix = kind === 'items'
        ? { namespace: 'ITEM', name: 'Completed item', refName: 'Completed item' }
        : { ref: 'Completed stat', matchers: [{ string: 'Completed text' }] }
      const completed = JSON.stringify(prefix) + '\n' + original
      fs.writeFileSync(file, completed)
      await vi.waitFor(async () => {
        const source = await fetch(`${origin}/data/en/${kind}.ndjson`)
        expect(source.status).toBe(200)
        expect(await source.text()).toBe(completed)
        expect(source.headers.get('X-Data-Index-Version')).not.toBe(snapshots.get(`en/${kind}`)!.version)
        const indexResponse = await fetch(`${origin}/data/en/${kind}-ref.index.bin?v=${source.headers.get('X-Data-Index-Version')}`)
        expect(indexResponse.status).toBe(200)
        const index = Buffer.from(await indexResponse.arrayBuffer())
        const hash = Number(fnv1a(kind === 'items' ? 'ITEM::Target item' : 'Target stat', { size: 32 }))
        const offsets: number[] = []
        for (let offset = 0; offset < index.length; offset += 8) {
          if (index.readUInt32LE(offset) === hash) offsets.push(index.readUInt32LE(offset + 4))
        }
        expect(offsets).toEqual([completed.length - original.length])
        const target = JSON.parse(completed.slice(offsets[0], completed.indexOf('\n', offsets[0])))
        expect(kind === 'items' ? target.refName : target.ref).toBe(kind === 'items' ? 'Target item' : 'Target stat')
      }, { timeout: 3000, interval: 50 })
      expect(changes).toHaveBeenCalledOnce()
    } finally {
      await server.close()
    }
  })

  it('loads real item and stat records when their files change between source and index requests', async () => {
    const server = await createServer({
      configFile: false, root, logLevel: 'silent',
      plugins: [makeIndexFilesPlugin(), {
        name: 'test-public-client-strings', enforce: 'pre',
        resolveId: id => id === '/data/en/client_strings.js' ? '\0test-client-strings' : undefined,
        load: id => id === '\0test-client-strings' ? 'export default {}' : undefined
      }],
      optimizeDeps: { noDiscovery: true }, server: { host: '127.0.0.1', port: 0 }
    })
    const fetch = globalThis.fetch
    const urls: string[] = []
    const originalSources = new Map<string, string>()
    let rejectIndex = false
    try {
      await server.listen()
      const address = server.httpServer!.address() as { port: number }
      const origin = `http://127.0.0.1:${address.port}`
      vi.stubGlobal('fetch', async (input: string) => {
        urls.push(input)
        if (rejectIndex && input.includes('.index.bin')) return new Response('expired snapshot', { status: 503 })
        const response = await fetch(new URL(input, origin))
        if (input.endsWith('.ndjson')) {
          const kind = input.includes('items.ndjson') ? 'items' : 'stats'
          const file = path.join(root, 'public', input)
          originalSources.set(kind, fs.readFileSync(file, 'utf8'))
          const prefix = kind === 'items'
            ? { namespace: 'ITEM', name: 'A much longer inserted item', refName: 'A much longer inserted item' }
            : { ref: 'A much longer inserted stat', matchers: [{ string: 'New text' }] }
          fs.writeFileSync(file, JSON.stringify(prefix) + '\n' + fs.readFileSync(file, 'utf8'))
          server.watcher.emit('change', file)
        }
        return response
      })
      const modulePath = fileURLToPath(new URL('../../src/assets/data/index.ts', import.meta.url))
      const data = await server.ssrLoadModule(modulePath)
      await data.loadForLang('en')
      expect(data.ITEM_BY_REF('ITEM', 'Target item')?.[0].refName).toBe('Target item')
      expect(data.ITEM_BY_REF('ITEM', 'A much longer inserted item')).toBeUndefined()
      expect(data.STAT_BY_REF_V2('Target stat')?.ref).toBe('Target stat')
      expect(data.STAT_BY_MATCH_STR_V2('Target text')?.ref).toBe('Target stat')
      expect(urls.filter(url => url.includes('.index.bin'))).toHaveLength(4)
      expect(urls.filter(url => url.includes('.index.bin')).every(url => /\?v=[a-f0-9]{64}$/.test(url))).toBe(true)
      // The on-disk new offsets really differ from the source this client read.
      // Without the version pin, the previous loader would pair these files.
      const updatedIndex = fs.readFileSync(path.join(root, 'public/data/en/items-ref.index.bin'))
      const hash = Number(fnv1a('ITEM::Target item', { size: 32 }))
      let targetOffset = 0
      for (let offset = 0; offset < updatedIndex.length; offset += 8) {
        if (updatedIndex.readUInt32LE(offset) === hash) targetOffset = updatedIndex.readUInt32LE(offset + 4)
      }
      expect(targetOffset).toBeGreaterThan(0)
      const oldSource = originalSources.get('items')!
      expect(() => JSON.parse(oldSource.slice(targetOffset, oldSource.indexOf('\n', targetOffset)))).toThrow()
      const failed = await fetch(`${origin}/data/en/items-ref.index.bin?v=expired`)
      expect(failed.status).toBe(503)
      rejectIndex = true
      await expect(data.loadForLang('en')).rejects.toThrow('Failed to load data index')
    } finally {
      vi.unstubAllGlobals()
      await server.close()
    }
  })
})
