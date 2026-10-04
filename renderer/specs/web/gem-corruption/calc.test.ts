import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import type { BaseType } from '@/assets/data'
import { splitJsonBlob, findDenseInfo } from '@/web/background/split-poeninja-overviews'
import { forSkillGem } from '@/web/price-check/trends/gem-variant'
import {
  evaluateGem as evaluateGemWith, evaluateGems as evaluateGemsWith, filterRows, buyItem, buyQuality,
  isQualityIrrelevant, sellItem, lookupCurrency, sortRows, vaalVersion, chanceOfLevelUp, chanceOfProfit,
  MAX_PRICE_MULTIPLE, DEFAULT_MIN_RATIO, DEFAULT_ATTEMPTS, VAAL_ORB_GEM_OUTCOMES, LEVEL_UP_CHANCE,
  DOUBLE_CORRUPTION_GEM_OUTCOMES_UNVERIFIED, DOUBLE_LEVEL_UP_CHANCE, DOUBLE_CORRUPT_TEMPLE,
  type PriceLookup, type PriceQuery, type ExclusionReason, type GemFlipRow, type CurrencyPrices, type OutcomeValue
} from '@/web/gem-corruption/calc'
import { GEM_CORRUPTION_DEFAULTS } from '@/web/gem-corruption/widget'

// Trimmed copy of poe.ninja's PoE1 dense overview for Allflame (see `_source` inside).
const FIXTURE = fs.readFileSync(fileURLToPath(new URL('../../fixtures/poeninja-gems-allflame.json', import.meta.url)), 'utf8')
const ITEMS = fs.readFileSync(fileURLToPath(new URL('../../../public/data/en/items.ndjson', import.meta.url)), 'utf8')

const GEMS: BaseType[] = ITEMS.split('\n')
  .filter(line => line.includes('"namespace":"GEM"'))
  .map(line => JSON.parse(line) as BaseType)

const GEM_BY_NAME = new Map(GEMS.map(g => [g.refName, g]))
const resolve = (refName: string) => GEM_BY_NAME.get(refName)

function gem (refName: string): BaseType {
  const found = resolve(refName)
  if (!found) throw new Error(`gem not in items.ndjson: ${refName}`)
  return found
}

// items.ndjson isn't loaded into ITEM_BY_REF in tests, so pass the resolver explicitly
const evaluateGem = (g: BaseType, lookup: PriceLookup, currency: CurrencyPrices) => evaluateGemWith(g, lookup, currency, resolve)
const evaluateGems = (gems: Iterable<BaseType>, lookup: PriceLookup) => evaluateGemsWith(gems, lookup, resolve)

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
    const currency = lookupCurrency(fixtureLookup)
    const { row } = evaluateGem(gem('Lightning Tendrils of Escalation'), fixtureLookup, currency)
    expect(row?.buyRoute).toBe('gemcutter')
    expect(row!.buyCost).toBeCloseTo(row!.noQualityPrice! + 20 * currency.gemcutter!)
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
  const all = { includeTransfigured: true, includeAwakened: true, includeUnconfirmed: true, minRatio: 0, hideNegativeEv: false, search: '' }
  const names = (list: GemFlipRow[]) => list.map(r => r.gem.refName)

  it('defaults to every toggle on, no ratio filter, EV sort and 10 attempts', () => {
    expect(GEM_CORRUPTION_DEFAULTS).toEqual({
      includeTransfigured: true,
      includeAwakened: true,
      includeUnconfirmed: true,
      minRatio: DEFAULT_MIN_RATIO,
      hideNegativeEv: false,
      showDouble: true,
      sortBy: 'ev',
      attempts: DEFAULT_ATTEMPTS
    })
    expect(DEFAULT_MIN_RATIO).toBe(0)
    expect(DEFAULT_ATTEMPTS).toBe(10)
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
    const out = filterRows(rows, { ...all, minRatio: 7 })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(rows.length)
    expect(out.every(r => r.ratio >= 7)).toBe(true)
    expect(filterRows(rows, { ...all, minRatio: 0 })).toHaveLength(rows.length)
  })

  it('hides negative EV rows', () => {
    const out = filterRows(rows, { ...all, hideNegativeEv: true })
    expect(out.length).toBeGreaterThan(0)
    expect(out.length).toBeLessThan(rows.length)
    expect(out.every(r => r.ev >= 0)).toBe(true)
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
      rows: 543,
      'vaal-gem': 50,
      'no-buy-price': 67,
      'no-sell-price': 30,
      'sell-outlier': 134
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
    const ninjaNames = new Set((JSON.parse(FIXTURE).itemOverviews.find((o: { type: string }) => o.type === 'SkillGem').lines as Array<{ name: string }>).map(l => l.name))
    // Vaal versions of transfigured gems only exist on poe.ninja, as "Vaal <gem> (<transfigured gem>)"
    const vaalTransfigured = (name: string) => {
      const m = /^Vaal (.+) \((.+)\)$/.exec(name)
      return m != null && local.has(`Vaal ${m[1]}`) && GEM_BY_NAME.get(m[2])?.gem?.normalVariant === m[1]
    }
    expect([...ninjaNames].filter(name => !local.has(name) && !vaalTransfigured(name))).toEqual([])
  })
})

describe('Vaal Orb outcome table', () => {
  it('sums to 1, with a 1/8 chance of +1 level', () => {
    const total = VAAL_ORB_GEM_OUTCOMES.reduce((sum, o) => sum + o.chance, 0)
    expect(total).toBeCloseTo(1, 12)
    expect(VAAL_ORB_GEM_OUTCOMES.find(o => o.id === 'level-up')!.chance).toBe(LEVEL_UP_CHANCE)
    expect(LEVEL_UP_CHANCE).toBe(0.125)
  })

  it('splits the four 25% results as documented', () => {
    const chance = (ids: string[]) => VAAL_ORB_GEM_OUTCOMES.filter(o => ids.includes(o.id)).reduce((s, o) => s + o.chance, 0)
    expect(chance(['unchanged'])).toBeCloseTo(0.25)
    expect(chance(['vaal'])).toBeCloseTo(0.25)
    expect(chance(['level-up', 'level-down'])).toBeCloseTo(0.25)
    expect(chance(['quality-23', 'quality-21-22', 'quality-16-19', 'quality-10-15'])).toBeCloseTo(0.25)
  })

  it('finds Vaal versions, keeping transfiguration in the poe.ninja name', () => {
    expect(vaalVersion(gem('Arc'), resolve)?.ninjaName).toBe('Vaal Arc')
    expect(vaalVersion(gem('Arc of Oscillating'), resolve)?.ninjaName).toBe('Vaal Arc (Arc of Oscillating)')
    expect(vaalVersion(gem('Added Fire Damage Support'), resolve)).toBeUndefined()
  })
})

describe('expected value', () => {
  const ARC = {
    ...CURRENCY,
    'Arc|20/20': 100,
    'Arc|20/20c': 60,
    'Vaal Arc|20/20c': 300,
    'Arc|21/20c': 500,
    'Arc|20/23c': 150,
    'Arc|20c': 20
  }
  const run = (table: Record<string, number | undefined>) => {
    const clean = Object.fromEntries(Object.entries(table).filter(([, v]) => v !== undefined)) as Record<string, number>
    return evaluateGem(gem('Arc'), tableLookup(clean), { vaalOrb: 2, gemcutter: 1 }).row!
  }
  const byId = (row: GemFlipRow) => Object.fromEntries(row.outcomes.map(o => [o.id, o])) as Record<string, OutcomeValue>

  it('weights every result by its chance', () => {
    const row = run(ARC)
    // 0.25*60 + 0.25*300 + 0.125*500 + 0.125*0 + 0.1*150 + 0.025*60 + 0.05*60 + 0.075*20
    expect(row.outcomeValue).toBeCloseTo(173.5)
    expect(row.ev).toBeCloseTo(173.5 - 100 - 2)
    expect(row.evIncomplete).toBe(false)
    // profit if +1 is kept alongside
    expect(row.profit).toBe(398)
    expect(byId(row)['level-down']).toMatchObject({ status: 'not-listed', value: 0 })
    expect(byId(row).vaal).toMatchObject({ status: 'priced', value: 300, vaalName: 'Vaal Arc' })
  })

  it('counts a missing result as 0 and marks the EV incomplete', () => {
    const row = run({ ...ARC, 'Arc|20/23c': undefined })
    expect(byId(row)['quality-23']).toMatchObject({ status: 'missing', value: 0 })
    expect(row.outcomeValue).toBeCloseTo(173.5 - 15)
    expect(row.evIncomplete).toBe(true)
  })

  it('counts a missing no-quality listing as 0 without marking the EV incomplete', () => {
    const row = run({ ...ARC, 'Arc|20c': undefined })
    expect(byId(row)['quality-10-15']).toMatchObject({ status: 'not-listed', value: 0 })
    expect(row.evIncomplete).toBe(false)
  })

  it('ignores non-Vaal outliers and marks the EV incomplete', () => {
    const row = run({ ...ARC, 'Arc|20/23c': 801 })
    expect(byId(row)['quality-23']).toMatchObject({ status: 'outlier', value: 0, listedPrice: 801 })
    expect(row.evIncomplete).toBe(true)
    expect(row.evAboveCap).toBe(false)
  })

  it('counts a Vaal version above the cap at its listed price, and flags it', () => {
    const row = run({ ...ARC, 'Vaal Arc|20/20c': 801 })
    expect(byId(row).vaal).toMatchObject({ status: 'priced', value: 801, listedPrice: 801, aboveCap: true })
    expect(row.evIncomplete).toBe(false)
    expect(row.evAboveCap).toBe(true)
    // 173.5 with the Vaal version at 300
    expect(row.outcomeValue).toBeCloseTo(173.5 + 0.25 * (801 - 300))
    expect(row.evWithoutAboveCap).toBeCloseTo(173.5 - 0.25 * 300 - 102)
    // within the cap nothing is flagged and both EVs agree
    const normal = run(ARC)
    expect(normal.evAboveCap).toBe(false)
    expect(normal.evWithoutAboveCap).toBeCloseTo(normal.ev)
  })

  it('prices a level-down result from the level 1 listing at the same quality, never 1/23c', () => {
    const row = run({ ...ARC, 'Arc|1/20c': 7, 'Arc|1/23c': 999 })
    expect(byId(row)['level-down']).toMatchObject({ status: 'priced', value: 7, pricedAsLevel1: true, level: 19 })
    // only 1/23c listed: counts as 0, without marking the EV incomplete
    const only23 = run({ ...ARC, 'Arc|1/23c': 999 })
    expect(byId(only23)['level-down']).toMatchObject({ status: 'not-listed', value: 0, pricedAsLevel1: true })
    expect(only23.evIncomplete).toBe(false)
    // a level 1 price above the buy price is capped: a 19/20c gem is worth no more than a 20/20 one
    const pricey = run({ ...ARC, 'Arc|1/20c': 150 })
    expect(byId(pricey)['level-down']).toMatchObject({ value: 100, capped: true, listedPrice: 150 })
  })

  it('values a result no better than the gem bought at most at the buy price', () => {
    const row = run({ ...ARC, 'Arc|20/20c': 383.7 })
    for (const id of ['unchanged', 'quality-21-22', 'quality-16-19']) {
      expect(byId(row)[id], id).toMatchObject({ status: 'priced', value: 100, listedPrice: 383.7, capped: true })
    }
    // a 23% result can be worth more than the 20% gem
    expect(byId(row)['quality-23']).toMatchObject({ value: 150 })
    expect(byId(row)['quality-23'].capped).toBeUndefined()
  })

  it('folds the Vaal result into no change when the gem has no Vaal version', () => {
    const { row } = evaluateGem(gem('Added Fire Damage Support'), tableLookup({
      ...CURRENCY,
      'Added Fire Damage Support|20/20': 10,
      'Added Fire Damage Support|20/20c': 5,
      'Added Fire Damage Support|21/20c': 40
    }), { vaalOrb: 2, gemcutter: 1 })
    const outcomes = byId(row!)
    expect(outcomes.vaal).toBeUndefined()
    expect(outcomes.unchanged).toMatchObject({ status: 'priced', value: 5, chance: 0.5 })
    expect(row!.outcomes.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1)
    // same for double corruption: "vaal+level-up" becomes "level-up"
    expect(row!.doubleOutcomes.some(o => o.vaal)).toBe(false)
    expect(row!.doubleOutcomes.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1)
    expect(row!.doubleOutcomes.find(o => o.id === 'level-up')!.chance).toBeCloseTo(3 / 16 * 0.5 + 2 / 16 * 0.5)
  })

  it('ignores quality for Enlighten and counts its listed level-down price', () => {
    const { row } = evaluateGem(gem('Enlighten Support'), tableLookup({
      ...CURRENCY,
      'Enlighten Support|3': 800,
      'Enlighten Support|3c': 50,
      'Enlighten Support|4c': 5000,
      'Enlighten Support|2c': 40
    }), { vaalOrb: 2, gemcutter: 1 })
    const outcomes = byId(row!)
    for (const id of ['unchanged', 'quality-23', 'quality-21-22', 'quality-16-19', 'quality-10-15']) {
      expect(outcomes[id], id).toMatchObject({ status: 'priced', value: 50 })
    }
    expect(outcomes['level-down']).toMatchObject({ status: 'priced', value: 40, level: 2 })
    expect(row!.outcomeValue).toBeCloseTo(0.25 * 50 + 0.25 * 50 + 0.125 * 5000 + 0.125 * 40 + 0.25 * 50)
    expect(row!.ev).toBeCloseTo(row!.outcomeValue - 802)
    expect(row!.evIncomplete).toBe(false)
  })

  it('sorts by EV or by profit if +1', () => {
    const { rows } = evaluateGems(GEMS, fixtureLookup)
    const byEv = sortRows(rows, 'ev')
    const byProfit = sortRows(rows, 'profit')
    for (let i = 1; i < rows.length; i++) {
      expect(byEv[i - 1].ev).toBeGreaterThanOrEqual(byEv[i].ev)
      expect(byProfit[i - 1].profit).toBeGreaterThanOrEqual(byProfit[i].profit)
    }
  })
})

describe('several attempts', () => {
  it('gives the chance of at least one +1', () => {
    expect(chanceOfLevelUp(1)).toBeCloseTo(0.125)
    expect(chanceOfLevelUp(10)).toBeCloseTo(1 - Math.pow(0.875, 10))
    expect(chanceOfLevelUp(0)).toBe(0)
  })

  const outcomes = (values: Array<[number, number]>) =>
    values.map(([chance, value]) => ({ id: 'unchanged', chance, value, status: 'priced', level: 20, quality: 20 }) as OutcomeValue)

  it('gives the chance of ending in profit', () => {
    // a hit is worth 1000, anything else 0, and each try costs 100
    const table = outcomes([[0.125, 1000], [0.875, 0]])
    expect(chanceOfProfit(table, 100, 1)).toBeCloseTo(0.125)
    // 10 tries cost 1000, so it takes two hits to come out ahead
    const p0 = Math.pow(0.875, 10)
    const p1 = 10 * 0.125 * Math.pow(0.875, 9)
    expect(chanceOfProfit(table, 100, 10)).toBeCloseTo(1 - p0 - p1)
  })

  it('handles results worth something even when they are not a hit', () => {
    // every result is worth 60 and a try costs 50: always profitable
    expect(chanceOfProfit(outcomes([[0.5, 60], [0.5, 60]]), 50, 5)).toBeCloseTo(1)
    // worth 40: never profitable
    expect(chanceOfProfit(outcomes([[1, 40]]), 50, 5)).toBe(0)
  })
})

describe('Vaal Orb results in the live data', () => {
  const { rows } = evaluateGems(GEMS, fixtureLookup)
  const byName = new Map(rows.map(r => [r.gem.refName, r]))
  const statuses = (name: string) => Object.fromEntries(byName.get(name)!.outcomes.map(o => [o.id, o.status]))

  it('finds every result poe.ninja lists for a normal gem', () => {
    expect(statuses('Molten Shell')).toEqual({
      unchanged: 'priced',
      vaal: 'priced',
      'level-up': 'priced',
      'level-down': 'not-listed',
      'quality-23': 'priced',
      'quality-21-22': 'priced',
      'quality-16-19': 'priced',
      'quality-10-15': 'priced'
    })
    expect(byName.get('Molten Shell')!.outcomes.find(o => o.id === 'vaal')!.vaalName).toBe('Vaal Molten Shell')
    // Arc has no 20/23c listing right now, so its EV is a lower bound
    expect(statuses('Arc')).toMatchObject({ 'quality-23': 'missing', 'quality-10-15': 'not-listed' })
    expect(byName.get('Arc')!.evIncomplete).toBe(true)
  })

  it('finds the Vaal version of a transfigured gem', () => {
    const vaal = byName.get('Arc of Oscillating')!.outcomes.find(o => o.id === 'vaal')!
    expect(vaal).toMatchObject({ vaalName: 'Vaal Arc (Arc of Oscillating)', status: 'priced' })
  })

  it('prices exceptional and quality-irrelevant gems at their own levels', () => {
    expect(statuses('Greater Multistrike Support')).toMatchObject({
      unchanged: 'priced', 'level-up': 'priced', 'level-down': 'not-listed', 'quality-10-15': 'not-listed'
    })
    expect(statuses('Eclipse Support')).toMatchObject({ 'quality-23': 'priced' })
    for (const name of ['Enlighten Support', 'Empower Support', 'Awakened Enlighten Support']) {
      expect(byName.get(name)!.evIncomplete, name).toBe(false)
    }
  })

  it('matches the EV counts seen in the live data', () => {
    expect({
      incomplete: rows.filter(r => r.evIncomplete).length,
      positive: rows.filter(r => r.ev > 0).length
    }).toEqual({ incomplete: 281, positive: 157 })
  })
})

const DOUBLE_COUNTS = { incomplete: 394, positive: 75, aboveCap: 45 }

describe('double corruption (Lapidary Lens)', () => {
  const table = DOUBLE_CORRUPTION_GEM_OUTCOMES_UNVERIFIED
  const chance = (pred: (id: string) => boolean) => table.filter(o => pred(o.id)).reduce((s, o) => s + o.chance, 0)
  const has = (kind: string) => (id: string) => id.split('+').some(part => part.startsWith(kind))

  it('is two Vaal Orb rolls where a repeated kind does nothing (assumed model)', () => {
    expect(table.reduce((s, o) => s + o.chance, 0)).toBeCloseTo(1, 12)
    expect(new Set(table.map(o => o.id)).size).toBe(table.length)
    // no level 22 and no double quality change
    expect(table.every(o => Math.abs(o.levelDelta) <= 1)).toBe(true)
    expect(table.every(o => o.id.split('+').filter(p => p.startsWith('quality')).length <= 1)).toBe(true)
    // nothing twice: 1/16
    expect(chance(id => id === 'unchanged')).toBeCloseTo(1 / 16)
    // a kind shows up when either roll lands on it: 1 - (3/4)^2 = 7/16
    expect(chance(has('vaal'))).toBeCloseTo(7 / 16)
    expect(chance(has('quality'))).toBeCloseTo(7 / 16)
    expect(chance(has('level-up'))).toBeCloseTo(DOUBLE_LEVEL_UP_CHANCE)
    expect(DOUBLE_LEVEL_UP_CHANCE).toBeCloseTo(7 / 32)
    // two different kinds: 2/16 per pair, then the spreads
    expect(chance(id => id === 'level-up+quality-23')).toBeCloseTo(2 / 16 * 0.5 * 0.4)
    // a single kind alone: rolled with nothing (2/16) or rolled twice (1/16)
    expect(chance(id => id === 'level-up')).toBeCloseTo(3 / 16 * 0.5)
    expect(table.find(o => o.id === 'level-up+quality-23')).toMatchObject({ levelDelta: 1, quality: '23', lookupQuality: 23 })
    expect(table.find(o => o.id === 'vaal+level-up')).toMatchObject({ vaal: true, levelDelta: 1, lookupQuality: 20 })
  })

  const ARC = {
    ...CURRENCY,
    'Arc|20/20': 100,
    'Arc|21/20c': 500,
    'Arc|21/23c': 700,
    'Arc|20/20c': 60,
    'Arc|20/23c': 150,
    'Arc|21c': 200,
    'Arc|20c': 20,
    'Vaal Arc|20/20c': 300,
    'Vaal Arc|21/20c': 400,
    'Vaal Arc|20/23c': 350,
    'Vaal Arc|20c': 30
  }
  const run = (t: Record<string, number>, temple?: number) =>
    evaluateGem(gem('Arc'), tableLookup(t), { vaalOrb: 2, gemcutter: 1, doubleCorruptTemple: temple }).row!

  it('weights every result and subtracts the temple', () => {
    const row = run(ARC, 224)
    const expected = row.doubleOutcomes.reduce((s, o) => s + o.chance * o.value, 0)
    expect(row.doubleOutcomeValue).toBeCloseTo(expected)
    expect(row.doubleCost).toBe(224)
    expect(row.doubleEv).toBeCloseTo(expected - 100 - 224)
    expect(row.doubleEvIncomplete).toBe(false)
    const v = Object.fromEntries(row.doubleOutcomes.map(o => [o.id, o]))
    expect(v['level-up+quality-23']).toMatchObject({ value: 700, level: 21, quality: 23 })
    expect(v['vaal+level-up']).toMatchObject({ value: 400, vaalName: 'Vaal Arc' })
    expect(v['vaal+quality-23']).toMatchObject({ value: 350 })
    expect(v['level-up+quality-10-15']).toMatchObject({ value: 200 })
    expect(v['quality-10-15']).toMatchObject({ value: 20 })
    expect(v.unchanged).toMatchObject({ value: 60 })
    expect(v['level-down+quality-23']).toMatchObject({ status: 'not-listed', value: 0, pricedAsLevel1: true })
  })

  it('counts level +1 at 23% at its listed price even far above 8x the 20/20 price', () => {
    const row = run({ ...ARC, 'Arc|21/23c': 5000 }, 224)
    const o = row.doubleOutcomes.find(o => o.id === 'level-up+quality-23')!
    expect(o).toMatchObject({ status: 'priced', value: 5000 })
    expect(o.aboveCap).toBeUndefined()
    expect(row.doubleEvIncomplete).toBe(false)
    // the 8x rule still applies to other results, e.g. 20/23c
    const other = run({ ...ARC, 'Arc|20/23c': 5000 }, 224)
    expect(other.doubleOutcomes.find(o => o.id === 'quality-23')).toMatchObject({ status: 'outlier', value: 0 })
  })

  it('shows EV before the temple cost when the temple has no price', () => {
    const row = run(ARC, undefined)
    expect(row.doubleCost).toBeUndefined()
    expect(row.doubleEv).toBeCloseTo(row.doubleOutcomeValue - 100)
  })

  it('marks the double EV incomplete when a listed kind of result is missing', () => {
    const without: Record<string, number> = { ...ARC }
    delete without['Arc|21/23c']
    const row = run(without, 224)
    expect(row.doubleOutcomes.find(o => o.id === 'level-up+quality-23')).toMatchObject({ status: 'missing', value: 0 })
    expect(row.doubleEvIncomplete).toBe(true)
    expect(row.evIncomplete).toBe(false)
  })

  it('reads the temple price from poe.ninja', () => {
    expect(lookupCurrency(fixtureLookup).doubleCorruptTemple).toBe(224)
    expect(DOUBLE_CORRUPT_TEMPLE).toMatchObject({ ns: 'TEMPLE', variant: 'Temple' })
  })

  it('finds double-corruption results in the live data', () => {
    const { rows } = evaluateGems(GEMS, fixtureLookup)
    const byName = new Map(rows.map(r => [r.gem.refName, r]))
    const status = (name: string, id: string) => byName.get(name)!.doubleOutcomes.find(o => o.id === id)!.status
    // 21/23c is never an outlier: Molten Shell's is 3,070c against a 90c 20/20 gem
    expect(byName.get('Molten Shell')!.doubleOutcomes.find(o => o.id === 'level-up+quality-23'))
      .toMatchObject({ status: 'priced', value: 3070 })
    expect(rows.filter(r => r.doubleOutcomes.find(o => o.id === 'level-up+quality-23')!.status === 'priced').length).toBeGreaterThan(50)
    // Vaal 21/20c and Vaal 20/23c
    expect(status('Molten Shell', 'vaal+level-up')).toBe('priced')
    expect(status('Molten Shell', 'vaal+quality-23')).toBe('priced')
    // Enlighten ignores quality, so every result uses 4c, 3c or 2c
    expect(byName.get('Enlighten Support')!.doubleEvIncomplete).toBe(false)
    expect({
      incomplete: rows.filter(r => r.doubleEvIncomplete).length,
      positive: rows.filter(r => r.doubleEv > 0).length,
      aboveCap: rows.filter(r => r.doubleEvAboveCap).length
    }).toEqual(DOUBLE_COUNTS)
  })

  it('sorts by double EV', () => {
    const { rows } = evaluateGems(GEMS, fixtureLookup)
    const sorted = sortRows(rows, 'double')
    for (let i = 1; i < sorted.length; i++) expect(sorted[i - 1].doubleEv).toBeGreaterThanOrEqual(sorted[i].doubleEv)
  })
})

describe('level-down coverage in the live data', () => {
  it('has no 1/20c listings, so level-down counts as 0 except for Enlighten and Empower', () => {
    const { rows } = evaluateGems(GEMS, fixtureLookup)
    const priced = rows.filter(r => r.outcomes.find(o => o.id === 'level-down')!.status === 'priced').map(r => r.gem.refName)
    expect(priced.sort()).toEqual(['Empower Support', 'Enlighten Support'])
  })
})
