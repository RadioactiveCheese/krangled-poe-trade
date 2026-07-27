import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const rendererDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rendererDir, 'public')

test('parses Mercenary Warrant details and a complete copied item', async () => {
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
    const { parseClipboard } = await vite.ssrLoadModule('/src/parser/index.ts')
    const { parseMercenaryWarrantDetails } = await vite.ssrLoadModule('/src/parser/mercenary-warrant.ts')

    for (const fixture of [
      { lang: 'en', lines: ['Build: Earthshaker', 'Mercenary Level: 83'], expected: { build: 'Earthshaker', level: 83 } },
      { lang: 'ru', lines: ['Билд: Боевой жрец', 'Уровень наёмника: 81'], expected: { build: 'Боевой жрец', level: 81 } },
      { lang: 'ko', lines: ['빌드: 대지분쇄자', '용병 레벨: 80'], expected: { build: '대지분쇄자', level: 80 } },
      { lang: 'cmn-Hant', lines: ['流派： 萬惡戰爭牧師', '傭兵等級： 79'], expected: { build: '萬惡戰爭牧師', level: 79 } }
    ]) {
      await Data.loadForLang(fixture.lang)
      assert.deepEqual(
        parseMercenaryWarrantDetails(fixture.lines, Data.CLIENT_STRINGS),
        fixture.expected
      )
    }
    await Data.loadForLang('en')
    assert.equal(
      parseMercenaryWarrantDetails([
        'Right click this item to view Mercenary details.',
        'Can be used in a personal Map Device alongside a Map.'
      ], Data.CLIENT_STRINGS),
      undefined
    )
    assert.equal(
      parseMercenaryWarrantDetails([
        'Build: 83',
        'Mercenary Level: 1'
      ], Data.CLIENT_STRINGS),
      undefined
    )
    assert.equal(
      parseMercenaryWarrantDetails([
        'Build: Earthshaker',
        'Mercenary Level 83'
      ], Data.CLIENT_STRINGS),
      undefined
    )
    assert.equal(
      parseMercenaryWarrantDetails([
        'Build: Earthshaker',
        'Mercenary Level: 101'
      ], Data.CLIENT_STRINGS),
      undefined
    )
    assert.equal(
      parseMercenaryWarrantDetails([
        'Role: Earthshaker',
        'Level: 83'
      ], Data.CLIENT_STRINGS),
      undefined
    )

    const result = parseClipboard(`Item Class: Map Fragments
Rarity: Normal
Mercenary Warrant
--------
Rako Rata
--------
Build: Earthshaker
Mercenary Level: 83
--------
Right click this item to view Mercenary details.
Can be used in a personal Map Device alongside a Map to add the Mercenary to the area.`)

    assert.equal(result.isOk(), true)
    assert.equal(result.value.info.refName, 'Mercenary Warrant')
    assert.deepEqual(result.value.mercenary, {
      build: 'Earthshaker',
      level: 83
    })

    const malformed = parseClipboard(`Item Class: Map Fragments
Rarity: Normal
Mercenary Warrant
--------
Rako Rata
--------
Build: Earthshaker
--------
Right click this item to view Mercenary details.`)
    assert.equal(malformed.isErr(), true)
  } finally {
    globalThis.fetch = originalFetch
    await vite?.close()
  }
})
