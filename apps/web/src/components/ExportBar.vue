<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyText, downloadSvg, svgToDataUri } from '../lib/download'
import { useAppStore } from '../store/appStore'

const store = useAppStore()
const { t } = useI18n()
const disabled = computed(() => store.result === null)

function onDownload(): void {
  if (!store.result) return
  downloadSvg(store.result.svg, store.exportName)
}

async function onCopySvg(): Promise<void> {
  if (!store.result) return
  const ok = await copyText(store.result.svg)
  store.notify(t(ok ? 'toasts.svgCopied' : 'toasts.clipboardUnavailable'), ok ? 'success' : 'error')
}

async function onCopyDataUri(): Promise<void> {
  if (!store.result) return
  const ok = await copyText(svgToDataUri(store.result.svg))
  store.notify(
    t(ok ? 'toasts.dataUriCopied' : 'toasts.clipboardUnavailable'),
    ok ? 'success' : 'error',
  )
}
</script>

<template>
  <div class="export">
    <button
      class="btn btn-sm"
      :disabled="disabled"
      :title="t('exportBar.copySvgTitle')"
      @click="onCopySvg"
    >
      {{ t('exportBar.copySvg') }}
    </button>
    <button
      class="btn btn-sm"
      :disabled="disabled"
      :title="t('exportBar.copyDataUriTitle')"
      @click="onCopyDataUri"
    >
      {{ t('exportBar.copyDataUri') }}
    </button>
    <button
      class="btn btn-primary btn-sm"
      :disabled="disabled"
      :title="t('exportBar.downloadTitle', { name: store.exportName })"
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
      {{ t('exportBar.download') }}
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
