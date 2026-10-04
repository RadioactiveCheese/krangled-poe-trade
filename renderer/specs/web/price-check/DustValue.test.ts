// @vitest-environment happy-dom
import fs from 'node:fs'
import { URL as NodeURL } from 'node:url'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { describe, expect, it, vi } from 'vitest'
import DustValue from '@/web/price-check/expected-value/DustValue.vue'
import ItemInfo from '@/web/item-check/ItemInfo.vue'
import { createVirtualItem } from '@/parser/ParsedItem'

vi.mock('@/web/item-check/hotkeyable-actions', () => ({}))

const base = { name: 'Test Unique', refName: 'Test Unique', namespace: 'UNIQUE' as const }
const expectedLabels = {
  en: 'Disenchanting (estimate)',
  ru: 'Распыление (оценка)',
  'cmn-Hant': '分解（估算）',
  ko: '인챈트 해제 (예상)'
}

function locale (language: string) {
  const messages = JSON.parse(fs.readFileSync(new NodeURL(`../../../public/data/${language}/app_i18n.json`, import.meta.url), 'utf8'))
  return {
    messages,
    i18n: createI18n({ legacy: false, locale: language, fallbackLocale: false, missingWarn: false, fallbackWarn: false, messages: { [language]: messages } })
  }
}

describe('dust estimate UI', () => {
  it.each(Object.entries(expectedLabels))('renders the actual %s estimate label in both views', (language, label) => {
    const { messages, i18n } = locale(language)
    expect(messages.price_check.disenchanting).toBe(label)
    for (const component of [DustValue, ItemInfo]) {
      const wrapper = mount(component, {
        props: { item: createVirtualItem({ info: base, dustEquivalent: 35000 }) },
        global: { plugins: [i18n] }
      })
      expect(wrapper.text()).toContain(label)
      expect(wrapper.text()).toContain((35000).toLocaleString())
      expect(wrapper.text()).not.toContain('price_check.disenchanting')
      expect(wrapper.find('img').attributes('src')).toBe('/images/dust.png')
      wrapper.unmount()
    }
  })

  it('shows dust without weapon DPS in Item Info', () => {
    const { messages, i18n } = locale('en')
    const wrapper = mount(ItemInfo, {
      props: { item: createVirtualItem({ info: base, dustEquivalent: 35000 }) },
      global: { plugins: [i18n] }
    })
    expect(wrapper.text()).toContain(expectedLabels.en)
    expect(wrapper.text()).not.toContain(messages.item.physical_dps.replace('{0}', '').trim())
    wrapper.unmount()
  })

  it('retains weapon DPS together with dust estimates', () => {
    const { messages, i18n } = locale('en')
    const wrapper = mount(ItemInfo, {
      props: { item: createVirtualItem({ info: base, dustEquivalent: 35000, weaponAS: 2, weaponPHYSICAL: 50 }) },
      global: { plugins: [i18n] }
    })
    expect(wrapper.text()).toContain(messages.item.physical_dps.replace('{0}', '').trim())
    expect(wrapper.text()).toContain('100')
    expect(wrapper.text()).toContain(expectedLabels.en)
    wrapper.unmount()
  })
})
