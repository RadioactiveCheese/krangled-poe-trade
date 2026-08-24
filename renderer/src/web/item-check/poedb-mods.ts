import { ItemCategory, type ParsedItem } from '@/parser'

const DIRECT_CATEGORY_PAGES: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Claw]: 'Claws',
  [ItemCategory.Dagger]: 'Daggers',
  [ItemCategory.Wand]: 'Wands',
  [ItemCategory.OneHandedAxe]: 'One_Hand_Axes',
  [ItemCategory.OneHandedMace]: 'One_Hand_Maces',
  [ItemCategory.Sceptre]: 'Sceptres',
  [ItemCategory.RuneDagger]: 'Rune_Daggers',
  [ItemCategory.Bow]: 'Bows',
  [ItemCategory.Staff]: 'Staves',
  [ItemCategory.TwoHandedSword]: 'Two_Hand_Swords',
  [ItemCategory.TwoHandedAxe]: 'Two_Hand_Axes',
  [ItemCategory.TwoHandedMace]: 'Two_Hand_Maces',
  [ItemCategory.Warstaff]: 'Warstaves',
  [ItemCategory.FishingRod]: 'Fishing_Rods',
  [ItemCategory.Amulet]: 'Amulets',
  [ItemCategory.Ring]: 'Rings',
  [ItemCategory.Belt]: 'Belts',
  [ItemCategory.Trinket]: 'Trinkets',
  [ItemCategory.Quiver]: 'Quivers',
  [ItemCategory.Tincture]: 'Tinctures',
  [ItemCategory.HeistContract]: 'Contracts',
  [ItemCategory.HeistBlueprint]: 'Blueprints',
  [ItemCategory.MemoryLine]: 'Memories'
}

const ARMOUR_PAGE_PREFIX: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Gloves]: 'Gloves',
  [ItemCategory.Boots]: 'Boots',
  [ItemCategory.BodyArmour]: 'Body_Armours',
  [ItemCategory.Helmet]: 'Helmets',
  [ItemCategory.Shield]: 'Shields'
}

const WARD_PAGES: Partial<Record<ItemCategory, string>> = {
  [ItemCategory.Gloves]: 'Runic_Gauntlets',
  [ItemCategory.Boots]: 'Runic_Sabatons',
  [ItemCategory.Helmet]: 'Runic_Crown'
}

const SPECIAL_BASE_PAGES: Record<string, string> = {
  'Unset Ring': 'Unset_Ring',
  'Bone Ring': 'Bone_Ring',
  'Convoking Wand': 'Convoking_Wand',
  'Bone Spirit Shield': 'Bone_Spirit_Shield',
  'Iron Flask': 'Iron_Flask',
  'Silver Flask': 'Silver_Flask'
}

// PoEDB separates the former Thrusting One Hand Sword item class from other
// one-handed swords, while the game clipboard/parser now reports both as one class.
const THRUSTING_SWORD_BASES = new Set([
  'Antique Rapier',
  'Apex Rapier',
  'Basket Rapier',
  'Battered Foil',
  'Burnished Foil',
  'Courtesan Sword',
  'Dragonbone Rapier',
  'Dragoon Sword',
  'Elegant Foil',
  'Estoc',
  'Fancy Foil',
  'Harpy Rapier',
  'Jagged Foil',
  'Jewelled Foil',
  'Pecoraro',
  'Primeval Rapier',
  'Rusted Spike',
  'Serrated Foil',
  'Smallsword',
  'Spiraled Foil',
  'Tempered Foil',
  'Thorn Rapier',
  'Vaal Rapier',
  'Whalebone Rapier',
  'Wyrmbone Rapier'
])

const BASE_SPECIFIC_CATEGORIES = new Set([
  ItemCategory.Jewel,
  ItemCategory.AbyssJewel,
  ItemCategory.ClusterJewel,
  ItemCategory.Charm,
  ItemCategory.Idol,
  ItemCategory.HeistGear,
  ItemCategory.HeistTool,
  ItemCategory.HeistCloak,
  ItemCategory.HeistBrooch
])

function baseName (item: ParsedItem): string {
  return item.info.unique?.base ?? item.info.refName
}

function poedbSlug (name: string): string {
  return encodeURIComponent(name.replaceAll("'", '').replaceAll(' ', '_'))
}

function armourPage (item: ParsedItem): string | undefined {
  const prefix = item.category && ARMOUR_PAGE_PREFIX[item.category]
  if (!prefix) return

  const baseArmour = item.info.armour
  const hasWard = item.armourWARD != null || baseArmour?.ward != null
  if (hasWard) return WARD_PAGES[item.category!]

  const tags: string[] = []
  if (item.armourAR != null || baseArmour?.ar != null) tags.push('str')
  if (item.armourEV != null || baseArmour?.ev != null) tags.push('dex')
  if (item.armourES != null || baseArmour?.es != null) tags.push('int')

  return tags.length ? `${prefix}_${tags.join('_')}` : undefined
}

export function getPoedbModsPage (item: ParsedItem): string | undefined {
  if (item.info.unique) return poedbSlug(item.info.refName)

  const refName = baseName(item)
  const specialPage = SPECIAL_BASE_PAGES[refName]
  if (specialPage) return specialPage

  const armour = armourPage(item)
  if (armour) return armour

  if (item.category === ItemCategory.OneHandedSword) {
    return THRUSTING_SWORD_BASES.has(refName)
      ? 'Thrusting_One_Hand_Swords'
      : 'One_Hand_Swords'
  }

  if (item.category === ItemCategory.Flask) {
    if (refName.endsWith('Life Flask')) return 'Life_Flasks'
    if (refName.endsWith('Mana Flask')) return 'Mana_Flasks'
    if (refName.endsWith('Hybrid Flask')) return 'Hybrid_Flasks'
    return 'Utility_Flasks'
  }

  if (item.category && BASE_SPECIFIC_CATEGORIES.has(item.category)) {
    return poedbSlug(refName)
  }

  if (item.category === ItemCategory.Map && item.mapTier != null) {
    if (item.mapTier >= 17) return 'Maps_uber_tier'
    if (item.mapTier >= 11) return 'Maps_top_tier'
    if (item.mapTier >= 6) return 'Maps_mid_tier'
    return 'Maps_low_tier'
  }

  return item.category ? DIRECT_CATEGORY_PAGES[item.category] : undefined
}

export function getPoedbItemPage (item: ParsedItem): string {
  return poedbSlug(item.info.refName)
}
