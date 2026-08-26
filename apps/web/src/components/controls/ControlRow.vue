<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{
  label: string
  hint?: string
  /** Show the modified dot; double-clicking the label emits reset. */
  modified?: boolean
  /** Optional short pill after the label (e.g. "Beta"). */
  badge?: string
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
      <span v-if="badge" class="control-badge">{{ badge }}</span>
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

.control-badge {
  flex: 0 0 auto;
  padding: 0 5px;
  border-radius: 999px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
  color: var(--accent);
  font-size: 9.5px;
  font-weight: 650;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  line-height: 15px;
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
