import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')

const CHART_TEXT = `Item Class: Chart
Rarity: Rare
Oceanic Adventure
Sandy Seabed Chart
--------
Hazardous Depths
Area Level: 83
Item Quantity: +25% (augmented)
Monster Pack Size: +18% (augmented)
Gold Found: +12% (augmented)
Dead Man's Sulphur: +75% (augmented)
--------
Requirements:
Level: 66
--------
Item Level: 83
--------
{ Implicit Modifier }
Voyage Modifier will be revealed once Charted
--------
Chart Shape: Junction
--------
{ Prefix Modifier "Profane" (Tier: 1) }
Monsters gain 22(21-29)% of their Physical Damage as Extra Chaos Damage
Monsters Inflict Withered for 2 seconds on Hit
(Withered applies 6% increased Chaos Damage Taken, and can be inflicted up to 15 times)
45% increased Dead Man's Sulphur found in this Area
{ Prefix Modifier "Unwavering" (Tier: 1) — Life }
12(10-20)% more Monster Life
Monsters cannot be Stunned
{ Suffix Modifier "of Blinding" (Tier: 1) }
Monsters Blind on Hit
(Being Blinded causes 20% less Accuracy Rating and Evasion Rating, for 4 seconds)
30% increased Dead Man's Sulphur found in this Area
{ Suffix Modifier "of Exposure" (Tier: 1) }
Players have -14(-14--12)% to all maximum Resistances
--------
Take this item to Valerie aboard the Sovereign to Chart this area.`

const DUCAT_TEXT = `Item Class: Stackable Currency
Rarity: Currency
The Genteel's Ducat
--------
Stack Size: 1/10
--------
Changes a modifier that grants a single Attribute to grant a different Attribute
--------
A noble Eternal who gave up his name to join the Brinerots. He climbed the ranks with calculated savagery like Pondium had never seen.
--------
Can be used as part of Allflame Crafting aboard The Sovereign.`

let server
let runtime
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
  try {
    const Data = await server.ssrLoadModule('/src/assets/data/index.ts')
    await Data.init('en')
    const { ItemCategory, parseClipboard } = await server.ssrLoadModule('/src/parser/index.ts')
    const { isMapLikeItem } = await server.ssrLoadModule('/src/web/map-check/is-map-like.ts')
    const { prepareMapStats } = await server.ssrLoadModule('/src/web/map-check/prepare-map-stats.ts')
    const { createExactStatFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts')
    runtime = { ItemCategory, parseClipboard, isMapLikeItem, prepareMapStats, createExactStatFilters }
  } catch (error) {
    await server.close()
    throw error
  }
})

test.after(async () => {
  await server?.close()
  globalThis.fetch = originalFetch
})

function parseItem (text) {
  const parsed = runtime.parseClipboard(text)
  assert.equal(parsed.isOk(), true, JSON.stringify(parsed.error))
  return parsed.value
}

function parseChart () {
  return parseItem(CHART_TEXT)
}

test('parses chart properties and map-style aggregate values', () => {
  const item = parseChart()

  assert.equal(item.category, runtime.ItemCategory.Chart)
  assert.equal(item.info.refName, 'Sandy Seabed Chart')
  assert.equal(item.info.tradeDisc, 'chart_sandy_seabed')
  assert.equal(item.areaLevel, 83)
  assert.equal(item.itemLevel, 83)
  assert.deepEqual(item.chart, {
    areaName: 'Hazardous Depths',
    areaId: 'HazardousDepths',
    gold: 12,
    shape: 'Junction',
    shapeId: '4',
    sulphur: 75
  })
  assert.deepEqual(item.map, {
    tier: undefined,
    itemQuantity: 25,
    packSize: 18
  })
  assert.deepEqual(item.unknownModifiers, [])
})

test('charts are accepted by the Map Check tool and expose their dangerous modifiers', () => {
  const item = parseChart()
  assert.equal(runtime.isMapLikeItem(item), true)

  const prepared = runtime.prepareMapStats(item)
  assert.ok(!prepared.some(entry => entry.matcher.includes('Voyage Modifier will be revealed')))
  assert.ok(prepared.some(entry => entry.matcher.includes('maximum Resistances')))
  assert.ok(prepared.some(entry => entry.matcher.includes('more Monster Life')))
})

test('chart price checks default to the zone with all modifier filters unchecked', () => {
  const item = parseChart()
  const stats = runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 0 })

  assert.ok(stats.length > 0)
  assert.ok(!stats.some(stat => stat.statRef === "#% increased Dead Man's Sulphur found in this Area"))
  assert.ok(stats.every(stat => stat.disabled))
})

test('keeps chart-crafting currency out of the Map Check path', () => {
  const item = parseItem(DUCAT_TEXT)
  assert.equal(item.info.refName, "The Genteel's Ducat")
  assert.notEqual(item.category, runtime.ItemCategory.Chart)
  assert.equal(runtime.isMapLikeItem(item), false)
})
