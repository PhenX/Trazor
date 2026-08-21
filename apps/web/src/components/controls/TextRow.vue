<script setup lang="ts">
import { computed } from 'vue'
import ControlRow from './ControlRow.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string
    defaultValue?: string
    hint?: string
    placeholder?: string
  }>(),
  { defaultValue: undefined, hint: undefined, placeholder: '' },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; reset: [] }>()

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
    <input
      class="field text"
      type="text"
      :value="modelValue"
      :placeholder="placeholder"
      :aria-label="label"
      @change="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
  </ControlRow>
</template>

<style scoped>
.text {
  flex: 1;
}
</style>
