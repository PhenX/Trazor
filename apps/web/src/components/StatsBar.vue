<script setup lang="ts">
import { computed } from 'vue'
import { copyText } from '../lib/download'
import { formatBytes, formatCount, formatMs, STAGE_LABELS } from '../lib/format'
import { useAppStore } from '../store/appStore'
import ExportBar from './ExportBar.vue'

const store = useAppStore()

const MAX_SWATCHES = 18

const sourceInfo = computed(() => {
  const img = store.sourceImage
  if (!img) return null
  return { name: store.sourceName, size: `${img.width}×${img.height}` }
})

const tracedSize = computed(() => {
  const res = store.result
  const img = store.sourceImage
  if (!res || !img) return null
  if (res.width === img.width && res.height === img.height) return null
  return `${res.width}×${res.height}`
})

const swatches = computed(() => (store.result?.palette ?? []).slice(0, MAX_SWATCHES))
const extraSwatches = computed(() =>
  Math.max(0, (store.result?.palette.length ?? 0) - MAX_SWATCHES),
)

const fidelityInfo = computed(() => {
  const f = store.fidelity
  if (!f) return null
  const cls = f.score >= 0.97 ? 'dot-success' : f.score >= 0.9 ? 'dot-warn' : 'dot-danger'
  return { label: `${(f.score * 100).toFixed(1)}%`, cls }
})

const maxStageMs = computed(() =>
  Math.max(1, ...(store.result?.stats.stages.map((s) => s.ms) ?? [1])),
)

async function copySwatch(hex: string): Promise<void> {
  const ok = await copyText(hex)
  store.notify(ok ? `${hex} copied` : 'Clipboard unavailable', ok ? 'success' : 'error')
}
</script>

<template>
  <footer class="stats">
    <div
      class="cluster source"
      :title="sourceInfo ? `${sourceInfo.name} — ${sourceInfo.size}px` : ''"
    >
      <template v-if="sourceInfo">
        <span class="src-name">{{ sourceInfo.name }}</span>
        <span class="src-size mono">{{ sourceInfo.size }}</span>
        <span v-if="tracedSize" class="src-size mono traced" title="Traced size after downscale">
          → {{ tracedSize }}
        </span>
      </template>
      <span v-else class="muted">No image</span>
    </div>

    <div v-if="store.result" class="cluster palette" aria-label="Result palette">
      <button
        v-for="(hex, i) in swatches"
        :key="`${hex}-${i}`"
        class="swatch"
        :style="{ background: hex }"
        :title="`${hex} — click to copy`"
        @click="copySwatch(hex)"
      />
      <span v-if="extraSwatches > 0" class="muted more">+{{ extraSwatches }}</span>
    </div>

    <div v-if="store.result" class="cluster numbers mono">
      <span title="Paths">{{ formatCount(store.result.stats.pathCount) }} paths</span>
      <span class="sep" />
      <span title="Path nodes">{{ formatCount(store.result.stats.nodeCount) }} nodes</span>
      <span class="sep" />
      <span title="Colors">{{ store.result.stats.colorCount }} colors</span>
      <span class="sep" />
      <span title="SVG size">{{ formatBytes(store.result.stats.byteLength) }}</span>
      <span class="sep" />
      <details class="timing">
        <summary :title="'Total tracing time — open for per-stage timings'">
          {{ formatMs(store.result.stats.durationMs) }}
        </summary>
        <div class="timing-pop card">
          <div v-for="stage in store.result.stats.stages" :key="stage.stage" class="timing-row">
            <span class="timing-label">{{ STAGE_LABELS[stage.stage] }}</span>
            <span class="timing-bar">
              <span class="timing-fill" :style="{ width: `${(stage.ms / maxStageMs) * 100}%` }" />
            </span>
            <span class="timing-ms mono">{{ formatMs(stage.ms) }}</span>
          </div>
        </div>
      </details>
    </div>

    <div
      v-if="fidelityInfo"
      class="cluster fidelity"
      title="Perceptual fidelity (mean ΔE in Oklab)"
    >
      <span class="dot" :class="fidelityInfo.cls" />
      <span class="mono">{{ fidelityInfo.label }}</span>
      <span class="muted">match</span>
    </div>

    <div v-if="store.result && store.result.warnings.length" class="cluster warnings">
      <span
        v-for="(warning, i) in store.result.warnings"
        :key="i"
        class="chip"
        :class="warning.severity === 'warning' ? 'chip--warn' : 'chip--accent'"
        :title="warning.message"
      >
        {{ warning.code }}
      </span>
    </div>

    <div class="spacer" />
    <ExportBar />
  </footer>
</template>

<style scoped>
.stats {
  display: flex;
  align-items: center;
  gap: 14px;
  height: 40px;
  padding: 0 10px;
  background: var(--bg-1);
  border-top: 1px solid var(--border);
  font-size: 11.5px;
  /* Keep overflow visible so the timing popover can escape the bar. */
  overflow: visible;
  flex: 0 0 auto;
}

.cluster {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 0 0 auto;
}

.source,
.palette,
.warnings {
  flex: 0 1 auto;
  min-width: 0;
  overflow: hidden;
}

.source {
  max-width: 220px;
}

.src-name {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: var(--text-1);
  font-weight: 500;
}

.src-size {
  color: var(--text-3);
}

.traced {
  color: var(--text-2);
}

.palette {
  gap: 3px;
}

.swatch {
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.swatch:hover {
  transform: scale(1.2);
}

.more {
  font-size: 10.5px;
}

.numbers {
  color: var(--text-2);
  gap: 8px;
}

.sep {
  width: 1px;
  height: 12px;
  background: var(--border);
}

.timing {
  position: relative;
}

.timing summary {
  list-style: none;
  cursor: pointer;
  color: var(--text-2);
}

.timing summary::-webkit-details-marker {
  display: none;
}

.timing summary:hover {
  color: var(--accent);
}

.timing-pop {
  position: absolute;
  bottom: calc(100% + 10px);
  right: -20px;
  z-index: 30;
  width: 240px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  box-shadow: var(--shadow-2);
}

.timing-row {
  display: grid;
  grid-template-columns: 74px 1fr 52px;
  align-items: center;
  gap: 8px;
}

.timing-label {
  font-size: 11px;
  color: var(--text-2);
}

.timing-bar {
  height: 4px;
  border-radius: 2px;
  background: var(--bg-3);
  overflow: hidden;
}

.timing-fill {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: 2px;
}

.timing-ms {
  text-align: right;
  font-size: 10.5px;
  color: var(--text-2);
}

.fidelity {
  gap: 5px;
}

.dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.dot-success {
  background: var(--success);
}

.dot-warn {
  background: var(--warn);
}

.dot-danger {
  background: var(--danger);
}

.warnings {
  gap: 4px;
}

.spacer {
  flex: 1;
}
</style>
