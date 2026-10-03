import type { Plugin } from 'vite'
import path from 'path'
import { makeIndexFiles } from './make-index-files.mjs'

export function makeIndexFilesPlugin (): Plugin {
  let dataRoot: string
  let timeout: ReturnType<typeof setTimeout> | undefined

  return {
    name: 'make-index-files',
    configResolved (config) {
      dataRoot = path.resolve(config.root, 'public/data')
    },
    buildStart () {
      makeIndexFiles(dataRoot)
    },
    configureServer (server) {
      const pattern = path.join(dataRoot, '*/{items,stats}.ndjson').replace(/\\/g, '/')
      server.watcher.add(pattern)
      const regenerate = (file: string) => {
        const relative = path.relative(dataRoot, file).replace(/\\/g, '/')
        if (!/^[^/]+\/(items|stats)\.ndjson$/.test(relative)) return
        clearTimeout(timeout)
        timeout = setTimeout(() => {
          timeout = undefined
          try {
            makeIndexFiles(dataRoot)
            server.config.logger.info('Regenerated all *.ndjson index files.', { timestamp: true })
          } catch (error) {
            server.config.logger.error(`Failed to regenerate index files: ${String(error)}`)
          }
        }, 100)
      }
      server.watcher.on('change', regenerate)
      server.watcher.on('add', regenerate)
      server.httpServer?.once('close', () => {
        clearTimeout(timeout)
        server.watcher.off('change', regenerate)
        server.watcher.off('add', regenerate)
      })
    }
  }
}
