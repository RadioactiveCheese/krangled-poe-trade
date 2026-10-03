import fs from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import type { Stat } from '@/assets/data'
import { StatBetter } from '@/assets/data'
import { createVirtualItem, ItemRarity } from '@/parser/ParsedItem'
import { ItemCategory } from '@/parser/meta'
import { ModifierType, sumStatsByModType } from '@/parser/modifiers'
import { initUiModFilters } from '@/web/price-check/filters/create-stat-filters'

vi.mock('@/assets/data', async importOriginal => ({
  ...await importOriginal<typeof import('@/assets/data')>(),
  CLIENT_STRINGS: (await import('../../public/data/en/client_strings.js')).default
}))
vi.mock('@/web/price-check/filters/pseudo', () => ({ filterPseudo: () => {} }))

describe('catalyst quality metadata', () => {
  it.each(['en', 'ru', 'cmn-Hant', 'ko'])('covers the full current official quality set and localized text in %s', language => {
    const contract = JSON.parse(fs.readFileSync(`specs/fixtures/catalyst-quality-${language}.json`, 'utf8'))
    const stats = fs.readFileSync(`public/data/${language}/stats.ndjson`, 'utf8').trim().split('\n').map(line => JSON.parse(line) as Stat)
    const quality = stats.filter(stat => stat.jewelleryQuality)
    expect(quality).toHaveLength(12)
    expect(quality.flatMap(stat => stat.trade.ids.pseudo).sort()).toEqual(contract.entries.map((entry: { id: string }) => entry.id).sort())
    const items = fs.readFileSync(`public/data/${language}/items.ndjson`, 'utf8').trim().split('\n').map(line => JSON.parse(line))
    for (const entry of contract.entries) {
      const stat = quality.find(stat => stat.trade.ids.pseudo?.includes(entry.id))!
      expect(stat.matchers.some(matcher => matcher.string === entry.text.trimEnd()), entry.id).toBe(true)
      expect(items.some(item => item.namespace === 'ITEM' && item.refName === stat.jewelleryQuality!.catalyst)).toBe(true)
    }
  })
})

function fixedRollFilter (category = ItemCategory.Ring, quality = 20, unscalable = false, isCorrupted = false) {
  const matcher = { string: '#% increased maximum Life' }
  const stat: Stat = { ref: '#% increased maximum Life', better: StatBetter.PositiveRoll, matchers: [matcher], trade: { ids: { explicit: ['explicit.life'] } } }
  const modifier = { info: { type: ModifierType.Explicit, rollIncr: 20, tags: ['Life'] }, stats: [{
    stat, translation: matcher, roll: { value: 30, min: 30, max: 30, dp: false, unscalable }
  }] }
  const item = createVirtualItem({
    info: { name: 'Test', refName: 'Test', namespace: 'UNIQUE', unique: { base: 'Gold Ring', fixedStats: [stat.ref] } },
    rarity: ItemRarity.Unique, category, quality, isCorrupted, newMods: [modifier]
  })
  item.statsByType = sumStatsByModType(item.newMods)
  return initUiModFilters(item, { searchStatRange: 10 }).find(filter => filter.statRef === stat.ref)!
}

describe('catalyst-enhanced fixed unique rolls', () => {
  it('keeps scalable enhanced jewellery stats visible with a usable search value', () => {
    const filter = fixedRollFilter()
    expect(filter.hidden).toBeUndefined()
    expect(filter.roll?.value).toBe(36)
    expect(filter.roll?.min).toBe(36)
  })

  it('continues to hide fixed rolls without catalyst quality or on other categories', () => {
    expect(fixedRollFilter(ItemCategory.Ring, 0).hidden).toBe('filters.hide_const_roll')
    expect(fixedRollFilter(ItemCategory.Gloves).hidden).toBe('filters.hide_const_roll')
    expect(fixedRollFilter(ItemCategory.Ring, 20, true).hidden).toBe('filters.hide_const_roll')
  })

  it('retains activation of scalable corrupted rolls alongside catalyst visibility', () => {
    const filter = fixedRollFilter(ItemCategory.Ring, 20, false, true)
    expect(filter.hidden).toBeUndefined()
    expect(filter.disabled).toBe(false)
  })
})
