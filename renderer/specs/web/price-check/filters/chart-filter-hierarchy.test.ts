// @vitest-environment happy-dom

import { mount, shallowMount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, args?: string[]) => {
      if (key === 'item_category.chart') return 'Chart'
      if (key === 'item_category.prop') return args?.[0] ?? key
      return key
    }
  })
}))

import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import FilterName from '@/web/price-check/filters/FilterName.vue'
import FiltersBlock from '@/web/price-check/filters/FiltersBlock.vue'
import { createFilters } from '@/web/price-check/filters/create-item-filters'

function choralReefChart (): ParsedItem {
  return {
    category: ItemCategory.Chart,
    rarity: ItemRarity.Rare,
    info: {
      name: 'Coral Reef Chart',
      refName: 'Coral Reef Chart',
      namespace: 'ITEM',
      craftable: { category: ItemCategory.Chart },
      tradeDisc: 'chart_coral_reef'
    },
    chart: {
      areaName: 'Diving Shoals',
      areaId: 'DivingShoals'
    },
    influences: [],
    statsByType: [],
    unknownModifiers: []
  } as unknown as ParsedItem
}

describe('Chart filter hierarchy', () => {
  it('shows a zone only while its concrete Chart type is selected', async () => {
    const item = choralReefChart()
    const filters = reactive(createFilters(item, {
      league: 'Hardcore',
      currency: 'chaos',
      collapseListings: 'api',
      activateStockFilter: false,
      exact: true,
      useEn: true
    }))
    const name = mount(FilterName, { props: { filters, item } })
    const block = shallowMount(FiltersBlock, {
      props: { filters, item, stats: [], presets: [] },
      global: {
        stubs: {
          FilterBtnLogical: {
            props: ['text'],
            template: '<button>{{ text }}</button>'
          }
        }
      }
    })

    expect(name.text()).toContain('Coral Reef Chart')
    expect(block.text()).toContain('Diving Shoals')

    await name.find('button').trigger('click')
    await nextTick()

    expect(name.text()).toContain('Chart')
    expect(name.text()).not.toContain('Coral Reef Chart')
    expect(block.text()).not.toContain('Diving Shoals')
  })
})
