// @vitest-environment happy-dom

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { StatBetter, type Stat } from '@/assets/data/interfaces'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { ModifierType } from '@/parser/modifiers'
import { createExactStatFilters, initUiModFilters } from '@/web/price-check/filters/create-stat-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'

function clusterJewel (count: number): ParsedItem {
  const stat: Stat = {
    ref: 'Adds # Passive Skills',
    better: StatBetter.NegativeRoll,
    matchers: [{ string: 'Adds # Passive Skills' }],
    trade: { ids: { enchant: ['enchant.stat_3086156145'] } }
  }
  const modifier = { info: { type: ModifierType.Enchant, tags: [] }, stats: [] }
  return {
    rarity: ItemRarity.Rare,
    category: ItemCategory.ClusterJewel,
    info: { refName: 'Medium Cluster Jewel' },
    influences: [],
    newMods: [],
    statsByType: [{
      stat,
      type: ModifierType.Enchant,
      sources: [{
        modifier,
        stat: { stat, translation: stat.matchers[0], roll: { value: count, min: count, max: count, dp: false, unscalable: false } },
        contributes: { value: count, min: count, max: count }
      }]
    }]
  } as unknown as ParsedItem
}

const filters: ItemFilters = {
  searchExact: { baseType: 'Medium Cluster Jewel' },
  trade: { league: 'Standard', currency: 'chaos', offline: false, onlineInLeague: false, merchantOnly: true, listed: undefined, collapseListings: 'app', collapseMerchant: false }
}

describe('Medium Cluster Jewel passive ranges', () => {
  it.each([
    [4, false, undefined, 5],
    [5, false, undefined, 5],
    [6, false, 6, undefined],
    [4, true, undefined, 5],
    [5, true, 5, 5],
    [6, true, 6, undefined]
  ] as const)('searches %i passives with exact=%s', (count, exact, min, max) => {
    const item = clusterJewel(count)
    const stats = exact
      ? createExactStatFilters(item, item.statsByType, { searchStatRange: 0 })
      : initUiModFilters(item, { searchStatRange: 0 })
    const passive = stats.find(stat => stat.statRef === 'Adds # Passive Skills')!
    expect(passive.disabled).toBe(false)
    expect(passive.roll?.min).toBe(min)
    expect(passive.roll?.max).toBe(max)
    const query = createTradeRequest(filters, stats)
    expect(query.query.stats[0].filters.find(stat => stat.id === 'enchant.stat_3086156145')).toEqual({
      id: 'enchant.stat_3086156145', disabled: false, value: { min, max, option: undefined }
    })
  })

  it('keeps all localized passive-count mappings aligned with the current official Trade IDs', () => {
    for (const lang of readdirSync('public/data')) {
      const file = `public/data/${lang}/stats.ndjson`
      if (!existsSync(file)) continue
      const entries: Stat[] = readFileSync(file, 'utf8').trim().split(/\r?\n/).map(line => JSON.parse(line))
      const stat = entries.find(entry => entry.ref === 'Adds # Passive Skills')
      expect(stat, lang).toBeDefined()
      expect(stat?.trade.ids, lang).toEqual({ explicit: ['explicit.stat_3086156145'], enchant: ['enchant.stat_3086156145'] })
      expect(stat?.matchers.length, lang).toBeGreaterThan(0)
    }
  })
})
