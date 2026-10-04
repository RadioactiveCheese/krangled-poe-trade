import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PUBLIC = path.join(ROOT, 'public')
let server, Data, parseClipboard, makeIdentifiedUnique, originalFetch

test.before(async () => {
  originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    try {
      return new Response(await fs.readFile(path.join(PUBLIC, pathname.replace(/^\//, ''))), { status: 200 })
    } catch {
      return new Response('not found', { status: 404 })
    }
  }
  server = await createServer({
    root: ROOT,
    logLevel: 'silent',
    optimizeDeps: { noDiscovery: true },
    plugins: [{
      name: 'test-public-data-modules',
      enforce: 'pre',
      resolveId (id) { return id.startsWith('/data/') ? `\0public-data:${id}` : undefined },
      async load (id) {
        const prefix = '\0public-data:'
        if (id.startsWith(prefix)) return await fs.readFile(path.join(PUBLIC, id.slice(prefix.length + 1)), 'utf8')
      }
    }],
    server: { middlewareMode: true },
    appType: 'custom'
  })
  Data = await server.ssrLoadModule('/src/assets/data/index.ts')
  await Data.init('en')
  ;({ parseClipboard, makeIdentifiedUnique } = await server.ssrLoadModule('/src/parser/index.ts'))
})
test.after(async () => {
  await server?.close()
  globalThis.fetch = originalFetch
})

function parse (text) {
  const result = parseClipboard(text)
  assert.equal(result.isOk(), true, JSON.stringify(result.error))
  return result.value
}

test('clipboard parsing calculates dust after quality and influences', () => {
  const item = parse(`Item Class: Gloves
Rarity: Unique
Meginord's Vise
Steel Gauntlets
--------
Quality: +20% (augmented)
Armour: 100
--------
Item Level: 84
--------
Shaper Item`)
  assert.equal(item.quality, 20)
  assert.equal(item.influences.length, 1)
  assert.equal(item.dustEquivalent, Math.floor(5.46 * 2500 * 1.9))
})

test('unidentified clipboard with or without a price note produces the same frozen preview', () => {
  const clipboard = `Item Class: Gloves
Rarity: Unique
Steel Gauntlets
--------
Quality: +20% (augmented)
Armour: 100
--------
Item Level: 84
--------
Unidentified`
  const unique = Data.ITEM_BY_REF('UNIQUE', "Meginord's Vise")[0]
  for (const text of [clipboard, `${clipboard}\n--------\nNote: ~b/o 1 alt`]) {
    const item = parse(text)
    const preview = makeIdentifiedUnique(unique, item)
    assert.equal(preview.isUnidentified, true)
    assert.equal(preview.uniqueBase.refName, 'Steel Gauntlets')
    assert.equal(preview.dustEquivalent, Math.floor(5.46 * 2500 * 1.4))
    assert.equal(Object.isFrozen(preview), true)
  }
})

test('accessory catalyst quality contributes to the dust estimate', () => {
  const item = parse(`Item Class: Rings
Rarity: Unique
Heartbound Loop
Moonstone Ring
--------
Quality (Life and Mana Modifiers): +20% (augmented)
--------
Item Level: 84`)
  assert.equal(item.quality, 20)
  assert.equal(item.dustEquivalent, Math.floor(5.32 * 2500 * 1.4))
})

test('corruption implicit mechanics contribute their bonus after clipboard parsing', () => {
  const item = parse(`Item Class: Gloves
Rarity: Unique
Meginord's Vise
Steel Gauntlets
--------
Quality: +20% (augmented)
Armour: 100
--------
Item Level: 84
--------
{ Corruption Implicit Modifier }
+1 to Level of Socketed Gems (implicit)
{ Corruption Implicit Modifier }
+2 to Level of Socketed AoE Gems (implicit)
--------
Corrupted`)
  assert.equal(item.isCorrupted, true)
  const corruptions = item.newMods.filter(mod => mod.info.mechanic === 'corrupted')
  assert.equal(corruptions.length, 2)
  assert.ok(corruptions.every(mod => mod.info.generation === undefined))
  assert.equal(item.dustEquivalent, Math.floor(5.46 * 2500 * 2.4))
})
