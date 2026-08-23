<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { formatBytes } from '../lib/format'
import { useAppStore } from '../store/appStore'

const store = useAppStore()

const usage = ref<{ models: number; bytes: number } | null>(null)
let modelStore: import('@trazor/ml').ModelStore | null = null

const backendBadge = computed(() => {
  if (store.mlState.probing || (!store.mlState.availability && store.hasImage)) {
    return { label: 'detecting…', cls: '', title: 'Probing WebGPU / WASM support' }
  }
  const a = store.mlState.availability
  if (!a) return { label: 'idle', cls: '', title: 'Backend not probed yet' }
  if (a.available && a.backend === 'webgpu') {
    return { label: 'WebGPU', cls: 'chip--success', title: 'Hardware-accelerated inference' }
  }
  if (a.available && a.backend === 'wasm') {
    return { label: 'WASM', cls: 'chip--accent', title: 'CPU (WebAssembly) inference' }
  }
  return { label: 'unavailable', cls: 'chip--warn', title: a.reason ?? 'ML is unavailable' }
})

const mlReady = computed(() => store.mlState.availability?.available === true)
const removeBusy = computed(() => store.mlState.removeBg.busy)
const magicBusy = computed(() => store.mlState.magic.busy)
const edgeBusy = computed(() => store.mlState.edge.busy)
const cleanupBusy = computed(() => store.mlState.cleanup.busy)

async function refreshUsage(): Promise<void> {
  try {
    const ml = await import('@trazor/ml')
    modelStore ??= new ml.ModelStore()
    usage.value = await modelStore.usage()
  } catch {
    usage.value = null
  }
}

async function clearCache(): Promise<void> {
  try {
    const ml = await import('@trazor/ml')
    modelStore ??= new ml.ModelStore()
    await modelStore.clear()
    await refreshUsage()
    store.notify('Model cache cleared', 'info')
  } catch (e) {
    store.notify(`Could not clear the model cache: ${e instanceof Error ? e.message : e}`, 'error')
  }
}

function onPopoverToggle(event: Event): void {
  if ((event.target as HTMLDetailsElement).open) void refreshUsage()
}

onMounted(() => {
  void store.ensureMlAvailability()
})
</script>

<template>
  <section class="ml card">
    <header class="ml-head">
      <span class="ml-title">Local ML tools</span>
      <span class="chip" :class="backendBadge.cls" :title="backendBadge.title">
        {{ backendBadge.label }}
      </span>
    </header>

    <div class="ml-body">
      <div class="tool">
        <button
          class="btn tool-btn"
          :disabled="
            !store.hasImage || !mlReady || removeBusy || magicBusy || edgeBusy || cleanupBusy
          "
          :title="mlReady ? 'Remove the background with a local U²-Net model' : backendBadge.title"
          @click="store.removeBackground()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M2.5 13.5 8 2.5l5.5 11"
              fill="none"
              stroke="currentColor"
              stroke-width="1.5"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <path d="M4.5 10.5h7" stroke="currentColor" stroke-width="1.5" stroke-dasharray="2 2" />
          </svg>
          {{ removeBusy ? 'Removing background…' : 'Remove background' }}
        </button>
        <div
          v-if="removeBusy"
          class="progress"
          role="progressbar"
          :aria-label="store.mlState.removeBg.phase"
        >
          <div
            class="progress-fill"
            :class="{ indeterminate: store.mlState.removeBg.progress === null }"
            :style="
              store.mlState.removeBg.progress !== null
                ? { width: `${store.mlState.removeBg.progress * 100}%` }
                : {}
            "
          />
        </div>
        <p v-if="removeBusy" class="phase">{{ store.mlState.removeBg.phase }}</p>
      </div>

      <div class="tool">
        <button
          class="btn tool-btn"
          :disabled="
            !store.hasImage || !mlReady || removeBusy || magicBusy || edgeBusy || cleanupBusy
          "
          :title="
            mlReady
              ? 'ML cleanup — denoise / deblock the image before tracing (all modes; needs the cleanup model)'
              : backendBadge.title
          "
          @click="store.cleanUp()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M9.5 2.5 11 5.5 14 7l-3 1.5L9.5 11.5 8 8.5 5 7l3-1.5z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-linejoin="round"
            />
            <path
              d="M3.5 10.5 4.4 12.3 6 13l-1.6.8L3.5 15.5 2.7 13.8 1 13l1.7-.7z"
              fill="none"
              stroke="currentColor"
              stroke-width="1.1"
              stroke-linejoin="round"
              opacity="0.7"
            />
          </svg>
          {{ cleanupBusy ? 'Cleaning up…' : 'Clean up (ML)' }}
        </button>
        <div
          v-if="cleanupBusy"
          class="progress"
          role="progressbar"
          :aria-label="store.mlState.cleanup.phase"
        >
          <div
            class="progress-fill"
            :class="{ indeterminate: store.mlState.cleanup.progress === null }"
            :style="
              store.mlState.cleanup.progress !== null
                ? { width: `${store.mlState.cleanup.progress * 100}%` }
                : {}
            "
          />
        </div>
        <p v-if="cleanupBusy" class="phase">{{ store.mlState.cleanup.phase }}</p>
        <p v-else class="phase instructions">
          Rewrites pixels for the tracer · needs the cleanup model.
        </p>
      </div>

      <div class="tool">
        <button
          class="btn tool-btn"
          :class="{ 'is-active': store.magicActive }"
          :disabled="
            !store.hasImage || !mlReady || removeBusy || magicBusy || edgeBusy || cleanupBusy
          "
          :title="mlReady ? 'Click regions to keep or exclude (SlimSAM)' : backendBadge.title"
          :aria-pressed="store.magicActive"
          @click="store.toggleMagicSelect()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="m9.5 2 .8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8ZM3.5 8l.6 1.4L5.5 10l-1.4.6L3.5 12l-.6-1.4L1.5 10l1.4-.6ZM11 10.5l.5 1 1 .5-1 .5-.5 1-.5-1-1-.5 1-.5Z"
              fill="currentColor"
            />
          </svg>
          {{ store.magicActive ? 'Magic select — active' : 'Magic select' }}
        </button>
        <div
          v-if="magicBusy"
          class="progress"
          role="progressbar"
          :aria-label="store.mlState.magic.phase"
        >
          <div
            class="progress-fill"
            :class="{ indeterminate: store.mlState.magic.progress === null }"
            :style="
              store.mlState.magic.progress !== null
                ? { width: `${store.mlState.magic.progress * 100}%` }
                : {}
            "
          />
        </div>
        <p v-if="magicBusy" class="phase">{{ store.mlState.magic.phase }}</p>
        <p v-else-if="store.magicActive" class="phase instructions">
          click = keep · alt / right-click = exclude · <kbd>Enter</kbd> apply ·
          <kbd>Esc</kbd> cancel
        </p>
      </div>

      <div class="tool">
        <button
          class="btn tool-btn"
          :class="{ 'is-active': store.edgePrepass }"
          :disabled="
            !store.hasImage || !mlReady || removeBusy || magicBusy || edgeBusy || cleanupBusy
          "
          :title="
            mlReady
              ? 'ML edge pre-pass — protects thin features from despeckling on noisy input (all modes)'
              : backendBadge.title
          "
          :aria-pressed="store.edgePrepass"
          @click="store.setEdgePrepass(!store.edgePrepass)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <rect
              x="2.5"
              y="2.5"
              width="11"
              height="11"
              rx="2"
              fill="none"
              stroke="currentColor"
              stroke-width="1.3"
              stroke-dasharray="2 1.6"
              opacity="0.5"
            />
            <path
              d="M2.5 10.5 6 7l3 2.5L13.5 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
          {{ store.edgePrepass ? 'Edge pre-pass — on' : 'Edge pre-pass (ML)' }}
        </button>
        <div
          v-if="edgeBusy"
          class="progress"
          role="progressbar"
          :aria-label="store.mlState.edge.phase"
        >
          <div
            class="progress-fill"
            :class="{ indeterminate: store.mlState.edge.progress === null }"
            :style="
              store.mlState.edge.progress !== null
                ? { width: `${store.mlState.edge.progress * 100}%` }
                : {}
            "
          />
        </div>
        <p v-if="edgeBusy" class="phase">{{ store.mlState.edge.phase }}</p>
        <p v-else-if="store.edgePrepass" class="phase instructions">
          Applies to every mode · needs the edge-prepass model.
        </p>
      </div>

      <div class="ml-foot">
        <button
          v-if="store.isWorkingModified"
          class="chip chip--accent chip--btn"
          title="Discard ML edits and trace the original image again"
          @click="store.restoreOriginal()"
        >
          ↺ Restore original
        </button>
        <details class="models" @toggle="onPopoverToggle">
          <summary class="chip chip--btn">Models</summary>
          <div class="models-pop card">
            <p class="models-line">
              Cached:
              <strong>{{
                usage ? `${usage.models} model${usage.models === 1 ? '' : 's'}` : '—'
              }}</strong>
              <span v-if="usage" class="muted"> · {{ formatBytes(usage.bytes) }}</span>
            </p>
            <p class="models-note muted">
              Models download once from their public source and run entirely on this device.
            </p>
            <button
              class="btn btn-sm"
              :disabled="!usage || usage.models === 0"
              @click="clearCache()"
            >
              Clear cache
            </button>
          </div>
        </details>
      </div>
    </div>
  </section>
</template>

<style scoped>
.ml {
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ml-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ml-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.ml-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tool {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tool-btn {
  justify-content: flex-start;
  width: 100%;
}

.tool-btn.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.progress {
  height: 3px;
  border-radius: 2px;
  background: var(--bg-3);
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--accent);
  transition: width 0.2s ease;
}

.progress-fill.indeterminate {
  width: 40%;
  animation: slide 1.1s ease-in-out infinite;
}

@keyframes slide {
  0% {
    margin-left: -40%;
  }
  100% {
    margin-left: 100%;
  }
}

.phase {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-3);
}

.instructions {
  color: var(--text-2);
  line-height: 1.6;
}

.ml-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.models {
  position: relative;
  margin-left: auto;
}

.models summary {
  list-style: none;
  cursor: pointer;
}

.models summary::-webkit-details-marker {
  display: none;
}

.models[open] summary {
  color: var(--accent);
  border-color: var(--accent);
}

.models-pop {
  position: absolute;
  right: 0;
  top: calc(100% + 6px);
  z-index: 20;
  width: 220px;
  padding: 10px;
  box-shadow: var(--shadow-2);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.models-line {
  margin: 0;
  font-size: 12px;
}

.models-note {
  margin: 0;
  font-size: 10.5px;
  line-height: 1.5;
}
</style>
