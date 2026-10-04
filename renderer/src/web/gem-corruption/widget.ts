import type { Widget, Anchor } from '../overlay/widgets.js'
import { DEFAULT_ATTEMPTS, DEFAULT_MIN_RATIO, type SortKey } from './calc.js'

export const GEM_CORRUPTION_DEFAULTS = {
  includeTransfigured: true,
  includeAwakened: true,
  includeUnconfirmed: true,
  minRatio: DEFAULT_MIN_RATIO,
  hideNegativeEv: false,
  showDouble: true,
  sortBy: 'ev' as SortKey,
  attempts: DEFAULT_ATTEMPTS
}

export interface GemCorruptionWidget extends Widget {
  anchor: Anchor
  includeTransfigured: boolean
  includeAwakened: boolean
  includeUnconfirmed: boolean
  /** hide rows whose sell/buy ratio is below this; 0 = off */
  minRatio: number
  hideNegativeEv: boolean
  /** show the double-corruption (Lapidary Lens) EV */
  showDouble: boolean
  sortBy: SortKey
  /** number of Vaal Orb attempts the breakdown's odds are shown for */
  attempts: number
}
