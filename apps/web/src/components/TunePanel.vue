<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import type { ObjectiveId } from '@trazor/tune'
import { useAppStore } from '../store/appStore'
import type { TunePresetId } from '../store/appStore'
import SliderRow from './controls/SliderRow.vue'
import SwitchRow from './controls/SwitchRow.vue'

const store = useAppStore()
const { t } = useI18n()

const OBJECTIVES: readonly ObjectiveId[] = [
  'fidelity',
  'simplicity',
  'fileSize',
  'colorEconomy',
  'cleanliness',
]
const PRESETS: readonly TunePresetId[] = ['maxFidelity', 'balanced', 'smallestFile', 'cutReady']

const progress = computed(() => store.tuneProgress)
const bestScore = computed(() =>
  store.tuneBest ? `${(store.tuneBest.score * 100).toFixed(1)}%` : null,
)
const fraction = computed(() => {
  const p = progress.value
  return p && p.total > 0 ? Math.min(1, p.evaluated / p.total) : 0
})
</script>

<template>
  <section class="tune-panel">
    <header class="tp-head">
      <div class="tp-titles">
        <h2 class="tp-title">{{ t('tune.title') }}</h2>
        <p class="tp-sub">{{ t('tune.subtitle') }}</p>
      </div>
      <button
        class="btn btn-ghost btn-icon"
        type="button"
        :aria-label="t('tune.close')"
        @click="store.closeTune()"
      >
        <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden="true">
          <path
            d="M4 4l8 8M12 4l-8 8"
            fill="none"
            stroke="currentColor"
            stroke-width="1.5"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </header>

    <div class="tp-scroll">
      <!-- Priorities -->
      <section class="tp-group">
        <h3 class="tp-group-title">{{ t('tune.priorities') }}</h3>
        <div class="tp-presets">
          <button
            v-for="id in PRESETS"
            :key="id"
            class="tp-preset chip chip--btn"
            @click="store.applyTunePreset(id)"
          >
            {{ t(`tune.preset.${id}`) }}
          </button>
        </div>
        <div
          v-for="obj in OBJECTIVES"
          :key="obj"
          class="tp-weight"
          :title="t(`tune.objHint.${obj}`)"
        >
          <span class="tp-weight-label">{{ t(`tune.obj.${obj}`) }}</span>
          <input
            class="tp-range"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :value="store.tuneWeights[obj]"
            :aria-label="t(`tune.obj.${obj}`)"
            @input="
              store.setTuneWeight(obj, Number.parseFloat(($event.target as HTMLInputElement).value))
            "
          />
          <span class="tp-weight-val mono">{{ Math.round(store.tuneWeights[obj] * 100) }}</span>
        </div>
      </section>

      <!-- Budget -->
      <section class="tp-group">
        <SliderRow
          :label="t('tune.iterations')"
          :model-value="store.tuneIterations"
          :min="10"
          :max="300"
          :step="5"
          :hint="t('tune.iterationsHint')"
          @update:model-value="store.setTuneIterations($event)"
        />
      </section>

      <!-- Advanced -->
      <details class="tp-advanced">
        <summary>{{ t('tune.advanced') }}</summary>
        <SliderRow
          :label="t('tune.minFidelity')"
          :model-value="store.tuneMinFidelity"
          :min="0"
          :max="1"
          :step="0.05"
          :hint="t('tune.minFidelityHint')"
          @update:model-value="store.setTuneMinFidelity($event)"
        />
        <SwitchRow
          :label="t('tune.explorePreprocess')"
          :model-value="store.tuneExplorePreprocess"
          :hint="t('tune.explorePreprocessHint')"
          @update:model-value="store.setTuneExplore('preprocess', $event)"
        />
        <SwitchRow
          :label="t('tune.exploreStructural')"
          :model-value="store.tuneExploreStructural"
          :hint="t('tune.exploreStructuralHint')"
          @update:model-value="store.setTuneExplore('structural', $event)"
        />
      </details>
    </div>

    <footer class="tp-foot">
      <div v-if="progress" class="tp-progress">
        <div class="tp-progress-bar">
          <span class="tp-progress-fill" :style="{ width: `${fraction * 100}%` }" />
        </div>
        <div class="tp-progress-meta">
          <span class="mono">{{ progress.evaluated }} / {{ progress.total }}</span>
          <span v-if="bestScore" class="tp-best">{{ t('tune.best') }} {{ bestScore }}</span>
        </div>
        <p v-if="progress.converged && !store.tuneRunning" class="tp-converged">
          {{ t('tune.convergedNote') }}
        </p>
      </div>

      <p v-if="store.tuneError" class="tp-error">
        {{ t('tune.error', { error: store.tuneError }) }}
      </p>

      <button
        v-if="!store.tuneRunning"
        class="btn btn-primary tp-run"
        type="button"
        @click="store.startTune()"
      >
        {{ t('tune.start') }}
      </button>
      <button v-else class="btn tp-run tp-stop" type="button" @click="store.stopTune()">
        <span class="tp-spinner" aria-hidden="true" />
        {{ t('tune.stop') }}
      </button>

      <div v-if="store.tuneBest && !store.tuneRunning" class="tp-actions">
        <button class="btn btn-primary" type="button" @click="store.applyTuneBest()">
          {{ t('tune.applyBest') }}
        </button>
        <button
          v-if="store.tuneDirty"
          class="btn btn-ghost"
          type="button"
          @click="store.revertTune()"
        >
          {{ t('tune.revert') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.tune-panel {
  display: flex;
  flex-direction: column;
  width: 296px;
  flex: 0 0 296px;
  min-height: 0;
  background: var(--bg-1);
  border-right: 1px solid var(--border);
}

.tp-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  padding: 14px 12px 12px 16px;
  border-bottom: 1px solid var(--border);
}

.tp-title {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
  color: var(--text-1);
}

.tp-sub {
  margin: 2px 0 0;
  font-size: 11.5px;
  color: var(--text-3);
}

.tp-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.tp-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tp-group-title {
  margin: 0 0 2px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
}

.tp-presets {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-bottom: 4px;
}

.tp-preset {
  cursor: pointer;
}

.tp-weight {
  display: grid;
  grid-template-columns: 92px 1fr 28px;
  align-items: center;
  gap: 8px;
}

.tp-weight-label {
  font-size: 12px;
  color: var(--text-2);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tp-range {
  width: 100%;
  min-width: 40px;
  accent-color: var(--accent);
  cursor: pointer;
}

.tp-weight-val {
  font-size: 11px;
  color: var(--text-3);
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.tp-advanced summary {
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

.tp-advanced summary::-webkit-details-marker {
  display: none;
}

.tp-advanced summary::before {
  content: '▸';
  font-size: 9px;
  transition: transform 0.12s ease;
}

.tp-advanced[open] summary::before {
  transform: rotate(90deg);
}

.tp-advanced summary:hover {
  color: var(--text-1);
}

.tp-foot {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 12px;
  border-top: 1px solid var(--border);
}

.tp-progress {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.tp-progress-bar {
  height: 6px;
  border-radius: 999px;
  background: var(--bg-3, var(--bg-2));
  overflow: hidden;
}

.tp-progress-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  background: var(--accent);
  transition: width 0.2s ease;
}

.tp-progress-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11.5px;
  color: var(--text-3);
}

.tp-best {
  color: var(--accent);
  font-weight: 600;
}

.tp-converged {
  margin: 0;
  font-size: 11px;
  color: var(--text-3);
}

.tp-error {
  margin: 0;
  font-size: 11.5px;
  color: var(--danger);
}

.tp-run {
  width: 100%;
  justify-content: center;
}

.tp-stop {
  gap: 8px;
  background: var(--bg-2);
  color: var(--text-1);
}

.tp-spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: tp-spin 0.7s linear infinite;
}

.tp-actions {
  display: flex;
  gap: 8px;
}

.tp-actions .btn {
  flex: 1;
  justify-content: center;
}

@keyframes tp-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tp-spinner {
    animation: none;
  }
}

@media (max-width: 768px) {
  .tune-panel {
    width: 100%;
    flex: 0 0 auto;
    max-height: 45%;
    border-right: none;
    border-bottom: 1px solid var(--border);
  }
}
</style>
