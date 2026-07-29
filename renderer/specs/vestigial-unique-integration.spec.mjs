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

    for (const fixture of [
      { lang: 'en', typeLine: "Vestigial Sage's Robe", baseType: "Sage's Robe" },
      { lang: 'ru', typeLine: 'Вырожденный: Одеяние мудреца', baseType: 'Одеяние мудреца' },
      { lang: 'ko', typeLine: '흔적 현자의 로브', baseType: '현자의 로브' },
      { lang: 'cmn-Hant', typeLine: '殘存 賢者之袍', baseType: '賢者之袍' }
    ]) {
      await Data.loadForLang(fixture.lang)
      assert.equal(Data.CLIENT_STRINGS.VESTIGIAL_NAME.exec(fixture.typeLine)?.[1], fixture.baseType)
    }
  } finally {
    globalThis.fetch = originalFetch
    await vite?.close()
  }
})
