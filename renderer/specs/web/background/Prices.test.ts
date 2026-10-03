import { describe, expect, it } from 'vitest'
import { splitJsonBlob } from '@/web/background/split-poeninja-overviews'

describe('poe.ninja dense overviews', () => {
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
