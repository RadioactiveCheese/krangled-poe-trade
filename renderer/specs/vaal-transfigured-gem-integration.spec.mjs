import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// A transfigured gem that a Vaal Orb turned into its Vaal version keeps its transfigured
// name in the copied text and names the Vaal gem in a one-line section of its own.
// The trade site lists it as the Vaal gem with the transfigured discriminator, and
// poe.ninja as "Vaal Spark (Spark of the Nova)".

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const LANGUAGES = ['en', 'ru', 'ko', 'cmn-Hant']
const TRADE = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-vaal-transfigured-gems.json'), 'utf8'))
const OPTIONS = { league: 'Standard', collapseListings: 'api', activateStockFilter: false, exact: true, useEn: true }

let server, Data, parseClipboard, createFilters, createTradeRequest, getDetailsId, originalFetch

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
  ;({ createTradeRequest } = await server.ssrLoadModule('/src/web/price-check/trade/pathofexile-trade.ts'))
  ;({ getDetailsId } = await server.ssrLoadModule('/src/web/price-check/trends/getDetailsId.ts'))
})

test.after(async () => {
  await Data?.init('en')
  await server?.close()
  globalThis.fetch = originalFetch
})

function parse (text) {
  const result = parseClipboard(text)
  assert.equal(result.isOk(), true, JSON.stringify(result.error))
  return result.value
}

/** A level 21, 20% quality corrupted gem copy in the current language. */
function gemCopy (name, ...extraSections) {
  const s = Data.CLIENT_STRINGS
  return [
    `${s.ITEM_CLASS}Skill Gems\n${s.RARITY}${s.RARITY_GEM}\n${name}`,
    `Spell\n${s.GEM_LEVEL}21 (Max)\n${s.QUALITY}+20%`,
    ...extraSections,
    s.CORRUPTED
  ].join('\n--------\n')
}

function transfiguredName (entry) {
  return entry.text.match(/\((.+)\)$/u)[1]
}

test('every Vaal transfigured gem on the trade site is known in every language', async () => {
  assert.equal(TRADE.entries.length, 49)
  for (const language of LANGUAGES) {
    await Data.init(language)
    for (const entry of TRADE.entries) {
      const transfigured = Data.ITEM_BY_REF('GEM', transfiguredName(entry))?.[0]
      const vaal = Data.ITEM_BY_REF('GEM', entry.type)?.[0]
      assert.ok(transfigured?.gem?.transfigured, `${language}: ${entry.text}`)
      assert.equal(transfigured.tradeDisc, entry.disc, `${language}: ${entry.text}`)
      assert.equal(vaal?.gem?.vaal, true, `${language}: ${entry.type}`)
      assert.ok(transfigured.name && vaal.name, `${language}: ${entry.text}`)
    }
  }
})

test('a Vaal transfigured gem searches the Vaal gem and prices under its poe.ninja name', async () => {
  for (const language of LANGUAGES) {
    await Data.init(language)
    for (const entry of TRADE.entries) {
      const transfigured = Data.ITEM_BY_REF('GEM', transfiguredName(entry))[0]
      const vaal = Data.ITEM_BY_REF('GEM', entry.type)[0]
      const item = parse(gemCopy(transfigured.name, vaal.name, 'Souls Per Use: 30'))
      const where = `${language}: ${entry.text}`
      assert.equal(item.info.refName, transfigured.refName, where)
      assert.equal(item.vaalGem?.refName, vaal.refName, where)

      const filters = createFilters(item, { ...OPTIONS, useEn: false })
      assert.equal(filters.searchExact.sub.baseType, `${vaal.name} (${transfigured.name})`, where)
      const query = createTradeRequest(createFilters(item, OPTIONS), []).query
      assert.deepEqual(query.type, { option: entry.type, discriminator: entry.disc }, where)

      assert.deepEqual(getDetailsId(item), { ns: 'GEM', name: entry.text, variant: '21/20c' }, where)
    }
  }
})

test('a plain Vaal gem prices under the Vaal gem', async () => {
  await Data.init('en')
  for (const header of ['Spark', 'Vaal Spark']) {
    const item = parse(gemCopy(header, 'Vaal Spark'))
    assert.equal(item.vaalGem?.refName, 'Vaal Spark', header)
    assert.equal(createFilters(item, OPTIONS).searchExact.sub.baseType, 'Vaal Spark', header)
    assert.equal(getDetailsId(item).name, 'Vaal Spark', header)
  }
})

test('a one-line section naming a gem that is not a Vaal gem does not make the gem Vaal', async () => {
  await Data.init('en')
  const item = parse(gemCopy('Spark of the Nova', 'Spark'))
  assert.equal(item.vaalGem, undefined)
  assert.equal(createFilters(item, OPTIONS).searchExact.sub, undefined)
  assert.equal(getDetailsId(item).name, 'Spark of the Nova')
})
