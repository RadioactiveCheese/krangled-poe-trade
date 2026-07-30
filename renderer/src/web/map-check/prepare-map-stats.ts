import { statSourcesTotal, translateStatWithRoll } from '@/parser/modifiers'
import { ParsedItem } from '@/parser/ParsedItem'
import { roundRoll } from '../price-check/filters/util'

export interface PreparedStat {
  matcher: string
  roll?: number
}

const HIDDEN_MAP_CHECK_STATS = new Set([
  'Voyage Modifier will be revealed once Charted'
])

export function prepareMapStats (item: ParsedItem): PreparedStat[] {
  const visibleStats = item.statsByType.filter(calc => !HIDDEN_MAP_CHECK_STATS.has(calc.stat.ref))

  return visibleStats.map(calc => {
    const roll = statSourcesTotal(calc.sources)
    const translation = translateStatWithRoll(calc, roll)

    const prepared = {
      matcher: translation.string,
      roll: roll && roundRoll(roll.value, translation.dp ?? false)
    }

    if (translation.negate) {
      if (prepared.roll != null) {
        prepared.roll = -1 * prepared.roll
      }
    }

    return prepared
  })
}
