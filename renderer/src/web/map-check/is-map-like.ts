import { ItemCategory, ItemRarity, type ParsedItem } from '@/parser'

export function isMapLikeItem (item: ParsedItem): boolean {
  const { category, rarity, info: { refName } } = item
  return (
    (category === ItemCategory.Map && rarity !== ItemRarity.Unique) ||
    category === ItemCategory.Chart ||
    category === ItemCategory.HeistContract ||
    category === ItemCategory.HeistBlueprint ||
    category === ItemCategory.Invitation ||
    refName === 'Expedition Logbook'
  )
}
