// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const { applyTheme, sendEvent } = vi.hoisted(() => ({
  applyTheme: vi.fn(() => Promise.resolve(false)),
  sendEvent: vi.fn()
}))

vi.mock('@/web/background/IPC', () => ({
  Host: { sendEvent, onEvent: vi.fn(), getConfig: vi.fn() }
}))
vi.mock('@/web/theme', () => ({ applyTheme }))

import { defaultConfig, updateConfig } from '@/web/Config'

describe('configured theme', () => {
  beforeEach(() => {
    applyTheme.mockClear()
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
