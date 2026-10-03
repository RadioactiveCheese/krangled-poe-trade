import { shallowRef, watch, readonly, computed } from 'vue'
import { createGlobalState } from '@vueuse/core'
import { Host } from '@/web/background/IPC'
import { useLeagues } from './Leagues'
import { splitJsonBlob, findDenseInfo, type PriceDatabase, type NinjaDenseInfo, type PriceDbQuery } from './split-poeninja-overviews'

const RETRY_INTERVAL_MS = 4 * 60 * 1000
const UPDATE_INTERVAL_MS = 31 * 60 * 1000
const INTEREST_SPAN_MS = 20 * 60 * 1000

export interface CurrencyValue {
  min: number
  max: number
  currency: 'chaos' | 'div'
}

export const usePoeninja = createGlobalState(() => {
  const leagues = useLeagues()

  const xchgRate = shallowRef<number | undefined>(undefined)

  const isLoading = shallowRef(false)
  let PRICES_DB: PriceDatabase = []
  // bumped whenever PRICES_DB is replaced, so consumers can recompute derived data
  const pricesVersion = shallowRef(0)

  // reading pricesVersion makes this re-evaluate after every (re)load
  const hasPrices = computed(() => pricesVersion.value > 0 && PRICES_DB.length > 0)

  // poe.ninja only tracks popular leagues on the GGG PC realm
  const isLeagueCovered = computed(() => {
    const league = leagues.selected.value
    return Boolean(league && league.isPopular && league.realm === 'pc-ggg')
  })
  let lastUpdateTime = 0
  let downloadController: AbortController | undefined
  let lastInterestTime = 0

  async function load (force: boolean = false) {
    const league = leagues.selected.value
    if (!league || !isLeagueCovered.value) return

    if (!force && (
      (Date.now() - lastUpdateTime) < UPDATE_INTERVAL_MS ||
      (Date.now() - lastInterestTime) > INTEREST_SPAN_MS
    )) return
    if (downloadController) downloadController.abort()

    try {
      isLoading.value = true
      downloadController = new AbortController()
      const response = await Host.proxy(`poe.ninja/poe1/api/economy/current/dense/overviews?league=${league.id}&language=en`, {
        signal: downloadController.signal
      })
      const jsonBlob = await response.text()

      PRICES_DB = splitJsonBlob(jsonBlob)
      pricesVersion.value++
      const divine = findPriceByQuery({ ns: 'ITEM', name: 'Divine Orb', variant: undefined })
      if (divine && divine.chaos >= 30) {
        xchgRate.value = divine.chaos
      }
      lastUpdateTime = Date.now()
    } finally {
      isLoading.value = false
    }
  }

  function queuePricesFetch () {
    lastInterestTime = Date.now()
    load()
  }

  function selectedLeagueToUrl (): string {
    const league = leagues.selectedId.value!
    switch (league) {
      case 'Standard': return 'standard'
      case 'Hardcore': return 'hardcore'
      default: {
        let ninjaId = league.replace('Hardcore ', '').toLowerCase()
        if (league.startsWith('Hardcore ')) {
          ninjaId += 'hc'
        }
        return ninjaId
      }
    }
  }

  function findPriceByQuery (query: PriceDbQuery) {
    const found = findDenseInfo(PRICES_DB, query)
    if (!found) return null

    return {
      ...found.info,
      url: `https://poe.ninja/poe1/economy/${selectedLeagueToUrl()}/${found.url}/${denseInfoToDetailsId(found.info)}`
    }
  }

  function autoCurrency (value: number | [number, number]): CurrencyValue {
    if (Array.isArray(value)) {
      if (value[1] > (xchgRate.value || 9999)) {
        return { min: chaosToStable(value[0]), max: chaosToStable(value[1]), currency: 'div' }
      }
      return { min: value[0], max: value[1], currency: 'chaos' }
    }
    if (value > ((xchgRate.value || 9999) * 0.94)) {
      if (value < ((xchgRate.value || 9999) * 1.06)) {
        return { min: 1, max: 1, currency: 'div' }
      } else {
        return { min: chaosToStable(value), max: chaosToStable(value), currency: 'div' }
      }
    }
    return { min: value, max: value, currency: 'chaos' }
  }

  function chaosToStable (count: number) {
    return count / (xchgRate.value || 9999)
  }

  setInterval(() => {
    load()
  }, RETRY_INTERVAL_MS)

  watch(leagues.selectedId, () => {
    xchgRate.value = undefined
    PRICES_DB = []
    pricesVersion.value++
    load(true)
  })

  return {
    xchgRate: readonly(xchgRate),
    findPriceByQuery,
    autoCurrency,
    queuePricesFetch,
    initialLoading: () => isLoading.value && !PRICES_DB.length,
    isLoading: readonly(isLoading),
    isLeagueCovered,
    pricesVersion: readonly(pricesVersion),
    hasPrices
  }
})

function denseInfoToDetailsId (info: NinjaDenseInfo): string {
  return ((info.variant) ? `${info.name}, ${info.variant}` : info.name)
    .normalize('NFKD')
    .replace(/[^a-zA-Z0-9:\- ]/g, '')
    .toLowerCase()
    .replace(/ /g, '-')
}

export function displayRounding (value: number, fraction: boolean = false): string {
  if (fraction && Math.abs(value) < 1) {
    if (value === 0) return '0'
    const r = `1\u200A/\u200A${displayRounding(1 / value)}`
    return r === '1\u200A/\u200A1' ? '1' : r
  }
  if (Math.abs(value) < 10) {
    return Number(value.toFixed(1)).toString().replace('.', '\u200A.\u200A')
  }
  return Math.round(value).toString()
}
