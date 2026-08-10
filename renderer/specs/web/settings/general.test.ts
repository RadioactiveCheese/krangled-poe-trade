// @vitest-environment happy-dom

import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'

const { applyTheme, loadThemeOptions } = vi.hoisted(() => ({
  applyTheme: vi.fn(() => Promise.resolve(false)),
  loadThemeOptions: vi.fn(() => Promise.resolve([{ value: 'default', label: 'Default' }]))
}))

vi.mock('@/web/theme', () => ({
  DEFAULT_THEME_OPTIONS: [{ value: 'default', label: 'Default' }],
  applyTheme,
  loadThemeOptions,
  duplicateTheme: vi.fn(),
  importTheme: vi.fn(),
  openThemeFolder: vi.fn()
}))
vi.mock('@/web/i18n', () => ({ useI18nNs: () => ({ t: (key: string) => key }) }))

import { defaultConfig } from '@/web/Config'
import SettingsGeneral from '@/web/settings/general.vue'

afterEach(() => {
  vi.useRealTimers()
})

describe('theme selector refresh', () => {
  it('keeps an unavailable selection while showing Default temporarily', async () => {
    vi.useFakeTimers()
    const config = { ...defaultConfig(), theme: 'file:theme.css' as const }
    const wrapper = mount(SettingsGeneral, { props: { config } })
    await flushPromises()

    expect(config.theme).toBe('file:theme.css')
    expect(wrapper.text()).toContain('Default is shown temporarily')

    wrapper.unmount()
  })
})
