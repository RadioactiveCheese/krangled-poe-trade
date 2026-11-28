import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Stat, StatOrGroup } from '@/assets/data'

interface OfficialStat { id: string, text: string, type: string }
const snapshot = JSON.parse(readFileSync('specs/fixtures/trade-imbued-supports-2026-11-27.json', 'utf8')) as {
  source: string
  entries: OfficialStat[]
}
const stats = readFileSync('public/data/en/stats.ndjson', 'utf8')
  .trim().split(/\r?\n/u).flatMap(line => {
    const row = JSON.parse(line) as StatOrGroup
    return 'stats' in row ? row.stats : [row]
  })

function imbuedSupports (stats: Stat[]): OfficialStat[] {
  return stats.flatMap(stat => (stat.trade.ids.imbued ?? [])
    .map(id => ({ id, text: stat.matchers[0].string, type: 'imbued' })))
    .sort((a, b) => a.id.localeCompare(b.id))
}

function official (entries: OfficialStat[]): OfficialStat[] {
  return entries
    .filter(stat => stat.id.startsWith('imbued.'))
    .map(({ id, text, type }) => ({ id, text: text.replace(/\u200b/gu, ''), type }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

describe('imbued gem supports', () => {
  it('covers the complete official imbued-support set with current names', () => {
    expect(imbuedSupports(stats)).toEqual(official(snapshot.entries))
  })

  it.skipIf(!process.env.TEST_LIVE_TRADE_API)('matches the complete live imbued-support dataset', async () => {
    const response = await fetch(snapshot.source, {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
      signal: AbortSignal.timeout(15_000)
    })
    expect(response.ok).toBe(true)
    const data = await response.json() as { result: Array<{ entries: OfficialStat[] }> }
    expect(imbuedSupports(stats)).toEqual(official(data.result.flatMap(group => group.entries)))
  }, 20_000)
})
