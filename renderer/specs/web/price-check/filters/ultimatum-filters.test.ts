// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { nextTick, reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key })
}))

import { ItemCategory, type ParsedItem } from '@/parser'
// Loads the price-check modules in the order the app does; FiltersBlock alone hits an import cycle.
import '@/web/price-check/filters/FilterName.vue'
import FiltersBlock from '@/web/price-check/filters/FiltersBlock.vue'
import { createFilters } from '@/web/price-check/filters/create-item-filters'

function writhingJarUltimatum (): ParsedItem {
  const unique = (name: string) => ({ name, refName: name, namespace: 'UNIQUE', icon: '' })
  return {
    category: ItemCategory.Currency,
    info: { name: 'Inscribed Ultimatum', refName: 'Inscribed Ultimatum', namespace: 'ITEM', icon: '' },
    areaLevel: 83,
    ultimatum: {
      challenge: 'Survival',
      challengeText: 'Survive',
      reward: 'ExchangeUnique',
      rewardText: 'Allelopathy',
      sacrifice: unique('The Writhing Jar'),
      sacrificeText: 'The Writhing Jar',
      sacrificeQuantity: 1,
      rewardUnique: unique('Allelopathy')
    },
    influences: [],
    statsByType: [],
    newMods: [],
    unknownModifiers: []
  } as unknown as ParsedItem
}

describe('Inscribed Ultimatum filter buttons', () => {
  it('shows the challenge, sacrifice and reward in clipboard wording and toggles them', async () => {
    const item = writhingJarUltimatum()
    const filters = reactive(createFilters(item, {
      league: 'Covens',
      currency: 'chaos',
      collapseListings: 'api',
      activateStockFilter: false,
      exact: true,
      useEn: true
    }))
    const block = shallowMount(FiltersBlock, {
      props: { filters, item, stats: [], presets: [] },
      global: { stubs: { FilterBtnLogical: false, FilterBtnNumeric: { props: ['name'], template: '<span>{{ name }}</span>' } } }
    })

    const buttons = block.findAll('button')
    const pressed = () => Object.fromEntries(buttons.map(button => [button.text(), button.attributes('aria-pressed')]))
    expect(pressed()).toEqual({ Survive: 'false', 'The Writhing Jar': 'true', Allelopathy: 'true' })
    expect(block.text()).toContain('item.area_level')

    await buttons.find(button => button.text() === 'Survive')!.trigger('click')
    await nextTick()
    expect(filters.ultimatum?.challenge?.disabled).toBe(false)
    expect(pressed().Survive).toBe('true')
  })
})
