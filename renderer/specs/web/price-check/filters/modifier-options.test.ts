// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { reactive } from 'vue'
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/Config', () => ({ AppConfig: () => ({ fontSize: 16 }) }))

import FiltersBlock from '@/web/price-check/filters/FiltersBlock.vue'
import FilterModifierOptions from '@/web/price-check/filters/FilterModifierOptions.vue'
import { FilterTag, ItemHasEmptyModifier, type ItemFilters, type StatFilter } from '@/web/price-check/filters/interfaces'
import { SearchMode } from '@/web/price-check/filters/pseudo/mercenary'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'

function mountOptions (mercenary = false) {
  const filter = reactive<StatFilter>({
    tradeId: [mercenary ? 'build.support' : 'item.has_empty_modifier'],
    statRef: 'test', text: 'Test', sources: [],
    tag: mercenary ? FilterTag.MercenarySupport : FilterTag.Property,
    option: { value: mercenary ? SearchMode.Required : ItemHasEmptyModifier.Any },
    disabled: false
  })
  const item = {
    category: ItemCategory.Jewel, rarity: ItemRarity.Rare,
    info: { refName: mercenary ? 'Mercenary Warrant' : 'Rare jewel', name: 'Test', namespace: 'ITEM' },
    statsByType: [], unknownModifiers: [], influences: []
  } as unknown as ParsedItem
  const wrapper = shallowMount(FiltersBlock, {
    props: {
      filters: { searchExact: { disabled: false } } as ItemFilters,
      item, stats: [filter], presets: []
    },
    global: { stubs: { FilterModifier: false, FilterModifierOptions: false } }
  })
  return { filter, wrapper, options: wrapper.findComponent(FilterModifierOptions) }
}

describe('modifier option controls in the search form', () => {
  it('toggles the selected empty-affix option and enables a different option', async () => {
    const { filter, options, wrapper } = mountOptions()
    const buttons = options.findAll('button')
    expect(buttons.map(b => b.text())).toEqual([
      'filters.option_empty_affix', 'filters.option_empty_prefix', 'filters.option_empty_suffix'
    ])
    expect(buttons[0].attributes('aria-pressed')).toBe('true')
    await buttons[0].trigger('click', { detail: 1 })
    expect(filter.disabled).toBe(true)
    expect(filter.option!.value).toBe(ItemHasEmptyModifier.Any)
    expect(buttons[0].attributes('aria-pressed')).toBe('false')
    await buttons[1].trigger('click', { detail: 1 })
    expect(filter.disabled).toBe(false)
    expect(filter.option!.value).toBe(ItemHasEmptyModifier.Prefix)
    await buttons[2].trigger('click', { detail: 1 })
    expect(filter.option!.value).toBe(ItemHasEmptyModifier.Suffix)
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it('keeps required/optional Mercenary mode values and toggle behavior', async () => {
    const { filter, options, wrapper } = mountOptions(true)
    const buttons = options.findAll('button')
    expect(buttons.map(b => b.text())).toEqual(['filters.option_merc_required', 'filters.option_merc_optional'])
    await buttons[0].trigger('click', { detail: 1 })
    expect(filter.disabled).toBe(true)
    await buttons[1].trigger('click', { detail: 1 })
    expect(filter.option!.value).toBe(SearchMode.Optional)
    expect(filter.disabled).toBe(false)
    await buttons[1].trigger('click', { detail: 1 })
    expect(filter.disabled).toBe(true)
    expect(wrapper.emitted('submit')).toBeUndefined()
    wrapper.unmount()
  })

  it.each([false, true])('handles keyboard-generated option clicks without submitting (Mercenary=%s)', async mercenary => {
    const { filter, options, wrapper } = mountOptions(mercenary)
    const buttons = options.findAll('button')
    expect(buttons.every(b => b.attributes('type') === 'button')).toBe(true)
    // Native Enter/Space activation emits a click with detail=0.
    await buttons[0].trigger('click', { detail: 0 })
    expect(filter.disabled).toBe(true)
    await buttons[1].trigger('click', { detail: 0 })
    expect(filter.disabled).toBe(false)
    expect(filter.option!.value).toBe(mercenary ? SearchMode.Optional : ItemHasEmptyModifier.Prefix)
    expect(wrapper.emitted('submit')).toBeUndefined()
    // The form's existing submission path (including Enter from numeric inputs) remains intact.
    expect(wrapper.find('input[type="submit"]').exists()).toBe(true)
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('submit')).toHaveLength(1)
    wrapper.unmount()
  })

  it('retains rare-item tiers when bounds are available alongside option controls', async () => {
    const { filter, wrapper, options } = mountOptions()
    filter.roll = {
      value: 1, min: 1, max: undefined, default: { min: 1, max: 2 },
      bounds: { min: 1, max: 2 }, dp: false, isNegated: false
    }
    await wrapper.vm.$nextTick()
    expect(wrapper.findComponent({ name: 'FilterModifierTiers' }).exists()).toBe(true)
    expect(options.findAll('button')).toHaveLength(3)
    wrapper.unmount()
  })

  it('provides every empty-affix label in each supported locale', () => {
    for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
      const { filters } = JSON.parse(readFileSync(`public/data/${language}/app_i18n.json`, 'utf8'))
      for (const key of ['option_empty_affix', 'option_empty_prefix', 'option_empty_suffix']) {
        expect(filters[key], `${language}:${key}`).toBeTruthy()
      }
    }
  })
})
