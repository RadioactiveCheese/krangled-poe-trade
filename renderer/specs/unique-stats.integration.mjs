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
let initUiModFilters
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
  ;({ initUiModFilters, createExactStatFilters } = await server.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts'))
})
test.after(async () => { await server?.close(); globalThis.fetch = originalFetch })

function parse (text) {
  const result = parseClipboard(text)
  assert.equal(result.isOk(), true, result.error)
  assert.equal(Object.isFrozen(result), true)
  return result.value
}

function ring (name, base, mods, ending = '') {
  return parse(`Item Class: Rings\nRarity: Unique\n${name}\n${base}\n--------\nItem Level: 83\n--------\n${mods}${ending}`)
}

test('resolves the exact Two-Stone Ring base variant of a unique', () => {
  const item = ring("Berek's Grip", 'Two-Stone Ring', '{ Implicit Modifier }\n+15(12-16)% to Cold and Lightning Resistances')
  assert.equal(item.uniqueBase.refName, 'Two-Stone Ring')
  assert.equal(item.uniqueBase.disc.hasImplicit.ref, '+#% to Cold and Lightning Resistances')
  assert.equal(item.uniqueBase.namespace, 'ITEM')
  assert.notEqual(item.uniqueBase, Data.ITEM_BY_REF('ITEM', 'Two-Stone Ring')[0])
})

test('keeps lone unique explicit stats rather than replacing them with redundant pseudos', () => {
  const item = ring("Berek's Grip", 'Two-Stone Ring', '{ Unique Modifier — Life }\n+25(20-30) to maximum Life')
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.ok(stats.some(stat => stat.statRef === '+# to maximum Life' && !stat.hidden))
  assert.equal(stats.some(stat => stat.statRef === '+# total maximum Life'), false)
})

test('keeps Split Personality variants individually enabled', () => {
  const item = parse('Item Class: Jewels\nRarity: Unique\nSplit Personality\nCrimson Jewel\n--------\nItem Level: 83\n--------\n{ Unique Modifier — Attribute }\n+5 to Strength\n{ Unique Modifier — Life }\n+5 to maximum Life')
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.deepEqual(stats.filter(stat => !stat.disabled && !stat.hidden).map(stat => stat.statRef), ['+# to Strength', '+# to maximum Life'])
})

test('preserves mixed resistance source details and individual elemental comparisons', () => {
  const item = ring("Ventor's Gamble", 'Gold Ring', '{ Unique Modifier — Resistance }\n+30(20-40)% to Fire and Chaos Resistances\n{ Unique Modifier — Resistance }\n+20(10-30)% to Cold Resistance')
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.ok(stats.some(stat => stat.statRef === '+#% to Fire and Chaos Resistances'))
  assert.ok(stats.some(stat => stat.statRef === '+#% total to Fire Resistance'))
  assert.ok(stats.some(stat => stat.statRef === '+#% total to Cold Resistance'))
})

test('retains corrupted implicits and creates useful combined unique pseudos', () => {
  const item = ring("Berek's Grip", 'Two-Stone Ring', '{ Corrupted Implicit Modifier — Life }\n+20 to maximum Life\n--------\n{ Unique Modifier — Life }\n+25(20-30) to maximum Life', '\n--------\nCorrupted')
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.ok(stats.some(stat => stat.statRef === '+# total maximum Life' && stat.roll.value === 45))
})

test('recognizes prefix/suffix rolls on uniques as enabled variants and retains Foulborn tagging', () => {
  const regular = ring("Berek's Grip", 'Two-Stone Ring', '{ Prefix Modifier "Healthy" (Tier: 1) — Life }\n+70(60-79) to maximum Life')
  const variant = initUiModFilters(regular, { searchStatRange: 10 }).find(stat => stat.statRef === '+# to maximum Life')
  assert.equal(variant.tag, 'variant')
  assert.equal(variant.disabled, false)
  const foulborn = ring("Foulborn Berek's Grip", 'Two-Stone Ring', '{ Foulborn Unique Modifier — Life }\n+70(60-79) to maximum Life')
  const replaced = initUiModFilters(foulborn, { searchStatRange: 10 }).find(stat => stat.statRef === '+# to maximum Life')
  assert.equal(replaced.tag, 'foulborn')
  assert.equal(replaced.hidden, undefined)
  assert.equal(replaced.disabled, false)
})

test('retains exact property filters for unidentified uniques', () => {
  const item = parse('Item Class: Rings\nRarity: Unique\nGold Ring\n--------\nItem Level: 83\n--------\n{ Implicit Modifier — Drop }\n15(6-15)% increased Rarity of Items found\n--------\nUnidentified')
  const filters = createExactStatFilters(item, item.statsByType, { searchStatRange: 10 })
  assert.ok(filters.some(stat => stat.statRef === '#% increased Rarity of Items found'))
})

test('preserves armour bounds and quality-changing enchant searches on rare items', () => {
  const item = parse('Item Class: Body Armours\nRarity: Rare\nDoom Shell\nPlate Vest\n--------\nQuality: +20% (augmented)\nArmour: 22\n--------\nItem Level: 83\n--------\nQuality does not increase Defences (enchant)')
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.equal(stats.find(stat => stat.tradeId[0] === 'item.armour').roll.value, 22)
  assert.equal(stats.find(stat => stat.statRef === 'Quality does not increase Defences').hidden, 'filters.hide_enchant_meta_stat')
})

test('uses variable unique armour bounds and hides its redundant base-percentile filter', () => {
  const item = parse("Item Class: Body Armours\nRarity: Unique\nZahndethus' Cassock\nSage's Robe\n--------\nEnergy Shield: 187 (augmented)\n--------\nItem Level: 83\n--------\n{ Unique Modifier — Defences, Energy Shield }\n134(125-150)% increased Energy Shield")
  assert.equal(item.uniqueBase.refName, "Sage's Robe")
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  const shield = stats.find(stat => stat.tradeId[0] === 'item.energy_shield')
  assert.ok(shield.roll.bounds.min < shield.roll.value)
  assert.ok(shield.roll.bounds.max > shield.roll.value)
  assert.equal(shield.hidden, undefined)
  assert.equal(stats.find(stat => stat.tradeId[0] === 'item.base_percentile').hidden, 'filters.hide_redundant')
})

test('uses base percentile when fixed unique defence rolls are the only other source of variance', () => {
  const item = parse("Item Class: Body Armours\nRarity: Unique\nZahndethus' Cassock\nSage's Robe\n--------\nEnergy Shield: 187 (augmented)\n--------\nItem Level: 83\n--------\n{ Unique Modifier — Defences, Energy Shield }\n134% increased Energy Shield")
  const stats = initUiModFilters(item, { searchStatRange: 10 })
  assert.equal(stats.find(stat => stat.tradeId[0] === 'item.energy_shield').hidden, 'filters.hide_variable_by_base_percentile_only')
  assert.equal(stats.find(stat => stat.tradeId[0] === 'item.base_percentile').hidden, undefined)
})

test('retains variable unique base implicits and hides constant base implicits', () => {
  for (const [roll, hidden] of [['10(6-15)', undefined], ['10', 'filters.hide_unique_base_implicit']]) {
    const item = ring("Ventor's Gamble", 'Gold Ring', `{ Implicit Modifier }\n${roll}% increased Rarity of Items found`)
    const implicit = initUiModFilters(item, { searchStatRange: 10 }).find(stat => stat.tag === 'implicit')
    assert.equal(implicit.hidden, hidden)
    if (!hidden) {
      assert.deepEqual(implicit.roll.bounds, { min: 6, max: 15 })
      implicit.disabled = false
      assert.equal(implicit.disabled, false)
    }
  }
})
