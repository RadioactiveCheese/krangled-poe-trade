import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'

const rendererDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicDir = path.join(rendererDir, 'public')

test('localized Mercenary metadata matches the checked-in English set', async () => {
  const canonicalItems = await readNdjson(path.join(publicDir, 'data/en/items.ndjson'))
  const canonicalBuilds = mercenaryBuildMap(canonicalItems)
  const canonicalStats = mercenaryStatIds(
    await readNdjson(path.join(publicDir, 'data/en/stats.ndjson'))
  )

  for (const language of ['en', 'ru', 'ko', 'cmn-Hant']) {
    const items = await readNdjson(path.join(publicDir, `data/${language}/items.ndjson`))
    assert.deepEqual(mercenaryBuildMap(items), canonicalBuilds,
      `${language} must contain the same Mercenary builds and Trade IDs as English`)
    const warrant = items.find(entry => entry.refName === 'Mercenary Warrant')
    assert.ok(warrant, `${language} must contain the Mercenary Warrant base item`)
    assert.equal(warrant.tradeDisc, 'mercenary_warrant')
    assert.match(warrant.icon, /MercenaryWarrant\.png$/u)

    const stats = mercenaryStatIds(
      await readNdjson(path.join(publicDir, `data/${language}/stats.ndjson`))
    )
    assert.deepEqual(stats, canonicalStats,
      `${language} must contain the same Mercenary stat IDs as English`)
  }

  assert.equal(canonicalBuilds.has('Infamous Warpriest of the Ruckus'), true)
  assert.equal(canonicalStats.has('mercenary.skill_26705'), true)
  assert.equal(canonicalStats.has('mercenary.skill_5673'), true)
})

test('Mercenary metadata covers the complete official Trade dataset', {
  skip: !process.env.TEST_LIVE_TRADE_API && 'set TEST_LIVE_TRADE_API=1 to run'
}, async () => {
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
  const mapGroup = officialItems.result.find(group => group.id === 'map')
  assert.ok(mapGroup, 'official items response must contain the "map" group')
  const officialBuilds = mapGroup.entries.filter(entry => entry.disc === 'mercenary_warrant')
  const officialBuildsByName = new Map(officialBuilds.map(entry => [
    entry.text.match(/\(([^()]*)\)$/u)?.[1],
    entry.type
  ]))
  assert.equal(officialBuildsByName.has(undefined), false,
    'every official Mercenary Warrant must expose a build name')

  const mercenaryGroup = officialStats.result.find(group => group.id === 'mercenary')
  assert.ok(mercenaryGroup, 'official stats response must contain the "mercenary" group')
  const officialStatIds = new Set(mercenaryGroup.entries.map(entry => entry.id))

  const localItems = await readNdjson(path.join(publicDir, 'data/en/items.ndjson'))
  assert.deepEqual(mercenaryBuildMap(localItems), officialBuildsByName,
    'English Mercenary builds and Trade IDs must exactly match the official set')
  const localStats = await readNdjson(path.join(publicDir, 'data/en/stats.ndjson'))
  assert.deepEqual(mercenaryStatIds(localStats), officialStatIds,
    'English Mercenary stat IDs must exactly match the official set')
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

    const metadataDrift = parseClipboard(warrantText({
      details: ['Build: Earthshaker', 'Mercenary Level: 83'],
      skills: [['Smite']]
    }))
    assert.equal(metadataDrift.isOk(), true)
    const driftFilters = createMercenaryFilters(metadataDrift.value)
    const driftSkill = driftFilters.find(filter => !filter.group && filter.statRef === 'Smite')
    assert.ok(driftSkill)
    assert.equal(driftSkill.tag, 'mercenary-utility')

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

function mercenaryBuildMap (items) {
  return new Map(items
    .filter(entry => entry.namespace === 'MERCENARY_BUILD')
    .map(entry => [entry.refName, entry.mercenaryTradeId]))
}

function mercenaryStatIds (stats) {
  return new Set(stats
    .flatMap(expandStatGroups)
    .flatMap(entry => entry.trade?.ids?.pseudo ?? [])
    .filter(id => id.startsWith('mercenary.')))
}
