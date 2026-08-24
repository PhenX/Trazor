<script setup lang="ts">
import { clamp } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import type { ScoredCandidate } from '@trazor/tune'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatBytes, formatCount } from '../lib/format'
import { useAppStore } from '../store/appStore'

const store = useAppStore()
const { t } = useI18n()

type SortKey = 'score' | 'fidelity' | 'nodes' | 'bytes' | 'colors'
const SORT_KEYS: readonly SortKey[] = ['score', 'fidelity', 'nodes', 'bytes', 'colors']

const sortKey = ref<SortKey>('score')
const paretoOnly = ref(false)
const compareZoom = ref(false)
const showAll = ref(false)

// Shared loupe state: one normalized center + magnification drives every tile.
const cx = ref(0.5)
const cy = ref(0.5)
const zoom = ref(4)

/** How many tiles to mount before the "show all" toggle (cheap virtualization). */
const CAP = 48

const frontIds = computed(() => new Set(store.tuneFront.map((c) => c.id)))

const candidates = computed<readonly ScoredCandidate[]>(() => {
  const pool = store.tuneResults.filter((c) => !c.rejected)
  const key = sortKey.value
  const sorted = pool.toSorted((a, b) => {
    switch (key) {
      case 'fidelity':
        return b.utilities.fidelity - a.utilities.fidelity
      case 'nodes':
        return a.metrics.nodeCount - b.metrics.nodeCount
      case 'bytes':
        return a.metrics.byteLength - b.metrics.byteLength
      case 'colors':
        return a.metrics.colorCount - b.metrics.colorCount
      default:
        return b.score - a.score
    }
  })
  return paretoOnly.value ? sorted.filter((c) => frontIds.value.has(c.id)) : sorted
})

const visible = computed(() => (showAll.value ? candidates.value : candidates.value.slice(0, CAP)))
const hiddenCount = computed(() => Math.max(0, candidates.value.length - CAP))

const aspect = computed(() => {
  const img = store.workingImage
  return img && img.height > 0 ? img.width / img.height : 1
})

// ---- data URLs (cached) ----
const svgUrlCache = new Map<number, string>()
function svgUrl(c: ScoredCandidate): string {
  let url = svgUrlCache.get(c.id)
  if (!url) {
    url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(c.svg ?? '')}`
    svgUrlCache.set(c.id, url)
  }
  return url
}

const dimsCache = new Map<number, { w: number; h: number }>()
function dimsFor(c: ScoredCandidate): { w: number; h: number } {
  let d = dimsCache.get(c.id)
  if (!d) {
    const m = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(c.svg ?? '')
    d = m ? { w: Number.parseFloat(m[1]), h: Number.parseFloat(m[2]) } : { w: 100, h: 100 }
    dimsCache.set(c.id, d)
  }
  return d
}

const sourceUrl = computed(() => {
  const img = store.workingImage
  return img ? rasterToDataUrl(img) : null
})

function rasterToDataUrl(image: RasterImage): string {
  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  )
  return canvas.toDataURL()
}

// ---- the shared loupe → per-tile viewBox ----
function viewBox(w: number, h: number): string {
  if (!compareZoom.value) return `0 0 ${w} ${h}`
  const vw = w / zoom.value
  const vh = h / zoom.value
  const vx = clamp(cx.value * w - vw / 2, 0, Math.max(0, w - vw))
  const vy = clamp(cy.value * h - vh / 2, 0, Math.max(0, h - vh))
  return `${vx} ${vy} ${vw} ${vh}`
}

function onMove(e: MouseEvent): void {
  if (!compareZoom.value) return
  const el = e.currentTarget as HTMLElement
  const r = el.getBoundingClientRect()
  cx.value = clamp((e.clientX - r.left) / r.width, 0, 1)
  cy.value = clamp((e.clientY - r.top) / r.height, 0, 1)
}

function onWheel(e: WheelEvent): void {
  if (!compareZoom.value) return
  e.preventDefault()
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  zoom.value = clamp(zoom.value * factor, 1.5, 24)
}

function toggleCompareZoom(): void {
  compareZoom.value = !compareZoom.value
}

function scorePct(c: ScoredCandidate): string {
  return (c.score * 100).toFixed(0)
}
</script>

<template>
  <section class="tune-wall">
    <header class="tw-toolbar">
      <div class="tw-count">
        <template v-if="candidates.length">{{
          t('tune.count', { count: candidates.length }, candidates.length)
        }}</template>
      </div>
      <div class="tw-tools">
        <label class="tw-sort">
          <span class="tw-sort-label">{{ t('tune.sortBy') }}</span>
          <select v-model="sortKey" class="field">
            <option v-for="k in SORT_KEYS" :key="k" :value="k">{{ t(`tune.sort.${k}`) }}</option>
          </select>
        </label>
        <button
          class="tw-toggle"
          type="button"
          :class="{ 'is-active': paretoOnly }"
          :title="t('tune.paretoOnlyHint')"
          @click="paretoOnly = !paretoOnly"
        >
          {{ t('tune.paretoOnly') }}
        </button>
        <button
          class="tw-toggle"
          type="button"
          :class="{ 'is-active': compareZoom }"
          :title="t('tune.compareZoomHint')"
          @click="toggleCompareZoom"
        >
          {{ t('tune.compareZoom') }}
          <span v-if="compareZoom" class="tw-zoom mono">{{ zoom.toFixed(1) }}×</span>
        </button>
      </div>
    </header>

    <div v-if="visible.length || sourceUrl" class="tw-grid" :class="{ 'is-zoom': compareZoom }">
      <!-- Source reference tile -->
      <figure
        v-if="sourceUrl"
        class="tw-tile tw-source"
        :style="{ aspectRatio: aspect }"
        @mousemove="onMove"
        @wheel="onWheel"
      >
        <svg
          class="tw-svg"
          :viewBox="viewBox(store.workingImage!.width, store.workingImage!.height)"
          preserveAspectRatio="xMidYMid meet"
        >
          <image
            :href="sourceUrl"
            x="0"
            y="0"
            :width="store.workingImage!.width"
            :height="store.workingImage!.height"
          />
        </svg>
        <figcaption class="tw-cap">
          <span class="tw-cap-name">{{ t('tune.source') }}</span>
        </figcaption>
      </figure>

      <!-- Candidate tiles -->
      <button
        v-for="c in visible"
        :key="c.id"
        class="tw-tile"
        type="button"
        :class="{
          'is-applied': c.id === store.tuneAppliedId,
          'is-best': c.id === store.tuneBest?.id,
        }"
        :style="{ aspectRatio: aspect }"
        :title="t('tune.apply')"
        @mousemove="onMove"
        @wheel="onWheel"
        @click="store.applyTuneCandidate(c)"
      >
        <svg
          class="tw-svg"
          :viewBox="viewBox(dimsFor(c).w, dimsFor(c).h)"
          preserveAspectRatio="xMidYMid meet"
        >
          <image :href="svgUrl(c)" x="0" y="0" :width="dimsFor(c).w" :height="dimsFor(c).h" />
        </svg>
        <span v-if="frontIds.has(c.id)" class="tw-front" :title="t('tune.paretoOnly')">◇</span>
        <span v-if="c.id === store.tuneAppliedId" class="tw-applied">{{ t('tune.applied') }}</span>
        <figcaption class="tw-cap">
          <span class="tw-cap-score mono">{{ scorePct(c) }}%</span>
          <span class="tw-cap-meta">
            {{ t('tune.tileNodes', { count: formatCount(c.metrics.nodeCount) }) }} ·
            {{ formatBytes(c.metrics.byteLength) }}
          </span>
        </figcaption>
      </button>

      <div v-if="hiddenCount > 0 && !showAll" class="tw-more">
        <button class="btn btn-ghost" type="button" @click="showAll = true">
          {{ t('tune.showAll', { count: candidates.length }) }}
        </button>
      </div>
    </div>

    <div v-else class="tw-empty">
      <p>{{ store.tuneRunning ? t('tune.emptyRunning') : t('tune.emptyIdle') }}</p>
    </div>
  </section>
</template>

<style scoped>
.tune-wall {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  min-height: 0;
  background: var(--bg-0);
}

.tw-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border);
}

.tw-count {
  font-size: 12px;
  color: var(--text-3);
}

.tw-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.tw-sort {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: var(--text-3);
}

.tw-sort .field {
  height: 26px;
  padding: 0 6px;
  font-size: 12px;
}

.tw-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 12px;
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    color 0.12s ease;
}

.tw-toggle:hover {
  border-color: var(--border-strong);
  color: var(--text-1);
}

.tw-toggle.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.tw-zoom {
  font-size: 10.5px;
  opacity: 0.85;
}

.tw-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: 12px;
  align-content: start;
}

.tw-grid.is-zoom {
  cursor: crosshair;
}

.tw-tile {
  position: relative;
  display: block;
  width: 100%;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: repeating-conic-gradient(var(--bg-2) 0% 25%, var(--bg-1) 0% 50%) 50% / 16px 16px;
  overflow: hidden;
  cursor: pointer;
  transition:
    border-color 0.12s ease,
    box-shadow 0.12s ease;
}

.tw-tile:hover {
  border-color: var(--accent);
  box-shadow: var(--shadow-1);
}

.tw-source {
  cursor: default;
  border-style: dashed;
}

.tw-tile.is-applied {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.tw-tile.is-best::after {
  content: '★';
  position: absolute;
  top: 4px;
  left: 6px;
  font-size: 12px;
  color: var(--warn);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.tw-svg {
  display: block;
  width: 100%;
  height: 100%;
}

.tw-front {
  position: absolute;
  top: 3px;
  right: 6px;
  font-size: 12px;
  color: var(--accent);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}

.tw-applied {
  position: absolute;
  top: 5px;
  right: 5px;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--accent);
  color: var(--accent-contrast);
  font-size: 10px;
  font-weight: 600;
}

.tw-cap {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 6px;
  padding: 4px 7px;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.72), rgba(0, 0, 0, 0));
  color: #fff;
  pointer-events: none;
}

.tw-cap-name {
  font-size: 11px;
  font-weight: 600;
}

.tw-cap-score {
  font-size: 12px;
  font-weight: 700;
}

.tw-cap-meta {
  font-size: 9.5px;
  opacity: 0.85;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tw-more {
  grid-column: 1 / -1;
  display: flex;
  justify-content: center;
  padding: 6px 0;
}

.tw-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-3);
  font-size: 13px;
}
</style>
