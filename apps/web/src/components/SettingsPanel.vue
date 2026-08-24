<script setup lang="ts">
import { DEFAULT_SETTINGS, TARGET_PROFILES } from '@trazor/core'
import type { VectorizeMode, VectorizeSettings } from '@trazor/core'
import type { PaletteSuggestion } from '@trazor/assist'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
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
const { t, tm, rt } = useI18n()
const s = computed(() => store.settings)
const D = DEFAULT_SETTINGS

function set<K extends keyof VectorizeSettings>(key: K, value: VectorizeSettings[K]): void {
  store.updateSettings({ [key]: value } as Partial<VectorizeSettings>)
}

const isColorLike = computed(() => s.value.mode === 'color' || s.value.mode === 'grayscale')
const isBwLike = computed(() => s.value.mode === 'bw' || s.value.mode === 'centerline')
const isCenterline = computed(() => s.value.mode === 'centerline')

const MODES: ReadonlyArray<{ value: VectorizeMode }> = [
  { value: 'color' },
  { value: 'grayscale' },
  { value: 'bw' },
  { value: 'centerline' },
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
          <h2 class="group-title">{{ t('panel.targetProfile') }}</h2>
          <button
            class="btn btn-ghost btn-sm"
            :title="t('panel.resetAllTitle')"
            @click="store.resetSettings()"
          >
            {{ t('panel.resetAll') }}
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
            :title="t(`profiles.${profile.id}.tagline`)"
            @click="store.applyProfile(profile.id)"
          >
            {{ t(`profiles.${profile.id}.label`) }}
            <span
              v-if="store.activeProfileId === profile.id && store.profileModified"
              class="mod-star"
              :title="t('panel.profileModifiedStar')"
              >•</span
            >
          </button>
        </div>
        <ul v-if="store.activeProfileId" class="profile-notes">
          <li v-for="(note, i) in tm(`profiles.${store.activeProfileId}.notes`)" :key="i">
            {{ rt(note) }}
          </li>
        </ul>

        <button
          class="btn auto-btn"
          :disabled="!store.hasImage"
          :title="t('panel.autoSettingsTitle')"
          @click="store.autoRecommend()"
        >
          <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true">
            <path
              d="M8 1.5 9.3 5 13 6.3 9.3 7.7 8 11.2 6.7 7.7 3 6.3 6.7 5Zm4.5 8 .6 1.7 1.7.6-1.7.6-.6 1.7-.6-1.7-1.7-.6 1.7-.6ZM3 10.5l.5 1.3 1.3.5-1.3.5-.5 1.2-.5-1.2-1.2-.5 1.2-.5Z"
              fill="currentColor"
            />
          </svg>
          {{ t('panel.autoSettings') }}
        </button>

        <label class="auto-onload" :title="t('panel.applyOnLoadTitle')">
          <input
            type="checkbox"
            :checked="store.autoOnLoad"
            @change="store.setAutoOnLoad(($event.target as HTMLInputElement).checked)"
          />
          <span>{{ t('panel.applyOnLoad') }}</span>
        </label>

        <div v-if="store.assistRationale" class="rationale card">
          <div class="rationale-head">
            <span>{{ t('panel.why') }}</span>
            <button
              class="btn btn-ghost btn-icon btn-sm"
              :aria-label="t('common.dismiss')"
              @click="store.dismissRationale()"
            >
              ×
            </button>
          </div>
          <ul>
            <li v-for="(reason, i) in store.assistRationale" :key="i">
              {{ t(`rationale.${reason.code}`, reason.params ?? {}) }}
            </li>
          </ul>
        </div>
      </section>

      <SettingsIO />

      <MlTools />

      <!-- Mode -->
      <section class="group">
        <h2 class="group-title">{{ t('panel.sectionMode') }}</h2>
        <div class="seg">
          <button
            v-for="mode in MODES"
            :key="mode.value"
            :class="{ 'is-active': s.mode === mode.value }"
            :title="t(`modes.${mode.value}.title`)"
            @click="set('mode', mode.value)"
          >
            {{ t(`modes.${mode.value}.label`) }}
          </button>
        </div>
      </section>

      <!-- Input -->
      <section class="group">
        <h2 class="group-title">{{ t('panel.sectionInput') }}</h2>
        <SliderRow
          :label="t('settings.maxSize.label')"
          :model-value="s.maxDimension"
          :min="0"
          :max="4096"
          :step="16"
          :default-value="D.maxDimension"
          :zero-label="t('settings.maxSize.zero')"
          :hint="t('settings.maxSize.hint')"
          @update:model-value="set('maxDimension', $event)"
        />
        <SelectRow
          :label="t('settings.denoise.label')"
          :model-value="s.denoise"
          :options="[
            { value: 'none', label: t('settings.denoise.none') },
            { value: 'median', label: t('settings.denoise.median') },
            { value: 'bilateral', label: t('settings.denoise.bilateral') },
          ]"
          :default-value="D.denoise"
          :hint="t('settings.denoise.hint')"
          @update:model-value="set('denoise', $event)"
        />
        <SliderRow
          :label="t('settings.blur.label')"
          :model-value="s.blurRadius"
          :min="0"
          :max="10"
          :step="0.5"
          :default-value="D.blurRadius"
          :hint="t('settings.blur.hint')"
          @update:model-value="set('blurRadius', $event)"
        />
        <SliderRow
          :label="t('settings.flattenShading.label')"
          :model-value="s.flattenShading"
          :min="0"
          :max="1"
          :step="0.05"
          :default-value="D.flattenShading"
          :zero-label="t('settings.flattenShading.zero')"
          :hint="t('settings.flattenShading.hint')"
          @update:model-value="set('flattenShading', $event)"
        />
        <SelectRow
          :label="t('settings.background.label')"
          :model-value="s.background"
          :options="[
            { value: 'auto', label: t('settings.background.auto') },
            { value: 'transparent', label: t('settings.background.transparent') },
            { value: 'custom', label: t('settings.background.custom') },
          ]"
          :default-value="D.background"
          :hint="t('settings.background.hint')"
          @update:model-value="set('background', $event)"
        />
        <ColorRow
          v-if="s.background === 'custom'"
          :label="t('settings.backdrop.label')"
          :model-value="s.backgroundColor"
          :default-value="D.backgroundColor"
          :hint="t('settings.backdrop.hint')"
          @update:model-value="set('backgroundColor', $event)"
        />
        <SliderRow
          v-if="s.background !== 'custom'"
          :label="t('settings.alphaCutoff.label')"
          :model-value="s.alphaThreshold"
          :min="0"
          :max="255"
          :default-value="D.alphaThreshold"
          :hint="t('settings.alphaCutoff.hint')"
          @update:model-value="set('alphaThreshold', $event)"
        />
      </section>

      <!-- Palette -->
      <section v-if="isColorLike" class="group">
        <h2 class="group-title">{{ t('panel.sectionPalette') }}</h2>

        <div class="pal-list" role="listbox" :aria-label="t('palettes.source')">
          <button
            class="pal-row"
            role="option"
            :class="{ 'is-active': fixedPalette === null }"
            :aria-selected="fixedPalette === null"
            :title="t('palettes.automaticTitle')"
            @click="store.clearFixedPalette()"
          >
            <span class="pal-label">{{ t('palettes.automatic') }}</span>
            <span class="pal-meta">{{
              t('palettes.automaticMeta', { count: s.paletteSize })
            }}</span>
          </button>
          <button
            v-for="sug in store.paletteSuggestions"
            :key="sug.id"
            class="pal-row"
            role="option"
            :class="{ 'is-active': isActiveSuggestion(sug) }"
            :aria-selected="isActiveSuggestion(sug)"
            :title="t(`palettes.${sug.id}.description`)"
            @click="store.setFixedPalette(sug.colors)"
          >
            <span class="pal-label">{{
              t(`palettes.${sug.id}.label`, { count: sug.colors.length })
            }}</span>
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
            {{ t('palettes.updating') }}
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
              :aria-label="t('palettes.editColor', { index: i + 1 })"
              @input="store.editPaletteEntry(i, ($event.target as HTMLInputElement).value)"
            />
            <button
              class="pal-remove"
              :aria-label="t('palettes.removeColor', { index: i + 1 })"
              @click="store.removePaletteEntry(i)"
            >
              ×
            </button>
          </span>
          <button class="pal-add" :title="t('palettes.addColor')" @click="store.addPaletteEntry()">
            +
          </button>
          <button
            class="chip chip--btn pal-back"
            :title="t('palettes.backToAutoTitle')"
            @click="store.clearFixedPalette()"
          >
            {{ t('palettes.backToAuto') }}
          </button>
        </div>

        <template v-if="fixedPalette === null">
          <SliderRow
            :label="t('settings.colors.label')"
            :model-value="s.paletteSize"
            :min="2"
            :max="64"
            :default-value="D.paletteSize"
            :hint="t('settings.colors.hint')"
            @update:model-value="set('paletteSize', $event)"
          />
          <SwitchRow
            :label="t('settings.autoReduce.label')"
            :model-value="s.autoPaletteSize"
            :default-value="D.autoPaletteSize"
            :hint="t('settings.autoReduce.hint')"
            @update:model-value="set('autoPaletteSize', $event)"
          />
          <SliderRow
            :label="t('settings.quality.label')"
            :model-value="s.quantizeQuality"
            :min="1"
            :max="10"
            :default-value="D.quantizeQuality"
            :hint="t('settings.quality.hint')"
            @update:model-value="set('quantizeQuality', $event)"
          />
          <SelectRow
            :label="t('settings.colorSpace.label')"
            :model-value="s.colorSpace"
            :options="[
              { value: 'oklab', label: t('settings.colorSpace.oklab') },
              { value: 'rgb', label: t('settings.colorSpace.rgb') },
            ]"
            :default-value="D.colorSpace"
            :hint="t('settings.colorSpace.hint')"
            @update:model-value="set('colorSpace', $event)"
          />
        </template>

        <ControlRow :label="t('settings.layering.label')" :hint="t('settings.layering.hint')">
          <div class="radio-cards">
            <button
              :class="{ 'is-active': s.layering === 'stacked' }"
              :title="t('settings.layering.stackedTitle')"
              @click="set('layering', 'stacked')"
            >
              <strong>{{ t('settings.layering.stacked') }}</strong>
              <span>{{ t('settings.layering.stackedSub') }}</span>
            </button>
            <button
              :class="{ 'is-active': s.layering === 'cutout' }"
              :title="t('settings.layering.cutoutTitle')"
              @click="set('layering', 'cutout')"
            >
              <strong>{{ t('settings.layering.cutout') }}</strong>
              <span>{{ t('settings.layering.cutoutSub') }}</span>
            </button>
          </div>
        </ControlRow>
        <SliderRow
          :label="t('settings.minRegion.label')"
          :model-value="s.minRegionArea"
          :min="0"
          :max="256"
          :default-value="D.minRegionArea"
          :hint="t('settings.minRegion.hint')"
          @update:model-value="set('minRegionArea', $event)"
        />
        <SwitchRow
          :label="t('settings.keepDetails.label')"
          :model-value="s.preserveDetails"
          :default-value="D.preserveDetails"
          :hint="t('settings.keepDetails.hint')"
          @update:model-value="set('preserveDetails', $event)"
        />
        <SliderRow
          v-if="s.layering === 'cutout'"
          :label="t('settings.gapFill.label')"
          :model-value="s.gapFill"
          :min="0"
          :max="2"
          :step="0.05"
          :default-value="D.gapFill"
          :zero-label="t('settings.gapFill.zero')"
          :hint="t('settings.gapFill.hint')"
          @update:model-value="set('gapFill', $event)"
        />
        <SwitchRow
          :label="t('settings.omitBackground.label')"
          :model-value="s.omitBackground"
          :default-value="D.omitBackground"
          :hint="t('settings.omitBackground.hint')"
          @update:model-value="set('omitBackground', $event)"
        />
        <SwitchRow
          :label="t('settings.groupByColor.label')"
          :model-value="s.groupByColor"
          :default-value="D.groupByColor"
          :hint="t('settings.groupByColor.hint')"
          @update:model-value="set('groupByColor', $event)"
        />
      </section>

      <!-- Threshold -->
      <section v-if="isBwLike" class="group">
        <h2 class="group-title">{{ t('panel.sectionThreshold') }}</h2>
        <SelectRow
          :label="t('settings.method.label')"
          :model-value="s.thresholdMode"
          :options="[
            { value: 'auto', label: t('settings.method.auto') },
            { value: 'fixed', label: t('settings.method.fixed') },
            { value: 'adaptive', label: t('settings.method.adaptive') },
          ]"
          :default-value="D.thresholdMode"
          :hint="t('settings.method.hint')"
          @update:model-value="set('thresholdMode', $event)"
        />
        <SliderRow
          v-if="s.thresholdMode === 'fixed'"
          :label="t('settings.level.label')"
          :model-value="s.threshold"
          :min="0"
          :max="255"
          :default-value="D.threshold"
          :hint="t('settings.level.hint')"
          @update:model-value="set('threshold', $event)"
        />
        <template v-if="s.thresholdMode === 'adaptive'">
          <SliderRow
            :label="t('settings.radius.label')"
            :model-value="s.adaptiveRadius"
            :min="2"
            :max="128"
            :default-value="D.adaptiveRadius"
            :hint="t('settings.radius.hint')"
            @update:model-value="set('adaptiveRadius', $event)"
          />
          <SliderRow
            :label="t('settings.bias.label')"
            :model-value="s.adaptiveBias"
            :min="-64"
            :max="64"
            :default-value="D.adaptiveBias"
            :hint="t('settings.bias.hint')"
            @update:model-value="set('adaptiveBias', $event)"
          />
        </template>
        <SwitchRow
          :label="t('settings.invert.label')"
          :model-value="s.invert"
          :default-value="D.invert"
          :hint="t('settings.invert.hint')"
          @update:model-value="set('invert', $event)"
        />
      </section>

      <!-- Curves -->
      <section class="group">
        <h2 class="group-title">{{ t('panel.sectionCurves') }}</h2>
        <SelectRow
          :label="t('settings.geometry.label')"
          :model-value="s.curveMode"
          :options="[
            { value: 'spline', label: t('settings.geometry.spline') },
            { value: 'polygon', label: t('settings.geometry.polygon') },
            { value: 'pixel', label: t('settings.geometry.pixel') },
          ]"
          :default-value="D.curveMode"
          :hint="t('settings.geometry.hint')"
          @update:model-value="set('curveMode', $event)"
        />
        <SliderRow
          :label="t('settings.smoothing.label')"
          :model-value="s.smoothing"
          :min="0"
          :max="1"
          :step="0.01"
          :default-value="D.smoothing"
          :disabled="s.curveMode !== 'spline'"
          :hint="t('settings.smoothing.hint')"
          @update:model-value="set('smoothing', $event)"
        />
        <SwitchRow
          :label="t('settings.optimize.label')"
          :model-value="s.curveOptimize"
          :default-value="D.curveOptimize"
          :disabled="s.curveMode === 'pixel'"
          :hint="t('settings.optimize.hint')"
          @update:model-value="set('curveOptimize', $event)"
        />
        <SliderRow
          v-if="s.curveOptimize && s.curveMode !== 'pixel'"
          :label="t('settings.tolerance.label')"
          :model-value="s.optTolerance"
          :min="0"
          :max="5"
          :step="0.05"
          :default-value="D.optTolerance"
          :hint="t('settings.tolerance.hint')"
          @update:model-value="set('optTolerance', $event)"
        />
        <details class="advanced">
          <summary>{{ t('panel.advanced') }}</summary>
          <SelectRow
            :label="t('settings.turnPolicy.label')"
            :model-value="s.turnPolicy"
            :options="[
              { value: 'minority', label: t('settings.turnPolicy.minority') },
              { value: 'majority', label: t('settings.turnPolicy.majority') },
              { value: 'black', label: t('settings.turnPolicy.black') },
              { value: 'white', label: t('settings.turnPolicy.white') },
              { value: 'left', label: t('settings.turnPolicy.left') },
              { value: 'right', label: t('settings.turnPolicy.right') },
            ]"
            :default-value="D.turnPolicy"
            :hint="t('settings.turnPolicy.hint')"
            @update:model-value="set('turnPolicy', $event)"
          />
          <SliderRow
            :label="t('settings.simplify.label')"
            :model-value="s.simplifyTolerance"
            :min="0"
            :max="10"
            :step="0.1"
            :default-value="D.simplifyTolerance"
            :hint="t('settings.simplify.hint')"
            @update:model-value="set('simplifyTolerance', $event)"
          />
          <SliderRow
            :label="t('settings.cornerAngle.label')"
            :model-value="s.cornerThreshold"
            :min="0"
            :max="180"
            :default-value="D.cornerThreshold"
            :hint="t('settings.cornerAngle.hint')"
            @update:model-value="set('cornerThreshold', $event)"
          />
          <SliderRow
            :label="t('settings.fitTolerance.label')"
            :model-value="s.fitTolerance"
            :min="0.1"
            :max="10"
            :step="0.1"
            :default-value="D.fitTolerance"
            :hint="t('settings.fitTolerance.hint')"
            @update:model-value="set('fitTolerance', $event)"
          />
        </details>
      </section>

      <!-- Centerline -->
      <section v-if="isCenterline" class="group">
        <h2 class="group-title">{{ t('panel.sectionCenterline') }}</h2>
        <p class="mode-note">{{ t('settings.centerlineNote') }}</p>
        <SliderRow
          :label="t('settings.strokeWidth.label')"
          :model-value="s.strokeWidth"
          :min="0"
          :max="64"
          :step="0.5"
          :default-value="D.strokeWidth"
          :zero-label="t('settings.strokeWidth.zero')"
          :hint="t('settings.strokeWidth.hint')"
          @update:model-value="set('strokeWidth', $event)"
        />
        <SliderRow
          :label="t('settings.prune.label')"
          :model-value="s.pruneLength"
          :min="0"
          :max="128"
          :default-value="D.pruneLength"
          :hint="t('settings.prune.hint')"
          @update:model-value="set('pruneLength', $event)"
        />
      </section>

      <!-- Output -->
      <section class="group">
        <h2 class="group-title">{{ t('panel.sectionOutput') }}</h2>
        <ColorRow
          v-if="isBwLike"
          :label="t('settings.inkColor.label')"
          :model-value="s.fillColor"
          :default-value="D.fillColor"
          :hint="t('settings.inkColor.hint')"
          @update:model-value="set('fillColor', $event)"
        />
        <SliderRow
          :label="t('settings.precision.label')"
          :model-value="s.precision"
          :min="0"
          :max="4"
          :default-value="D.precision"
          :hint="t('settings.precision.hint')"
          @update:model-value="set('precision', $event)"
        />
        <SwitchRow
          :label="t('settings.minify.label')"
          :model-value="s.optimizeSvg"
          :default-value="D.optimizeSvg"
          :hint="t('settings.minify.hint')"
          @update:model-value="set('optimizeSvg', $event)"
        />
        <ControlRow :label="t('settings.units.label')" :hint="t('settings.units.hint')">
          <div class="seg unit-seg">
            <button :class="{ 'is-active': s.unit === 'px' }" @click="set('unit', 'px')">px</button>
            <button :class="{ 'is-active': s.unit === 'mm' }" @click="set('unit', 'mm')">mm</button>
          </div>
        </ControlRow>
        <SliderRow
          v-if="s.unit === 'mm'"
          :label="t('settings.widthMm.label')"
          :model-value="s.widthMm"
          :min="0"
          :max="1000"
          :default-value="D.widthMm"
          :zero-label="t('settings.widthMm.zero')"
          :hint="t('settings.widthMm.hint')"
          @update:model-value="set('widthMm', $event)"
        />
        <TextRow
          :label="t('settings.title.label')"
          :model-value="s.svgTitle"
          :default-value="D.svgTitle"
          :placeholder="t('settings.title.placeholder')"
          :hint="t('settings.title.hint')"
          @update:model-value="set('svgTitle', $event)"
        />
        <SwitchRow
          :label="t('settings.islandCheck.label')"
          :model-value="s.detectIslands"
          :default-value="D.detectIslands"
          :hint="t('settings.islandCheck.hint')"
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
