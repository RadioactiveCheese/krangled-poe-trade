import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BaseType } from '@/assets/data'
import { splitJsonBlob, findDenseInfo } from '@/web/background/split-poeninja-overviews'
import { forSkillGem } from '@/web/price-check/trends/gem-variant'
import {
  evaluateGem, evaluateGems, filterRows, buyItem, buyQuality, isQualityIrrelevant, sellItem,
  MAX_PRICE_MULTIPLE, DEFAULT_MIN_RATIO,
  type PriceLookup, type PriceQuery, type ExclusionReason, type GemFlipRow
} from '@/web/gem-corruption/calc'
import { GEM_CORRUPTION_DEFAULTS } from '@/web/gem-corruption/widget'

// Trimmed copy of poe.ninja's PoE1 dense overview for Allflame (see `_source` inside).
const FIXTURE = fs.readFileSync(fileURLToPath(new URL('../../fixtures/poeninja-gems-allflame.json', import.meta.url)), 'utf8')
const ITEMS = fs.readFileSync(fileURLToPath(new URL('../../../public/data/en/items.ndjson', import.meta.url)), 'utf8')

const GEMS: BaseType[] = ITEMS.split('\n')
  .filter(line => line.includes('"namespace":"GEM"'))
  .map(line => JSON.parse(line) as BaseType)

function gem (refName: string): BaseType {
  const found = GEMS.find(g => g.refName === refName)
  if (!found) throw new Error(`gem not in items.ndjson: ${refName}`)
  return found
}

const DB = splitJsonBlob(FIXTURE)
const fixtureLookup: PriceLookup = (q) => findDenseInfo(DB, q)?.info ?? null

/** lookup backed by a plain table, keyed "name|variant" */
function tableLookup (table: Record<string, number>): PriceLookup {
  return (q: PriceQuery) => {
    const chaos = table[`${q.name}|${q.variant ?? ''}`]
    return chaos === undefined ? null : { chaos }
  }
}

const CURRENCY = { "Gemcutter's Prism|": 1, 'Vaal Orb|': 2 }

function variants (refName: string) {
  const g = gem(refName)
  return {
    full: forSkillGem(buyItem(g, 20)).variant,
    none: forSkillGem(buyItem(g, 0)).variant,
    sell: forSkillGem(sellItem(g)).variant
  }
}

describe('poe.ninja variant keys', () => {
  it('uses 20/20, 20 and 21/20c for level-20 gems, including transfigured ones', () => {
    expect(variants('Arc')).toEqual({ full: '20/20', none: '20', sell: '21/20c' })
    expect(variants('Kinetic Bolt of Fragmentation')).toEqual({ full: '20/20', none: '20', sell: '21/20c' })
  })

  it('uses the real max level for exceptional supports (max 3)', () => {
    expect(variants('Greater Multistrike Support')).toEqual({ full: '3/20', none: '3', sell: '4/20c' })
    // these keys exist in the live data, next to the level-1 "1/20" key the old mapping used
    expect(fixtureLookup({ ns: 'GEM', name: 'Greater Multistrike Support', variant: '3/20' })).not.toBeNull()
    expect(fixtureLookup({ ns: 'GEM', name: 'Greater Multistrike Support', variant: '4/20c' })).not.toBeNull()
  })

  it('drops quality for Enlighten/Empower/Enhance, awakened gems and Brand Recall at max level', () => {
    expect(variants('Enlighten Support')).toEqual({ full: '3', none: '3', sell: '4c' })
    expect(variants('Awakened Enlighten Support')).toEqual({ full: '4', none: '4', sell: '5c' })
    expect(variants('Awakened Multistrike Support')).toEqual({ full: '5', none: '5', sell: '6c' })
    expect(variants('Brand Recall')).toEqual({ full: '6', none: '6', sell: '7c' })
  })

  it('keeps the existing mapping for gems below their max level', () => {
    const multistrike = gem('Greater Multistrike Support')
    expect(forSkillGem({ ...buyItem(multistrike, 20), gemLevel: 1 }).variant).toBe('1/20')
    expect(forSkillGem({ ...buyItem(multistrike, 20), gemLevel: 2 }).variant).toBe('1/20')
    expect(forSkillGem({ ...buyItem(gem('Arc'), 20), gemLevel: 15 }).variant).toBe('1/20')
    expect(forSkillGem({ ...buyItem(gem('Awakened Multistrike Support'), 20), gemLevel: 4 }).variant).toBe('1/20')
  })
})

describe('buy price selection', () => {
  const arc = gem('Arc')
  const evaluate = (table: Record<string, number>) =>
    evaluateGem(arc, tableLookup({ ...CURRENCY, ...table, 'Arc|21/20c': 400 }), { vaalOrb: 2, gemcutter: table["Gemcutter's Prism|"] ?? 1 })

  it('takes 20/0 + 20 prisms when that is cheaper than 20/20', () => {
    const { row } = evaluate({ 'Arc|20/20': 100, 'Arc|20': 50 })
    expect(row).toMatchObject({ buyRoute: 'gemcutter', buyCost: 70, fullQualityPrice: 100, noQualityPrice: 50, unconfirmed: false })
  })

  it('takes 20/20 when it is cheaper or equal', () => {
    expect(evaluate({ 'Arc|20/20': 60, 'Arc|20': 50 }).row).toMatchObject({ buyRoute: 'full-quality', buyCost: 60 })
    expect(evaluate({ 'Arc|20/20': 70, 'Arc|20': 50 }).row).toMatchObject({ buyRoute: 'full-quality', buyCost: 70 })
  })

  it('falls back to whichever route has a price', () => {
    expect(evaluate({ 'Arc|20/20': 100 }).row).toMatchObject({ buyRoute: 'full-quality', buyCost: 100 })
    expect(evaluate({ 'Arc|20': 50 }).row).toMatchObject({ buyRoute: 'gemcutter', buyCost: 70, unconfirmed: true })
    expect(evaluateGem(arc, tableLookup({ 'Arc|20': 50, 'Arc|21/20c': 400 }), { vaalOrb: 2, gemcutter: undefined }))
      .toMatchObject({ reason: 'no-buy-price' })
    expect(evaluate({}).reason).toBe('no-buy-price')
  })

  it('agrees with the live data for a prism-route gem', () => {
    const currency = { vaalOrb: 0.4734, gemcutter: 1.67 }
    const { row } = evaluateGem(gem('Lightning Tendrils of Escalation'), fixtureLookup, currency)
    expect(row?.buyRoute).toBe('gemcutter')
    expect(row!.buyCost).toBeCloseTo(row!.noQualityPrice! + 20 * 1.67)
    expect(row!.buyCost).toBeLessThan(row!.fullQualityPrice!)
  })
})

describe('profit maths', () => {
  it('computes success-case profit, margin and ratio', () => {
    const { row } = evaluateGem(gem('Arc'), tableLookup({ ...CURRENCY, 'Arc|20/20': 100, 'Arc|21/20c': 500 }), { vaalOrb: 2, gemcutter: 1 })
    expect(row).toMatchObject({ buyCost: 100, sellPrice: 500, vaalOrbPrice: 2, profit: 398 })
    expect(row!.margin).toBeCloseTo(3.98)
    expect(row!.ratio).toBeCloseTo(5)
  })

  it('reports losses as negative profit', () => {
    const { row } = evaluateGem(gem('Arc'), tableLookup({ ...CURRENCY, 'Arc|20/20': 100, 'Arc|21/20c': 90 }), { vaalOrb: 2, gemcutter: 1 })
    expect(row!.profit).toBe(-12)
    expect(row!.margin).toBeCloseTo(-0.12)
  })

  it('needs a Vaal Orb price', () => {
    const res = evaluateGems([gem('Arc')], tableLookup({ "Gemcutter's Prism|": 1, 'Arc|20/20': 100, 'Arc|21/20c': 500 }))
    expect(res.rows).toEqual([])
    expect(res.excluded).toEqual([{ gem: gem('Arc'), reason: 'no-vaal-orb-price' }])
  })

  it('sorts rows by profit', () => {
    const { rows } = evaluateGems(GEMS, fixtureLookup)
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].profit).toBeGreaterThanOrEqual(rows[i].profit)
    }
  })
})

describe('outlier filter', () => {
  const arc = gem('Arc')
  const run = (sell: number, table: Record<string, number> = { 'Arc|20/20': 100 }) =>
    evaluateGem(arc, tableLookup({ ...CURRENCY, ...table, 'Arc|21/20c': sell }), { vaalOrb: 2, gemcutter: 1 })

  it(`drops corrupted prices above ${MAX_PRICE_MULTIPLE}x the 20/20 price`, () => {
    expect(run(800).row).toBeDefined()
    expect(run(801).reason).toBe('sell-outlier')
  })

  it('compares against 20/20 even when the prism route is cheaper', () => {
    expect(run(790, { 'Arc|20/20': 100, 'Arc|20': 10 }).row).toMatchObject({ buyCost: 30, ratio: 790 / 30 })
  })

  it('cannot check without a 20/20 price, and marks the row unconfirmed', () => {
    expect(run(5000, { 'Arc|20': 10 }).row).toMatchObject({ unconfirmed: true })
  })

  it('drops a live outlier', () => {
    // Fireball: 20/20 at 9c, 21/20c at 91c
    expect(evaluateGem(gem('Fireball'), fixtureLookup, { vaalOrb: 0.47, gemcutter: 1.67 }).reason).toBe('sell-outlier')
  })
})

describe('row filters', () => {
  const { rows } = evaluateGems(GEMS, fixtureLookup)
  const all = { includeTransfigured: true, includeAwakened: true, includeUnconfirmed: true, minRatio: 0, search: '' }
  const names = (list: GemFlipRow[]) => list.map(r => r.gem.refName)

  it('defaults to every toggle on and a 7x ratio', () => {
    expect(GEM_CORRUPTION_DEFAULTS).toEqual({ includeTransfigured: true, includeAwakened: true, includeUnconfirmed: true, minRatio: DEFAULT_MIN_RATIO })
    expect(DEFAULT_MIN_RATIO).toBe(7)
  })

  it('keeps everything with filters off', () => {
    expect(filterRows(rows, all)).toHaveLength(rows.length)
  })

  it('hides transfigured gems', () => {
    expect(rows.some(r => r.gem.gem?.transfigured)).toBe(true)
    const out = filterRows(rows, { ...all, includeTransfigured: false })
    expect(out.some(r => r.gem.gem?.transfigured)).toBe(false)
    expect(names(out)).toContain('Arc')
  })

  it('hides awakened gems', () => {
    expect(names(rows)).toContain('Awakened Enlighten Support')
    const out = filterRows(rows, { ...all, includeAwakened: false })
    expect(out.some(r => r.gem.refName.startsWith('Awakened '))).toBe(false)
    expect(names(out)).toContain('Enlighten Support')
  })

  it('hides unconfirmed rows', () => {
    expect(rows.some(r => r.unconfirmed)).toBe(true)
    expect(filterRows(rows, { ...all, includeUnconfirmed: false }).some(r => r.unconfirmed)).toBe(false)
  })

  it('applies the minimum ratio, with 0 meaning off', () => {
    const out = filterRows(rows, { ...all, minRatio: DEFAULT_MIN_RATIO })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(rows.length)
    expect(out.every(r => r.ratio >= DEFAULT_MIN_RATIO)).toBe(true)
  })

  it('filters by name, case-insensitively', () => {
    expect(names(filterRows(rows, { ...all, search: '  ENLIGHTEN ' }))).toEqual(
      expect.arrayContaining(['Enlighten Support', 'Awakened Enlighten Support']))
  })
})

describe('coverage of every gem against live poe.ninja data', () => {
  const { rows, excluded } = evaluateGems(GEMS, fixtureLookup)
  const reasonOf = (refName: string) => excluded.find(e => e.gem.refName === refName)?.reason

  it('gives every gem a row or a stated reason', () => {
    const REASONS: ExclusionReason[] = ['vaal-gem', 'no-vaal-orb-price', 'no-buy-price', 'no-sell-price', 'sell-outlier']
    expect(rows.length + excluded.length).toBe(GEMS.length)
    for (const e of excluded) expect(REASONS).toContain(e.reason)
    const seen = new Set([...rows.map(r => r.gem.refName), ...excluded.map(e => e.gem.refName)])
    expect(seen.size).toBe(new Set(GEMS.map(g => g.refName)).size)
  })

  it('matches the counts seen in the live data', () => {
    const counts: Record<string, number> = {}
    for (const e of excluded) counts[e.reason] = (counts[e.reason] ?? 0) + 1
    expect({ rows: rows.length, ...counts }).toEqual({
      rows: 542,
      'vaal-gem': 50,
      'no-buy-price': 68,
      'no-sell-price': 31,
      'sell-outlier': 133
    })
  })

  it('prices gems whose max level is not 20', () => {
    const byName = new Map(rows.map(r => [r.gem.refName, r]))
    expect(byName.get('Enlighten Support')).toMatchObject({ buyLevel: 3, sellLevel: 4 })
    expect(byName.get('Awakened Enlighten Support')).toMatchObject({ buyLevel: 4, sellLevel: 5 })
    expect(byName.get('Greater Multistrike Support')).toMatchObject({ buyLevel: 3, sellLevel: 4 })
    expect(byName.get('Brand Recall')).toMatchObject({ buyLevel: 6, sellLevel: 7 })
  })

  it('uses quality-agnostic prices as full price only where quality does not matter', () => {
    const byName = new Map(rows.map(r => [r.gem.refName, r]))
    for (const name of ['Enlighten Support', 'Empower Support', 'Awakened Enlighten Support']) {
      expect(byName.get(name), name).toMatchObject({ buyRoute: 'full-quality', unconfirmed: false })
    }
    expect(byName.get('Brand Recall')).toMatchObject({ buyRoute: 'gemcutter', fullQualityPrice: undefined, unconfirmed: true })
  })

  it('opens Buy without a quality filter when any quality will do', () => {
    const byName = new Map(rows.map(r => [r.gem.refName, r]))
    expect(buyQuality(byName.get('Enlighten Support')!)).toBe(0)
    expect(buyQuality(byName.get('Awakened Enlighten Support')!)).toBe(0)
    expect(buyQuality(byName.get('Brand Recall')!)).toBe(0)
    const fullQuality = rows.find(r => r.buyRoute === 'full-quality' && !isQualityIrrelevant(r.gem))!
    expect(buyQuality(fullQuality)).toBe(20)
    expect(byName.get('Greater Multistrike Support')).toMatchObject({ unconfirmed: false })
  })

  it('states why known gems drop out', () => {
    expect(reasonOf('Vaal Arc')).toBe('vaal-gem')
    // most awakened gems aren't listed on poe.ninja for Allflame at all
    expect(reasonOf('Awakened Multistrike Support')).toBe('no-buy-price')
    // max level 1 gems never have a corrupted level 2 price
    expect(reasonOf('Portal')).toBe('no-sell-price')
    expect(reasonOf('Convocation')).toBe('no-sell-price')
    // poe.ninja only lists Blood and Sand at level 1
    expect(reasonOf('Blood and Sand')).toBe('no-buy-price')
    // Fork Support has 21/20c and 1/20 but no level 20 uncorrupted price
    expect(reasonOf('Fork Support')).toBe('no-buy-price')
  })

  it('knows every skill gem name in the fixture', () => {
    const local = new Set(GEMS.map(g => g.refName))
    const ninjaNames = new Set((JSON.parse(FIXTURE).itemOverviews[0].lines as Array<{ name: string }>).map(l => l.name))
    expect([...ninjaNames].filter(name => !local.has(name))).toEqual([])
  })
})
