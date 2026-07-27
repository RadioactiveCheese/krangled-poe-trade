<template>
  <button :class="[$style.btn, { [$style.active]: isActive }]"
    :aria-pressed="controlled || !readonly ? isActive : undefined"
    @click="toggle"
  >
    <img v-if="img" :src="img" class="w-5 h-5">
    <span class="pl-1">{{ raw ? text : t(text) }}</span>
    <i v-if="collapse" class="pl-2 text-xs text-gray-400"
      :class="filter.disabled ? 'fas fa-chevron-down' : 'fas fa-chevron-up'" />
  </button>
</template>

<script setup lang="ts">
import { computed, type PropType } from 'vue'
import { useI18n } from 'vue-i18n'

const props = defineProps({
  filter: {
    type: Object as PropType<{ disabled: boolean }>, // will be mutated directly, instead of emit
    required: true
  },
  text: { type: String, required: true },
  raw: { type: Boolean, default: false },
  img: { type: String, default: undefined },
  readonly: { type: Boolean, default: undefined },
  controlled: { type: Boolean, default: false },
  active: { type: Boolean, default: undefined },
  collapse: { type: Boolean, default: undefined }
})

const emit = defineEmits<{
  (e: 'toggle'): void
}>()

const { t } = useI18n()
const isActive = computed(() => (props.active != null) ? props.active : !props.filter.disabled)

function toggle () {
  const { controlled, filter, readonly } = props
  if (controlled) {
    emit('toggle')
  } else if (!readonly) {
    filter.disabled = !filter.disabled
  }
}
</script>

<style lang="postcss" module>
.btn {
  @apply bg-gray-900 rounded;
  @apply border border-transparent;
  @apply pl-1 pr-2;
  line-height: 1.25rem;
  display: flex;
  align-items: center;

  &.active {
    @apply border-gray-500;
  }
}
</style>
