import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Pins entries ported from upstream's "update data" commit 543423ab
// (awakened-poe-trade, 2026-09-09) so a later partial sync can't drop them.

const languages = ['en', 'ru', 'ko', 'cmn-Hant'] as const

function readNdjson<T> (language: string, file: 'items' | 'stats'): T[] {
  return readFileSync(new URL(`../public/data/${language}/${file}.ndjson`, import.meta.url), 'utf8')
    .trim().split(/\r?\n/u).map(line => JSON.parse(line) as T)
}

interface Item { name: string, refName: string, namespace: string }
interface Stat { ref?: string, mercenary?: { tier?: number, maxTier?: boolean } }

const blightedNames: Record<typeof languages[number], Record<string, string>> = {
  en: { 'Blighted Map': 'Blighted Map', 'Blight-ravaged Map': 'Blight-ravaged Map' },
  ru: { 'Blighted Map': 'Заражённая Карта', 'Blight-ravaged Map': 'Разорённая Скверной Карта' },
  ko: { 'Blighted Map': '역병 걸린 지도', 'Blight-ravaged Map': '역병에 유린당한 지도' },
  'cmn-Hant': { 'Blighted Map': '凋落的 地圖', 'Blight-ravaged Map': '凋落蔓延的 地圖' }
}

describe('upstream data sync', () => {
  for (const language of languages) {
    it(`${language} uses localized Blighted map base names`, () => {
      const items = readNdjson<Item>(language, 'items').filter(item => item.namespace === 'ITEM')
      for (const [refName, name] of Object.entries(blightedNames[language])) {
        expect(items.find(item => item.refName === refName)?.name, refName).toBe(name)
      }
    })

    it(`${language} marks single-tier mercenary supports as maximum tier`, () => {
      const stats = readNdjson<Stat>(language, 'stats')
      for (const ref of ['Chain', 'Knockback']) {
        expect(stats.find(stat => stat.ref === ref)?.mercenary?.maxTier, ref).toBe(true)
      }
    })
  }

  it('resolves the related-item entries added to item-drop.json', () => {
    const drops = JSON.parse(readFileSync(new URL('../public/data/item-drop.json', import.meta.url), 'utf8')) as Array<{ query: string[], items: string[] }>
    const refs = new Set(drops.flatMap(entry => [...entry.query, ...entry.items]))
    const known = new Set(readNdjson<Item>('en', 'items').map(item => `${item.namespace}::${item.refName}`))
    for (const ref of [
      'UNIQUE::Mageblood // 4 Flasks, Heavy Belt', 'UNIQUE::Soul Taker // Siege Axe', 'UNIQUE::Replica Cortex // T0',
      'UNIQUE::The Twilight Temple // T0', 'UNIQUE::Vix Lunaris // Cardinal Round Shield', 'UNIQUE::Invictus Solaris // Archon Kite Shield',
      'UNIQUE::The Vinktar Square // T0', 'UNIQUE::Vessel of Vinktar',
      "UNIQUE::The Coward's Trial // T0", "UNIQUE::Replica Poorjoy's Asylum // T0", "UNIQUE::Poorjoy's Asylum // T0"
    ]) {
      expect(refs.has(ref), ref).toBe(true)
      expect(known.has(ref.split(' // ')[0]), ref).toBe(true)
    }
  })
})
