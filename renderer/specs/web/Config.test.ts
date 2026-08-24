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
