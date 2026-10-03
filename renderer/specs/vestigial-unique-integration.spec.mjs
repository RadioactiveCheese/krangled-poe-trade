import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const rendererDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rendererDir, 'public')

const VESTIGIAL_ZAHNDETHUS = `Item Class: Body Armours
Rarity: Unique
Zahndethus' Cassock
Vestigial Sage's Robe
--------
Energy Shield: 187 (augmented)
--------
Requirements:
Level: 56
Int: 104
--------
Sockets: G
--------
Item Level: 86
--------
{ Vestigial Implicit Modifier }
100% increased Endurance, Frenzy and Power Charge Duration
--------
{ Unique Modifier — Defences, Energy Shield }
134(125-150)% increased Energy Shield
{ Unique Modifier — Damage, Elemental, Lightning, Attack }
Adds 1 to 40 Lightning Damage to Attacks
{ Unique Modifier }
25% increased Light Radius
{ Unique Modifier — Chaos, Resistance }
+41(40-50)% to Chaos Resistance
{ Unique Modifier }
100% chance to create Consecrated Ground when you Block
(Allies on your Consecrated Ground Regenerate a percentage of their Maximum Life per second, and Curses have 50% reduced effect on them)
--------
When dead men rise and darkness falls
Only faith can be your walls
Walls of Light, not of brick
Twice as strong and twice as thick`

test('parses a Vestigial unique and classifies its inherited implicit', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    const file = path.join(publicDir, pathname.replace(/^\//, ''))
    try {
      return new Response(await fs.readFile(file), { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }

  let vite
  try {
    vite = await createServer({
      root: rendererDir,
      logLevel: 'silent',
      plugins: [{
        name: 'test-public-data-modules',
        enforce: 'pre',
        resolveId (id) {
          return id.startsWith('/data/') ? `\0public-data:${id}` : undefined
        },
        async load (id) {
          const prefix = '\0public-data:'
          if (!id.startsWith(prefix)) return
          return await fs.readFile(path.join(publicDir, id.slice(prefix.length + 1)), 'utf8')
        }
      }],
      server: { middlewareMode: true },
      appType: 'custom'
    })

    const Data = await vite.ssrLoadModule('/src/assets/data/index.ts')
    await Data.init('en')
    const { parseClipboard, ItemCategory, ItemRarity } = await vite.ssrLoadModule('/src/parser/index.ts')
    const { initUiModFilters } = await vite.ssrLoadModule('/src/web/price-check/filters/create-stat-filters.ts')
    const { parseModInfoLine } = await vite.ssrLoadModule('/src/parser/advanced-mod-desc.ts')

    const result = parseClipboard(VESTIGIAL_ZAHNDETHUS)

    assert.equal(result.isOk(), true)
    const item = result.value
    assert.equal(item.rarity, ItemRarity.Unique)
    assert.equal(item.category, ItemCategory.BodyArmour)
    assert.equal(item.info.refName, "Zahndethus' Cassock")
    assert.equal(item.info.unique.base, "Sage's Robe")
    assert.equal(item.isVestigial, true)

    const inheritedImplicit = initUiModFilters(item, { searchStatRange: 10 })
      .find(filter => filter.statRef === '#% increased Endurance, Frenzy and Power Charge Duration')
    assert.ok(inheritedImplicit)
    assert.equal(inheritedImplicit.tag, 'vestigial')
    assert.equal(inheritedImplicit.disabled, false)
    assert.equal(inheritedImplicit.hidden, undefined)

    for (const [text, expected] of [
      [VESTIGIAL_ZAHNDETHUS.replace('134(125-150)', '200(125-150)'), 'legacy'],
      [VESTIGIAL_ZAHNDETHUS.replace('134(125-150)', '200(125-150)') + '\n--------\nCorrupted', 'volatile']
    ]) {
      const parsed = parseClipboard(text)
      assert.equal(parsed.isOk(), true)
      const roll = parsed.value.newMods.flatMap(mod => mod.stats)
        .find(stat => stat.stat.ref === '#% increased Energy Shield').roll
      assert.equal(roll.generation, expected)
    }
    const reflected = parseClipboard(`Item Class: Rings\nRarity: Rare\nReflection\nGold Ring\n--------\n{ Prefix Modifier "Healthy" (Tier: 1) }\n+120(50-70) to maximum Life\n--------\nMirrored`)
    assert.equal(reflected.isOk(), true)
    assert.equal(reflected.value.newMods[0].stats[0].roll.generation, 'reflecting')
    const ordinaryCorrupted = parseClipboard(VESTIGIAL_ZAHNDETHUS + '\n--------\nCorrupted')
    assert.equal(ordinaryCorrupted.isOk(), true)
    const constantScalable = initUiModFilters(ordinaryCorrupted.value, { searchStatRange: 10 })
      .find(filter => filter.statRef === '#% increased Light Radius')
    assert.equal(constantScalable.hidden, undefined)
    assert.equal(constantScalable.disabled, false)

    for (const fixture of [
      { lang: 'en', typeLine: "Vestigial Sage's Robe", baseType: "Sage's Robe" },
      { lang: 'ru', typeLine: 'Вырожденный: Одеяние мудреца', baseType: 'Одеяние мудреца' },
      { lang: 'ko', typeLine: '흔적 현자의 로브', baseType: '현자의 로브' },
      { lang: 'cmn-Hant', typeLine: '殘存 賢者之袍', baseType: '賢者之袍' }
    ]) {
      await Data.loadForLang(fixture.lang)
      assert.equal(Data.CLIENT_STRINGS.VESTIGIAL_NAME.exec(fixture.typeLine)?.[1], fixture.baseType)
      const strings = Data.CLIENT_STRINGS
      assert.equal(parseModInfoLine(`{ ${strings.VESTIGIAL_MODIFIER ?? strings.VESTIGIAL_IMPLICIT} }`).mechanic, 'vestigial')
      assert.equal(parseModInfoLine(`{ ${strings.FOULBORN_MODIFIER} }`).mechanic, 'foulborn')
      assert.equal(parseModInfoLine(`{ ${strings.CORRUPTED_IMPLICIT} }`).mechanic, 'corrupted')
      const families = [
        ['SHAPER_MODS', 'explicit-shaper'], ['ELDER_MODS', 'explicit-elder'],
        ['HUNTER_MODS', 'explicit-hunter'], ['WARLORD_MODS', 'explicit-warlord'],
        ['REDEEMER_MODS', 'explicit-redeemer'], ['CRUSADER_MODS', 'explicit-crusader'],
        ['DELVE_MODS', 'explicit-delve'], ['VEILED_MODS', 'explicit-veiled'],
        ['INCURSION_MODS', 'explicit-incursion'], ['ESSENCE_MODS', 'explicit-essence'],
        ['INFAMOUS_MODS', 'explicit-infamous']
      ]
      for (let familyIndex = 0; familyIndex < families.length; familyIndex++) {
        const [key, expected] = families[familyIndex]
        for (const name of strings[key]) {
          // Some names are shared; classification intentionally uses precedence.
          if (families.slice(0, familyIndex).some(([earlier]) => strings[earlier].includes(name))) continue
          assert.equal(parseModInfoLine(`{ ${strings.PREFIX_MODIFIER} "${name}" }`).mechanic, expected,
            `${fixture.lang}: classify every known ${key} name`)
        }
      }
    }
  } finally {
    globalThis.fetch = originalFetch
    await vite?.close()
  }
})
