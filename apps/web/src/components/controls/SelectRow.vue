<script setup lang="ts" generic="T extends string">
import { computed } from 'vue'
import ControlRow from './ControlRow.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: T
    options: ReadonlyArray<{ value: T; label: string }>
    defaultValue?: T
    hint?: string
    disabled?: boolean
  }>(),
  { defaultValue: undefined, hint: undefined, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: T]; reset: [] }>()

const modified = computed(
  () => props.defaultValue !== undefined && props.modelValue !== props.defaultValue,
)

function reset(): void {
  if (props.defaultValue !== undefined) emit('update:modelValue', props.defaultValue)
  emit('reset')
}
</script>

<template>
  <ControlRow :label="label" :hint="hint" :modified="modified" @reset="reset">
    <select
      class="field select"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="label"
      @change="emit('update:modelValue', ($event.target as HTMLSelectElement).value as T)"
    >
      <option v-for="opt in options" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
    </select>
  </ControlRow>
</template>

<style scoped>
.select {
  flex: 1;
}
</style>
