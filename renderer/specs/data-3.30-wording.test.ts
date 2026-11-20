import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
// Trimmed from https://www.pathofexile.com/api/trade/data/stats on 2026-11-20: every passive
// notable enchant, and every granted skill or support (effect_ ID) new since the pre-3.30 API.
import live from './fixtures/trade-lookup-stats-2026-11-20.json'

// Pins the 3.30.0.4 data refresh: refs renamed to the current game wording (old wording
// kept as a matcher), lines whose names the game fills in from tables, and retired stats.

const languages = ['en', 'ru', 'ko', 'cmn-Hant'] as const

interface Matcher { string: string, value?: number }
interface Stat {
  ref: string
  matchers: Matcher[]
  trade: { ids: Record<string, string[]> }
  modFamily?: string[]
  mercenary?: { supports?: string[], canonical?: string }
}
interface Item { name: string, refName: string, namespace: string, unique?: { base: string, fixedStats?: string[] } }

function read<T> (language: string, file: 'stats' | 'items'): T[] {
  return readFileSync(new URL(`../public/data/${language}/${file}.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u).flatMap(line => {
      const row = JSON.parse(line)
      return row.stats ?? [row]
    })
}

const stats = Object.fromEntries(languages.map(l => [l, read<Stat>(l, 'stats')])) as Record<typeof languages[number], Stat[]>
const byRef = (language: typeof languages[number]) => new Map(stats[language].map(s => [s.ref, s]))
const byId = (language: typeof languages[number]) => {
  const out = new Map<string, Stat>()
  for (const s of stats[language]) for (const id of Object.values(s.trade.ids).flat()) out.set(id, s)
  return out
}

// The trade site lists Frostbite under both its old stat ID and a new effect ID; the app
// searches the old one. Snipe Support was added by hand in English only.
const NOT_IN_EVERY_LANGUAGE = new Set(['explicit.effect_2455845502', 'implicit.effect_2455845502', 'explicit.effect_2282649307'])

describe('3.30 wording', () => {
  it('names stats after the current game wording and keeps the old one as a matcher', () => {
    const en = byRef('en')
    for (const [from, to] of [
      ['#% increased Rarity of Items found', '+#% to Item Rarity'],
      ['Nearby Enemies take #% increased Physical Damage', 'Enemies within 6 metres take #% increased Physical Damage'],
      ['Harvested Plants in your Maps have #% chance to spawn an additional Monster', 'Sacred Flora in your Maps have #% chance to spawn an additional Monster'],
      ['Area contains an Empowered Mirage which covers the entire Map', 'Area contains a Mirage']
    ]) {
      expect(en.has(from), from).toBe(false)
      const stat = en.get(to)!
      expect(stat, to).toBeDefined()
      expect(stat.matchers.map(m => m.string), to).toContain(from.replace(/^\+/u, ''))
    }
  })

  for (const language of languages) {
    it(`${language}: every stat a unique, mod family or mercenary support names exists`, () => {
      const refs = new Set(stats[language].map(s => s.ref))
      for (const s of stats[language]) {
        for (const ref of [...(s.modFamily ?? []), ...(s.mercenary?.supports ?? []), ...(s.mercenary?.canonical ? [s.mercenary.canonical] : [])]) {
          expect(refs.has(ref), `${s.ref} → ${ref}`).toBe(true)
        }
      }
      for (const item of read<Item>(language, 'items')) {
        for (const ref of item.unique?.fixedStats ?? []) expect(refs.has(ref), `${item.refName} → ${ref}`).toBe(true)
      }
    })

    it(`${language}: has every live passive notable enchant and new granted effect`, () => {
      const ids = byId(language)
      for (const entry of live.entries) {
        if (language !== 'en' && NOT_IN_EVERY_LANGUAGE.has(entry.id)) continue
        if (entry.id === 'explicit.effect_2455845502' || entry.id === 'implicit.effect_2455845502') continue
        expect(ids.has(entry.id), `${language}: ${entry.id} ${entry.text}`).toBe(true)
        if (language === 'en') expect(ids.get(entry.id)!.matchers[0].string, entry.id).toBe(entry.text)
      }
    })
  }

  it('localizes table-filled names', () => {
    const ru = byRef('ru')
    expect(ru.get('1 added passive skill is Acrimony')?.matchers).toEqual([{ string: '1 добавленное пассивное умение - Колкость' }])
    // The current wording first, then the pre-3.30 "Дарует умение …" line kept for older text.
    expect(ru.get('Grants Level # Aspect of the Cat')?.matchers).toEqual([
      { string: 'Дарует Дух кошки # уровня' }, { string: 'Дарует Дух кошки', value: 1 }, { string: 'Дарует умение Дух кошки # уровня' }
    ])
  })

  it('keeps pre-3.30 skill-grant and support wording as matchers of their 3.30 stat', () => {
    const en = byRef('en')
    expect(en.has('Grants Level # Aspect of the Cat Skill')).toBe(false)
    expect(en.get('Grants Level # Aspect of the Cat')!.matchers.map(m => m.string)).toContain('Grants Level # Aspect of the Cat Skill')
    // Spell Echo's old line belongs to a trivial-merge group, which searches the 3.30 stat's trade ID.
    expect(stats.en.some(s => s.ref === 'Socketed Gems are Supported by Level # Spell Echo Support' &&
      s.matchers.some(m => m.string === 'Socketed Gems are Supported by Level # Spell Echo'))).toBe(true)
  })

  it('drops stats whose trade IDs 3.30 retired with their content', () => {
    for (const s of stats.en) expect(s.ref, s.ref).not.toMatch(/^Scarabs (dropped|found) in /u)
  })

  it('adds the implicit and fractured IDs the trade site lists for a stat', () => {
    const en = byRef('en')
    expect(en.get('#% chance to Avoid Physical Damage from Hits')!.trade.ids.implicit).toContain('implicit.stat_2415497478')
  })

  for (const language of languages) {
    it(`${language}: has the Mirage uniques 3.30 put back into maps`, () => {
      const uniques = new Set(read<Item>(language, 'items').filter(i => i.namespace === 'UNIQUE').map(i => i.refName))
      for (const name of ['Fleshrender', 'Skysunder', "Khatal's Geyser", 'The Sands of Time']) expect(uniques.has(name), name).toBe(true)
    })
  }
})
