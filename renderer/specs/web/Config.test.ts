// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { applyTheme, getConfig, sendEvent } = vi.hoisted(() => ({
  applyTheme: vi.fn(() => Promise.resolve(false)),
  getConfig: vi.fn(),
  sendEvent: vi.fn()
}))

vi.mock('@/web/background/IPC', () => ({
  Host: { sendEvent, onEvent: vi.fn(), getConfig }
}))
vi.mock('@/web/theme', () => ({ applyTheme }))

import { AppConfig, defaultConfig, initConfig, pushHostConfig, updateConfig } from '@/web/Config'
import type { ItemCheckWidget } from '@/web/item-check/widget'
import type { PriceCheckWidget } from '@/web/overlay/widgets'

describe('price-check default filters', () => {
  it('initializes merchant-only and automatic currency defaults on fresh widgets', () => {
    const widget = defaultConfig().widgets.find(widget => widget.wmType === 'price-check') as PriceCheckWidget
    expect(widget.merchantOnly).toBe(true)
    expect(widget.defaultCurrency).toBeNull()
    expect(widget.itemHoverTooltip).toBe('keybind')
  })

  it.each([false, true])('upgrades older widgets without overwriting saved merchant preference %s', async merchantOnly => {
    const saved = defaultConfig()
    const widget = saved.widgets.find(widget => widget.wmType === 'price-check') as PriceCheckWidget
    widget.merchantOnly = merchantOnly
    delete (widget as Partial<PriceCheckWidget>).defaultCurrency
    getConfig.mockResolvedValue(JSON.stringify(saved))
    await initConfig()
    expect((AppConfig('price-check') as PriceCheckWidget).merchantOnly).toBe(merchantOnly)
    expect((AppConfig('price-check') as PriceCheckWidget).defaultCurrency).toBeNull()
  })

  it('migrates a widget missing both defaults and retains configured currency on later loads', async () => {
    const saved = defaultConfig()
    const widget = saved.widgets.find(widget => widget.wmType === 'price-check') as PriceCheckWidget
    delete (widget as Partial<PriceCheckWidget>).merchantOnly
    delete (widget as Partial<PriceCheckWidget>).defaultCurrency
    getConfig.mockResolvedValue(JSON.stringify(saved))
    await initConfig()
    expect((AppConfig('price-check') as PriceCheckWidget).merchantOnly).toBe(true)
    expect((AppConfig('price-check') as PriceCheckWidget).defaultCurrency).toBeNull()
    widget.defaultCurrency = 'divine'
    getConfig.mockResolvedValue(JSON.stringify(saved))
    await initConfig()
    expect((AppConfig('price-check') as PriceCheckWidget).defaultCurrency).toBe('divine')
  })
})

describe('configured theme', () => {
  beforeEach(() => {
    applyTheme.mockClear()
    getConfig.mockReset()
    sendEvent.mockClear()
  })

  it('keeps the saved selection when its stylesheet temporarily fails to load', async () => {
    updateConfig({ ...defaultConfig(), theme: 'file:theme.css' })
    await Promise.resolve()

    expect(applyTheme).toHaveBeenCalledWith('file:theme.css')
    expect(sendEvent).not.toHaveBeenCalledWith(expect.objectContaining({
      name: 'CLIENT->MAIN::save-config',
      payload: expect.objectContaining({ contents: expect.stringContaining('"theme":"default"') })
    }))
  })
})

describe('PoEDB base modifiers hotkey', () => {
  it('is present and unassigned in new configurations', () => {
    const config = defaultConfig()
    const itemCheck = config.widgets.find(widget => widget.wmType === 'item-check') as ItemCheckWidget

    expect(config.configVersion).toBe(23)
    expect(itemCheck.poedbModsKey).toBeNull()
  })

  it('adds the unassigned hotkey to existing configurations', async () => {
    const savedConfig = defaultConfig()
    savedConfig.configVersion = 22
    const savedItemCheck = savedConfig.widgets.find(widget => widget.wmType === 'item-check') as ItemCheckWidget
    delete (savedItemCheck as Partial<ItemCheckWidget>).poedbModsKey
    getConfig.mockResolvedValue(JSON.stringify(savedConfig))

    await initConfig()

    expect(AppConfig().configVersion).toBe(23)
    expect((AppConfig('item-check') as ItemCheckWidget).poedbModsKey).toBeNull()
  })

  it('registers a copy-item shortcut for the new action', () => {
    const config = defaultConfig()
    const itemCheck = config.widgets.find(widget => widget.wmType === 'item-check') as ItemCheckWidget
    itemCheck.poedbModsKey = 'Ctrl + Alt + M'
    updateConfig(config)

    pushHostConfig()

    expect(sendEvent).toHaveBeenCalledWith({
      name: 'CLIENT->MAIN::update-host-config',
      payload: expect.objectContaining({
        shortcuts: expect.arrayContaining([{
          shortcut: 'Ctrl + Alt + M',
          action: { type: 'copy-item', target: 'open-poedb-mods' }
        }])
      })
    })
  })
})
