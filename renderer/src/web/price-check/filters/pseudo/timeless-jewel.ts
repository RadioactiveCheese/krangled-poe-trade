import { StatBetter } from '@/assets/data'
import { sumStatsByModType } from '@/parser/modifiers'
import { calculatedStatToFilter, FiltersCreationContext } from '../create-stat-filters'
import { FilterTag, FilterGroup } from '../interfaces'
import { findAndResolveByRef } from './utils'

export function filterTimelessJewelKeystones (ctx: FiltersCreationContext): FilterGroup | undefined {
  const seed = ctx.statsByType.find(calc =>
    calc.stat.better === StatBetter.NotComparable &&
    calc.stat.modFamily?.length &&
    calc.stat.trade.ids[calc.type]?.some(id => id.startsWith('explicit.pseudo_timeless_jewel_')))
  if (!seed) return undefined

  const group: FilterGroup = {
    group: 'one',
    expanded: true,
    meta: {
      tradeId: ['item.count_one_group'],
      statRef: 'Count (1)',
      text: 'Count (1)',
      tag: FilterTag.FilterGroup,
      sources: [],
      disabled: false
    },
    stats: []
  }

  for (const ref of seed.stat.modFamily!) {
    let calc = seed
    if (ref !== seed.stat.ref) {
      const stat = findAndResolveByRef(ref, seed.type, ctx.item.category)
      calc = sumStatsByModType([{
        info: seed.sources[0].modifier.info,
        stats: [{ stat, translation: stat.matchers[0], roll: seed.sources[0].stat.roll }]
      }])[0]
    }
    const filter = calculatedStatToFilter(calc, ctx.searchInRange, ctx.item)
    if (ref !== seed.stat.ref) {
      filter.tag = FilterTag.Pseudo
      filter.disabled = true
    }
    group.stats.push(filter)
  }

  ctx.statsByType = ctx.statsByType.filter(calc => calc !== seed)
  return group
}
