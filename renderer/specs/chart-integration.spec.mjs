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

const CROSSING_CHART_TEXT = `Item Class: Chart
Rarity: Rare
Nautical Journey
Coral Reef Chart
--------
Seafloor Ridges
Area Level: 83
Item Quantity: +112% (augmented)
Monster Pack Size: +36% (augmented)
--------
Requirements:
Level: 66
--------
Item Level: 83
--------
{ Implicit Modifier }
Voyage Modifier will be revealed once Charted
--------
Chart Shape: Crossing
--------
{ Prefix Modifier "Unstoppable" (Tier: 1) — Speed }
Monsters cannot be Taunted — Unscalable Value
Monsters' Action Speed cannot be modified to below Base Value
Monsters' Movement Speed cannot be modified to below Base Value — Unscalable Value
{ Prefix Modifier "Fecund" (Tier: 1) — Life }
48(46-60)% more Monster Life
{ Prefix Modifier "Unwavering" (Tier: 1) — Life }
15(10-20)% more Monster Life
Monsters cannot be Stunned — Unscalable Value
{ Suffix Modifier "of Deadliness" (Tier: 1) — Damage, Critical }
Monsters have 304(242-350)% increased Critical Strike Chance
+45(41-45)% to Monster Critical Strike Multiplier
{ Suffix Modifier "of Snares" (Tier: 1) }
Monsters inflict 3 Grasping Vines on Hit
(Up to 10 Vines can grasp you, inflicting 8% less Movement Speed per Vine. Broken by moving)
--------
Take this item to Valerie aboard the Sovereign to Chart this area.`

const RARE_ONLY_MAP_TEXT = `Item Class: Maps
Rarity: Rare
Damned Grind
Map (Tier 9)
--------
Atlas Drops: +52% (augmented)
Item Rarity: +32% (augmented)
Monster Pack Size: +20% (augmented)
--------
Item Level: 75
--------
Monster Level: 76
--------
{ Prefix Modifier "Empowered" (Tier: 1) — Elemental, Fire, Cold, Lightning, Ailment }
Monsters have a 15% chance to Ignite, Freeze and Shock on Hit
{ Prefix Modifier "Titan's" (Tier: 1) — Life }
Unique Boss has 30% increased Life
Unique Boss has 55% increased Area of Effect
{ Suffix Modifier "of Drought" (Tier: 1) }
Players gain 40% reduced Flask Charges
{ Rare-only (Tier: 1) }
Area contains a Mirage
--------
Travel to a Map of this tier or lower by using this in a personal Map Device. Maps can only be used once.`

// Every map mod the 3.30.0.2.2 client labels "Rare-only": the Mods families MapContainsMirage,
// MapContainsBeyond, MapContainsSentinel, MapContainsDelirium and MapContainsWildwood.
// Headers are ClientStrings ModDescriptionLineRareOnly + ModDescriptionLineTier; lines are the
// stat descriptions of map_is_overrun_by_faridun, map_spawn_affliction_mirror, map_azmeri_league,
// map_contains_buried_{pandemonium,apex,stalker}_sentinel and
// map_beyond_spawn_initiator_{pale,flesh,demon}_faction, with keyword markup resolved.
const RARE_ONLY_STATS = [
  ['Area contains an Empowered Mirage which covers the entire Map', 'explicit.stat_2436559047'],
  ['Areas contain a Mirror of Delirium', 'explicit.stat_2398157267'],
  ['Area contains the Viridian Wildwood', 'explicit.stat_1975119765'],
  ['Area contains a buried Pandemonium Sentinel', 'explicit.stat_70969043'],
  ['Area contains a buried Apex Sentinel', 'explicit.stat_2788592463'],
  ['Area contains a buried Stalker Sentinel', 'explicit.stat_2712450522'],
  ['Area contains an Evocator of Beidat', 'explicit.stat_260515856'],
  ['Area contains an Evocator of Ghorr', 'explicit.stat_1290924623'],
  ["Area contains an Evocator of K'Tash", 'explicit.stat_2896557935']
]
const RARE_ONLY_MAP_MODS = {
  'en': {
    header: '{ Rare-only (Tier: 1) }',
    lines: ['Area contains a Mirage', 'Area contains a Mirror of Delirium', 'Area contains the Viridian Wildwood',
      'Area contains a buried Pandemonium Sentinel', 'Area contains a buried Apex Sentinel',
      'Area contains a buried Stalker Sentinel', 'Area contains an Evocator of Beidat',
      'Area contains an Evocator of Ghorr', "Area contains an Evocator of K'Tash"]
  },
  'ru': {
    header: '{ Только редкое (Уровень: 1) }',
    lines: ['В области можно встретить Мираж', 'В области можно встретить Зеркало Делириума',
      'В области можно встретить вход в Диколесье Вириди', 'В области можно встретить Часового-пандемония',
      'В области можно встретить Апекс-Часового', 'В области можно встретить Часового-охотника',
      'В области можно встретить Призывателя Беидата', 'В области можно встретить Призывателя Гхорра',
      "В области можно встретить Призывателя К'Таш"]
  },
  'ko': {
    header: '{ 희귀만 (등급: 1) }',
    lines: ['지역에 신기루 등장', '지역에 환영의 거울 1개 등장', '지역에 취록의 야생림 등장', '지역에 묻힌 대혼란 파수꾼 등장',
      '지역에 묻힌 거물 파수꾼 등장', '지역에 묻힌 추적자 파수꾼 등장', '지역에 베이다트의 환기자 1마리 등장',
      '지역에 고르의 환기자 1마리 등장', '지역에 크타쉬의 환기자 1마리 등장']
  },
  'cmn-Hant': {
    header: '{ 稀有限定(階層：1) }',
    lines: ['區域內含有一座蜃景', '區域內含有一面譫妄之鏡', '區域內含有翠綠荒林', '區域內含有一名埋藏的騷動守望',
      '區域內含有一名埋藏的巔峰守望', '區域內含有一名埋藏的纏擾守望', '區域內含有一名貝達特召喚者',
      '區域內含有一名戈沃召喚者', '區域內含有一名克塔什召喚者']
  }
}

const DUCAT_TEXT = `Item Class: Stackable Currency
Rarity: Currency
Merrick's Ducat
--------
Stack Size: 1/10`

const INCOMPLETE_SCRYING_ORB_TEXT = `Item Class: Stackable Currency
Rarity: Currency
Scrying Orb
--------
Item Level: 1`

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
    runtime = { Data, ItemCategory, parseClipboard, isMapLikeItem, prepareMapStats, createExactStatFilters }
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

test('rejects a Scrying Orb without a map area', () => {
  const parsed = runtime.parseClipboard(INCOMPLETE_SCRYING_ORB_TEXT)
  assert.equal(parsed.isErr(), true)
  assert.equal(parsed.error, 'item.parse_error')
})

test('parses reworked Blighted Maps with localized area lines after aggregate properties', async () => {
  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    await runtime.Data.init(language)
    const strings = runtime.Data.CLIENT_STRINGS
    for (const ref of ['Blighted Map', 'Blight-ravaged Map']) {
      const base = runtime.Data.ITEM_BY_REF('ITEM', ref)[0]
      const area = runtime.Data.ITEM_BY_REF('AREA', 'Strand')[0]
      const header = `${strings.ITEM_CLASS}Maps\n${strings.RARITY}${strings.RARITY_NORMAL}\n${base.name}`
      const properties = `${strings.MAP_ITEM_QUANTITY}+12%\n${strings.MAP_AREA}${area.name}`
      const item = parseItem(`${header}\n--------\n${properties}`)
      assert.equal(item.category, runtime.ItemCategory.Map)
      assert.equal(item.info.refName, ref)
      assert.equal(item.mapArea.refName, 'Strand')
      assert.equal(item.areaItemQuantity, 12)
      assert.deepEqual(runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 0 }), [])
      assert.equal(runtime.parseClipboard(header).isErr(), true,
        'Blighted Maps without an area must fail closed')
    }
  }
  await runtime.Data.init('en')
})

test('parses the 3.30 "More Threads" map line, which replaced "More Scarabs"', async () => {
  // Game ClientStrings ItemDisplayMapScarabDropBonus in 3.30.0.1.4, [Thread|…] markup resolved.
  const labels = { en: 'More Threads', ru: 'Больше нитей', ko: '실낱 더 많음', 'cmn-Hant': '更多 綢帶' }
  for (const [language, label] of Object.entries(labels)) {
    await runtime.Data.init(language)
    const strings = runtime.Data.CLIENT_STRINGS
    assert.equal(strings.MAP_MORE_THREADS, `${label}: `)
    const base = runtime.Data.ITEM_BY_REF('ITEM', 'Blighted Map')[0]
    const area = runtime.Data.ITEM_BY_REF('AREA', 'Strand')[0]
    const item = parseItem(`${strings.ITEM_CLASS}Maps\n${strings.RARITY}${strings.RARITY_NORMAL}\n${base.name}\n--------\n` +
      `${strings.MAP_ITEM_QUANTITY}+12%\n${label}: +25%\n${strings.MAP_AREA}${area.name}`)
    assert.equal(item.mapMoreThreads, 25, language)
  }
  await runtime.Data.init('en')
})

test('map checker excludes every non-explicit modifier type, including unknown flags', () => {
  const item = parseChart()
  const explicit = item.statsByType.find(calc => calc.type === 'explicit')
  item.statsByType = ['implicit', 'enchant', 'crafted', 'pseudo', 'explicit'].map(type => ({ ...explicit, type }))
  assert.equal(runtime.prepareMapStats(item).length, 1)
})

test('map checker shows the Rare-only modifier of a reported map', () => {
  const item = parseItem(RARE_ONLY_MAP_TEXT)
  assert.deepEqual(item.unknownModifiers, [])
  const rareOnly = item.newMods.find(mod => mod.stats.some(stat => stat.stat.ref === RARE_ONLY_STATS[0][0]))
  assert.ok(rareOnly, 'the Rare-only Mirage line must resolve to a stat')
  assert.equal(rareOnly.info.type, 'explicit')
  assert.equal(rareOnly.info.tier, 1)
  assert.equal(rareOnly.info.generation, undefined)
  assert.ok(runtime.prepareMapStats(item).some(entry => entry.matcher === 'Area contains a Mirage'))
  // the header regex must still separate names and tiers of ordinary affixes
  const prefix = item.newMods.find(mod => mod.info.name === 'Empowered')
  assert.equal(prefix.info.generation, 'prefix')
  assert.equal(prefix.info.tier, 1)
})

test('price check keeps Rare-only map modifiers under the current and the pre-3.30.0.3 English header', () => {
  // 3.30.0.3 changed "{ Rare-only (Tier: 1) }" to "{ Rare-only Prefix Modifier (Tier: 1) }".
  for (const header of ['{ Rare-only (Tier: 1) }', '{ Rare-only Prefix Modifier (Tier: 1) }']) {
    const item = parseItem(RARE_ONLY_MAP_TEXT.replace('{ Rare-only (Tier: 1) }', header))
    const mirage = item.newMods.find(mod => mod.stats.some(stat => stat.stat.ref === RARE_ONLY_STATS[0][0]))
    assert.equal(mirage?.info.mechanic, 'explicit-rareonly', header)
    const filters = runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 0 })
    assert.ok(filters.some(filter => filter.statRef === RARE_ONLY_STATS[0][0]), `${header}: the Mirage must be a price filter`)
  }
})

test('every Rare-only map modifier is checkable in every language', async () => {
  try {
    for (const [language, { header, lines }] of Object.entries(RARE_ONLY_MAP_MODS)) {
      await runtime.Data.init(language)
      const strings = runtime.Data.CLIENT_STRINGS
      const base = runtime.Data.ITEM_BY_REF('ITEM', 'Map')[0]
      const item = parseItem(`${strings.ITEM_CLASS}Maps\n${strings.RARITY}${strings.RARITY_RARE}\nDamned Grind\n${base.name}\n` +
        `--------\n${strings.ITEM_LEVEL}75\n--------\n${lines.map(line => `${header}\n${line}`).join('\n')}`)
      assert.deepEqual(item.unknownModifiers, [], language)
      assert.deepEqual(item.newMods.map(mod => [mod.info.type, mod.info.tier]), lines.map(() => ['explicit', 1]), language)
      // These headers do not say prefix or suffix, so the side stays unknown.
      assert.deepEqual(item.newMods.map(mod => [mod.info.mechanic, mod.info.generation]), lines.map(() => ['explicit-rareonly', undefined]), language)
      assert.deepEqual(item.statsByType.map(calc => [calc.stat.ref, calc.stat.trade.ids.explicit?.[0], calc.stat.fromAreaMods]),
        RARE_ONLY_STATS.map(([ref, id]) => [ref, id, 'yes']), `${language}: stats must be explicit and listed in Map Check settings`)
      assert.deepEqual(runtime.prepareMapStats(item).map(entry => entry.matcher), lines, language)
    }
  } finally {
    await runtime.Data.init('en')
  }
})

test('Rare-only map modifier stats match the official Trade explicit IDs', {
  skip: !process.env.TEST_LIVE_TRADE_API && 'set TEST_LIVE_TRADE_API=1 to run'
}, async () => {
  const response = await originalFetch('https://www.pathofexile.com/api/trade/data/stats', {
    headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' }, signal: AbortSignal.timeout(15_000)
  })
  assert.equal(response.ok, true)
  const explicit = (await response.json()).result.find(group => group.id === 'explicit').entries
  const official = RARE_ONLY_MAP_MODS.en.lines.map(line => explicit.find(entry => entry.text === line)?.id)
  assert.deepEqual(official, RARE_ONLY_STATS.map(([, id]) => id))
})

test('map metadata covers all official Blighted area IDs and supported unique Map bases', {
  skip: !process.env.TEST_LIVE_TRADE_API && 'set TEST_LIVE_TRADE_API=1 to run'
}, async () => {
  const responses = await Promise.all(['items', 'filters'].map(dataset => originalFetch(
    `https://www.pathofexile.com/api/trade/data/${dataset}`, {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' }, signal: AbortSignal.timeout(15_000)
    })))
  for (const response of responses) assert.equal(response.ok, true)
  const [items, filters] = await Promise.all(responses.map(response => response.json()))
  const maps = items.result.find(group => group.id === 'map').entries
  const officialAreas = new Map(maps.filter(entry => ['blighted', 'uberblighted'].includes(entry.disc))
    .map(entry => [entry.text.match(/\((.*)\)$/u)[1], entry.type]))
  const officialUniques = maps.filter(entry => entry.disc === 'map' && entry.flags?.unique)
  // Trade still lists these retired uniques; neither local nor upstream metadata
  // supports them. Keep that limitation explicit rather than invent translations.
  const retired = new Set(['Infused Beachhead', 'The Beachhead', 'The Perandus Manor', 'The Tower of Ordeals', 'Untainted Paradise'])
  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    const local = await readNdjson(path.join(PUBLIC, `data/${language}/items.ndjson`))
    const areas = new Map(local.filter(entry => entry.namespace === 'AREA' && officialAreas.has(entry.refName))
      .map(entry => [entry.refName, entry.tradeDisc]))
    assert.deepEqual(areas, officialAreas, `${language} must cover every official Blighted/ravaged area`)
    for (const unique of officialUniques) {
      if (retired.has(unique.name)) continue
      const entry = local.find(entry => entry.namespace === 'UNIQUE' && entry.refName === unique.name)
      assert.equal(entry?.unique?.base, unique.type, `${language}: ${unique.name} must use the official Map base`)
    }
  }
  const mapFilters = filters.result.find(group => group.id === 'map_filters').filters
  for (const id of ['map_blighted', 'map_uberblighted']) {
    assert.deepEqual(mapFilters.find(filter => filter.id === id).option.options.map(option => option.id),
      [null, 'true', 'false'], `official ${id} must still accept explicit exclusions`)
  }
})

test('parses chart properties and map-style aggregate values', () => {
  const item = parseChart()

  assert.equal(item.category, runtime.ItemCategory.Chart)
  assert.equal(item.info.refName, 'Sandy Seabed Chart')
  assert.equal(item.info.tradeDisc, 'chart_sandy_seabed')
  assert.equal(item.mapArea.refName, 'Hazardous Depths')
  assert.equal(item.mapArea.area.special, true)
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
  assert.equal(item.areaItemQuantity, 25)
  assert.equal(item.areaPackSize, 18)
  assert.deepEqual(item.unknownModifiers, [])
})

test('parses the reported Crossing chart and resolves its area metadata', () => {
  const item = parseItem(CROSSING_CHART_TEXT)

  assert.equal(item.info.refName, 'Coral Reef Chart')
  assert.equal(item.mapArea.refName, 'Seafloor Ridges')
  assert.equal(item.mapArea.area?.special, undefined)
  assert.equal(item.chart.areaName, 'Seafloor Ridges')
  assert.equal(item.chart.areaId, 'SeafloorRidges')
  assert.equal(item.chart.shape, 'Crossing')
  assert.equal(item.chart.shapeId, '5')
})

test('charts are accepted by the Map Check tool and expose their dangerous modifiers', () => {
  const item = parseChart()
  assert.equal(runtime.isMapLikeItem(item), true)

  const prepared = runtime.prepareMapStats(item)
  assert.ok(!prepared.some(entry => entry.matcher.includes('Voyage Modifier will be revealed')))
  assert.ok(prepared.some(entry => entry.matcher.includes('maximum Resistances')))
  assert.ok(prepared.some(entry => entry.matcher.includes('more Monster Life')))
})

test('chart price checks expose aggregate properties and leave explicit modifiers unchecked', () => {
  const item = parseChart()
  const stats = runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 0 })
  const explicitStats = stats.filter(stat => stat.tag === 'explicit')

  assert.ok(explicitStats.length > 0)
  assert.ok(!stats.some(stat => stat.statRef === "#% increased Dead Man's Sulphur found in this Area"))
  assert.ok(stats.some(stat => stat.statRef === "Dead Man's Sulphur: +#%"))
  assert.ok(stats.some(stat => stat.statRef === 'Gold Found: +#%'))
  assert.ok(explicitStats.every(stat => stat.disabled))
})

test('keeps constant unique-map implicit filters hidden', () => {
  const item = parseItem(`Item Class: Maps
Rarity: Unique
Vaults of Atziri
Map
--------
Item Level: 83
--------
{ Implicit Modifier }
Area contains 6 additional Strongboxes`)
  const filters = runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  const implicit = filters.find(filter => filter.statRef === 'Area contains an additional Strongbox')
  assert.ok(implicit, 'fixed implicit must exist so users can still reveal hidden filters')
  assert.equal(implicit.hidden, 'filters.hide_const_roll')
  assert.equal(implicit.disabled, true)
})

test('keeps variable unique-map implicit rolls available', () => {
  const item = parseItem(`Item Class: Maps
Rarity: Unique
Vaults of Atziri
Map
--------
Item Level: 83
--------
{ Implicit Modifier }
Area contains 6(6-9) additional Strongboxes`)
  const filters = runtime.createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  const implicit = filters.find(filter => filter.statRef === 'Area contains an additional Strongbox')
  assert.ok(implicit)
  assert.ok(implicit.roll.bounds)
  assert.equal(implicit.hidden, undefined)
  assert.equal(implicit.disabled, false)
})

test('keeps chart-crafting currency out of the Map Check path', () => {
  const item = parseItem(DUCAT_TEXT)
  // The other Ducats were league content and left in 3.30; Merrick's Ducat stayed.
  assert.equal(item.info.refName, "Merrick's Ducat")
  assert.notEqual(item.category, runtime.ItemCategory.Chart)
  assert.equal(runtime.isMapLikeItem(item), false)
})

test('indexes every localized name for a shared area reference', async () => {
  await runtime.Data.init('ko')
  try {
    assert.equal(runtime.Data.ITEM_BY_TRANSLATED('AREA', '사라진 유적')?.[0].refName, 'Lost Ruins')
    assert.equal(runtime.Data.ITEM_BY_TRANSLATED('AREA', '잃어버린 폐허')?.[0].refName, 'Lost Ruins')
  } finally {
    await runtime.Data.init('en')
  }
})

test('Chart metadata covers the complete official Trade dataset', {
  skip: !process.env.TEST_LIVE_TRADE_API && 'set TEST_LIVE_TRADE_API=1 to run'
}, async () => {
  const response = await originalFetch('https://www.pathofexile.com/api/trade/data/items', {
    headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
    signal: AbortSignal.timeout(15_000)
  })
  assert.equal(response.ok, true)

  const official = await response.json()
  const chartGroup = official.result.find(group => group.id === 'chart')
  assert.ok(chartGroup, 'official items response must contain the "chart" group')

  const officialBaseTypes = new Set(chartGroup.entries
    .filter(entry => !entry.disc && entry.type.endsWith(' Chart'))
    .map(entry => entry.type))
  const officialAreas = new Map(chartGroup.entries
    .filter(entry => entry.disc === 'chart')
    .map(entry => [entry.text.match(/^Chart \((.*)\)$/u)?.[1], entry.type]))
  assert.equal(officialAreas.has(undefined), false,
    'every official Chart area must expose its canonical name')

  const localItems = await readNdjson(path.join(PUBLIC, 'data/en/items.ndjson'))
  const localBaseTypes = new Set(localItems
    .filter(entry => entry.namespace === 'ITEM' && entry.craftable?.category === 'Chart')
    .map(entry => entry.refName))
  const localAreas = new Map(localItems
    .filter(entry => entry.namespace === 'AREA' && officialAreas.has(entry.refName))
    .map(entry => [entry.refName, entry.tradeDisc]))

  assert.deepEqual(localBaseTypes, officialBaseTypes,
    'English Chart base types must exactly match the official set')
  assert.deepEqual(localAreas, officialAreas,
    'English Chart areas and Trade option IDs must exactly match the official set')
})

async function readNdjson (file) {
  return (await fs.readFile(file, 'utf8'))
    .trim()
    .split(/\r?\n/u)
    .map(line => JSON.parse(line))
}
