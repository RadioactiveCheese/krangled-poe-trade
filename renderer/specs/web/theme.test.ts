// @vitest-environment happy-dom

import { afterEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, loadThemeOptions, themeStylesheetUrl } from '@/web/theme'

function mockStylesheetCandidates (active: HTMLLinkElement): HTMLLinkElement[] {
  const createElement = document.createElement.bind(document)
  const candidates: HTMLLinkElement[] = []
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = createElement(tagName)
    if (tagName === 'link') candidates.push(element as HTMLLinkElement)
    return element
  })
  vi.spyOn(active, 'after').mockImplementation(() => {})
  vi.spyOn(active, 'replaceWith').mockImplementation(() => {})
  return candidates
}

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
    stylesheet.id = 'app-theme'
    document.head.append(stylesheet)
    const candidates = mockStylesheetCandidates(stylesheet)
    const failed = new Promise<CustomEvent>(resolve => {
      window.addEventListener('theme-load-error', event => resolve(event as CustomEvent), { once: true })
    })

    const applied = applyTheme('file:missing.css')
    const fallback = failedCandidateError(candidates[0])
    candidates[1].onload!(new Event('load'))
    await fallback

    expect(await applied).toBe(false)
    expect(document.documentElement.dataset.theme).toBe('default')
    expect((await failed).detail.theme).toBe('file:missing.css')
  })

  it('keeps overlapping theme loads isolated and settles the stale request', async () => {
    const stylesheet = document.createElement('link')
    stylesheet.id = 'app-theme'
    document.head.append(stylesheet)
    const candidates = mockStylesheetCandidates(stylesheet)

    const first = applyTheme('file:first.css')
    const second = applyTheme('file:second.css')

    candidates[0].onload!(new Event('load'))
    expect(await first).toBe(false)
    candidates[1].onload!(new Event('load'))

    expect(await second).toBe(true)
    expect(document.documentElement.dataset.theme).toBe('file:second.css')
  })
})

async function failedCandidateError (candidate: HTMLLinkElement) {
  await candidate.onerror!(new Event('error'))
}
