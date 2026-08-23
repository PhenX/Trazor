<script setup lang="ts">
import { SETTINGS_EXPORT_VERSION } from '@trazor/core'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyText, downloadText } from '../lib/download'
import { useAppStore } from '../store/appStore'

const store = useAppStore()
const { t } = useI18n()

type Panel = 'idle' | 'export' | 'import'
const panel = ref<Panel>('idle')
const importText = ref('')
const fileInput = ref<HTMLInputElement | null>(null)

// Lazily evaluated — only read while the export panel is open, and re-derived
// whenever the settings change so the JSON stays live.
const exportJson = computed(() => store.exportSettings())

function toggle(next: Exclude<Panel, 'idle'>): void {
  panel.value = panel.value === next ? 'idle' : next
}

async function onCopy(): Promise<void> {
  const ok = await copyText(exportJson.value)
  store.notify(
    t(ok ? 'toasts.settingsCopied' : 'toasts.clipboardUnavailable'),
    ok ? 'success' : 'error',
  )
}

function onSaveFile(): void {
  downloadText(exportJson.value, 'trazor-settings.json', 'application/json')
  store.notify(t('toasts.settingsFileSaved'), 'success')
}

function applyImport(): void {
  if (!importText.value.trim()) return
  if (store.importSettings(importText.value)) {
    importText.value = ''
    panel.value = 'idle'
  }
}

function openFilePicker(): void {
  fileInput.value?.click()
}

async function onFileChosen(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    // Picking a settings file is an explicit "use this" action — load it into
    // the box and apply it in one step. On failure the text stays for editing.
    importText.value = await file.text()
    applyImport()
  } catch {
    store.notify(t('toasts.couldNotReadFile'), 'error')
  }
}
</script>

<template>
  <section class="sio card">
    <header class="sio-head">
      <span class="sio-title">{{ t('sio.title') }}</span>
      <div class="sio-tabs">
        <button
          class="chip chip--btn"
          :class="{ 'is-active': panel === 'export' }"
          :aria-pressed="panel === 'export'"
          :title="t('sio.exportTitle')"
          @click="toggle('export')"
        >
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
            <path
              d="M7 9V2m0 0L4.3 4.7M7 2l2.7 2.7M2.5 8.5v2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ t('sio.export') }}
        </button>
        <button
          class="chip chip--btn"
          :class="{ 'is-active': panel === 'import' }"
          :aria-pressed="panel === 'import'"
          :title="t('sio.importTitle')"
          @click="toggle('import')"
        >
          <svg viewBox="0 0 14 14" width="11" height="11" aria-hidden="true">
            <path
              d="M7 2v7m0 0L4.3 6.3M7 9l2.7-2.7M2.5 8.5v2a1 1 0 0 0 1 1h7a1 1 0 0 0 1-1v-2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ t('sio.import') }}
        </button>
      </div>
    </header>

    <!-- Export -->
    <div v-if="panel === 'export'" class="sio-body">
      <textarea
        class="sio-area mono"
        readonly
        rows="7"
        :aria-label="t('sio.exportedAria')"
        :value="exportJson"
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
      <div class="sio-actions">
        <button class="btn btn-sm" :title="t('sio.copyJsonTitle')" @click="onCopy">
          {{ t('sio.copyJson') }}
        </button>
        <button class="btn btn-sm" :title="t('sio.saveFileTitle')" @click="onSaveFile">
          {{ t('sio.saveFile') }}
        </button>
        <span class="sio-note">{{
          t('sio.versionNote', { version: SETTINGS_EXPORT_VERSION })
        }}</span>
      </div>
    </div>

    <!-- Import -->
    <div v-else-if="panel === 'import'" class="sio-body">
      <textarea
        v-model="importText"
        class="sio-area mono"
        rows="7"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        :placeholder="t('sio.importPlaceholder')"
        :aria-label="t('sio.importAria')"
      />
      <input
        ref="fileInput"
        class="sio-file"
        type="file"
        accept="application/json,.json,text/plain"
        aria-hidden="true"
        tabindex="-1"
        @change="onFileChosen"
      />
      <div class="sio-actions">
        <button class="btn btn-sm" :title="t('sio.loadFileTitle')" @click="openFilePicker">
          {{ t('sio.loadFile') }}
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!importText.trim()"
          :title="t('sio.applyTitle')"
          @click="applyImport"
        >
          {{ t('sio.apply') }}
        </button>
      </div>
    </div>
  </section>
</template>

<style scoped>
.sio {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.sio-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.sio-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.sio-tabs {
  display: flex;
  gap: 5px;
}

.sio-tabs .chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sio-tabs .chip.is-active {
  border-color: var(--accent);
  color: var(--accent);
}

.sio-body {
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.sio-area {
  width: 100%;
  resize: vertical;
  padding: 7px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-0);
  color: var(--text-1);
  font-size: 11px;
  line-height: 1.5;
  white-space: pre;
  overflow: auto;
}

.sio-area:focus-visible {
  outline: none;
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.sio-file {
  display: none;
}

.sio-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.sio-note {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-3);
}
</style>
