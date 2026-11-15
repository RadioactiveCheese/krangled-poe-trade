import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Pins what patch 3.30 (Covens of Umbra) removed from the game, so a later data
// sync can't bring it back. Sources: the 3.30.0 patch notes, and for beasts the
// game's BestiaryCapturableMonsters.IsDisabled flag (3.30.0.1.4).

const languages = ['en', 'ru', 'ko', 'cmn-Hant'] as const

interface Item { name: string, refName: string, namespace: string }

function readItems (language: string): Item[] {
  return readFileSync(new URL(`../public/data/${language}/items.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u).map(line => JSON.parse(line) as Item)
}

function readDrops (): Array<{ query: string[], items: string[] }> {
  return JSON.parse(readFileSync(new URL('../public/data/item-drop.json', import.meta.url), 'utf8'))
}

const REMOVED = [
  'ITEM::Veiled Scarab', 'ITEM::Winged Abyss Scarab', 'ITEM::Bestiary Scarab of the Shadowed Crow',
  "ITEM::Maven's Chisel of Scarabs", 'ITEM::Skittering Delirium Orb', 'ITEM::Fragmented Delirium Orb',
  'ITEM::Templar Astrolabe', 'ITEM::Fruiting Astrolabe', 'ITEM::Deceptive Astrolabe',
  'ITEM::Sacrifice at Dawn', 'ITEM::Mortal Hope', 'ITEM::Coin of Knowledge', 'ITEM::Coin of Desecration',
  "ITEM::The Genteel's Ducat", "ITEM::Brinehook's Ducat", 'ITEM::Vial of Awakening', 'ITEM::Vial of the Ghost',
  // yellow beasts
  'CAPTURED_BEAST::Acid Slitherer', 'CAPTURED_BEAST::Adolescent Rhex', 'CAPTURED_BEAST::Alpine Devil'
]

const KEPT = [
  "ITEM::Merrick's Ducat", "ITEM::Maven's Chisel of Threads", 'ITEM::Threaded Delirium Orb',
  'ITEM::Frayed Thread', 'ITEM::Abyss Thread', 'ITEM::Cryptic Astrolabe', 'ITEM::Royal Visage',
  'ITEM::Soul Core of Might',
  // red beasts and bosses
  'CAPTURED_BEAST::Black Mórrigan', 'CAPTURED_BEAST::Craicic Sand Spitter', 'CAPTURED_BEAST::Farrul, First of the Plains'
]

describe('3.30 removals', () => {
  for (const language of languages) {
    it(`${language} has no removed items and keeps their replacements`, () => {
      const keys = new Set(readItems(language).map(item => `${item.namespace}::${item.refName}`))
      for (const key of REMOVED) expect(keys.has(key), key).toBe(false)
      for (const key of KEPT) expect(keys.has(key), key).toBe(true)
      expect([...keys].filter(key => key.startsWith('ITEM::') && /\bScarabs?\b/u.test(key))).toEqual([])
    })
  }

  it('item-drop.json no longer points at removed items', () => {
    const refs = readDrops().flatMap(group => [...group.query, ...group.items])
    for (const key of REMOVED) expect(refs, key).not.toContain(key)
    expect(refs.filter(ref => /^ITEM::(.*\bScarabs?\b|Vial of |Sacrifice at |Mortal )/u.test(ref))).toEqual([])
  })
})
