import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

const VENTORS_GAMBLE = `Item Class: Rings
Rarity: Unique
Ventor's Gamble
Gold Ring
--------
Requirements:
Level: 65
--------
Item Level: 83
--------
{ Implicit Modifier — Drop }
12(6-15)% increased Rarity of Items found
--------
{ Unique Modifier — Life }
+6(0-60) to maximum Life
{ Unique Modifier — Elemental, Fire, Resistance }
+49(-25-50)% to Fire Resistance
{ Unique Modifier — Elemental, Cold, Resistance }
+41(-25-50)% to Cold Resistance
{ Unique Modifier — Elemental, Lightning, Resistance }
+13(-25-50)% to Lightning Resistance
{ Unique Modifier — Drop }
7(-40-40)% increased Rarity of Items found
{ Unique Modifier — Mana }
9(-15-15)% increased Mana Reservation Efficiency of Skills`

let server
let parseClipboard
let initUiModFilters
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
  ;({ initUiModFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts'))
})

test.after(async () => {
  await server?.close()
  globalThis.fetch = originalFetch
})

test('keeps every elemental resistance available in the hidden filters', () => {
  const parsed = parseClipboard(VENTORS_GAMBLE)
  assert.equal(parsed.isOk(), true, JSON.stringify(parsed.error))

  const filters = initUiModFilters(parsed.value, { searchStatRange: 10 })
  const totalResistance = filters.find(filter =>
    filter.statRef === '+#% total Elemental Resistance')
  const hiddenResistances = filters.filter(filter =>
    filter.hidden === 'filters.hide_ele_res')

  assert.equal(totalResistance?.disabled, false)
  assert.equal(totalResistance?.hidden, undefined)
  assert.deepEqual(
    hiddenResistances.map(filter => ({
      statRef: filter.statRef,
      value: filter.roll?.value,
      disabled: filter.disabled
    })),
    [
      { statRef: '+#% total to Fire Resistance', value: 49, disabled: true },
      { statRef: '+#% total to Cold Resistance', value: 41, disabled: true },
      { statRef: '+#% total to Lightning Resistance', value: 13, disabled: true }
    ]
  )
})
