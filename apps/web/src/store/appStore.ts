import {
  cloneRaster,
  DEFAULT_SETTINGS,
  getProfile,
  normalizeSettings,
  parseSettingsImport,
  serializeSettings,
  TARGET_PROFILES,
} from '@vectorizer/core'
import type {
  ProfileId,
  RasterImage,
  StageId,
  TargetProfile,
  VectorizeResult,
  VectorizeSettings,
} from '@vectorizer/core'
import { analyzeImage, recommendSettings, suggestPalettes } from '@vectorizer/assist'
import type { PaletteSuggestion } from '@vectorizer/assist'
import { VectorizerClient } from '@vectorizer/engine'
import type { MlAvailability, MlProgress } from '@vectorizer/ml'
import { defineStore } from 'pinia'
import { computed, reactive, ref, shallowRef, watch } from 'vue'
import { decodeBlob } from '../lib/decode'
import { computeFidelity } from '../lib/fidelity'
import type { FidelityReport } from '../lib/fidelity'
import { getSample } from '../lib/samples'

const STORAGE_KEY = 'vectorizer:v1'
const RUN_DEBOUNCE_MS = 300

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

/** Run work off the critical path (idle callback when available). */
function deferToIdle(fn: () => void): void {
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(() => fn(), { timeout: 1500 })
  } else {
    setTimeout(fn, 0)
  }
}

function mlPhaseInfo(p: MlProgress): { progress: number | null; phase: string } {
  if (p.phase === 'download') {
    const frac = p.total > 0 ? (p.loaded / p.total) * 0.85 : null
    const mb = (p.loaded / 1_000_000).toFixed(1)
    return { progress: frac, phase: `Downloading model · ${mb} MB` }
  }
  if (p.phase === 'compile') return { progress: 0.9, phase: 'Compiling model' }
  return { progress: null, phase: 'Running' }
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
  const theme = ref<Theme>(
    persisted.theme === 'light' || persisted.theme === 'dark' ? persisted.theme : systemTheme(),
  )
  const assistRationale = ref<string[] | null>(null)
  const toasts = ref<Toast[]>([])
  const paletteSuggestions = ref<PaletteSuggestion[]>([])
  /** True while suggestions are being recomputed for a changed image. */
  const paletteSuggestionsPending = ref(false)

  const mlState = reactive({
    probing: false,
    availability: null as MlAvailability | null,
    removeBg: { busy: false, progress: null, phase: '' } as MlToolState,
    magic: { busy: false, progress: null, phase: '' } as MlToolState,
  })
  const magicActive = ref(false)
  const magicPoints = ref<MagicPoint[]>([])

  // Non-reactive machinery
  let client: VectorizerClient | null = null
  let runCounter = 0
  let runTimer: ReturnType<typeof setTimeout> | null = null
  let toastCounter = 0
  // ML instances are heavyweight; keep them outside reactivity.
  let remover: import('@vectorizer/ml').BackgroundRemover | null = null
  let segmenter: import('@vectorizer/ml').MagicSegmenter | null = null
  let segmenterImage: RasterImage | null = null
  const suggestionCache = new WeakMap<RasterImage, PaletteSuggestion[]>()

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

  // ------------------------------- Toasts --------------------------------
  function notify(message: string, kind: ToastKind = 'info'): void {
    const id = ++toastCounter
    toasts.value = [...toasts.value, { id, message, kind }]
    setTimeout(() => dismissToast(id), 6000)
  }

  function dismissToast(id: number): void {
    toasts.value = toasts.value.filter((t) => t.id !== id)
  }

  // ------------------------------ Loading --------------------------------
  async function loadBlob(blob: Blob, name: string): Promise<void> {
    try {
      const image = await decodeBlob(blob, name)
      cancelMagicSelect()
      sourceImage.value = image
      workingImage.value = image
      sourceName.value = name || 'image'
      result.value = null
      fidelity.value = null
      error.value = null
    } catch (e) {
      notify(`Could not load image: ${errorMessage(e)}`, 'error')
    }
  }

  async function loadSample(id: string): Promise<void> {
    const sample = getSample(id)
    if (!sample) return
    try {
      const image = await sample.make()
      cancelMagicSelect()
      sourceImage.value = image
      workingImage.value = image
      sourceName.value = sample.label.toLowerCase()
      result.value = null
      fidelity.value = null
      error.value = null
    } catch (e) {
      notify(`Could not build sample: ${errorMessage(e)}`, 'error')
    }
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
      notify('Settings imported', 'success')
      return true
    } catch (e) {
      notify(`Import failed: ${errorMessage(e)}`, 'error')
      return false
    }
  }

  async function autoRecommend(): Promise<void> {
    const image = workingImage.value
    if (!image) return
    try {
      const analysis = analyzeImage(image)
      const rec = recommendSettings(analysis)
      // The recommendation refines its suggested profile, so apply the profile
      // patch first and the recommendation patch on top (both over defaults).
      settings.value = normalizeSettings({ ...getProfile(rec.profileId).patch, ...rec.patch })
      activeProfileId.value = rec.profileId
      profileModified.value = false
      assistRationale.value = rec.rationale
    } catch (e) {
      notify(`Auto settings failed: ${errorMessage(e)}`, 'error')
    }
  }

  function dismissRationale(): void {
    assistRationale.value = null
  }

  // -------------------------- Palette suggestions ------------------------
  // Derived from image stats by @vectorizer/assist. Recomputed (deferred, so
  // first paint isn't blocked) whenever the working image changes; cached per
  // image so restoring the original is instant.
  function refreshPaletteSuggestions(image: RasterImage): void {
    const cached = suggestionCache.get(image)
    if (cached) {
      paletteSuggestions.value = cached
      paletteSuggestionsPending.value = false
      return
    }
    paletteSuggestionsPending.value = true
    deferToIdle(() => {
      // The image may have been replaced while we waited.
      if (workingImage.value !== image) return
      try {
        const suggestions = suggestPalettes(image)
        suggestionCache.set(image, suggestions)
        paletteSuggestions.value = suggestions
      } catch {
        paletteSuggestions.value = []
      } finally {
        paletteSuggestionsPending.value = false
      }
    })
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
  function getClient(): VectorizerClient {
    client ??= new VectorizerClient(
      () =>
        new Worker(new URL('../worker/vectorize.worker.ts', import.meta.url), { type: 'module' }),
    )
    return client
  }

  async function doRun(): Promise<void> {
    const image = workingImage.value
    if (!image) return
    const runId = ++runCounter
    busy.value = true
    error.value = null
    try {
      // The client copies the pixel buffer before transferring it, so the
      // working image stays intact for the preview and later runs.
      const res = await getClient().vectorize(image, settings.value, (stage, overall) => {
        if (runId === runCounter) progress.value = { stage, overall }
      })
      if (runId !== runCounter) return
      result.value = res
      busy.value = false
      progress.value = null
      try {
        const report = await computeFidelity(image, res)
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

  /** Debounced re-vectorization trigger (used by the settings/image watcher). */
  function run(immediate = false): void {
    if (runTimer !== null) clearTimeout(runTimer)
    if (immediate) {
      runTimer = null
      void doRun()
      return
    }
    runTimer = setTimeout(() => {
      runTimer = null
      void doRun()
    }, RUN_DEBOUNCE_MS)
  }

  watch([workingImage, settings], () => {
    if (workingImage.value) run()
  })

  // ------------------------------ ML tools -------------------------------
  async function ensureMlAvailability(): Promise<void> {
    if (mlState.availability !== null || mlState.probing) return
    mlState.probing = true
    try {
      const ml = await import('@vectorizer/ml')
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

  async function removeBackground(): Promise<void> {
    const image = workingImage.value
    if (!image || mlState.removeBg.busy) return
    mlState.removeBg = { busy: true, progress: null, phase: 'Preparing' }
    const onProgress = (p: MlProgress): void => {
      const info = mlPhaseInfo(p)
      mlState.removeBg = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@vectorizer/ml')
      remover ??= await ml.BackgroundRemover.create(onProgress)
      const out = await remover.run(image, { onProgress })
      // Only apply if the user hasn't swapped images mid-run.
      if (workingImage.value === image) {
        workingImage.value = out.image
        notify('Background removed — tracing the cutout', 'success')
      }
    } catch (e) {
      notify(`Background removal failed: ${errorMessage(e)}`, 'error')
    } finally {
      mlState.removeBg = { busy: false, progress: null, phase: '' }
    }
  }

  function restoreOriginal(): void {
    if (!sourceImage.value) return
    cancelMagicSelect()
    workingImage.value = sourceImage.value
    notify('Restored the original image', 'info')
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
    mlState.magic = { busy: true, progress: null, phase: 'Preparing' }
    const onProgress = (p: MlProgress): void => {
      const info = mlPhaseInfo(p)
      mlState.magic = { busy: true, progress: info.progress, phase: info.phase }
    }
    try {
      const ml = await import('@vectorizer/ml')
      segmenter ??= await ml.MagicSegmenter.create(onProgress)
      if (segmenterImage !== image) {
        await segmenter.setImage(image, onProgress)
        segmenterImage = image
      }
      const { mask } = await segmenter.segment(magicPoints.value)
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
        notify('Selection applied — tracing the cutout', 'success')
      }
      cancelMagicSelect()
    } catch (e) {
      notify(`Magic select failed: ${errorMessage(e)}`, 'error')
    } finally {
      mlState.magic = { busy: false, progress: null, phase: '' }
    }
  }

  // ------------------------------- Theme ---------------------------------
  function toggleTheme(): void {
    theme.value = theme.value === 'dark' ? 'light' : 'dark'
  }

  // ---------------------------- Persistence ------------------------------
  watch(
    [settings, activeProfileId, profileModified, theme],
    () => {
      try {
        const state: PersistedState = {
          settings: settings.value,
          activeProfileId: activeProfileId.value,
          profileModified: profileModified.value,
          theme: theme.value,
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
    // derived
    hasImage,
    activeProfile,
    isWorkingModified,
    exportName,
    // actions
    notify,
    dismissToast,
    loadBlob,
    loadSample,
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
    removeBackground,
    restoreOriginal,
    toggleMagicSelect,
    cancelMagicSelect,
    addMagicPoint,
    undoMagicPoint,
    applyMagicSelect,
    toggleTheme,
  }
})
