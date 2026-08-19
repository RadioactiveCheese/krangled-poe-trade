import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const rendererDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rendererDir, 'public')

test('Mercenary metadata covers the complete official Trade dataset', async () => {
  const [itemsResponse, statsResponse] = await Promise.all([
    fetch('https://www.pathofexile.com/api/trade/data/items', {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
      signal: AbortSignal.timeout(15_000)
    }),
    fetch('https://www.pathofexile.com/api/trade/data/stats', {
      headers: { 'User-Agent': 'Krangled-PoE-Trade metadata test' },
      signal: AbortSignal.timeout(15_000)
    })
  ])
  assert.equal(itemsResponse.ok, true)
  assert.equal(statsResponse.ok, true)

  const officialItems = await itemsResponse.json()
  const officialStats = await statsResponse.json()
  const officialBuilds = officialItems.result
    .find(group => group.id === 'map').entries
    .filter(entry => entry.disc === 'mercenary_warrant')
  const officialBuildsByName = new Map(officialBuilds.map(entry => [
    entry.text.match(/\(([^()]*)\)$/u)?.[1],
    entry.type
  ]))
  const officialStatIds = new Set(
    officialStats.result.find(group => group.id === 'mercenary').entries
      .map(entry => entry.id)
  )

  const localItems = await readNdjson(path.join(publicDir, 'data/en/items.ndjson'))
  const localBuildRows = localItems
    .filter(entry => entry.namespace === 'MERCENARY_BUILD')
  const localBuildNames = new Set(localBuildRows.map(entry => entry.refName))

  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    const items = await readNdjson(path.join(publicDir, `data/${language}/items.ndjson`))
    const buildRows = items
      .filter(entry => entry.namespace === 'MERCENARY_BUILD')
    assert.deepEqual(
      new Map(buildRows.map(entry => [entry.refName, entry.mercenaryTradeId])),
      officialBuildsByName,
      `${language} Mercenary builds and Trade IDs must exactly match the official set`
    )
    const warrant = items.find(entry => entry.refName === 'Mercenary Warrant')
    assert.equal(warrant.tradeDisc, 'mercenary_warrant')
    assert.match(warrant.icon, /MercenaryWarrant\.png$/u)

    const stats = await readNdjson(path.join(publicDir, `data/${language}/stats.ndjson`))
    const localStatIds = new Set(stats
      .flatMap(expandStatGroups)
      .flatMap(entry => entry.trade?.ids?.pseudo ?? [])
      .filter(id => id.startsWith('mercenary.')))
    assert.deepEqual(localStatIds, officialStatIds,
      `${language} Mercenary stat IDs must exactly match the official set`)
    assert.equal(localStatIds.has('mercenary.skill_26705'), true)
    assert.equal(localStatIds.has('mercenary.skill_5673'), true)
  }

  // Regression coverage for additions that exposed the stale fork-only mapping.
  assert.equal(localBuildNames.has('Infamous Warpriest of the Ruckus'), true)
})

test('parses and filters a complete Mercenary Warrant with strict validation', async () => {
  const originalFetch = globalThis.fetch
  globalThis.fetch = async (url) => {
    const pathname = new URL(String(url), 'http://local').pathname
    const file = path.join(publicDir, pathname.replace(/^\//u, ''))
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
    const { createMercenaryFilters } = await vite.ssrLoadModule('/src/web/price-check/filters/pseudo/mercenary.ts')

    const result = parseClipboard(warrantText({
      details: ['Build: Earthshaker', 'Mercenary Level: 83'],
      skills: [['Vaal Ground Slam', 'Pulverise (Tier: 2)']]
    }))
    assert.equal(result.isOk(), true)
    assert.equal(result.value.info.refName, 'Mercenary Warrant')
    assert.equal(result.value.mercenaryBuild.refName, 'Earthshaker')
    assert.equal(result.value.itemLevel, 83)
    assert.deepEqual(
      result.value.mercenarySkills.map(group => group.map(stat => stat.stat.ref)),
      [['Vaal Ground Slam', 'Pulverise']]
    )

    const filters = createMercenaryFilters(result.value)
    const skillGroup = filters.find(filter => filter.group === 'mercenary')
    assert.equal(skillGroup.meta.statRef, 'Vaal Ground Slam')
    assert.equal(skillGroup.stats[0].statRef, 'Pulverise')

    const renamedVariant = parseClipboard(warrantText({
      details: ['Build: Infamous Warpriest of the Ruckus', 'Mercenary Level: 84'],
      skills: [['Smite']]
    }))
    assert.equal(renamedVariant.isOk(), true)
    assert.equal(renamedVariant.value.mercenaryBuild.refName, 'Warpriest')
    assert.equal(renamedVariant.value.mercenaryBuildVariant.refName, 'Infamous Warpriest of the Ruckus')
    assert.equal(renamedVariant.value.mercenaryBuildVariant.mercenaryTradeId, 'AurasMinionsTemplarSmiteRuckusNoble')
    assert.doesNotThrow(() => createMercenaryFilters(renamedVariant.value))

    for (const invalid of [
      warrantText({ details: ['Build: Earthshaker', 'Mercenary Level: 101'], skills: [['Vaal Ground Slam']] }),
      warrantText({ details: ['Build: Earthshaker', 'Mercenary Level 83'], skills: [['Vaal Ground Slam']] }),
      warrantText({ details: ['Build: Earthshaker', 'Mercenary Level: 83'], skills: [] })
    ]) {
      assert.equal(parseClipboard(invalid).isErr(), true)
    }
  } finally {
    globalThis.fetch = originalFetch
    await vite?.close()
  }
})

function warrantText ({ details, skills }) {
  return `Item Class: Map Fragments
Rarity: Normal
Mercenary Warrant
--------
Rako Rata
--------
${details.join('\n')}
${skills.map(group => `--------\n${group.join('\n')}`).join('\n')}
--------
Right click this item to view Mercenary details.
Can be used in a personal Map Device alongside a Map to add the Mercenary to the area.`
}

async function readNdjson (file) {
  return (await fs.readFile(file, 'utf8'))
    .trim()
    .split(/\r?\n/u)
    .map(line => JSON.parse(line))
}

function expandStatGroups (entry) {
  return entry.stats ?? [entry]
}
