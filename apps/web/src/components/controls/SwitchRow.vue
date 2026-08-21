<script setup lang="ts">
import { computed } from 'vue'
import ControlRow from './ControlRow.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: boolean
    defaultValue?: boolean
    hint?: string
    disabled?: boolean
  }>(),
  { defaultValue: undefined, hint: undefined, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: boolean]; reset: [] }>()

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
    <button
      class="switch"
      role="switch"
      :aria-checked="modelValue"
      :aria-label="label"
      :disabled="disabled"
      @click="emit('update:modelValue', !modelValue)"
    />
  </ControlRow>
</template>

<style scoped>
button:disabled {
  opacity: 0.4;
  cursor: default;
}
</style>
