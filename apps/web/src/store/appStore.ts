import {
  clamp,
  clampInt,
  cloneRaster,
  DEFAULT_SETTINGS,
  getProfile,
  normalizeSettings,
  parseSettingsImport,
  serializeSettings,
  TARGET_PROFILES,
} from '@trazor/core'
import type {
  GrayImage,
  ProfileId,
  RasterImage,
  StageId,
  TargetProfile,
  VectorizeResult,
  VectorizeSettings,
} from '@trazor/core'
import { analyzeImage, recommendSettings } from '@trazor/assist'
import type { ImageAnalysis, PaletteSuggestion, RationaleKey } from '@trazor/assist'
import { TrazorClient, TrazorPool } from '@trazor/engine'
import { extractGeometry } from '@trazor/svg'
import type { SvgGeometry } from '@trazor/svg'
import type { MlAvailability, MlProgress } from '@trazor/ml'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { applyLocale, pickInitialLocale, translate as t } from '../i18n'
import type { LocaleCode } from '../i18n'
import { AssistClient } from '../lib/assistClient'
import { decodeBlob } from '../lib/decode'
import { computeFidelity } from '../lib/fidelity'
import type { FidelityReport } from '../lib/fidelity'
import { FidelityClient } from '../lib/fidelityClient'
import { defaultPoolSize, runAutoTune } from '../lib/tuner'
import type { AutoTuneOptions, TuneSignal } from '../lib/tuner'
import { DEFAULT_FREE } from '@trazor/tune'
import type { ObjectiveId, ScoredCandidate, SeedPatch, TunableKey, TuneWeights } from '@trazor/tune'
import { buildLayers, filterLayers } from '../lib/layers'
import type { LayerModel } from '../lib/layers'
import { countUnseen, latestReleaseId } from '../lib/releaseNotes'
import { getSample } from '../lib/samples'

const STORAGE_KEY = 'trazor:v1'
const RUN_DEBOUNCE_MS = 300

/** Default objective priorities for the auto-optimize search. */
const DEFAULT_TUNE_WEIGHTS: TuneWeights = {
  fidelity: 1,
  simplicity: 0.5,
  fileSize: 0.25,
  colorEconomy: 0,
  cleanliness: 0.25,
}

export type TunePresetId = 'maxFidelity' | 'balanced' | 'smallestFile' | 'cutReady'

/** Preset priority mixes seeded by the preset chips. */
const TUNE_PRESETS: Record<TunePresetId, TuneWeights> = {
  maxFidelity: { fidelity: 1, simplicity: 0.1, fileSize: 0, colorEconomy: 0, cleanliness: 0.1 },
  balanced: DEFAULT_TUNE_WEIGHTS,
  smallestFile: {
    fidelity: 0.4,
    simplicity: 0.7,
    fileSize: 1,
    colorEconomy: 0.3,
    cleanliness: 0.2,
  },
  cutReady: { fidelity: 0.5, simplicity: 0.6, fileSize: 0.2, colorEconomy: 1, cleanliness: 0.8 },
}

export type Theme = 'dark' | 'light'
export type ToastKind = 'info' | 'success' | 'error'

export interface Toast {
  id: number
  message: string
  kind: ToastKind
}

export interface MagicPoint {
  /** Coordinates in working-image pixel space. */
  x: number
  y: number
  /** 1 = keep, 0 = exclude. */
  label: 0 | 1
}

interface MlToolState {
  busy: boolean
  /** 0..1 when determinate, null when indeterminate. */
  progress: number | null
  phase: string
}

interface PersistedState {
  settings?: Partial<VectorizeSettings>
  activeProfileId?: ProfileId | null
  profileModified?: boolean
  theme?: Theme
  edgePrepass?: boolean
  autoOnLoad?: boolean
  /** Id of the newest release note the visitor has seen (see lib/releaseNotes). */
  lastSeenRelease?: string
  /** UI language; unset until the visitor picks one (auto-detected meanwhile). */
  locale?: LocaleCode
  /** Whether the layer visualizer panel is open (desktop preference). */
  layersOpen?: boolean
  /** Auto-optimize objective priorities (persisted so they carry across sessions). */
  tuneWeights?: TuneWeights
  /** Auto-optimize iteration budget. */
  tuneIterations?: number
}

/** A layer (and optional contour) singled out for preview highlighting. */
export interface LayerFocus {
  /** Index into `layerModel.layers`. */
  layer: number
  /** Index into that layer's `shapes`, or null for the whole layer. */
  shape: number | null
}

function loadPersisted(): PersistedState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return {}
    return parsed as PersistedState
  } catch {
    return {}
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function isCancelled(e: unknown): boolean {
  return e instanceof Error && e.name === 'CancelledError'
}

function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

function mlPhaseInfo(p: MlProgress): { progress: number | null; phase: string } {
  if (p.phase === 'download') {
    const frac = p.total > 0 ? (p.loaded / p.total) * 0.85 : null
    const mb = (p.loaded / 1_000_000).toFixed(1)
    return { progress: frac, phase: t('ml.phaseDownloading', { mb }) }
  }
  if (p.phase === 'compile') return { progress: 0.9, phase: t('ml.phaseCompiling') }
  return { progress: null, phase: t('ml.phaseRunning') }
}

export const useAppStore = defineStore('app', () => {
  const persisted = loadPersisted()

  // ------------------------------- State ---------------------------------
  // Image/result state is replaced wholesale, never mutated in place, so
  // shallowRef keeps big pixel buffers out of Vue's deep proxying (and plain
  // objects stay plain for postMessage).
  const sourceImage = shallowRef<RasterImage | null>(null)
  const workingImage = shallowRef<RasterImage | null>(null)
  const sourceName = ref('')
  const settings = shallowRef<VectorizeSettings>(normalizeSettings(persisted.settings ?? {}))
  const activeProfileId = ref<ProfileId | null>(
    persisted.activeProfileId && TARGET_PROFILES.some((p) => p.id === persisted.activeProfileId)
      ? persisted.activeProfileId
      : null,
  )
  const profileModified = ref(persisted.profileModified === true)
  const result = shallowRef<VectorizeResult | null>(null)
  const busy = ref(false)
  const progress = ref<{ stage: StageId; overall: number } | null>(null)
  const error = ref<string | null>(null)
  const fidelity = shallowRef<FidelityReport | null>(null)

  // ---------------------------- Auto-optimize ----------------------------
  /** Whether the auto-optimize overlay (controls + results wall) is open. */
  const tuneOpen = ref(false)
  /** True while a search is running. */
  const tuneRunning = ref(false)
  const tuneProgress = ref<{ evaluated: number; total: number; converged: boolean } | null>(null)
  /** Every scored candidate (drives the comparison wall); replaced wholesale. */
  const tuneResults = shallowRef<readonly ScoredCandidate[]>([])
  const tuneBest = shallowRef<ScoredCandidate | null>(null)
  const tuneFront = shallowRef<readonly ScoredCandidate[]>([])
  const tuneError = ref<string | null>(null)
  const tuneWeights = ref<TuneWeights>({ ...DEFAULT_TUNE_WEIGHTS, ...persisted.tuneWeights })
  const tuneIterations = ref<number>(clampInt(persisted.tuneIterations ?? 40, 5, 300))
  /** Minimum fidelity utility a candidate must clear; 0 disables the floor. */
  const tuneMinFidelity = ref(0)
  /** Advanced: also explore preprocessing (blur/denoise) — a full recompute per probe. */
  const tuneExplorePreprocess = ref(false)
  /** Advanced: also explore structural moves (curve mode, layering). */
  const tuneExploreStructural = ref(false)
  /** Id of the candidate currently applied to the live settings (highlights its tile). */
  const tuneAppliedId = ref<number | null>(null)
  /** True once a candidate has been applied, so the pre-search settings can be reverted. */
  const tuneDirty = ref(false)
  const theme = ref<Theme>(
    persisted.theme === 'light' || persisted.theme === 'dark' ? persisted.theme : systemTheme(),
  )
  /** Structured reasons behind the last auto-recommendation (localized in the UI). */
  const assistRationale = ref<RationaleKey[] | null>(null)
  const toasts = ref<Toast[]>([])
  const paletteSuggestions = ref<PaletteSuggestion[]>([])
  /** True while suggestions are being recomputed for a changed image. */
  const paletteSuggestionsPending = ref(false)

  const mlState = reactive({
    probing: false,
    availability: null as MlAvailability | null,
    removeBg: { busy: false, progress: null, phase: '' } as MlToolState,
    magic: { busy: false, progress: null, phase: '' } as MlToolState,
    edge: { busy: false, progress: null, phase: '' } as MlToolState,
    cleanup: { busy: false, progress: null, phase: '' } as MlToolState,
  })
  const magicActive = ref(false)
  const magicPoints = ref<MagicPoint[]>([])
  /** Optional ML edge pre-pass, consumed by bw/centerline tracing. */
  const edgePrepass = ref(persisted.edgePrepass === true)
  /** Analyze each newly loaded image and apply recommended settings. On by default. */
  const autoOnLoad = ref(persisted.autoOnLoad !== false)
  /** Id of the newest release note the visitor has acknowledged (What's new panel). */
  const lastSeenRelease = ref<string | null>(persisted.lastSeenRelease ?? null)
  /** Active UI language. Persisted once chosen; auto-detected on the first visit. */
  const locale = ref<LocaleCode>(persisted.locale ?? pickInitialLocale())

  // ---------------------------- Layer panel ------------------------------
  // The panel opens on the right on desktop and starts closed on mobile (a
  // full-height drawer would otherwise cover the result on load).
  const startMobile =
    typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  const layersOpen = ref(startMobile ? false : persisted.layersOpen !== false)
  /** Layer/contour under the pointer in the panel (transient highlight). */
  const layerHover = ref<LayerFocus | null>(null)
  /** Pinned layer (click) — highlighted and expanded until cleared. */
  const selectedLayer = ref<number | null>(null)
  /** Paint keys the user has hidden from the preview/export (removable, restorable). */
  const removedLayers = ref<string[]>([])
  /** Open while a re-trace is waiting on the user to confirm discarding removed layers. */
  const retraceConfirm = ref(false)

  // Non-reactive machinery
  let client: TrazorClient | null = null
  let assistClient: AssistClient | null = null
  let fidelityClient: FidelityClient | null = null
  let tunePool: TrazorPool | null = null
  // Active search cancellation flag + pre-search settings snapshot (for revert).
  let tuneSignal: TuneSignal | null = null
  let tuneBaseline: VectorizeSettings | null = null
  let runCounter = 0
  let runTimer: ReturnType<typeof setTimeout> | null = null
  let toastCounter = 0
  // One-shot ML tools can be cancelled mid-run: each run captures a token, the
  // Cancel action flips it, and the run checks it after every await so a
  // superseded result is discarded and its late progress updates are ignored.
  type MlOneShot = 'removeBg' | 'cleanup' | 'magic'
  const mlTokens: Record<MlOneShot, { cancelled: boolean } | null> = {
    removeBg: null,
    cleanup: null,
    magic: null,
  }
  // ML instances are heavyweight; keep them outside reactivity.
  let remover: import('@trazor/ml').BackgroundRemover | null = null
  let segmenter: import('@trazor/ml').MagicSegmenter | null = null
  let segmenterImage: RasterImage | null = null
  let edgeModel: import('@trazor/ml').EdgeEnhancer | null = null
  let cleanupModel: import('@trazor/ml').CleanupEnhancer | null = null
  // Edge hint cached per working image (independent of trace settings).
  let edgeHintImage: RasterImage | null = null
  let edgeHint: GrayImage | null = null
  const suggestionCache = new WeakMap<RasterImage, PaletteSuggestion[]>()
  // Image statistics feed both auto settings and palette suggestions; compute once per image.
  const analysisCache = new WeakMap<RasterImage, ImageAnalysis>()

  function getAnalysis(image: RasterImage): ImageAnalysis {
    let analysis = analysisCache.get(image)
    if (!analysis) {
      analysis = analyzeImage(image)
      analysisCache.set(image, analysis)
    }
    return analysis
  }

  // ------------------------------ Derived --------------------------------
  const hasImage = computed(() => workingImage.value !== null)
  const activeProfile = computed<TargetProfile | null>(() =>
    activeProfileId.value ? getProfile(activeProfileId.value) : null,
  )
  const isWorkingModified = computed(
    () => sourceImage.value !== null && workingImage.value !== sourceImage.value,
  )
  /** Suggested output filename (source name minus extension). */
  const exportName = computed(() => {
    const base = sourceName.value.replace(/\.[a-z0-9]+$/i, '').trim()
    return `${base || 'vectorized'}.svg`
  })

  // The result SVG with any user-removed color layers stripped — what the
  // preview shows and the export writes. Everything downstream (geometry, the
  // layer panel, highlights) reads this, so a removal propagates consistently.
  const displaySvg = computed<string | null>(() => {
    const res = result.value
    if (!res) return null
    return removedLayers.value.length > 0
      ? filterLayers(res.svg, new Set(removedLayers.value))
      : res.svg
  })

  // Decoded result geometry, parsed once per result and shared by the layer
  // panel and the preview's complexity/highlight overlays.
  const geometry = computed<SvgGeometry | null>(() =>
    displaySvg.value ? extractGeometry(displaySvg.value) : null,
  )
  /** Color layers (and their contours) derived from the result. */
  const layerModel = computed<LayerModel | null>(() =>
    geometry.value ? buildLayers(geometry.value) : null,
  )
  /** The layer/contour the preview should highlight: hover wins over selection. */
  const layerFocus = computed<LayerFocus | null>(() => {
    if (layerHover.value) return layerHover.value
    if (selectedLayer.value !== null) return { layer: selectedLayer.value, shape: null }
    return null
  })

  function setLayerHover(focus: LayerFocus | null): void {
    layerHover.value = focus
  }

  /** Toggle a pinned layer; clicking the pinned layer again clears it. */
  function toggleSelectedLayer(index: number): void {
    selectedLayer.value = selectedLayer.value === index ? null : index
  }

  /**
   * Hide a color layer from the preview and export by its paint `key`. Removal
   * renumbers the remaining layers, so any live hover/pin is dropped to avoid a
   * stale index highlighting the wrong shape.
   */
  function removeLayer(key: string): void {
    if (removedLayers.value.includes(key)) return
    removedLayers.value = [...removedLayers.value, key]
    layerHover.value = null
    selectedLayer.value = null
  }

  /** Bring every removed layer back. */
  function restoreLayers(): void {
    if (removedLayers.value.length === 0) return
    removedLayers.value = []
    retraceConfirm.value = false
  }

  function setLayersOpen(open: boolean): void {
    layersOpen.value = open
  }

  function toggleLayersOpen(): void {
    layersOpen.value = !layersOpen.value
  }

  // A new trace invalidates layer indices — drop any hover/selection/removals,
  // and close a stale re-trace prompt.
  watch(result, () => {
    layerHover.value = null
    selectedLayer.value = null
    removedLayers.value = []
    retraceConfirm.value = false
  })

  // ------------------------------- Toasts --------------------------------
  function notify(message: string, kind: ToastKind = 'info'): void {
    const id = ++toastCounter
    toasts.value = [...toasts.value, { id, message, kind }]
    setTimeout(() => dismissToast(id), 6000)
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  // ------------------------------ Loading --------------------------------
  /**
   * Install a freshly decoded image as both source and working image, then
   * (when auto-on-load is on) analyze it and apply recommended settings. Both
   * the image swap and the settings change land before the debounced trace
   * fires, so a single run traces the recommended result.
   */
  async function installImage(image: RasterImage, name: string): Promise<void> {
    cancelMagicSelect()
    resetTune() // the previous image's search results no longer apply
    sourceImage.value = image
    workingImage.value = image
    sourceName.value = name
    result.value = null
    fidelity.value = null
    error.value = null
    if (autoOnLoad.value) await autoRecommend()
  }

  async function loadBlob(blob: Blob, name: string): Promise<void> {
    try {
      const image = await decodeBlob(blob, name)
      await installImage(image, name || 'image')
    } catch (e) {
      notify(t('toasts.couldNotLoad', { error: errorMessage(e) }), 'error')
    }
  }

  async function loadSample(id: string): Promise<void> {
    const sample = getSample(id)
    if (!sample) return
    try {
      const image = await sample.make()
      await installImage(image, t(`samples.${sample.id}.label`).toLowerCase())
    } catch (e) {
      notify(t('toasts.couldNotBuildSample', { error: errorMessage(e) }), 'error')
    }
  }

  /** Drop the current image and return to the landing screen (drop zone + samples). */
  function clearImage(): void {
    cancelMagicSelect()
    resetTune()
    tuneOpen.value = false
    runCounter++ // supersede any in-flight vectorization
    sourceImage.value = null
    workingImage.value = null
    sourceName.value = ''
    result.value = null
    fidelity.value = null
    error.value = null
    progress.value = null
    busy.value = false
  }

  // ------------------------------ Settings -------------------------------
  function applyProfile(id: ProfileId): void {
    const profile = getProfile(id)
    settings.value = normalizeSettings(profile.patch)
    activeProfileId.value = id
    profileModified.value = false
    assistRationale.value = null
  }

  function updateSettings(patch: Partial<VectorizeSettings>): void {
    settings.value = normalizeSettings(patch, settings.value)
    // Keep the profile as context but flag that the user diverged from it.
    if (activeProfileId.value) profileModified.value = true
  }

  function resetField<K extends keyof VectorizeSettings>(key: K): void {
    updateSettings({ [key]: DEFAULT_SETTINGS[key] } as Partial<VectorizeSettings>)
  }

  function resetSettings(): void {
    settings.value = normalizeSettings()
    activeProfileId.value = null
    profileModified.value = false
    assistRationale.value = null
  }

  /** Serialize the current settings (+ profile context) as a versioned JSON document. */
  function exportSettings(): string {
    return serializeSettings(settings.value, activeProfileId.value, profileModified.value)
  }

  /**
   * Apply settings from an exported JSON document (or a bare settings object).
   * Returns whether the import succeeded; failures surface as a toast.
   */
  function importSettings(text: string): boolean {
    try {
      const imported = parseSettingsImport(text)
      settings.value = imported.settings
      activeProfileId.value = imported.activeProfileId
      profileModified.value = imported.profileModified
      assistRationale.value = null
      notify(t('toasts.settingsImported'), 'success')
      return true
    } catch (e) {
      notify(t('toasts.importFailed', { error: errorMessage(e) }), 'error')
      return false
    }
  }

  async function autoRecommend(): Promise<void> {
    const image = workingImage.value
    if (!image) return
    try {
      const rec = recommendSettings(getAnalysis(image))
      // The recommendation refines its suggested profile, so apply the profile
      // patch first and the recommendation patch on top (both over defaults).
      settings.value = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
      activeProfileId.value = rec.profileId
      profileModified.value = false
      assistRationale.value = rec.rationaleKeys
    } catch (e) {
      notify(t('toasts.autoFailed', { error: errorMessage(e) }), 'error')
    }
  }

  function dismissRationale(): void {
    assistRationale.value = null
  }

  // -------------------------- Palette suggestions ------------------------
  // Derived from image stats by @trazor/assist. Computed in a worker (a
  // full-image k-means pass) whenever the working image changes, so loading an
  // image never blocks the UI thread; cached per image so restoring the
  // original is instant.
  function getAssistClient(): AssistClient {
    assistClient ??= new AssistClient(
      () => new Worker(new URL('../worker/assist.worker.ts', import.meta.url), { type: 'module' }),
    )
    return assistClient
  }

  function refreshPaletteSuggestions(image: RasterImage): void {
    const cached = suggestionCache.get(image)
    if (cached) {
      paletteSuggestions.value = cached
      paletteSuggestionsPending.value = false
      return
    }
    paletteSuggestionsPending.value = true
    void computePaletteSuggestions(image)
  }

  async function computePaletteSuggestions(image: RasterImage): Promise<void> {
    try {
      const suggestions = await getAssistClient().suggestPalettes(image, getAnalysis(image))
      suggestionCache.set(image, suggestions)
      // The image may have been replaced while the worker ran.
      if (workingImage.value === image) paletteSuggestions.value = suggestions
    } catch {
      if (workingImage.value === image) paletteSuggestions.value = []
    } finally {
      if (workingImage.value === image) paletteSuggestionsPending.value = false
    }
  }

  watch(workingImage, (image) => {
    if (image) {
      refreshPaletteSuggestions(image)
    } else {
      paletteSuggestions.value = []
      paletteSuggestionsPending.value = false
    }
  })

  /** Use a fixed palette (suggestion colors or user-edited list). */
  function setFixedPalette(colors: readonly string[]): void {
    updateSettings({ palette: [...colors] })
  }

  /** Return to automatic (k-means) palette extraction. */
  function clearFixedPalette(): void {
    updateSettings({ palette: null })
  }

  function editPaletteEntry(index: number, hex: string): void {
    const palette = settings.value.palette
    if (!palette || index < 0 || index >= palette.length) return
    const next = [...palette]
    next[index] = hex
    updateSettings({ palette: next })
  }

  function addPaletteEntry(hex = '#808080'): void {
    const palette = settings.value.palette ?? []
    updateSettings({ palette: [...palette, hex] })
  }

  function removePaletteEntry(index: number): void {
    const palette = settings.value.palette
    if (!palette || index < 0 || index >= palette.length) return
    const next = palette.filter((_, i) => i !== index)
    // Removing the last swatch falls back to automatic.
    updateSettings({ palette: next.length > 0 ? next : null })
  }

  // ---------------------------- Vectorization ----------------------------
  function getClient(): TrazorClient {
    client ??= new TrazorClient(
      () =>
        new Worker(new URL('../worker/vectorize.worker.ts', import.meta.url), { type: 'module' }),
    )
    return client
  }

  function getFidelityClient(): FidelityClient {
    fidelityClient ??= new FidelityClient(
      () =>
        new Worker(new URL('../worker/fidelity.worker.ts', import.meta.url), { type: 'module' }),
    )
    return fidelityClient
  }

  function getTunePool(image: RasterImage): TrazorPool {
    const size = defaultPoolSize(image)
    if (!tunePool || tunePool.size !== size) {
      tunePool?.dispose()
      tunePool = new TrazorPool(
        () =>
          new Worker(new URL('../worker/vectorize.worker.ts', import.meta.url), { type: 'module' }),
        size,
      )
    }
    return tunePool
  }

  // -- Auto-optimize controls --
  function openTune(): void {
    if (workingImage.value) tuneOpen.value = true
  }

  function closeTune(): void {
    if (tuneRunning.value) stopTune()
    tuneOpen.value = false
  }

  function setTuneWeight(id: ObjectiveId, value: number): void {
    tuneWeights.value = { ...tuneWeights.value, [id]: clamp(value, 0, 1) }
  }

  function applyTunePreset(id: TunePresetId): void {
    tuneWeights.value = { ...TUNE_PRESETS[id] }
  }

  function setTuneIterations(n: number): void {
    tuneIterations.value = clampInt(n, 5, 300)
  }

  function setTuneMinFidelity(v: number): void {
    tuneMinFidelity.value = clamp(v, 0, 1)
  }

  function setTuneExplore(group: 'preprocess' | 'structural', on: boolean): void {
    if (group === 'preprocess') tuneExplorePreprocess.value = on
    else tuneExploreStructural.value = on
  }

  /** The tunable-key set for the run: the defaults plus any opted-in advanced groups. */
  function tuneFreeKeys(): TunableKey[] {
    const keys: TunableKey[] = [...DEFAULT_FREE]
    if (tuneExplorePreprocess.value) keys.push('blurRadius', 'denoise')
    if (tuneExploreStructural.value) keys.push('curveMode', 'layering', 'segmentation')
    return keys
  }

  function stripMode(patch: Partial<VectorizeSettings>): Partial<VectorizeSettings> {
    const copy = { ...patch }
    // The search never changes mode — that is the user's call — so seeds don't either.
    delete copy.mode
    return copy
  }

  /** Round-0 seed points: the assist recommendation and same-mode target profiles. */
  function tuneSeeds(image: RasterImage): SeedPatch[] {
    const seeds: SeedPatch[] = []
    try {
      const rec = recommendSettings(getAnalysis(image))
      seeds.push({
        patch: stripMode({ ...getProfile(rec.profileId).patch, ...rec.patch }),
        origin: 'assist',
      })
    } catch {
      // No seed from assist — the baseline + LHS still seed the search.
    }
    for (const profile of TARGET_PROFILES) {
      if ((profile.patch.mode ?? 'color') !== settings.value.mode) continue
      seeds.push({ patch: stripMode(profile.patch), origin: 'profile' })
    }
    return seeds.slice(0, 4)
  }

  async function startTune(): Promise<void> {
    const image = workingImage.value
    if (!image || tuneRunning.value) return
    const pool = getTunePool(image)
    tuneBaseline = settings.value
    tuneDirty.value = false
    tuneAppliedId.value = null
    tuneRunning.value = true
    tuneError.value = null
    tuneResults.value = []
    tuneBest.value = null
    tuneFront.value = []
    tuneProgress.value = { evaluated: 0, total: tuneIterations.value, converged: false }
    const signal: TuneSignal = { cancelled: false }
    tuneSignal = signal
    const opts: AutoTuneOptions = {
      weights: { ...tuneWeights.value },
      iterations: tuneIterations.value,
      seed: 1,
      roundSize: Math.max(2, pool.size * 2),
      free: tuneFreeKeys(),
      minFidelity: tuneMinFidelity.value > 0 ? tuneMinFidelity.value : undefined,
      seeds: tuneSeeds(image),
      // Offer the data-derived palette suggestions as categorical candidates
      // (color mode, automatic palette only — the search guards the rest).
      palettes:
        settings.value.mode === 'color' ? paletteSuggestions.value.map((s) => s.colors) : [],
      onProgress: (p) => {
        if (tuneSignal !== signal) return
        tuneProgress.value = { evaluated: p.evaluated, total: p.total, converged: p.converged }
        tuneBest.value = p.best
        tuneResults.value = p.results
        tuneFront.value = p.front
      },
    }
    try {
      const result = await runAutoTune(
        image,
        settings.value,
        opts,
        { pool, fidelity: getFidelityClient() },
        signal,
      )
      if (tuneSignal !== signal) return
      tuneResults.value = result.results
      tuneBest.value = result.best
      tuneFront.value = result.front
    } catch (e) {
      if (tuneSignal === signal && !signal.cancelled) tuneError.value = errorMessage(e)
    } finally {
      if (tuneSignal === signal) tuneRunning.value = false
    }
  }

  function stopTune(): void {
    if (tuneSignal) tuneSignal.cancelled = true
    tuneRunning.value = false
  }

  /** Apply a candidate's settings to the live studio (re-traces via the settings watcher). */
  function applyTuneCandidate(candidate: ScoredCandidate): void {
    if (tuneBaseline === null) tuneBaseline = settings.value
    updateSettings(candidate.settings)
    tuneAppliedId.value = candidate.id
    tuneDirty.value = true
    notify(t('tune.appliedToast', { score: (candidate.score * 100).toFixed(1) }), 'success')
  }

  function applyTuneBest(): void {
    if (tuneBest.value) applyTuneCandidate(tuneBest.value)
  }

  /** Restore the settings captured when the search started. */
  function revertTune(): void {
    if (!tuneBaseline) return
    settings.value = tuneBaseline
    if (activeProfileId.value) profileModified.value = true
    tuneAppliedId.value = null
    tuneDirty.value = false
    notify(t('tune.revertedToast'), 'info')
  }

  /** Drop any results/running search (e.g. when the image changes). */
  function resetTune(): void {
    if (tuneRunning.value) stopTune()
    tuneSignal = null
    tuneResults.value = []
    tuneBest.value = null
    tuneFront.value = []
    tuneProgress.value = null
    tuneError.value = null
    tuneAppliedId.value = null
    tuneDirty.value = false
    tuneBaseline = null
  }

  async function doRun(): Promise<void> {
    const image = workingImage.value
    if (!image) return
    const runId = ++runCounter
    busy.value = true
    error.value = null
    try {
      // Optional ML edge hint (cached per image; null when off or unsupported).
      const hint = (await ensureEdgeHint(image)) ?? undefined
      if (runId !== runCounter) return // superseded while preparing the hint
      // The client copies the pixel buffer before transferring it, so the
      // working image stays intact for the preview and later runs.
      const res = await getClient().vectorize(
        image,
        settings.value,
        (stage, overall) => {
          if (runId === runCounter) progress.value = { stage, overall }
        },
        hint,
      )
      if (runId !== runCounter) return
      result.value = res
      busy.value = false
      progress.value = null
      try {
        const report = await computeFidelity(image, res, getFidelityClient())
        if (runId === runCounter) fidelity.value = report
      } catch {
        if (runId === runCounter) fidelity.value = null
      }
    } catch (e) {
      if (runId !== runCounter || isCancelled(e)) return // superseded — stay quiet
      busy.value = false
      progress.value = null
      error.value = errorMessage(e)
    }
  }

  /**
   * Start a trace, unless the user has removed layers — a re-trace rebuilds the
   * geometry from scratch and would discard those edits, so pause and ask first
   * (see {@link confirmRetrace} / {@link cancelRetrace}).
   */
  function startRun(): void {
    if (removedLayers.value.length > 0) {
      retraceConfirm.value = true
      return
    }
    void doRun()
  }

  /** Debounced re-vectorization trigger (used by the settings/image watcher). */
  function run(immediate = false): void {
    if (runTimer !== null) clearTimeout(runTimer)
    if (immediate) {
      runTimer = null
      startRun()
      return
    }
    runTimer = setTimeout(() => {
      runTimer = null
      startRun()
    }, RUN_DEBOUNCE_MS)
  }

  /** Proceed with the pending re-trace, discarding the removed layers. */
  function confirmRetrace(): void {
    retraceConfirm.value = false
    removedLayers.value = []
    void doRun()
  }

  /** Dismiss the prompt and keep the current result with its removed layers. */
  function cancelRetrace(): void {
    retraceConfirm.value = false
  }

  watch([workingImage, settings, edgePrepass], () => {
    if (workingImage.value) run()
  })

  // ------------------------------ ML tools -------------------------------
  async function ensureMlAvailability(): Promise<void> {
    if (mlState.availability !== null || mlState.probing) return
    mlState.probing = true
    try {
      const ml = await import('@trazor/ml')
      mlState.availability = await ml.detectBackend()
    } catch (e) {
      mlState.availability = {
        available: false,
        backend: null,
        reason: `ML module unavailable: ${errorMessage(e)}`,
      }
    } finally {
      mlState.probing = false
    }
  }

  /**
   * Produce the edge hint for the current image when the pre-pass is on. Every
   * mode consumes it — bw/centerline guard the despeckle, color/grayscale guard
   * the small-region merge. Cached per image; fail-soft — on any model error it
   * toasts, turns the toggle off, and returns null so tracing proceeds
   * classically. The model is served same-origin from the app's static assets.
   */
  async function ensureEdgeHint(image: RasterImage): Promise<GrayImage | null> {
    if (!edgePrepass.value) return null
    if (edgeHintImage === image && edgeHint) return edgeHint
    mlState.edge = { busy: true, progress: null, phase: t('ml.phasePreparing') }
    const onProgress = (p: MlProgress): void => {
      const info = mlPhaseInfo(p)
      mlState.edge = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@trazor/ml')
      // Resolve the project model against the deploy base (served same-origin).
      ml.overrideModelUrl(
        'edge-prepass',
        new URL(`${import.meta.env.BASE_URL}models/edge-prepass.onnx`, location.origin).href,
      )
      edgeModel ??= await ml.EdgeEnhancer.create({ onProgress })
      const { edges } = await edgeModel.run(image, { onProgress })
      edgeHintImage = image
      edgeHint = edges
      return edges
    } catch (e) {
      notify(t('toasts.edgeUnavailable', { error: errorMessage(e) }), 'error')
      edgePrepass.value = false // don't retry every run until the model exists
      return null
    } finally {
      mlState.edge = { busy: false, progress: null, phase: '' }
    }
  }

  function setEdgePrepass(on: boolean): void {
    edgePrepass.value = on
  }

  function setAutoOnLoad(on: boolean): void {
    autoOnLoad.value = on
  }

  /**
   * Cancel a running one-shot ML tool. onnxruntime inference cannot be
   * interrupted mid-op, so this flips the run's token: the UI returns to idle at
   * once, the model keeps computing in the background, and its result (and any
   * late progress) is discarded instead of applied.
   */
  function cancelMlTool(tool: MlOneShot): void {
    const token = mlTokens[tool]
    if (!token) return
    token.cancelled = true
    mlTokens[tool] = null
    mlState[tool] = { busy: false, progress: null, phase: '' }
    if (tool === 'magic') cancelMagicSelect()
  }

  async function removeBackground(): Promise<void> {
    const image = workingImage.value
    if (!image || mlState.removeBg.busy) return
    const token = { cancelled: false }
    mlTokens.removeBg = token
    mlState.removeBg = { busy: true, progress: null, phase: t('ml.phasePreparing') }
    const onProgress = (p: MlProgress): void => {
      if (token.cancelled) return
      const info = mlPhaseInfo(p)
      mlState.removeBg = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@trazor/ml')
      if (token.cancelled) return
      remover ??= await ml.BackgroundRemover.create(onProgress)
      if (token.cancelled) return
      const out = await remover.run(image, { onProgress })
      // Only apply if the run wasn't cancelled and the image hasn't been swapped.
      if (!token.cancelled && workingImage.value === image) {
        workingImage.value = out.image
        notify(t('toasts.bgRemoved'), 'success')
      }
    } catch (e) {
      if (!token.cancelled) notify(t('toasts.bgRemovedFailed', { error: errorMessage(e) }), 'error')
    } finally {
      if (mlTokens.removeBg === token) {
        mlTokens.removeBg = null
        mlState.removeBg = { busy: false, progress: null, phase: '' }
      }
    }
  }

  /**
   * One-shot ML cleanup pre-pass: replaces the working image with a denoised/
   * deblocked version so the classical tracer runs on cleaner pixels in any mode
   * (docs/CLEANUP_PREPASS.md). The project's own model, served same-origin from
   * the app's static assets. Fail-soft: with no weights it toasts and leaves the
   * image untouched. Undo via "Restore original".
   */
  async function cleanUp(): Promise<void> {
    const image = workingImage.value
    if (!image || mlState.cleanup.busy) return
    const token = { cancelled: false }
    mlTokens.cleanup = token
    mlState.cleanup = { busy: true, progress: null, phase: t('ml.phasePreparing') }
    const onProgress = (p: MlProgress): void => {
      if (token.cancelled) return
      const info = mlPhaseInfo(p)
      mlState.cleanup = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@trazor/ml')
      if (token.cancelled) return
      ml.overrideModelUrl(
        'cleanup',
        new URL(`${import.meta.env.BASE_URL}models/cleanup.onnx`, location.origin).href,
      )
      cleanupModel ??= await ml.CleanupEnhancer.create({ onProgress })
      if (token.cancelled) return
      const out = await cleanupModel.run(image, { onProgress })
      // Only apply if the run wasn't cancelled and the image hasn't been swapped.
      if (!token.cancelled && workingImage.value === image) {
        workingImage.value = out.image
        notify(t('toasts.cleanedUp'), 'success')
      }
    } catch (e) {
      if (!token.cancelled) notify(t('toasts.cleanupFailed', { error: errorMessage(e) }), 'error')
    } finally {
      if (mlTokens.cleanup === token) {
        mlTokens.cleanup = null
        mlState.cleanup = { busy: false, progress: null, phase: '' }
      }
    }
  }

  function restoreOriginal(): void {
    if (!sourceImage.value) return
    cancelMagicSelect()
    workingImage.value = sourceImage.value
    notify(t('toasts.restoredOriginal'), 'info')
  }

  // ---------------------------- Magic select -----------------------------
  function toggleMagicSelect(): void {
    if (magicActive.value) {
      cancelMagicSelect()
    } else {
      magicActive.value = true
      magicPoints.value = []
    }
  }

  function cancelMagicSelect(): void {
    magicActive.value = false
    magicPoints.value = []
  }

  function addMagicPoint(x: number, y: number, label: 0 | 1): void {
    const image = workingImage.value
    if (!image || !magicActive.value) return
    const px = Math.round(x)
    const py = Math.round(y)
    if (px < 0 || py < 0 || px >= image.width || py >= image.height) return
    magicPoints.value = [...magicPoints.value, { x: px, y: py, label }]
  }

  function undoMagicPoint(): void {
    magicPoints.value = magicPoints.value.slice(0, -1)
  }

  async function applyMagicSelect(): Promise<void> {
    const image = workingImage.value
    if (!image || mlState.magic.busy) return
    if (magicPoints.value.length === 0) {
      cancelMagicSelect()
      return
    }
    const token = { cancelled: false }
    mlTokens.magic = token
    mlState.magic = { busy: true, progress: null, phase: t('ml.phasePreparing') }
    const onProgress = (p: MlProgress): void => {
      if (token.cancelled) return
      const info = mlPhaseInfo(p)
      mlState.magic = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@trazor/ml')
      if (token.cancelled) return
      segmenter ??= await ml.MagicSegmenter.create(onProgress)
      if (token.cancelled) return
      if (segmenterImage !== image) {
        await segmenter.setImage(image, onProgress)
        segmenterImage = image
      }
      if (token.cancelled) return
      const { mask } = await segmenter.segment(magicPoints.value)
      if (token.cancelled) return
      // Apply: zero out alpha outside the mask, keep the canvas size (no crop).
      // settings.background stays as-is: 'auto' detects the new alpha and
      // behaves like 'transparent' per the flattenImage contract.
      const next = cloneRaster(image)
      const maskData = mask.data
      const data = next.data
      for (let p = 0; p < maskData.length; p++) {
        if (maskData[p] === 0) data[p * 4 + 3] = 0
      }
      if (workingImage.value === image) {
        workingImage.value = next
        notify(t('toasts.selectionApplied'), 'success')
      }
      cancelMagicSelect()
    } catch (e) {
      if (!token.cancelled) notify(t('toasts.magicFailed', { error: errorMessage(e) }), 'error')
    } finally {
      if (mlTokens.magic === token) {
        mlTokens.magic = null
        mlState.magic = { busy: false, progress: null, phase: '' }
      }
    }
  }

  // --------------------------- Release notes -----------------------------
  /** Notes newer than the one the visitor last saw — drives the header badge. */
  const unseenReleaseCount = computed(() => countUnseen(lastSeenRelease.value))

  /** Acknowledge every note up to the newest, clearing the "new" badge. */
  function markReleasesSeen(): void {
    lastSeenRelease.value = latestReleaseId()
  }

  // ------------------------------- Theme ---------------------------------
  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  // ------------------------------ Language -------------------------------
  /** Switch the UI language and keep the shared i18n instance in sync. */
  function setLocale(next: LocaleCode): void {
    locale.value = next
  }

  // Drive the vue-i18n instance from store state so every consumer (components
  // and the store's own toasts) reads one active locale.
  watch(locale, (next) => applyLocale(next), { immediate: true })

  // ---------------------------- Persistence ------------------------------
  watch(
    [
      settings,
      activeProfileId,
      profileModified,
      theme,
      edgePrepass,
      autoOnLoad,
      lastSeenRelease,
      locale,
      layersOpen,
      tuneWeights,
      tuneIterations,
    ],
    () => {
      try {
        const state: PersistedState = {
          settings: settings.value,
          activeProfileId: activeProfileId.value,
          profileModified: profileModified.value,
          theme: theme.value,
          edgePrepass: edgePrepass.value,
          autoOnLoad: autoOnLoad.value,
          lastSeenRelease: lastSeenRelease.value ?? undefined,
          locale: locale.value,
          layersOpen: layersOpen.value,
          tuneWeights: tuneWeights.value,
          tuneIterations: tuneIterations.value,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
      } catch {
        // Private mode / quota — persistence is best-effort.
      }
    },
    { flush: 'post' },
  )

  return {
    // state
    sourceImage,
    workingImage,
    sourceName,
    settings,
    activeProfileId,
    profileModified,
    result,
    busy,
    progress,
    error,
    fidelity,
    theme,
    assistRationale,
    toasts,
    paletteSuggestions,
    paletteSuggestionsPending,
    mlState,
    magicActive,
    magicPoints,
    edgePrepass,
    autoOnLoad,
    lastSeenRelease,
    locale,
    layersOpen,
    layerHover,
    selectedLayer,
    removedLayers,
    retraceConfirm,
    tuneOpen,
    tuneRunning,
    tuneProgress,
    tuneResults,
    tuneBest,
    tuneFront,
    tuneError,
    tuneWeights,
    tuneIterations,
    tuneMinFidelity,
    tuneExplorePreprocess,
    tuneExploreStructural,
    tuneAppliedId,
    tuneDirty,
    // derived
    hasImage,
    activeProfile,
    isWorkingModified,
    exportName,
    unseenReleaseCount,
    displaySvg,
    geometry,
    layerModel,
    layerFocus,
    // actions
    notify,
    dismissToast,
    loadBlob,
    loadSample,
    clearImage,
    applyProfile,
    updateSettings,
    resetField,
    resetSettings,
    exportSettings,
    importSettings,
    autoRecommend,
    dismissRationale,
    setFixedPalette,
    clearFixedPalette,
    editPaletteEntry,
    addPaletteEntry,
    removePaletteEntry,
    run,
    ensureMlAvailability,
    setEdgePrepass,
    setAutoOnLoad,
    removeBackground,
    cleanUp,
    cancelMlTool,
    restoreOriginal,
    toggleMagicSelect,
    cancelMagicSelect,
    addMagicPoint,
    undoMagicPoint,
    applyMagicSelect,
    markReleasesSeen,
    openTune,
    closeTune,
    startTune,
    stopTune,
    setTuneWeight,
    applyTunePreset,
    setTuneIterations,
    setTuneMinFidelity,
    setTuneExplore,
    applyTuneCandidate,
    applyTuneBest,
    revertTune,
    toggleTheme,
    setLocale,
    setLayerHover,
    toggleSelectedLayer,
    removeLayer,
    restoreLayers,
    confirmRetrace,
    cancelRetrace,
    setLayersOpen,
    toggleLayersOpen,
  }
})
