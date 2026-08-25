<script setup lang="ts">
import { clamp } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import type { SvgElementKind, SvgGeometry } from '@trazor/svg'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatCount } from '../lib/format'
import { SHAPE_KIND_TOKEN } from '../lib/overlay'
import { useAppStore } from '../store/appStore'
import PreviewOverlay from './PreviewOverlay.vue'

type ViewMode = 'split' | 'result' | 'original' | 'diff'

const store = useAppStore()
const { t } = useI18n()

const paneEl = ref<HTMLDivElement | null>(null)
const origCanvas = ref<HTMLCanvasElement | null>(null)
const diffCanvas = ref<HTMLCanvasElement | null>(null)

const view = ref<ViewMode>('split')
const scale = ref(1)
const tx = ref(0)
const ty = ref(0)
const splitFrac = ref(0.5)
const checker = ref(true)
const showNodes = ref(false)
// True while an active pan drag is moving the view — lets the overlay freeze to
// a cheap translated bitmap on dense traces instead of re-stroking each frame.
const panning = ref(false)
let hasUserTransformed = false
let resizeObserver: ResizeObserver | null = null

const MIN_SCALE = 0.05
const MAX_SCALE = 64

// ------------------------------- Geometry --------------------------------
const image = computed(() => store.workingImage)
const docW = computed(() => store.result?.width ?? image.value?.width ?? 0)
const docH = computed(() => store.result?.height ?? image.value?.height ?? 0)

const docStyle = computed(() => ({
  width: `${docW.value}px`,
  height: `${docH.value}px`,
  transform: `translate(${tx.value}px, ${ty.value}px) scale(${scale.value})`,
}))

/** Screen size of one source pixel — switch to crisp nearest-neighbor when zoomed in. */
const pixelated = computed(() => {
  const img = image.value
  if (!img || !docW.value) return false
  return (scale.value * docW.value) / img.width >= 3
})

const checkerStyle = computed(() => ({
  backgroundSize: `${16 / scale.value}px ${16 / scale.value}px`,
}))

// ------------------------------ Layer logic ------------------------------
const hasResult = computed(() => store.result !== null)
const showOriginal = computed(
  () =>
    view.value === 'original' ||
    view.value === 'split' ||
    view.value === 'diff' ||
    !hasResult.value,
)
const showSvg = computed(
  () => hasResult.value && (view.value === 'result' || view.value === 'split'),
)
const showDiff = computed(() => view.value === 'diff' && store.fidelity !== null)

const svgLayerStyle = computed(() =>
  view.value === 'split' ? { clipPath: `inset(0 0 0 ${splitFrac.value * 100}%)` } : {},
)

// In split view the original only occupies the left of the divider. Without this
// complementary clip it also fills the right, showing through the SVG's
// transparent areas and making the trace look like it reproduced detail it did
// not. The two halves meet exactly at the divider.
const origLayerStyle = computed(() =>
  view.value === 'split' ? { clipPath: `inset(0 ${(1 - splitFrac.value) * 100}% 0 0)` } : {},
)

const dividerX = computed(() => tx.value + splitFrac.value * docW.value * scale.value)

// --------------------------- Complexity overlay --------------------------
// Path anchors, control handles and outlines decoded from the result SVG, so
// their density shows the geometric complexity. Parsed only while the toggle is
// on (and only when the SVG layer is visible).
const geometry = computed<SvgGeometry | null>(() =>
  showNodes.value && showSvg.value ? store.geometry : null,
)

// --------------------------- Layer highlight -----------------------------
// The layer panel points at a color layer (or one contour); isolate it in the
// preview by dimming everything else and outlining the focus. Faithful: the
// scrim is punched through a mask so the real traced pixels of the focus show,
// never a redraw. Stroke (centerline) layers have no fill area to reveal, so
// they are marked by the accent outline alone.
const focus = computed<{ d: string; stroke: boolean } | null>(() => {
  const f = store.layerFocus
  const model = store.layerModel
  if (!f || !model) return null
  const layer = model.layers[f.layer]
  if (!layer) return null
  const d = f.shape !== null ? (layer.shapes[f.shape]?.d ?? null) : layer.d
  if (d === null || d === '') return null
  return { d, stroke: layer.stroke }
})

// Keep the outline ~1.6px on screen regardless of zoom (viewBox px == screen px / scale).
const focusOutlineWidth = computed(() => 1.6 / scale.value)

// Clip the overlay to the SVG side of the split so it does not bleed over the
// original image; unclipped in the full result view.
const overlayClipX = computed(() => (view.value === 'split' ? dividerX.value : null))

function toggleNodes(): void {
  showNodes.value = !showNodes.value
}

// Per-kind tally for the overlay legend: how many of each element kind, sorted
// most-common first, each with the color the overlay tints it.
interface LegendItem {
  kind: SvgElementKind
  count: number
  token: string
}
const overlayLegend = computed<LegendItem[]>(() => {
  const geo = geometry.value
  if (!geo) return []
  const counts = new Map<SvgElementKind, number>()
  for (const shape of geo.shapes) {
    counts.set(shape.kind, (counts.get(shape.kind) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([kind, count]) => ({
      kind,
      count,
      token: SHAPE_KIND_TOKEN[kind],
    }))
    .toSorted((a, b) => b.count - a.count)
})

const VIEWS: ReadonlyArray<{ id: ViewMode; key: string }> = [
  { id: 'split', key: '1' },
  { id: 'result', key: '2' },
  { id: 'original', key: '3' },
  { id: 'diff', key: '4' },
]

function viewDisabled(id: ViewMode): boolean {
  if (id === 'diff') return store.fidelity === null
  return false
}

function setView(v: ViewMode): void {
  if (!viewDisabled(v)) view.value = v
}

// ------------------------------ Transforms -------------------------------
function paneSize(): { w: number; h: number } {
  const el = paneEl.value
  return el ? { w: el.clientWidth, h: el.clientHeight } : { w: 0, h: 0 }
}

function zoomAt(cx: number, cy: number, factor: number): void {
  const next = clamp(scale.value * factor, MIN_SCALE, MAX_SCALE)
  const k = next / scale.value
  if (k === 1) return
  tx.value = cx - (cx - tx.value) * k
  ty.value = cy - (cy - ty.value) * k
  scale.value = next
  hasUserTransformed = true
}

function fit(): void {
  if (!docW.value || !docH.value) return
  const { w, h } = paneSize()
  if (!w || !h) return
  const s = clamp(Math.min((w - 48) / docW.value, (h - 48) / docH.value), MIN_SCALE, MAX_SCALE)
  scale.value = s
  tx.value = (w - docW.value * s) / 2
  ty.value = (h - docH.value * s) / 2
  hasUserTransformed = false
}

function zoom100(): void {
  const { w, h } = paneSize()
  zoomAt(w / 2, h / 2, 1 / scale.value)
}

function zoomIn(): void {
  const { w, h } = paneSize()
  zoomAt(w / 2, h / 2, 1.25)
}

function zoomOut(): void {
  const { w, h } = paneSize()
  zoomAt(w / 2, h / 2, 1 / 1.25)
}

function onWheel(event: WheelEvent): void {
  const el = paneEl.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const factor = Math.exp(-event.deltaY * (event.deltaMode === 1 ? 0.05 : 0.0015))
  zoomAt(event.clientX - rect.left, event.clientY - rect.top, factor)
}

// --------------------------- Pointer interaction -------------------------
interface DragState {
  pointerId: number
  startX: number
  startY: number
  startTx: number
  startTy: number
  moved: boolean
  /** Candidate magic-select point (button 0 or 2 while magic mode is active). */
  pointLabel: 0 | 1 | null
  divider: boolean
}

let drag: DragState | null = null

function hostPos(event: PointerEvent): { x: number; y: number } {
  const el = paneEl.value
  if (!el) return { x: event.clientX, y: event.clientY }
  const rect = el.getBoundingClientRect()
  return { x: event.clientX - rect.left, y: event.clientY - rect.top }
}

function onPointerDown(event: PointerEvent): void {
  if (!image.value) return
  if (event.button !== 0 && event.button !== 1 && event.button !== 2) return
  if (event.button === 2 && !store.magicActive) return
  const { x, y } = hostPos(event)
  let pointLabel: 0 | 1 | null = null
  if (store.magicActive && event.button !== 1) {
    pointLabel = event.button === 2 || event.altKey ? 0 : 1
  }
  drag = {
    pointerId: event.pointerId,
    startX: x,
    startY: y,
    startTx: tx.value,
    startTy: ty.value,
    moved: false,
    pointLabel,
    divider: false,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onDividerDown(event: PointerEvent): void {
  const { x, y } = hostPos(event)
  drag = {
    pointerId: event.pointerId,
    startX: x,
    startY: y,
    startTx: tx.value,
    startTy: ty.value,
    moved: false,
    pointLabel: null,
    divider: true,
  }
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
}

function onPointerMove(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return
  const { x, y } = hostPos(event)
  const dx = x - drag.startX
  const dy = y - drag.startY
  if (!drag.moved && Math.hypot(dx, dy) > 4) drag.moved = true
  if (drag.divider) {
    const span = docW.value * scale.value
    if (span > 0) splitFrac.value = clamp((x - tx.value) / span, 0, 1)
    return
  }
  if (drag.moved) {
    panning.value = true
    tx.value = drag.startTx + dx
    ty.value = drag.startTy + dy
    hasUserTransformed = true
  }
}

function onPointerUp(event: PointerEvent): void {
  if (!drag || event.pointerId !== drag.pointerId) return
  const finished = drag
  drag = null
  panning.value = false
  if (finished.divider || finished.moved || finished.pointLabel === null) return
  const img = image.value
  if (!img || !docW.value) return
  const { x, y } = hostPos(event)
  const docX = (x - tx.value) / scale.value
  const docY = (y - ty.value) / scale.value
  const imgX = (docX * img.width) / docW.value
  const imgY = (docY * img.height) / docH.value
  store.addMagicPoint(imgX, imgY, finished.pointLabel)
}

function onContextMenu(event: MouseEvent): void {
  if (store.magicActive) event.preventDefault()
}

const cursorClass = computed(() => {
  if (store.magicActive) return 'cursor-crosshair'
  return 'cursor-grab'
})

// ---------------------------- Magic markers ------------------------------
const markers = computed(() => {
  const img = image.value
  if (!img || !docW.value) return []
  const fx = docW.value / img.width
  const fy = docH.value / img.height
  return store.magicPoints.map((p, index) => ({
    index,
    x: p.x * fx,
    y: p.y * fy,
    keep: p.label === 1,
  }))
})

// ------------------------------- Drawing ---------------------------------
function drawRaster(canvas: HTMLCanvasElement | null, raster: RasterImage | null): void {
  if (!canvas || !raster) return
  canvas.width = raster.width
  canvas.height = raster.height
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.putImageData(
    new ImageData(new Uint8ClampedArray(raster.data), raster.width, raster.height),
    0,
    0,
  )
}

watch(
  image,
  () => {
    void nextTick(() => drawRaster(origCanvas.value, image.value))
  },
  { immediate: true },
)

watch(
  () => store.fidelity,
  (report) => {
    void nextTick(() => drawRaster(diffCanvas.value, report?.diff ?? null))
    // Fall out of the diff view if it becomes unavailable.
    if (!report && view.value === 'diff') view.value = 'split'
  },
)

// Auto-fit when the document size changes (new image, or traced size change).
watch([docW, docH], () => {
  if (docW.value && docH.value) void nextTick(fit)
})

// ------------------------------ Lifecycle --------------------------------
onMounted(() => {
  resizeObserver = new ResizeObserver(() => {
    if (!hasUserTransformed) fit()
  })
  if (paneEl.value) resizeObserver.observe(paneEl.value)
  if (docW.value) fit()
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
})

const progressLabel = computed(() => {
  const p = store.progress
  if (!p) return ''
  return t('preview.progress', {
    stage: t(`stages.${p.stage}`),
    percent: Math.round(p.overall * 100),
  })
})

const zoomReadout = computed(() => `${Math.round(scale.value * 100)}%`)

defineExpose({ setView, fit, zoom100, zoomIn, zoomOut, toggleNodes })
</script>

<template>
  <div class="viewport">
    <!-- Toolbar -->
    <div class="toolbar">
      <div class="tabs" role="tablist" :aria-label="t('preview.modeAria')">
        <button
          v-for="v in VIEWS"
          :key="v.id"
          role="tab"
          class="tab"
          :class="{ 'is-active': view === v.id }"
          :aria-selected="view === v.id"
          :disabled="viewDisabled(v.id)"
          :title="t('preview.viewTitle', { label: t(`preview.${v.id}`), key: v.key })"
          @click="setView(v.id)"
        >
          {{ t(`preview.${v.id}`) }}
        </button>
      </div>

      <div class="zoom">
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :title="t('preview.zoomOut')"
          :aria-label="t('preview.zoomOut')"
          @click="zoomOut"
        >
          −
        </button>
        <span class="zoom-readout mono">{{ zoomReadout }}</span>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :title="t('preview.zoomIn')"
          :aria-label="t('preview.zoomIn')"
          @click="zoomIn"
        >
          +
        </button>
        <button class="btn btn-ghost btn-sm" :title="t('preview.fitTitle')" @click="fit">
          {{ t('preview.fit') }}
        </button>
        <button class="btn btn-ghost btn-sm" :title="t('preview.zoom100Title')" @click="zoom100">
          100%
        </button>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :class="{ 'is-on': checker }"
          :title="t('preview.toggleChecker')"
          :aria-label="t('preview.toggleChecker')"
          :aria-pressed="checker"
          @click="checker = !checker"
        >
          <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
            <path d="M0 0h7v7H0zM7 7h7v7H7z" fill="currentColor" opacity="0.85" />
            <path d="M7 0h7v7H7zM0 7h7v7H0z" fill="currentColor" opacity="0.25" />
          </svg>
        </button>
        <button
          class="btn btn-ghost btn-icon btn-sm"
          :class="{ 'is-on': showNodes }"
          :disabled="!hasResult"
          :title="t('preview.showNodes')"
          :aria-label="t('preview.showNodesAria')"
          :aria-pressed="showNodes"
          @click="toggleNodes"
        >
          <svg viewBox="0 0 14 14" width="12" height="12" aria-hidden="true">
            <path
              d="M2 11 6 4l6 3.5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.2"
              opacity="0.7"
            />
            <path
              d="M1 10l2 2M3 10l-2 2M5 3l2 2M7 3l-2 2M11 6.5l2 2M13 6.5l-2 2"
              stroke="currentColor"
              stroke-width="1.2"
            />
          </svg>
        </button>
      </div>

      <!-- Busy: thin progress on the toolbar's bottom edge -->
      <div v-if="store.busy" class="busy-track" role="progressbar" :aria-label="progressLabel">
        <div class="busy-fill" :style="{ width: `${(store.progress?.overall ?? 0) * 100}%` }" />
        <div class="busy-shimmer" />
      </div>
    </div>

    <!-- Canvas host -->
    <div
      ref="paneEl"
      class="pane"
      :class="cursorClass"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @wheel.prevent="onWheel"
      @contextmenu="onContextMenu"
    >
      <div v-if="image" class="doc" :style="docStyle">
        <div
          class="doc-bg"
          :class="checker ? 'checker' : 'doc-bg-solid'"
          :style="checker ? checkerStyle : {}"
        />
        <canvas
          v-show="showOriginal"
          ref="origCanvas"
          class="layer layer-original"
          :class="{ pixelated, dimmed: view === 'diff' }"
          :style="origLayerStyle"
        />
        <div
          v-show="showSvg"
          class="layer layer-svg"
          :style="svgLayerStyle"
          v-html="store.result?.svg ?? ''"
        />
        <svg
          v-if="showSvg && focus"
          class="layer layer-highlight"
          :viewBox="`0 0 ${docW} ${docH}`"
          preserveAspectRatio="none"
          :style="svgLayerStyle"
          aria-hidden="true"
        >
          <defs>
            <mask
              id="trz-focus-mask"
              maskUnits="userSpaceOnUse"
              x="0"
              y="0"
              :width="docW"
              :height="docH"
            >
              <rect x="0" y="0" :width="docW" :height="docH" fill="#fff" />
              <path v-if="!focus.stroke" :d="focus.d" fill="#000" fill-rule="evenodd" />
            </mask>
          </defs>
          <rect
            x="0"
            y="0"
            :width="docW"
            :height="docH"
            class="scrim"
            mask="url(#trz-focus-mask)"
          />
          <path
            :d="focus.d"
            fill="none"
            class="focus-outline"
            :stroke-width="focusOutlineWidth"
            stroke-linejoin="round"
            stroke-linecap="round"
          />
        </svg>
        <canvas v-show="showDiff" ref="diffCanvas" class="layer layer-diff pixelated" />

        <!-- Magic-select markers -->
        <div
          v-for="marker in markers"
          :key="marker.index"
          class="marker"
          :class="marker.keep ? 'marker-keep' : 'marker-exclude'"
          :style="{
            left: `${marker.x}px`,
            top: `${marker.y}px`,
            transform: `translate(-50%, -50%) scale(${1 / scale})`,
          }"
        >
          {{ marker.keep ? '+' : '−' }}
        </div>
      </div>

      <!-- Complexity overlay (screen space, above the SVG layer) -->
      <PreviewOverlay
        v-if="geometry"
        :geometry="geometry"
        :scale="scale"
        :tx="tx"
        :ty="ty"
        :doc-w="docW"
        :doc-h="docH"
        :clip-x="overlayClipX"
        :dark="store.theme === 'dark'"
        :panning="panning"
      />

      <!-- Split divider (screen space) -->
      <div
        v-if="view === 'split' && hasResult && image"
        class="divider"
        :style="{ left: `${dividerX}px` }"
        @pointerdown.stop="onDividerDown"
        @pointermove="onPointerMove"
        @pointerup="onPointerUp"
      >
        <div class="divider-line" />
        <div class="divider-grip">⇔</div>
      </div>
      <template v-if="view === 'split' && hasResult && image">
        <span class="side-chip side-left chip">PNG</span>
        <span class="side-chip side-right chip">SVG</span>
      </template>

      <!-- Stage label while busy -->
      <span v-if="store.busy && store.progress" class="stage-chip chip chip--accent">
        {{ progressLabel }}
      </span>

      <!-- Magic-select pending points helper -->
      <span v-if="store.magicActive" class="magic-chip chip chip--accent">
        {{ t('preview.points', { count: store.magicPoints.length }, store.magicPoints.length) }} ·
        <kbd>Enter</kbd> {{ t('common.apply') }} · <kbd>Esc</kbd> {{ t('common.cancel') }}
      </span>

      <!-- Complexity readout: a per-element-kind legend, colored to match the overlay -->
      <div v-if="showNodes && overlayLegend.length" class="nodes-chip chip">
        <span v-for="item in overlayLegend" :key="item.kind" class="legend-item">
          <span class="legend-dot" :style="{ background: `var(${item.token})` }" />
          {{ formatCount(item.count) }} {{ t(`shapes.${item.kind}`, item.count) }}
        </span>
      </div>

      <!-- Worker error card -->
      <div v-if="store.error && !store.busy" class="error-card card">
        <span class="error-title">{{ t('preview.errorTitle') }}</span>
        <p class="error-msg">{{ store.error }}</p>
        <button class="btn btn-primary btn-sm" @click="store.run(true)">
          {{ t('preview.retry') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.viewport {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  flex: 1;
  background: var(--bg-0);
}

.toolbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  height: 38px;
  padding: 0 10px;
  background: var(--bg-1);
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}

/* Mobile: the viewport fills the pinned result region (.main sets its height).
   Let the toolbar wrap so its controls never overflow a narrow screen. */
@media (max-width: 768px) {
  .toolbar {
    height: auto;
    min-height: 38px;
    flex-wrap: wrap;
    padding-top: 5px;
    padding-bottom: 5px;
    row-gap: 5px;
  }
}

.tabs {
  display: flex;
  gap: 2px;
  padding: 2px;
  background: var(--bg-0);
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
}

.tab {
  height: 22px;
  padding: 0 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.tab:hover:not(:disabled) {
  color: var(--text-1);
}

.tab.is-active {
  background: var(--bg-2);
  color: var(--text-1);
  box-shadow: var(--shadow-1);
}

.tab:disabled {
  opacity: 0.4;
  cursor: default;
}

.zoom {
  display: flex;
  align-items: center;
  gap: 2px;
}

.zoom-readout {
  min-width: 44px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-2);
}

.is-on {
  color: var(--accent);
}

.busy-track {
  position: absolute;
  left: 0;
  right: 0;
  bottom: -1px;
  height: 2px;
  background: var(--accent-soft);
  overflow: hidden;
  z-index: 5;
}

.busy-fill {
  height: 100%;
  background: var(--accent);
  transition: width 0.25s ease;
}

.busy-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.35), transparent);
  animation: shimmer 1.2s linear infinite;
}

@keyframes shimmer {
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
}

.pane {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  touch-action: none;
}

.cursor-grab {
  cursor: grab;
}

.cursor-grab:active {
  cursor: grabbing;
}

.cursor-crosshair {
  cursor: crosshair;
}

.doc {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
}

.doc-bg {
  position: absolute;
  inset: 0;
}

.doc-bg-solid {
  background: #ffffff;
}

.layer {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.layer-original,
.layer-diff {
  display: block;
}

.pixelated {
  image-rendering: pixelated;
}

.dimmed {
  opacity: 0.25;
}

.layer-svg :deep(svg) {
  width: 100%;
  height: 100%;
  display: block;
}

/* Layer isolation overlay: dim the rest, outline the focused layer/contour. */
.layer-highlight {
  pointer-events: none;
  z-index: 1;
}

.layer-highlight .scrim {
  fill: var(--bg-0);
  fill-opacity: 0.62;
}

.layer-highlight .focus-outline {
  stroke: var(--accent);
  opacity: 0.95;
}

.marker {
  position: absolute;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: #fff;
  box-shadow:
    0 0 0 1.5px rgba(255, 255, 255, 0.9),
    var(--shadow-1);
  pointer-events: none;
}

.marker-keep {
  background: var(--success);
}

.marker-exclude {
  background: var(--danger);
}

.divider {
  position: absolute;
  top: 0;
  bottom: 0;
  /* Wide, invisible catch area so the thin line is easy to grab anywhere. */
  width: 26px;
  margin-left: -13px;
  cursor: col-resize;
  z-index: 4;
  touch-action: none;
}

.divider-line {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2px;
  margin-left: -1px;
  background: var(--accent);
  opacity: 0.9;
}

/* Thicken the line on hover/drag so the grab target reads clearly. */
.divider:hover .divider-line {
  width: 3px;
  margin-left: -1.5px;
  opacity: 1;
}

.divider-grip {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: var(--accent);
  color: #fff;
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: var(--shadow-1);
}

.side-chip {
  position: absolute;
  top: 10px;
  z-index: 3;
  pointer-events: none;
}

.side-left {
  left: 10px;
}

.side-right {
  right: 10px;
}

.stage-chip {
  position: absolute;
  left: 10px;
  bottom: 10px;
  z-index: 5;
}

.magic-chip {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  bottom: 10px;
  z-index: 5;
}

.nodes-chip {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 5;
  height: auto;
  padding: 3px 9px;
  gap: 9px;
  pointer-events: none;
}

.legend-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--text-2);
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
}

.error-card {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 6;
  max-width: 360px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  border-color: var(--danger-soft);
  box-shadow: var(--shadow-2);
}

.error-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--danger);
}

.error-msg {
  margin: 0;
  font-size: 12px;
  color: var(--text-2);
  word-break: break-word;
}
</style>
