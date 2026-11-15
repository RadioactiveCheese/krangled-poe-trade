// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { BaseType, StatOrGroup } from '@/assets/data'
import { ItemCategory, parseClipboard } from '@/parser'
import { createPresets } from '@/web/price-check/filters/create-presets'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'

vi.mock('@/assets/data', async original => ({
  ...await original<typeof import('@/assets/data')>(),
  CLIENT_STRINGS: (await import('../public/data/en/client_strings.js')).default,
  ITEM_BY_TRANSLATED: (namespace: string, name: string) => items.filter(item => item.namespace === namespace && item.name === name),
  ITEM_BY_REF: (namespace: string, name: string) => items.filter(item => item.namespace === namespace && item.refName === name),
  STAT_BY_MATCH_STR_V2: (text: string) => stats.find(row => ('stats' in row ? row.stats : [row])
    .some(stat => stat.matchers.some(matcher => matcher.string === text || matcher.advanced === text)))
}))

const items = readFileSync('public/data/en/items.ndjson', 'utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line) as BaseType)
const stats = readFileSync('public/data/en/stats.ndjson', 'utf8').trim().split(/\r?\n/u).map(line => JSON.parse(line) as StatOrGroup)

describe('Viscera price checks', () => {
  it.each([
    ['greater-solar-shield', 'Greater Solar Shield', 'Solar Shield', [13, 12]],
    ['lesser-lunar-bow', 'Lesser Lunar Bow', 'Lunar Bow', [15]]
  ] as const)('searches the reported %s by its official base and rolled implicit effects', (fixture, displayName, base, rolls) => {
    const result = parseClipboard(readFileSync(`specs/fixtures/viscera-${fixture}.txt`, 'utf8'))
    expect(result.isOk()).toBe(true)
    if (!result.isOk()) throw new Error(result.error)
    const item = result.value
    expect(item.category).toBe(ItemCategory.Viscera)
    for (const useEn of [true, false]) {
      const presets = createPresets(item, {
        league: 'Covens of Umbra', collapseListings: 'app', activateStockFilter: false,
        searchStatRange: 10, useEn
      })
      expect(presets.presets).toHaveLength(1)
      const preset = presets.presets[0]
      expect(preset.filters.searchExact.baseType).toBe(displayName)
      expect(preset.filters.searchRelaxed?.disabled).toBe(true)
      expect(preset.filters.corrupted).toBeUndefined()
      expect(preset.filters.itemLevel).toBeUndefined()
      expect(preset.filters.rarity).toBeUndefined()
      expect(preset.stats.map(stat => 'filters' in stat ? undefined : stat.roll?.value)).toEqual(rolls)
      expect(preset.stats.every(stat => !stat.disabled && !('hidden' in stat && stat.hidden))).toBe(true)
      const request = createTradeRequest(preset.filters, preset.stats)
      expect(request.query.type).toBe(base)
      const queryStats = request.query.stats.flatMap(group => group.filters)
      expect(queryStats).toHaveLength(rolls.length)
      expect(queryStats.every(stat => stat.id.startsWith('implicit.') && stat.value!.min! >= 10 && !stat.disabled)).toBe(true)
      preset.filters.searchRelaxed!.disabled = false
      expect(createTradeRequest(preset.filters, preset.stats).query.filters.type_filters?.filters?.category?.option).toBe('viscera')
    }
  })
})
