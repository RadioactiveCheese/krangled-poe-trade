// @vitest-environment happy-dom

import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const dataLanguage = vi.hoisted(() => ({ value: 'en' }))

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@/web/Config', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/web/Config')>(),
  AppConfig: () => ({ fontSize: 16 })
}))

vi.mock('@/assets/data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/assets/data')>()
  const { readFileSync } = await import('node:fs')
  const cache = new Map<string, Stat[]>()
  const rows = () => {
    if (!cache.has(dataLanguage.value)) {
      cache.set(dataLanguage.value, readFileSync(`public/data/${dataLanguage.value}/stats.ndjson`, 'utf8').trim().split(/\r?\n/).flatMap(line => {
        const record = JSON.parse(line)
        return record.stats ?? [record]
      }))
    }
    return cache.get(dataLanguage.value)!
  }
  return {
    ...original,
    STAT_BY_REF_V2: (ref: string) => rows().find(row => row.ref === ref),
    STAT_BY_MATCH_STR_V2: (text: string) => rows().find(row => row.matchers.some(matcher => matcher.string === text || matcher.advanced === text))
  }
})

import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'
import { ModifierType, sumStatsByModType } from '@/parser/modifiers'
import { tryParseTranslation } from '@/parser/stat-translations'
import type { Stat } from '@/assets/data/interfaces'
import { initUiModFilters } from '@/web/price-check/filters/create-stat-filters'
import { createTradeRequest } from '@/web/price-check/trade/pathofexile-trade'
import type { ItemFilters } from '@/web/price-check/filters/interfaces'
import FilterGroup from '@/web/price-check/filters/FilterGroup.vue'

function readStats (lang: string): Stat[] {
  return readFileSync(`public/data/${lang}/stats.ndjson`, 'utf8').trim().split(/\r?\n/).flatMap(line => {
    const record = JSON.parse(line)
    return record.stats ?? [record]
  })
}

const rows = readStats('en')
const families = [...new Set(rows.filter(row => row.modFamily && row.trade.ids.explicit?.some(id => id.startsWith('explicit.pseudo_timeless_jewel_'))).map(row => row.modFamily![0]))]
const filters: ItemFilters = {
  searchExact: { name: 'Timeless Jewel' },
  trade: { league: 'Standard', currency: 'chaos', offline: false, onlineInLeague: false, merchantOnly: true, listed: undefined, collapseListings: 'app', collapseMerchant: false }
}

function jewel (seed: Stat): ParsedItem {
  const modifier = {
    info: { type: ModifierType.Explicit, tags: [] },
    stats: [{ stat: seed, translation: seed.matchers[0], roll: { value: 1234, min: 1000, max: 8000, dp: false, unscalable: false } }]
  }
  return {
    rarity: ItemRarity.Unique,
    category: ItemCategory.Jewel,
    info: { refName: 'Timeless Jewel', unique: { base: 'Timeless Jewel', fixedStats: ['Historic'] } },
    influences: [],
    newMods: [modifier],
    statsByType: sumStatsByModType([modifier])
  } as unknown as ParsedItem
}

describe('Timeless Jewel keystone alternatives', () => {
  it.each(families)('groups the full family of %s with the copied seed', (ref) => {
    const seed = rows.find(row => row.ref === ref)!
    const stats = initUiModFilters(jewel(seed), { searchStatRange: 10 })
    const group = stats.find(stat => stat.group === 'one')!
    if (!group.group) throw new Error('Expected keystone group')
    expect(group.stats.map(stat => stat.statRef)).toEqual(seed.modFamily)
    expect(group.stats.every(stat => stat.roll?.value === 1234)).toBe(true)
    expect(group.stats.filter(stat => !stat.disabled).map(stat => stat.statRef)).toEqual([ref])
    expect(stats.filter(stat => !stat.group)).toHaveLength(0)
    const request = createTradeRequest(filters, stats)
    expect(request.query.stats[0].filters).toHaveLength(0)
    const count = request.query.stats.find(group => group.type === 'count')!
    expect(count.value).toEqual({ min: 1 })
    expect(count.disabled).toBe(false)
    expect(count.filters.filter(stat => !stat.disabled).map(stat => stat.id)).toEqual(seed.trade.ids.explicit)
    group.stats[0].disabled = true
    expect(createTradeRequest(filters, stats).query.stats.find(group => group.type === 'count')?.disabled).toBe(true)
    group.stats[1].disabled = false
    expect(createTradeRequest(filters, stats).query.stats.find(group => group.type === 'count')?.disabled).toBe(false)
    group.meta.disabled = true
    expect(createTradeRequest(filters, stats).query.stats.find(group => group.type === 'count')?.disabled).toBe(true)
  })

  it('matches every official Timeless stat ID and complete family in every supported locale', () => {
    const fixture = JSON.parse(readFileSync('specs/fixtures/timeless-jewel-trade-stats.json', 'utf8'))
    const expectedIds = fixture.entries.map((entry: { id: string }) => entry.id).sort()
    expect(families).toHaveLength(6)
    for (const lang of readdirSync('public/data')) {
      if (!existsSync(`public/data/${lang}/stats.ndjson`)) continue
      const stats = readStats(lang)
      const timeless = stats.filter(stat => stat.trade.ids.explicit?.some(id => id.startsWith('explicit.pseudo_timeless_jewel_')))
      expect(timeless.flatMap(stat => stat.trade.ids.explicit).sort(), lang).toEqual(expectedIds)
      for (const stat of timeless.filter(stat => stat.modFamily)) {
        expect(stat.modFamily, lang).toContain(stat.ref)
        for (const ref of stat.modFamily!) {
          const sibling = stats.find(stat => stat.ref === ref)
          expect(sibling?.modFamily, `${lang}: ${ref}`).toEqual(stat.modFamily)
          expect(sibling?.matchers.length, `${lang}: ${ref}`).toBeGreaterThan(0)
        }
      }
    }
  })

  it('parses every current and legacy seed translation in every supported locale', () => {
    for (const lang of ['en', 'ru', 'ko', 'cmn-Hant']) {
      dataLanguage.value = lang
      for (const stat of readStats(lang).filter(stat => stat.modFamily && stat.trade.ids.explicit?.some(id => id.startsWith('explicit.pseudo_timeless_jewel_')))) {
        const parsed = tryParseTranslation({ string: stat.matchers[0].string.replace('#', '1234'), unscalable: false }, ModifierType.Explicit, ItemCategory.Jewel)
        expect(parsed?.stat.ref, `${lang}: ${stat.ref}`).toBe(stat.ref)
        expect(parsed?.roll?.value, `${lang}: ${stat.ref}`).toBe(1234)
      }
    }
    dataLanguage.value = 'en'
  })

  it('renders an expandable group and toggles alternative keystones', async () => {
    const seed = rows.find(row => row.ref === families[0])!
    const item = jewel(seed)
    const group = initUiModFilters(item, { searchStatRange: 10 }).find(stat => stat.group === 'one')!
    if (!group.group) throw new Error('Expected keystone group')
    const wrapper = mount(FilterGroup, { props: { group, item } })
    expect(wrapper.text()).toContain('item.count_one_group')
    expect(wrapper.text()).toContain('filters.tag_pseudo')
    const label = wrapper.findAll('button').find(button => button.text().includes(group.stats[1].text.split('\n')[0].replace('#', '1234')))!
    await label.trigger('click')
    expect(group.stats[1].disabled).toBe(false)
    const count = createTradeRequest(filters, [group]).query.stats.find(group => group.type === 'count')!
    expect(count.filters.filter(filter => !filter.disabled)).toHaveLength(2)
    wrapper.unmount()
  })
})
