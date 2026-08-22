<script setup lang="ts">
import { SETTINGS_EXPORT_VERSION } from '@vectorizer/core'
import { computed, ref } from 'vue'
import { copyText, downloadText } from '../lib/download'
import { useAppStore } from '../store/appStore'

const store = useAppStore()

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
  store.notify(ok ? 'Settings copied' : 'Clipboard unavailable', ok ? 'success' : 'error')
}

function onSaveFile(): void {
  downloadText(exportJson.value, 'vectorizer-settings.json', 'application/json')
  store.notify('Settings file saved', 'success')
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
    store.notify('Could not read the file', 'error')
  }
}
</script>

<template>
  <section class="sio card">
    <header class="sio-head">
      <span class="sio-title">Import / export</span>
      <div class="sio-tabs">
        <button
          class="chip chip--btn"
          :class="{ 'is-active': panel === 'export' }"
          :aria-pressed="panel === 'export'"
          title="Copy or save the current settings as JSON"
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
          Export
        </button>
        <button
          class="chip chip--btn"
          :class="{ 'is-active': panel === 'import' }"
          :aria-pressed="panel === 'import'"
          title="Load settings from JSON or a file"
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
          Import
        </button>
      </div>
    </header>

    <!-- Export -->
    <div v-if="panel === 'export'" class="sio-body">
      <textarea
        class="sio-area mono"
        readonly
        rows="7"
        aria-label="Exported settings JSON"
        :value="exportJson"
        @focus="($event.target as HTMLTextAreaElement).select()"
      />
      <div class="sio-actions">
        <button class="btn btn-sm" title="Copy the JSON to the clipboard" @click="onCopy">
          Copy JSON
        </button>
        <button class="btn btn-sm" title="Download a .json file" @click="onSaveFile">
          Save file
        </button>
        <span class="sio-note">carries a version field (v{{ SETTINGS_EXPORT_VERSION }})</span>
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
        placeholder="Paste exported settings JSON here, or load a file…"
        aria-label="Settings JSON to import"
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
        <button class="btn btn-sm" title="Load a settings .json file" @click="openFilePicker">
          Load file…
        </button>
        <button
          class="btn btn-primary btn-sm"
          :disabled="!importText.trim()"
          title="Replace the current settings with the pasted JSON"
          @click="applyImport"
        >
          Apply
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
