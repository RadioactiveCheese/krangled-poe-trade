import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ItemCategory, type ParsedItem } from '@/parser'
import type { BaseType } from '@/assets/data'
import { getPoedbModsPage } from '@/web/item-check/poedb-mods'

const LOCAL_BASE_TYPES = readFileSync(
  new URL('../../../public/data/en/items.ndjson', import.meta.url),
  'utf8'
).trim().split('\n').map(line => JSON.parse(line) as BaseType)

const CURRENT_POEDB_THRUSTING_BASES = [
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
]

function item (
  refName: string,
  category: ItemCategory,
  props: Partial<ParsedItem> = {},
  info: Partial<BaseType> = {}
) {
  return {
    category,
    info: {
      name: refName,
      refName,
      namespace: 'ITEM',
      icon: '',
      ...info
    },
    isUnidentified: false,
    isCorrupted: false,
    influences: [],
    statsByType: [],
    newMods: [],
    unknownModifiers: [],
    rawText: 'TEST_ITEM',
    ...props
  } satisfies ParsedItem
}

describe('PoEDB base modifier pages', () => {
  it('opens the Intelligence Body Armour page for Twilight Regalia', () => {
    expect(getPoedbModsPage(item(
      'Twilight Regalia',
      ItemCategory.BodyArmour,
      { armourES: 301 }
    ))).toBe('Body_Armours_int')
  })

  it.each([
    [{ armourAR: 1 }, 'Body_Armours_str'],
    [{ armourEV: 1 }, 'Body_Armours_dex'],
    [{ armourES: 1 }, 'Body_Armours_int'],
    [{ armourAR: 1, armourEV: 1 }, 'Body_Armours_str_dex'],
    [{ armourAR: 1, armourES: 1 }, 'Body_Armours_str_int'],
    [{ armourEV: 1, armourES: 1 }, 'Body_Armours_dex_int'],
    [{ armourAR: 1, armourEV: 1, armourES: 1 }, 'Body_Armours_str_dex_int']
  ] as const)('covers PoEDB\'s current Body Armour defence split', (props, page) => {
    expect(getPoedbModsPage(item('Test Body Armour', ItemCategory.BodyArmour, props))).toBe(page)
  })

  it('uses the base metadata when parsed defence values are unavailable', () => {
    expect(getPoedbModsPage(item(
      'Twilight Regalia',
      ItemCategory.BodyArmour,
      {},
      { armour: { es: [262, 302] } }
    ))).toBe('Body_Armours_int')
  })

  it.each([
    ["Shavronne's Wrappings", "Occultist's Vestment", 'Shavronnes_Wrappings'],
    ["Atziri's Splendour", 'Sacrificial Garb', 'Atziris_Splendour'],
    ['Mjölner', 'Gavel', 'Mj%C3%B6lner']
  ])('opens a unique item\'s own canonical page: %s', (uniqueName, base, page) => {
    expect(getPoedbModsPage(item(
      uniqueName,
      ItemCategory.BodyArmour,
      { armourES: 300 },
      { namespace: 'UNIQUE', unique: { base } }
    ))).toBe(page)
  })

  it('matches PoEDB\'s complete current thrusting-sword set to local base metadata', () => {
    const localSwords = LOCAL_BASE_TYPES.filter(base =>
      base.craftable?.category === ItemCategory.OneHandedSword)
    const localThrustingBases = localSwords.filter(base =>
      /\/Rapier\d+\.png$/.test(new URL(base.icon).pathname))

    expect(localThrustingBases.map(base => base.refName).sort())
      .toEqual([...CURRENT_POEDB_THRUSTING_BASES].sort())
    for (const base of localSwords) {
      expect(getPoedbModsPage(item(base.refName, ItemCategory.OneHandedSword)))
        .toBe(CURRENT_POEDB_THRUSTING_BASES.includes(base.refName)
          ? 'Thrusting_One_Hand_Swords'
          : 'One_Hand_Swords')
    }
  })

  it.each([
    [ItemCategory.Helmet, 'Runic Crown', 'Runic_Crown'],
    [ItemCategory.Helmet, 'Runic Crest', 'Runic_Crown'],
    [ItemCategory.Gloves, 'Runic Gloves', 'Runic_Gauntlets'],
    [ItemCategory.Boots, 'Runic Greaves', 'Runic_Sabatons']
  ])('uses PoEDB\'s representative modifier page for ward bases', (category, refName, page) => {
    expect(getPoedbModsPage(item(refName, category, { armourWARD: 100 }))).toBe(page)
  })

  it.each([
    [ItemCategory.Claw, 'Imperial Claw', 'Claws'],
    [ItemCategory.Dagger, 'Platinum Kris', 'Daggers'],
    [ItemCategory.Wand, 'Imbued Wand', 'Wands'],
    [ItemCategory.OneHandedSword, 'Vaal Blade', 'One_Hand_Swords'],
    [ItemCategory.OneHandedSword, 'Vaal Rapier', 'Thrusting_One_Hand_Swords'],
    [ItemCategory.OneHandedAxe, 'Siege Axe', 'One_Hand_Axes'],
    [ItemCategory.OneHandedMace, 'Legion Hammer', 'One_Hand_Maces'],
    [ItemCategory.Sceptre, 'Void Sceptre', 'Sceptres'],
    [ItemCategory.RuneDagger, 'Profane Wand', 'Rune_Daggers'],
    [ItemCategory.Bow, 'Spine Bow', 'Bows'],
    [ItemCategory.Staff, 'Maelström Staff', 'Staves'],
    [ItemCategory.TwoHandedSword, 'Exquisite Blade', 'Two_Hand_Swords'],
    [ItemCategory.TwoHandedAxe, 'Vaal Axe', 'Two_Hand_Axes'],
    [ItemCategory.TwoHandedMace, 'Coronal Maul', 'Two_Hand_Maces'],
    [ItemCategory.Warstaff, 'Judgement Staff', 'Warstaves'],
    [ItemCategory.FishingRod, 'Fishing Rod', 'Fishing_Rods'],
    [ItemCategory.Amulet, 'Onyx Amulet', 'Amulets'],
    [ItemCategory.Ring, 'Amethyst Ring', 'Rings'],
    [ItemCategory.Belt, 'Stygian Vise', 'Belts'],
    [ItemCategory.Quiver, 'Broadhead Arrow Quiver', 'Quivers'],
    [ItemCategory.Jewel, 'Crimson Jewel', 'Crimson_Jewel'],
    [ItemCategory.AbyssJewel, 'Searching Eye Jewel', 'Searching_Eye_Jewel'],
    [ItemCategory.ClusterJewel, 'Large Cluster Jewel', 'Large_Cluster_Jewel'],
    [ItemCategory.Flask, 'Divine Life Flask', 'Life_Flasks'],
    [ItemCategory.Flask, 'Eternal Mana Flask', 'Mana_Flasks'],
    [ItemCategory.Flask, 'Hallowed Hybrid Flask', 'Hybrid_Flasks'],
    [ItemCategory.Flask, 'Quicksilver Flask', 'Utility_Flasks'],
    [ItemCategory.Flask, 'Iron Flask', 'Iron_Flask'],
    [ItemCategory.Ring, 'Bone Ring', 'Bone_Ring'],
    [ItemCategory.Wand, 'Convoking Wand', 'Convoking_Wand'],
    [ItemCategory.HeistContract, 'Contract: Lockpicking', 'Contracts'],
    [ItemCategory.HeistBlueprint, 'Blueprint: Laboratory', 'Blueprints'],
    [ItemCategory.HeistGear, 'Fine Sharpening Stone', 'Fine_Sharpening_Stone'],
    [ItemCategory.Idol, 'Minor Idol', 'Minor_Idol'],
    [ItemCategory.Tincture, 'Prismatic Tincture', 'Tinctures'],
    [ItemCategory.Trinket, "Thief's Trinket", 'Trinkets'],
    [ItemCategory.MemoryLine, 'Einhar\'s Memory', 'Memories']
  ])('maps the current PoEDB modifier index: %s / %s', (category, refName, page) => {
    expect(getPoedbModsPage(item(refName, category))).toBe(page)
  })

  it.each([
    [ItemCategory.Helmet, 'Hubris Circlet', { armourES: 1 }, 'Helmets_int'],
    [ItemCategory.Gloves, 'Slink Gloves', { armourEV: 1 }, 'Gloves_dex'],
    [ItemCategory.Boots, 'Dragonscale Boots', { armourAR: 1, armourEV: 1 }, 'Boots_str_dex'],
    [ItemCategory.Shield, 'Archon Kite Shield', { armourAR: 1, armourES: 1 }, 'Shields_str_int']
  ] as const)('maps PoEDB armour class pages: %s / %s', (category, refName, props, page) => {
    expect(getPoedbModsPage(item(refName, category, props))).toBe(page)
  })

  it.each([
    [1, 'Maps_low_tier'],
    [6, 'Maps_mid_tier'],
    [11, 'Maps_top_tier'],
    [17, 'Maps_uber_tier']
  ])('maps tier %i to %s', (mapTier, page) => {
    expect(getPoedbModsPage(item('Map', ItemCategory.Map, { mapTier }))).toBe(page)
  })

  it('returns no modifier page for categories absent from PoEDB\'s modifier index', () => {
    expect(getPoedbModsPage(item('Censer Relic', ItemCategory.SanctumRelic))).toBeUndefined()
  })

  it('accounts for every locally parsed category when PoEDB adds or renames pages', () => {
    const supported = new Set([
      ItemCategory.Map,
      ItemCategory.Helmet,
      ItemCategory.BodyArmour,
      ItemCategory.Gloves,
      ItemCategory.Boots,
      ItemCategory.Shield,
      ItemCategory.Amulet,
      ItemCategory.Belt,
      ItemCategory.Ring,
      ItemCategory.Flask,
      ItemCategory.AbyssJewel,
      ItemCategory.Jewel,
      ItemCategory.Quiver,
      ItemCategory.Claw,
      ItemCategory.Bow,
      ItemCategory.Sceptre,
      ItemCategory.Wand,
      ItemCategory.FishingRod,
      ItemCategory.Staff,
      ItemCategory.Warstaff,
      ItemCategory.Dagger,
      ItemCategory.RuneDagger,
      ItemCategory.OneHandedAxe,
      ItemCategory.TwoHandedAxe,
      ItemCategory.OneHandedMace,
      ItemCategory.TwoHandedMace,
      ItemCategory.OneHandedSword,
      ItemCategory.TwoHandedSword,
      ItemCategory.ClusterJewel,
      ItemCategory.HeistBlueprint,
      ItemCategory.HeistContract,
      ItemCategory.HeistTool,
      ItemCategory.HeistBrooch,
      ItemCategory.HeistGear,
      ItemCategory.HeistCloak,
      ItemCategory.Trinket,
      ItemCategory.MemoryLine,
      ItemCategory.Tincture,
      ItemCategory.Charm,
      ItemCategory.Idol
    ])
    const unsupported = new Set([
      ItemCategory.CapturedBeast,
      ItemCategory.MetamorphSample,
      ItemCategory.Invitation,
      ItemCategory.ExpeditionLogbook,
      ItemCategory.Gem,
      ItemCategory.Currency,
      ItemCategory.DivinationCard,
      ItemCategory.Voidstone,
      ItemCategory.Sentinel,
      ItemCategory.SanctumRelic,
      ItemCategory.Graft,
      ItemCategory.Chart,
      ItemCategory.MercenaryWarrant
    ])

    expect([...supported, ...unsupported].sort()).toEqual(Object.values(ItemCategory).sort())
  })
})
