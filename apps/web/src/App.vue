<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import AppHeader from './components/AppHeader.vue'
import DropZone from './components/DropZone.vue'
import PreviewViewport from './components/PreviewViewport.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import StatsBar from './components/StatsBar.vue'
import ToastHost from './components/ToastHost.vue'
import { downloadSvg } from './lib/download'
import { useAppStore } from './store/appStore'

const store = useAppStore()
const viewport = ref<InstanceType<typeof PreviewViewport> | null>(null)
const dropZone = ref<InstanceType<typeof DropZone> | null>(null)

// Reflect the theme on <html> so the token overrides in base.css apply.
watchEffect(() => {
  document.documentElement.dataset.theme = store.theme
  document.documentElement.style.background = ''
})

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    target.closest('input, textarea, select, [contenteditable]') !== null
  )
}

function onKeyDown(event: KeyboardEvent): void {
  const meta = event.metaKey || event.ctrlKey

  if (meta && event.key.toLowerCase() === 'o') {
    event.preventDefault()
    dropZone.value?.openPicker()
    return
  }
  if (meta && event.key.toLowerCase() === 's') {
    event.preventDefault()
    if (store.result) downloadSvg(store.result.svg, store.exportName)
    return
  }
  if (meta) return
  if (isTypingTarget(event.target)) return

  if (store.magicActive) {
    if (event.key === 'Enter') {
      event.preventDefault()
      void store.applyMagicSelect()
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      store.cancelMagicSelect()
      return
    }
    if (event.key === 'Backspace') {
      event.preventDefault()
      store.undoMagicPoint()
      return
    }
  }

  switch (event.key) {
    case '1':
      viewport.value?.setView('split')
      break
    case '2':
      viewport.value?.setView('result')
      break
    case '3':
      viewport.value?.setView('original')
      break
    case '4':
      viewport.value?.setView('diff')
      break
    case 'f':
    case 'F':
      viewport.value?.fit()
      break
    case '0':
      viewport.value?.zoom100()
      break
    default:
      break
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
})
</script>

<template>
  <div class="app">
    <AppHeader />
    <div class="body">
      <SettingsPanel />
      <main class="main">
        <PreviewViewport ref="viewport" />
        <StatsBar />
      </main>
      <DropZone ref="dropZone" />
    </div>
    <ToastHost />
  </div>
</template>

<style scoped>
.app {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--bg-0);
  color: var(--text-1);
}

.body {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
}

.main {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
}
</style>
