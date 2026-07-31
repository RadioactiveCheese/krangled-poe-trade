// @vitest-environment happy-dom

import { mount } from '@vue/test-utils'
import { defineComponent, nextTick } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  mainItemTextHandler: undefined as undefined | ((event: any) => void),
  item: undefined as any
}))

vi.mock('@/web/background/IPC', () => ({
  Host: {
    onEvent: vi.fn()
  },
  MainProcess: {
    onEvent: vi.fn((name: string, handler: (event: any) => void) => {
      if (name === 'MAIN->CLIENT::item-text') {
        mocks.mainItemTextHandler = handler
      }
    })
  }
}))

vi.mock('@/parser', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/parser')>()
  return {
    ...actual,
    parseClipboard: vi.fn(() => ({
      unwrapOr: () => mocks.item
    }))
  }
})

vi.mock('@/web/overlay/Widget.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="widget"><slot /></div>'
  })
}))

vi.mock('@/web/map-check/MapCheck.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="map-check" />'
  })
}))

vi.mock('@/web/item-check/ItemInfo.vue', () => ({
  default: defineComponent({
    template: '<div data-testid="item-info" />'
  })
}))

import WidgetItemCheck from '@/web/item-check/WidgetItemCheck.vue'

const config = {
  wmId: 1,
  wmType: 'item-check',
  wmTitle: '',
  wmWants: 'hide',
  wmZorder: 'exclusive',
  wmFlags: [],
  hotkey: null,
  wikiKey: null,
  poedbKey: null,
  craftOfExileKey: null,
  stashSearchKey: null,
  maps: {
    profile: 1,
    showNewStats: false,
    selectedStats: []
  }
} as const

describe('item-check Chart routing', () => {
  beforeEach(() => {
    mocks.mainItemTextHandler = undefined
    mocks.item = {
      category: 'Chart',
      rarity: 'Rare',
      info: {
        name: 'Oceanic Adventure',
        refName: 'Sandy Seabed Chart'
      },
      statsByType: [],
      unknownModifiers: []
    }
  })

  it('renders the Map Check component after the item-check hotkey copies a Chart', async () => {
    const show = vi.fn()
    const wrapper = mount(WidgetItemCheck, {
      props: { config: { ...config, maps: { ...config.maps } } },
      global: {
        provide: {
          wm: {
            show,
            size: { value: { width: 1920 } },
            poePanelWidth: { value: 0 }
          }
        }
      }
    })

    expect(mocks.mainItemTextHandler).toBeTypeOf('function')
    mocks.mainItemTextHandler!({
      target: 'item-check',
      clipboard: 'Chart fixture',
      position: { x: 100, y: 100 }
    })
    await nextTick()

    expect(show).toHaveBeenCalledWith(1)
    expect(wrapper.find('[data-testid="map-check"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="item-info"]').exists()).toBe(false)
  })
})
