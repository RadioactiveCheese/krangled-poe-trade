// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import WidgetGemCorruption from '@/web/gem-corruption/WidgetGemCorruption.vue'
import { GEM_CORRUPTION_DEFAULTS, type GemCorruptionWidget } from '@/web/gem-corruption/widget'

const { queuePricesFetch } = vi.hoisted(() => ({ queuePricesFetch: vi.fn() }))

vi.mock('@/web/background/Prices', () => ({
  usePoeninja: () => ({
    findPriceByQuery: () => null,
    autoCurrency: (value: number) => ({ min: value, max: value, currency: 'chaos' }),
    queuePricesFetch,
    isLoading: ref(false),
    isLeagueCovered: ref(true),
    hasPrices: ref(false),
    pricesVersion: ref(0)
  }),
  displayRounding: (value: number) => String(value)
}))
vi.mock('@/web/i18n', () => ({ useI18nNs: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/background/IPC', () => ({ Host: {} }))
vi.mock('@/assets/data', () => ({ ITEM_BY_REF: () => undefined, ITEMS_ITERATOR: () => [] }))

const RENEW_MS = 5 * 60 * 1000

beforeEach(() => {
  vi.useFakeTimers()
  queuePricesFetch.mockClear()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('gem corruption price interest', () => {
  it('keeps renewing interest while on screen, and stops when hidden', async () => {
    const active = ref(true)
    const config = reactive<GemCorruptionWidget>({
      wmId: 1,
      wmType: 'gem-corruption',
      wmTitle: '{icon=fa-skull-crossbones}',
      wmWants: 'show',
      wmZorder: null,
      wmFlags: ['invisible-on-blur'],
      anchor: { pos: 'tl', x: 20, y: 20 },
      ...GEM_CORRUPTION_DEFAULTS
    })
    const wrapper = mount(WidgetGemCorruption, {
      props: { config },
      global: {
        provide: { wm: { active } },
        stubs: { Widget: { template: '<div><slot /></div>' } }
      }
    })
    try {
      expect(queuePricesFetch).toHaveBeenCalledTimes(1)
      // Longer than poe.ninja's 31 minute refresh: interest must not lapse meanwhile.
      vi.advanceTimersByTime(7 * RENEW_MS)
      expect(queuePricesFetch).toHaveBeenCalledTimes(8)

      active.value = false
      await nextTick()
      vi.advanceTimersByTime(7 * RENEW_MS)
      expect(queuePricesFetch).toHaveBeenCalledTimes(8)

      active.value = true
      await nextTick()
      expect(queuePricesFetch).toHaveBeenCalledTimes(9)

      config.wmWants = 'hide'
      await nextTick()
      vi.advanceTimersByTime(7 * RENEW_MS)
      expect(queuePricesFetch).toHaveBeenCalledTimes(9)
    } finally {
      wrapper.unmount()
    }
    vi.advanceTimersByTime(7 * RENEW_MS)
    expect(queuePricesFetch).toHaveBeenCalledTimes(9)
  })
})
