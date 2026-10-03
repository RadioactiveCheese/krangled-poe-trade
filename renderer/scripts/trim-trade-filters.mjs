// Writes specs/fixtures/trade-data-filters-poe1.json: a trimmed snapshot of the
// live PoE1 trade filter list, keeping only the IDs that specs read.
//
//   node scripts/trim-trade-filters.mjs              # fetch the live endpoint
//   node scripts/trim-trade-filters.mjs full.json    # trim a saved full response
//
// Not run in CI; re-run by hand when the trade site changes its filters.
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const TRADE_FILTERS = 'https://www.pathofexile.com/api/trade/data/filters'
const OUTPUT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../specs/fixtures/trade-data-filters-poe1.json'
)

// Filters whose option values the query builder sends (other than plain
// true/false), so their option IDs are kept and checked by specs.
const KEEP_OPTIONS = new Set([
  'status_filters.status',
  'type_filters.category',
  'type_filters.rarity',
  'map_filters.chart_shape',
  'heist_filters.heist_objective_value',
  'trade_filters.collapse',
  'trade_filters.indexed',
  'trade_filters.price'
])

async function loadFull () {
  const file = process.argv[2]
  if (file) {
    return JSON.parse(await fs.readFile(file, 'utf8'))
  }
  const response = await fetch(TRADE_FILTERS, {
    headers: { 'User-Agent': 'Krangled-PoE-Trade data generator' }
  })
  if (!response.ok) {
    throw new Error(`${TRADE_FILTERS}: ${response.status} ${response.statusText}`)
  }
  return response.json()
}

function trimFilter (groupId, filter) {
  const trimmed = { id: filter.id }
  if (KEEP_OPTIONS.has(`${groupId}.${filter.id}`)) {
    const options = filter.option?.options
    if (!options) throw new Error(`${groupId}.${filter.id} has no options`)
    trimmed.options = options.map(option => option.id ?? '')
  }
  return trimmed
}

const full = await loadFull()
const groups = full.result.map(group => ({
  id: group.id,
  filters: group.filters.map(filter => trimFilter(group.id, filter))
}))

for (const key of KEEP_OPTIONS) {
  const [groupId, filterId] = key.split('.')
  if (!groups.some(g => g.id === groupId && g.filters.some(f => f.id === filterId && f.options))) {
    console.warn(`warning: ${key} is not in the live dataset`)
  }
}

const lines = [
  '{',
  `  "source": ${JSON.stringify(TRADE_FILTERS)},`,
  `  "fetched": ${JSON.stringify(new Date().toISOString().slice(0, 10))},`,
  '  "result": ['
]
groups.forEach((group, gi) => {
  lines.push(`    { "id": ${JSON.stringify(group.id)}, "filters": [`)
  group.filters.forEach((filter, fi) => {
    const comma = fi < group.filters.length - 1 ? ',' : ''
    lines.push(`      ${JSON.stringify(filter).replace(/,"/g, ', "').replace(/":/g, '": ')}${comma}`)
  })
  lines.push(`    ] }${gi < groups.length - 1 ? ',' : ''}`)
})
lines.push('  ]', '}', '')

await fs.writeFile(OUTPUT, lines.join('\n'))
console.log(`wrote ${OUTPUT} (${groups.length} groups, ${groups.reduce((n, g) => n + g.filters.length, 0)} filters)`)
