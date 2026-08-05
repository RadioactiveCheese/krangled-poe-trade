export type PriceDatabase = Array<{ ns: string, url: string, lines: string }>

export function splitJsonBlob (jsonBlob: string): PriceDatabase {
  const NINJA_OVERVIEW = '{"type":"'
  const NAMESPACE_MAP: Array<{ ns: string, url: string, type: string }> = [
    { ns: 'ITEM', url: 'currency', type: 'Currency' },
    { ns: 'ITEM', url: 'fragments', type: 'Fragment' },
    { ns: 'ITEM', url: 'delirium-orbs', type: 'DeliriumOrb' },
    { ns: 'ITEM', url: 'scarabs', type: 'Scarab' },
    { ns: 'ITEM', url: 'artifacts', type: 'Artifact' },
    { ns: 'ITEM', url: 'base-types', type: 'BaseType' },
    { ns: 'ITEM', url: 'fossils', type: 'Fossil' },
    { ns: 'ITEM', url: 'resonators', type: 'Resonator' },
    { ns: 'ITEM', url: 'incubators', type: 'Incubator' },
    { ns: 'ITEM', url: 'oils', type: 'Oil' },
    { ns: 'ITEM', url: 'vials', type: 'Vial' },
    { ns: 'ITEM', url: 'invitations', type: 'Invitation' },
    { ns: 'ITEM', url: 'blighted-maps', type: 'BlightedMap' },
    { ns: 'ITEM', url: 'blight-ravaged-maps', type: 'BlightRavagedMap' },
    { ns: 'ITEM', url: 'essences', type: 'Essence' },
    { ns: 'ITEM', url: 'maps', type: 'Map' },
    { ns: 'ITEM', url: 'tattoos', type: 'Tattoo' },
    { ns: 'ITEM', url: 'omens', type: 'Omen' },
    { ns: 'ITEM', url: 'coffins', type: 'Coffin' },
    { ns: 'ITEM', url: 'allflame-embers', type: 'AllflameEmber' },
    { ns: 'ITEM', url: 'djinn-coins', type: 'DjinnCoin' },
    { ns: 'ITEM', url: 'astrolabes', type: 'Astrolabe' },
    { ns: 'ITEM', url: 'runegrafts', type: 'Runegraft' },
    { ns: 'ITEM', url: 'enshrouding-crystals', type: 'EnshroudingCrystal' },
    { ns: 'ITEM', url: 'ducats', type: 'Ducat' },
    { ns: 'DIVINATION_CARD', url: 'divination-cards', type: 'DivinationCard' },
    { ns: 'CAPTURED_BEAST', url: 'beasts', type: 'Beast' },
    { ns: 'UNIQUE', url: 'unique-jewels', type: 'UniqueJewel' },
    { ns: 'UNIQUE', url: 'unique-flasks', type: 'UniqueFlask' },
    { ns: 'UNIQUE', url: 'unique-weapons', type: 'UniqueWeapon' },
    { ns: 'UNIQUE', url: 'unique-armours', type: 'UniqueArmour' },
    { ns: 'UNIQUE', url: 'unique-accessories', type: 'UniqueAccessory' },
    { ns: 'UNIQUE', url: 'unique-maps', type: 'UniqueMap' },
    { ns: 'UNIQUE', url: 'unique-relics', type: 'UniqueRelic' },
    { ns: 'UNIQUE', url: 'unique-tinctures', type: 'UniqueTincture' },
    { ns: 'GEM', url: 'skill-gems', type: 'SkillGem' }
  ]

  const database: PriceDatabase = []
  let startPos = jsonBlob.indexOf(NINJA_OVERVIEW)
  if (startPos === -1) return []

  while (true) {
    const endPos = jsonBlob.indexOf(NINJA_OVERVIEW, startPos + 1)

    const type = jsonBlob.slice(
      startPos + NINJA_OVERVIEW.length,
      jsonBlob.indexOf('"', startPos + NINJA_OVERVIEW.length)
    )
    const lines = jsonBlob.slice(startPos, (endPos === -1) ? jsonBlob.length : endPos)

    const isSupported = NAMESPACE_MAP.find(entry => entry.type === type)
    if (isSupported) {
      database.push({ ns: isSupported.ns, url: isSupported.url, lines })
    }

    if (endPos === -1) break
    startPos = endPos
  }
  return database
}
