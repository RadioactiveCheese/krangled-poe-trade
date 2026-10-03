import { describe, expect, it } from 'vitest'
import { StatBetter, type Stat } from '@/assets/data/interfaces'
import { ItemRarity, ItemCategory, type ParsedItem } from '@/parser'
import { ModifierType, statSourcesTotal, translateStatWithRoll, type StatCalculated, type StatSource } from '@/parser/modifiers'
import { calculatedStatToFilter } from '@/web/price-check/filters/create-stat-filters'

const item = {
  rarity: ItemRarity.Rare,
  category: ItemCategory.Jewel,
  info: { refName: 'Test Jewel' }
} as ParsedItem

function source (stat: Stat, value?: number, dp = false): StatSource {
  return {
    modifier: { info: { type: ModifierType.Implicit, tags: [] }, stats: [] },
    stat: {
      stat,
      translation: stat.matchers[0],
      roll: value == null ? undefined : { value, min: value, max: value, dp, unscalable: false }
    },
    contributes: value == null ? undefined : { value, min: value, max: value }
  }
}

function calculation (text: string, values: Array<number | undefined>): StatCalculated {
  const stat: Stat = {
    ref: 'test_stat',
    better: StatBetter.PositiveRoll,
    trade: { ids: { implicit: ['implicit.test'] } },
    matchers: [{ string: text }]
  }
  return { stat, type: ModifierType.Implicit, sources: values.map(value => source(stat, value)) }
}

describe('flag stat aggregation', () => {
  it.each(['Cannot be Frozen', 'Vous ne pouvez pas être Gelé'])('keeps repeated flags non-numeric: %s', (text) => {
    const calc = calculation(text, [undefined, undefined])
    expect(statSourcesTotal(calc.sources)).toBeUndefined()
    expect(statSourcesTotal(calc.sources, 'max')).toBeUndefined()
    expect(translateStatWithRoll(calc, undefined).string).toBe(text)
    const filter = calculatedStatToFilter(calc, 10, item)
    expect(filter.text).toBe(text)
    expect(filter.roll).toBeUndefined()
    expect(filter.tradeId).toEqual(['implicit.test'])
  })

  it('keeps one flag and empty aggregates non-numeric', () => {
    expect(statSourcesTotal(calculation('flag', [undefined]).sources)).toBeUndefined()
    expect(statSourcesTotal([])).toBeUndefined()
  })

  it('combines flag and numeric contributions without assuming every source has a roll', () => {
    const calc = calculation('# additional effect', [undefined, 2.5])
    calc.sources[1] = source(calc.stat, 2.5, true)
    const roll = statSourcesTotal(calc.sources)
    expect(roll).toEqual({ value: 3.5, min: 3.5, max: 3.5 })
    expect(translateStatWithRoll(calc, roll).dp).toBe(true)
    const filter = calculatedStatToFilter(calc, 0, item)
    expect(filter.roll?.value).toBe(3.5)
    expect(filter.roll?.dp).toBe(true)
    expect(statSourcesTotal(calc.sources, 'max')?.value).toBe(2.5)
  })

  it('retains a graceful fallback when no numeric matcher can translate the roll', () => {
    const calc = calculation('option', [3])
    calc.stat.matchers = [{ string: 'option', value: 1 }]
    expect(translateStatWithRoll(calc, statSourcesTotal(calc.sources)).string).toBe('BUG_STAT_ID: test_stat')
  })
})
