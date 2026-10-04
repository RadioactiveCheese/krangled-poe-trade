import type { BaseType } from '@/assets/data'
import type { ParsedItem } from '@/parser'
import { createFilters, type CreateOptions } from '@/web/price-check/filters/create-item-filters'
import {
  createTradeRequest, requestTradeResultList, requestResults,
  type PricingResult, type SearchResult
} from '@/web/price-check/trade/pathofexile-trade'
import { buyItem, sellItem, isQualityIrrelevant, GEMCUTTER_COUNT, type GemFlipRow } from './calc'

/*
 * "Validate prices": live trade searches for one row, to check poe.ninja's numbers.
 *
 * Trade API rate limits. The API returns X-Rate-Limit-Rules / X-Rate-Limit-{rule} /
 * X-Rate-Limit-{rule}-State / Retry-After on every response (format documented at
 * https://www.pathofexile.com/developer/docs/index#ratelimits), and search and fetch are
 * separate policies. The values GGG staff (Verdale) posted in
 * https://www.pathofexile.com/forum/view-thread/3056323 (2021-02-23):
 * - trade-search-request-limit: 5 per 12s, 15 per 62s, 30 per 302s (per IP)
 * - trade-fetch-request-limit: 12 per 6s, 16 per 14s
 * They may have changed since, which doesn't matter here: every request below goes through
 * requestTradeResultList / requestResults, i.e. the app's RateLimiter, which starts at
 * 1 request / 5s per policy and then follows the headers (common.ts adjustRateLimits).
 *
 * Design: up to 6 trade API calls per validation, 3 per policy: 3 of the 5 searches per
 * search window and 3 of the 12 fetches per fetch window. A search that finds nothing skips
 * its fetch.
 * - Buy search: the gem at max level, uncorrupted, any quality, cheapest first. One fetch
 *   of the 10 cheapest covers both buy routes: a 20% gem, and a lower-quality gem plus
 *   Gemcutter's Prisms. The search's `total` is the number of listings.
 * - Sell search: the gem corrupted at max level + 1 or more, any quality, cheapest first.
 *   One fetch of the 10 cheapest covers L+1/20c and L+1c; `total` shows how liquid they are.
 * - 23% sell search: the same with quality >= 23 (L+1/23c, or 4/23c for exceptional gems),
 *   which is far pricier and rarely among the cheapest listings of the search above. Skipped
 *   for Enlighten/Empower/Enhance and their awakened versions, where quality doesn't matter
 *   and poe.ninja has no 23% listing to compare with (4 calls for those).
 * Not searched: Vaal versions (a different item, often thinly listed) and same-level
 * corrupted results (20/20c, 20/23c).
 */
export const REQUESTS_PER_VALIDATION = 6
const FETCH_SIZE = 10

/** Quality a listing has to reach before it counts as a 20% gem, like poe.ninja's 16-20 bucket. */
const FULL_QUALITY_MIN = 20
/** Validated price is shown as a mismatch when it's more than this factor away from poe.ninja's. */
export const MISMATCH_FACTOR = 1.5

export type TradeOptions = Pick<CreateOptions, 'league' | 'merchantOnly' | 'currency' | 'collapseListings' | 'useEn'>

function gemFilters (item: ParsedItem, opts: TradeOptions) {
  return createFilters(item, { ...opts, activateStockFilter: false, exact: true })
}

/** Max level, uncorrupted, any quality. */
export function buySearchRequest (gem: BaseType, opts: TradeOptions) {
  const filters = gemFilters(buyItem(gem, 0), opts)
  filters.gemLevel = { value: gem.gem!.maxLevel, disabled: false }
  filters.corrupted = { value: false }
  delete filters.quality
  return createTradeRequest(filters, [])
}

/** Corrupted, max level + 1 or more, any quality. */
export function sellSearchRequest (gem: BaseType, opts: TradeOptions) {
  const filters = gemFilters(sellItem(gem), opts)
  filters.gemLevel = { value: gem.gem!.maxLevel + 1, disabled: false }
  filters.corrupted = { value: true, exact: true }
  delete filters.quality
  return createTradeRequest(filters, [])
}

/** Corrupted, max level + 1 or more, 23% quality or more. */
export function sell23SearchRequest (gem: BaseType, opts: TradeOptions) {
  const filters = gemFilters(sellItem(gem), opts)
  filters.gemLevel = { value: gem.gem!.maxLevel + 1, disabled: false }
  filters.corrupted = { value: true, exact: true }
  filters.quality = { value: 23, disabled: false }
  return createTradeRequest(filters, [])
}

/** Whether the 23% sell search is worth running for this gem. */
export function needs23Search (gem: BaseType) {
  return !isQualityIrrelevant(gem)
}

export interface TradeClient {
  search: (body: ReturnType<typeof createTradeRequest>, league: string) => Promise<SearchResult>
  fetch: (queryId: string, ids: string[]) => Promise<PricingResult[]>
}

export function appTradeClient (accountName: string): TradeClient {
  return {
    search: async (body, league) => await requestTradeResultList(body, league),
    fetch: async (queryId, ids) => await requestResults(queryId, ids, { accountName })
  }
}

/** Chaos value of one unit of a trade-site currency id ("chaos", "divine", "exalted", ...). */
export type CurrencyToChaos = (currency: string) => number | undefined

/**
 * Converts with poe.ninja: chaos is 1, divine uses the app's divine rate, and anything else
 * is looked up by the item whose trade tag matches the currency id.
 */
export function currencyToChaos (
  divine: number | undefined,
  refNameByTradeTag: (tag: string) => string | undefined,
  findChaos: (refName: string) => number | undefined
): CurrencyToChaos {
  return (currency) => {
    if (currency === 'chaos') return 1
    if (currency === 'divine') return divine
    const refName = refNameByTradeTag(currency)
    return refName ? findChaos(refName) : undefined
  }
}

export interface ValidatedListing {
  chaos: number
  quality: number
  level: number
}

export interface PriceCheck {
  /** cheapest validated price, chaos */
  trade: number | undefined
  /** listings that went into `trade` (among the fetched ones) */
  count: number
  ninja: number | undefined
  mismatch: boolean
}

export interface ValidationResult {
  at: number
  league: string
  requests: number
  buy: {
    total: number
    listings: ValidatedListing[]
    /** cheapest 20% gem */
    fullQuality: PriceCheck
    /** cheapest gem plus the prisms to take it to 20% */
    viaPrisms: PriceCheck
  }
  sell: {
    total: number
    listings: ValidatedListing[]
    /** listings found by the 23% sell search; undefined when it wasn't run */
    total23: number | undefined
    listings23: ValidatedListing[]
    /** +1 level at 20% (16-22%) */
    quality20: PriceCheck
    /** +1 level at 23% */
    quality23: PriceCheck
    /** +1 level below 16% */
    lowQuality: PriceCheck
  }
  /** fetched listings whose price couldn't be converted to chaos */
  unconverted: number
}

function numberIn (text: string | undefined): number {
  const m = /\d+/.exec(text ?? '')
  return m ? Number(m[0]) : 0
}

export function normalizeListings (results: readonly PricingResult[], toChaos: CurrencyToChaos) {
  const listings: ValidatedListing[] = []
  let unconverted = 0
  for (const r of results) {
    const rate = toChaos(r.priceCurrency)
    if (rate === undefined || !r.priceAmount) {
      unconverted++
      continue
    }
    listings.push({ chaos: r.priceAmount * rate, quality: numberIn(r.quality), level: numberIn(r.level) })
  }
  listings.sort((a, b) => a.chaos - b.chaos)
  return { listings, unconverted }
}

export function priceCheck (prices: readonly number[], ninja: number | undefined): PriceCheck {
  const trade = prices.length ? Math.min(...prices) : undefined
  return {
    trade,
    count: prices.length,
    ninja,
    mismatch: trade !== undefined && ninja !== undefined && ninja > 0 &&
      (trade > ninja * MISMATCH_FACTOR || trade * MISMATCH_FACTOR < ninja)
  }
}

export function bucketBuy (row: GemFlipRow, listings: readonly ValidatedListing[]) {
  const qualityIrrelevant = isQualityIrrelevant(row.gem)
  const gcp = row.gemcutterPrice
  const full = listings.filter(l => qualityIrrelevant || l.quality >= FULL_QUALITY_MIN).map(l => l.chaos)
  const viaPrisms = (gcp === undefined || qualityIrrelevant)
    ? []
    : listings.map(l => l.chaos + Math.max(0, Math.min(GEMCUTTER_COUNT, FULL_QUALITY_MIN - l.quality)) * gcp)
  const ninjaCraft = (row.noQualityPrice !== undefined && gcp !== undefined && !qualityIrrelevant)
    ? row.noQualityPrice + GEMCUTTER_COUNT * gcp
    : undefined
  return {
    fullQuality: priceCheck(full, row.fullQualityPrice),
    viaPrisms: priceCheck(viaPrisms, ninjaCraft)
  }
}

/**
 * `listings` come from the any-quality sell search, `listings23` from the 23% one. 23%
 * listings from either count towards L+1/23c.
 */
export function bucketSell (row: GemFlipRow, listings: readonly ValidatedListing[], listings23: readonly ValidatedListing[] = []) {
  const at = (id: string) => row.outcomes.find(o => o.id === id)?.listedPrice ??
    row.doubleOutcomes.find(o => o.id === id)?.listedPrice
  if (isQualityIrrelevant(row.gem)) {
    return {
      quality20: priceCheck(listings.map(l => l.chaos), row.sellPrice),
      quality23: priceCheck([], undefined),
      lowQuality: priceCheck([], undefined)
    }
  }
  return {
    quality20: priceCheck(listings.filter(l => l.quality >= 16 && l.quality < 23).map(l => l.chaos), row.sellPrice),
    quality23: priceCheck([...listings, ...listings23].filter(l => l.quality >= 23).map(l => l.chaos), at('level-up+quality-23')),
    lowQuality: priceCheck(listings.filter(l => l.quality < 16).map(l => l.chaos), at('level-up+quality-10-15'))
  }
}

export type ValidationProgress = (step: 'buy' | 'sell' | 'sell23' | 'waiting', waitSeconds?: number) => void

const RETRY_AFTER = /Retry after (\d+) seconds/
const MAX_WAITS = 5

/**
 * The app's search throws "Retry after N seconds" rather than queueing behind the rate
 * limiter; wait it out (and say so) instead of failing.
 */
async function searchWithWait (
  client: TradeClient, body: ReturnType<typeof createTradeRequest>, league: string,
  onProgress: ValidationProgress, sleep: (ms: number) => Promise<void>
): Promise<SearchResult> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.search(body, league)
    } catch (e) {
      const m = RETRY_AFTER.exec((e as Error).message)
      if (!m || attempt >= MAX_WAITS) throw e
      onProgress('waiting', Number(m[1]))
      await sleep(Number(m[1]) * 1000)
    }
  }
}

export async function validateRow (
  row: GemFlipRow,
  opts: TradeOptions,
  deps: {
    client: TradeClient
    toChaos: CurrencyToChaos
    onProgress?: ValidationProgress
    sleep?: (ms: number) => Promise<void>
    now?: () => number
  }
): Promise<ValidationResult> {
  const onProgress = deps.onProgress ?? (() => {})
  const sleep = deps.sleep ?? (async (ms: number) => { await new Promise(resolve => setTimeout(resolve, ms)) })
  let requests = 0

  const side = async (step: 'buy' | 'sell' | 'sell23', body: ReturnType<typeof createTradeRequest>) => {
    onProgress(step)
    const search = await searchWithWait(deps.client, body, opts.league, onProgress, sleep)
    requests++
    const ids = search.result.slice(0, FETCH_SIZE)
    let fetched: PricingResult[] = []
    if (ids.length) {
      onProgress(step)
      fetched = await deps.client.fetch(search.id, ids)
      requests++
    }
    return { total: search.total, ...normalizeListings(fetched, deps.toChaos) }
  }

  const buy = await side('buy', buySearchRequest(row.gem, opts))
  const sell = await side('sell', sellSearchRequest(row.gem, opts))
  const sell23 = needs23Search(row.gem)
    ? await side('sell23', sell23SearchRequest(row.gem, opts))
    : undefined

  return {
    at: (deps.now ?? Date.now)(),
    league: opts.league,
    requests,
    buy: { total: buy.total, listings: buy.listings, ...bucketBuy(row, buy.listings) },
    sell: {
      total: sell.total,
      listings: sell.listings,
      total23: sell23?.total,
      listings23: sell23?.listings ?? [],
      ...bucketSell(row, sell.listings, sell23?.listings)
    },
    unconverted: buy.unconverted + sell.unconverted + (sell23?.unconverted ?? 0)
  }
}
