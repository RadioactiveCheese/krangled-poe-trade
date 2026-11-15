// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { StatOrGroup } from '@/assets/data'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { ModifierType, sumStatsByModType } from '@/parser/modifiers'
import { tryParseTranslation } from '@/parser/stat-translations'
import { calculatedStatToFilter } from '@/web/price-check/filters/create-stat-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'

vi.mock('@/assets/data', async original => ({
  ...await original<typeof import('@/assets/data')>(),
  CLIENT_STRINGS: (await import('../public/data/en/client_strings.js')).default,
  STAT_BY_MATCH_STR_V2: (text: string) => stats.find(stat => stat.matchers.some(matcher => matcher.string === text))
}))

const stats = readFileSync('public/data/en/stats.ndjson', 'utf8')
  .trim().split(/\r?\n/u).flatMap(line => {
    const row = JSON.parse(line) as StatOrGroup
    return 'stats' in row ? row.stats : [row]
  })

describe('support effect trade queries', () => {
  it.each([
    ['Spell Echo', 'explicit.effect_3995245401'],
    ['Controlled Destruction', 'explicit.effect_3431656752'],
    ['Arcane Surge', 'explicit.effect_3438910899']
  ])('searches %s using the current effect ID and level', (support, id) => {
    const parsed = tryParseTranslation({ string: `Socketed Gems are Supported by Level 10 \u200b${support} Support`, unscalable: true }, ModifierType.Explicit, ItemCategory.Wand)!
    expect(parsed).toBeDefined()
    const calc = sumStatsByModType([{ info: { type: ModifierType.Explicit, tags: ['Gem'] }, stats: [parsed] }])[0]
    const item = { rarity: ItemRarity.Unique, category: ItemCategory.Wand, info: { refName: 'Reverberation Rod' } } as ParsedItem
    const filter = calculatedStatToFilter(calc, 10, item)
    filter.disabled = false
    filter.roll!.min = 10
    const request = createTradeRequest({ searchExact: { name: 'Reverberation Rod' }, trade: { league: 'Standard', currency: 'chaos', collapseListings: 'app' } } as ItemFilters, [filter])
    expect(request.query.stats.some(group => group.filters.some(filter => filter.id === id && filter.value?.min === 10 && !filter.disabled))).toBe(true)
  })
})
