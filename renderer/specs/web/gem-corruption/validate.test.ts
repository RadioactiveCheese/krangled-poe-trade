// @vitest-environment happy-dom

import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import type { BaseType } from '@/assets/data'

// happy-dom replaces import.meta.url's scheme, so resolve from the renderer folder
const ITEMS = fs.readFileSync(path.resolve(process.cwd(), 'public/data/en/items.ndjson'), 'utf8')
const GEMS: BaseType[] = ITEMS.split('\n')
  .filter(line => line.includes('"namespace":"GEM"'))
  .map(line => JSON.parse(line) as BaseType)
const GEM_BY_NAME = new Map(GEMS.map(g => [g.refName, g]))

// createFilters looks up the normal gem of a transfigured gem through ITEM_BY_REF
vi.mock('@/assets/data', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/assets/data')>()),
  ITEM_BY_REF: (ns: string, name: string) => {
    const gem = (ns === 'GEM') ? GEM_BY_NAME.get(name) : undefined
    return gem ? [gem] : undefined
  }
}))

const {
  buySearchRequest, sellSearchRequest, sell23SearchRequest, needs23Search, validateRow, normalizeListings, bucketBuy, bucketSell,
  priceCheck, currencyToChaos, REQUESTS_PER_VALIDATION
} = await import('@/web/gem-corruption/validate')
const { evaluateGem } = await import('@/web/gem-corruption/calc')
type TradeClient = import('@/web/gem-corruption/validate').TradeClient
type TradeOptions = import('@/web/gem-corruption/validate').TradeOptions
type PricingResult = import('@/web/price-check/trade/pathofexile-trade').PricingResult

function gem (name: string) {
  return GEM_BY_NAME.get(name)!
}

const OPTS: TradeOptions = {
  league: 'Allflame',
  merchantOnly: true,
  currency: null,
  collapseListings: 'api',
  useEn: true
}

describe('validation searches', () => {
  it('searches the buy side: max level, uncorrupted, any quality', () => {
    expect(buySearchRequest(gem('Arc'), OPTS)).toEqual({
      query: {
        status: { option: 'securable' },
        stats: [{ type: 'and', filters: [] }],
        filters: {
          trade_filters: { filters: { collapse: { option: 'true' } } },
          misc_filters: {
            filters: {
              corrupted: { option: 'false' },
              gem_level: { min: 20 }
            }
          }
        },
        type: 'Arc'
      },
      sort: { price: 'asc' }
    })
  })

  it('searches the sell side: corrupted, max level + 1 or more, any quality', () => {
    expect(sellSearchRequest(gem('Arc'), OPTS)).toEqual({
      query: {
        status: { option: 'securable' },
        stats: [{ type: 'and', filters: [] }],
        filters: {
          trade_filters: { filters: { collapse: { option: 'true' } } },
          misc_filters: {
            filters: {
              corrupted: { option: 'true' },
              gem_imbued: { option: 'false' },
              gem_level: { min: 21 }
            }
          }
        },
        type: 'Arc'
      },
      sort: { price: 'asc' }
    })
  })

  it('searches the 23% sell side: corrupted, max level + 1 or more, quality 23 or more', () => {
    expect(sell23SearchRequest(gem('Arc'), OPTS)).toEqual({
      query: {
        status: { option: 'securable' },
        stats: [{ type: 'and', filters: [] }],
        filters: {
          trade_filters: { filters: { collapse: { option: 'true' } } },
          misc_filters: {
            filters: {
              corrupted: { option: 'true' },
              gem_imbued: { option: 'false' },
              gem_level: { min: 21 },
              quality: { min: 23 }
            }
          }
        },
        type: 'Arc'
      },
      sort: { price: 'asc' }
    })
    const exceptional = sell23SearchRequest(gem('Greater Multistrike Support'), OPTS).query.filters.misc_filters!.filters
    expect(exceptional.gem_level).toEqual({ min: 4 })
    expect(exceptional.quality).toEqual({ min: 23 })
    expect(sell23SearchRequest(gem('Arc of Oscillating'), OPTS).query.type)
      .toEqual({ option: 'Arc', discriminator: gem('Arc of Oscillating').tradeDisc })
  })

  it('skips the 23% search only where quality doesn\'t matter', () => {
    expect(needs23Search(gem('Arc'))).toBe(true)
    expect(needs23Search(gem('Greater Multistrike Support'))).toBe(true)
    expect(needs23Search(gem('Enlighten Support'))).toBe(false)
    expect(needs23Search(gem('Awakened Empower Support'))).toBe(false)
  })

  it('uses the transfigured discriminator and the gem\'s own max level', () => {
    expect(sellSearchRequest(gem('Arc of Oscillating'), OPTS).query.type)
      .toEqual({ option: 'Arc', discriminator: gem('Arc of Oscillating').tradeDisc })
    expect(buySearchRequest(gem('Greater Multistrike Support'), OPTS).query.filters.misc_filters!.filters.gem_level)
      .toEqual({ min: 3 })
    expect(sellSearchRequest(gem('Greater Multistrike Support'), OPTS).query.filters.misc_filters!.filters.gem_level)
      .toEqual({ min: 4 })
  })

  it('follows the price-check settings for status, currency and collapsing', () => {
    const body = buySearchRequest(gem('Arc'), { ...OPTS, merchantOnly: false, currency: 'divine', collapseListings: 'app' })
    expect(body.query.status).toEqual({ option: 'available' })
    expect(body.query.filters.trade_filters).toEqual({ filters: { price: { option: 'divine' } } })
  })
})

describe('normalizing listings', () => {
  const listing = (amount: number, currency: string, quality?: string, level = '20'): PricingResult =>
    ({ priceAmount: amount, priceCurrency: currency, quality, level } as unknown as PricingResult)
  const toChaos = currencyToChaos(400, tag => tag === 'exalted' ? 'Exalted Orb' : undefined, name => name === 'Exalted Orb' ? 12 : undefined)

  it('converts to chaos, sorts, and counts what it can\'t convert', () => {
    const { listings, unconverted } = normalizeListings([
      listing(1, 'divine', '+20%'),
      listing(50, 'chaos', '+5%'),
      listing(2, 'exalted'),
      listing(3, 'mirror'),
      listing(0, 'no price')
    ], toChaos)
    expect(listings).toEqual([
      { chaos: 24, quality: 0, level: 20 },
      { chaos: 50, quality: 5, level: 20 },
      { chaos: 400, quality: 20, level: 20 }
    ])
    expect(unconverted).toBe(2)
  })

  it('flags prices more than 1.5x away from poe.ninja', () => {
    expect(priceCheck([10, 12], 10)).toEqual({ trade: 10, count: 2, ninja: 10, mismatch: false })
    expect(priceCheck([16], 10).mismatch).toBe(true)
    expect(priceCheck([6], 10).mismatch).toBe(true)
    expect(priceCheck([], 10)).toEqual({ trade: undefined, count: 0, ninja: 10, mismatch: false })
  })
})

describe('bucketing', () => {
  const arc = evaluateGem(gem('Arc'), (q) => {
    const table: Record<string, number> = { 'Vaal Orb|': 1, "Gemcutter's Prism|": 2, 'Arc|20/20': 100, 'Arc|20': 50, 'Arc|21/20c': 400, 'Arc|21/23c': 900, 'Arc|21c': 150 }
    const chaos = table[`${q.name}|${q.variant ?? ''}`]
    return chaos === undefined ? null : { chaos }
  }, { vaalOrb: 1, gemcutter: 2 }, (name) => GEM_BY_NAME.get(name)).row!

  it('covers both buy routes from one set of listings', () => {
    const buy = bucketBuy(arc, [
      { chaos: 30, quality: 0, level: 20 },
      { chaos: 60, quality: 15, level: 20 },
      { chaos: 95, quality: 20, level: 20 }
    ])
    expect(buy.fullQuality).toMatchObject({ trade: 95, count: 1, ninja: 100, mismatch: false })
    // 30 + 20 prisms = 70; 60 + 5 prisms = 70; 95 + 0 = 95
    expect(buy.viaPrisms).toMatchObject({ trade: 70, count: 3, ninja: 90 })
  })

  it('splits the sell side by quality', () => {
    const sell = bucketSell(arc, [
      { chaos: 140, quality: 0, level: 21 },
      { chaos: 420, quality: 20, level: 21 },
      { chaos: 3000, quality: 23, level: 21 }
    ])
    expect(sell.quality20).toMatchObject({ trade: 420, ninja: 400, mismatch: false })
    expect(sell.quality23).toMatchObject({ trade: 3000, ninja: 900, mismatch: true })
    expect(sell.lowQuality).toMatchObject({ trade: 140, ninja: 150 })
  })

  it('adds the 23% search to the 23% bucket only', () => {
    const sell = bucketSell(arc, [{ chaos: 420, quality: 20, level: 21 }], [
      { chaos: 1200, quality: 23, level: 21 },
      { chaos: 1500, quality: 23, level: 22 }
    ])
    expect(sell.quality23).toMatchObject({ trade: 1200, count: 2, ninja: 900, mismatch: false })
    expect(sell.quality20).toMatchObject({ trade: 420, count: 1 })
  })
})

describe('a validation', () => {
  const row = evaluateGem(gem('Arc'), (q) => {
    const table: Record<string, number> = { 'Vaal Orb|': 1, "Gemcutter's Prism|": 2, 'Arc|20/20': 100, 'Arc|21/20c': 400 }
    const chaos = table[`${q.name}|${q.variant ?? ''}`]
    return chaos === undefined ? null : { chaos }
  }, { vaalOrb: 1, gemcutter: 2 }, (name) => GEM_BY_NAME.get(name)).row!

  function fakeClient (opts: { retryOnce?: boolean } = {}) {
    const calls: string[] = []
    let retried = false
    const client: TradeClient = {
      async search (body) {
        if (opts.retryOnce && !retried) {
          retried = true
          throw new Error('Retry after 3 seconds')
        }
        const corrupted = body.query.filters.misc_filters?.filters.corrupted?.option === 'true'
        const q23 = body.query.filters.misc_filters?.filters.quality?.min === 23
        const id = q23 ? 'Q' : corrupted ? 'S' : 'B'
        calls.push(q23 ? 'search:sell23' : corrupted ? 'search:sell' : 'search:buy')
        return { id, result: Array.from({ length: 25 }, (_, i) => `${id}${i}`), total: q23 ? 4 : corrupted ? 31 : 120 }
      },
      async fetch (queryId, ids) {
        calls.push(`fetch:${queryId}:${ids.length}`)
        return ids.map((_, i) => ({
          priceAmount: (queryId === 'B' ? 90 : queryId === 'Q' ? 2000 : 380) + i,
          priceCurrency: 'chaos',
          quality: queryId === 'Q' ? '+23%' : '+20%',
          level: queryId === 'B' ? '20' : '21'
        } as unknown as PricingResult))
      }
    }
    return { client, calls }
  }

  it(`makes ${REQUESTS_PER_VALIDATION} requests: one search and one fetch of 10 per search`, async () => {
    const { client, calls } = fakeClient()
    const res = await validateRow(row, OPTS, { client, toChaos: () => 1, now: () => 1234 })
    expect(calls).toEqual(['search:buy', 'fetch:B:10', 'search:sell', 'fetch:S:10', 'search:sell23', 'fetch:Q:10'])
    expect(res.requests).toBe(REQUESTS_PER_VALIDATION)
    expect(REQUESTS_PER_VALIDATION).toBeLessThanOrEqual(6)
    expect(res.sell.total23).toBe(4)
    expect(res.sell.quality23).toMatchObject({ trade: 2000, count: 10 })
    expect(res).toMatchObject({ at: 1234, league: 'Allflame', buy: { total: 120 }, sell: { total: 31 } })
    expect(res.buy.fullQuality).toMatchObject({ trade: 90, count: 10, ninja: 100 })
    expect(res.sell.quality20).toMatchObject({ trade: 380, count: 10, ninja: 400 })
  })

  it('makes 4 requests for a gem where quality doesn\'t matter', async () => {
    const enlighten = evaluateGem(gem('Enlighten Support'), (q) => {
      const table: Record<string, number> = { 'Vaal Orb|': 1, "Gemcutter's Prism|": 2, 'Enlighten Support|3': 800, 'Enlighten Support|4c': 5000 }
      const chaos = table[`${q.name}|${q.variant ?? ''}`]
      return chaos === undefined ? null : { chaos }
    }, { vaalOrb: 1, gemcutter: 2 }, (name) => GEM_BY_NAME.get(name)).row!
    const { client, calls } = fakeClient()
    const res = await validateRow(enlighten, OPTS, { client, toChaos: () => 1 })
    expect(calls).toEqual(['search:buy', 'fetch:B:10', 'search:sell', 'fetch:S:10'])
    expect(res.requests).toBe(4)
    expect(res.sell.total23).toBeUndefined()
  })

  it('waits out a rate limit instead of failing, and says so', async () => {
    const { client, calls } = fakeClient({ retryOnce: true })
    const progress: string[] = []
    const slept: number[] = []
    const res = await validateRow(row, OPTS, {
      client,
      toChaos: () => 1,
      onProgress: (step, wait) => { progress.push(wait ? `${step}:${wait}` : step) },
      sleep: async (ms) => { slept.push(ms) }
    })
    expect(slept).toEqual([3000])
    expect(progress).toContain('waiting:3')
    // the throttled attempt never reached the API
    expect(calls.length).toBe(REQUESTS_PER_VALIDATION)
    expect(res.requests).toBe(REQUESTS_PER_VALIDATION)
  })

  it('skips the fetch when a search finds nothing', async () => {
    const calls: string[] = []
    const client: TradeClient = {
      async search () { calls.push('search'); return { id: 'X', result: [], total: 0 } },
      async fetch () { calls.push('fetch'); return [] }
    }
    const res = await validateRow(row, OPTS, { client, toChaos: () => 1 })
    expect(calls).toEqual(['search', 'search', 'search'])
    expect(res.requests).toBe(3)
    expect(res.sell.quality20).toMatchObject({ trade: undefined, count: 0 })
  })

  it('passes other errors through', async () => {
    const client: TradeClient = {
      async search () { throw new Error('Unknown item base type') },
      async fetch () { return [] }
    }
    await expect(validateRow(row, OPTS, { client, toChaos: () => 1 })).rejects.toThrow('Unknown item base type')
  })
})
