import { Host } from '@/web/background/IPC'
import { getTradeEndpoint } from './common'
import { AppConfig } from '@/web/Config'
import {
  MERCENARY_BUILD_SKILL_IDS,
  MercenaryBuildSkillIds
} from '@/assets/data/mercenary-build-skills'
import { selectMercenaryBuildVariantTradeId } from '../filters/mercenary-build-filter'

export type MercenaryTradeStatKind = 'skill' | 'support'

export interface MercenaryTradeStat {
  id: string
  text: string
  kind: MercenaryTradeStatKind
}

export interface MercenaryTradeData {
  builds: Map<string, string>
  stats: MercenaryTradeStat[]
  skillsByBuild: Map<string, MercenaryBuildSkills>
  buildVariants: Map<string, MercenaryBuildVariant>
}

export type MercenaryBuildSkills = Record<keyof MercenaryBuildSkillIds, MercenaryTradeStat[]>

export interface MercenaryBuildVariant {
  baseName: string
  normalTradeId: string
  infamousTradeId?: string
  isInfamous: boolean
}

interface TradeDataGroup<T> {
  id: string
  entries: T[]
}

interface TradeItemEntry {
  type: string
  text?: string
  disc?: string
}

interface TradeStatEntry {
  id: string
  text: string
  type: string
}

const cache = new Map<string, Promise<MercenaryTradeData>>()
const loaded = new Map<string, MercenaryTradeData>()

export function loadMercenaryTradeData (): Promise<MercenaryTradeData> {
  const endpoint = getTradeEndpoint()
  const cacheKey = `${endpoint}:${AppConfig().language}`
  let request = cache.get(cacheKey)
  if (!request) {
    request = requestMercenaryTradeData(endpoint, languageEndpoint(endpoint)).then(data => {
      loaded.set(cacheKey, data)
      return data
    }).catch(error => {
      cache.delete(cacheKey)
      throw error
    })
    cache.set(cacheKey, request)
  }
  return request
}

export function resolveMercenaryBuildTradeId (build: string, infamous?: boolean): string | undefined {
  const data = loaded.get(`${getTradeEndpoint()}:${AppConfig().language}`)
  if (infamous == null) return data?.builds.get(build)

  const variant = data?.buildVariants.get(build)
  return variant && selectMercenaryBuildVariantTradeId(variant, infamous)
}

async function requestMercenaryTradeData (
  endpoint: string,
  localizedEndpoint: string
): Promise<MercenaryTradeData> {
  const [itemsResponse, statsResponse, localizedItemsResponse] = await Promise.all([
    Host.proxy(`${endpoint}/api/trade/data/items`),
    Host.proxy(`${endpoint}/api/trade/data/stats`),
    (localizedEndpoint === endpoint)
      ? undefined
      : Host.proxy(`${localizedEndpoint}/api/trade/data/items`)
  ])

  if (!itemsResponse.ok || !statsResponse.ok || localizedItemsResponse?.ok === false) {
    throw new Error(`HTTP ${itemsResponse.status}/${statsResponse.status}/${localizedItemsResponse?.status ?? '-'}`)
  }

  const items = await itemsResponse.json() as { result: Array<TradeDataGroup<TradeItemEntry>> }
  const stats = await statsResponse.json() as { result: Array<TradeDataGroup<TradeStatEntry>> }
  const localizedItems = localizedItemsResponse
    ? await localizedItemsResponse.json() as { result: Array<TradeDataGroup<TradeItemEntry>> }
    : undefined

  const mercenaryEntries = stats.result.find(group => group.id === 'mercenary')?.entries ?? []

  const builds = new Map<string, string>()
  const buildNamesById = new Map<string, string>()
  for (const itemData of [items, localizedItems]) {
    const mapEntries = itemData?.result.find(group => group.id === 'map')?.entries ?? []
    for (const entry of mapEntries) {
      if (entry.disc !== 'mercenary_warrant' || !entry.text) continue
      const build = extractMercenaryBuild(entry.text)
      if (build) {
        builds.set(build, entry.type)
        buildNamesById.set(entry.type, build)
      }
    }
  }

  const buildVariants = new Map<string, MercenaryBuildVariant>()
  for (const [buildName, tradeId] of builds) {
    const normalTradeId = tradeId.endsWith('Noble')
      ? tradeId.slice(0, -'Noble'.length)
      : tradeId
    const baseName = buildNamesById.get(normalTradeId)
    if (!baseName) continue

    const infamousTradeId = `${normalTradeId}Noble`
    buildVariants.set(buildName, {
      baseName,
      normalTradeId,
      infamousTradeId: buildNamesById.has(infamousTradeId) ? infamousTradeId : undefined,
      isInfamous: tradeId === infamousTradeId
    })
  }

  const tradeStats = mercenaryEntries.flatMap<MercenaryTradeStat>(entry => {
    const kind = entry.id.includes('.skill_')
      ? 'skill'
      : entry.id.includes('.support_')
        ? 'support'
        : undefined
    return kind ? [{ id: entry.id, text: entry.text, kind }] : []
  })

  const statsById = new Map(tradeStats.map(stat => [stat.id, stat]))
  const skillsByBuild = new Map<string, MercenaryBuildSkills>()
  for (const [buildName, tradeBuildId] of builds) {
    const skillIds = MERCENARY_BUILD_SKILL_IDS[tradeBuildId]
    if (!skillIds) continue

    const groups: MercenaryBuildSkills = { primary: [], secondary: [], utility: [] }
    let complete = true
    for (const kind of ['primary', 'secondary', 'utility'] as const) {
      for (const id of skillIds[kind]) {
        const stat = statsById.get(id)
        if (!stat) {
          complete = false
          break
        }
        groups[kind].push(stat)
      }
    }
    if (complete) skillsByBuild.set(buildName, groups)
  }

  return { builds, stats: tradeStats, skillsByBuild, buildVariants }
}

function extractMercenaryBuild (text: string): string | undefined {
  return text.match(/\(([^()]*)\)$/u)?.[1].trim()
}

function languageEndpoint (fallback: string): string {
  switch (AppConfig().language) {
    case 'en': return 'www.pathofexile.com'
    case 'ru': return 'ru.pathofexile.com'
    case 'cmn-Hant': return 'pathofexile.tw'
    case 'ko': return 'poe.kakaogames.com'
    default: return fallback
  }
}
