<template>
  <Widget :config="config" move-handles="corners" :inline-edit="false">
    <div class="widget-default-style p-1 flex flex-col gap-1" style="width: 27rem;">
      <div class="flex items-center gap-2 px-1 pt-0.5 text-gray-100">
        <span class="shrink-0">{{ t(':name') }}</span>
        <input v-model="search" type="text" spellcheck="false"
          :placeholder="t(':filter')"
          class="rounded bg-gray-700 text-gray-100 px-2 py-0.5 flex-1 min-w-0">
        <div class="flex shrink-0 rounded bg-gray-900 text-sm" :title="t(':sort_hint')">
          <button v-for="key in (['ev', 'profit'] as const)" :key="key"
            :class="[$style.sortBtn, { [$style.sortActive]: sortBy === key }]"
            @click="config.sortBy = key">{{ t(key === 'ev' ? ':sort_ev' : ':sort_profit') }}</button>
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
            <div class="flex items-center gap-x-3 text-sm pl-1">
              <button class="flex items-center gap-1 rounded hover:bg-gray-700 px-1 -ml-1"
                :title="t(':ev_hint')" @click="toggle(row)">
                <i class="fas w-3 text-gray-500" :class="expanded === row.gem.refName ? 'fa-chevron-down' : 'fa-chevron-right'" />
                <span class="text-gray-400">{{ t(':ev') }}</span>
                <span v-if="row.evIncomplete" class="text-gray-400" :title="t(':ev_incomplete_hint')">&ge;</span>
                <span class="flex items-center" :class="row.ev >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ signed(row.ev) }}<img :src="fmt(Math.abs(row.ev)).icon" :class="$style.inlineIcon" alt="">
                </span>
                <i v-if="row.evIncomplete" class="fas fa-exclamation-triangle text-yellow-500"
                  :title="t(':ev_incomplete_hint')" />
              </button>
              <span class="flex items-center gap-1" :title="t(':profit_hint')">
                <span class="text-gray-400">{{ t(':profit_if') }}</span>
                <span class="flex items-center" :class="row.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ signed(row.profit) }}<img :src="fmt(Math.abs(row.profit)).icon" :class="$style.inlineIcon" alt="">
                </span>
                <span class="text-gray-400">({{ formatPercent(row.margin) }}, {{ row.ratio.toFixed(1) }}&times;)</span>
              </span>
            </div>
            <div v-if="expanded === row.gem.refName" :class="$style.breakdown">
              <div v-for="o in row.outcomes" :key="o.id" class="contents">
                <span class="text-gray-300">{{ outcomeLabel(row, o) }}</span>
                <span class="text-right text-gray-400">{{ formatChance(o.chance) }}</span>
                <span class="flex items-center justify-end gap-1">
                  <template v-if="o.status === 'priced'">
                    <span v-if="o.capped" class="text-gray-500"
                      :title="t(':capped_hint', [fmt(o.listedPrice!).text])">{{ t(':capped') }}</span>
                    {{ fmt(o.value).text }}<img :src="fmt(o.value).icon" :class="$style.inlineIcon" alt="">
                  </template>
                  <span v-else-if="o.status === 'not-listed'" class="text-gray-500"
                    :title="t(':not_listed_hint')">{{ t(':not_listed') }}</span>
                  <span v-else-if="o.status === 'outlier'" class="text-yellow-500"
                    :title="t(':outlier_hint', [fmt(o.listedPrice!).text])">{{ t(':outlier') }}</span>
                  <span v-else class="text-yellow-500" :title="t(':missing_hint')">{{ t(':missing') }}</span>
                </span>
              </div>
              <div class="contents text-gray-400">
                <span>{{ t(':ev_costs') }}</span>
                <span />
                <span class="flex items-center justify-end">
                  &minus;{{ fmt(row.buyCost + row.vaalOrbPrice).text }}<img
                    :src="fmt(row.buyCost + row.vaalOrbPrice).icon" :class="$style.inlineIcon" alt="">
                </span>
              </div>
              <div class="col-span-3 border-t border-gray-700 mt-0.5 pt-0.5 text-gray-300">
                {{ t(':attempts_summary', [attempts]) }}
                <div class="grid gap-x-3" style="grid-template-columns: 1fr auto;">
                  <span class="text-gray-400">{{ t(':attempts_level_up') }}</span>
                  <span class="text-right">{{ formatChance(chanceOfLevelUp(attempts)) }}</span>
                  <span class="text-gray-400">{{ t(':attempts_profit') }}</span>
                  <span class="text-right">{{ row.evIncomplete ? '≥ ' : '' }}{{ formatChance(expandedProfitChance ?? 0) }}</span>
                  <span class="text-gray-400">{{ t(':attempts_average') }}</span>
                  <span class="flex items-center justify-end" :class="row.ev >= 0 ? 'text-green-400' : 'text-red-400'">
                    {{ row.evIncomplete ? '≥ ' : '' }}{{ signed(row.ev * attempts) }}<img
                      :src="fmt(Math.abs(row.ev * attempts)).icon" :class="$style.inlineIcon" alt="">
                  </span>
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
import type { WidgetSpec } from '../overlay/interfaces.js'

export default {
  widget: {
    type: 'gem-corruption',
    instances: 'multi',
    trNameKey: 'gem_corruption.name'
  } satisfies WidgetSpec
}
</script>

<script setup lang="ts">
import { inject, computed, shallowRef, watch } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { usePoeninja, displayRounding } from '@/web/background/Prices'
import { Host } from '@/web/background/IPC'
import { ITEM_BY_REF, ITEMS_ITERATOR } from '@/assets/data'
import type { ParsedItem } from '@/parser'
import type { WidgetManager } from '../overlay/interfaces.js'
import { GEM_CORRUPTION_DEFAULTS, type GemCorruptionWidget } from './widget.js'
import {
  evaluateGems, filterRows, sortRows, buyItem, buyQuality, sellItem, chanceOfLevelUp, chanceOfProfit,
  MAX_ATTEMPTS, type GemFlipRow, type OutcomeValue
} from './calc'

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
  findPriceByQuery, autoCurrency, queuePricesFetch,
  isLoading, isLeagueCovered, hasPrices, pricesVersion
} = usePoeninja()

const isShown = computed(() => props.config.wmWants === 'show')

// Widgets stay mounted while hidden, so register interest in prices whenever it's opened.
watch(isShown, (shown) => {
  if (shown) queuePricesFetch()
}, { immediate: true })

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
const expanded = shallowRef<string | null>(null)

const sortBy = computed(() => props.config.sortBy ?? GEM_CORRUPTION_DEFAULTS.sortBy)
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

function toggle (row: GemFlipRow) {
  expanded.value = (expanded.value === row.gem.refName) ? null : row.gem.refName
}

// only worked out for the open breakdown
const expandedProfitChance = computed(() => {
  const row = rows.value.find(r => r.gem.refName === expanded.value)
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
  switch (o.id) {
    case 'unchanged': return t(':outcome_unchanged')
    case 'vaal': return o.vaalName ? t(':outcome_vaal', [o.vaalName]) : t(':outcome_vaal_none')
    case 'level-up': return t(':outcome_level', [`${row.buyLevel + 1}`])
    case 'level-down': return t(':outcome_level', [`${row.buyLevel - 1}`])
    case 'quality-23': return t(':outcome_quality', ['23%'])
    case 'quality-21-22': return t(':outcome_quality', ['21–22%'])
    case 'quality-16-19': return t(':outcome_quality', ['16–19%'])
    case 'quality-10-15': return t(':outcome_quality', ['10–15%'])
  }
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
  @apply rounded bg-gray-900 px-2 py-1 text-sm;
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
