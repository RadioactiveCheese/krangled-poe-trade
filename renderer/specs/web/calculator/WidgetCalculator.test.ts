// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { nextTick, reactive, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import WidgetCalculator from '@/web/calculator/WidgetCalculator.vue'
import type { CalculatorWidget } from '@/web/calculator/widget'

const { queuePricesFetch } = vi.hoisted(() => ({ queuePricesFetch: vi.fn() }))

vi.mock('@/web/background/Prices', () => ({
  usePoeninja: () => ({
    xchgRate: ref(200),
    initialLoading: () => false,
    queuePricesFetch
  })
}))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

beforeEach(() => queuePricesFetch.mockClear())

describe('calculator price interest', () => {
  it('renews interest when the overlay reopens, and skips hidden calculators', async () => {
    const active = ref(true)
    const config = reactive<CalculatorWidget>({
      wmId: 1,
      wmType: 'calculator',
      wmTitle: '{icon=fa-calculator}',
      wmWants: 'show',
      wmZorder: null,
      wmFlags: ['invisible-on-blur'],
      anchor: { pos: 'tl', x: 20, y: 20 }
    })
    const wrapper = mount(WidgetCalculator, {
      props: { config },
      global: {
        provide: { wm: { active } },
        stubs: { Widget: { template: '<div><slot /></div>' } }
      }
    })
    try {
      expect(queuePricesFetch).toHaveBeenCalledTimes(1)
      active.value = false
      await nextTick()
      expect(queuePricesFetch).toHaveBeenCalledTimes(1)
      active.value = true
      await nextTick()
      expect(queuePricesFetch).toHaveBeenCalledTimes(2)

      config.wmWants = 'hide'
      await nextTick()
      active.value = false
      await nextTick()
      active.value = true
      await nextTick()
      expect(queuePricesFetch).toHaveBeenCalledTimes(2)

      config.wmWants = 'show'
      await nextTick()
      expect(queuePricesFetch).toHaveBeenCalledTimes(3)
    } finally {
      wrapper.unmount()
    }
  })
})
