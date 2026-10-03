<template>
  <Widget :config="config" move-handles="corners" :inline-edit="false">
    <div class="widget-default-style p-1 flex flex-col gap-1" style="width: 25rem;">
      <div class="flex items-center gap-2 px-1 pt-0.5 text-gray-100">
        <span class="shrink-0">{{ t(':name') }}</span>
        <input v-model="search" type="text" spellcheck="false"
          :placeholder="t(':filter')"
          class="rounded bg-gray-700 text-gray-100 px-2 py-0.5 flex-1 min-w-0">
      </div>
      <div v-if="status" :class="$style.message">
        <i v-if="status.spin" class="fas fa-dna fa-spin pr-1" />
        <i v-else class="fas fa-info-circle pr-1" />
        {{ t(status.key) }}
      </div>
      <template v-else>
        <div class="flex flex-col gap-1">
          <div v-for="row in pageRows" :key="row.gem.refName" :class="$style.row">
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
              <div class="flex items-center gap-1 text-sm" :title="t(':profit_hint')">
                <span class="text-gray-500">{{ t(':profit_if') }}</span>
                <span class="flex items-center" :class="row.profit >= 0 ? 'text-green-400' : 'text-red-400'">
                  {{ row.profit >= 0 ? '+' : '−' }}{{ fmt(Math.abs(row.profit)).text }}<img
                    :src="fmt(Math.abs(row.profit)).icon" :class="$style.inlineIcon" alt="">
                </span>
                <span class="text-gray-400">({{ formatPercent(row.margin) }}, {{ row.ratio.toFixed(1) }}&times;)</span>
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
import { inject, computed, shallowRef, watch, onUnmounted } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { usePoeninja, displayRounding } from '@/web/background/Prices'
import { Host } from '@/web/background/IPC'
import { ITEM_BY_REF, ITEMS_ITERATOR } from '@/assets/data'
import type { ParsedItem } from '@/parser'
import type { WidgetManager } from '../overlay/interfaces.js'
import { GEM_CORRUPTION_DEFAULTS, type GemCorruptionWidget } from './widget.js'
import { evaluateGems, filterRows, buyItem, buyQuality, sellItem, type GemFlipRow } from './calc'

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

// Widgets stay mounted while hidden, and blur hides this one without changing wmWants.
// Price interest lapses after 20 minutes but a refresh needs 31, so keep renewing it
// while the widget is actually on screen.
const INTEREST_RENEW_MS = 5 * 60 * 1000
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

// Evaluating every gem takes a few thousand lookups, so only do it while the widget is
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

const rows = computed(() => filterRows(evaluation.value?.rows ?? [], {
  includeTransfigured: props.config.includeTransfigured ?? GEM_CORRUPTION_DEFAULTS.includeTransfigured,
  includeAwakened: props.config.includeAwakened ?? GEM_CORRUPTION_DEFAULTS.includeAwakened,
  includeUnconfirmed: props.config.includeUnconfirmed ?? GEM_CORRUPTION_DEFAULTS.includeUnconfirmed,
  minRatio: props.config.minRatio ?? GEM_CORRUPTION_DEFAULTS.minRatio,
  search: search.value
}))

const totalPages = computed(() => Math.max(1, Math.ceil(rows.value.length / PAGE_SIZE)))
const currentPage = computed(() => Math.min(page.value, totalPages.value - 1))
const pageRows = computed(() => {
  const start = currentPage.value * PAGE_SIZE
  return rows.value.slice(start, start + PAGE_SIZE)
})

watch(search, () => { page.value = 0 })

function fmt (chaos: number) {
  const value = autoCurrency(chaos)
  return {
    text: displayRounding(value.min),
    icon: (value.currency === 'div') ? '/images/divine.png' : '/images/chaos.png'
  }
}

function formatPercent (ratio: number) {
  return `${ratio >= 0 ? '+' : '−'}${Math.round(Math.abs(ratio) * 100)}%`
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
  align-items: center;
  gap: theme('spacing.2');
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
