import type { RasterImage, VectorizeResult, VectorizeSettings } from '@trazor/core'
import { TrazorPool } from '@trazor/engine'
import { TuneSearch } from '@trazor/tune'
import type { CandidateMetrics, ScoredCandidate, TuneOptions } from '@trazor/tune'
import { create2dCanvas } from './decode'
import { FidelityClient } from './fidelityClient'

/** Long side (px) each candidate SVG is rasterized to for scoring. */
const DEFAULT_SCORE_SIZE = 1024

export interface AutoTuneOptions extends TuneOptions {
  /** Long-side cap for the shared scoring resolution (default 1024). */
  scoreSize?: number
  /** Called after each round with live progress and the best candidate so far. */
  onProgress?: (progress: {
    evaluated: number
    total: number
    converged: boolean
    best: ScoredCandidate | null
  }) => void
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
 * the metrics back. Deterministic given the same inputs and browser; see
 * docs/AUTO_TUNE_PLAN.md.
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

  const search = new TuneSearch(base, opts)

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
        return { id: candidate.id, metrics }
      }),
    )
    if (signal?.cancelled) break
    search.report(scored)
    opts.onProgress?.({ ...search.progress(), best: search.best() })
  }

  return { best: search.best(), results: search.results(), front: search.paretoFront() }
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
