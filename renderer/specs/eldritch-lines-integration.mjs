import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const snapshot = JSON.parse(await fs.readFile(new URL('./fixtures/eldritch-item-markers-2026-10-03.json', import.meta.url), 'utf8'))
let server
let Data
let parseClipboard
let originalFetch

test.before(async () => {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    try {
      const pathname = new URL(String(url), 'http://local').pathname
      return new Response(await fs.readFile(path.join(PUBLIC, pathname.slice(1))), { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }
  server = await createServer({
    root: ROOT, logLevel: 'silent', optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'test-public-data-modules', enforce: 'pre',
      resolveId (id) { return id.startsWith('/data/') ? `\0public-data:${id}` : undefined },
      async load (id) {
        const prefix = '\0public-data:'
        if (id.startsWith(prefix)) return await fs.readFile(path.join(PUBLIC, id.slice(prefix.length + 1)), 'utf8')
      }
    }],
    server: { middlewareMode: true }, appType: 'custom'
  })
  Data = await server.ssrLoadModule('/src/assets/data/index.ts')
  ;({ parseClipboard } = await server.ssrLoadModule('/src/parser/index.ts'))
})
test.after(async () => { await server?.close(); globalThis.fetch = originalFetch })

for (const [language, markers] of Object.entries(snapshot.languages)) {
  test(`${language}: both Eldritch markers preserve modifiers, corruption and mirroring`, async () => {
    await Data.init(language)
    const strings = Data.CLIENT_STRINGS
    assert.equal(strings.ITEM_EATER, markers.ITEM_EATER)
    assert.equal(strings.ITEM_EXARCH, markers.ITEM_EXARCH)
    const base = Data.ITEM_BY_REF('ITEM', 'Antique Gauntlets')[0]
    const stat = Data.STAT_BY_REF_V2('+# to maximum Life')
    const lifeLine = `{ ${strings.PREFIX_MODIFIER} }\n${stat.matchers[0].string.replace('#', '50')}`
    const header = `${strings.ITEM_CLASS}Gloves\n${strings.RARITY}${strings.RARITY_RARE}\nTest Gloves\n${base.name}\n--------\n${strings.ITEM_LEVEL}86\n--------\n`
    for (const markerLines of [[markers.ITEM_EATER], [markers.ITEM_EXARCH], [markers.ITEM_EATER, markers.ITEM_EXARCH], [markers.ITEM_EXARCH, markers.ITEM_EATER]]) {
      for (const status of [undefined, 'CORRUPTED', 'MIRRORED']) {
        const suffix = status ? `${lifeLine}\n--------\n${strings[status]}` : lifeLine
        const text = `${header}${suffix}\n${markerLines.join('\n')}`
        const result = parseClipboard(text)
        assert.equal(result.isOk(), true, result.error)
        assert.equal(result.value.rawText, text)
        assert.equal(result.value.isCorrupted, status === 'CORRUPTED')
        assert.equal(Boolean(result.value.isMirrored), status === 'MIRRORED')
        assert.equal(result.value.unknownModifiers.length, 0)
        assert.equal(result.value.statsByType.find(calc => calc.stat.ref === '+# to maximum Life').sources[0].stat.roll.value, 50)
      }
    }
    const standalone = parseClipboard(`${header}${lifeLine}\n--------\n${markers.ITEM_EATER}\n${markers.ITEM_EXARCH}`)
    assert.equal(standalone.isOk(), true, standalone.error)
    assert.equal(standalone.value.unknownModifiers.length, 0)
    assert.ok(standalone.value.statsByType.some(calc => calc.stat.ref === '+# to maximum Life'))
    const unknown = parseClipboard(`${header}${lifeLine}\nUnexpected modifier line`)
    assert.equal(unknown.isOk(), true)
    assert.ok(unknown.value.unknownModifiers.some(mod => mod.text.includes('Unexpected modifier line')))
  })
}

