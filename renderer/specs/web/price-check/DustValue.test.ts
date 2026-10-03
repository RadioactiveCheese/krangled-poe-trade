// @vitest-environment happy-dom
import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import DustValue from '@/web/price-check/expected-value/DustValue.vue'
import ItemInfo from '@/web/item-check/ItemInfo.vue'
import { createVirtualItem } from '@/parser/ParsedItem'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/item-check/hotkeyable-actions', () => ({}))

const base = { name: 'Test Unique', refName: 'Test Unique', namespace: 'UNIQUE' as const }
describe('dust estimate UI', () => {
  it('renders the localized estimate and icon in price check', () => {
    const wrapper = mount(DustValue, { props: { item: createVirtualItem({ info: base, dustEquivalent: 35000 }) } })
    expect(wrapper.text()).toContain('item.disenchanting')
    expect(wrapper.text()).toContain((35000).toLocaleString())
    expect(wrapper.find('img').attributes('src')).toBe('/images/dust.png')
  })

  it('shows dust without weapon DPS in Item Info', () => {
    const wrapper = mount(ItemInfo, { props: { item: createVirtualItem({ info: base, dustEquivalent: 35000 }) } })
    expect(wrapper.text()).toContain('item.disenchanting')
    expect(wrapper.text()).not.toContain('item.physical_dps')
  })

  it('retains weapon DPS together with dust estimates', () => {
    const wrapper = mount(ItemInfo, { props: { item: createVirtualItem({ info: base, dustEquivalent: 35000, weaponAS: 2, weaponPHYSICAL: 50 }) } })
    expect(wrapper.text()).toContain('item.physical_dps')
    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).toContain('item.disenchanting')
  })
})
