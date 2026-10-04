<template>
  <Widget :config="config" move-handles="corners" :inline-edit="false">
    <div class="widget-default-style p-1 flex flex-col gap-1" style="width: 27rem;">
      <div class="flex items-center gap-2 px-1 pt-0.5 text-gray-100">
        <span class="shrink-0">{{ t(':name') }}</span>
        <input v-model="search" type="text" spellcheck="false"
          :placeholder="t(':filter')"
          class="rounded bg-gray-700 text-gray-100 px-2 py-0.5 flex-1 min-w-0">
        <div class="flex shrink-0 rounded bg-gray-900 text-sm" :title="t(':sort_hint')">
          <button v-for="key in sortKeys" :key="key"
            :class="[$style.sortBtn, { [$style.sortActive]: sortBy === key }]"
            @click="config.sortBy = key">{{ t(SORT_LABEL[key]) }}</button>
        </div>
      </div>
      <div v-if="status" :class="$style.message">
        <i v-if="status.spin" class="fas fa-dna fa-spin pr-1" />
        <i v-else class="fas fa-info-circle pr-1" />
        {{ t(status.key) }}
      </div>
      <template v-else>
        <div class="flex flex-col gap-1">
          <div v-for="row in pageRows" :key="row.gem.refName" :class="$style.row">
            <div class="flex items-center gap-2">
              <img :src="row.gem.icon" :class="$style.icon" alt="">
              <div class="flex flex-col flex-1 min-w-0 gap-0.5">
                <div class="flex items-center gap-1 text-gray-100">
                  <span class="truncate">{{ row.gem.name }}</span>
                  <span v-if="row.unconfirmed" :class="$style.tag"
                    :title="t(':unconfirmed_hint')">{{ t(':unconfirmed_tag') }}</span>
                </div>
                <div class="flex gap-1">
                  <button :class="$style.priceBtn" :title="t(':buy_hint')" @click="openBuy(row, $event)">
                    <span :class="$style.priceLabel">
                      {{ t(':buy') }} · {{ row.buyLevel }}/{{ row.buyRoute === 'gemcutter' ? 0 : 20 }}
                      <template v-if="row.buyRoute === 'gemcutter'">
                        + 20<img v-if="gemcutterIcon" :src="gemcutterIcon" :class="$style.inlineIcon"
                          :title="t(':via_gemcutter_hint')" alt="">
                      </template>
                    </span>
                    <span :class="$style.priceValue">
                      {{ fmt(row.buyCost).text }}<img :src="fmt(row.buyCost).icon" :class="$style.currencyIcon" alt="">
                    </span>
                  </button>
                  <button :class="$style.priceBtn" :title="t(':sell_hint')" @click="openSell(row, $event)">
                    <span :class="$style.priceLabel">{{ t(':sell') }} · {{ row.sellLevel }}/20c</span>
                    <span :class="$style.priceValue">
                      {{ fmt(row.sellPrice).text }}<img :src="fmt(row.sellPrice).icon" :class="$style.currencyIcon" alt="">
                    </span>
                  </button>
                </div>
              </div>
            </div>
            <div class="flex flex-col gap-0.5 text-sm pl-1">
              <div class="flex items-center gap-x-3">
                <button v-for="kind in evKinds" :key="kind"
                  class="flex items-center gap-1 rounded hover:bg-gray-700 px-1 -ml-1"
                  :title="t(kind === 'single' ? ':ev_hint' : ':double_ev_hint')" @click="toggle(row, kind)">
                  <i class="fas w-3 text-gray-500" :class="isExpanded(row, kind) ? 'fa-chevron-down' : 'fa-chevron-right'" />
                  <span class="text-gray-400">{{ t(kind === 'single' ? ':ev' : ':double_ev') }}</span>
                  <span class="flex items-center" :class="evOf(row, kind).ev >= 0 ? 'text-green-400' : 'text-red-400'">
                    {{ signed(evOf(row, kind).ev) }}<img :src="fmt(Math.abs(evOf(row, kind).ev)).icon" :class="$style.inlineIcon" alt="">
                  </span>
                  <i v-if="evOf(row, kind).aboveCap" class="fas fa-flag text-orange-400"
                    :title="t(':above_cap_hint')" />
                  <i v-if="evOf(row, kind).incomplete" class="fas fa-exclamation-triangle text-yellow-500"
                    :title="t(':ev_incomplete_hint')" />
                </button>
              </div>
              <span class="flex items-center gap-1" :title="t(':profit_hint')">
                <span class="text-gray-400">{{ t(':profit_if') }}</span>
                <span class="flex items-center" :class="row.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ signed(row.profit) }}<img :src="fmt(Math.abs(row.profit)).icon" :class="$style.inlineIcon" alt="">
                </span>
                <span class="text-gray-400">({{ formatPercent(row.margin) }}, {{ row.ratio.toFixed(1) }}&times;)</span>
              </span>
            </div>
            <div v-for="kind in evKinds.filter(k => isExpanded(row, k))" :key="kind" :class="$style.breakdown">
              <div class="col-span-3 text-gray-300">{{ t(kind === 'single' ? ':breakdown_single' : ':breakdown_double') }}</div>
              <div v-for="o in evOf(row, kind).outcomes" :key="o.id" class="contents">
                <span class="text-gray-300">{{ outcomeLabel(row, o) }}</span>
                <span class="text-right text-gray-400">{{ formatChance(o.chance) }}</span>
                <span class="flex items-center justify-end gap-1">
                  <template v-if="o.status === 'priced'">
                    <span v-if="o.capped" class="text-gray-500"
                      :title="t(':capped_hint', [fmt(o.listedPrice!).text])">{{ t(':capped') }}</span>
                    <i v-if="o.aboveCap" class="fas fa-flag text-orange-400"
                      :title="t(':above_cap_outcome_hint', [fmt(o.listedPrice!).text])" />
                    <span :class="{ 'text-orange-400': o.aboveCap }">{{ fmt(o.value).text }}</span><img :src="fmt(o.value).icon" :class="$style.inlineIcon" alt="">
                  </template>
                  <span v-else-if="o.status === 'not-listed'" class="text-gray-500"
                    :title="t(':not_listed_hint')">{{ t(':not_listed') }}</span>
                  <span v-else-if="o.status === 'outlier'" class="text-yellow-500"
                    :title="t(':outlier_hint', [fmt(o.listedPrice!).text])">{{ t(':outlier') }}</span>
                  <span v-else class="text-yellow-500" :title="t(':missing_hint')">{{ t(':missing') }}</span>
                </span>
              </div>
              <div class="contents text-gray-400">
                <span>{{ t(kind === 'single' ? ':ev_costs' : ':double_costs') }}</span>
                <span />
                <span class="flex items-center justify-end">
                  &minus;{{ fmt(evOf(row, kind).cost).text }}<img
                    :src="fmt(evOf(row, kind).cost).icon" :class="$style.inlineIcon" alt="">
                </span>
              </div>
              <div v-if="kind === 'double' && row.doubleCost === undefined" class="col-span-3 text-yellow-500">
                {{ t(':double_no_temple_price') }}
              </div>
              <div v-if="evOf(row, kind).aboveCap" class="col-span-3 flex items-center gap-1 text-orange-400">
                <i class="fas fa-flag" /> {{ t(':ev_without_above_cap') }}
                <span class="ml-auto flex items-center" :class="evOf(row, kind).evWithoutAboveCap >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ signed(evOf(row, kind).evWithoutAboveCap) }}<img
                    :src="fmt(Math.abs(evOf(row, kind).evWithoutAboveCap)).icon" :class="$style.inlineIcon" alt="">
                </span>
              </div>
              <div v-if="kind === 'single'" class="col-span-3 border-t border-gray-700 mt-0.5 pt-0.5 text-gray-300">
                {{ t(':attempts_summary', [attempts]) }}
                <div class="grid gap-x-3" style="grid-template-columns: 1fr auto;">
                  <span class="text-gray-400">{{ t(':attempts_level_up') }}</span>
                  <span class="text-right">{{ formatChance(chanceOfLevelUp(attempts)) }}</span>
                  <span class="text-gray-400">{{ t(':attempts_profit') }}</span>
                  <span class="text-right">{{ formatChance(expandedProfitChance ?? 0) }}</span>
                  <span class="text-gray-400">{{ t(':attempts_average') }}</span>
                  <span class="flex items-center justify-end" :class="row.ev >= 0 ? 'text-green-400' : 'text-red-400'">
                    {{ signed(row.ev * attempts) }}<img
                      :src="fmt(Math.abs(row.ev * attempts)).icon" :class="$style.inlineIcon" alt="">
                  </span>
                </div>
              </div>
              <div v-else class="col-span-3 border-t border-gray-700 mt-0.5 pt-0.5 grid gap-x-3" style="grid-template-columns: 1fr auto;">
                <span class="text-gray-400">{{ t(':double_level_up') }}</span>
                <span class="text-right">{{ formatChance(DOUBLE_LEVEL_UP_CHANCE) }}</span>
              </div>
              <div v-if="evOf(row, kind).incomplete" class="col-span-3 text-yellow-500 pt-0.5">
                <i class="fas fa-exclamation-triangle" /> {{ t(':ev_incomplete_note') }}
              </div>
              <div v-if="kind === 'double'" class="col-span-3 text-gray-500 pt-0.5">{{ t(':double_model_note') }}</div>
              <div v-if="kind === 'single'" class="col-span-3 border-t border-gray-700 mt-0.5 pt-1">
                <div class="flex items-center gap-2">
                  <button class="rounded px-2 py-0.5 bg-gray-700 text-gray-100 hover:bg-gray-600 disabled:opacity-50"
                    :disabled="validation(row)?.running" :title="t(':validate_hint', [REQUESTS_PER_VALIDATION])"
                    @click="runValidation(row)">
                    <i class="fas" :class="validation(row)?.running ? 'fa-spinner fa-spin' : 'fa-search-dollar'" />
                    {{ t(validation(row)?.result ? ':validate_again' : ':validate') }}
                  </button>
                  <span v-if="validation(row)?.running" class="text-gray-400">{{ validation(row)!.progress }}</span>
                  <span v-else-if="validation(row)?.result" class="text-gray-500">
                    {{ t(':validated_at', [formatTime(validation(row)!.result!.at)]) }}
                  </span>
                </div>
                <div v-if="validation(row)?.error" class="text-red-400 pt-0.5">{{ validation(row)!.error }}</div>
                <div v-if="validation(row)?.result" :class="$style.validation">
                  <span class="text-gray-500">{{ t(':validate_item') }}</span>
                  <span class="text-gray-500 text-right">{{ t(':validate_trade') }}</span>
                  <span class="text-gray-500 text-right">{{ t(':validate_ninja') }}</span>
                  <template v-for="line in validationLines(row, validation(row)!.result!)" :key="line.key">
                    <span class="text-gray-300">{{ line.label }}</span>
                    <span class="flex items-center justify-end gap-1" :class="line.check.mismatch ? 'text-orange-400' : 'text-gray-100'"
                      :title="line.check.mismatch ? t(':validate_mismatch') : undefined">
                      <i v-if="line.check.mismatch" class="fas fa-not-equal" />
                      <template v-if="line.check.trade !== undefined">
                        {{ fmt(line.check.trade).text }}<img :src="fmt(line.check.trade).icon" :class="$style.inlineIcon" alt="">
                      </template>
                      <span v-else class="text-gray-500">{{ t(':validate_none') }}</span>
                    </span>
                    <span class="flex items-center justify-end gap-1 text-gray-400">
                      <template v-if="line.check.ninja !== undefined">
                        {{ fmt(line.check.ninja).text }}<img :src="fmt(line.check.ninja).icon" :class="$style.inlineIcon" alt="">
                      </template>
                      <template v-else>&ndash;</template>
                    </span>
                  </template>
                </div>
                <div v-if="validation(row)?.result" class="text-gray-500 pt-0.5">
                  {{ t(':validate_totals', [validation(row)!.result!.buy.total, validation(row)!.result!.sell.total]) }}
                  <template v-if="validation(row)!.result!.unconverted">
                    {{ t(':validate_unconverted', [validation(row)!.result!.unconverted]) }}
                  </template>
                  {{ t(':validate_scope') }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="!rows.length" :class="$style.message">{{ t(':no_matches') }}</div>
        </div>
        <div v-if="totalPages > 1" class="flex items-center justify-center gap-x-3 pb-0.5">
          <button :class="$style.pageBtn" :disabled="currentPage === 0" @click="page = currentPage - 1">
            <i class="fas fa-chevron-left" />
          </button>
          <span class="text-gray-400">{{ currentPage + 1 }} / {{ totalPages }}</span>
          <button :class="$style.pageBtn" :disabled="currentPage >= totalPages - 1" @click="page = currentPage + 1">
            <i class="fas fa-chevron-right" />
          </button>
        </div>
      </template>
    </div>
  </Widget>
</template>

<script lang="ts">
import { reactive } from 'vue'
import type { WidgetSpec } from '../overlay/interfaces.js'

export default {
  widget: {
    type: 'gem-corruption',
    instances: 'multi',
    trNameKey: 'gem_corruption.name'
  } satisfies WidgetSpec
}

interface ValidationState {
  running: boolean
  progress: string
  result?: import('./validate').ValidationResult
  error?: string
}

// Validations are kept for the session, shared by every gem corruption widget. A deep
// reactive Map: Map.set stores the raw object, so entries are only reactive when read back.
const validations = reactive(new Map<string, ValidationState>())
</script>

<script setup lang="ts">
import { inject, computed, shallowRef, watch, onUnmounted } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { usePoeninja, displayRounding } from '@/web/background/Prices'
import { useLeagues } from '@/web/background/Leagues'
import { Host } from '@/web/background/IPC'
import { AppConfig } from '@/web/Config'
import { ITEM_BY_REF, ITEMS_ITERATOR } from '@/assets/data'
import type { ParsedItem } from '@/parser'
import type { WidgetManager, PriceCheckWidget } from '../overlay/interfaces.js'
import { GEM_CORRUPTION_DEFAULTS, type GemCorruptionWidget } from './widget.js'
import {
  evaluateGems, filterRows, sortRows, buyItem, buyQuality, sellItem, chanceOfLevelUp, chanceOfProfit,
  isQualityIrrelevant, MAX_ATTEMPTS, DOUBLE_LEVEL_UP_CHANCE, type GemFlipRow, type OutcomeValue, type SortKey
} from './calc'
import {
  validateRow, appTradeClient, currencyToChaos, REQUESTS_PER_VALIDATION,
  type ValidationResult, type PriceCheck
} from './validate'

import Widget from '../overlay/Widget.vue'

const PAGE_SIZE = 5

const props = defineProps<{
  config: GemCorruptionWidget
}>()

const wm = inject<WidgetManager>('wm')!

if (props.config.wmFlags[0] === 'uninitialized') {
  props.config.wmFlags = ['invisible-on-blur']
  props.config.wmTitle = '{icon=fa-skull-crossbones}'
  props.config.anchor = {
    pos: 'tl',
    x: (Math.random() * (40 - 20) + 20),
    y: (Math.random() * (40 - 20) + 20)
  }
  Object.assign(props.config, GEM_CORRUPTION_DEFAULTS)
  wm.show(props.config.wmId)
}

const { t } = useI18nNs('gem_corruption')
const {
  findPriceByQuery, autoCurrency, queuePricesFetch, xchgRate,
  isLoading, isLeagueCovered, hasPrices, pricesVersion
} = usePoeninja()
const leagues = useLeagues()

const isShown = computed(() => props.config.wmWants === 'show')

// Widgets stay mounted while hidden, and blur hides this one without changing wmWants.
// Price interest lapses after 20 minutes but a refresh needs 31, so keep renewing it
// while the widget is actually on screen.
// 6 ticks = 31m06s, just past poe.ninja's 31 minute refresh interval.
const INTEREST_RENEW_MS = (5 * 60 + 11) * 1000
const isOnScreen = computed(() => isShown.value && wm.active.value)
let interestTimer: ReturnType<typeof setInterval> | undefined
watch(isOnScreen, (onScreen) => {
  clearInterval(interestTimer)
  interestTimer = undefined
  if (onScreen) {
    queuePricesFetch()
    interestTimer = setInterval(queuePricesFetch, INTEREST_RENEW_MS)
  }
}, { immediate: true })
onUnmounted(() => clearInterval(interestTimer))

// Evaluating every gem takes several thousand lookups, so only do it while the widget is
// visible and once per poe.ninja download.
const evaluation = shallowRef<ReturnType<typeof evaluateGems> | null>(null)
let evaluatedVersion = -1
watch([isShown, pricesVersion, hasPrices], () => {
  if (!hasPrices.value) {
    evaluation.value = null
    evaluatedVersion = -1
    return
  }
  if (!isShown.value || evaluatedVersion === pricesVersion.value) return
  evaluatedVersion = pricesVersion.value
  evaluation.value = evaluateGems(ITEMS_ITERATOR('"namespace":"GEM"'), findPriceByQuery)
}, { immediate: true })

const status = computed<{ key: string, spin?: boolean } | null>(() => {
  if (!isLeagueCovered.value) return { key: ':no_league' }
  if (!evaluation.value) {
    return (isLoading.value)
      ? { key: ':loading', spin: true }
      : { key: ':not_loaded' }
  }
  if (evaluation.value.currency.vaalOrb === undefined) return { key: ':no_vaal_orb' }
  return null
})

const gemcutterIcon = computed(() => ITEM_BY_REF('ITEM', "Gemcutter's Prism")?.[0]?.icon)

const search = shallowRef('')
const page = shallowRef(0)
const expanded = shallowRef<{ name: string, kind: 'single' | 'double' } | null>(null)

const showDouble = computed(() => props.config.showDouble ?? GEM_CORRUPTION_DEFAULTS.showDouble)
// a hidden double EV can't be the sort key
const sortBy = computed<SortKey>(() => {
  const key = props.config.sortBy ?? GEM_CORRUPTION_DEFAULTS.sortBy
  return (key === 'double' && !showDouble.value) ? 'ev' : key
})
const attempts = computed(() =>
  Math.min(MAX_ATTEMPTS, Math.max(1, Math.round(props.config.attempts ?? GEM_CORRUPTION_DEFAULTS.attempts))))

const sorted = computed(() => sortRows(evaluation.value?.rows ?? [], sortBy.value))

const rows = computed(() => filterRows(sorted.value, {
  includeTransfigured: props.config.includeTransfigured ?? GEM_CORRUPTION_DEFAULTS.includeTransfigured,
  includeAwakened: props.config.includeAwakened ?? GEM_CORRUPTION_DEFAULTS.includeAwakened,
  includeUnconfirmed: props.config.includeUnconfirmed ?? GEM_CORRUPTION_DEFAULTS.includeUnconfirmed,
  minRatio: props.config.minRatio ?? GEM_CORRUPTION_DEFAULTS.minRatio,
  hideNegativeEv: props.config.hideNegativeEv ?? GEM_CORRUPTION_DEFAULTS.hideNegativeEv,
  search: search.value
}))

const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, totalPages.value - 1))
const pageRows = computed(() => {
  const start = currentPage.value * PAGE_SIZE
  return rows.value.slice(start, start + PAGE_SIZE)
})

watch([search, sortBy], () => { page.value = 0 })

type EvKind = 'single' | 'double'

const evKinds = computed<EvKind[]>(() => showDouble.value ? ['single', 'double'] : ['single'])
const sortKeys = computed<SortKey[]>(() => showDouble.value ? ['ev', 'double', 'profit'] : ['ev', 'profit'])
const SORT_LABEL: Record<SortKey, string> = { ev: ':sort_ev', double: ':sort_double', profit: ':sort_profit' }

function toggle (row: GemFlipRow, kind: EvKind) {
  expanded.value = isExpanded(row, kind) ? null : { name: row.gem.refName, kind }
}

function isExpanded (row: GemFlipRow, kind: EvKind) {
  return expanded.value?.name === row.gem.refName && expanded.value.kind === kind
}

function evOf (row: GemFlipRow, kind: EvKind) {
  return (kind === 'single')
    ? {
        ev: row.ev,
        outcomes: row.outcomes,
        incomplete: row.evIncomplete,
        aboveCap: row.evAboveCap,
        evWithoutAboveCap: row.evWithoutAboveCap,
        cost: row.buyCost + row.vaalOrbPrice
      }
    : {
        ev: row.doubleEv,
        outcomes: row.doubleOutcomes,
        incomplete: row.doubleEvIncomplete,
        aboveCap: row.doubleEvAboveCap,
        evWithoutAboveCap: row.doubleEvWithoutAboveCap,
        cost: row.buyCost + (row.doubleCost ?? 0)
      }
}

// only worked out for the open breakdown
const expandedProfitChance = computed(() => {
  if (expanded.value?.kind !== 'single') return undefined
  const row = rows.value.find(r => r.gem.refName === expanded.value!.name)
  if (!row) return undefined
  return chanceOfProfit(row.outcomes, row.buyCost + row.vaalOrbPrice, attempts.value)
})

function fmt (chaos: number) {
  const value = autoCurrency(chaos)
  return {
    text: displayRounding(value.min),
    icon: (value.currency === 'div') ? '/images/divine.png' : '/images/chaos.png'
  }
}

function signed (chaos: number) {
  return `${chaos >= 0 ? '+' : '−'}${fmt(Math.abs(chaos)).text}`
}

function formatPercent (ratio: number) {
  return `${ratio >= 0 ? '+' : '−'}${Math.round(Math.abs(ratio) * 100)}%`
}

function formatChance (p: number) {
  // one decimal, without a trailing ".0": 25%, 12.5%, 2.5%
  return `${Number((p * 100).toFixed(1))}%`
}

function outcomeLabel (row: GemFlipRow, o: OutcomeValue) {
  const parts: string[] = []
  // gems without a Vaal version have their Vaal results folded into the others
  if (o.vaalName) parts.push(t(':outcome_vaal', [o.vaalName]))
  if (o.levelDelta !== 0) {
    parts.push(t(o.pricedAsLevel1 ? ':outcome_level_as_1' : ':outcome_level', [`${row.buyLevel + o.levelDelta}`]))
  }
  if (o.qualityRange !== '20') parts.push(t(':outcome_quality', [`${o.qualityRange.replace('-', '–')}%`]))
  return parts.length ? parts.join(', ') : t(':outcome_unchanged')
}

// --- Validate prices: one click = one validation, through the app's rate-limited trade code
function validationKey (row: GemFlipRow) {
  return `${leagues.selectedId.value ?? ''}|${row.gem.refName}`
}

function validation (row: GemFlipRow) {
  return validations.get(validationKey(row))
}

function formatTime (at: number) {
  return new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

async function runValidation (row: GemFlipRow) {
  const key = validationKey(row)
  if (validations.get(key)?.running) return
  const league = leagues.selectedId.value
  if (!league) return
  const prev = validations.get(key)
  validations.set(key, { running: true, progress: t(':validate_buy'), result: prev?.result })
  const state = validations.get(key)!

  const priceCheck = AppConfig<PriceCheckWidget>('price-check')!
  const toChaos = currencyToChaos(
    xchgRate.value,
    tag => ITEMS_ITERATOR(`"tradeTag":"${tag}"`).next().value?.refName,
    name => findPriceByQuery({ ns: 'ITEM', name, variant: undefined })?.chaos
  )
  try {
    state.result = await validateRow(row, {
      league,
      merchantOnly: priceCheck.merchantOnly,
      currency: priceCheck.defaultCurrency,
      collapseListings: priceCheck.collapseListings,
      useEn: AppConfig().useIntlSite
    }, {
      client: appTradeClient(AppConfig().accountName),
      toChaos,
      onProgress: (step, wait) => {
        state.progress = (step === 'waiting')
          ? t(':validate_waiting', [wait ?? 0])
          : t(step === 'buy' ? ':validate_buy' : ':validate_sell')
      }
    })
    state.error = undefined
  } catch (e) {
    state.error = t(':validate_error', [(e as Error).message])
  } finally {
    state.running = false
  }
}

function validationLines (row: GemFlipRow, res: ValidationResult) {
  const lines: Array<{ key: string, label: string, check: PriceCheck }> = [
    { key: 'buy20', label: t(':validate_buy_full', [`${row.buyLevel}/20`]), check: res.buy.fullQuality }
  ]
  if (!isQualityIrrelevant(row.gem)) {
    lines.push({ key: 'buyGcp', label: t(':validate_buy_prisms', [`${row.buyLevel}`]), check: res.buy.viaPrisms })
    lines.push({ key: 'sell20', label: `${row.sellLevel}/20c`, check: res.sell.quality20 })
    lines.push({ key: 'sell23', label: `${row.sellLevel}/23c`, check: res.sell.quality23 })
    lines.push({ key: 'sellLow', label: `${row.sellLevel}c (<16%)`, check: res.sell.lowQuality })
  } else {
    lines.push({ key: 'sell20', label: `${row.sellLevel}c`, check: res.sell.quality20 })
  }
  return lines
}

function openBuy (row: GemFlipRow, e: MouseEvent) {
  dispatchPriceCheck(buyItem(row.gem, buyQuality(row)), e)
}

function openSell (row: GemFlipRow, e: MouseEvent) {
  dispatchPriceCheck(sellItem(row.gem), e)
}

function dispatchPriceCheck (item: ParsedItem, e: MouseEvent) {
  Host.selfDispatch({
    name: 'MAIN->CLIENT::item-text',
    payload: {
      clipboard: item.rawText,
      item,
      position: { x: e.clientX, y: e.clientY },
      focusOverlay: true,
      target: 'price-check'
    }
  })
}
</script>

<style lang="postcss" module>
.row {
  display: flex;
  flex-direction: column;
  gap: theme('spacing.1');
  padding: theme('spacing.1') theme('spacing.2');
  @apply rounded bg-gray-800;

  & .icon {
    flex-shrink: 0;
    object-fit: contain;
    width: 2.75rem;
    height: 2.75rem;
  }
}

.tag {
  @apply rounded px-1 text-sm text-gray-400 bg-gray-900;
  flex-shrink: 0;
  cursor: help;
}

.sortBtn {
  @apply rounded px-2 py-0.5 text-gray-400;

  &:hover {
    @apply text-gray-100;
  }
}

.sortActive {
  @apply bg-gray-700 text-gray-100;
}

.priceBtn {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  text-align: left;
  @apply rounded px-2 py-0.5 bg-gray-900 text-gray-100;

  &:hover {
    @apply bg-gray-700;
  }
}

.priceLabel {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  white-space: nowrap;
  @apply text-sm text-gray-400;
}

.priceValue {
  display: flex;
  align-items: center;
  gap: theme('spacing.1');
  white-space: nowrap;
}

.breakdown {
  display: grid;
  grid-template-columns: 1fr auto auto;
  column-gap: theme('spacing.3');
  /* the double-corruption list is long; keep the widget on screen */
  max-height: 22rem;
  overflow-y: auto;
  @apply rounded bg-gray-900 px-2 py-1 text-sm;
}

.validation {
  display: grid;
  grid-template-columns: 1fr auto auto;
  column-gap: theme('spacing.3');
  @apply pt-1;
}

.currencyIcon {
  width: theme('spacing.5');
  height: theme('spacing.5');
}

.inlineIcon {
  display: inline-block;
  width: theme('spacing.4');
  height: theme('spacing.4');
}

.message {
  text-align: center;
  padding: theme('spacing.6') theme('spacing.4');
  @apply text-gray-400;
}

.pageBtn {
  @apply rounded px-3 py-0.5 text-gray-300 bg-gray-800;

  &:hover:not(:disabled) {
    @apply bg-gray-700;
  }

  &:disabled {
    @apply text-gray-600 bg-transparent;
  }
}
</style>
