import type { Ref } from 'vue'
import { FilterTag, StatFilter } from './interfaces'

interface MercenaryPickerStat {
  id: string
  text: string
  kind: 'skill' | 'support'
}

export function selectMercenaryStat (
  stat: MercenaryPickerStat,
  emit: (filter: StatFilter) => void,
  query: Ref<string>,
  showSuggestions: Ref<boolean>
): void {
  emit({
    tradeId: [stat.id],
    statRef: stat.id,
    text: stat.text,
    tag: stat.kind === 'skill'
      ? FilterTag.MercenarySkill
      : FilterTag.MercenarySupport,
    sources: [],
    disabled: false
  })
  query.value = ''
  // Suggestion clicks use @mousedown.prevent, so the focused input will not
  // emit another focus event before the user starts the next search.
  showSuggestions.value = true
}
