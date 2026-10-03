// @vitest-environment happy-dom

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { CHART_SHAPE_OPTIONS } from '@/parser/chart'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'
import { createFilters } from '@/web/price-check/filters/create-item-filters'
import { createTradeRequest, CATEGORY_TO_TRADE_ID } from '@/web/price-check/trade/pathofexile-trade'
// Trimmed snapshot (IDs only) of https://www.pathofexile.com/api/trade/data/filters (PoE1).
// Regenerate it with `npm run make-trade-filters-fixture` (scripts/trim-trade-filters.mjs)
// when the trade site changes its filter set; it is not fetched in CI.
import liveFilters from '../../../fixtures/trade-data-filters-poe1.json'

interface LiveFilter { id: string, options?: string[] }
const LIVE = new Map<string, Map<string, LiveFilter>>(
  (liveFilters.result as Array<{ id: string, filters: LiveFilter[] }>)
    .map(group => [group.id, new Map(group.filters.map(f => [f.id, f]))])
)

function liveOptions (group: string, id: string): Set<string> {
  const options = LIVE.get(group)?.get(id)?.options
  if (!options) throw new Error(`fixture has no options for ${group}.${id}`)
  return new Set(options)
}

const SOURCE = readFileSync(
  resolve(process.cwd(), 'src/web/price-check/trade/pathofexile-trade.ts'),
  'utf8'
).replace(/\r\n/g, '\n')

function emittedFilterPaths (): string[] {
  const paths = new Set<string>()
  for (const m of SOURCE.matchAll(/propSet\(query\.filters, '(\w+)\.filters\.(\w+)\./g)) {
    paths.add(`${m[1]}.${m[2]}`)
  }
  return [...paths].sort()
}

function typedFilterPaths (): string[] {
  const start = SOURCE.indexOf('interface TradeRequest {')
  const end = SOURCE.indexOf('\n}\n', start)
  const block = SOURCE.slice(start, end)
  const paths: string[] = []
  let group: string | undefined
  for (const line of block.split('\n')) {
    const g = /^ {6}(\w+_filters)\?: \{/.exec(line)
    if (g) { group = g[1]; continue }
    const f = /^ {10}(\w+)\?:/.exec(line)
    if (f && group) paths.push(`${group}.${f[1]}`)
  }
  return paths.sort()
}

function isLive (path: string) {
  const [group, id] = path.split('.')
  return LIVE.get(group)?.has(id) ?? false
}

function baseFilters (): ItemFilters {
  return {
    searchExact: { baseType: 'Sapphire Ring' },
    trade: {
      offline: false,
      onlineInLeague: false,
      merchantOnly: false,
      listed: undefined,
      currency: undefined,
      league: 'Standard',
      collapseListings: 'app'
    }
  }
}

function parsedItem (category: ItemCategory, name: string, extra: Partial<ParsedItem> = {}): ParsedItem {
  return {
    category,
    rarity: ItemRarity.Normal,
    name,
    baseType: name,
    info: {
      name,
      refName: name,
      namespace: 'ITEM',
      craftable: { category }
    },
    infoVariants: [],
    itemLevel: 80,
    influences: [],
    statsByType: [],
    unknownModifiers: [],
    newMods: [],
    isUnidentified: false,
    isCorrupted: false,
    isMirrored: false,
    isSplit: false,
    isFractured: false,
    isSynthesised: false,
    rawText: '',
    ...extra
  }
}

const CREATE_OPTS = {
  league: 'Standard',
  currency: undefined,
  collapseListings: 'app' as const,
  activateStockFilter: false,
  exact: false,
  useEn: true
}

describe('trade filter IDs match the live /api/trade/data/filters dataset', () => {
  it('finds the filter paths the query builder emits', () => {
    expect(emittedFilterPaths().length).toBeGreaterThan(30)
    expect(typedFilterPaths().length).toBeGreaterThan(30)
  })

  it.each(emittedFilterPaths())('emitted filter %s exists in the live dataset', (path) => {
    expect(isLive(path)).toBe(true)
  })

  it.each(typedFilterPaths())('TradeRequest filter %s exists in the live dataset', (path) => {
    expect(isLive(path)).toBe(true)
  })

  it.each([...new Set(CATEGORY_TO_TRADE_ID.values())])('category %s is a live category option', (id) => {
    expect(liveOptions('type_filters', 'category').has(id)).toBe(true)
  })

  const ONLINE_FILTER_VUE = readFileSync(
    resolve(process.cwd(), 'src/web/price-check/trade/OnlineFilter.vue'), 'utf8')
  const uiOptions = (model: string) => [...ONLINE_FILTER_VUE.matchAll(
    new RegExp(`v-model="filters\\.trade\\.${model}" value="([^"]+)"`, 'g'))].map(m => m[1])

  it.each([
    ['status_filters', 'status', ['available', 'securable', 'any']],
    ['type_filters', 'rarity', ['magic', 'nonunique', 'uniquefoil']],
    ['trade_filters', 'collapse', ['true']],
    ['heist_filters', 'heist_objective_value', ['priceless']],
    ['map_filters', 'chart_shape', [...new Set(Object.values(CHART_SHAPE_OPTIONS))]],
    ['trade_filters', 'indexed', uiOptions('listed')],
    ['trade_filters', 'price', uiOptions('currency')]
  ])('%s.%s option values sent by the app are live options', (group, id, values) => {
    expect(values.length).toBeGreaterThan(0)
    const options = liveOptions(group, id)
    for (const value of values) {
      expect(options.has(value), `${group}.${id} = ${value}`).toBe(true)
    }
  })

  it('no longer uses removed filters', () => {
    expect(LIVE.get('misc_filters')!.has('foulborn_item')).toBe(false)
    expect(LIVE.has('sentinel_filters')).toBe(false)
    expect(SOURCE).not.toContain('foulborn_item')
    expect(SOURCE).not.toContain('sentinel_filters')
  })
})

describe('Foulborn trade query', () => {
  it('excluding Foulborn sends misc_filters.filters.mutated.option = "false"', () => {
    const filters = baseFilters()
    filters.foulborn = { value: false }
    const request = createTradeRequest(filters, [])

    expect(request.query.filters.misc_filters?.filters.mutated).toEqual({ option: 'false' })
    expect(request.query.filters.misc_filters?.filters).not.toHaveProperty('foulborn_item')
    // The live dataset labels this filter "Foulborn" (label trimmed from the fixture).
    expect(LIVE.get('misc_filters')!.has('mutated')).toBe(true)
  })

  it('does not send the Foulborn filter when Foulborn items are allowed', () => {
    const filters = baseFilters()
    filters.foulborn = { value: true }
    const request = createTradeRequest(filters, [])

    expect(request.query.filters.misc_filters?.filters?.mutated).toBeUndefined()
  })
})

describe('filters without a live trade equivalent', () => {
  it('a sentinel with a charge sends no sentinel_filters', () => {
    const item = parsedItem(ItemCategory.Sentinel, 'Stalker Sentinel', { sentinelCharge: 12 })
    const filters = createFilters(item, CREATE_OPTS)
    const request = createTradeRequest(filters, [])

    expect(filters).not.toHaveProperty('sentinelCharge')
    expect(request.query.filters).not.toHaveProperty('sentinel_filters')
  })

  it('a charm sends no category filter and does not throw', () => {
    const item = parsedItem(ItemCategory.Charm, 'Test Charm')
    const filters = createFilters(item, CREATE_OPTS)
    expect(filters.searchRelaxed).toBeUndefined()

    const request = createTradeRequest(filters, [])
    expect(request.query.type).toBe('Test Charm')
    expect(request.query.filters.type_filters?.filters.category).toBeUndefined()
  })
})
