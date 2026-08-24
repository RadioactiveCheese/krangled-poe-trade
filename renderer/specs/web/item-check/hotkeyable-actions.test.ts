// @vitest-environment happy-dom

import { beforeEach, describe, expect, it, vi } from 'vitest'

const config = vi.hoisted(() => ({
  language: 'en'
}))

vi.mock('@/web/background/IPC', () => ({
  Host: {
    onEvent: vi.fn(),
    sendEvent: vi.fn()
  }
}))

vi.mock('@/web/Config', () => ({
  AppConfig: () => config
}))

vi.mock('@/parser', async (importOriginal) => ({
  ...await importOriginal<typeof import('@/parser')>(),
  parseClipboard: vi.fn()
}))

import { ItemCategory } from '@/parser'
import { openPoedb, openPoedbMods } from '@/web/item-check/hotkeyable-actions'

function parsedItem (refName: string): Parameters<typeof openPoedb>[0] {
  return { info: { refName } } as Parameters<typeof openPoedb>[0]
}

describe('openPoedb', () => {
  beforeEach(() => {
    config.language = 'en'
    vi.restoreAllMocks()
  })

  it.each([
    ['en', 'Twilight Regalia', 'https://poedb.tw/us/Twilight_Regalia'],
    ['ru', 'Divine Orb', 'https://poedb.tw/ru/Divine_Orb'],
    ['cmn-Hant', 'Orb of Scouring', 'https://poedb.tw/tw/Orb_of_Scouring'],
    ['ko', 'Quicksilver Flask', 'https://poedb.tw/kr/Quicksilver_Flask'],
    ['en', "Kaom's Heart", 'https://poedb.tw/us/Kaoms_Heart'],
    ['en', 'Blueprint: Bunker', 'https://poedb.tw/us/Blueprint%3A_Bunker'],
    ['en', 'Mjölner', 'https://poedb.tw/us/Mj%C3%B6lner']
  ] as const)('opens %s PoEDB item paths for %s', (language, refName, expectedUrl) => {
    config.language = language
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)

    openPoedb(parsedItem(refName))

    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith(expectedUrl)
  })
})

describe('openPoedbMods', () => {
  beforeEach(() => {
    config.language = 'en'
    vi.restoreAllMocks()
  })

  it('opens the base modifier pool for a normal item', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const twilightRegalia = {
      category: ItemCategory.BodyArmour,
      armourES: 301,
      info: { refName: 'Twilight Regalia' }
    } as Parameters<typeof openPoedbMods>[0]

    openPoedbMods(twilightRegalia)

    expect(open).toHaveBeenCalledWith('https://poedb.tw/us/Body_Armours_int')
  })

  it('opens an identified unique item page', () => {
    const open = vi.spyOn(window, 'open').mockImplementation(() => null)
    const shavronnesWrappings = {
      category: ItemCategory.BodyArmour,
      armourES: 350,
      info: {
        refName: "Shavronne's Wrappings",
        unique: { base: "Occultist's Vestment" }
      }
    } as Parameters<typeof openPoedbMods>[0]

    openPoedbMods(shavronnesWrappings)

    expect(open).toHaveBeenCalledWith('https://poedb.tw/us/Shavronnes_Wrappings')
  })
})
