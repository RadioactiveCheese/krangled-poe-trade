// @ts-check

import fnv1a from '@sindresorhus/fnv1a'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const LANGUAGES = ['en', 'ru', 'cmn-Hant', 'ko']
const DEFAULT_DATA_ROOT = fileURLToPath(new URL('../../public/data/', import.meta.url))

/** @param {string} dataRoot */
export function makeIndexFiles (dataRoot = DEFAULT_DATA_ROOT) {
  /** @type {Map<string, Buffer>} */
  const snapshot = new Map()
  for (const lang of LANGUAGES) {
    const lineStarts = {
      /** @type{Array<{ hash: number, start: number }>} */
      statsByRef: [],
      /** @type{Array<{ hash: number, start: number }>} */
      matchers: []
    }

    {
      const ndjson = fs.readFileSync(path.join(dataRoot, lang, 'stats.ndjson'), { encoding: 'utf-8' })
      if (ndjson.length === 0) throw new Error(`Empty data source: ${lang}/stats.ndjson`)
      if (!ndjson.endsWith('\n')) throw new Error(`Missing final newline: ${lang}/stats.ndjson`)
      snapshot.set(`${lang}/stats.ndjson`, Buffer.from(ndjson))
      let start = 0
      while (start !== ndjson.length) {
        const end = ndjson.indexOf('\n', start)
        /** @type {import('./data/interfaces').StatOrGroup} */
        const statOrGroup = JSON.parse(ndjson.slice(start, end))
        const stats = ('stats' in statOrGroup) ? statOrGroup.stats : [statOrGroup]
        for (const stat of stats) {
          lineStarts.statsByRef.push({ start, hash: Number(fnv1a(stat.ref, { size: 32 })) })
          for (const matcher of stat.matchers) {
            if (matcher.advanced) {
              lineStarts.matchers.push({ start, hash: Number(fnv1a(matcher.advanced, { size: 32 })) })
            } else {
              lineStarts.matchers.push({ start, hash: Number(fnv1a(matcher.string, { size: 32 })) })
            }
          }
        }
        start = (end + 1)
      }
    }

    {
      const indexData = new Uint32Array(lineStarts.statsByRef.length * 2)
      lineStarts.statsByRef.sort((a, b) => a.hash - b.hash)
      for (let i = 0; i < lineStarts.statsByRef.length; i += 1) {
        indexData[i * 2 + 0] = lineStarts.statsByRef[i].hash
        indexData[i * 2 + 1] = lineStarts.statsByRef[i].start
      }
      fs.writeFileSync(
        path.join(dataRoot, lang, 'stats-ref.index.bin'),
        indexData
      )
    }

    {
      const indexData = new Uint32Array(lineStarts.matchers.length * 2)
      lineStarts.matchers.sort((a, b) => a.hash - b.hash)
      for (let i = 0; i < lineStarts.matchers.length; i += 1) {
        indexData[i * 2 + 0] = lineStarts.matchers[i].hash
        indexData[i * 2 + 1] = lineStarts.matchers[i].start
      }
      fs.writeFileSync(
        path.join(dataRoot, lang, 'stats-matcher.index.bin'),
        indexData
      )
    }
  }

  for (const lang of LANGUAGES) {
    /** @type{Array<{ hash: number, start: number }>} */
    let nameStarts
    /** @type{Array<{ hash: number, start: number }>} */
    let refNameStarts
    {
      const ndjson = fs.readFileSync(path.join(dataRoot, lang, 'items.ndjson'), { encoding: 'utf-8' })
      if (ndjson.length === 0) throw new Error(`Empty data source: ${lang}/items.ndjson`)
      if (!ndjson.endsWith('\n')) throw new Error(`Missing final newline: ${lang}/items.ndjson`)
      snapshot.set(`${lang}/items.ndjson`, Buffer.from(ndjson))
      let start = 0
      /** @type{Map<string, typeof nameStarts[number]>} */
      const startsByName = new Map()
      /** @type{Map<string, typeof refNameStarts[number]>} */
      const startsByRefName = new Map()
      while (start !== ndjson.length) {
        const end = ndjson.indexOf('\n', start)
        /** @type {import('./data/interfaces').BaseType} */
        const item = JSON.parse(ndjson.slice(start, end))
        const nameKey = `${item.namespace}::${item.name}`
        const refNameKey = `${item.namespace}::${item.refName}`
        if (!startsByName.has(nameKey)) {
          startsByName.set(nameKey, {
            hash: Number(fnv1a(nameKey, { size: 32 })),
            start: start
          })
        }
        if (!startsByRefName.has(refNameKey)) {
          startsByRefName.set(refNameKey, {
            hash: Number(fnv1a(refNameKey, { size: 32 })),
            start: start
          })
        }
        start = (end + 1)
      }
      nameStarts = Array.from(startsByName.values())
      refNameStarts = Array.from(startsByRefName.values())
    }

    {
      const indexData = new Uint32Array(nameStarts.length * 2)
      nameStarts.sort((a, b) => a.hash - b.hash)
      for (let i = 0; i < nameStarts.length; i += 1) {
        indexData[i * 2 + 0] = nameStarts[i].hash
        indexData[i * 2 + 1] = nameStarts[i].start
      }
      fs.writeFileSync(
        path.join(dataRoot, lang, 'items-name.index.bin'),
        indexData
      )
    }

    {
      const indexData = new Uint32Array(refNameStarts.length * 2)
      refNameStarts.sort((a, b) => a.hash - b.hash)
      for (let i = 0; i < refNameStarts.length; i += 1) {
        indexData[i * 2 + 0] = refNameStarts[i].hash
        indexData[i * 2 + 1] = refNameStarts[i].start
      }
      fs.writeFileSync(
        path.join(dataRoot, lang, 'items-ref.index.bin'),
        indexData
      )
    }
  }
  for (const lang of LANGUAGES) {
    for (const file of ['stats-ref', 'stats-matcher', 'items-name', 'items-ref']) {
      const relative = `${lang}/${file}.index.bin`
      snapshot.set(relative, fs.readFileSync(path.join(dataRoot, relative)))
    }
  }
  return snapshot
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  makeIndexFiles()
}
