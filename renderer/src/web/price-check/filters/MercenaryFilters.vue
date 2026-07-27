<template>
  <div class="mb-3 rounded border border-gray-700 bg-gray-900 p-2">
    <div class="mb-2 text-gray-400">{{ t('mercenary.hidden_stats') }}</div>
    <div class="relative">
      <input
        v-model="query"
        class="w-full rounded bg-gray-800 px-2 py-1"
        :placeholder="t('mercenary.filter_placeholder')"
        @focus="showSuggestions = true"
        @blur="closeSuggestions"
        @keydown.enter.prevent="addFirstMatch">
      <div
        v-if="showSuggestions && query && matchingStats.length"
        class="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded border border-gray-600 bg-gray-800 shadow-lg">
        <button
          v-for="stat in matchingStats"
          :key="stat.id"
          type="button"
          class="flex w-full gap-2 px-2 py-1 text-left hover:bg-gray-700"
          @mousedown.prevent="addStat(stat)">
          <span class="w-14 shrink-0 text-xs uppercase text-gray-500">{{ t(`mercenary.${stat.kind}`) }}</span>
          <span>{{ stat.text }}</span>
        </button>
      </div>
    </div>
    <div v-if="loading" class="pt-2 text-gray-500">{{ t('mercenary.loading') }}</div>
    <div v-else-if="error" class="flex items-center gap-2 pt-2 text-red-400">
      <span>{{ t('mercenary.load_error', [error]) }}</span>
      <button type="button" class="btn" @click="loadOptions">{{ t('Retry') }}</button>
    </div>
    <div v-else-if="query && showSuggestions && !matchingStats.length" class="pt-2 text-gray-500">
      {{ t('mercenary.no_matches') }}
    </div>
    <div v-if="selectedStats.length" class="mt-2 flex flex-wrap gap-1">
      <button
        v-for="stat in selectedStats"
        :key="stat.tradeId[0]"
        type="button"
        class="rounded bg-gray-700 px-2 py-1 text-left text-gray-200 hover:bg-red-900"
        :title="t('mercenary.remove_filter')"
        @click="removeStat(stat)">
        <span class="mr-1 text-xs uppercase text-gray-400">{{ kindLabel(stat) }}</span>
        {{ stat.text }} <i class="fas fa-times ml-1 text-xs" />
      </button>
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, PropType, ref, shallowRef } from 'vue'
import { useI18n } from 'vue-i18n'
import { StatFilter, FilterTag } from './interfaces'
import {
  createMercenaryStatFilter,
  loadMercenaryTradeData,
  MercenaryTradeStat
} from '../trade/mercenary-trade-data'

export default defineComponent({
  name: 'MercenaryFilters',
  props: {
    stats: {
      type: Array as PropType<StatFilter[]>,
      required: true
    }
  },
  setup (props) {
    const query = ref('')
    const showSuggestions = ref(false)
    const loading = ref(true)
    const error = ref<string | null>(null)
    const availableStats = shallowRef<MercenaryTradeStat[]>([])

    function loadOptions () {
      loading.value = true
      error.value = null
      loadMercenaryTradeData()
        .then(data => { availableStats.value = data.stats })
        .catch(err => { error.value = (err as Error).message })
        .finally(() => { loading.value = false })
    }
    loadOptions()

    const selectedStats = computed(() => props.stats.filter(stat =>
      stat.tag === FilterTag.MercenarySkill ||
      stat.tag === FilterTag.MercenarySupport
    ))

    const matchingStats = computed(() => {
      const search = query.value.trim().toLocaleLowerCase()
      if (!search) return []
      const selectedIds = new Set(selectedStats.value.map(stat => stat.tradeId[0]))
      return availableStats.value
        .filter(stat => !selectedIds.has(stat.id) && stat.text.toLocaleLowerCase().includes(search))
        .slice(0, 12)
    })

    function addStat (stat: MercenaryTradeStat) {
      props.stats.push(createMercenaryStatFilter(stat))
      query.value = ''
      showSuggestions.value = false
    }

    function removeStat (stat: StatFilter) {
      const index = props.stats.indexOf(stat)
      if (index !== -1) props.stats.splice(index, 1)
    }

    const { t } = useI18n()
    return {
      t,
      query,
      showSuggestions,
      loading,
      error,
      loadOptions,
      selectedStats,
      matchingStats,
      addStat,
      removeStat,
      addFirstMatch () {
        if (matchingStats.value[0]) addStat(matchingStats.value[0])
      },
      closeSuggestions () {
        window.setTimeout(() => { showSuggestions.value = false }, 100)
      },
      kindLabel (stat: StatFilter) {
        return t(stat.tag === FilterTag.MercenarySkill
          ? 'mercenary.skill'
          : 'mercenary.support')
      }
    }
  }
})
</script>
