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

  it('indexes Ducats as items', () => {
    const overview = '{"type":"Ducat","lines":[{"name":"Brinehook\'s Ducat","chaos":0.5029,"graph":[]}]}'

    expect(splitJsonBlob(overview)).toEqual([{
      ns: 'ITEM',
      url: 'ducats',
      lines: overview
    }])
  })
})
