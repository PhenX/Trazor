import { normalizeSettings } from '@trazor/core'
import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { TrazorPool } from '@trazor/engine'
import { isEmptyResult, scaleSettingsForResolution, scoreCandidate, TuneSearch } from '@trazor/tune'
import type { CandidateMetrics, ScoredCandidate, TuneOptions, TuneWeights } from '@trazor/tune'
import { create2dCanvas } from './decode'
import { FidelityClient } from './fidelityClient'

/** Long side (px) each candidate SVG is rasterized to for scoring. */
const DEFAULT_SCORE_SIZE = 1024

/**
 * Above this effective trace long side (px), the search runs at a reduced draft
 * resolution and re-traces only its best candidates at full resolution — a
 * successive-halving pre-screen that keeps a 4096² search from tracing every
 * probe at full cost.
 */
const DRAFT_TRIGGER_LONG = 1500
/** Long side (px) the draft pre-screen traces at. */
const DRAFT_LONG = 1000
/** How many top candidates (by draft score) get the full-resolution re-trace. */
const REFINE_TOP_K = 6

export interface TuneProgress {
  evaluated: number
  total: number
  converged: boolean
  best: ScoredCandidate | null
  /** Every candidate scored so far (snapshot), for a live results wall. */
  results: readonly ScoredCandidate[]
  /** The current Pareto front (snapshot). */
  front: readonly ScoredCandidate[]
}

export interface AutoTuneOptions extends TuneOptions {
  /** Long-side cap for the shared scoring resolution (default 1024). */
  scoreSize?: number
  /** Called after each round with live progress, the best candidate, and results so far. */
  onProgress?: (progress: TuneProgress) => void
}

export interface AutoTuneResult {
  best: ScoredCandidate | null
  results: readonly ScoredCandidate[]
  front: readonly ScoredCandidate[]
}

/** Cooperative cancellation flag the caller flips to stop a run. */
export interface TuneSignal {
  cancelled: boolean
}

/**
 * Drive a settings search to completion: for each candidate the search proposes,
 * trace it in the worker pool, rasterize the SVG at the shared score size on the
 * main thread, score it against the source (score-only, off-thread), and feed
 * the metrics back. Deterministic given the same inputs and browser. For a large
 * image it pre-screens at a draft resolution and re-traces the best candidates at
 * full size (see refineAtFullResolution).
 */
export async function runAutoTune(
  image: RasterImage,
  base: VectorizeSettings,
  opts: AutoTuneOptions,
  deps: { pool: TrazorPool; fidelity: FidelityClient },
  signal?: TuneSignal,
): Promise<AutoTuneResult> {
  const scoreSize = opts.scoreSize ?? DEFAULT_SCORE_SIZE
  const long = Math.max(image.width, image.height)
  const scale = Math.min(1, scoreSize / long)
  const scoreW = Math.max(1, Math.round(image.width * scale))
  const scoreH = Math.max(1, Math.round(image.height * scale))

  // The reference (source over white) is identical for every candidate — send it once.
  const refId = 1
  deps.fidelity.setReference(refId, scoreW, scoreH, referenceRaster(image, scoreW, scoreH))

  // Draft pre-screen: a large image searches at a reduced trace resolution, then
  // re-traces only its best candidates at full resolution (successive halving).
  const userMax = base.maxDimension
  const fullTraceLong = userMax === 0 ? long : Math.min(long, userMax)
  const draft = fullTraceLong > DRAFT_TRIGGER_LONG
  const factorUp = fullTraceLong / DRAFT_LONG
  const searchBase = draft
    ? { ...scaleSettingsForResolution(base, 1 / factorUp), maxDimension: DRAFT_LONG }
    : base

  const search = new TuneSearch(searchBase, opts)

  for (;;) {
    if (signal?.cancelled) break
    const batch = search.nextRound()
    if (batch.length === 0) break

    // Rounds are barriers: the search needs the whole round's scores before it
    // proposes the next, so awaiting per round is intended (candidates within a
    // round run in parallel across the pool).
    // oxlint-disable-next-line no-await-in-loop
    const scored = await Promise.all(
      batch.map(async (candidate) => {
        const result = await deps.pool.run(image, candidate.settings, {
          affinityKey: affinityKey(candidate.settings),
        })
        const metrics = await measure(result, deps.fidelity, refId, scoreW, scoreH)
        return { id: candidate.id, metrics, svg: result.svg }
      }),
    )
    if (signal?.cancelled) break
    search.report(scored)
    opts.onProgress?.({
      ...search.progress(),
      best: search.best(),
      results: search.results().slice(),
      front: search.paretoFront(),
    })
  }

  const draftResult: AutoTuneResult = {
    best: search.best(),
    results: search.results(),
    front: search.paretoFront(),
  }
  if (!draft || signal?.cancelled) return draftResult

  return refineAtFullResolution(image, draftResult, {
    factorUp,
    maxDimension: userMax,
    weights: opts.weights,
    minFidelity: opts.minFidelity,
    deps,
    refId,
    scoreW,
    scoreH,
    onProgress: opts.onProgress,
  })
}

interface RefineContext {
  factorUp: number
  maxDimension: number
  weights: TuneWeights
  minFidelity?: number
  deps: { pool: TrazorPool; fidelity: FidelityClient }
  refId: number
  scoreW: number
  scoreH: number
  onProgress?: (progress: TuneProgress) => void
}

/**
 * Re-trace the draft search's best candidates at full resolution and pick the
 * winner from those accurate scores. Every candidate's settings are scaled back
 * up so applying any of them re-traces at full resolution; the top-K (plus the
 * baseline anchor) also get a real full-resolution trace + score.
 */
async function refineAtFullResolution(
  image: RasterImage,
  draft: AutoTuneResult,
  ctx: RefineContext,
): Promise<AutoTuneResult> {
  const toFull = (s: VectorizeSettings): VectorizeSettings =>
    normalizeSettings({
      ...scaleSettingsForResolution(s, ctx.factorUp),
      maxDimension: ctx.maxDimension,
    })

  // The baseline anchors the "fewer is better" utilities and must be measured at
  // full resolution too, so the refined scores share one honest anchor.
  const baseline = draft.results.find((c) => c.origin === 'baseline') ?? null
  const ranked = draft.results.filter((c) => !c.rejected).toSorted((a, b) => b.score - a.score)
  const refineSet: ScoredCandidate[] = []
  const ids = new Set<number>()
  if (baseline) {
    refineSet.push(baseline)
    ids.add(baseline.id)
  }
  for (const c of ranked) {
    if (ids.has(c.id)) continue
    refineSet.push(c)
    ids.add(c.id)
    if (refineSet.length >= REFINE_TOP_K + 1) break
  }

  const traced = await Promise.all(
    refineSet.map(async (c) => {
      const settings = toFull(c.settings)
      const result = await ctx.deps.pool.run(image, settings, {
        affinityKey: affinityKey(settings),
      })
      const metrics = await measure(result, ctx.deps.fidelity, ctx.refId, ctx.scoreW, ctx.scoreH)
      return { src: c, settings, svg: result.svg, metrics }
    }),
  )

  const fullBaseline =
    traced.find((t) => t.src.id === baseline?.id)?.metrics ?? traced[0]?.metrics ?? null
  const refinedById = new Map<number, ScoredCandidate>()
  for (const t of traced) {
    const empty = isEmptyResult(t.metrics)
    const { score, utilities } = fullBaseline
      ? scoreCandidate(t.metrics, fullBaseline, ctx.weights)
      : { score: 0, utilities: t.src.utilities }
    let rejected: ScoredCandidate['rejected']
    if (empty) rejected = 'empty'
    else if (ctx.minFidelity !== undefined && utilities.fidelity < ctx.minFidelity) {
      rejected = 'fidelity-floor'
    }
    refinedById.set(t.src.id, {
      ...t.src,
      settings: t.settings,
      svg: t.svg,
      metrics: t.metrics,
      score,
      utilities,
      rejected,
    })
  }

  // Full-res refined tiles replace their draft twins; the rest keep the draft
  // preview but carry full-res settings so applying them traces at full size.
  const mapOne = (c: ScoredCandidate): ScoredCandidate =>
    refinedById.get(c.id) ?? { ...c, settings: toFull(c.settings) }
  const results = draft.results.map(mapOne)
  const front = draft.front.map(mapOne)
  // The winner comes only from the full-resolution set (comparable scores).
  let best: ScoredCandidate | null = null
  for (const c of refinedById.values()) {
    if (c.rejected) continue
    if (!best || c.score > best.score) best = c
  }
  ctx.onProgress?.({
    evaluated: draft.results.length,
    total: draft.results.length,
    converged: true,
    best,
    results,
    front,
  })
  return { best: best ?? draft.best, results, front }
}

/** Trace metrics + the fidelity ΔE (recovered from the score-only pass) for one result. */
async function measure(
  result: VectorizeResult,
  fidelity: FidelityClient,
  refId: number,
  scoreW: number,
  scoreH: number,
): Promise<CandidateMetrics> {
  const rendered = await rasterizeSvg(result.svg, scoreW, scoreH)
  const score = await fidelity.scoreAgainst(refId, scoreW, scoreH, rendered)
  return {
    // scoreAgainst returns the clamped fidelity score (1 − 4·ΔE); invert it back
    // to a mean ΔE, which the tune scoring maps through the same clamp.
    meanDeltaE: (1 - score) / 4,
    nodeCount: result.stats.nodeCount,
    pathCount: result.stats.pathCount,
    byteLength: result.stats.byteLength,
    colorCount: result.stats.colorCount,
    warnings: result.warnings,
    durationMs: result.stats.durationMs,
  }
}

/** The preprocess+palette settings slice a warm worker cache is keyed by. */
function affinityKey(s: VectorizeSettings): string {
  return [
    s.mode,
    s.maxDimension,
    s.denoise,
    s.blurRadius,
    s.background,
    s.backgroundColor,
    s.alphaThreshold,
    s.segmentation,
    s.paletteSize,
    s.autoPaletteSize,
    s.colorSpace,
    s.quantizeQuality,
    s.palette ? s.palette.join(',') : '-',
    s.minRegionArea,
    s.preserveDetails,
    s.dissolveBands,
    s.colorCoherence,
    s.omitBackground,
    s.thresholdMode,
    s.threshold,
    s.adaptiveRadius,
    s.adaptiveBias,
    s.invert,
  ].join('|')
}

/** Source image drawn over white into a `w`×`h` box, RGBA — the scoring reference. */
function referenceRaster(image: RasterImage, w: number, h: number): Uint8ClampedArray<ArrayBuffer> {
  const src = create2dCanvas(image.width, image.height)
  src.ctx.putImageData(
    new ImageData(new Uint8ClampedArray(image.data), image.width, image.height),
    0,
    0,
  )
  const ref = create2dCanvas(w, h)
  ref.ctx.fillStyle = '#ffffff'
  ref.ctx.fillRect(0, 0, w, h)
  ref.ctx.imageSmoothingEnabled = true
  ref.ctx.imageSmoothingQuality = 'high'
  ref.ctx.drawImage(src.canvas, 0, 0, w, h)
  return ref.ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray<ArrayBuffer>
}

/** Rasterize an SVG string over white into a `w`×`h` box (DOM-bound, main thread). */
async function rasterizeSvg(
  svg: string,
  w: number,
  h: number,
): Promise<Uint8ClampedArray<ArrayBuffer>> {
  const img = await loadSvgImage(svg)
  const canvas = create2dCanvas(w, h)
  canvas.ctx.fillStyle = '#ffffff'
  canvas.ctx.fillRect(0, 0, w, h)
  canvas.ctx.drawImage(img, 0, 0, w, h)
  return canvas.ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray<ArrayBuffer>
}

function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.addEventListener('load', () => resolve(img), { once: true })
    img.addEventListener(
      'error',
      () => reject(new Error('could not rasterize the SVG candidate')),
      {
        once: true,
      },
    )
    img.src = url
  }).finally(() => URL.revokeObjectURL(url))
}

/** A sensible default worker count for the pool, bounded by cores and image size. */
export function defaultPoolSize(image: RasterImage | null): number {
  const cores = typeof navigator !== 'undefined' ? (navigator.hardwareConcurrency ?? 4) : 4
  let size = Math.min(6, Math.max(2, cores - 2))
  // Each worker holds a transferred RGBA copy plus its cache; cap on large images.
  if (image) {
    const megapixels = (image.width * image.height) / 1_000_000
    if (megapixels > 8) size = Math.min(size, 3)
    else if (megapixels > 4) size = Math.min(size, 4)
  }
  return size
}
