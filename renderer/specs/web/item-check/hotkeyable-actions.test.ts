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

vi.mock('@/parser', () => ({
  parseClipboard: vi.fn()
}))

import { openPoedb } from '@/web/item-check/hotkeyable-actions'

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
