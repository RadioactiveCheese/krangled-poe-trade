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

const SOLAR_SHIELD = await fs.readFile(path.join(ROOT, 'specs/fixtures/viscera-greater-solar-shield.txt'), 'utf8')

test('parses the reported Greater Solar Shield with both implicit rolls', () => {
  const item = parse(SOLAR_SHIELD)
  assert.equal(item.category, 'Viscera')
  assert.equal(item.info.refName, 'Solar Shield')
  assert.equal(item.visceraName, 'Greater Solar Shield')
  assert.equal(item.itemLevel, 83)
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType.length, 2)
  assert.deepEqual(item.statsByType.map(stat => stat.sources[0].stat.roll.value), [13, 12])
  const filters = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  assert.equal(filters.length, 2)
  assert.ok(filters.every(filter => !filter.hidden && !filter.disabled && filter.tag === 'implicit'))
})

test('parses the reported Lesser Lunar Bow with its implicit roll', async () => {
  const item = parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/viscera-lesser-lunar-bow.txt'), 'utf8'))
  assert.equal(item.category, 'Viscera')
  assert.equal(item.info.refName, 'Lunar Bow')
  assert.equal(item.visceraName, 'Lesser Lunar Bow')
  assert.equal(item.itemLevel, 59)
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType.length, 1)
  assert.equal(item.statsByType[0].sources[0].stat.roll.value, 15)
})

test('parses the reported Greater Warden\'s Arm "more Maximum Life" implicit', async () => {
  const item = parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/viscera-greater-wardens-arm.txt'), 'utf8'))
  assert.equal(item.info.refName, 'Warden\'s Arm')
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType.length, 1)
  assert.equal(item.statsByType[0].sources[0].stat.roll.value, 7)
  const [filter] = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  assert.equal(filter.tag, 'implicit')
  // Viscera use stat_1214601201; Coven Queen's Crown uses stat_137377270 for the same text.
  assert.deepEqual(filter.tradeId, ['implicit.stat_1214601201', 'implicit.stat_137377270'])
})

test('maps every live Viscera implicit trade ID to its stat in every supported language', async () => {
  const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-viscera-implicit-stats-2026-11-22.json'), 'utf8'))
  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    await Data.init(language)
    for (const entry of snapshot.entries) {
      const stat = Data.STAT_BY_REF_V2(entry.ref)
      assert.ok(stat?.trade?.ids.implicit?.includes(entry.id), `${language}: ${entry.id} ${entry.text}`)
    }
  }
  await Data.init('en')
  for (const entry of snapshot.entries) {
    assert.ok(Data.STAT_BY_MATCH_STR(entry.text)?.stat.trade.ids.implicit?.includes(entry.id), entry.text)
  }
})

test('recognizes all official English Viscera bases with or without a tier prefix', async () => {
  const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-viscera-2026-11-20.json'), 'utf8'))
  for (const entry of snapshot.entries) {
    for (const prefix of ['', 'Lesser ', 'Greater ']) {
      const item = parse(`Item Class: Viscera\n${prefix}${entry.type}`)
      assert.equal(item.category, 'Viscera', entry.type)
      assert.equal(item.info.refName, entry.type)
      assert.equal(item.info.craftable, undefined)
    }
  }
  for (const name of ['Greater Unknown Viscera', 'Greater Chaos Orb', 'Lesser Chaos Orb']) {
    assert.equal(parseClipboard(`Item Class: Viscera\n${name}`).isErr(), true, name)
  }
})

test('classifies the complete Viscera base set in every supported language', async () => {
  const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-viscera-2026-11-20.json'), 'utf8'))
  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    await Data.init(language)
    const actual = [...Data.ITEMS_ITERATOR('')].filter(item => item.category === 'Viscera')
    assert.deepEqual(actual.map(item => item.refName).sort(), snapshot.entries.map(item => item.type).sort(), language)
    for (const base of actual) {
      const item = parse(`${Data.CLIENT_STRINGS.ITEM_CLASS}Viscera\n${base.name}`)
      assert.equal(item.category, 'Viscera')
      // Some localized bases share a name; the copied text cannot distinguish them.
      const aliases = Data.ITEM_BY_TRANSLATED('ITEM', base.name).map(item => item.refName)
      assert.ok(aliases.includes(item.info.refName), `${language}: ${base.name}`)
    }
  }
  await Data.init('en')
})

test('covers the complete live official Viscera item set', { skip: !process.env.TEST_LIVE_TRADE_API }, async () => {
  const snapshot = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-viscera-2026-11-20.json'), 'utf8'))
  const response = await originalFetch(snapshot.source, {
    headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
    signal: AbortSignal.timeout(15_000)
  })
  assert.equal(response.ok, true, `Official trade API returned ${response.status}`)
  const data = await response.json()
  const official = data.result.find(group => group.id === 'viscera').entries
  assert.deepEqual(official.map(item => item.type).sort(), snapshot.entries.map(item => item.type).sort())
})
