import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { calcDisenchantDust } from '@/parser/calc-disenchant-dust'
import { makeIdentifiedUnique } from '@/parser'
import { createVirtualItem, ItemInfluence, ItemRarity } from '@/parser/ParsedItem'
import { ModifierMechanic, ModifierType } from '@/parser/modifiers'
import { ItemCategory } from '@/parser/meta'
import type { ParsedItem } from '@/parser'
import contract from '../fixtures/disenchant-contract.json'

const unique = { name: 'Test Unique', refName: 'Test Unique', namespace: 'UNIQUE' as const, unique: { base: 'Test Base', disenchantValue: 10 } }
const item = (props: Partial<ParsedItem> = {}) => createVirtualItem({
  rarity: ItemRarity.Unique, category: ItemCategory.Gloves, itemLevel: 84, info: unique, ...props
})
const corrupted = () => ({ info: { type: ModifierType.Implicit, mechanic: ModifierMechanic.Corruption, tags: [] }, stats: [] })

describe('unique disenchant dust estimates', () => {
  it.each([[1, 250], [46, 250], [47, 260], [65, 465], [66, 475], [67, 485], [68, 500], [69, 625], [84, 2500], [100, 2500]])(
    'uses the level curve and caps for item level %i', (itemLevel, multiplier) => {
      expect(calcDisenchantDust(item({ itemLevel }))).toBe(10 * multiplier)
    }
  )

  it.each([
    ['Kalisa\'s Grace', 65, 1813], ['Chain of Endurance', 66, 698], ['Meginord\'s Vise', 65, 2538],
    ['The Eternal Apple', 65, 1920], ['Bloodplay', 64, 679], ['Darkray Vectors', 66, 3937],
    ['Vis Mortis', 70, 6217], ['Heartbound Loop', 69, 3325], ['Aukuna\'s Will', 68, 1515],
    ['Kiloava\'s Bluster', 67, 3171], ['Stone of Lazhwar', 66, 565]
  ])('matches measured in-game %s at level %i', (name, itemLevel, expected) => {
    const base = (contract.values as Record<string, number>)[name]
    expect(base).toBeGreaterThan(0)
    const estimate = calcDisenchantDust(item({ itemLevel, info: { ...unique, unique: { base: 'Test Base', disenchantValue: base } } }))!
    // Multipliers in the published dataset are rounded to two decimals.
    expect(Math.abs(estimate - expected)).toBeLessThanOrEqual(1)
  })

  it('adds quality, distinct influences and corrupted implicits at maximum town rank', () => {
    expect(calcDisenchantDust(item({ quality: 20 }))).toBe(35000)
    expect(calcDisenchantDust(item({ influences: [ItemInfluence.Shaper, ItemInfluence.Elder, ItemInfluence.Shaper] }))).toBe(50000)
    const mods = [corrupted(), corrupted(), { info: { type: ModifierType.Implicit, mechanic: ModifierMechanic.Eldritch, tags: [] }, stats: [] }]
    expect(calcDisenchantDust(item({ quality: 20, influences: [ItemInfluence.Shaper], isCorrupted: true, newMods: mods }))).toBe(72500)
    expect(calcDisenchantDust(item({ newMods: mods }))).toBe(25000)
  })

  it('does not manufacture values for missing/invalid metadata or non-equipment maps', () => {
    expect(calcDisenchantDust(item({ itemLevel: undefined }))).toBeUndefined()
    expect(calcDisenchantDust(item({ itemLevel: NaN }))).toBeUndefined()
    expect(calcDisenchantDust(item({ quality: NaN }))).toBeUndefined()
    expect(calcDisenchantDust(item({ info: { ...unique, unique: undefined } }))).toBeUndefined()
    expect(calcDisenchantDust(item({ category: ItemCategory.Map }))).toBeUndefined()
  })

  it('resolves unidentified previews without changing the source and preserves the base/frozen item', () => {
    const base = { name: 'Test Base', refName: 'Test Base', namespace: 'ITEM' as const }
    const unidentified = Object.freeze(item({ info: base, isUnidentified: true, quality: 20 }))
    const preview = makeIdentifiedUnique(unique, unidentified)
    expect(preview.dustEquivalent).toBe(35000)
    expect(preview.uniqueBase).toBe(base)
    expect(preview.info).toBe(unique)
    expect(preview.isUnidentified).toBe(true)
    expect(Object.isFrozen(preview)).toBe(true)
    expect(unidentified.info).toBe(base)
    expect(unidentified.dustEquivalent).toBeUndefined()
    // Choosing another candidate does not retain the earlier dust estimate.
    const other = makeIdentifiedUnique({ ...unique, unique: { base: 'Test Base' } }, preview)
    expect(other.uniqueBase).toBe(base)
    expect(other.dustEquivalent).toBeUndefined()
  })

  it('keeps every local multiplier aligned with the full current source dataset in all languages', () => {
    expect(Object.keys(contract.values)).toHaveLength(1511)
    const source = contract.values as Record<string, number>
    for (const language of ['en', 'ru', 'cmn-Hant', 'ko']) {
      const translations = JSON.parse(fs.readFileSync(`public/data/${language}/app_i18n.json`, 'utf8'))
      expect(translations.item.disenchanting).toBeTruthy()
      const items = fs.readFileSync(`public/data/${language}/items.ndjson`, 'utf8').trim().split('\n').map(line => JSON.parse(line))
      const uniques = items.filter(item => item.namespace === 'UNIQUE')
      for (const entry of uniques) {
        if (entry.unique?.disenchantValue !== undefined) {
          expect(entry.unique.disenchantValue, `${language}: ${entry.refName}`).toBe(source[entry.refName])
        }
      }
      const names = new Set(uniques.map(item => item.refName))
      // PoEDB also lists obsolete/fated/development uniques outside Trade's
      // supported dataset. Any newly missing/renamed supported name fails.
      expect(Object.keys(source).filter(name => !names.has(name) && !contract.unmapped.includes(name)), language).toEqual([])
    }
  })
})
