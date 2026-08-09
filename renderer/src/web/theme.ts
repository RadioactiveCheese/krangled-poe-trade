export type AppTheme = 'default' | `file:${string}`

export interface ThemeMetadata {
  name?: string
  author?: string
  description?: string
  version?: string
}

export interface ThemeInfo {
  filename: string
  source: 'shipped' | 'user'
  modifiedAt: number
  metadata: ThemeMetadata
  warnings: string[]
}

export interface ThemeOption {
  value: AppTheme
  label: string
  info?: ThemeInfo
}

export const DEFAULT_THEME_OPTIONS: ThemeOption[] = [
  { value: 'default', label: 'Default' }
]

function themeLabel (filename: string): string {
  return filename
    .replace(/\.css$/i, '')
    .split(/[-_\s]+/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

export function themeStylesheetUrl (theme: AppTheme): string {
  return theme === 'default'
    ? `/themes/default.css?v=${Date.now()}`
    : `/user-theme?file=${encodeURIComponent(theme.slice('file:'.length))}&v=${Date.now()}`
}

async function responseJson<T> (response: Response): Promise<T> {
  const body = await response.json() as T & { error?: string }
  if (!response.ok) throw new Error(body.error ?? `Theme request failed (${response.status}).`)
  return body
}

export async function loadThemeOptions (): Promise<ThemeOption[]> {
  const response = await fetch('/user-themes', { cache: 'no-store' })
  const themes = await responseJson<ThemeInfo[]>(response)
  return [
    ...DEFAULT_THEME_OPTIONS,
    ...themes.map(info => ({
      value: `file:${info.filename}` as AppTheme,
      label: info.metadata.name ?? themeLabel(info.filename),
      info
    }))
  ]
}

export async function importTheme (file: File) {
  return await responseJson<{ theme: ThemeInfo, warnings: string[] }>(await fetch('/user-themes', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: file.name, css: await file.text() })
  }))
}

export async function duplicateTheme (theme: AppTheme) {
  if (theme === 'default') throw new Error('Select a theme to duplicate.')
  return await responseJson<{ theme: ThemeInfo, warnings: string[] }>(await fetch('/user-themes/duplicate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ filename: theme.slice('file:'.length) })
  }))
}

export async function openThemeFolder () {
  await responseJson(await fetch('/user-themes/open', { method: 'POST' }))
}

let applySequence = 0

export function applyTheme (theme: AppTheme): Promise<boolean> {
  const stylesheet = document.querySelector<HTMLLinkElement>('#app-theme')
  if (!stylesheet) return Promise.resolve(false)
  const sequence = ++applySequence

  return new Promise(resolve => {
    stylesheet.onload = () => {
      if (sequence !== applySequence) return resolve(false)
      document.documentElement.dataset.theme = theme
      resolve(true)
    }
    stylesheet.onerror = () => {
      if (sequence !== applySequence) return resolve(false)
      stylesheet.onload = null
      stylesheet.onerror = null
      stylesheet.href = themeStylesheetUrl('default')
      document.documentElement.dataset.theme = 'default'
      window.dispatchEvent(new CustomEvent('theme-load-error', { detail: { theme } }))
      resolve(false)
    }
    stylesheet.href = themeStylesheetUrl(theme)
  })
}
