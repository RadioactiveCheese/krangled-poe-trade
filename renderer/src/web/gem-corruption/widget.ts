import type { Widget, Anchor } from '../overlay/widgets.js'
import { DEFAULT_MIN_RATIO } from './calc.js'

export const GEM_CORRUPTION_DEFAULTS = {
  includeTransfigured: true,
  includeAwakened: true,
  includeUnconfirmed: true,
  minRatio: DEFAULT_MIN_RATIO
} as const

export interface GemCorruptionWidget extends Widget {
  anchor: Anchor
  includeTransfigured: boolean
  includeAwakened: boolean
  includeUnconfirmed: boolean
  /** hide rows whose sell/buy ratio is below this; 0 = off */
  minRatio: number
}
