<script setup lang="ts">
import { DEFAULT_SETTINGS, TARGET_PROFILES } from '@vectorizer/core'
import type { VectorizeMode, VectorizeSettings } from '@vectorizer/core'
import type { PaletteSuggestion } from '@vectorizer/assist'
import { computed } from 'vue'
import { useAppStore } from '../store/appStore'
import ColorRow from './controls/ColorRow.vue'
import ControlRow from './controls/ControlRow.vue'
import SelectRow from './controls/SelectRow.vue'
import SliderRow from './controls/SliderRow.vue'
import SwitchRow from './controls/SwitchRow.vue'
import TextRow from './controls/TextRow.vue'
import MlTools from './MlTools.vue'
import SettingsIO from './SettingsIO.vue'

const store = useAppStore()
const s = computed(() => store.settings)
const D = DEFAULT_SETTINGS

function set<K extends keyof VectorizeSettings>(key: K, value: VectorizeSettings[K]): void {
  store.updateSettings({ [key]: value } as Partial<VectorizeSettings>)
}

const isColorLike = computed(() => s.value.mode === 'color' || s.value.mode === 'grayscale')
const isBwLike = computed(() => s.value.mode === 'bw' || s.value.mode === 'centerline')
const isCenterline = computed(() => s.value.mode === 'centerline')

const MODES: ReadonlyArray<{ value: VectorizeMode; label: string; title: string }> = [
  { value: 'color', label: 'Color', title: 'Multi-color tracing with a quantized palette' },
  { value: 'grayscale', label: 'Gray', title: 'Grayscale layers' },
  { value: 'bw', label: 'B&W', title: 'Single-color silhouette from a threshold' },
  {
    value: 'centerline',
    label: 'Centerline',
    title:
      'One stroke down the middle of each drawn line — for line art & pen plotters, not filled shapes',
  },
]

const fixedPalette = computed(() => s.value.palette)

function isActiveSuggestion(sug: PaletteSuggestion): boolean {
  const p = fixedPalette.value
  return p !== null && p.length === sug.colors.length && p.join(',') === sug.colors.join(',')
}
</script>

<template>
  <aside class="panel">
    <div class="panel-scroll">
      <!-- Profiles -->
      <section class="group">
        <header class="group-head">
          <h2 class="group-title">Target profile</h2>
          <button
            class="btn btn-ghost btn-sm"
            title="Reset every setting to its default"
            @click="store.resetSettings()"
          >
            Reset all
          </button>
        </header>
        <div class="profile-grid">
          <button
            v-for="profile in TARGET_PROFILES"
            :key="profile.id"
            class="profile-chip"
            :class="{
              'is-active': store.activeProfileId === profile.id,
              'is-modified': store.activeProfileId === profile.id && store.profileModified,
            }"
            :title="profile.tagline"
            @click="store.applyProfile(profile.id)"
          >
            {{ profile.label }}
            <span
              v-if="store.activeProfileId === profile.id && store.profileModified"
              class="mod-star"
              title="Settings modified from this profile"
              >•</span
            >
          </button>
        </div>
        <ul v-if="store.activeProfile" class="profile-notes">
          <li v-for="(note, i) in store.activeProfile.notes" :key="i">{{ note }}</li>
        </ul>

        <button
          class="btn auto-btn"
          :disabled="!store.hasImage"
          title="Analyze the image and recommend settings"
          @click="store.autoRecommend()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 1.5 9.3 5 13 6.3 9.3 7.7 8 11.2 6.7 7.7 3 6.3 6.7 5Zm4.5 8 .6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6ZM3 10.5l.5 1.3 1.3.5-1.3.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z"
              fill="currentColor"
            />
          </svg>
          Auto settings
        </button>

        <label
          class="auto-onload"
          title="Analyze and apply recommended settings to each image as it loads"
        >
          <input
            type="checkbox"
            :checked="store.autoOnLoad"
            @change="store.setAutoOnLoad(($event.target as HTMLInputElement).checked)"
          />
          <span>Apply automatically on load</span>
        </label>

        <div v-if="store.assistRationale" class="rationale card">
          <div class="rationale-head">
            <span>Why these settings</span>
            <button
              class="btn btn-ghost btn-icon btn-sm"
              aria-label="Dismiss"
              @click="store.dismissRationale()"
            >
              ×
            </button>
          </div>
          <ul>
            <li v-for="(reason, i) in store.assistRationale" :key="i">{{ reason }}</li>
          </ul>
        </div>
      </section>

      <SettingsIO />

      <MlTools />

      <!-- Mode -->
      <section class="group">
        <h2 class="group-title">Mode</h2>
        <div class="seg">
          <button
            v-for="mode in MODES"
            :key="mode.value"
            :class="{ 'is-active': s.mode === mode.value }"
            :title="mode.title"
            @click="set('mode', mode.value)"
          >
            {{ mode.label }}
          </button>
        </div>
      </section>

      <!-- Input -->
      <section class="group">
        <h2 class="group-title">Input</h2>
        <SliderRow
          label="Max size"
          :model-value="s.maxDimension"
          :min="0"
          :max="4096"
          :step="16"
          :default-value="D.maxDimension"
          zero-label="original"
          hint="Longest side is downscaled to this many pixels before tracing. 0 keeps the original size."
          @update:model-value="set('maxDimension', $event)"
        />
        <SelectRow
          label="Denoise"
          :model-value="s.denoise"
          :options="[
            { value: 'none', label: 'None' },
            { value: 'median', label: 'Median (dust & specks)' },
            { value: 'bilateral', label: 'Bilateral (photo noise)' },
          ]"
          :default-value="D.denoise"
          hint="Pre-filter to remove noise before tracing"
          @update:model-value="set('denoise', $event)"
        />
        <SliderRow
          label="Blur"
          :model-value="s.blurRadius"
          :min="0"
          :max="10"
          :step="0.5"
          :default-value="D.blurRadius"
          hint="Gaussian pre-blur radius (px). Helps noisy photos, hurts crisp art."
          @update:model-value="set('blurRadius', $event)"
        />
        <SelectRow
          label="Background"
          :model-value="s.background"
          :options="[
            { value: 'auto', label: 'Auto detect' },
            { value: 'transparent', label: 'Treat alpha as empty' },
            { value: 'custom', label: 'Composite over color' },
          ]"
          :default-value="D.background"
          hint="How transparent pixels are handled"
          @update:model-value="set('background', $event)"
        />
        <ColorRow
          v-if="s.background === 'custom'"
          label="Backdrop"
          :model-value="s.backgroundColor"
          :default-value="D.backgroundColor"
          hint="The image is composited over this color first"
          @update:model-value="set('backgroundColor', $event)"
        />
        <SliderRow
          v-if="s.background !== 'custom'"
          label="Alpha cutoff"
          :model-value="s.alphaThreshold"
          :min="0"
          :max="255"
          :default-value="D.alphaThreshold"
          hint="Alpha below this counts as empty"
          @update:model-value="set('alphaThreshold', $event)"
        />
      </section>

      <!-- Palette -->
      <section v-if="isColorLike" class="group">
        <h2 class="group-title">Palette</h2>

        <div class="pal-list" role="listbox" aria-label="Palette source">
          <button
            class="pal-row"
            role="option"
            :class="{ 'is-active': fixedPalette === null }"
            :aria-selected="fixedPalette === null"
            title="Extract the palette from the image with k-means"
            @click="store.clearFixedPalette()"
          >
            <span class="pal-label">Automatic</span>
            <span class="pal-meta">k-means · {{ s.paletteSize }} colors</span>
          </button>
          <button
            v-for="sug in store.paletteSuggestions"
            :key="sug.id"
            class="pal-row"
            role="option"
            :class="{ 'is-active': isActiveSuggestion(sug) }"
            :aria-selected="isActiveSuggestion(sug)"
            :title="sug.description"
            @click="store.setFixedPalette(sug.colors)"
          >
            <span class="pal-label">{{ sug.label }}</span>
            <span class="pal-strip">
              <span
                v-for="(color, i) in sug.colors"
                :key="i"
                class="pal-mini"
                :style="{ background: color }"
              />
            </span>
          </button>
          <p v-if="store.paletteSuggestionsPending" class="pal-pending">
            updating suggestions for this image…
          </p>
        </div>

        <!-- Active fixed palette: edit in place -->
        <div v-if="fixedPalette" class="pal-edit">
          <span
            v-for="(color, i) in fixedPalette"
            :key="i"
            class="pal-swatch"
            :style="{ background: color }"
            :title="color"
          >
            <input
              type="color"
              :value="color"
              :aria-label="`Edit palette color ${i + 1}`"
              @input="store.editPaletteEntry(i, ($event.target as HTMLInputElement).value)"
            />
            <button
              class="pal-remove"
              :aria-label="`Remove palette color ${i + 1}`"
              @click="store.removePaletteEntry(i)"
            >
              ×
            </button>
          </span>
          <button class="pal-add" title="Add a color" @click="store.addPaletteEntry()">+</button>
          <button
            class="chip chip--btn pal-back"
            title="Return to automatic palette extraction"
            @click="store.clearFixedPalette()"
          >
            × back to automatic
          </button>
        </div>

        <template v-if="fixedPalette === null">
          <SliderRow
            label="Colors"
            :model-value="s.paletteSize"
            :min="2"
            :max="64"
            :default-value="D.paletteSize"
            hint="Number of output colors"
            @update:model-value="set('paletteSize', $event)"
          />
          <SwitchRow
            label="Auto reduce"
            :model-value="s.autoPaletteSize"
            :default-value="D.autoPaletteSize"
            hint="Merge near-duplicate colors so simple art gets fewer layers"
            @update:model-value="set('autoPaletteSize', $event)"
          />
          <SliderRow
            label="Quality"
            :model-value="s.quantizeQuality"
            :min="1"
            :max="10"
            :default-value="D.quantizeQuality"
            hint="Clustering effort — higher is slower and more accurate"
            @update:model-value="set('quantizeQuality', $event)"
          />
          <SelectRow
            label="Color space"
            :model-value="s.colorSpace"
            :options="[
              { value: 'oklab', label: 'Oklab (perceptual)' },
              { value: 'rgb', label: 'RGB' },
            ]"
            :default-value="D.colorSpace"
            hint="Clustering space — Oklab is almost always better"
            @update:model-value="set('colorSpace', $event)"
          />
        </template>

        <ControlRow label="Layering" hint="How color layers relate to each other">
          <div class="radio-cards">
            <button
              :class="{ 'is-active': s.layering === 'stacked' }"
              title="Layers are painted back-to-front and extend under each other"
              @click="set('layering', 'stacked')"
            >
              <strong>Stacked</strong>
              <span>Seam-proof overdraw</span>
            </button>
            <button
              :class="{ 'is-active': s.layering === 'cutout' }"
              title="Exact partition with mathematically shared edges"
              @click="set('layering', 'cutout')"
            >
              <strong>Cutout</strong>
              <span>Exact edges, cut-ready</span>
            </button>
          </div>
        </ControlRow>
        <SliderRow
          label="Min region"
          :model-value="s.minRegionArea"
          :min="0"
          :max="256"
          :default-value="D.minRegionArea"
          hint="Regions smaller than this many pixels are merged away"
          @update:model-value="set('minRegionArea', $event)"
        />
        <SwitchRow
          label="Keep details"
          :model-value="s.preserveDetails"
          :default-value="D.preserveDetails"
          hint="Keep small high-contrast features (e.g. a logo dot) instead of merging them away"
          @update:model-value="set('preserveDetails', $event)"
        />
        <SliderRow
          v-if="s.layering === 'cutout'"
          label="Gap fill"
          :model-value="s.gapFill"
          :min="0"
          :max="2"
          :step="0.05"
          :default-value="D.gapFill"
          zero-label="off"
          hint="Hairline-seam compensation stroke width (px) for cutout rendering"
          @update:model-value="set('gapFill', $event)"
        />
        <SwitchRow
          label="Omit background"
          :model-value="s.omitBackground"
          :default-value="D.omitBackground"
          hint="Drop the layer matching the detected background color (stickers, cut files)"
          @update:model-value="set('omitBackground', $event)"
        />
        <SwitchRow
          label="Group by color"
          :model-value="s.groupByColor"
          :default-value="D.groupByColor"
          hint="Wrap each color in its own layer group — one selectable sheet/screen per color for cutting or printing"
          @update:model-value="set('groupByColor', $event)"
        />
      </section>

      <!-- Threshold -->
      <section v-if="isBwLike" class="group">
        <h2 class="group-title">Threshold</h2>
        <SelectRow
          label="Method"
          :model-value="s.thresholdMode"
          :options="[
            { value: 'auto', label: 'Auto (Otsu)' },
            { value: 'fixed', label: 'Fixed level' },
            { value: 'adaptive', label: 'Adaptive (uneven light)' },
          ]"
          :default-value="D.thresholdMode"
          hint="How the ink / paper split is chosen"
          @update:model-value="set('thresholdMode', $event)"
        />
        <SliderRow
          v-if="s.thresholdMode === 'fixed'"
          label="Level"
          :model-value="s.threshold"
          :min="0"
          :max="255"
          :default-value="D.threshold"
          hint="Pixels darker than this become ink"
          @update:model-value="set('threshold', $event)"
        />
        <template v-if="s.thresholdMode === 'adaptive'">
          <SliderRow
            label="Radius"
            :model-value="s.adaptiveRadius"
            :min="2"
            :max="128"
            :default-value="D.adaptiveRadius"
            hint="Window radius (px) for the local mean"
            @update:model-value="set('adaptiveRadius', $event)"
          />
          <SliderRow
            label="Bias"
            :model-value="s.adaptiveBias"
            :min="-64"
            :max="64"
            :default-value="D.adaptiveBias"
            hint="Added to the local mean — positive keeps only clearly darker pixels"
            @update:model-value="set('adaptiveBias', $event)"
          />
        </template>
        <SwitchRow
          label="Invert"
          :model-value="s.invert"
          :default-value="D.invert"
          hint="Trace light-on-dark artwork"
          @update:model-value="set('invert', $event)"
        />
      </section>

      <!-- Curves -->
      <section class="group">
        <h2 class="group-title">Curves</h2>
        <SelectRow
          label="Geometry"
          :model-value="s.curveMode"
          :options="[
            { value: 'spline', label: 'Smooth splines' },
            { value: 'polygon', label: 'Straight polygons' },
            { value: 'pixel', label: 'Exact pixel edges' },
          ]"
          :default-value="D.curveMode"
          hint="Spline fits Béziers; pixel keeps every stair-step (pixel art)"
          @update:model-value="set('curveMode', $event)"
        />
        <SliderRow
          label="Smoothing"
          :model-value="s.smoothing"
          :min="0"
          :max="1"
          :step="0.01"
          :default-value="D.smoothing"
          :disabled="s.curveMode !== 'spline'"
          hint="0 keeps every corner, 1 smooths aggressively"
          @update:model-value="set('smoothing', $event)"
        />
        <SwitchRow
          label="Optimize"
          :model-value="s.curveOptimize"
          :default-value="D.curveOptimize"
          :disabled="s.curveMode === 'pixel'"
          hint="Merge adjacent curve segments when a single curve fits"
          @update:model-value="set('curveOptimize', $event)"
        />
        <SliderRow
          v-if="s.curveOptimize && s.curveMode !== 'pixel'"
          label="Tolerance"
          :model-value="s.optTolerance"
          :min="0"
          :max="5"
          :step="0.05"
          :default-value="D.optTolerance"
          hint="Max deviation (px) allowed when merging curves"
          @update:model-value="set('optTolerance', $event)"
        />
        <details class="advanced">
          <summary>Advanced</summary>
          <SelectRow
            label="Turn policy"
            :model-value="s.turnPolicy"
            :options="[
              { value: 'minority', label: 'Minority' },
              { value: 'majority', label: 'Majority' },
              { value: 'black', label: 'Black' },
              { value: 'white', label: 'White' },
              { value: 'left', label: 'Left' },
              { value: 'right', label: 'Right' },
            ]"
            :default-value="D.turnPolicy"
            hint="Ambiguity resolution at checkerboard junctions"
            @update:model-value="set('turnPolicy', $event)"
          />
          <SliderRow
            label="Simplify"
            :model-value="s.simplifyTolerance"
            :min="0"
            :max="10"
            :step="0.1"
            :default-value="D.simplifyTolerance"
            hint="Pre-fit polyline simplification epsilon (px), open paths / polygon mode"
            @update:model-value="set('simplifyTolerance', $event)"
          />
          <SliderRow
            label="Corner angle"
            :model-value="s.cornerThreshold"
            :min="0"
            :max="180"
            :default-value="D.cornerThreshold"
            hint="Interior angle (°) below which an open-path vertex is pinned as a corner (centerline)"
            @update:model-value="set('cornerThreshold', $event)"
          />
          <SliderRow
            label="Fit tolerance"
            :model-value="s.fitTolerance"
            :min="0.1"
            :max="10"
            :step="0.1"
            :default-value="D.fitTolerance"
            hint="Max fitting error (px) for open-path Bézier fitting (centerline)"
            @update:model-value="set('fitTolerance', $event)"
          />
        </details>
      </section>

      <!-- Centerline -->
      <section v-if="isCenterline" class="group">
        <h2 class="group-title">Centerline</h2>
        <p class="mode-note">
          Traces one stroke down the middle of each drawn line — for line art, handwriting and pen
          plotters. On filled shapes or photos it returns a spidery skeleton, not matching outlines;
          use B&amp;W or Color there.
        </p>
        <SliderRow
          label="Stroke width"
          :model-value="s.strokeWidth"
          :min="0"
          :max="64"
          :step="0.5"
          :default-value="D.strokeWidth"
          zero-label="auto"
          hint="Output stroke width (px). 0 estimates it from the ink width."
          @update:model-value="set('strokeWidth', $event)"
        />
        <SliderRow
          label="Prune"
          :model-value="s.pruneLength"
          :min="0"
          :max="128"
          :default-value="D.pruneLength"
          hint="Skeleton branches shorter than this (px) are removed as noise"
          @update:model-value="set('pruneLength', $event)"
        />
      </section>

      <!-- Output -->
      <section class="group">
        <h2 class="group-title">Output</h2>
        <ColorRow
          v-if="isBwLike"
          label="Ink color"
          :model-value="s.fillColor"
          :default-value="D.fillColor"
          hint="Paint color for B&W and centerline output"
          @update:model-value="set('fillColor', $event)"
        />
        <SliderRow
          label="Precision"
          :model-value="s.precision"
          :min="0"
          :max="4"
          :default-value="D.precision"
          hint="Decimal places for SVG coordinates"
          @update:model-value="set('precision', $event)"
        />
        <SwitchRow
          label="Minify paths"
          :model-value="s.optimizeSvg"
          :default-value="D.optimizeSvg"
          hint="Compact path data with relative and H/V commands — identical shapes, smaller file"
          @update:model-value="set('optimizeSvg', $event)"
        />
        <ControlRow label="Units" hint="px for screens, mm for physical machines">
          <div class="seg unit-seg">
            <button :class="{ 'is-active': s.unit === 'px' }" @click="set('unit', 'px')">px</button>
            <button :class="{ 'is-active': s.unit === 'mm' }" @click="set('unit', 'mm')">mm</button>
          </div>
        </ControlRow>
        <SliderRow
          v-if="s.unit === 'mm'"
          label="Width (mm)"
          :model-value="s.widthMm"
          :min="0"
          :max="1000"
          :default-value="D.widthMm"
          zero-label="96 dpi"
          hint="Physical width. 0 derives it from the pixel size at 96 dpi."
          @update:model-value="set('widthMm', $event)"
        />
        <TextRow
          label="Title"
          :model-value="s.svgTitle"
          :default-value="D.svgTitle"
          placeholder="Untitled"
          hint="Embedded as the SVG <title>"
          @update:model-value="set('svgTitle', $event)"
        />
        <SwitchRow
          label="Island check"
          :model-value="s.detectIslands"
          :default-value="D.detectIslands"
          hint="Warn about enclosed islands that would fall out of a physical stencil"
          @update:model-value="set('detectIslands', $event)"
        />
      </section>
    </div>
  </aside>
</template>

<style scoped>
.panel {
  display: flex;
  flex-direction: column;
  width: 320px;
  flex: 0 0 320px;
  min-height: 0;
  background: var(--bg-1);
  border-right: 1px solid var(--border);
}

.panel-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* Mobile: the command fills the space beneath the pinned result and scrolls
   on its own (the toggle bar above it provides the visual separation). */
@media (max-width: 768px) {
  .panel {
    width: 100%;
    flex: 1;
    min-height: 0;
    border-right: none;
  }
}

.group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-title {
  margin: 0 0 4px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.mode-note {
  margin: 0 0 6px;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-3);
}

/* Profiles */
.profile-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.profile-chip {
  position: relative;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition:
    border-color 0.12s ease,
    color 0.12s ease,
    background 0.12s ease;
}

.profile-chip:hover {
  border-color: var(--border-strong);
  color: var(--text-1);
}

.profile-chip.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
  color: var(--accent);
}

.mod-star {
  position: absolute;
  top: 0;
  right: 5px;
  color: var(--warn);
  font-size: 14px;
}

.profile-notes {
  margin: 6px 0 0;
  padding: 8px 10px 8px 24px;
  border-radius: var(--radius-s);
  background: var(--bg-2);
  color: var(--text-2);
  font-size: 11px;
  line-height: 1.5;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.auto-btn {
  margin-top: 8px;
  width: 100%;
}

.auto-onload {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 8px;
  font-size: 11.5px;
  color: var(--text-2);
  cursor: pointer;
  user-select: none;
}

.auto-onload input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  cursor: pointer;
}

.rationale {
  margin-top: 8px;
  padding: 8px 10px;
  border-color: var(--accent-soft);
  background: color-mix(in srgb, var(--accent-soft) 50%, var(--bg-1));
}

.rationale-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--accent);
}

.rationale ul {
  margin: 4px 0 0;
  padding-left: 16px;
  font-size: 11.5px;
  color: var(--text-2);
  line-height: 1.55;
}

/* Palette suggestions */
.pal-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-bottom: 4px;
}

.pal-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-height: 26px;
  padding: 3px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-2);
  cursor: pointer;
  transition: border-color 0.12s ease;
}

.pal-row:hover {
  border-color: var(--border-strong);
}

.pal-row.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.pal-label {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-1);
  white-space: nowrap;
}

.pal-meta {
  font-size: 10.5px;
  color: var(--text-3);
}

.pal-strip {
  display: flex;
  gap: 2px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.pal-mini {
  width: 10px;
  height: 10px;
  border-radius: 2px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.2);
}

.pal-pending {
  margin: 0;
  font-size: 10.5px;
  color: var(--text-3);
  font-style: italic;
}

/* Fixed palette editing */
.pal-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
  padding: 6px;
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-s);
  margin-bottom: 4px;
}

.pal-swatch {
  position: relative;
  width: 20px;
  height: 20px;
  border-radius: 4px;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.25);
  cursor: pointer;
}

.pal-swatch input[type='color'] {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  opacity: 0;
  cursor: pointer;
}

.pal-remove {
  position: absolute;
  top: -5px;
  right: -5px;
  width: 12px;
  height: 12px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: var(--danger);
  color: #fff;
  font-size: 9px;
  line-height: 1;
  cursor: pointer;
  display: none;
  align-items: center;
  justify-content: center;
}

.pal-swatch:hover .pal-remove {
  display: flex;
}

.pal-add {
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px dashed var(--border-strong);
  border-radius: 4px;
  background: transparent;
  color: var(--text-2);
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
}

.pal-add:hover {
  border-color: var(--accent);
  color: var(--accent);
}

.pal-back {
  margin-left: auto;
}

/* Radio cards */
.radio-cards {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
  flex: 1;
}

.radio-cards button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
  padding: 5px 8px;
  border: 1px solid var(--border);
  border-radius: var(--radius-s);
  background: var(--bg-2);
  cursor: pointer;
  text-align: left;
  transition: border-color 0.12s ease;
}

.radio-cards button:hover {
  border-color: var(--border-strong);
}

.radio-cards button.is-active {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.radio-cards strong {
  font-size: 11.5px;
  color: var(--text-1);
}

.radio-cards span {
  font-size: 9.5px;
  color: var(--text-3);
  line-height: 1.3;
}

/* Advanced collapsible */
.advanced {
  margin-top: 2px;
}

.advanced summary {
  list-style: none;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-3);
  cursor: pointer;
  user-select: none;
  padding: 2px 0;
}

.advanced summary::-webkit-details-marker {
  display: none;
}

.advanced summary::before {
  content: '▸';
  font-size: 9px;
  transition: transform 0.12s ease;
}

.advanced[open] summary::before {
  transform: rotate(90deg);
}

.advanced summary:hover {
  color: var(--text-1);
}

.unit-seg {
  width: 110px;
}
</style>
