import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'
// Snapshot of https://www.pathofexile.com/api/trade/data/filters (PoE1), fetched 2026-10-03.
// Refresh it when the trade site changes its filter set.
import liveFilters from '../../../fixtures/trade-data-filters-poe1.json'

vi.mock('@/web/Config', () => ({
  poeWebApi: () => 'www.pathofexile.com'
}))

import { createTradeRequest, CATEGORY_TO_TRADE_ID } from '@/web/price-check/trade/pathofexile-trade'

interface LiveFilter { id: string, option?: { options?: Array<{ id: string | null }> } }
const LIVE = new Map<string, Map<string, LiveFilter>>(
  (liveFilters.result as Array<{ id: string, filters: LiveFilter[] }>)
    .map(group => [group.id, new Map(group.filters.map(f => [f.id, f]))])
)

// Filters the query builder still emits but the live trade site no longer lists.
// Kept here deliberately so new drift is caught; remove entries once resolved.
const KNOWN_MISSING_FILTERS = new Set([
  'sentinel_filters.sentinel_durability'
])
const KNOWN_MISSING_CATEGORIES = new Set([
  'azmeri.charm'
])

const SOURCE = readFileSync(
  new URL('../../../../src/web/price-check/trade/pathofexile-trade.ts', import.meta.url),
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

describe('trade filter IDs match the live /api/trade/data/filters dataset', () => {
  it('finds the filter paths the query builder emits', () => {
    expect(emittedFilterPaths().length).toBeGreaterThan(30)
    expect(typedFilterPaths().length).toBeGreaterThan(30)
  })

  it.each(emittedFilterPaths())('emitted filter %s exists in the live dataset', (path) => {
    const [group, id] = path.split('.')
    expect(LIVE.get(group)?.has(id) || KNOWN_MISSING_FILTERS.has(path)).toBe(true)
  })

  it.each(typedFilterPaths())('TradeRequest filter %s exists in the live dataset', (path) => {
    const [group, id] = path.split('.')
    expect(LIVE.get(group)?.has(id) || KNOWN_MISSING_FILTERS.has(path)).toBe(true)
  })

  it('known-missing allowlist only lists filters that are really missing', () => {
    for (const path of KNOWN_MISSING_FILTERS) {
      const [group, id] = path.split('.')
      expect(LIVE.get(group)?.has(id) ?? false).toBe(false)
    }
  })

  it('every category trade id is a live category option', () => {
    const options = new Set(LIVE.get('type_filters')!.get('category')!.option!.options!.map(o => o.id))
    for (const id of new Set(CATEGORY_TO_TRADE_ID.values())) {
      expect(options.has(id) || KNOWN_MISSING_CATEGORIES.has(id), id).toBe(true)
    }
    for (const id of KNOWN_MISSING_CATEGORIES) {
      expect(options.has(id), id).toBe(false)
    }
  })

  it('no longer uses the removed foulborn_item filter', () => {
    expect(LIVE.get('misc_filters')!.has('foulborn_item')).toBe(false)
    expect(SOURCE).not.toContain('foulborn_item')
  })
})

describe('Foulborn trade query', () => {
  it('excluding Foulborn sends misc_filters.filters.mutated.option = "false"', () => {
    const filters = baseFilters()
    filters.foulborn = { value: false }
    const request = createTradeRequest(filters, [])

    expect(request.query.filters.misc_filters?.filters.mutated).toEqual({ option: 'false' })
    expect(request.query.filters.misc_filters?.filters).not.toHaveProperty('foulborn_item')
    expect(LIVE.get('misc_filters')!.get('mutated')).toMatchObject({ text: 'Foulborn' })
  })

  it('does not send the Foulborn filter when Foulborn items are allowed', () => {
    const filters = baseFilters()
    filters.foulborn = { value: true }
    const request = createTradeRequest(filters, [])

    expect(request.query.filters.misc_filters?.filters?.mutated).toBeUndefined()
  })
})
