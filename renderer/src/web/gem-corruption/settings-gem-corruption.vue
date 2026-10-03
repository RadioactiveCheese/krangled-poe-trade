<template>
  <div v-if="widget" class="flex flex-col gap-3 p-2 max-w-md">
    <ui-toggle v-model="widget.includeTransfigured">{{ t(':transfigured') }}</ui-toggle>
    <ui-toggle v-model="widget.includeAwakened">{{ t(':awakened') }}</ui-toggle>
    <div>
      <ui-toggle v-model="widget.includeUnconfirmed">{{ t(':unconfirmed') }}</ui-toggle>
      <div class="text-gray-500 text-sm pl-5">{{ t(':unconfirmed_hint') }}</div>
    </div>
    <label class="flex flex-col gap-1">
      <span>{{ t(':min_ratio') }}: {{ minRatio > 0 ? `${minRatio}×` : t(':min_ratio_off') }}</span>
      <input v-model.number="minRatio" type="range" min="0" max="20" step="0.5"
        :class="$style.slider" :style="{ '--fill': `${(minRatio / 20) * 100}%` }">
      <span class="text-gray-500 text-sm">{{ t(':min_ratio_hint') }}</span>
    </label>
    <div class="text-gray-500 text-sm">{{ t(':profit_hint') }}</div>
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

import UiToggle from '@/web/ui/UiToggle.vue'

const props = defineProps(configProp<GemCorruptionWidget>())
const { t } = useI18nNs('gem_corruption')

const widget = computed(() => props.configWidget)

const minRatio = computed<number>({
  get () {
    return widget.value?.minRatio ?? GEM_CORRUPTION_DEFAULTS.minRatio
  },
  set (value) {
    if (widget.value) widget.value.minRatio = value
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
