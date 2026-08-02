<template>
  <div v-if="!error" class="layout-column min-h-0" style="height: auto;">
    <div v-if="item.info.exchangeable" :class="$style.legacyMessage">
      {{ t(':legacy_bulk_xchg_msg') }}
    </div>
    <div class="mb-2 flex pl-2">
      <div class="flex items-baseline text-gray-500 mr-2">
        <span class="mr-1">{{ t(':matched') }}</span>
        <span v-if="!list" class="text-gray-600">...</span>
        <span v-else>{{ list.total }}{{ list.inexact ? '+' : '' }}</span>
      </div>
      <online-filter v-if="list" :by-time="true" :filters="filters" api="trade" />
      <div class="flex-1"></div>
      <button v-if="list && showMakeupToggle"
        class="rounded px-2 mr-1"
        :class="makeupView ? 'bg-gray-600 text-gray-200' : 'bg-gray-700 text-gray-400'"
        :title="t(':makeup_view_hint')"
        @click="makeupView = !makeupView"
      ><i class="fas fa-layer-group text-xs" /> {{ t(':makeup_view') }}</button>
      <trade-links v-if="list"
        :get-link="makeTradeLink" />
    </div>
    <div class="layout-column overflow-y-auto overflow-x-hidden">
      <table class="table-stripped w-full">
        <thead>
          <tr class="text-left">
            <th :class="$style.tableHeading">
              <div class="px-2">{{ t(':price') }}</div>
            </th>
            <th v-if="item.stackSize" :class="$style.tableHeading">
              <div class="px-2">{{ t(':stock') }}</div>
            </th>
            <th v-if="filters.itemLevel" :class="$style.tableHeading">
              <div class="px-2">{{ item.mercenary ? t('mercenary.level') : t(':item_level') }}</div>
            </th>
            <th v-if="item.category === 'Gem'" :class="$style.tableHeading">
              <div class="px-2">{{ t(':gem_level') }}</div>
            </th>
            <th v-if="filters.quality || item.category === 'Gem'" :class="$style.tableHeading">
              <div class="px-2">{{ t(':quality') }}</div>
            </th>
            <th :class="[$style.tableHeading, { 'w-full': !showSeller }]">
              <div class="pr-2 pl-4">
                <span class="ml-1" style="padding-left: 0.375rem;">{{ t(':listed') }}</span>
              </div>
            </th>
            <th v-if="showSeller" class="w-full" :class="$style.tableHeading">
              <div class="px-2">{{ t(':seller') }}</div>
            </th>
          </tr>
        </thead>
        <tbody style="overflow: scroll;">
          <template v-for="(result, idx) in groupedResults">
            <tr v-if="!result" :key="idx">
              <td colspan="100" class="text-transparent">***</td>
            </tr>
            <template v-else>
              <trade-item
                :key="result.id"
                :result="result"
                :show-stock="Boolean(item.stackSize)"
                :show-item-level="Boolean(filters.itemLevel)"
                :show-gem-level="item.category === 'Gem'"
                :show-quality="Boolean(filters.quality || item.category === 'Gem')"
                :show-seller="showSeller"
                :mercenary-expanded="expandedResultId === result.id"
                @toggle-mercenary="toggleMercenaryDetails(result)"
              />
              <tr v-if="expandedResultId === result.id" :key="`${result.id}-mercenary`">
                <td :id="`${result.id}-mercenary-details`" colspan="100" class="bg-gray-900 px-3 py-2">
                  <div v-for="skill in result.mercenarySkills" :key="skill.hash" class="mb-2 flex last:mb-0">
                    <img :src="skill.icon" class="mr-2 h-8 w-8 shrink-0" alt="">
                    <div class="min-w-0">
                      <div class="text-gray-200">{{ skill.name }}</div>
                      <div v-if="skill.supports?.length" class="flex flex-wrap gap-1 text-xs text-gray-400">
                        <span v-for="support in skill.supports" :key="support.hash"
                          class="rounded bg-gray-800 px-1">
                          {{ support.name }} <span class="text-gray-500">T{{ support.tier }}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </template>
          </template>
        </tbody>
      </table>
    </div>
  </div>
  <ui-error-box v-else>
    <template #name>{{ t(':error') }}</template>
    <p>Error: {{ error }}</p>
    <p v-if="canCreateTradeLink">{{ t('app.leagues_failed_help') }}</p>
    <template #actions>
      <button class="btn" @click="execSearch">{{ t('Retry') }}</button>
      <button v-if="canCreateTradeLink" class="btn" @click="openTradeLink">{{ t('Browser') }}</button>
    </template>
  </ui-error-box>
</template>

<script lang="ts">
import { defineComponent, computed, watch, PropType, inject, shallowReactive, shallowRef } from 'vue'
import { useI18nNs } from '@/web/i18n'
import UiErrorBox from '@/web/ui/UiErrorBox.vue'
import { requestTradeResultList, requestResults, createTradeRequest, PricingResult, SearchResult } from './pathofexile-trade'
import { makeupViewEnabled } from './trade-tooltip'
import { getTradeEndpoint } from './common'
import { AppConfig } from '@/web/Config'
import { PriceCheckWidget } from '@/web/overlay/interfaces'
import { ItemFilters, StatFilter } from '../filters/interfaces'
import { ParsedItem } from '@/parser'
import { artificialSlowdown } from './artificial-slowdown'
import OnlineFilter from './OnlineFilter.vue'
import TradeLinks from './TradeLinks.vue'
import TradeItem from './TradeItem.vue'
import { loadMercenaryTradeData, resolveMercenaryBuildTradeId } from './mercenary-trade-data'

const slowdown = artificialSlowdown(900)

const SHOW_RESULTS = 20
const API_FETCH_LIMIT = 100
const MIN_NOT_GROUPED = 7
const MIN_GROUPED = 10

function useTradeApi () {
  let searchId = 0
  const error = shallowRef<string | null>(null)
  const searchResult = shallowRef<SearchResult | null>(null)
  const fetchResults = shallowRef<PricingResult[]>([])

  const groupedResults = computed(() => {
    const out: Array<PricingResult & { listedTimes: number }> = []
    for (const result of fetchResults.value) {
      if (result == null) break
      if (out.length === 0 || result.hasFee || result.mercenarySkills) {
        out.push({ listedTimes: 1, ...result })
        continue
      }
      const existingRes = out.find((added, idx) =>
        (
          added.accountName === result.accountName &&
          added.priceCurrency === result.priceCurrency &&
          added.priceAmount === result.priceAmount
        ) ||
        (
          added.accountName === result.accountName &&
          (out.length - idx) <= 2 // last or prev
        )
      )
      if (existingRes) {
        if (existingRes.stackSize) {
          existingRes.stackSize += result.stackSize!
        } else {
          existingRes.listedTimes += 1
        }
      } else {
        out.push({ listedTimes: 1, ...result })
      }
    }
    return out
  })

  async function search (filters: ItemFilters, stats: StatFilter[]) {
    try {
      searchId += 1
      error.value = null
      searchResult.value = null
      const _fetchResults: PricingResult[] = shallowReactive([])
      fetchResults.value = _fetchResults

      const _searchId = searchId
      if (filters.mercenaryBuild && !filters.mercenaryBuild.disabled) {
        const mercenaryData = await loadMercenaryTradeData()
        if (!mercenaryData.builds.has(filters.mercenaryBuild.value)) {
          throw new Error(`Unknown Mercenary build: ${filters.mercenaryBuild.value}`)
        }
      }
      const request = createTradeRequest(filters, stats)
      const _searchResult = await requestTradeResultList(request, filters.trade.league)
      if (_searchId !== searchId) {
        return
      }
      searchResult.value = _searchResult

      // first two req are parallel, then sequential on demand
      {
        const r1 = (_searchResult.result.length > 0)
          ? requestResults(_searchResult.id, _searchResult.result.slice(0, 10), { accountName: AppConfig().accountName })
              .then(results => { _fetchResults.push(...results) })
          : Promise.resolve()
        const r2 = (_searchResult.result.length > 10)
          ? requestResults(_searchResult.id, _searchResult.result.slice(10, 20), { accountName: AppConfig().accountName })
              .then(results => r1
                .then(() => { _fetchResults.push(...results) }))
          : Promise.resolve()
        await Promise.all([r1, r2])
      }

      let fetched = 20
      async function fetchMore (): Promise<void> {
        if (_searchId !== searchId) return
        const totalGrouped = groupedResults.value.length
        const totalNotGrouped = groupedResults.value.reduce((len, res) =>
          res.listedTimes <= 2 ? len + 1 : len, 0)
        if (
          (totalNotGrouped < MIN_NOT_GROUPED || totalGrouped < MIN_GROUPED) &&
          fetched < _searchResult.result.length &&
          fetched < API_FETCH_LIMIT
        ) {
          await requestResults(_searchResult.id, _searchResult.result.slice(fetched, fetched + 10), { accountName: AppConfig().accountName })
            .then(results => { _fetchResults.push(...results) })
          fetched += 10
          return fetchMore()
        }
      }
      return fetchMore()
    } catch (err) {
      error.value = (err as Error).message
    }
  }

  return { error, searchResult, groupedResults, search }
}

export default defineComponent({
  components: { OnlineFilter, TradeLinks, TradeItem, UiErrorBox },
  emits: ['reset'],
  props: {
    filters: {
      type: Object as PropType<ItemFilters>,
      required: true
    },
    stats: {
      type: Array as PropType<StatFilter[]>,
      required: true
    },
    item: {
      type: Object as PropType<ParsedItem>,
      required: true
    }
  },
  setup (props, ctx) {
    const widget = computed(() => AppConfig<PriceCheckWidget>('price-check')!)

    watch(() => props.item, (item) => {
      slowdown.reset(item)
    }, { immediate: true })

    const { error, searchResult, groupedResults, search } = useTradeApi()
    const expandedResultId = shallowRef<string | null>(null)

    const showBrowser = inject<(url: string) => void>('builtin-browser')!
    const canCreateTradeLink = computed(() => {
      const build = props.filters.mercenaryBuild
      return !props.item.mercenary ||
        build?.disabled ||
        Boolean(build && resolveMercenaryBuildTradeId(build.value, build.infamous))
    })

    function makeTradeLink () {
      return (searchResult.value)
        ? `https://${getTradeEndpoint()}/trade/search/${props.filters.trade.league}/${searchResult.value.id}`
        : `https://${getTradeEndpoint()}/trade/search/${props.filters.trade.league}?q=${JSON.stringify(createTradeRequest(props.filters, props.stats))}`
    }

    const { t } = useI18nNs('trade_result')

    return {
      t,
      list: searchResult,
      expandedResultId,
      toggleMercenaryDetails (result: PricingResult) {
        if (!result.mercenarySkills?.length) return
        expandedResultId.value = expandedResultId.value === result.id ? null : result.id
      },
      groupedResults: computed(() => {
        if (!slowdown.isReady.value) {
          return Array<undefined>(SHOW_RESULTS)
        } else {
          return [
            ...groupedResults.value,
            ...(groupedResults.value.length < SHOW_RESULTS
              ? Array<undefined>(SHOW_RESULTS - groupedResults.value.length)
              : [])
          ]
        }
      }),
      execSearch: () => { search(props.filters, props.stats) },
      error,
      canCreateTradeLink,
      showSeller: computed(() => widget.value.showSeller),
      makeupView: makeupViewEnabled,
      showMakeupToggle: computed(() => widget.value.itemHoverTooltip !== 'off'),
      makeTradeLink,
      openTradeLink () {
        showBrowser(makeTradeLink())
        ctx.emit('reset')
      }
    }
  }
})
</script>

<style lang="postcss" module>
.tableHeading {
  @apply sticky top-0;
  @apply bg-gray-800;
  @apply p-0 m-0;
  white-space: nowrap;

  & > div {
    @apply border-b border-gray-700;
  }
}

.legacyMessage {
  @apply rounded p-2 mb-3;
  @apply border border-gray-600 bg-gray-700;
  text-wrap-style: balance;
  text-align: center;
}
</style>
