<script setup lang="ts">
import { computed } from 'vue'
import ControlRow from './ControlRow.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: string
    defaultValue?: string
    hint?: string
    disabled?: boolean
  }>(),
  { defaultValue: undefined, hint: undefined, disabled: false },
)

const emit = defineEmits<{ 'update:modelValue': [value: string]; reset: [] }>()

const modified = computed(
  () =>
    props.defaultValue !== undefined &&
    props.modelValue.toLowerCase() !== props.defaultValue.toLowerCase(),
)

function commitText(raw: string): void {
  const v = raw.trim().toLowerCase()
  if (/^#?[0-9a-f]{6}$/.test(v)) emit('update:modelValue', v.startsWith('#') ? v : `#${v}`)
}

function reset(): void {
  if (props.defaultValue !== undefined) emit('update:modelValue', props.defaultValue)
  emit('reset')
}
</script>

<template>
  <ControlRow :label="label" :hint="hint" :modified="modified" @reset="reset">
    <input
      class="swatch"
      type="color"
      :value="modelValue"
      :disabled="disabled"
      :aria-label="`${label} color picker`"
      @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    />
    <input
      class="field hex mono"
      type="text"
      :value="modelValue"
      :disabled="disabled"
      spellcheck="false"
      :aria-label="`${label} hex value`"
      @change="commitText(($event.target as HTMLInputElement).value)"
    />
  </ControlRow>
</template>

<style scoped>
.swatch {
  width: 26px;
  height: 26px;
  padding: 2px;
  flex: 0 0 auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-0);
  cursor: pointer;
}

.swatch::-webkit-color-swatch-wrapper {
  padding: 0;
}

.swatch::-webkit-color-swatch {
  border: none;
  border-radius: 3px;
}

.swatch::-moz-color-swatch {
  border: none;
  border-radius: 3px;
}

.hex {
  width: 76px;
  flex: 0 0 auto;
}
</style>
