import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let server
let originalFetch
let parseClipboard
let createExactStatFilters
let Data

test.before(async () => {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    try { return new Response(await fs.readFile(path.join(ROOT, 'public', pathname.replace(/^\//, '')))) }
    catch { return new Response('not found', { status: 404 }) }
  }
  server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'test-public-data-modules', enforce: 'pre',
      resolveId: id => id.startsWith('/data/') ? `\0public-data:${id}` : undefined,
      async load (id) {
        return id.startsWith('\0public-data:') ? await fs.readFile(path.join(ROOT, 'public', id.slice('\0public-data:'.length + 1)), 'utf8') : undefined
      }
    }],
    server: { middlewareMode: true }, appType: 'custom'
  })
  Data = await server.ssrLoadModule('/src/assets/data/index.ts')
  await Data.init('en')
  ;({ parseClipboard } = await server.ssrLoadModule('/src/parser/index.ts'))
  ;({ createExactStatFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts'))
})
test.after(async () => { await server?.close(); globalThis.fetch = originalFetch })

function parse (text) {
  const result = parseClipboard(text)
  assert.equal(result.isOk(), true, result.error)
  assert.equal(Object.isFrozen(result), true)
  return result.value
}

const STRINGS = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/client-strings-fated-3.30.0.4.json'), 'utf8')).strings

test('parses an unidentified Fated rare under its plain base type', async () => {
  const item = parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/fated-geodesic-ring-unidentified.txt'), 'utf8'))
  assert.equal(item.info.refName, 'Geodesic Ring')
  assert.equal(item.rarity, 'Rare')
  assert.equal(item.isUnidentified, true)
  assert.equal(item.itemLevel, 86)
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType.length, 4)
  const filters = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  assert.ok(filters.every(filter => filter.tag === 'implicit'))
})

test('parses an identified Fated rare under its plain base type', () => {
  const item = parse([
    'Item Class: Rings', 'Rarity: Rare', 'Vengeance Band', 'Fated Geodesic Ring', '--------',
    'Item Level: 80', '--------',
    '{ Implicit Modifier }', '+1 Prefix Modifier allowed', '-1 Suffix Modifier allowed'
  ].join('\n'))
  assert.equal(item.info.refName, 'Geodesic Ring')
  assert.equal(item.isUnidentified, false)
})

test('matches the game Fated name and unidentified tier strings in every supported language', async () => {
  for (const [language, strings] of Object.entries(STRINGS)) {
    await Data.init(language)
    const { FATED_NAME, UNIDENTIFIED_TIER } = Data.CLIENT_STRINGS
    assert.equal(FATED_NAME.exec(strings.FatedItem.replace('{0}', 'Base Name'))?.[1], 'Base Name', language)
    const unidentified = strings.ItemPopupUnidentified + strings.ItemTierDisplay.replace('{0}', '5')
    assert.equal(UNIDENTIFIED_TIER.exec(unidentified)?.[1], '5', `${language}: ${unidentified}`)
  }
  await Data.init('en')
})
