// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Stat } from '@/assets/data'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { ModifierType, sumStatsByModType } from '@/parser/modifiers'
import { tryParseTranslation } from '@/parser/stat-translations'
import { calculatedStatToFilter } from '@/web/price-check/filters/create-stat-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'

const locale = vi.hoisted(() => ({ value: 'en' }))
function rows (lang: string): Stat[] {
  return readFileSync(`public/data/${lang}/stats.ndjson`, 'utf8').trim().split(/\r?\n/).flatMap(line => {
    const row = JSON.parse(line)
    return row.stats ?? [row]
  })
}
vi.mock('@/assets/data', async (original) => {
  const client = await import('../public/data/en/client_strings.js')
  return {
    ...await original<typeof import('@/assets/data')>(),
    CLIENT_STRINGS: client.default,
    STAT_BY_MATCH_STR_V2: (text: string) => rows(locale.value).find(stat => stat.matchers.some(matcher => matcher.string === text || matcher.advanced === text))
  }
})

describe('Fresh Meat duplicate official IDs', () => {
  for (const lang of ['en', 'ru', 'ko', 'cmn-Hant']) {
    for (const slot of [1, 2, 3, 4]) {
      it(`${lang} parses normal and advanced slot ${slot} modifiers into both searchable IDs`, () => {
        locale.value = lang
        const expected = [149, 150].map(support => `explicit.stat_4089743927|${slot}|${support}`)
        const matches = rows(lang).filter(stat => stat.trade.ids.explicit?.some(id => expected.includes(id)))
        expect(matches).toHaveLength(1)
        const stat = matches[0]
        for (const text of [stat.matchers[0].string, stat.matchers[0].advanced!]) {
          const parsed = tryParseTranslation({ string: text.replace('#', '20'), unscalable: false }, ModifierType.Explicit, ItemCategory.Helmet)!
          expect(parsed.stat.trade.ids.explicit).toEqual(expected)
          expect(parsed.roll?.value).toBe(20)
          const calc = sumStatsByModType([{ info: { type: ModifierType.Explicit, tags: [] }, stats: [parsed] }])[0]
          const item = { rarity: ItemRarity.Rare, category: ItemCategory.Helmet, info: { refName: 'Iron Hat' } } as unknown as ParsedItem
          const filter = calculatedStatToFilter(calc, 10, item)
          filter.disabled = false
          filter.roll!.min = filter.roll!.default.min
          const request = createTradeRequest({ searchExact: { name: 'Iron Hat' }, trade: { league: 'Standard', currency: 'chaos', collapseListings: 'app' } } as ItemFilters, [filter])
          const count = request.query.stats.find(group => group.type === 'count')!
          expect(count.value).toEqual({ min: 1 })
          expect(count.disabled).toBe(false)
          expect(count.filters.map(filter => filter.id)).toEqual(expected)
          expect(count.filters.every(filter => filter.value?.min === 20 && !filter.disabled)).toBe(true)
        }
      })
    }
  }
})
