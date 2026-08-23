<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { useAppStore } from '../store/appStore'

const store = useAppStore()
const { t } = useI18n()
</script>

<template>
  <div class="toasts" aria-live="polite">
    <TransitionGroup name="toast">
      <div
        v-for="toast in store.toasts"
        :key="toast.id"
        class="toast card"
        :class="`toast-${toast.kind}`"
        role="status"
      >
        <span class="toast-dot" />
        <span class="toast-msg">{{ toast.message }}</span>
        <button
          class="toast-close"
          :aria-label="t('common.dismiss')"
          @click="store.dismissToast(toast.id)"
        >
          ×
        </button>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toasts {
  position: fixed;
  right: 14px;
  bottom: 52px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  pointer-events: none;
  max-width: min(380px, calc(100vw - 28px));
}

.toast {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 9px 10px;
  box-shadow: var(--shadow-2);
  pointer-events: auto;
  font-size: 12px;
  line-height: 1.45;
}

.toast-dot {
  flex: 0 0 auto;
  width: 7px;
  height: 7px;
  margin-top: 5px;
  border-radius: 50%;
  background: var(--accent);
}

.toast-error .toast-dot {
  background: var(--danger);
}

.toast-success .toast-dot {
  background: var(--success);
}

.toast-msg {
  color: var(--text-1);
  word-break: break-word;
}

.toast-close {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  padding: 0;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.toast-close:hover {
  color: var(--text-1);
  background: var(--bg-2);
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
