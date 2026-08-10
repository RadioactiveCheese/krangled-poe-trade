import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

const MEMORY_STRANDS_QUIVER = `Item Class: Quivers
Rarity: Magic
Broadhead Arrow Quiver of Penetrating
--------
Memory Strands: 86
--------
Requirements:
Level: 49
--------
Item Level: 84
--------
{ Implicit Modifier — Attack, Speed }
10(8-10)% increased Attack Speed
--------
{ Suffix Modifier "of Penetrating" (Tier: 3) — Attack, Critical }
33(30-34)% increased Critical Strike Chance with Bows`

let server
let parseClipboard
let originalFetch

test.before(async () => {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    const file = path.join(PUBLIC, pathname.replace(/^\//, ''))
    try {
      return new Response(await fs.readFile(file), { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }

  server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'test-public-data-modules',
      enforce: 'pre',
      resolveId (id) {
        return id.startsWith('/data/') ? `\0public-data:${id}` : undefined
      },
      async load (id) {
        const prefix = '\0public-data:'
        if (!id.startsWith(prefix)) return
        return await fs.readFile(path.join(PUBLIC, id.slice(prefix.length + 1)), 'utf8')
      }
    }],
    server: { middlewareMode: true },
    appType: 'custom'
  })

  const Data = await server.ssrLoadModule('/src/assets/data/index.ts')
  await Data.init('en')
  ;({ parseClipboard } = await server.ssrLoadModule('/src/parser/index.ts'))
})

test.after(async () => {
  await server?.close()
  globalThis.fetch = originalFetch
})

test('parses Memory Strands from a quiver property section', () => {
  const result = parseClipboard(MEMORY_STRANDS_QUIVER)

  assert.equal(result.isOk(), true, JSON.stringify(result.error))
  assert.equal(result.value.memoryStrands, 86)
})
