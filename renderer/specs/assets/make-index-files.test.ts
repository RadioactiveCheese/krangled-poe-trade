import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { afterAll, describe, expect, it } from 'vitest'
import fnv1a from '@sindresorhus/fnv1a'
import { makeIndexFiles } from '../../src/assets/make-index-files.mjs'

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'krangled-indexes-'))
const languages = ['en', 'ru', 'cmn-Hant', 'ko']
const dataRoot = fileURLToPath(new URL('../../public/data/', import.meta.url))
afterAll(() => fs.rmSync(temporary, { recursive: true, force: true }))

function expectedIndex (source: string, keys: (entry: any) => string[], deduplicate = true) {
  let start = 0
  const entries = new Map<string, number>()
  const records: Array<[string, number]> = []
  for (const line of source.trimEnd().split('\n')) {
    for (const key of keys(JSON.parse(line))) {
      if (!entries.has(key)) entries.set(key, start)
      records.push([key, start])
    }
    start += line.length + 1
  }
  return (deduplicate ? [...entries] : records).map(([key, offset]) => [Number(fnv1a(key, { size: 32 })), offset]).sort((a, b) => a[0] - b[0])
}

function readIndex (file: string) {
  const bytes = fs.readFileSync(file)
  expect(bytes.length % 8).toBe(0)
  return Array.from({ length: bytes.length / 8 }, (_, i) => [bytes.readUInt32LE(i * 8), bytes.readUInt32LE(i * 8 + 4)])
}

describe('data index generation', () => {
  it.each(languages.flatMap(language => ['items', 'stats'].map(kind => ({ language, kind }))))(
    'rejects an empty $language/$kind source instead of accepting an empty generation', ({ language, kind }) => {
      const synthetic = path.join(temporary, `empty-${language}-${kind}`)
      for (const locale of languages) {
        const folder = path.join(synthetic, locale)
        fs.mkdirSync(folder, { recursive: true })
        fs.writeFileSync(path.join(folder, 'items.ndjson'), '{"namespace":"ITEM","name":"Item","refName":"Item"}\n')
        fs.writeFileSync(path.join(folder, 'stats.ndjson'), '{"ref":"stat","matchers":[{"string":"text"}]}\n')
      }
      fs.writeFileSync(path.join(synthetic, language, `${kind}.ndjson`), '')
      expect(() => makeIndexFiles(synthetic)).toThrow(`Empty data source: ${language}/${kind}.ndjson`)
    }
  )

  it('preserves complete per-language item/name/ref and stat/matcher lookup offsets', () => {
    for (const language of languages) {
      const target = path.join(temporary, language)
      fs.mkdirSync(target)
      for (const file of ['items.ndjson', 'stats.ndjson']) {
        fs.copyFileSync(path.join(dataRoot, language, file), path.join(target, file))
      }
    }
    makeIndexFiles(temporary)
    for (const language of languages) {
      const target = path.join(temporary, language)
      const items = fs.readFileSync(path.join(target, 'items.ndjson'), 'utf8')
      const stats = fs.readFileSync(path.join(target, 'stats.ndjson'), 'utf8')
      expect(readIndex(path.join(target, 'items-name.index.bin'))).toEqual(expectedIndex(items, item => [`${item.namespace}::${item.name}`]))
      expect(readIndex(path.join(target, 'items-ref.index.bin'))).toEqual(expectedIndex(items, item => [`${item.namespace}::${item.refName}`]))
      const statEntries = (group: any) => group.stats ?? [group]
      // Stat refs/matchers can intentionally share a hash and remain separate
      // records pointing at their complete grouped NDJSON line.
      for (const [file, keys] of [
        ['stats-ref.index.bin', (group: any) => statEntries(group).map((stat: any) => stat.ref)],
        ['stats-matcher.index.bin', (group: any) => statEntries(group).flatMap((stat: any) => stat.matchers.map((matcher: any) => matcher.advanced ?? matcher.string))]
      ] as const) {
        const actual = readIndex(path.join(target, file))
        const expected = expectedIndex(stats, keys, false)
        expect(actual).toEqual(expected)
        expect(actual.every(([hash, offset], i) => i === 0 || hash >= actual[i - 1][0])).toBe(true)
        for (const [, offset] of actual) {
          expect(offset === 0 || stats[offset - 1] === '\n').toBe(true)
          expect(() => JSON.parse(stats.slice(offset, stats.indexOf('\n', offset)))).not.toThrow()
        }
      }
    }
  })

  it('keeps independently deduplicated translated names for one refName', () => {
    const synthetic = path.join(temporary, 'synthetic')
    for (const language of languages) {
      fs.mkdirSync(path.join(synthetic, language), { recursive: true })
      fs.writeFileSync(path.join(synthetic, language, 'stats.ndjson'), '{"ref":"stat","matchers":[{"string":"text"}]}\n')
      fs.writeFileSync(path.join(synthetic, language, 'items.ndjson'), [
        { namespace: 'ITEM', name: '別名一', refName: 'Same reference' },
        { namespace: 'ITEM', name: '別名二', refName: 'Same reference' }
      ].map(item => JSON.stringify(item)).join('\n') + '\n')
    }
    makeIndexFiles(synthetic)
    expect(readIndex(path.join(synthetic, 'cmn-Hant/items-name.index.bin'))).toHaveLength(2)
    expect(readIndex(path.join(synthetic, 'cmn-Hant/items-ref.index.bin'))).toHaveLength(1)
  })

  it('keeps the direct CLI working outside the renderer directory', () => {
    const script = fileURLToPath(new URL('../../src/assets/make-index-files.mjs', import.meta.url))
    expect(() => execFileSync(process.execPath, [script], { cwd: temporary })).not.toThrow()
  })
})
