// @vitest-environment happy-dom

import { describe, expect, it } from 'vitest'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { createVirtualItem } from '@/parser/ParsedItem'
import { resolveChartArea, resolveChartShape } from '@/parser/chart'
import { createFilters } from '@/web/price-check/filters/create-item-filters'
import { createExactStatFilters } from '@/web/price-check/filters/create-stat-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'

const TRADITIONAL_CHINESE_CHART_AREAS = [
  ['深海平原', 'Sandy Seabed Chart', 'AbyssalPlain'],
  ['定錨點', 'Sandy Seabed Chart', 'Anchorfield'],
  ['危機海淵', 'Sandy Seabed Chart', 'HazardousDepths'],
  ['感染潛水球', 'Sandy Seabed Chart', 'InfestedBathyspheres'],
  ['奇夏拉安眠地', 'Sandy Seabed Chart', 'KisharasRest'],
  ['失落遺跡', 'Coral Forest Chart', 'LostRuins'],
  ['遠洋深淵', 'Coral Forest Chart', 'PelagicAbyss'],
  ['海洋之柱', 'Coral Forest Chart', 'SeaPillars'],
  ['海底幽林', 'Coral Forest Chart', 'UnderseaGroves'],
  ['海洋王的領域', 'Coral Reef Chart', 'BrineKingsDomain'],
  ['蛤蜊之架', 'Coral Reef Chart', 'ClamInfestedShelf'],
  ['潛水沙洲', 'Coral Reef Chart', 'DivingShoals'],
  ['海底山脊', 'Coral Reef Chart', 'SeafloorRidges'],
  ['沉沒圖騰', 'Coral Reef Chart', 'SunkenTotems']
] as const

const TRADITIONAL_CHINESE_CHART_SHAPES = [
  ['終點', '1'],
  ['轉角', '2'],
  ['直線', '3'],
  ['交界處', '4'],
  ['十字口', '5']
] as const

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
      sulphur: 75,
      gold: 30
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
  it('handles a virtual Scrying Orb before a map area is selected', () => {
    const item = createVirtualItem({
      info: {
        name: 'Scrying Orb',
        refName: 'Scrying Orb',
        namespace: 'ITEM',
        tradeDisc: 'scrying_orb',
        icon: ''
      }
    })

    const filters = createFilters(item, {
      league: 'Hardcore',
      currency: 'chaos',
      collapseListings: 'api',
      activateStockFilter: false,
      exact: true,
      useEn: true
    })

    expect(filters.discriminator?.trade).toBe('scrying_orb')
    expect(filters.scryingMapArea).toBeUndefined()
  })

  it('defaults to the chart zone discriminator and area level', () => {
    const item = chartItem()
    const filters = createFilters(item, {
      league: 'Hardcore',
      currency: 'chaos',
      collapseListings: 'api',
      activateStockFilter: false,
      exact: true,
      useEn: true
    })
    const stats = createExactStatFilters(item, item.statsByType, { searchStatRange: 0 })
    const request = createTradeRequest(filters, stats)

    expect(request.query.type).toEqual({
      discriminator: 'chart_sandy_seabed',
      option: 'HazardousDepths'
    })
    expect(request.query.filters.type_filters?.filters.rarity?.option).toBe('nonunique')
    expect(request.query.filters.map_filters?.filters.area_level?.min).toBe(83)
    expect(filters.areaLevel?.disabled).toBe(false)
    expect(filters.chartShape?.value).toBe('4')
    expect(filters.chartShape?.disabled).toBe(true)

    const properties = Object.fromEntries(stats
      .filter(stat => stat.tag === 'property')
      .map(stat => [stat.tradeId[0], stat]))
    expect(properties['item.map_item_quantity']?.roll?.value).toBe(25)
    expect(properties['item.map_pack_size']?.roll?.value).toBe(18)
    expect(properties['item.chart_sulphur']?.roll?.value).toBe(75)
    expect(properties['item.chart_gold']?.roll?.value).toBe(30)
    expect(Object.values(properties).every(stat => stat.disabled)).toBe(true)

    properties['item.chart_sulphur'].disabled = false
    properties['item.chart_gold'].disabled = false
    const propertyRequest = createTradeRequest(filters, stats)
    expect(propertyRequest.query.filters.map_filters?.filters.chart_sulphur?.min).toBe(75)
    expect(propertyRequest.query.filters.map_filters?.filters.map_gold?.min).toBe(30)
  })

  it.each(TRADITIONAL_CHINESE_CHART_AREAS)(
    'resolves Traditional Chinese chart area %s',
    (areaName, baseType, areaId) => {
      expect(resolveChartArea(areaName, baseType)).toBe(areaId)
    }
  )

  it.each(TRADITIONAL_CHINESE_CHART_SHAPES)(
    'resolves Traditional Chinese chart shape %s',
    (shape, shapeId) => {
      expect(resolveChartShape(shape)).toBe(shapeId)
    }
  )
})
