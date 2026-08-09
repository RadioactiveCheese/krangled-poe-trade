// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, loadThemeOptions, themeStylesheetUrl } from '@/web/theme'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.innerHTML = ''
  document.documentElement.removeAttribute('data-theme')
})

describe('themes', () => {
  it('uses metadata names and retains validation details from the host', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify([{
      filename: 'readable.css',
      source: 'user',
      modifiedAt: 42,
      metadata: { name: 'Readable', description: 'Clear text' },
      warnings: ['Example warning']
    }]), { status: 200 })))

    const options = await loadThemeOptions()

    expect(options.map(option => option.label)).toEqual(['Default', 'Readable'])
    expect(options[1].info?.warnings).toEqual(['Example warning'])
  })

  it('encodes custom filenames in stylesheet URLs', () => {
    expect(themeStylesheetUrl('file:My Theme.css')).toMatch(/^\/user-theme\?file=My%20Theme\.css&v=\d+$/)
  })

  it('falls back to Default and reports a failed custom stylesheet', async () => {
    const stylesheet = document.createElement('link')
    vi.spyOn(document, 'querySelector').mockReturnValue(stylesheet)
    const failed = new Promise<CustomEvent>(resolve => {
      window.addEventListener('theme-load-error', event => resolve(event as CustomEvent), { once: true })
    })

    const applied = applyTheme('file:missing.css')
    stylesheet.onerror!(new Event('error'))

    expect(await applied).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('default')
    expect((await failed).detail.theme).toBe('file:missing.css')
  })
})
