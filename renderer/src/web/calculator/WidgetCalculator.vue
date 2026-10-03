<template>
  <Widget :config="config" move-handles="corners" :inline-edit="false">
    <div class="widget-default-style p-1 flex flex-col gap-1" style="min-width: 15rem;">
      <div class="text-gray-100 p-1 flex items-center justify-between gap-4">
        <span>{{ t('calculator.name') }}</span>
        <span v-if="stableOrbCost" class="flex items-center gap-1">
          <img src="/images/divine.png" class="w-5 h-5"> = {{ stableOrbCost }}
          <img src="/images/chaos.png" class="w-5 h-5">
        </span>
        <i v-else-if="xchgRateLoading()" class="fas fa-dna fa-spin px-2" />
      </div>
      <input v-model="expression" type="text" spellcheck="false"
        :placeholder="t('calculator.input')"
        class="rounded bg-gray-800 text-gray-100 p-1 px-2 font-mono">
      <div v-if="error === 'no-rate'" class="text-orange-400 p-1 text-center">{{ t('calculator.no_rate') }}</div>
      <div v-else class="flex flex-col gap-1 text-gray-100" :class="{ 'opacity-50': error === 'invalid' }">
        <div v-if="split" class="flex items-center justify-center gap-1 rounded bg-gray-800 p-1 text-xl">
          <span v-if="split.negative">&minus;</span>
          {{ split.divine }}<img src="/images/divine.png" class="w-7 h-7">
          {{ split.chaos }}<img src="/images/chaos.png" class="w-7 h-7">
        </div>
        <div class="grid gap-1" style="grid-template-columns: 1fr auto 1fr;">
          <div class="flex items-center justify-end gap-1 rounded bg-gray-800 p-1">
            <template v-if="xchgRate">{{ formatNumber(lastValue / xchgRate, 2) }}</template>
            <template v-else>&ndash;</template>
            <img src="/images/divine.png" class="w-6 h-6">
          </div>
          <div class="flex items-center px-1"><i class="fas fa-equals" /></div>
          <div class="flex items-center gap-1 rounded bg-gray-800 p-1">
            {{ formatNumber(lastValue, 0) }}<img src="/images/chaos.png" class="w-6 h-6">
          </div>
        </div>
      </div>
    </div>
  </Widget>
</template>

<script lang="ts">
import type { WidgetSpec } from '../overlay/interfaces.js'

export default {
  widget: {
    type: 'calculator',
    instances: 'multi',
    trNameKey: 'calculator.name'
  } satisfies WidgetSpec
}
</script>

<script setup lang="ts">
import { inject, computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { usePoeninja } from '@/web/background/Prices'
import type { WidgetManager } from '../overlay/interfaces.js'
import type { CalculatorWidget } from './widget.js'
import { evaluate, splitChaos } from './expression'

import Widget from '../overlay/Widget.vue'

const props = defineProps<{
  config: CalculatorWidget
}>()

const wm = inject<WidgetManager>('wm')!

if (props.config.wmFlags[0] === 'uninitialized') {
  props.config.wmFlags = ['invisible-on-blur']
  props.config.wmTitle = '{icon=fa-calculator}'
  props.config.anchor = {
    pos: 'tl',
    x: (Math.random() * (40 - 20) + 20),
    y: (Math.random() * (40 - 20) + 20)
  }
  wm.show(props.config.wmId)
}

const { xchgRate, initialLoading: xchgRateLoading, queuePricesFetch } = usePoeninja()
queuePricesFetch()

const stableOrbCost = computed(() => (xchgRate.value) ? Math.round(xchgRate.value) : null)

const expression = ref('')
const result = computed(() => evaluate(expression.value, xchgRate.value))
const error = computed(() => result.value.ok ? undefined : result.value.reason)

// Keep showing the last valid value while the user is mid-edit.
const lastValue = ref(0)
watch(result, (res) => {
  if (res.ok) lastValue.value = res.chaos
}, { immediate: true })

const split = computed(() => (xchgRate.value)
  ? splitChaos(lastValue.value, xchgRate.value)
  : undefined)

function formatNumber (value: number, digits: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: digits })
}

const { t } = useI18n()
</script>
