import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Stat, StatOrGroup } from '@/assets/data'

interface OfficialStat { id: string, text: string, type: string }
const snapshot = JSON.parse(readFileSync('specs/fixtures/trade-support-effects-2026-11-15.json', 'utf8')) as {
  source: string
  entries: OfficialStat[]
}
const stats = readFileSync('public/data/en/stats.ndjson', 'utf8')
  .trim().split(/\r?\n/u).flatMap(line => {
    const row = JSON.parse(line) as StatOrGroup
    return 'stats' in row ? row.stats : [row]
  })

function supportEffects (stats: Stat[]): OfficialStat[] {
  return stats.flatMap(stat => Object.entries(stat.trade.ids).flatMap(([type, ids]) => ids
    .filter(id => id.includes('.effect_') && stat.ref.startsWith('Socketed Gems are Supported by Level # '))
    .map(id => ({ id, text: stat.matchers[0].string, type }))))
    .sort((a, b) => a.id.localeCompare(b.id))
}

describe('3.30 support effects', () => {
  it('covers the complete official support-effect set with current names and modifier types', () => {
    expect(supportEffects(stats)).toEqual([...snapshot.entries].sort((a, b) => a.id.localeCompare(b.id)))
  })

  it.skipIf(!process.env.TEST_LIVE_TRADE_API)('matches the complete live support-effect dataset', async () => {
    const response = await fetch(snapshot.source, {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
      signal: AbortSignal.timeout(15_000)
    })
    expect(response.ok).toBe(true)
    const data = await response.json() as { result: Array<{ entries: OfficialStat[] }> }
    const official = data.result.flatMap(group => group.entries)
      .filter(stat => stat.id.includes('.effect_') && stat.text.startsWith('Socketed Gems are Supported by Level # '))
      .map(({ id, text, type }) => ({ id, text, type }))
      .sort((a, b) => a.id.localeCompare(b.id))
    expect(supportEffects(stats)).toEqual(official)
  }, 20_000)
})
