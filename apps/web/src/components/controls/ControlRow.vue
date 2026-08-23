<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  label: string
  hint?: string
  /** Show the modified dot; double-clicking the label emits reset. */
  modified?: boolean
}>()

const emit = defineEmits<{ reset: [] }>()
const { t } = useI18n()
</script>

<template>
  <div class="control-row" :class="{ 'is-modified': modified }">
    <div class="control-label" :title="hint" @dblclick="emit('reset')">
      <span>{{ label }}</span>
      <button
        v-if="modified"
        class="reset-dot"
        :title="t('controls.resetTitle')"
        :aria-label="t('controls.resetAria')"
        @click="emit('reset')"
      />
    </div>
    <div class="control-body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.control-row {
  display: grid;
  grid-template-columns: 108px 1fr;
  align-items: center;
  gap: 8px;
  min-height: 26px;
  padding: 2px 0;
}

.control-label {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-2);
  font-size: 12px;
  cursor: default;
  user-select: none;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.is-modified .control-label {
  color: var(--text-1);
}

.reset-dot {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--accent);
  cursor: pointer;
}

.reset-dot:hover {
  transform: scale(1.4);
}

.control-body {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}
</style>
