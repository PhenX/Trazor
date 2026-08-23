<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { copyText } from '../lib/download'
import { formatCount } from '../lib/format'
import { framingViewBox } from '../lib/layers'
import type { Layer, LayerShape } from '../lib/layers'
import { useAppStore } from '../store/appStore'
import LayerThumb from './LayerThumb.vue'

/**
 * Layer visualizer: a tree of the traced SVG's color layers — one row per
 * color (the unit a cutting machine weeds and stacks), expandable to the
 * individual contours on that layer. Each row previews its shape (enlarged in a
 * hover popover) and, on hover or selection, isolates that layer in the main
 * preview via the store's `layerFocus`. Built for makers checking a file before
 * importing it into Cricut / Brother ScanNCut: is it too many layers, or too
 * many shapes?
 */

const store = useAppStore()
const { t } = useI18n()

const model = computed(() => store.layerModel)
const layers = computed<Layer[]>(() => model.value?.layers ?? [])

const docW = computed(() => model.value?.width ?? null)
const docH = computed(() => model.value?.height ?? null)

// Rows the user has expanded to reveal their contours.
const expanded = reactive(new Set<number>())

// Fresh geometry means stale indices — reset local view state.
watch(model, () => {
  expanded.clear()
  popover.value = null
})

function layerViewBox(layer: Layer): string {
  return framingViewBox(layer.bounds, docW.value, docH.value)
}
function shapeViewBox(shape: LayerShape): string {
  return framingViewBox(shape.bounds, docW.value, docH.value)
}

function toggleExpand(index: number): void {
  if (expanded.has(index)) expanded.delete(index)
  else expanded.add(index)
}

function isActive(index: number): boolean {
  return store.layerFocus?.layer === index
}

async function copyColor(color: string): Promise<void> {
  const ok = await copyText(color)
  store.notify(
    ok ? t('toasts.hexCopied', { hex: color }) : t('toasts.clipboardUnavailable'),
    ok ? 'success' : 'error',
  )
}

// --------------------------- Hover / highlight ---------------------------
function hoverLayer(index: number): void {
  store.setLayerHover({ layer: index, shape: null })
}
function hoverShape(layer: number, shape: number): void {
  store.setLayerHover({ layer, shape })
}
function clearHover(): void {
  store.setLayerHover(null)
  popover.value = null
}

// --------------------------- Enlarged preview ----------------------------
// A hover-only popover with a bigger take on the same tile (no touch hover).
const hoverCapable = typeof window !== 'undefined' && window.matchMedia('(hover: hover)').matches

interface Popover {
  d: string
  viewBox: string
  color: string
  stroke: boolean
  caption: string
  right: number
  top: number
}
const popover = ref<Popover | null>(null)

function openPopover(
  event: MouseEvent,
  d: string,
  viewBox: string,
  color: string,
  stroke: boolean,
  caption: string,
): void {
  if (!hoverCapable) return
  const row = (event.currentTarget as HTMLElement).getBoundingClientRect()
  const top = Math.min(Math.max(row.top + row.height / 2, 130), window.innerHeight - 130)
  popover.value = {
    d,
    viewBox,
    color,
    stroke,
    caption,
    right: window.innerWidth - row.left + 12,
    top,
  }
}

function onLayerEnter(event: MouseEvent, layer: Layer): void {
  hoverLayer(layer.index)
  openPopover(
    event,
    layer.d,
    layerViewBox(layer),
    layer.color,
    layer.stroke,
    t('layers.shapesNodes', {
      shapes: formatCount(layer.shapes.length),
      nodes: formatCount(layer.nodeCount),
    }),
  )
}
function onShapeEnter(event: MouseEvent, layer: Layer, shape: LayerShape, si: number): void {
  hoverShape(layer.index, si)
  openPopover(
    event,
    shape.d,
    shapeViewBox(shape),
    layer.color,
    layer.stroke,
    t('layers.contourNodes', { index: si + 1, nodes: formatCount(shape.nodeCount) }),
  )
}

const popoverStyle = computed(() =>
  popover.value ? { right: `${popover.value.right}px`, top: `${popover.value.top}px` } : {},
)

// ------------------------------- Summary ---------------------------------
const summary = computed(() => {
  const m = model.value
  if (!m || m.layers.length === 0) return null
  return {
    layers: m.layers.length,
    shapes: m.totalShapes,
    nodes: formatCount(m.totalNodes),
  }
})
</script>

<template>
  <aside class="layer-panel" aria-label="Layers">
    <header class="lp-head">
      <div class="lp-title-row">
        <h2 class="lp-title">{{ t('layers.title') }}</h2>
        <button
          class="btn btn-ghost btn-icon btn-sm lp-collapse"
          :title="t('layers.hide')"
          :aria-label="t('layers.hide')"
          @click="store.setLayersOpen(false)"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M6 3l5 5-5 5"
              fill="none"
              stroke="currentColor"
              stroke-width="1.6"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </button>
      </div>
      <p v-if="summary" class="lp-summary">
        {{ t('layers.summary', { layers: summary.layers }, summary.layers) }}
        <span class="lp-dot">·</span>
        {{ t('layers.summaryShapes', { count: summary.shapes }, summary.shapes) }}
        <span class="lp-dot">·</span>
        {{ t('layers.summaryNodes', { count: summary.nodes }) }}
      </p>
    </header>

    <div v-if="!layers.length" class="lp-empty">
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true">
        <path
          d="M16 4 28 10 16 16 4 10 16 4Z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
        />
        <path
          d="M4 16 16 22 28 16M4 22 16 28 28 22"
          fill="none"
          stroke="currentColor"
          stroke-width="1.6"
          stroke-linejoin="round"
          opacity="0.5"
        />
      </svg>
      <p>{{ t('layers.empty') }}</p>
    </div>

    <ul v-else class="lp-list" @mouseleave="clearHover">
      <li v-for="layer in layers" :key="layer.key" class="lp-layer">
        <div class="lp-row" :class="{ 'is-active': isActive(layer.index) }">
          <button
            class="lp-expand"
            :class="{ 'is-open': expanded.has(layer.index) }"
            :aria-expanded="expanded.has(layer.index)"
            :title="t('layers.toggleContours')"
            :aria-label="t('layers.toggleContours')"
            @click="toggleExpand(layer.index)"
          >
            <svg viewBox="0 0 16 16" width="10" height="10" aria-hidden="true">
              <path
                d="M6 4l4 4-4 4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.7"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </button>

          <button
            class="lp-main"
            :title="t('layers.rowTitle')"
            @mouseenter="onLayerEnter($event, layer)"
            @focus="hoverLayer(layer.index)"
            @click="store.toggleSelectedLayer(layer.index)"
          >
            <span class="lp-thumb">
              <LayerThumb
                :d="layer.d"
                :view-box="layerViewBox(layer)"
                :color="layer.color"
                :stroke="layer.stroke"
              />
            </span>
            <span class="lp-info">
              <span class="lp-color mono">{{ layer.color }}</span>
              <span class="lp-counts">
                {{ t('layers.shapeCount', { count: layer.shapes.length }, layer.shapes.length) }}
                ·
                {{ t('layers.nodeCount', { count: formatCount(layer.nodeCount) }) }}
              </span>
            </span>
            <span
              v-if="store.selectedLayer === layer.index"
              class="lp-pin"
              :title="t('layers.pinned')"
              aria-hidden="true"
            />
          </button>

          <button
            class="lp-swatch"
            :style="{ background: layer.color }"
            :title="t('layers.copyColor', { hex: layer.color })"
            :aria-label="t('layers.copyColor', { hex: layer.color })"
            @click="copyColor(layer.color)"
          />
        </div>

        <ul v-if="expanded.has(layer.index)" class="lp-shapes">
          <li v-for="(shape, si) in layer.shapes" :key="si">
            <button
              class="lp-shape"
              :class="{
                'is-active':
                  store.layerFocus?.layer === layer.index && store.layerFocus?.shape === si,
              }"
              @mouseenter="onShapeEnter($event, layer, shape, si)"
              @focus="hoverShape(layer.index, si)"
              @click="store.toggleSelectedLayer(layer.index)"
            >
              <span class="lp-shape-thumb">
                <LayerThumb
                  :d="shape.d"
                  :view-box="shapeViewBox(shape)"
                  :color="layer.color"
                  :stroke="layer.stroke"
                />
              </span>
              <span class="lp-shape-label">{{ t('layers.contour', { index: si + 1 }) }}</span>
              <span class="lp-shape-nodes mono">{{ formatCount(shape.nodeCount) }}</span>
            </button>
          </li>
        </ul>
      </li>
    </ul>

    <Teleport to="body">
      <div v-if="popover" class="lp-popover card" :style="popoverStyle">
        <div class="lp-popover-art">
          <LayerThumb
            :d="popover.d"
            :view-box="popover.viewBox"
            :color="popover.color"
            :stroke="popover.stroke"
          />
        </div>
        <div class="lp-popover-cap">
          <span class="lp-popover-swatch" :style="{ background: popover.color }" />
          <span>{{ popover.caption }}</span>
        </div>
      </div>
    </Teleport>
  </aside>
</template>

<style scoped>
.layer-panel {
  display: flex;
  flex-direction: column;
  width: 300px;
  flex: 0 0 300px;
  min-height: 0;
  background: var(--bg-1);
  border-left: 1px solid var(--border);
}

.lp-head {
  flex: 0 0 auto;
  padding: 10px 10px 8px;
  border-bottom: 1px solid var(--border);
}

.lp-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.lp-title {
  margin: 0;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.lp-summary {
  margin: 6px 0 0;
  font-size: 11.5px;
  color: var(--text-2);
}

.lp-dot {
  color: var(--text-3);
  margin: 0 2px;
}

.lp-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 24px;
  color: var(--text-3);
  text-align: center;
}

.lp-empty p {
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  max-width: 200px;
}

.lp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.lp-row {
  display: flex;
  align-items: center;
  gap: 2px;
  border-radius: var(--radius-s);
  border: 1px solid transparent;
  transition:
    background 0.12s ease,
    border-color 0.12s ease;
}

.lp-row.is-active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}

.lp-expand {
  flex: 0 0 auto;
  width: 20px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  border-radius: 4px;
}

.lp-expand:hover {
  color: var(--text-1);
}

.lp-expand svg {
  transition: transform 0.14s ease;
}

.lp-expand.is-open svg {
  transform: rotate(90deg);
}

.lp-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 4px 4px;
  border: none;
  background: transparent;
  cursor: pointer;
  text-align: left;
  border-radius: 4px;
}

.lp-thumb {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
}

.lp-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lp-color {
  font-size: 12px;
  color: var(--text-1);
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-counts {
  font-size: 10.5px;
  color: var(--text-3);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-pin {
  flex: 0 0 auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
}

.lp-swatch {
  flex: 0 0 auto;
  width: 18px;
  height: 18px;
  margin-right: 4px;
  padding: 0;
  border: none;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28);
  cursor: pointer;
}

.lp-swatch:hover {
  transform: scale(1.12);
}

.lp-shapes {
  list-style: none;
  margin: 1px 0 3px;
  padding: 0 0 0 22px;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.lp-shape {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 3px 6px;
  border: 1px solid transparent;
  background: transparent;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.lp-shape:hover {
  background: var(--bg-2);
}

.lp-shape.is-active {
  background: var(--accent-soft);
  border-color: color-mix(in srgb, var(--accent) 35%, transparent);
}

.lp-shape-thumb {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
}

.lp-shape-label {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lp-shape-nodes {
  flex: 0 0 auto;
  font-size: 10.5px;
  color: var(--text-3);
}

/* Enlarged hover preview — teleported to body, left of the panel. */
.lp-popover {
  position: fixed;
  z-index: 60;
  transform: translateY(-50%);
  width: 216px;
  padding: 8px;
  box-shadow: var(--shadow-2);
  pointer-events: none;
}

.lp-popover-art {
  width: 100%;
  height: 200px;
}

.lp-popover-cap {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 7px;
  font-size: 11px;
  color: var(--text-2);
}

.lp-popover-swatch {
  flex: 0 0 auto;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.28);
}
</style>
