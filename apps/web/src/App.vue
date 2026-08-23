<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watchEffect } from 'vue'
import AppHeader from './components/AppHeader.vue'
import DropZone from './components/DropZone.vue'
import PreviewViewport from './components/PreviewViewport.vue'
import ReleaseNotes from './components/ReleaseNotes.vue'
import SettingsPanel from './components/SettingsPanel.vue'
import StatsBar from './components/StatsBar.vue'
import ToastHost from './components/ToastHost.vue'
import { downloadSvg } from './lib/download'
import { useAppStore } from './store/appStore'

const store = useAppStore()
const viewport = ref<InstanceType<typeof PreviewViewport> | null>(null)
const dropZone = ref<InstanceType<typeof DropZone> | null>(null)

// Mobile only: collapse the pinned result to give the command panel more room.
const resultHidden = ref(false)

// The "What's new" release-notes overlay.
const releaseNotesOpen = ref(false)

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
  // The release-notes overlay owns the keyboard while it is open (it handles Escape itself).
  if (releaseNotesOpen.value) return

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
    case 'n':
    case 'N':
      viewport.value?.toggleNodes()
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
    <AppHeader @open-file="dropZone?.openPicker()" @open-release-notes="releaseNotesOpen = true" />
    <div class="body" :class="{ 'result-collapsed': resultHidden }">
      <SettingsPanel />
      <main class="main">
        <PreviewViewport ref="viewport" />
        <StatsBar />
      </main>
      <button
        v-if="store.hasImage"
        class="result-toggle"
        type="button"
        :aria-expanded="!resultHidden"
        @click="resultHidden = !resultHidden"
      >
        <svg
          class="chev"
          :class="{ 'is-down': resultHidden }"
          viewBox="0 0 16 16"
          width="12"
          height="12"
          aria-hidden="true"
        >
          <path
            d="M4 10l4-4 4 4"
            fill="none"
            stroke="currentColor"
            stroke-width="1.6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        {{ resultHidden ? 'Show preview' : 'Hide preview' }}
      </button>
      <DropZone ref="dropZone" />
    </div>
    <ReleaseNotes v-if="releaseNotesOpen" @close="releaseNotesOpen = false" />
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

/* The result toggle is a mobile-only affordance; hidden on the desktop split. */
.result-toggle {
  display: none;
}

/* Mobile: stack a pinned result on top of an independently scrolling command
   panel, with a slim bar to collapse the result when the controls need room. */
@media (max-width: 768px) {
  .body {
    flex-direction: column;
    overflow: hidden;
  }

  .main {
    /* Pin the result above the settings panel (which is first in DOM order). */
    order: -2;
    flex: 0 0 auto;
    height: 48vh;
    min-height: 220px;
  }

  .result-toggle {
    order: -1;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    height: 30px;
    padding: 0;
    border: none;
    border-top: 1px solid var(--border);
    background: var(--bg-1);
    color: var(--text-2);
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }

  .result-toggle:hover {
    color: var(--text-1);
  }

  .result-toggle .chev {
    transition: transform 0.15s ease;
  }

  .result-toggle .chev.is-down {
    transform: rotate(180deg);
  }

  .body.result-collapsed .main {
    display: none;
  }

  /* With the result gone the app header already delimits the toggle. */
  .body.result-collapsed .result-toggle {
    border-top-color: transparent;
  }
}
</style>
