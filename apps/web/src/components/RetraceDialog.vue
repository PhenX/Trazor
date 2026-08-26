<script setup lang="ts">
import { onBeforeUnmount, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../store/appStore'

/**
 * Confirmation shown when a re-trace is about to run while the user has removed
 * color layers. A re-trace rebuilds the geometry from scratch, so those edits
 * would be lost — confirm discards them and re-traces; cancel keeps the current
 * result untouched.
 */

const store = useAppStore()
const { t } = useI18n()

function onKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    event.preventDefault()
    store.cancelRetrace()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="rt-backdrop" @click.self="store.cancelRetrace()">
    <div class="rt-modal card" role="alertdialog" aria-modal="true" aria-labelledby="rt-title">
      <h2 id="rt-title" class="rt-title">{{ t('retrace.title') }}</h2>
      <p class="rt-body">
        {{ t('retrace.body', { count: store.removedLayers.length }, store.removedLayers.length) }}
      </p>
      <div class="rt-actions">
        <button class="btn btn-ghost" @click="store.cancelRetrace()">
          {{ t('retrace.cancel') }}
        </button>
        <button class="btn btn-primary" @click="store.confirmRetrace()">
          {{ t('retrace.confirm') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rt-backdrop {
  position: fixed;
  inset: 0;
  z-index: 210;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
}

.rt-modal {
  width: 100%;
  max-width: 380px;
  padding: 20px;
  box-shadow: var(--shadow-2);
}

.rt-title {
  margin: 0 0 8px;
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}

.rt-body {
  margin: 0 0 18px;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text-2);
}

.rt-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
