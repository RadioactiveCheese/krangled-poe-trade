import { describe, expect, it, vi } from 'vitest'
import { splitJsonBlob } from '@/web/background/split-poeninja-overviews'
import { usePoeninja } from '@/web/background/Prices'
import { Host } from '@/web/background/IPC'
import { getDetailsId } from '@/web/price-check/trends/getDetailsId'
import { createVirtualItem, ItemRarity } from '@/parser/ParsedItem'
import fs from 'node:fs'
import corpseContract from '../../fixtures/poeninja-corpses.json'

vi.mock('@/web/background/IPC', () => ({ Host: { proxy: vi.fn() } }))
vi.mock('@/web/Config', () => ({ AppConfig: () => ({ realm: 'pc-ggg' }) }))
vi.mock('@/web/background/Leagues', async () => {
  const { shallowRef } = await import('vue')
  return {
    PERMANENT_SC: ['Standard', '標準模式'],
    useLeagues: () => ({
      selected: shallowRef({ id: 'Allflame', realm: 'pc-ggg', isPopular: true }),
      selectedId: shallowRef('Allflame')
    })
  }
})

describe('poe.ninja dense overviews', () => {
  it('finds a live-shaped corpse line through the actual item query and price lookup', async () => {
    const items = fs.readFileSync('public/data/en/items.ndjson', 'utf8').trim().split('\n').map(line => JSON.parse(line))
    const info = items.find(item => item.namespace === 'ITEM' && item.refName === corpseContract.sampleLine.name)
    expect(info).toBeDefined()
    const query = getDetailsId(createVirtualItem({ info, rarity: ItemRarity.Normal }))!
    expect(query).toEqual({ ns: 'ITEM', name: 'Perfect Forest Tiger', variant: undefined })
    const blob = JSON.stringify({ itemOverviews: [
      { type: 'Coffin', lines: [{ name: 'Coffin', chaos: 1, graph: [] }] },
      { type: 'Corpse', lines: [corpseContract.sampleLine] }
    ] })
    vi.mocked(Host.proxy).mockResolvedValueOnce(new Response(blob))
    vi.useFakeTimers()
    try {
      const prices = usePoeninja()
      prices.queuePricesFetch()
      await vi.waitFor(() => expect(prices.initialLoading()).toBe(false))
      expect(Host.proxy).toHaveBeenCalledWith(expect.stringContaining('league=Allflame'), expect.anything())
      expect(prices.findPriceByQuery(query)).toEqual({
        ...corpseContract.sampleLine,
        url: 'https://poe.ninja/poe1/economy/allflame/corpses/perfect-forest-tiger'
      })
      expect(prices.findPriceByQuery({ ...query, ns: 'UNIQUE' })).toBeNull()
    } finally {
      vi.clearAllTimers()
      vi.useRealTimers()
    }
  })

  it('indexes the current Corpse contract without confusing Coffin prices', () => {
    const corpse = JSON.stringify({ type: corpseContract.type, lines: [{ name: 'Perfect Forest Tiger', chaos: 28770, graph: [] }] })
    const coffin = '{"type":"Coffin","lines":[{"name":"Coffin","chaos":1,"graph":[]}]}'
    expect(splitJsonBlob(JSON.stringify({ itemOverviews: [JSON.parse(coffin), JSON.parse(corpse)] }))).toEqual([
      { ns: 'ITEM', url: 'coffins', lines: `${coffin},` },
      { ns: 'ITEM', url: 'corpses', lines: `${corpse}]}` }
    ])
  })

  it('maps every live Corpse name to an item in every supported language', () => {
    expect(corpseContract.names).toHaveLength(92)
    for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
      const items = fs.readFileSync(`public/data/${language}/items.ndjson`, 'utf8')
        .trim().split('\n').map(line => JSON.parse(line) as { refName: string, namespace: string })
      const names = new Set(items.filter(item => item.namespace === 'ITEM').map(item => item.refName))
      expect(corpseContract.names.filter(name => !names.has(name)), language).toEqual([])
    }
  })

  it('indexes Enshrouding Crystals as items', () => {
    const overview = '{"type":"EnshroudingCrystal","lines":[{"name":"Maraketh Enshrouding Crystal","chaos":4257,"graph":[]}]}'

    expect(splitJsonBlob(overview)).toEqual([{
      ns: 'ITEM',
      url: 'enshrouding-crystals',
      lines: overview
    }])
  })

  it('indexes Incursion temples under their own namespace', () => {
    const overview = '{"type":"IncursionTemple","lines":[{"name":"Doryani\'s Institute (Tier 3)","variant":"Temple","chaos":224,"graph":[]}]}'

    expect(splitJsonBlob(overview)).toEqual([{
      ns: 'TEMPLE',
      url: 'temples',
      lines: overview
    }])
  })

  it('indexes Ducats as items', () => {
    const overview = '{"type":"Ducat","lines":[{"name":"Brinehook\'s Ducat","chaos":0.5029,"graph":[]}]}'

    expect(splitJsonBlob(overview)).toEqual([{
      ns: 'ITEM',
      url: 'ducats',
      lines: overview
    }])
  })
})
