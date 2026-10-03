import type { ParsedItem } from './ParsedItem'
import { CONSUMABLE_CRAFTABLE_ITEM } from './meta'

// Estimates assume maximum Kingsmarch disenchanting rank. PoEDB's per-unique
// multipliers are rounded, so results can differ slightly from the game.
// Level scaling verified against the in-game samples in upstream PR #1493:
// https://github.com/SnosMe/awakened-poe-trade/pull/1493#discussion_r2432622543
export function calcDisenchantDust (item: ParsedItem): number | undefined {
  const baseValue = item.info.unique?.disenchantValue
  const level = item.itemLevel
  if (baseValue === undefined || !Number.isFinite(baseValue) || baseValue <= 0 ||
      level === undefined || !Number.isFinite(level) || level < 1 ||
      (item.category && CONSUMABLE_CRAFTABLE_ITEM.has(item.category))) return undefined

  const quality = item.quality ?? 0
  if (!Number.isFinite(quality) || quality < 0) return undefined
  const corruptImplicits = item.isCorrupted
    ? item.newMods.filter(mod => mod.info.generation === 'corrupted').length
    : 0
  const bonuses = 1 + new Set(item.influences).size * 0.5 + quality * 0.02 + corruptImplicits * 0.5

  const lowLevel = Math.min(Math.max(level, 46), 68) - 46
  const highLevel = Math.min(Math.max(level, 68), 84) - 68
  const levelMultiplier = 5 * (50 + 2 * lowLevel + Math.floor(3 * lowLevel / 11) + 25 * highLevel)
  return Math.floor(baseValue * levelMultiplier * bonuses)
}
