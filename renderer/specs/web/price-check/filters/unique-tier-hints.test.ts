// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { FilterTag, type StatFilter } from '@/web/price-check/filters/interfaces'
import FilterModifier from '@/web/price-check/filters/FilterModifier.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/Config', () => ({ AppConfig: () => ({ fontSize: 16 }) }))

describe('tier hints for bounded stat filters', () => {
  it.each([ItemRarity.Rare, ItemRarity.Magic, ItemRarity.Unique])('uses tiers on non-uniques and a slider on uniques: %s', (rarity) => {
    const filter = {
      tradeId: ['explicit.stat_3299347043'], statRef: '+# to maximum Life', text: '+# to maximum Life',
      tag: FilterTag.Explicit, sources: [], disabled: true,
      roll: { value: 70, min: 60, max: undefined, default: { min: 60 }, bounds: { min: 60, max: 79 }, dp: false }
    } as unknown as StatFilter
    const item = { rarity, category: ItemCategory.BodyArmour, info: { refName: 'Plate Vest' }, statsByType: [] } as unknown as ParsedItem
    const wrapper = shallowMount(FilterModifier, { props: { filter, item } })
    expect(wrapper.find('filter-modifier-tiers-stub').exists()).toBe(rarity !== ItemRarity.Unique)
    expect(wrapper.find('stat-roll-slider-stub').exists()).toBe(rarity === ItemRarity.Unique)
    wrapper.unmount()
  })
})
