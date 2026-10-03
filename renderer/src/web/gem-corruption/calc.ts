import type { BaseType } from '@/assets/data'
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

// poe.ninja's dense overview has no listing count or confidence, so a thinly listed
// corrupted variant can report a single absurd ask. A +1 level is a small buff to the
// same gem, so anything priced past this multiple of the 20/20 gem is treated as noise.
export const MAX_PRICE_MULTIPLE = 8
export const GEMCUTTER_COUNT = 20
export const DEFAULT_MIN_RATIO = 7

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

export function evaluateGem (gem: BaseType, lookup: PriceLookup, currency: CurrencyPrices): GemEvaluation {
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

  const sellPrice = gemPrice(sellItem(gem), lookup)
  if (sellPrice === undefined) return { gem, reason: 'no-sell-price' }
  if (fullQualityPrice !== undefined && sellPrice > fullQualityPrice * MAX_PRICE_MULTIPLE) {
    return { gem, reason: 'sell-outlier' }
  }

  const profit = sellPrice - buyCost - currency.vaalOrb
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
      unconfirmed: fullQualityPrice === undefined
    }
  }
}

/** Evaluates every gem; rows come back sorted by profit, highest first. */
export function evaluateGems (gems: Iterable<BaseType>, lookup: PriceLookup) {
  const currency = lookupCurrency(lookup)
  const rows: GemFlipRow[] = []
  const excluded: Array<{ gem: BaseType, reason: ExclusionReason }> = []
  for (const gem of gems) {
    const res = evaluateGem(gem, lookup, currency)
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
  search: string
}

export function filterRows (rows: readonly GemFlipRow[], opts: RowFilterOptions): GemFlipRow[] {
  const search = opts.search.trim().toLowerCase()
  return rows.filter(row => {
    if (!opts.includeTransfigured && isTransfigured(row.gem)) return false
    if (!opts.includeAwakened && isAwakened(row.gem)) return false
    if (!opts.includeUnconfirmed && row.unconfirmed) return false
    if (opts.minRatio > 0 && row.ratio < opts.minRatio) return false
    if (search && !row.gem.name.toLowerCase().includes(search)) return false
    return true
  })
}
