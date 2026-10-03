import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

interface MetadataStat {
  ref: string
  better?: number
  trade: { ids: Record<string, string[]> }
}

interface OfficialStat { id: string, text: string }

const languages = ['en', 'ru', 'ko', 'cmn-Hant']
const supportPrefix = 'explicit.stat_4089743927|'
const snapshot = JSON.parse(readFileSync(new URL('./fixtures/trade-embedded-supports-2026-10-03.json', import.meta.url), 'utf8')) as { source: string, entries: OfficialStat[] }

function readStats (language: string): MetadataStat[] {
  return readFileSync(new URL(`../public/data/${language}/stats.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u)
    .flatMap(line => {
      const row = JSON.parse(line) as MetadataStat | { stats: MetadataStat[] }
      return 'stats' in row ? row.stats : [row]
    })
}

function embeddedSupports (stats: MetadataStat[]): OfficialStat[] {
  return stats.flatMap(stat => (stat.trade.ids.explicit ?? [])
    .filter(id => id.startsWith(supportPrefix))
    .map(id => ({ id, text: stat.ref })))
    .sort((a, b) => a.id.localeCompare(b.id))
}

describe('curated stat metadata', () => {
  for (const language of languages) {
    it(`${language} covers the complete official embedded-support set with current names`, () => {
      expect(embeddedSupports(readStats(language))).toEqual([...snapshot.entries]
        .sort((a, b) => a.id.localeCompare(b.id)))
    })

    it(`${language} keeps fractured variants and harmful-roll directions`, () => {
      const stats = readStats(language)
      for (const [ref, id] of [
        ['Shock yourself for # Seconds when you Focus', 'fractured.stat_3181879507'],
        ['The Effect of Chill on you is reversed while on Chilled ground', 'fractured.stat_3440719546']
      ]) {
        expect(stats.find(stat => stat.ref === ref)?.trade.ids.fractured).toContain(id)
      }
      for (const ref of ['Your Linked Minions take #% more Damage', '#% more Physical and Chaos Damage Taken while Sane']) {
        expect(stats.find(stat => stat.ref === ref)?.better).toBe(-1)
      }
      expect(stats.some(stat => stat.ref === 'Adds # to # Cold Damage to Spells per Power Charge')).toBe(true)
      expect(stats.some(stat => stat.ref === 'Adds # minimum Cold Damage to Spells per Power Charge')).toBe(false)
    })
  }

  it.skipIf(!process.env.TEST_LIVE_TRADE_API)('matches the complete live embedded-support dataset', async () => {
    const response = await fetch(snapshot.source, {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
      signal: AbortSignal.timeout(15_000)
    })
    expect(response.ok).toBe(true)
    const data = await response.json() as { result: Array<{ entries: OfficialStat[] }> }
    const official = data.result.flatMap(group => group.entries)
      .filter(stat => stat.id.startsWith(supportPrefix))
      .map(({ id, text }) => ({ id, text }))
      .sort((a, b) => a.id.localeCompare(b.id))
    for (const language of languages) {
      expect(embeddedSupports(readStats(language))).toEqual(official)
    }
  }, 20_000)
})
