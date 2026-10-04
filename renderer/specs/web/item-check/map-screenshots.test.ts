// @vitest-environment happy-dom

import { shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import MapCheck from '@/web/map-check/MapCheck.vue'
import FullscreenImage from '@/web/ui/FullscreenImage.vue'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

function item (blighted = false): ParsedItem {
  return {
    category: ItemCategory.Map, rarity: ItemRarity.Rare,
    info: { name: blighted ? 'Blighted Map' : 'Map', refName: 'Map', area: { blighted } },
    mapArea: { name: 'Strand', refName: 'Strand', area: { screenshot: 'Strand.jpg' } },
    newMods: [], statsByType: [], unknownModifiers: []
  } as unknown as ParsedItem
}

function preview (value: ParsedItem) {
  return shallowMount(MapCheck, { props: {
    item: value, config: { profile: 1, showNewStats: false, selectedStats: [] }
  } })
}

describe('map-area screenshot previews', () => {
  it.each(['Blighted Map', 'Blight-ravaged Map'])('shows the area screenshot for %s without cropping', name => {
    const value = item(true)
    value.info.name = name
    const wrapper = preview(value)
    const image = wrapper.findComponent(FullscreenImage)
    expect(image.props('src')).toBe('Strand.jpg')
    expect(image.props('fit')).toBe('contain')
    expect(wrapper.text()).toContain(name)
    wrapper.unmount()
  })

  it('retains ordinary map previews and suppresses unidentified unique previews', async () => {
    const value = item()
    const wrapper = preview(value)
    expect(wrapper.findComponent(FullscreenImage).props('src')).toBe('Strand.jpg')
    await wrapper.setProps({ item: { ...value, rarity: ItemRarity.Unique, isUnidentified: true } })
    expect(wrapper.findComponent(FullscreenImage).exists()).toBe(false)
    wrapper.unmount()
  })
})
