<script setup lang="ts">
import type { VectorizeWarning } from '@trazor/core'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyText } from '../lib/download'
import { formatBytes, formatCount, formatMs } from '../lib/format'
import { warningKeyBase } from '../lib/warnings'
import { useAppStore } from '../store/appStore'
import ExportBar from './ExportBar.vue'

const store = useAppStore()
const { t } = useI18n()

const MAX_SWATCHES = 18

/** Short chip label for a warning (localized by its stable code). */
function warningLabel(w: VectorizeWarning): string {
  return t(`${warningKeyBase(w.code)}.label`)
}

/** Full warning text, interpolated from the engine's params (count drives plural). */
function warningMessage(w: VectorizeWarning): string {
  const key = `${warningKeyBase(w.code)}.message`
  const params = w.params ?? {}
  const count = typeof params.count === 'number' ? params.count : undefined
  return count === undefined ? t(key, params) : t(key, params, count)
}

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
  store.notify(
    ok ? t('toasts.hexCopied', { hex }) : t('toasts.clipboardUnavailable'),
    ok ? 'success' : 'error',
  )
}
</script>

<template>
  <footer class="stats">
    <div
      class="cluster source"
      :title="
        sourceInfo
          ? t('stats.sourceSizeTitle', { name: sourceInfo.name, size: sourceInfo.size })
          : ''
      "
    >
      <template v-if="sourceInfo">
        <span class="src-name">{{ sourceInfo.name }}</span>
        <span class="src-size mono">{{ sourceInfo.size }}</span>
        <span v-if="tracedSize" class="src-size mono traced" :title="t('stats.tracedSize')">
          → {{ tracedSize }}
        </span>
      </template>
      <span v-else class="muted">{{ t('stats.noImage') }}</span>
    </div>

    <div v-if="store.result" class="cluster palette" :aria-label="t('stats.resultPalette')">
      <button
        v-for="(hex, i) in swatches"
        :key="`${hex}-${i}`"
        class="swatch"
        :style="{ background: hex }"
        :title="t('stats.swatchCopy', { hex })"
        @click="copySwatch(hex)"
      />
      <span v-if="extraSwatches > 0" class="muted more">+{{ extraSwatches }}</span>
    </div>

    <div v-if="store.result" class="cluster numbers mono">
      <span :title="t('stats.pathsTitle')">{{
        t('stats.paths', { count: formatCount(store.result.stats.pathCount) })
      }}</span>
      <span class="sep" />
      <span :title="t('stats.nodesTitle')">{{
        t('stats.nodes', { count: formatCount(store.result.stats.nodeCount) })
      }}</span>
      <span class="sep" />
      <span :title="t('stats.colorsTitle')">{{
        t('stats.colors', { count: store.result.stats.colorCount })
      }}</span>
      <span class="sep" />
      <span :title="t('stats.svgSizeTitle')">{{ formatBytes(store.result.stats.byteLength) }}</span>
      <span class="sep" />
      <details class="timing">
        <summary :title="t('stats.totalTimeTitle')">
          {{ formatMs(store.result.stats.durationMs) }}
        </summary>
        <div class="timing-pop card">
          <div v-for="stage in store.result.stats.stages" :key="stage.stage" class="timing-row">
            <span class="timing-label">{{ t(`stages.${stage.stage}`) }}</span>
            <span class="timing-bar">
              <span class="timing-fill" :style="{ width: `${(stage.ms / maxStageMs) * 100}%` }" />
            </span>
            <span class="timing-ms mono">{{ formatMs(stage.ms) }}</span>
          </div>
        </div>
      </details>
    </div>

    <div v-if="fidelityInfo" class="cluster fidelity" :title="t('stats.fidelityTitle')">
      <span class="dot" :class="fidelityInfo.cls" />
      <span class="mono">{{ fidelityInfo.label }}</span>
      <span class="muted">{{ t('stats.match') }}</span>
    </div>

    <div v-if="store.result && store.result.warnings.length" class="cluster warnings">
      <span
        v-for="(warning, i) in store.result.warnings"
        :key="i"
        class="chip"
        :class="warning.severity === 'warning' ? 'chip--warn' : 'chip--accent'"
        :title="warningMessage(warning)"
      >
        {{ warningLabel(warning) }}
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

/* Mobile: wrap the clusters instead of overflowing off-screen, and keep the
   export actions on their own full-width row so Download stays reachable. */
@media (max-width: 768px) {
  .stats {
    height: auto;
    flex-wrap: wrap;
    row-gap: 8px;
    padding: 8px 10px;
  }

  .spacer {
    flex-basis: 100%;
    height: 0;
  }

  .export {
    flex-wrap: wrap;
  }
}
</style>
