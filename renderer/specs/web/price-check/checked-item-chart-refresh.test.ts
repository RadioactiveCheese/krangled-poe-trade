// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { defineComponent, h, nextTick } from 'vue'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  searches: [] as Array<{ item: string, filter: string }>
}))

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

vi.mock('@/web/Config', () => ({
  AppConfig: () => ({
    useIntlSite: true,
    builtinBrowser: false,
    collapseListings: 'api',
    activateStockFilter: false,
    searchStatRange: 10,
    smartInitialSearch: true,
    lockedInitialSearch: true
  })
}))

vi.mock('@/web/background/Leagues', () => ({
  PERMANENT_SC: ['Standard'],
  useLeagues: () => ({ selectedId: { value: 'Allflame' } })
}))

vi.mock('@/web/price-check/trade/common', () => ({
  apiToSatisfySearch: () => 'trade',
  getTradeEndpoint: () => 'www.pathofexile.com',
  tradeTag: () => undefined
}))

vi.mock('@/web/price-check/trade/pathofexile-trade', () => ({
  CATEGORY_TO_TRADE_ID: new Map([['Chart', 'chart']]),
  createTradeRequest: vi.fn()
}))

import CheckedItem from '@/web/price-check/CheckedItem.vue'

const TradeListingStub = defineComponent({
  props: ['filters', 'stats', 'item'],
  setup (props, { expose }) {
    expose({
      execSearch: () => {
        mocks.searches.push({
          item: props.item.info.refName,
          filter: props.filters.searchExact.baseTypeTrade
        })
      }
    })
    return () => h('div')
  }
})

function chart (refName: 'Sandy Seabed Chart' | 'Coral Reef Chart') {
  const coral = refName === 'Coral Reef Chart'
  return {
    category: 'Chart',
    rarity: 'Rare',
    name: 'Nautical Journey',
    baseType: refName,
    info: {
      name: refName,
      refName,
      namespace: 'ITEM',
      craftable: { category: 'Chart' },
      tradeDisc: coral ? 'chart_coral_reef' : 'chart_sandy_seabed'
    },
    infoVariants: [],
    chart: {
      areaName: coral ? 'Seafloor Ridges' : 'Hazardous Depths',
      areaId: coral ? 'SeafloorRidges' : 'HazardousDepths',
      shape: coral ? 'Crossing' : 'Junction',
      shapeId: coral ? '5' : '4'
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

describe('CheckedItem Chart refresh', () => {
  it('executes the second Chart search with the second item filters', async () => {
    mocks.searches = []
    const wrapper = shallowMount(CheckedItem, {
      props: {
        item: chart('Sandy Seabed Chart') as any,
        advancedCheck: false
      },
      global: {
        stubs: {
          'i18n-t': true,
          TradeListing: TradeListingStub
        }
      }
    })

    await nextTick()
    await nextTick()
    await wrapper.setProps({ item: chart('Coral Reef Chart') })
    await nextTick()
    await nextTick()

    expect(mocks.searches.at(-1)).toEqual({
      item: 'Coral Reef Chart',
      filter: 'Coral Reef Chart'
    })
  })
})
