import type { Plugin } from 'vite'
import path from 'path'
import { createHash } from 'node:crypto'
import { makeIndexFiles } from './make-index-files.mjs'

interface Snapshot {
  version: string
  files: Map<string, Buffer>
}

// Eight current language/dataset pairs plus up to sixteen historical pairs.
const MAX_HISTORY = 16

export function makeIndexFilesPlugin (): Plugin {
  let dataRoot: string

  return {
    name: 'make-index-files',
    configResolved (config) {
      dataRoot = path.resolve(config.root, 'public/data')
    },
    buildStart () {
      makeIndexFiles(dataRoot)
    },
    configureServer (server) {
      const current = new Map<string, Snapshot>()
      const history = new Map<string, Snapshot>()
      let failed = false
      const publish = () => {
        const files = makeIndexFiles(dataRoot)
        const next = new Map<string, Snapshot>()
        for (const [file, source] of files) {
          const match = /^([^/]+)\/(items|stats)\.ndjson$/.exec(file)
          if (!match) continue
          const [, language, kind] = match
          const key = `${language}/${kind}`
          const version = createHash('sha256').update(source).digest('hex')
          const previous = current.get(key)
          if (previous?.version === version) {
            next.set(key, previous)
            continue
          }
          const pair = new Map([[`${kind}.ndjson`, source]])
          for (const suffix of kind === 'items' ? ['name', 'ref'] : ['ref', 'matcher']) {
            const name = `${kind}-${suffix}.index.bin`
            const bytes = files.get(`${language}/${name}`)
            if (!bytes) throw new Error(`Missing generated index ${language}/${name}`)
            pair.set(name, bytes)
          }
          const snapshot = { version, files: pair }
          next.set(key, snapshot)
          if (previous) history.set(`${key}/${previous.version}`, previous)
        }
        while (history.size > MAX_HISTORY) history.delete(history.keys().next().value!)
        current.clear()
        for (const [key, snapshot] of next) current.set(key, snapshot)
        failed = false
      }
      publish()

      // Source and indexes are served from one immutable generation. An edit
      // between requests cannot pair old source text with newly written offsets.
      server.middlewares.use((request, response, next) => {
        const url = new URL(request.url ?? '', 'http://localhost')
        const prefix = `${server.config.base}data/`
        if (!url.pathname.startsWith(prefix)) return next()
        const match = /^([^/]+)\/((items|stats)(?:\.ndjson|-(?:name|ref|matcher)\.index\.bin))$/.exec(url.pathname.slice(prefix.length))
        if (!match) return next()
        const [, language, file, kind] = match
        const key = `${language}/${kind}`
        const version = url.searchParams.get('v')
        const latest = current.get(key)
        const snapshot = file.endsWith('.ndjson') ? latest
          : version === latest?.version ? latest
            : version ? history.get(`${key}/${version}`) : undefined
        const bytes = snapshot?.files.get(file)
        response.setHeader('Cache-Control', 'no-store')
        if (failed || !bytes || !snapshot) {
          response.statusCode = 503
          response.end('Data index generation unavailable; reload to obtain a current snapshot.')
          return
        }
        response.setHeader('X-Data-Index-Version', snapshot.version)
        response.setHeader('Content-Type', file.endsWith('.ndjson') ? 'application/x-ndjson; charset=utf-8' : 'application/octet-stream')
        response.end(request.method === 'HEAD' ? undefined : bytes)
      })

      const pattern = path.join(dataRoot, '*/{items,stats}.ndjson').replace(/\\/g, '/')
      server.watcher.add(pattern)
      const regenerate = (file: string) => {
        const relative = path.relative(dataRoot, file).replace(/\\/g, '/')
        if (!/^[^/]+\/(items|stats)\.ndjson$/.test(relative)) return
        try {
          publish()
          server.config.logger.info('Regenerated all *.ndjson index files.', { timestamp: true })
        } catch (error) {
          failed = true
          server.config.logger.error(`Failed to regenerate index files: ${String(error)}`)
        }
      }
      server.watcher.on('change', regenerate)
      server.watcher.on('add', regenerate)
      server.httpServer?.once('close', () => {
        server.watcher.off('change', regenerate)
        server.watcher.off('add', regenerate)
        current.clear()
        history.clear()
      })
    }
  }
}
