import { expect, it } from 'vitest'
import strings from '../../../../public/data/en/client_strings.js'
import russian from '../../../../public/data/ru/client_strings.js'
import korean from '../../../../public/data/ko/client_strings.js'
import chinese from '../../../../public/data/cmn-Hant/client_strings.js'
import snapshot from '../../../fixtures/modifier-mechanic-affix-names.json'

// This fixture is independent of runtime name arrays. English is extracted from the
// complete GGG client export; localized expected names are pinned to upstream metadata.
for (const [language, local] of Object.entries({ en: strings, ru: russian, ko: korean, 'cmn-Hant': chinese })) {
  it(`covers the independent affected affix names in ${language}`, () => {
    const expected = snapshot.locales[language as keyof typeof snapshot.locales]
    for (const [key, names] of Object.entries(expected)) {
      const actual = new Set((local as unknown as Record<string, string[]>)[key])
      for (const name of names) expect(actual.has(name), `${language}:${key}:${name}`).toBe(true)
      // Localized dictionaries retain compatibility aliases alongside current names.
      if (language === 'en') expect(actual).toEqual(new Set(names))
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
