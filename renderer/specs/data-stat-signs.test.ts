import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Pins the sign and value of matchers a data refresh can silently flip. The 3.30 refresh
// bound reservation efficiency stats to an inverted game stat (so stronger rolls ranked
// worse) and dropped the curated values that tell flag readings apart.

const languages = ['en', 'ru', 'ko', 'cmn-Hant'] as const

interface Matcher { string: string, negate?: true, value?: number }
interface Stat { ref: string, matchers: Matcher[] }

function readStats (language: string): Map<string, Stat> {
  return new Map(readFileSync(new URL(`../public/data/${language}/stats.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u).map(line => JSON.parse(line) as Stat | { stats: Stat[] })
    .flatMap(row => 'stats' in row ? row.stats : [row])
    .map(stat => [stat.ref, stat]))
}

const STATS = Object.fromEntries(languages.map(language => [language, readStats(language)]))
const shape = (stat: Stat) => stat.matchers.map(m => ({ negate: m.negate ?? false, value: m.value ?? null }))

describe('stat matcher signs', () => {
  const reservation = [...STATS.en.values()].filter(s => /^(.* )?#% increased Mana Reservation Efficiency\b/u.test(s.ref))

  it('reads "increased" Mana Reservation Efficiency as a positive roll', () => {
    expect(reservation.length).toBeGreaterThanOrEqual(24)
    for (const stat of reservation) {
      const increased = stat.matchers.find(m => m.string === stat.ref)
      expect(increased?.negate, stat.ref).toBeUndefined()
      expect(stat.matchers.find(m => m.string === stat.ref.replace('increased', 'reduced'))?.negate, stat.ref).toBe(true)
    }
  })

  const pairs = [...STATS.en.values()].filter(s =>
    s.matchers.some(m => !m.string.includes('#') && / is Lucky\b/u.test(m.string)) &&
    s.matchers.some(m => !m.string.includes('#') && / is Unlucky\b/u.test(m.string)))

  it('keeps Lucky as 1 and Unlucky as -1', () => {
    expect(pairs.length).toBeGreaterThanOrEqual(15)
    for (const stat of pairs) {
      for (const m of stat.matchers) {
        expect(m.value, `${stat.ref}: ${m.string}`).toBe(/ is Unlucky\b/u.test(m.string) ? -1 : 1)
      }
    }
  })

  it('keeps other curated flag values', () => {
    const expected: Array<[ref: string, string: string, value: number]> = [
      ['#% increased Physical Damage', 'No Physical Damage', -100],
      ['#% chance to Trigger Level 1 Create Lesser Shrine when you Kill an Enemy', 'Trigger Level 1 Create Lesser Shrine when you Kill an Enemy', 100],
      ['With at least 40 Dexterity in Radius, Ice Shot Pierces an additional Target', 'With at least 40 Dexterity in Radius, Ice Shot Pierces an additional Target', 1]
    ]
    for (const [ref, string, value] of expected) {
      expect(STATS.en.get(ref)?.matchers.find(m => m.string === string)?.value, ref).toBe(value)
    }
  })

  it.each(languages.filter(l => l !== 'en'))('gives %s the same signs and values as English', (language) => {
    for (const stat of [...reservation, ...pairs]) {
      const local = STATS[language].get(stat.ref)
      if (!local || local.matchers.length !== stat.matchers.length) continue
      expect(shape(local), `${language}: ${stat.ref}`).toEqual(shape(stat))
    }
  })
})
