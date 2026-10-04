// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { ItemCategory, ItemRarity } from '@/parser'
import { createVirtualItem } from '@/parser/ParsedItem'
import { createFilters } from '@/web/price-check/filters/create-item-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'

vi.mock('@/assets/data', async importOriginal => {
  const original = await importOriginal<typeof import('@/assets/data')>()
  return {
    ...original,
    ITEM_BY_REF: (_namespace: string, ref: string) => [{
      name: ref, refName: ref, namespace: 'ITEM', icon: '', craftable: { category: ItemCategory.Map }
    }]
  }
})

function map (ref = 'Map') {
  const blighted = ref !== 'Map'
  const item = createVirtualItem({ info: {
    name: ref, refName: ref, namespace: 'ITEM', icon: '', craftable: { category: ItemCategory.Map },
    tradeDisc: blighted ? (ref === 'Blighted Map' ? 'blighted' : 'uberblighted') : undefined,
    area: blighted ? { blighted: true } : {}
  } })
  item.rarity = ItemRarity.Normal
  item.category = ItemCategory.Map
  item.mapArea = { name: 'Strand', refName: 'Strand', namespace: 'AREA', tradeDisc: '10021', icon: '' }
  return item
}

function filters (ref?: string) {
  return createFilters(map(ref), {
    league: 'Standard', currency: 'chaos', collapseListings: 'app', activateStockFilter: false,
    exact: true, useEn: true
  })
}

describe('Reworked Map searches', () => {
  it('excludes both Blighted and ravaged variants from ordinary Map searches', () => {
    const request = createTradeRequest(filters(), [])
    expect(request.query.type).toEqual({ discriminator: 'map', option: 'Map' })
    expect(request.query.filters.map_filters?.filters.map_blighted).toEqual({ option: 'false' })
    expect(request.query.filters.map_filters?.filters.map_uberblighted).toEqual({ option: 'false' })
  })

  it.each(['Blighted Map', 'Blight-ravaged Map'])('uses the area discriminator for %s and can relax to its map type', ref => {
    const search = filters(ref)
    const discriminator = ref === 'Blighted Map' ? 'blighted' : 'uberblighted'
    expect(createTradeRequest(search, []).query.type).toEqual({ discriminator, option: '10021' })
    search.searchExact.sub!.disabled = true
    expect(createTradeRequest(search, []).query.type).toEqual({ discriminator: 'map', option: 'Map' })
    const mapFilters = createTradeRequest(search, []).query.filters.map_filters!.filters
    expect(ref === 'Blighted Map' ? mapFilters.map_blighted : mapFilters.map_uberblighted).toEqual({ option: 'true' })
  })
})
