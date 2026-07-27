import { Host } from '@/web/background/IPC'
import { getTradeEndpoint } from './common'
import { FilterTag, StatFilter } from '../filters/interfaces'
import { AppConfig } from '@/web/Config'

export type MercenaryTradeStatKind = 'skill' | 'support'

export interface MercenaryTradeStat {
  id: string
  text: string
  kind: MercenaryTradeStatKind
}

export interface MercenaryTradeData {
  builds: Map<string, string>
  stats: MercenaryTradeStat[]
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

export function resolveMercenaryBuildTradeId (build: string): string | undefined {
  return loaded.get(`${getTradeEndpoint()}:${AppConfig().language}`)?.builds.get(build)
}

export function createMercenaryStatFilter (stat: MercenaryTradeStat): StatFilter {
  return {
    tradeId: [stat.id],
    statRef: stat.id,
    text: stat.text,
    tag: stat.kind === 'skill'
      ? FilterTag.MercenarySkill
      : FilterTag.MercenarySupport,
    sources: [],
    disabled: false
  }
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
  for (const itemData of [items, localizedItems]) {
    const mapEntries = itemData?.result.find(group => group.id === 'map')?.entries ?? []
    for (const entry of mapEntries) {
      if (entry.disc !== 'mercenary_warrant' || !entry.text) continue
      const build = extractMercenaryBuild(entry.text)
      if (build) builds.set(build, entry.type)
    }
  }

  const tradeStats = mercenaryEntries.flatMap<MercenaryTradeStat>(entry => {
    const kind = entry.id.includes('.skill_')
      ? 'skill'
      : entry.id.includes('.support_')
        ? 'support'
        : undefined
    return kind ? [{ id: entry.id, text: entry.text, kind }] : []
  })

  return { builds, stats: tradeStats }
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
