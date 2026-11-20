import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Trimmed from https://www.pathofexile.com/api/trade/data/stats on 2026-11-20: every
// Temple of Atzoatl room, plus the stats ported from upstream's 3.30.0.3 data update.
import live from './fixtures/trade-stats-3.30.0.3-2026-11-20.json'

// Pins what was ported from upstream's 3.30.0.3 data update (e5371540) and its
// Atzoatl rules (22006b33), so a later partial sync can't drop or rename it.

const languages = ['en', 'ru', 'ko', 'cmn-Hant'] as const

interface Stat {
  ref?: string
  reminderText?: string
  matchers: Array<{ string: string }>
  trade: { ids: Record<string, string[]> }
}

function readStats (language: string): Stat[] {
  return readFileSync(new URL(`../public/data/${language}/stats.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u).map(line => JSON.parse(line) as Stat)
    .filter(stat => stat.ref != null)
}

const LIVE_IDS = new Set(live.entries.map(entry => entry.id))
const LIVE_ROOMS = new Set(live.entries.filter(entry => entry.id.startsWith('pseudo.pseudo_temple_')).map(entry => entry.id))

const RULE_REFS = [...readFileSync(
  new URL('../src/web/price-check/filters/pseudo/atzoatl-rules.ts', import.meta.url), 'utf8'
).matchAll(/stat\('((?:[^'\\]|\\.)*)'\)/gu)].map(m => m[1].replace(/\\'/gu, "'"))

const REWORDED = {
  '+#% Surpassing Chance for Remnants to have an additional Suffix Modifier':
    'Remnants have #% chance to have an additional Suffix Modifier',
  '+#% Surpassing Chance for Remnants in your Maps to have an additional Suffix Modifier':
    'Remnants in your Maps have #% chance to have an additional Suffix Modifier'
}

const PORTED = [
  ...Object.keys(REWORDED),
  '#% increased Damage with Claws against Enemies that are on Low Life',
  'Killing Blows Consume corpses to Recover #% of Life',
  'Minions convert #% of Physical Damage to Lightning Damage',
  'Socketed Gems are Supported by Level # Greater Unleash Support'
]

describe('upstream 3.30.0.3 data sync', () => {
  it('reads every room the Atzoatl rules name', () => {
    expect(RULE_REFS.length).toBe(84)
    expect(LIVE_ROOMS.size).toBe(86)
  })

  for (const language of languages) {
    const stats = readStats(language)
    const byRef = new Map(stats.map(stat => [stat.ref!, stat]))
    const rooms = stats.filter(stat => stat.ref!.startsWith('Has Room: '))

    it(`${language} has a stat with reminder text for every room the Atzoatl rules name`, () => {
      for (const ref of RULE_REFS) expect(typeof byRef.get(ref)?.reminderText, ref).toBe('string')
    })

    it(`${language} covers exactly the live trade API's Temple rooms`, () => {
      expect(new Set(rooms.flatMap(stat => stat.trade.ids.pseudo))).toEqual(LIVE_ROOMS)
    })

    it(`${language} has the ported stats, with live trade IDs`, () => {
      for (const ref of PORTED) {
        const ids = Object.values(byRef.get(ref)?.trade.ids ?? {}).flat()
        expect(ids.length, ref).toBeGreaterThan(0)
        for (const id of ids) expect(LIVE_IDS.has(id), `${ref}: ${id}`).toBe(true)
      }
    })

    it(`${language} stores no zero-width spaces, which the parser strips from item text`, () => {
      for (const stat of stats) {
        for (const m of stat.matchers) expect(m.string.includes('\u200b'), stat.ref!).toBe(false)
      }
    })

    it(`${language} folds the pre-3.30.0.3 Remnants stats into the reworded ones`, () => {
      for (const [ref, oldRef] of Object.entries(REWORDED)) {
        expect(byRef.has(oldRef), oldRef).toBe(false)
        // The current wording plus the old one, so text copied before the patch parses.
        expect(byRef.get(ref)!.matchers.length, ref).toBe(2)
      }
    })
  }

  it('the English Remnants matchers include the old wording', () => {
    const byRef = new Map(readStats('en').map(stat => [stat.ref!, stat]))
    for (const [ref, oldRef] of Object.entries(REWORDED)) {
      expect(byRef.get(ref)!.matchers.map(m => m.string)).toContain(oldRef)
    }
  })

  it('resolves the Cursed Poppet related-item entry', () => {
    const drops = JSON.parse(readFileSync(new URL('../public/data/item-drop.json', import.meta.url), 'utf8')) as Array<{ query: string[], items: string[] }>
    const poppet = drops.find(entry => entry.query.includes('ITEM::Cursed Poppet'))
    expect(poppet?.items).toContain('UNIQUE::The Covetous Dark // Eye Gouger')
  })
})
