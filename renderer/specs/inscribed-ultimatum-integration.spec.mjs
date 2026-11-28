import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

// Inscribed Ultimatum clipboard text. The sacrifice and reward lines come from live Covens
// listings (www.pathofexile.com/api/trade/fetch, 2026-11-27), one for each ultimatum_reward
// kind and ultimatum_challenge in /api/trade/data/filters.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
const OPTIONS = { league: 'Covens', collapseListings: 'api', activateStockFilter: false, exact: true, useEn: true }

function ultimatum ({ challenge, areaLevel, sacrifice, reward }) {
  return `Item Class: Misc Map Items
Rarity: Currency
Inscribed Ultimatum
--------
Challenge: ${challenge}
Area Level: ${areaLevel}
Requires Sacrifice: ${sacrifice}
Reward: ${reward}
--------
Stormcaller Runes
(Runes will appear that will call deadly Lightning storms if you remain in them)
Stalking Ruin II
(An invulnerable shade stalks you, gaining speed and inflicting Ruin with Melee Attacks and Spells
Fail on reaching 7 Ruin)
Razor Dance III
(Swarms of blades will periodically appear and fly at you, applying Corrupted Blood on Hit)
Totem of Costly Might
(An invulnerable Totem will appear that imbues both its allies and its enemies with Speed and powerful Physical Damage benefits, but causes enemies to take 10% of their maximum Life and Energy Shield as Physical Damage per second)
Unstoppable Monsters
(Monsters cannot be Slowed or Stunned)
Dexterous Monsters
(Monsters Suppress Spell Damage and gain 500% increased Evasion Rating)
10% increased Monster Damage
30% more Monster Life
--------
Can be used in a personal map device to open portals to the Trialmaster's Domain and attempt his challenge. Portals will close once the challenge begins. While viewing your Atlas, Right-click this item to pinpoint its location.`
}

const CASES = [
  {
    // The reported item.
    text: ultimatum({ challenge: 'Survive', areaLevel: 83, sacrifice: 'The Writhing Jar', reward: 'Allelopathy' }),
    parsed: { challenge: 'Survival', reward: 'ExchangeUnique', sacrifice: 'The Writhing Jar', sacrificeQuantity: 1, rewardUnique: 'Allelopathy' },
    filters: { ultimatum_reward: { option: 'ExchangeUnique' }, ultimatum_input: { option: 'The Writhing Jar' }, ultimatum_output: { option: 'Allelopathy' } }
  },
  {
    text: ultimatum({ challenge: 'Survive', areaLevel: 69, sacrifice: 'Orb of Fusing x20', reward: 'Doubles sacrificed Currency' }),
    parsed: { challenge: 'Survival', reward: 'DoubleCurrency', sacrifice: 'Orb of Fusing', sacrificeQuantity: 20 },
    filters: { ultimatum_reward: { option: 'DoubleCurrency' }, ultimatum_input: { option: 'Orb of Fusing' } }
  },
  {
    text: ultimatum({ challenge: 'Protect the Altar', areaLevel: 83, sacrifice: 'The Forward Gaze x3', reward: 'Doubles sacrificed Divination Cards' }),
    parsed: { challenge: 'Defense', reward: 'DoubleDivCards', sacrifice: 'The Forward Gaze', sacrificeQuantity: 3 },
    filters: { ultimatum_reward: { option: 'DoubleDivCards' }, ultimatum_input: { option: 'The Forward Gaze' } }
  },
  {
    text: ultimatum({ challenge: 'Defeat waves of enemies', areaLevel: 83, sacrifice: 'Mirrorable, Rare Item', reward: 'Item and Mirrored Copy' }),
    parsed: { challenge: 'Exterminate', reward: 'MirrorRare', sacrificeQuantity: 1 },
    filters: { ultimatum_reward: { option: 'MirrorRare' } }
  },
  {
    text: ultimatum({ challenge: 'Stand in the Stone Circles', areaLevel: 70, sacrifice: 'Orb of Annulment x10', reward: 'Doubles sacrificed Currency' }),
    parsed: { challenge: 'Conquer', reward: 'DoubleCurrency', sacrifice: 'Orb of Annulment', sacrificeQuantity: 10 },
    filters: { ultimatum_reward: { option: 'DoubleCurrency' }, ultimatum_input: { option: 'Orb of Annulment' } }
  }
]

let server, Data, parseClipboard, createFilters, createTradeRequest, originalFetch

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
        if (id === '\0test-config') return `export const AppConfig = () => ({ realm: 'pc-ggg', language: 'en', leagueId: 'Covens', widgets: [] }); export const poeWebApi = () => 'www.pathofexile.com';`
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
})

test.after(async () => {
  await Data?.init('en')
  await server?.close()
  globalThis.fetch = originalFetch
})

function parse (text) {
  const parsed = parseClipboard(text)
  assert.equal(parsed.isOk(), true, parsed.isErr() ? parsed.error : '')
  return parsed.value
}

function summary (item) {
  return {
    challenge: item.ultimatum?.challenge,
    reward: item.ultimatum?.reward,
    sacrifice: item.ultimatum?.sacrifice?.refName,
    sacrificeQuantity: item.ultimatum?.sacrificeQuantity,
    rewardUnique: item.ultimatum?.rewardUnique?.refName
  }
}

test('parses the challenge, area level, sacrifice and reward of every Inscribed Ultimatum kind', () => {
  for (const { text, parsed } of CASES) {
    const item = parse(text)
    assert.equal(item.areaLevel, Number(/Area Level: (\d+)/.exec(text)[1]))
    assert.deepEqual(summary(item), { sacrifice: undefined, rewardUnique: undefined, ...parsed })
  }
})

test('keeps the trial modifiers out of the stat filters', () => {
  const item = parse(CASES[0].text)
  assert.deepEqual(item.newMods, [])
  assert.deepEqual(item.unknownModifiers, [])
})

test('searches Inscribed Ultimatums by reward and sacrifice, with challenge and area level optional', () => {
  for (const { text, filters: expected } of CASES) {
    const item = parse(text)
    const filters = createFilters(item, OPTIONS)
    const query = createTradeRequest(filters, []).query
    assert.equal(query.type, 'Inscribed Ultimatum')
    assert.deepEqual(query.filters.ultimatum_filters.filters, expected)
    assert.equal(query.filters.map_filters, undefined)

    filters.ultimatum.challenge.disabled = false
    filters.areaLevel.disabled = false
    const full = createTradeRequest(filters, []).query
    assert.deepEqual(full.filters.ultimatum_filters.filters.ultimatum_challenge, { option: item.ultimatum.challenge })
    assert.deepEqual(full.filters.map_filters.filters.area_level, { min: item.areaLevel, max: item.areaLevel })

    filters.ultimatum.reward.disabled = true
    filters.ultimatum.sacrifice && (filters.ultimatum.sacrifice.disabled = true)
    const loose = createTradeRequest(filters, []).query
    assert.deepEqual(Object.keys(loose.filters.ultimatum_filters.filters), ['ultimatum_challenge'])
  }
})

test('Inscribed Ultimatum kinds cover the complete official trade filter options', async () => {
  const official = JSON.parse(await fs.readFile(path.join(ROOT, 'specs/fixtures/trade-ultimatum-filters-2026-11-27.json'), 'utf8'))
  const options = id => official.filters.find(filter => filter.id === id).option.options.map(o => o.id).filter(Boolean).sort()
  assert.deepEqual([...new Set(CASES.map(c => c.parsed.reward))].sort(), options('ultimatum_reward'))
  assert.deepEqual([...new Set(CASES.map(c => c.parsed.challenge))].sort(), options('ultimatum_challenge'))
})

test('parses localized Inscribed Ultimatums', async () => {
  // Property lines from ru.pathofexile.com and pathofexile.tw fetches of Covens listings.
  const LOCALIZED = {
    ru: {
      header: 'Класс предмета: Прочие предметы для карт\nРедкость: Валюта\nНачертанный Ультиматум',
      lines: ['Испытание: Стойте на каменных кругах', 'Уровень области: 79', 'Требуется жертвоприношение: Айлардекс', 'Награда: Материнские объятия'],
      expected: { challenge: 'Conquer', reward: 'ExchangeUnique', sacrifice: 'The Aylardex', sacrificeQuantity: 1, rewardUnique: "Mother's Embrace" }
    },
    'cmn-Hant': {
      header: '物品種類: 其他地圖物品\n稀有度: 通貨\n最後通牒雕刻',
      lines: ['挑戰: 保護神壇', '地區等級: 74', '需求獻祭: 夢之國度 x4', '獎勵: 翻倍獻祭的命運卡'],
      expected: { challenge: 'Defense', reward: 'DoubleDivCards', sacrifice: 'The Dreamland', sacrificeQuantity: 4, rewardUnique: undefined }
    }
  }
  try {
    for (const [language, { header, lines, expected }] of Object.entries(LOCALIZED)) {
      await Data.init(language)
      const item = parse(`${header}\n--------\n${lines.join('\n')}`)
      assert.equal(item.areaLevel, Number(lines[1].replace(/\D/g, '')), language)
      assert.deepEqual(summary(item), expected, language)
    }
  } finally {
    await Data.init('en')
  }
})
