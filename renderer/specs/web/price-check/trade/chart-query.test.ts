// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { createFilters } from '@/web/price-check/filters/create-item-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'

function chartItem (): ParsedItem {
  return {
    category: ItemCategory.Chart,
    rarity: ItemRarity.Rare,
    name: 'Oceanic Adventure',
    baseType: 'Sandy Seabed Chart',
    info: {
      name: 'Sandy Seabed Chart',
      refName: 'Sandy Seabed Chart',
      namespace: 'ITEM',
      craftable: { category: ItemCategory.Chart },
      tradeDisc: 'chart_sandy_seabed'
    },
    infoVariants: [],
    chart: {
      areaName: 'Hazardous Depths',
      areaId: 'HazardousDepths',
      shape: 'Junction',
      shapeId: '4',
      sulphur: 75
    },
    map: {
      tier: undefined,
      itemQuantity: 25,
      packSize: 18
    },
    areaLevel: 83,
    itemLevel: 83,
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
    rawText: ''
  }
}

describe('Chart trade query', () => {
  it('uses the chart zone discriminator and map-style chart filters', () => {
    const filters = createFilters(chartItem(), {
      league: 'Hardcore',
      currency: 'chaos',
      collapseListings: 'api',
      activateStockFilter: false,
      exact: true,
      useEn: true
    })
    const request = createTradeRequest(filters, [])

    expect(request.query.type).toEqual({
      discriminator: 'chart_sandy_seabed',
      option: 'HazardousDepths'
    })
    expect(request.query.filters.type_filters?.filters.rarity?.option).toBe('nonunique')
    expect(request.query.filters.map_filters?.filters.area_level?.min).toBe(83)
    expect(request.query.filters.map_filters?.filters.chart_shape?.option).toBe('4')
    expect(request.query.filters.map_filters?.filters.chart_sulphur?.min).toBe(75)
  })
})
