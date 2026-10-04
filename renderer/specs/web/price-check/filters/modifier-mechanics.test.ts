// @vitest-environment happy-dom

import { describe, expect, it, vi } from 'vitest'
import { shallowMount } from '@vue/test-utils'
import FilterModifier from '@/web/price-check/filters/FilterModifier.vue'
import { FilterTag, type StatFilter } from '@/web/price-check/filters/interfaces'
import { ItemRarity, type ParsedItem } from '@/parser'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/Config', () => ({ AppConfig: () => ({ fontSize: 'normal' }) }))

describe('Modifier mechanics indicators', () => {
  it.each([
    ['volatile', '/images/VolatileVaalOrb.png'],
    ['reflecting', '/images/ReflectingMist.png'],
    ['legacy', undefined]
  ])('shows the %s roll indicator and keeps increased scalable rolls distinct', (generation, image) => {
    const filter = {
      tradeId: ['explicit.life'], statRef: 'Life', text: '+# Life', tag: FilterTag.Explicit, disabled: false,
      sources: [{ modifier: { info: { rollIncr: 10 }, stats: [] }, stat: { roll: { generation: 'legacy', mechanicHint: generation === 'legacy' ? undefined : generation, unscalable: false } } }],
      roll: { value: 120, min: 120, default: { min: 100, max: 120 }, dp: false, isNegated: false }
    } as unknown as StatFilter
    const wrapper = shallowMount(FilterModifier, { props: {
      filter, item: { info: { refName: 'Test' }, rarity: ItemRarity.Unique } as ParsedItem
    } })
    const sources = wrapper.findAll('img').map(img => img.attributes('src'))
    expect(sources).toEqual(image ? [image, '/images/increased.png'] : ['/images/increased.png'])
    if (image) expect(wrapper.find(`img[src="${image}"]`).attributes('title')).toBe(`modifier_hint.${generation}`)
    filter.sources[0].stat.roll!.unscalable = true
    wrapper.unmount()
    const unscalable = shallowMount(FilterModifier, { props: {
      filter, item: { info: { refName: 'Test' }, rarity: ItemRarity.Unique } as ParsedItem
    } })
    expect(unscalable.findAll('img').map(img => img.attributes('src'))).not.toContain('/images/increased.png')
    unscalable.unmount()
  })

  it('omits tier hints while the numeric bounds slider uses the available width', () => {
    const filter = { tradeId: ['explicit.life'], statRef: 'Life', text: '+# Life', tag: FilterTag.Explicit,
      sources: [], disabled: false,
      roll: { value: 120, min: 120, default: { min: 100, max: 120 }, bounds: { min: 100, max: 120 }, dp: false, isNegated: false }
    } as StatFilter
    const wrapper = shallowMount(FilterModifier, { props: {
      filter, item: { info: { refName: 'Test' }, rarity: ItemRarity.Unique } as ParsedItem
    } })
    expect(wrapper.findComponent({ name: 'FilterModifierTiers' }).exists()).toBe(false)
    expect(wrapper.findComponent({ name: 'StatRollSlider' }).exists()).toBe(true)
    wrapper.unmount()
  })
})
