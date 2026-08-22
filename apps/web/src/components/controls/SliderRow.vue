<script setup lang="ts">
import { computed } from 'vue'
import ControlRow from './ControlRow.vue'

const props = withDefaults(
  defineProps<{
    label: string
    modelValue: number
    min: number
    max: number
    step?: number
    /** DEFAULT_SETTINGS value — drives the modified dot + reset. */
    defaultValue?: number
    hint?: string
    disabled?: boolean
    /** Extra readout, e.g. "0 = original size" shown when value === 0. */
    zeroLabel?: string
  }>(),
  { step: 1, defaultValue: undefined, hint: undefined, disabled: false, zeroLabel: undefined },
)

const emit = defineEmits<{ 'update:modelValue': [value: number]; reset: [] }>()

const modified = computed(
  () => props.defaultValue !== undefined && props.modelValue !== props.defaultValue,
)

const fillPercent = computed(() => {
  const span = props.max - props.min
  if (span <= 0) return 0
  return ((props.modelValue - props.min) / span) * 100
})

const decimals = computed(() => {
  const s = String(props.step)
  const dot = s.indexOf('.')
  return dot === -1 ? 0 : s.length - dot - 1
})

const display = computed(() => props.modelValue.toFixed(decimals.value))

function commit(raw: string): void {
  const v = Number.parseFloat(raw)
  if (Number.isFinite(v)) emit('update:modelValue', v)
}

function reset(): void {
  if (props.defaultValue !== undefined) emit('update:modelValue', props.defaultValue)
  emit('reset')
}
</script>

<template>
  <ControlRow :label="label" :hint="hint" :modified="modified" @reset="reset">
    <input
      type="range"
      :value="modelValue"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="label"
      :style="{ '--range-fill': `${fillPercent}%` }"
      @input="commit(($event.target as HTMLInputElement).value)"
    />
    <input
      class="field num"
      type="number"
      :value="display"
      :min="min"
      :max="max"
      :step="step"
      :disabled="disabled"
      :aria-label="`${label} (numeric)`"
      @change="commit(($event.target as HTMLInputElement).value)"
    />
    <span v-if="zeroLabel && modelValue === 0" class="zero-note">{{ zeroLabel }}</span>
  </ControlRow>
</template>

<style scoped>
.num {
  width: 52px;
  flex: 0 0 auto;
  padding: 0 4px;
  text-align: right;
  font-variant-numeric: tabular-nums;
  -moz-appearance: textfield;
  appearance: textfield;
}

.num::-webkit-outer-spin-button,
.num::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}

.zero-note {
  flex: 0 0 auto;
  font-size: 10px;
  color: var(--text-3);
  white-space: nowrap;
}

input[type='range'] {
  flex: 1;
  min-width: 40px;
}
</style>
