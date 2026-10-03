import { ITEM_BY_REF, type BaseType } from '@/assets/data'
import type { ParsedItem } from '@/parser'
import { ItemCategory } from '@/parser/meta'
import { createVirtualItem } from '@/parser/ParsedItem'
import { forSkillGem, SPECIAL_SUPPORT_GEM } from '@/web/price-check/trends/gem-variant'

export interface PriceQuery {
  ns: string
  name: string
  variant: string | undefined
}

export type PriceLookup = (query: PriceQuery) => { chaos: number } | null

/** Finds a gem by its English name; defaults to the loaded items data. */
export type GemResolver = (refName: string) => BaseType | undefined

const resolveFromItems: GemResolver = (refName) => ITEM_BY_REF('GEM', refName)?.[0]

// poe.ninja's dense overview has no listing count or confidence, so a thinly listed
// corrupted variant can report a single absurd ask. A +1 level is a small buff to the
// same gem, so anything priced past this multiple of the 20/20 gem is treated as noise.
export const MAX_PRICE_MULTIPLE = 8
export const GEMCUTTER_COUNT = 20
// 0 = off. The fork used 7x as a stand-in for an expected value; now that rows carry a
// real EV the ratio filter is opt-in.
export const DEFAULT_MIN_RATIO = 0
export const DEFAULT_ATTEMPTS = 10
export const MAX_ATTEMPTS = 20

/*
 * What a Vaal Orb does to a skill or support gem in PoE1: four equally likely results.
 * - nothing happens (the gem is only corrupted)
 * - the gem turns into its Vaal version; a gem without one stays unchanged
 * - +1 or -1 level (50/50); +1 can go one past the gem's max level
 * - +/- up to 10% quality (50/50), capped at 23%
 *
 * Sources: maxroll.gg "Corruption Explained", updated 2025-02-08 (PoE 3.25),
 * https://maxroll.gg/poe/resources/corruption ; pathofexile.com forum thread
 * https://www.pathofexile.com/forum/view-thread/3188012 (2021: "corrupting gems hasnt
 * changed in a while") ; GGG's 3.14.0 patch-note correction (Novynn, 2021-04-16,
 * https://www.pathofexile.com/forum/view-thread/3080886) that corrupting gems still
 * yields Vaal gems. No later patch note we found (through 3.27.0) changes gem corruption.
 * poewiki.net could not be read (bot check).
 *
 * UNVERIFIED: how the quality change is distributed within "up to 10%". It is modelled as
 * a uniform 1-10, which is what splits the two quality halves into the rows below.
 */
export type OutcomeId =
  | 'unchanged' | 'vaal' | 'level-up' | 'level-down' |
  'quality-23' | 'quality-21-22' | 'quality-16-19' | 'quality-10-15'

export interface OutcomeSpec {
  id: OutcomeId
  chance: number
  levelDelta: -1 | 0 | 1
  /**
   * Quality used for the poe.ninja lookup. poe.ninja lists corrupted gems at 20% (which
   * covers 16-20%), 23% and "no quality", so 21-22% is priced as 20% and 10-15% as the
   * no-quality listing: stand-ins that undervalue those results a little.
   */
  lookupQuality: number
  vaal?: true
}

export const VAAL_ORB_GEM_OUTCOMES: readonly OutcomeSpec[] = [
  { id: 'unchanged', chance: 0.25, levelDelta: 0, lookupQuality: 20 },
  { id: 'vaal', chance: 0.25, levelDelta: 0, lookupQuality: 20, vaal: true },
  { id: 'level-up', chance: 0.125, levelDelta: 1, lookupQuality: 20 },
  { id: 'level-down', chance: 0.125, levelDelta: -1, lookupQuality: 20 },
  // +1..+10 from 20% (unverified uniform split): +3 or more hits the 23% cap
  { id: 'quality-23', chance: 0.125 * 0.8, levelDelta: 0, lookupQuality: 23 },
  { id: 'quality-21-22', chance: 0.125 * 0.2, levelDelta: 0, lookupQuality: 20 },
  // -1..-10 from 20% (unverified uniform split)
  { id: 'quality-16-19', chance: 0.125 * 0.4, levelDelta: 0, lookupQuality: 20 },
  { id: 'quality-10-15', chance: 0.125 * 0.6, levelDelta: 0, lookupQuality: 0 }
]

export const LEVEL_UP_CHANCE = 0.125

/**
 * Results poe.ninja seldom or never lists: a gem one level below max (never), and the
 * no-quality corrupted listing that stands in for 10-15% (missing for about half the gems).
 * Without a price they count as 0 without marking the EV incomplete; they're the least
 * valuable results, so 0 is a conservative floor rather than a gap worth flagging.
 */
const RARELY_LISTED = new Set<OutcomeId>(['level-down', 'quality-10-15'])

/**
 * - `priced`: poe.ninja has a price
 * - `missing`: poe.ninja usually lists this result but not for this gem; counted as 0 and
 *   the EV is marked incomplete (a lower bound)
 * - `outlier`: listed above MAX_PRICE_MULTIPLE x the 20/20 price and ignored; counted as 0
 *   and the EV is marked incomplete
 * - `not-listed`: a RARELY_LISTED result with no price; counted as 0
 */
export type OutcomeStatus = 'priced' | 'missing' | 'outlier' | 'not-listed'

export interface OutcomeValue {
  id: OutcomeId
  chance: number
  status: OutcomeStatus
  /** chaos counted in the EV: the listed price when priced, otherwise 0 */
  value: number
  /** what poe.ninja reported, also for outliers */
  listedPrice?: number
  /** listed above the buy price for a result that's no better than the gem bought, so valued at the buy price */
  capped?: true
  level: number
  quality: number
  /** poe.ninja name of the Vaal gem for the `vaal` outcome, when the gem has one */
  vaalName?: string
}

export type BuyRoute = 'full-quality' | 'gemcutter'

export interface GemFlipRow {
  gem: BaseType
  /** level of the gem you buy (its max level) */
  buyLevel: number
  /** level of the corrupted gem you hope to sell (max level + 1) */
  sellLevel: number
  buyRoute: BuyRoute
  /** chaos cost of a max-level 20% gem, via the cheaper route */
  buyCost: number
  fullQualityPrice: number | undefined
  noQualityPrice: number | undefined
  sellPrice: number
  vaalOrbPrice: number
  gemcutterPrice: number | undefined
  /** profit if the Vaal Orb rolls +1 level: sell - buy - Vaal Orb. Not an expected value. */
  profit: number
  /** profit / buyCost */
  margin: number
  /** sellPrice / buyCost */
  ratio: number
  /**
   * poe.ninja has no max-level 20% price for this gem, so the row's buy price comes only
   * from the 0% + Gemcutter's Prism route and the outlier check could not run.
   */
  unconfirmed: boolean
  /** every Vaal Orb result with its chance and value */
  outcomes: OutcomeValue[]
  /** sum of chance x value over the results */
  outcomeValue: number
  /** expected profit per Vaal Orb: outcomeValue - buyCost - vaalOrbPrice */
  ev: number
  /** a result poe.ninja normally lists has no usable price, so ev is a lower bound */
  evIncomplete: boolean
}

/**
 * Why a gem has no row:
 * - `vaal-gem`: Vaal gems are what a corruption can turn a gem into, not something you corrupt
 * - `no-vaal-orb-price`: no Vaal Orb price, so nothing can be costed
 * - `no-buy-price`: poe.ninja has neither a max-level 20% price nor a max-level 0% price
 *   (with a Gemcutter's Prism price) for the gem
 * - `no-sell-price`: poe.ninja has no corrupted max level + 1 price for the gem
 * - `sell-outlier`: the corrupted max level + 1 price is above MAX_PRICE_MULTIPLE x the 20/20 price
 */
export type ExclusionReason = 'vaal-gem' | 'no-vaal-orb-price' | 'no-buy-price' | 'no-sell-price' | 'sell-outlier'

export type GemEvaluation =
  | { gem: BaseType, row: GemFlipRow, reason?: undefined }
  | { gem: BaseType, row?: undefined, reason: ExclusionReason }

export interface CurrencyPrices {
  vaalOrb: number | undefined
  gemcutter: number | undefined
}

export function isAwakened (gem: BaseType): boolean {
  return gem.refName.startsWith('Awakened ')
}

/** Enlighten/Empower/Enhance and their awakened versions: quality has no effect at max level. */
export function isQualityIrrelevant (gem: BaseType): boolean {
  return SPECIAL_SUPPORT_GEM.includes(gem.refName.replace(/^Awakened /, ''))
}

export function isTransfigured (gem: BaseType): boolean {
  return gem.gem?.transfigured === true
}

/** The gem you buy and Vaal: max level, uncorrupted. */
export function buyItem (gem: BaseType, quality: number): ParsedItem {
  return createVirtualItem({
    category: ItemCategory.Gem,
    info: gem,
    gemLevel: gem.gem!.maxLevel,
    quality
  })
}

/**
 * Quality for the Buy price check. Via prisms, any quality will do (you top it up
 * yourself); for gems where quality doesn't matter, any quality is equivalent.
 * Quality 0 means price check adds no quality filter.
 */
export function buyQuality (row: GemFlipRow): number {
  return (row.buyRoute === 'gemcutter' || isQualityIrrelevant(row.gem)) ? 0 : 20
}

/** The outcome being priced: max level + 1, 20% quality, corrupted. */
export function sellItem (gem: BaseType): ParsedItem {
  return createVirtualItem({
    category: ItemCategory.Gem,
    info: gem,
    gemLevel: gem.gem!.maxLevel + 1,
    quality: 20,
    isCorrupted: true
  })
}

export function lookupCurrency (lookup: PriceLookup): CurrencyPrices {
  return {
    vaalOrb: lookup({ ns: 'ITEM', name: 'Vaal Orb', variant: undefined })?.chaos,
    gemcutter: lookup({ ns: 'ITEM', name: "Gemcutter's Prism", variant: undefined })?.chaos
  }
}

function gemPrice (item: ParsedItem, lookup: PriceLookup) {
  return lookup(forSkillGem(item))?.chaos
}

/**
 * The gem a Vaal Orb can turn this one into, with its poe.ninja name. Transfigured gems keep
 * their transfiguration, e.g. "Vaal Arc (Arc of Oscillating)".
 */
export function vaalVersion (gem: BaseType, resolve: GemResolver = resolveFromItems): { base: BaseType, ninjaName: string } | undefined {
  const normalName = gem.gem?.transfigured ? gem.gem.normalVariant : gem.refName
  if (!normalName) return undefined
  const base = resolve(`Vaal ${normalName}`)
  if (!base?.gem?.vaal) return undefined
  return {
    base,
    ninjaName: gem.gem?.transfigured ? `Vaal ${normalName} (${gem.refName})` : base.refName
  }
}

function corruptedGem (info: BaseType, level: number, quality: number) {
  return createVirtualItem({ category: ItemCategory.Gem, info, gemLevel: level, quality, isCorrupted: true })
}

/**
 * Prices every Vaal Orb result for a gem bought at max level and 20% quality.
 * `outlierCap`: prices above it are ignored. `buyCost`: what the gem cost.
 */
export function outcomeValues (
  gem: BaseType,
  lookup: PriceLookup,
  opts: { outlierCap?: number, buyCost?: number },
  resolve: GemResolver = resolveFromItems
): OutcomeValue[] {
  const { outlierCap, buyCost } = opts
  const maxLevel = gem.gem!.maxLevel
  const vaal = vaalVersion(gem, resolve)
  return VAAL_ORB_GEM_OUTCOMES.map((spec): OutcomeValue => {
    const level = maxLevel + spec.levelDelta
    const quality = spec.lookupQuality
    const vaalName = (spec.vaal && vaal) ? vaal.ninjaName : undefined
    const base = { id: spec.id, chance: spec.chance, level, quality, vaalName }

    const query = (spec.vaal && vaal)
      ? { ...forSkillGem(corruptedGem(vaal.base, level, quality)), name: vaal.ninjaName }
      : forSkillGem(corruptedGem(gem, level, quality))
    // Below max level forSkillGem falls back to the level 1 listing, which is a different
    // item; poe.ninja doesn't list max - 1 corrupted gems anyway.
    if (!query.variant.startsWith(String(level))) {
      return { ...base, status: 'not-listed', value: 0 }
    }
    const listedPrice = lookup(query)?.chaos
    if (listedPrice === undefined) {
      return { ...base, status: RARELY_LISTED.has(spec.id) ? 'not-listed' : 'missing', value: 0 }
    }
    // Applies to the Vaal version too: those are often thinly listed, and a single
    // absurd ask would otherwise dominate the EV.
    if (outlierCap !== undefined && listedPrice > outlierCap) {
      return { ...base, status: 'outlier', value: 0, listedPrice }
    }
    // A corrupted gem that came out no better than it went in can't be worth more than an
    // uncorrupted one, which anyone can buy for buyCost. poe.ninja often shows such gems at
    // round "1 divine" asks far above that.
    const noBetter = spec.levelDelta === 0 && spec.lookupQuality <= 20 && !vaalName
    if (noBetter && buyCost !== undefined && listedPrice > buyCost) {
      return { ...base, status: 'priced', value: buyCost, listedPrice, capped: true }
    }
    return { ...base, status: 'priced', value: listedPrice, listedPrice }
  })
}

/** Chance of at least one +1 level in n Vaal Orbs (one per gem). */
export function chanceOfLevelUp (n: number): number {
  return 1 - Math.pow(1 - LEVEL_UP_CHANCE, n)
}

/**
 * Chance that n attempts (buy a gem, Vaal it, sell the result at its listed price) bring in
 * more than they cost. Results without a usable price count as 0, as in the EV.
 */
export function chanceOfProfit (outcomes: readonly OutcomeValue[], costPerTry: number, n: number): number {
  // Merge results with the same value, then convolve n times. Sums are kept in 1/100 chaos.
  const merged = new Map<number, number>()
  for (const o of outcomes) {
    const v = Math.round(o.value * 100)
    merged.set(v, (merged.get(v) ?? 0) + o.chance)
  }
  let dist = new Map<number, number>([[0, 1]])
  for (let i = 0; i < n; i++) {
    const next = new Map<number, number>()
    for (const [sum, p] of dist) {
      for (const [v, q] of merged) {
        next.set(sum + v, (next.get(sum + v) ?? 0) + p * q)
      }
    }
    dist = next
  }
  const cost = Math.round(costPerTry * n * 100)
  let chance = 0
  for (const [sum, p] of dist) {
    if (sum > cost) chance += p
  }
  return Math.min(1, chance)
}

export function evaluateGem (
  gem: BaseType,
  lookup: PriceLookup,
  currency: CurrencyPrices,
  resolve: GemResolver = resolveFromItems
): GemEvaluation {
  if (!gem.gem || gem.gem.vaal) return { gem, reason: 'vaal-gem' }
  if (currency.vaalOrb === undefined) return { gem, reason: 'no-vaal-orb-price' }

  // Some listings don't split by quality, so the 20% and 0% lookups hit the same entry.
  // For Enlighten/Empower/Enhance (and their awakened versions) quality doesn't matter at
  // max level, so that price is the full price. For anything else (Brand Recall, other
  // max-level awakened gems) it says nothing about quality: cost it as a 0% gem plus
  // prisms and leave the row unconfirmed.
  const fullQualityQuery = forSkillGem(buyItem(gem, 20))
  const noQualityQuery = forSkillGem(buyItem(gem, 0))
  const fullQualityPrice = (fullQualityQuery.variant !== noQualityQuery.variant || isQualityIrrelevant(gem))
    ? lookup(fullQualityQuery)?.chaos
    : undefined
  const noQualityPrice = lookup(noQualityQuery)?.chaos

  const craftCost = (noQualityPrice !== undefined && currency.gemcutter !== undefined)
    ? noQualityPrice + GEMCUTTER_COUNT * currency.gemcutter
    : undefined

  let buyRoute: BuyRoute
  let buyCost: number
  if (fullQualityPrice !== undefined && (craftCost === undefined || fullQualityPrice <= craftCost)) {
    buyRoute = 'full-quality'
    buyCost = fullQualityPrice
  } else if (craftCost !== undefined) {
    buyRoute = 'gemcutter'
    buyCost = craftCost
  } else {
    return { gem, reason: 'no-buy-price' }
  }

  const outlierCap = (fullQualityPrice !== undefined) ? fullQualityPrice * MAX_PRICE_MULTIPLE : undefined
  const sellPrice = gemPrice(sellItem(gem), lookup)
  if (sellPrice === undefined) return { gem, reason: 'no-sell-price' }
  if (outlierCap !== undefined && sellPrice > outlierCap) {
    return { gem, reason: 'sell-outlier' }
  }

  const profit = sellPrice - buyCost - currency.vaalOrb
  const outcomes = outcomeValues(gem, lookup, { outlierCap, buyCost }, resolve)
  const outcomeValue = outcomes.reduce((sum, o) => sum + o.chance * o.value, 0)
  return {
    gem,
    row: {
      gem,
      buyLevel: gem.gem.maxLevel,
      sellLevel: gem.gem.maxLevel + 1,
      buyRoute,
      buyCost,
      fullQualityPrice,
      noQualityPrice,
      sellPrice,
      vaalOrbPrice: currency.vaalOrb,
      gemcutterPrice: currency.gemcutter,
      profit,
      margin: profit / buyCost,
      ratio: sellPrice / buyCost,
      unconfirmed: fullQualityPrice === undefined,
      outcomes,
      outcomeValue,
      ev: outcomeValue - buyCost - currency.vaalOrb,
      evIncomplete: outcomes.some(o => o.status === 'missing' || o.status === 'outlier')
    }
  }
}

export type SortKey = 'ev' | 'profit'

export function sortRows (rows: readonly GemFlipRow[], by: SortKey): GemFlipRow[] {
  return [...rows].sort((a, b) => (by === 'ev') ? (b.ev - a.ev) : (b.profit - a.profit))
}

/** Evaluates every gem; rows come back sorted by profit if +1, highest first. */
export function evaluateGems (gems: Iterable<BaseType>, lookup: PriceLookup, resolve: GemResolver = resolveFromItems) {
  const currency = lookupCurrency(lookup)
  const rows: GemFlipRow[] = []
  const excluded: Array<{ gem: BaseType, reason: ExclusionReason }> = []
  for (const gem of gems) {
    const res = evaluateGem(gem, lookup, currency, resolve)
    if (res.row) {
      rows.push(res.row)
    } else {
      excluded.push({ gem, reason: res.reason })
    }
  }
  rows.sort((a, b) => b.profit - a.profit)
  return { rows, excluded, currency }
}

export interface RowFilterOptions {
  includeTransfigured: boolean
  includeAwakened: boolean
  includeUnconfirmed: boolean
  /** 0 disables the ratio filter */
  minRatio: number
  hideNegativeEv: boolean
  search: string
}

export function filterRows (rows: readonly GemFlipRow[], opts: RowFilterOptions): GemFlipRow[] {
  const search = opts.search.trim().toLowerCase()
  return rows.filter(row => {
    if (!opts.includeTransfigured && isTransfigured(row.gem)) return false
    if (!opts.includeAwakened && isAwakened(row.gem)) return false
    if (!opts.includeUnconfirmed && row.unconfirmed) return false
    if (opts.minRatio > 0 && row.ratio < opts.minRatio) return false
    if (opts.hideNegativeEv && row.ev < 0) return false
    if (search && !row.gem.name.toLowerCase().includes(search)) return false
    return true
  })
}
