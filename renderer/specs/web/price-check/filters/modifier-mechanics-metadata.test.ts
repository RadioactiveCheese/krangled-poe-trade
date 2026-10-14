import { expect, it } from 'vitest'
import strings from '../../../../public/data/en/client_strings.js'
import russian from '../../../../public/data/ru/client_strings.js'
import korean from '../../../../public/data/ko/client_strings.js'
import chinese from '../../../../public/data/cmn-Hant/client_strings.js'
import snapshot from '../../../fixtures/modifier-mechanic-affix-names.json'

type ModNameLists = Record<string, string[]>
const locales: Record<string, ModNameLists> = {
  en: strings as unknown as ModNameLists,
  ru: russian as unknown as ModNameLists,
  ko: korean as unknown as ModNameLists,
  'cmn-Hant': chinese as unknown as ModNameLists
}

// This fixture is independent of runtime name arrays. English is extracted from the
// complete GGG client export; localized expected names are pinned to upstream metadata.
for (const [language, local] of Object.entries(locales)) {
  it(`covers the independent affected affix names in ${language}`, () => {
    const expected = snapshot.locales[language as keyof typeof snapshot.locales]
    for (const [key, names] of Object.entries(expected)) {
      const actual = new Set(local[key])
      for (const name of names) expect(actual.has(name), `${language}:${key}:${name}`).toBe(true)
      // Localized dictionaries retain compatibility aliases alongside current names.
      if (language === 'en') expect(actual).toEqual(new Set(names))
    }
  })
}

// Names that an upstream sync must not reintroduce: they are either stale (no longer
// used by any affix of that mechanic) or ambiguous with ordinary affixes, so name-only
// matching in mechanicFromModName would mis-tag mods.
for (const [language, keys] of Object.entries(snapshot.excluded)) {
  it(`keeps stale or ambiguous affix names out of ${language}`, () => {
    for (const [key, names] of Object.entries(keys)) {
      const actual = new Set(locales[language][key])
      for (const [name, reason] of Object.entries(names)) {
        expect(actual.has(name), `${language}:${key}:${name} (${reason})`).toBe(false)
      }
    }
  })
}

interface GameMod {
  domain: string
  generation_type: string
  name: string
  spawn_weights: Array<{ tag: string }>
}

it.skipIf(!process.env.TEST_LIVE_MODIFIER_METADATA)('covers complete current game influence and unveiled affix-name sets', async () => {
  // RePoE exports GGG client data; the Trade API does not publish affix names.
  const response = await fetch('https://repoe-fork.github.io/mods.json')
  expect(response.ok).toBe(true)
  const mods = Object.values(await response.json()) as GameMod[]
  const affixes = mods.filter(mod => ['prefix', 'suffix'].includes(mod.generation_type))
  const families = [
    ['SHAPER_MODS', 'shaper'], ['ELDER_MODS', 'elder'], ['CRUSADER_MODS', 'crusader'],
    ['HUNTER_MODS', 'basilisk'], ['REDEEMER_MODS', 'eyrie'], ['WARLORD_MODS', 'adjudicator']
  ] as const
  for (const [key, tag] of families) {
    const completeNames = new Set(affixes.filter(mod => mod.domain === 'item' &&
      mod.spawn_weights.some(weight => weight.tag.endsWith(`_${tag}`))).map(mod => mod.name))
    expect(new Set(strings[key]), `current ${key} names must include every natural and elevated affix`).toEqual(completeNames)
  }
  expect(new Set(strings.VEILED_MODS)).toEqual(new Set(affixes.filter(mod => mod.domain === 'unveiled').map(mod => mod.name)))
}, 60_000)

// Russian affix names are gender templates such as
// "<if:MS>{Подземный}<elif:FS>{Подземная}..."; the client displays one branch
// depending on the item base, so every branch must be recognised.
function displayedNames (name: string): string[] {
  return name.startsWith('<if') ? [...name.matchAll(/\{([^}]*)\}/g)].map(match => match[1]) : [name]
}

it.skipIf(!process.env.TEST_LIVE_MODIFIER_METADATA)('covers complete current influence, delve, essence and incursion affix names in ru and cmn-Hant', async () => {
  const english = await (await fetch('https://repoe-fork.github.io/mods.json')).json() as Record<string, GameMod>
  const checks = [
    ['DELVE_MODS', 'delve'], ['ESSENCE_MODS', 'item'], ['INCURSION_MODS', 'item']
  ] as const
  const families = [
    ['SHAPER_MODS', 'shaper'], ['ELDER_MODS', 'elder'], ['CRUSADER_MODS', 'crusader'],
    ['HUNTER_MODS', 'basilisk'], ['REDEEMER_MODS', 'eyrie'], ['WARLORD_MODS', 'adjudicator']
  ] as const
  for (const language of ['ru', 'cmn-Hant'] as const) {
    const response = await fetch(snapshot.localizedSources[language])
    expect(response.ok, `${language} dataset`).toBe(true)
    const localized = await response.json() as Record<string, GameMod>
    const excluded = (snapshot.excluded as Record<string, Record<string, Record<string, string>>>)[language] ?? {}
    for (const [key, domain] of checks) {
      const englishNames = new Set(strings[key])
      const expected = new Set<string>()
      for (const [id, mod] of Object.entries(english)) {
        if (mod.domain !== domain || !englishNames.has(mod.name)) continue
        for (const name of displayedNames(localized[id].name)) {
          if (!(name in (excluded[key] ?? {}))) expected.add(name)
        }
      }
      const actual = new Set(locales[language][key])
      for (const name of expected) expect(actual.has(name), `${language}:${key}:${name}`).toBe(true)
    }
    for (const [key, tag] of families) {
      const expected = new Set<string>()
      for (const [id, mod] of Object.entries(english)) {
        if (mod.domain !== 'item' || !['prefix', 'suffix'].includes(mod.generation_type)) continue
        if (!mod.spawn_weights.some(weight => weight.tag.endsWith(`_${tag}`))) continue
        for (const name of displayedNames(localized[id].name)) {
          if (!(name in (excluded[key] ?? {}))) expected.add(name)
        }
      }
      const actual = new Set(locales[language][key])
      for (const name of expected) expect(actual.has(name), `${language}:${key}:${name}`).toBe(true)
    }
  }
}, 120_000)
