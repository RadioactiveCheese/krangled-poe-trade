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

const OLD_TEXTUAL_RANGES = {
  en: ['(Greater Multiple Projectiles-Hallow)', '(Fireball-Mana-Infused Staff)'],
  ru: ['(Много дополнительных снарядов-Благодать)', '(Огненный шар-Насыщенный маной посох)'],
  ko: ['(상위 다중 투사체-거룩함)', '(화염구-마나 주입 지팡이)'],
  'cmn-Hant': ['(高階多重投射-聖徒)', '(火球-魔能長杖)']
}

function tradeIds (item) {
  return item.statsByType.map(calc => calc.stat.trade.ids[calc.type])
}

test('parses the reported Replica Dragonfang\'s Flight with its random "(...)" gem', async () => {
  const item = parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/replica-dragonfangs-flight-ground-slam.txt'), 'utf8'))
  assert.equal(item.info.refName, 'Replica Dragonfang\'s Flight')
  assert.deepEqual(item.unknownModifiers, [])
  assert.equal(item.statsByType.length, 5)
  const slam = item.statsByType.find(calc => calc.stat.ref.includes('Ground Slam'))
  assert.equal(slam.stat.ref, '+# to Level of all Ground Slam Gems (Random Skill Gem)')
  assert.equal(slam.sources[0].stat.roll.value, 3)
})

test('"(...)" selects the random-gem stat over the fixed one with the same plain text', () => {
  const header = ['Item Class: Rings', 'Rarity: Rare', 'Test Name', 'Iolite Ring', '--------', 'Item Level: 80', '--------']
  const random = parse([...header, '{ Prefix Modifier "Test" }', 'Socketed Gems are Supported by Level 20 Added Chaos Damage(...)'].join('\n'))
  assert.deepEqual(tradeIds(random), [['explicit.indexable_support_128']])
  const fixed = parse([...header, '{ Prefix Modifier "Test" }', 'Socketed Gems are Supported by Level 20 Added Chaos Damage'].join('\n'))
  assert.deepEqual(tradeIds(fixed), [['explicit.effect_1673391040']])
})

test('no language keeps a pre-3.30 textual range in its advanced matchers', async () => {
  for (const [language, ranges] of Object.entries(OLD_TEXTUAL_RANGES)) {
    const ndjson = await fs.readFile(path.join(ROOT, 'public/data', language, 'stats.ndjson'), 'utf8')
    for (const range of ranges) assert.equal(ndjson.includes(range), false, `${language}: ${range}`)
  }
})
