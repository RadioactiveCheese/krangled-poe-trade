import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
let server, Data, parseClipboard, createFilters, initUiModFilters, createTradeRequest, originalFetch

test.before(async () => {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    try {
      return new Response(await fs.readFile(path.join(PUBLIC, pathname.replace(/^\//, ''))), { status: 200 })
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
        if (id === '@/web/Config' || id.replace(/\\/g, '/').endsWith('/web/Config.ts')) return '\0test-config'
        return id.startsWith('/data/') ? `\0public-data:${id}` : undefined
      },
      async load (id) {
        if (id === '\0test-config') return `export const AppConfig = () => ({ realm: 'pc-ggg', language: 'en', leagueId: 'Standard', widgets: [] }); export const poeWebApi = () => 'www.pathofexile.com';`
        const prefix = '\0public-data:'
        if (id.startsWith(prefix)) return await fs.readFile(path.join(PUBLIC, id.slice(prefix.length + 1)), 'utf8')
      }
    }],
    server: { middlewareMode: true },
    appType: 'custom'
  })
  Data = await server.ssrLoadModule('/src/assets/data/index.ts')
  await Data.init('en')
  ;({ parseClipboard } = await server.ssrLoadModule('/src/parser/index.ts'))
  ;({ createFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-item-filters.ts'))
  ;({ initUiModFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts'))
  ;({ createTradeRequest } = await server.ssrLoadModule('/src/web/price-check/trade/pathofexile-trade.ts'))
})
test.after(async () => {
  await server?.close()
  globalThis.fetch = originalFetch
})

function parse (text) {
  const result = parseClipboard(text)
  assert.equal(result.isOk(), true, JSON.stringify(result.error))
  return result.value
}

function clipboard (baseName, quality, strands = false) {
  const strings = Data.CLIENT_STRINGS
  const base = Data.ITEM_BY_REF('ITEM', baseName)[0]
  return `${strings.ITEM_CLASS}Test
${strings.RARITY}${strings.RARITY_NORMAL}
${base.name}
--------
${quality}${strands ? `\n${strings.MEMORY_STRANDS}86` : ''}
--------
${strings.ITEM_LEVEL}84`
}

const options = { league: 'Standard', currency: undefined, collapseListings: 'api', activateStockFilter: false, exact: true, useEn: true }

for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
  test(`parses all 12 catalyst types across jewellery categories and optional localized annotations in ${language}`, async () => {
    await Data.loadForLang(language)
    const contract = JSON.parse(await fs.readFile(path.join(ROOT, `specs/fixtures/catalyst-quality-${language}.json`), 'utf8'))
    for (const entry of contract.entries) {
      for (const base of ['Gold Ring', 'Gold Amulet', 'Heavy Belt']) {
        for (const annotation of ['', ' (augmented)', '（강화）']) {
          const item = parse(clipboard(base, entry.text.trimEnd().replace('#', '+20') + annotation, true))
          assert.equal(item.quality, 20, `${entry.id}: ${base}`)
          assert.equal(item.memoryStrands, 86)
          assert.equal(item.newMods[0].stats[0].roll.unscalable, true)
          assert.equal(item.newMods[0].stats[0].stat.trade.ids.pseudo[0], entry.id)
          const filters = createFilters(item, options)
          assert.equal(filters.quality, undefined, 'jewellery quality must use the typed pseudo stat, not a generic quality filter')
          const stats = initUiModFilters(item, { searchStatRange: 10 })
          const quality = stats.find(filter => filter.tradeId?.includes(entry.id))
          assert.equal(quality.hidden, 'filters.hide_jewellery_quality')
          quality.disabled = false
          const query = createTradeRequest(filters, stats)
          assert.ok(query.query.stats.some(group => group.filters.some(filter => filter.id === entry.id)))
        }
      }
    }
  })
}

test('does not interpret unsupported catalyst-like text or quality on a quiver', async () => {
  await Data.loadForLang('en')
  assert.equal(parse(clipboard('Gold Ring', 'Quality (Unknown Modifiers): +20% (augmented)')).quality, undefined)
  assert.equal(parse(clipboard('Gold Ring', 'Quality (Life and Mana Modifiers): no value')).quality, undefined)
  assert.equal(parse(clipboard('Broadhead Arrow Quiver', 'Quality (Life and Mana Modifiers): +20% (augmented)', true)).quality, undefined)
  assert.equal(parse(clipboard('Broadhead Arrow Quiver', 'Quality (Life and Mana Modifiers): +20% (augmented)', true)).memoryStrands, 86)
})

test('retains catalyst-enhanced unique fixed rolls and corrupted activation after final filter rules', async () => {
  await Data.loadForLang('en')
  for (const isCorrupted of [false, true]) {
    const item = parse(`Item Class: Rings
Rarity: Unique
Heartbound Loop
Moonstone Ring
--------
Quality (Life and Mana Modifiers): +20% (augmented)
--------
Item Level: 84
--------
{ Unique Modifier — Life — 20% Increased }
+30 to maximum Life${isCorrupted ? '\n--------\nCorrupted' : ''}`)
    const filters = initUiModFilters(item, { searchStatRange: 10 })
    const life = filters.find(filter => filter.statRef === '+# to maximum Life')
    assert.equal(life.hidden, undefined)
    assert.equal(life.roll.value, 36)
    assert.equal(life.roll.min, 36)
    if (isCorrupted) assert.equal(life.disabled, false)
    assert.equal(filters.find(filter => filter.sources[0]?.stat.stat.jewelleryQuality).hidden, 'filters.hide_jewellery_quality')
    assert.equal(createFilters(item, options).quality, undefined)
  }
})

