import { describe, expect, it } from 'vitest'
import { splitJsonBlob } from '@/web/background/split-poeninja-overviews'
import fs from 'node:fs'
import corpseContract from '../../fixtures/poeninja-corpses.json'

describe('poe.ninja dense overviews', () => {
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

  it('indexes Ducats as items', () => {
    const overview = '{"type":"Ducat","lines":[{"name":"Brinehook\'s Ducat","chaos":0.5029,"graph":[]}]}'

    expect(splitJsonBlob(overview)).toEqual([{
      ns: 'ITEM',
      url: 'ducats',
      lines: overview
    }])
  })
})
