<script setup lang="ts">
import { computed } from 'vue'
import { copyText, downloadSvg, svgToDataUri } from '../lib/download'
import { useAppStore } from '../store/appStore'

const store = useAppStore()
const disabled = computed(() => store.result === null)

function onDownload(): void {
  if (!store.result) return
  downloadSvg(store.result.svg, store.exportName)
}

async function onCopySvg(): Promise<void> {
  if (!store.result) return
  const ok = await copyText(store.result.svg)
  store.notify(ok ? 'SVG markup copied' : 'Clipboard unavailable', ok ? 'success' : 'error')
}

async function onCopyDataUri(): Promise<void> {
  if (!store.result) return
  const ok = await copyText(svgToDataUri(store.result.svg))
  store.notify(ok ? 'Data URI copied' : 'Clipboard unavailable', ok ? 'success' : 'error')
}
</script>

<template>
  <div class="export">
    <button class="btn btn-sm" :disabled="disabled" title="Copy the SVG markup" @click="onCopySvg">
      Copy SVG
    </button>
    <button
      class="btn btn-sm"
      :disabled="disabled"
      title="Copy as data: URI for img/src or CSS"
      @click="onCopyDataUri"
    >
      Copy data-URI
    </button>
    <button
      class="btn btn-primary btn-sm"
      :disabled="disabled"
      :title="`Download ${store.exportName} (Ctrl+S)`"
      @click="onDownload"
    >
      <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
        <path
          d="M7 1.5v7m0 0L4 5.7M7 8.5l3-2.8M2 10.5v1a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-1"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
      Download SVG
    </button>
  </div>
</template>

<style scoped>
.export {
  display: flex;
  align-items: center;
  gap: 6px;
}
</style>
