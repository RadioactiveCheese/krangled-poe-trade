// @vitest-environment happy-dom

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calcPropPercentile, getPropQuality, getTradeMaxQuality, propAt20Quality, QUALITY_STATS } from '@/parser/calc-q20'
import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import type { Stat } from '@/assets/data'
import { createFilters } from '@/web/price-check/filters/create-item-filters'

function item (quality = 0, enchant?: string): ParsedItem {
  return {
    quality,
    statsByType: enchant ? [{ stat: { ref: enchant }, sources: [] }] : []
  } as unknown as ParsedItem
}

describe('unique base defence and quality bounds', () => {
  it('includes the full base percentile range at trade quality', () => {
    expect(propAt20Quality(110, QUALITY_STATS.ARMOUR, [100, 120], item()).roll).toEqual({ value: 132, min: 120, max: 144 })
  })

  it('keeps over-20 quality in values and bounds', () => {
    expect(propAt20Quality(156, QUALITY_STATS.ARMOUR, [100, 120], item(30)).roll).toEqual({ value: 156, min: 130, max: 156 })
  })

  it.each(['Quality does not increase Defences', 'Quality does not increase Physical Damage'])('uses no property quality for %s', (enchant) => {
    const parsed = item(20, enchant)
    expect(getPropQuality(parsed)).toBe(0)
    expect(getTradeMaxQuality(parsed)).toBe(0)
    expect(propAt20Quality(110, QUALITY_STATS.ARMOUR, [100, 120], parsed).roll).toEqual({ value: 110, min: 100, max: 120 })
    expect(calcPropPercentile(110, [100, 120], QUALITY_STATS.ARMOUR, parsed)).toBe(50)
  })

  it('falls back to observed base values when bounds are unavailable', () => {
    expect(propAt20Quality(110, QUALITY_STATS.ARMOUR, undefined, item()).roll).toEqual({ value: 132, min: 132, max: 132 })
  })

  it('ignores non-numeric contributors when calculating properties', () => {
    const parsed = item()
    parsed.statsByType.push({ stat: { ref: '+# to Armour' }, sources: [] } as never)
    expect(propAt20Quality(110, QUALITY_STATS.ARMOUR, undefined, parsed).roll.value).toBe(132)
  })

  it('searches quality directly when an enchant changes its effect', () => {
    const parsed = {
      ...item(20, 'Quality does not increase Defences'),
      category: ItemCategory.BodyArmour,
      rarity: ItemRarity.Rare,
      info: { name: 'Plate Vest', refName: 'Plate Vest', namespace: 'ITEM', craftable: { category: ItemCategory.BodyArmour } },
      influences: [], newMods: []
    } as unknown as ParsedItem
    const filters = createFilters(parsed, { league: 'Standard', currency: 'chaos', collapseListings: 'app', activateStockFilter: false, exact: false, useEn: true })
    expect(filters.quality?.value).toBe(20)
  })

  it('retains every affected mapping across all locales from the complete current official stat audit', () => {
    const fixture: { refs: string[], ids: string[] } = JSON.parse(readFileSync('specs/fixtures/unique-property-trade-stats.json', 'utf8'))
    for (const lang of readdirSync('public/data')) {
      if (!existsSync(`public/data/${lang}/stats.ndjson`)) continue
      const rows: Stat[] = readFileSync(`public/data/${lang}/stats.ndjson`, 'utf8').trim().split(/\r?\n/).flatMap(line => {
        const row = JSON.parse(line)
        return row.stats ?? [row]
      })
      const affected = rows.filter(row => fixture.refs.includes(row.ref))
      expect([...new Set(affected.map(row => row.ref))].sort(), lang).toEqual(fixture.refs)
      const ids = [...new Set(affected.flatMap(row => Object.values(row.trade.ids).flat()))].sort()
      expect(ids, lang).toEqual(fixture.ids)
    }
  })
})
