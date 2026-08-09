import { app, shell } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'

const MAX_THEME_BYTES = 512 * 1024
const THEME_FILENAME = /^[^<>:"/\\|?*\x00-\x1F]+\.css$/i
const METADATA_PATTERN = /^\s*\/\*[\s\S]*?\*\//

const DEFAULT_THEME = `/*
 * @name My Theme
 * @author Your name
 * @description A custom Krangled PoE Trade theme
 * @version 1
 */
@import url('/themes/default.css');

:root {
  /* Semantic application colors */
  --theme-surface-primary: var(--theme-gray-900);
  --theme-surface-raised: var(--theme-gray-800);
  --theme-border-subtle: var(--theme-gray-600);
  --theme-text-primary: var(--theme-gray-100);
  --theme-text-muted: var(--theme-gray-400);
  --theme-accent: var(--theme-blue-400);
  --theme-focus-ring: var(--theme-blue-400);
  --theme-selection: var(--theme-blue-600);
  --theme-danger: var(--theme-red-500);

  /* Override any variables from /themes/default.css below. */
  --theme-gray-700: #4a5568;
  --theme-gray-800: #2d3748;
  --theme-gray-900: #1a202c;
}
`

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

export interface ThemeWriteResult {
  theme: ThemeInfo
  warnings: string[]
}

export class ThemeValidationError extends Error {}

function validFilename (filename: string): boolean {
  return path.basename(filename) === filename && THEME_FILENAME.test(filename)
}

function parseMetadata (css: string): ThemeMetadata {
  const comment = css.match(METADATA_PATTERN)?.[0] ?? ''
  const metadata: ThemeMetadata = {}
  for (const key of ['name', 'author', 'description', 'version'] as const) {
    const value = comment.match(new RegExp(`@${key}\\s+([^\\r\\n*]+)`, 'i'))?.[1]?.trim()
    if (value) metadata[key] = value
  }
  return metadata
}

function validateCss (css: string): string[] {
  if (!css.trim()) throw new ThemeValidationError('Theme file is empty.')
  if (Buffer.byteLength(css, 'utf8') > MAX_THEME_BYTES) {
    throw new ThemeValidationError('Theme files must be smaller than 512 KB.')
  }

  let depth = 0
  let quote: '"' | "'" | null = null
  let escaped = false
  let inComment = false
  for (let index = 0; index < css.length; index++) {
    const char = css[index]
    const next = css[index + 1]
    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false
        index++
      }
      continue
    }
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
      continue
    }
    if (char === '/' && next === '*') {
      inComment = true
      index++
      continue
    }
    if (char === '"' || char === "'") {
      quote = char
      continue
    }
    if (char === '{') depth++
    if (char === '}') depth--
    if (depth < 0) throw new ThemeValidationError('Theme contains an unmatched closing brace.')
  }
  if (depth !== 0) throw new ThemeValidationError('Theme contains an unmatched opening brace.')

  const importsDefault = /@import\s+(?:url\()?['"]?\/themes\/default\.css/i.test(css)
  const hasRoot = /:root\s*\{/.test(css)
  if (!importsDefault && !hasRoot) {
    throw new ThemeValidationError('Theme must import /themes/default.css or define a :root block.')
  }

  const warnings: string[] = []
  const metadata = parseMetadata(css)
  if (!metadata.name) warnings.push('Add @name metadata to control the name shown in Settings.')
  if (!metadata.description) warnings.push('Add @description metadata to explain the theme.')
  if (!importsDefault) {
    for (const variable of [
      '--theme-surface-primary',
      '--theme-surface-raised',
      '--theme-text-primary',
      '--theme-accent',
      '--theme-focus-ring'
    ]) {
      if (!css.includes(variable)) warnings.push(`Missing recommended variable ${variable}.`)
    }
  }
  return warnings
}

async function readJsonThemeInfo (filePath: string, filename: string, source: ThemeInfo['source']): Promise<ThemeInfo> {
  const [css, stat] = await Promise.all([fs.readFile(filePath, 'utf8'), fs.stat(filePath)])
  let warnings: string[]
  try {
    warnings = validateCss(css)
  } catch (error) {
    warnings = [(error as Error).message]
  }
  return {
    filename,
    source,
    modifiedAt: stat.mtimeMs,
    metadata: parseMetadata(css),
    warnings
  }
}

export class ThemeStore {
  private readonly userPath = path.join(app.getPath('userData'), 'apt-data')
  private readonly shippedPath = (process.env.VITE_DEV_SERVER_URL)
    ? path.join(__dirname, '../../renderer/public/themes')
    : path.join(__dirname, 'themes')

  async list (): Promise<ThemeInfo[]> {
    await this.ensureStarterTheme()
    const themes = new Map<string, ThemeInfo>()
    for (const [dir, source] of [[this.shippedPath, 'shipped'], [this.userPath, 'user']] as const) {
      const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (entry.isFile() && validFilename(entry.name) && entry.name.toLowerCase() !== 'default.css') {
          themes.set(entry.name, await readJsonThemeInfo(path.join(dir, entry.name), entry.name, source))
        }
      }
    }
    return [...themes.values()].sort((a, b) => {
      const aName = a.metadata.name ?? a.filename
      const bName = b.metadata.name ?? b.filename
      return aName.localeCompare(bName)
    })
  }

  async load (filename = 'theme.css'): Promise<string> {
    if (!validFilename(filename)) throw new ThemeValidationError('Invalid theme filename.')
    await this.ensureStarterTheme()
    try {
      return await fs.readFile(path.join(this.userPath, filename), 'utf8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      return await fs.readFile(path.join(this.shippedPath, filename), 'utf8')
    }
  }

  async import (filename: string, css: string): Promise<ThemeWriteResult> {
    if (!validFilename(filename)) throw new ThemeValidationError('Use a valid filename ending in .css.')
    if (filename.toLowerCase() === 'default.css') throw new ThemeValidationError('default.css is reserved by the application.')
    const warnings = validateCss(css)
    await fs.mkdir(this.userPath, { recursive: true })
    const target = path.join(this.userPath, filename)
    await fs.writeFile(target, css, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'EEXIST') throw new ThemeValidationError(`${filename} already exists in the config folder.`)
      throw error
    })
    return { theme: await readJsonThemeInfo(target, filename, 'user'), warnings }
  }

  async duplicate (filename: string): Promise<ThemeWriteResult> {
    const css = await this.load(filename)
    const stem = filename.replace(/\.css$/i, '')
    let copyName = `${stem}-copy.css`
    for (let index = 2; await this.userFileExists(copyName); index++) copyName = `${stem}-copy-${index}.css`
    return await this.import(copyName, css.replace(METADATA_PATTERN, (comment) => {
      const name = parseMetadata(css).name ?? stem
      return comment.replace(/(@name\s+).+?(\s*\r?\n)/i, `$1${name} Copy$2`)
    }))
  }

  async openFolder (): Promise<void> {
    await fs.mkdir(this.userPath, { recursive: true })
    const error = await shell.openPath(this.userPath)
    if (error) throw new Error(error)
  }

  private async userFileExists (filename: string): Promise<boolean> {
    return await fs.access(path.join(this.userPath, filename)).then(() => true, () => false)
  }

  private async ensureStarterTheme () {
    const themePath = path.join(this.userPath, 'theme.css')
    try {
      await fs.access(themePath)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await fs.mkdir(this.userPath, { recursive: true })
      await fs.writeFile(themePath, DEFAULT_THEME, { flag: 'wx' }).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== 'EEXIST') throw error
      })
    }
  }
}
