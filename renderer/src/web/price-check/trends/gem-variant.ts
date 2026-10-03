import type { ParsedItem } from '@/parser'

export const SPECIAL_SUPPORT_GEM = ['Empower Support', 'Enlighten Support', 'Enhance Support']

/** poe.ninja SkillGem overview lookup (name + variant such as "20/20", "21/20c") for a gem item */
export function forSkillGem (item: ParsedItem) {
  // Gems capped below level 20 (exceptional and awakened supports) are listed by
  // poe.ninja at their max level, and at max + 1 when corrupted (e.g. "3/20", "4/20c").
  const maxLevel = item.info.gem?.maxLevel
  const atOrAboveMax = maxLevel != null && maxLevel < 20 && item.gemLevel! >= maxLevel

  let variant = ''
  if (
    SPECIAL_SUPPORT_GEM.includes(item.info.refName) ||
    item.info.refName === 'Portal' ||
    item.info.refName === 'Brand Recall' ||
    item.info.refName === 'Blood and Sand' ||
    item.gemLevel! >= 20 ||
    atOrAboveMax
  ) {
    variant += `${item.gemLevel}`
  } else {
    variant += '1'
  }
  if (
    item.quality &&
    !SPECIAL_SUPPORT_GEM.includes(item.info.refName) &&
    !(item.info.refName === 'Brand Recall' && item.isCorrupted) &&
    // poe.ninja doesn't split max-level awakened gems or Brand Recall by quality ("5", "5c", "6")
    !(atOrAboveMax && (item.info.refName.startsWith('Awakened ') || item.info.refName === 'Brand Recall'))
    // @TODO(poe.ninja blocking): !(item.info.refName === 'Blood and Sand' && item.isCorrupted)
  ) {
    // Gem Q20 with up to 4xGCP (TODO: should this rule apply to corrupted gems?)
    const q = (item.quality >= 16 && item.quality <= 20) ? 20 : item.quality
    variant += `/${q}`
  }
  if (item.isCorrupted && item.info.refName !== 'Portal') {
    variant += 'c'
  }

  return {
    ns: item.info.namespace,
    name: item.info.refName,
    variant
  }
}
