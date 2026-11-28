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

// Reported clipboard text; the game puts a zero-width space before the support name.
const RIGHTEOUS_FIRE = [
  'Item Class: Skill Gems', 'Rarity: Gem', 'Righteous Fire', '--------',
  'Spell, AoE, Fire', 'Level: 20 (Max)', 'Cooldown Time: 0.30 sec', 'Cast Time: Instant', 'Quality: +20% (augmented)', '--------',
  'Requirements:', 'Level: 70', 'Str: 68', 'Int: 98', '--------',
  'Engulfs you in magical fire that rapidly burns you and nearby enemies. Your spell damage is substantially increased while under this effect. The effect ends when you have 1 life remaining.', '--------',
  'Deals 70% of your Maximum Life as Base Fire Damage per second',
  'Deals 70% of your Maximum Energy Shield as Base Fire Damage per second',
  'You Burn for 90% of your Maximum Life per second as Fire Damage',
  'You Burn for 70% of your Maximum Energy Shield per second as Fire Damage',
  'Grants 39% more Spell Damage', 'Base radius is 2.3 metres', '',
  'Additional Effects From Quality:', 'Base radius is 0.3(0-0.3) metres', '--------',
  'Supported by Level 1 \u200bLifetap', '--------',
  'Place into an item socket to gain this skill. Right click to remove from a socket.', '--------',
  'Corrupted', '--------', 'Imbued', ''
].join('\r\n')

test('searches the imbued support even with the zero-width space before its name', () => {
  const item = parse(RIGHTEOUS_FIRE)
  assert.equal(item.imbuedGem, true)
  const filters = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  const imbued = filters.filter(filter => filter.tag === 'imbued')
  assert.equal(imbued.length, 1)
  assert.equal(imbued[0].disabled, false)
  assert.equal(imbued[0].statRef, 'Supported by Level 1 Lifetap')
  assert.deepEqual(imbued[0].tradeId, ['imbued.pseudo_built_in_support|3918067187'])
})

test('searches imbued supports added in 3.30 Covens', () => {
  for (const [name, tradeId] of [
    ['Cast when Damage Taken', 'imbued.pseudo_built_in_support|2842604691'],
    ['Penance', 'imbued.pseudo_built_in_support|3870057454']
  ]) {
    const item = parse(RIGHTEOUS_FIRE.replace('\u200bLifetap', `\u200b${name}`))
    const imbued = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
      .filter(filter => filter.tag === 'imbued')
    assert.deepEqual(imbued.map(filter => filter.tradeId), [[tradeId]], name)
  }
})
