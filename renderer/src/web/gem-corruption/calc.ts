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
 * USER-CONFIRMED (not found in a source): the quality change within "up to 10%" is evenly
 * weighted, 1-10, which is what splits the two quality halves into the rows below.
 */
/** Quality after corrupting a 20% gem. */
export type QualityRange = '20' | '23' | '21-22' | '16-19' | '10-15'

/**
 * Quality used for the poe.ninja lookup. poe.ninja lists corrupted gems at 20% (which covers
 * 16-20%), 23% and "no quality", so 21-22% is priced as 20% and 10-15% as the no-quality
 * listing: stand-ins that undervalue those results a little.
 */
const LOOKUP_QUALITY: Record<QualityRange, number> = { '20': 20, '23': 23, '21-22': 20, '16-19': 20, '10-15': 0 }

interface Effect { id: string, chance: number, levelDelta?: number, quality?: QualityRange, vaal?: true }

/** The four equally likely kinds of Vaal Orb result, each with its own spread. */
const CORRUPTION_KINDS: ReadonlyArray<readonly Effect[]> = [
  [{ id: 'unchanged', chance: 1 }],
  [{ id: 'vaal', chance: 1, vaal: true }],
  [
    { id: 'level-up', chance: 0.5, levelDelta: 1 },
    { id: 'level-down', chance: 0.5, levelDelta: -1 }
  ],
  [
    // +1..+10 from 20% (user-confirmed even split): +3 or more hits the 23% cap
    { id: 'quality-23', chance: 0.5 * 0.8, quality: '23' },
    { id: 'quality-21-22', chance: 0.5 * 0.2, quality: '21-22' },
    // -1..-10 from 20% (user-confirmed even split)
    { id: 'quality-16-19', chance: 0.5 * 0.4, quality: '16-19' },
    { id: 'quality-10-15', chance: 0.5 * 0.6, quality: '10-15' }
  ]
]

export interface OutcomeSpec {
  /** e.g. "level-up", or "level-up+quality-23" for a double corruption */
  id: string
  chance: number
  levelDelta: number
  quality: QualityRange
  lookupQuality: number
  vaal?: true
}

function kindIndex (effect: Effect) {
  return CORRUPTION_KINDS.findIndex(kind => kind.some(e => e.id === effect.id))
}

function toSpec (effects: readonly Effect[], chance: number): OutcomeSpec {
  // canonical order (Vaal, level, quality) so both roll orders give the same id
  const applied = effects.filter(e => e.id !== 'unchanged').sort((a, b) => kindIndex(a) - kindIndex(b))
  const quality = applied.find(e => e.quality)?.quality ?? '20'
  return {
    id: applied.length ? applied.map(e => e.id).join('+') : 'unchanged',
    chance,
    levelDelta: applied.reduce((sum, e) => sum + (e.levelDelta ?? 0), 0),
    quality,
    lookupQuality: LOOKUP_QUALITY[quality],
    ...(applied.some(e => e.vaal) ? { vaal: true as const } : {})
  }
}

/** One Vaal Orb: one kind of result, 25% each. */
export const VAAL_ORB_GEM_OUTCOMES: readonly OutcomeSpec[] = CORRUPTION_KINDS.flatMap(kind =>
  kind.map(effect => toSpec([effect], effect.chance / CORRUPTION_KINDS.length)))

/*
 * Double corruption: the Lapidary Lens in Doryani's Institute (the tier 3 room of the
 * Temple of Atzoatl's gem line) corrupts a gem twice. One gem per temple is assumed.
 * Still in the game in 3.29: the 3.29.0 patch notes
 * (https://www.pathofexile.com/forum/view-thread/3985332) change the Locus of Corruption in
 * the same temple, and poe.ninja prices "Doryani's Institute (Tier 3)" temples in Allflame.
 *
 * Sources, none from GGG and none with odds:
 * - maxroll.gg "Corruption Explained" (2025-02-08): "corrupts the gem twice successively,
 *   with exactly the same options" as a Vaal Orb; "a 21/23 gem or a 21 Vaal gem" possible.
 * - poewiki/fandom "Doryani's Institute", quoted in
 *   https://www.pathofexile.com/forum/view-thread/2978546 (2020): "It will not roll the same
 *   outcome twice" (so no level 22).
 * - https://www.pathofexile.com/forum/view-thread/3340560 (2023): "you cannot roll the same
 *   category twice".
 *
 * ASSUMED MODEL (user-provided; consistent with the sources, but not confirmed by them, since
 * none says whether a repeat is re-rolled or lost): two independent Vaal Orb rolls from the
 * single table above. If the second lands on the same kind as the first - no change, Vaal,
 * level change (+1 or -1) or quality change (up or down) - the second roll is no change. So
 * two quality rolls give one quality change and two level rolls one level change. If one
 * roll makes the gem its Vaal version, the other applies to the Vaal gem normally (level,
 * quality or no change); a Vaal roll on a gem with no Vaal version is no change. The gem is
 * never destroyed.
 */
export const DOUBLE_CORRUPTION_GEM_OUTCOMES_UNVERIFIED: readonly OutcomeSpec[] = (() => {
  const merged = new Map<string, OutcomeSpec>()
  const kinds = CORRUPTION_KINDS.length
  for (let i = 0; i < kinds; i++) {
    for (let j = 0; j < kinds; j++) {
      for (const a of CORRUPTION_KINDS[i]) {
        // a repeated kind: the second roll does nothing
        const seconds = (i === j) ? [{ id: 'unchanged', chance: 1 }] : CORRUPTION_KINDS[j]
        for (const b of seconds) {
          const spec = toSpec([a, b], a.chance * b.chance / (kinds * kinds))
          const prev = merged.get(spec.id)
          merged.set(spec.id, prev ? { ...prev, chance: prev.chance + spec.chance } : spec)
        }
      }
    }
  }
  return [...merged.values()]
})()

export const LEVEL_UP_CHANCE = 0.125

/** Chance a double corruption ends one level above max: either roll is a level change (7/16), and it's +1 half the time. */
export const DOUBLE_LEVEL_UP_CHANCE = 7 / 32

/** poe.ninja's name for a temple with Doryani's Institute, whose Lapidary Lens double-corrupts one gem. */
export const DOUBLE_CORRUPT_TEMPLE = { ns: 'TEMPLE', name: "Doryani's Institute (Tier 3)", variant: 'Temple' }

/**
 * Results poe.ninja seldom lists: a gem one level below max (priced from the level 1
 * corrupted listing, which most gems lack), and the no-quality corrupted listing that stands
 * in for 10-15% (missing for about half the gems). Without a price they count as 0 without
 * marking the EV incomplete; they're the least valuable results, so 0 is a conservative
 * floor rather than a gap worth flagging.
 */
function rarelyListed (spec: OutcomeSpec) {
  return spec.levelDelta < 0 || spec.quality === '10-15'
}

/**
 * - `priced`: poe.ninja has a price (see `aboveCap` for Vaal versions)
 * - `missing`: poe.ninja usually lists this result but not for this gem; counted as 0 and
 *   the EV is marked incomplete (a lower bound)
 * - `outlier`: a non-Vaal result listed above MAX_PRICE_MULTIPLE x the 20/20 price; counted
 *   as 0 and the EV is marked incomplete
 * - `not-listed`: a rarely listed result with no price; counted as 0
 */
export type OutcomeStatus = 'priced' | 'missing' | 'outlier' | 'not-listed'

export interface OutcomeValue {
  id: string
  chance: number
  levelDelta: number
  qualityRange: QualityRange
  vaal?: true
  status: OutcomeStatus
  /** chaos counted in the EV: the listed price when priced, otherwise 0 */
  value: number
  /** what poe.ninja reported, also for outliers */
  listedPrice?: number
  /** listed above the buy price for a result that's no better than the gem bought, so valued at the buy price */
  capped?: true
  /**
   * A Vaal version listed above MAX_PRICE_MULTIPLE x the 20/20 price. Counted at the listed
   * price, but it may be a single ask, so the row warns about it.
   */
  aboveCap?: true
  /** a below-max result priced from the gem's level 1 corrupted listing at the same quality */
  pricedAsLevel1?: true
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
  /** every double-corruption (Lapidary Lens) result with its chance and value */
  doubleOutcomes: OutcomeValue[]
  doubleOutcomeValue: number
  /** price of a temple with Doryani's Institute, if poe.ninja has one */
  doubleCost: number | undefined
  /** expected profit per double corruption: doubleOutcomeValue - buyCost - doubleCost (0 if unknown) */
  doubleEv: number
  doubleEvIncomplete: boolean
  /** ev and doubleEv with Vaal-version prices above the outlier cap counted as 0 */
  evWithoutAboveCap: number
  doubleEvWithoutAboveCap: number
  /** some Vaal-version price in ev / doubleEv is above the outlier cap */
  evAboveCap: boolean
  doubleEvAboveCap: boolean
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
  /** a temple with Doryani's Institute; optional so older callers can leave it out */
  doubleCorruptTemple?: number
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
    gemcutter: lookup({ ns: 'ITEM', name: "Gemcutter's Prism", variant: undefined })?.chaos,
    doubleCorruptTemple: lookup(DOUBLE_CORRUPT_TEMPLE)?.chaos
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
  const base = resolve(VAAL_RENAMED[normalName] ?? `Vaal ${normalName}`)
  if (!base?.gem?.vaal) return undefined
  return {
    base,
    ninjaName: gem.gem?.transfigured ? `${base.refName} (${gem.refName})` : base.refName
  }
}

/**
 * Vaal gems whose name isn't "Vaal " + the gem's name. Checked against every Vaal gem in
 * items.ndjson by the tests, and against poe.ninja's names (e.g. "Vaal Domination
 * (Dominating Blow of Inspiring)") on 2026-10-04.
 */
export const VAAL_RENAMED: Readonly<Record<string, string>> = {
  'Dominating Blow': 'Vaal Domination',
  'Purity of Fire': 'Vaal Impurity of Fire',
  'Purity of Ice': 'Vaal Impurity of Ice',
  'Purity of Lightning': 'Vaal Impurity of Lightning'
}

function withoutVaal (table: readonly OutcomeSpec[]): OutcomeSpec[] {
  const merged = new Map<string, OutcomeSpec>()
  for (const spec of table) {
    const id = spec.id.split('+').filter(part => part !== 'vaal').join('+') || 'unchanged'
    const prev = merged.get(id)
    if (prev) {
      merged.set(id, { ...prev, chance: prev.chance + spec.chance })
    } else {
      const plain: OutcomeSpec = { ...spec, id }
      delete plain.vaal
      merged.set(id, plain)
    }
  }
  return [...merged.values()]
}

/** "21/20c" -> 21, "4c" -> 4 */
function variantLevel (variant: string) {
  return parseInt(variant, 10)
}

function corruptedGem (info: BaseType, level: number, quality: number) {
  return createVirtualItem({ category: ItemCategory.Gem, info, gemLevel: level, quality, isCorrupted: true })
}

/**
 * Prices every result in `table` (default: one Vaal Orb) for a gem bought at max level and
 * 20% quality. `outlierCap`: prices above it are ignored. `buyCost`: what the gem cost.
 */
export function outcomeValues (
  gem: BaseType,
  lookup: PriceLookup,
  opts: { outlierCap?: number, buyCost?: number, table?: readonly OutcomeSpec[] },
  resolve: GemResolver = resolveFromItems
): OutcomeValue[] {
  const { outlierCap, buyCost, table = VAAL_ORB_GEM_OUTCOMES } = opts
  const maxLevel = gem.gem!.maxLevel
  const vaal = vaalVersion(gem, resolve)
  // Without a Vaal version the Vaal result is no change, so fold it into the matching result.
  const specs = vaal ? table : withoutVaal(table)
  return specs.map((spec): OutcomeValue => {
    const level = maxLevel + spec.levelDelta
    const quality = spec.lookupQuality
    const vaalName = (spec.vaal && vaal) ? vaal.ninjaName : undefined
    const base = {
      id: spec.id,
      chance: spec.chance,
      levelDelta: spec.levelDelta,
      qualityRange: spec.quality,
      ...(spec.vaal ? { vaal: true as const } : {}),
      level,
      quality,
      vaalName
    }

    const queryAt = (atLevel: number) => (spec.vaal && vaal)
      ? { ...forSkillGem(corruptedGem(vaal.base, atLevel, quality)), name: vaal.ninjaName }
      : forSkillGem(corruptedGem(gem, atLevel, quality))
    let query = queryAt(level)
    let pricedAsLevel1: { pricedAsLevel1: true } | undefined
    // poe.ninja doesn't list gems one level below max (except Enlighten/Empower/Enhance,
    // which forSkillGem maps to e.g. "2c"). A corrupted gem below max is worth about as much
    // as a level 1 corrupted one, so use that listing, at the same quality: "1/20c" for a
    // 20% result, never "1/23c", which is a different (often pricey) gem.
    if (variantLevel(query.variant) !== level) {
      query = queryAt(1)
      pricedAsLevel1 = { pricedAsLevel1: true }
    }
    const listedPrice = lookup(query)?.chaos
    if (listedPrice === undefined) {
      return { ...base, ...pricedAsLevel1, status: rarelyListed(spec) ? 'not-listed' : 'missing', value: 0 }
    }
    // Level +1 at 23% (e.g. 21/23c) is the jackpot and really can be worth over 16x the gem,
    // so it's never treated as an outlier (user's call).
    const jackpot = spec.levelDelta > 0 && spec.quality === '23' && !vaalName
    if (!jackpot && outlierCap !== undefined && listedPrice > outlierCap) {
      // A Vaal version is a different item and can be worth far more than the gem; count
      // its listed price but flag it, since it may be a single ask.
      if (vaalName) {
        return { ...base, ...pricedAsLevel1, status: 'priced', value: listedPrice, listedPrice, aboveCap: true }
      }
      return { ...base, ...pricedAsLevel1, status: 'outlier', value: 0, listedPrice }
    }
    // A corrupted gem that came out no better than it went in can't be worth more than an
    // uncorrupted one, which anyone can buy for buyCost. poe.ninja often shows such gems at
    // round "1 divine" asks far above that.
    const noBetter = (spec.levelDelta < 0 || (spec.levelDelta === 0 && spec.quality !== '23')) && !vaalName
    if (noBetter && buyCost !== undefined && listedPrice > buyCost) {
      return { ...base, ...pricedAsLevel1, status: 'priced', value: buyCost, listedPrice, capped: true }
    }
    return { ...base, ...pricedAsLevel1, status: 'priced', value: listedPrice, listedPrice }
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
  const doubleOutcomes = outcomeValues(gem, lookup,
    { outlierCap, buyCost, table: DOUBLE_CORRUPTION_GEM_OUTCOMES_UNVERIFIED }, resolve)
  const doubleOutcomeValue = doubleOutcomes.reduce((sum, o) => sum + o.chance * o.value, 0)
  const doubleCost = currency.doubleCorruptTemple
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
      evIncomplete: isIncomplete(outcomes),
      doubleOutcomes,
      doubleOutcomeValue,
      doubleCost,
      doubleEv: doubleOutcomeValue - buyCost - (doubleCost ?? 0),
      doubleEvIncomplete: isIncomplete(doubleOutcomes),
      evWithoutAboveCap: outcomeValue - aboveCapValue(outcomes) - buyCost - currency.vaalOrb,
      doubleEvWithoutAboveCap: doubleOutcomeValue - aboveCapValue(doubleOutcomes) - buyCost - (doubleCost ?? 0),
      evAboveCap: outcomes.some(o => o.aboveCap),
      doubleEvAboveCap: doubleOutcomes.some(o => o.aboveCap)
    }
  }
}

function isIncomplete (outcomes: readonly OutcomeValue[]) {
  return outcomes.some(o => o.status === 'missing' || o.status === 'outlier')
}

function aboveCapValue (outcomes: readonly OutcomeValue[]) {
  return outcomes.reduce((sum, o) => sum + (o.aboveCap ? o.chance * o.value : 0), 0)
}

export type SortKey = 'ev' | 'double' | 'profit'

const SORT_VALUE: Record<SortKey, (row: GemFlipRow) => number> = {
  ev: row => row.ev,
  double: row => row.doubleEv,
  profit: row => row.profit
}

export function sortRows (rows: readonly GemFlipRow[], by: SortKey): GemFlipRow[] {
  const value = SORT_VALUE[by] ?? SORT_VALUE.ev
  return [...rows].sort((a, b) => value(b) - value(a))
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
