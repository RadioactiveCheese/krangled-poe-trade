<template>
  <div v-if="widget" class="flex flex-col gap-3 p-2 max-w-md">
    <ui-toggle v-model="widget.includeTransfigured">{{ t(':transfigured') }}</ui-toggle>
    <ui-toggle v-model="widget.includeAwakened">{{ t(':awakened') }}</ui-toggle>
    <div>
      <ui-toggle v-model="widget.includeUnconfirmed">{{ t(':unconfirmed') }}</ui-toggle>
      <div class="text-gray-500 text-sm pl-5">{{ t(':unconfirmed_hint') }}</div>
    </div>
    <div>
      <ui-toggle v-model="hideNegativeEv">{{ t(':hide_negative_ev') }}</ui-toggle>
    </div>
    <div>
      <ui-toggle v-model="showDouble">{{ t(':show_double') }}</ui-toggle>
      <div class="text-gray-500 text-sm pl-5">{{ t(':double_ev_hint') }}</div>
    </div>
    <div class="flex items-center gap-2">
      <span>{{ t(':sort_by') }}</span>
      <div class="flex rounded bg-gray-900">
        <button v-for="key in sortKeys" :key="key"
          class="rounded px-2" :class="sortBy === key ? 'bg-gray-700 text-gray-100' : 'text-gray-400'"
          @click="sortBy = key">{{ t(SORT_LABEL[key]) }}</button>
      </div>
    </div>
    <label class="flex flex-col gap-1">
      <span class="flex items-center gap-2">
        {{ t(':attempts') }}
        <input v-model.number="attempts" type="number" min="1" :max="MAX_ATTEMPTS" step="1"
          class="rounded bg-gray-700 text-gray-100 px-1 w-16">
      </span>
      <span class="text-gray-500 text-sm">{{ t(':attempts_hint', [MAX_ATTEMPTS]) }}</span>
    </label>
    <label class="flex flex-col gap-1">
      <span>{{ t(':min_ratio') }}: {{ minRatio > 0 ? `${minRatio}×` : t(':min_ratio_off') }}</span>
      <input v-model.number="minRatio" type="range" min="0" max="20" step="0.5"
        :class="$style.slider" :style="{ '--fill': `${(minRatio / 20) * 100}%` }">
      <span class="text-gray-500 text-sm">{{ t(':min_ratio_hint') }}</span>
    </label>
    <div class="text-gray-500 text-sm">{{ t(':ev_hint') }}</div>
    <div class="text-gray-500 text-sm">{{ t(':profit_hint') }}</div>
    <div class="text-gray-500 text-sm">{{ t(':odds_hint') }}</div>
    <div class="text-gray-500 text-sm">{{ t(':double_model_note') }}</div>
  </div>
</template>

<script lang="ts">
export default {
  name: 'gem_corruption.name'
}
</script>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18nNs } from '@/web/i18n'
import { configProp } from '../settings/utils.js'
import { GEM_CORRUPTION_DEFAULTS, type GemCorruptionWidget } from './widget.js'
import { MAX_ATTEMPTS, type SortKey } from './calc.js'

import UiToggle from '@/web/ui/UiToggle.vue'

const props = defineProps(configProp<GemCorruptionWidget>())
const { t } = useI18nNs('gem_corruption')

const widget = computed(() => props.configWidget)

// Widgets created before a setting existed don't have it, so read through the defaults.
function setting<K extends keyof typeof GEM_CORRUPTION_DEFAULTS> (key: K) {
  return computed<GemCorruptionWidget[K]>({
    get () {
      return widget.value?.[key] ?? GEM_CORRUPTION_DEFAULTS[key]
    },
    set (value) {
      if (widget.value) widget.value[key] = value
    }
  })
}

const minRatio = setting('minRatio')
const hideNegativeEv = setting('hideNegativeEv')
const sortBy = setting('sortBy')
const showDouble = setting('showDouble')
const sortKeys = computed<SortKey[]>(() => showDouble.value ? ['ev', 'double', 'profit'] : ['ev', 'profit'])
const SORT_LABEL: Record<SortKey, string> = { ev: ':sort_ev_long', double: ':sort_double_long', profit: ':sort_profit_long' }
const attemptsSetting = setting('attempts')
const attempts = computed<number>({
  get: () => attemptsSetting.value,
  set (value) {
    if (Number.isFinite(value)) attemptsSetting.value = Math.min(MAX_ATTEMPTS, Math.max(1, Math.round(value)))
  }
})
</script>

<style lang="postcss" module>
.slider {
  appearance: none;
  width: 100%;
  height: theme('spacing.1');
  @apply rounded;
  background: linear-gradient(to right, theme('colors.gray.300') var(--fill, 0%), theme('colors.gray.700') var(--fill, 0%));
  cursor: pointer;

  &::-webkit-slider-thumb {
    appearance: none;
    width: theme('spacing.3');
    height: theme('spacing.3');
    border-radius: 9999px;
    @apply bg-gray-300;
  }

  &:hover::-webkit-slider-thumb {
    @apply bg-gray-100;
  }
}
</style>
