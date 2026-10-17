/**
 * Soft intake: reduce a resampled or blurred raster to the detail it carries before it is
 * traced.
 *
 * A raster upscaled from a smaller one, or blurred, spreads every edge over several pixels.
 * The tracer is built for one-pixel edges and meets the wide ramp three ways: the ramp's middle
 * colors become inks of their own, the exact-coverage boundary solve ripples points across a
 * ramp no sharp edge reproduces, and the fitter prices every surplus pixel as evidence. The
 * decision ({@link softVerdict}), in order, each step ending it when it says no:
 *
 * 1. Measure the raster composited over white ({@link rampEvidence}).
 * 2. **Gate**: at least {@link MIN_EDGES} measured edges, and at least {@link SOFT_GATE} of them
 *    wider than any native render makes one.
 * 3. **Sharp-edge veto** ({@link SHARP_VETO}): not when the strong edges are mostly native-sharp,
 *    a sharp drawing with a glow or a drop shadow, traced at the size it arrived.
 * 4. **Factor**: the upscale's own period when {@link gridContrast} shows one near what the edge
 *    width implies, else the width's integer factor ({@link factorForWidth}); an integer, so the
 *    reduction lands back on the grid the upscale came from.
 * 5. **About 2× is kept** ({@link MIN_UPSCALE}): reducing such upscales did not pay.
 * 6. **Guards**: the thinnest strokes and gaps keep at least {@link MIN_FEATURE_PX} pixels and the
 *    short side at least {@link MIN_SIDE}; within that the factor is the largest divisor of the
 *    measured upscale ({@link cappedFactor}); shaded artwork is reduced only by
 *    {@link SHADED_MIN_FACTOR} or more.
 *
 * Then {@link reduceRaster} area-averages by the factor ({@link downsampleTo}), each side
 * `round(side / factor)`, back onto the 8-bit lattice. The caller presents the SVG at the
 * arrival size, axis by axis, since each side is rounded on its own.
 *
 * The degradation model is the one blind super-resolution trains for (K. Zhang, J. Liang,
 * L. Van Gool, R. Timofte, "Designing a Practical Degradation Model for Deep Blind Image
 * Super-Resolution", ICCV 2021, arXiv 2103.14006); this only removes the surplus pixels an
 * upscale added, which needs no model. Not from the literature: the decision rules, each set
 * from the degraded benchmarks named at its constant.
 *
 * After inkvec (Apache-2.0): `inkvec-cli/src/soft_intake.rs` (`verdict`, `reduce`,
 * `factor_for_width`, `factor_for`, `capped_factor` and the constants).
 */
import type { RasterImage } from '@trazor/core'
import { compositeOverWhite, downsampleTo, rasterToRgba } from './coverage'
import { gridContrast, MIN_EDGES, rampEvidence, shadingShare, SOFT_FRACTION_GATE } from './softness'
import type { RampEvidence } from './softness'

/** Least share of measured edges wider than native for the raster to count as soft. */
export const SOFT_GATE = SOFT_FRACTION_GATE

/**
 * Share of native-sharp strong edges ({@link RampEvidence.sharpFraction}) from which the raster
 * is a sharp drawing with a soft element: every glow and shadow image reads 0.80 or more, every
 * bicubic 4×, bicubic 2× and Lanczos 3× upscale 0.20 or less, a clean render 1.00.
 */
export const SHARP_VETO = 0.5

/** Least box-equivalent edge width worth a reduction at all. */
export const MIN_WIDTH = 1.6

/**
 * `factor = round(FACTOR_SLOPE · width − FACTOR_OFFSET)`: the line through the measured upscales
 * (bilinear 2× at 2.1, bicubic 3× at 2.5, bicubic 4× at 3.3, bicubic 8× at 6.1), shifted down
 * by 0.2 so a bilinear 2×, whose widths spread to 2.4, is never read as 3×.
 */
export const FACTOR_SLOPE = 1.4
/** See {@link FACTOR_SLOPE}. */
export const FACTOR_OFFSET = 0.756
/** A repeat period whose {@link gridContrast} reaches this is the upscale's own grid, when within {@link GRID_REACH} of the implied factor. */
export const GRID_CONTRAST = 0.5
/** How far from the factor the edge width implies a repeat period may lie. */
export const GRID_REACH = 1.2
/** Periods tested for a grid; 2 is absent, a symmetric kernel shows no phase at 2×. */
export const GRID_PERIODS: readonly number[] = [3, 4, 5, 6, 8]
/** Never reduce by more than this, however wide the edges read. */
export const MAX_FACTOR = 8
/** Least upscale, as measured (before the guards cap it), that is reduced. */
export const MIN_UPSCALE = 3
/** After the reduction the thinnest strokes and gaps (their 10th percentile) keep at least this many pixels. */
export const MIN_FEATURE_PX = 3.0
/** Never trace a reduction smaller than this on its short side. */
export const MIN_SIDE = 16
/** Shaded artwork ({@link shadingShare} at or above this) is reduced only by {@link SHADED_MIN_FACTOR} or more. */
export const SHADED_SHARE = 0.008
/** See {@link SHADED_SHARE}. */
export const SHADED_MIN_FACTOR = 4
/** Least side, in pixels, of a reduction. */
const MIN_REDUCED_SIDE = 8

/** Why a raster is traced as it arrived. */
export type SoftKeepReason =
  | 'too-few-edges'
  | 'native-edges'
  | 'sharp-edges'
  | 'barely-soft'
  | 'about-2x'
  | 'thin-features'
  | 'shaded-artwork'

/** The decision, with the evidence it was made on. */
export interface SoftVerdict {
  evidence: RampEvidence
  /** The reduction to apply; 1 means none. */
  factor: number
  /** Why nothing is done, when nothing is; null when the raster is reduced. */
  reason: SoftKeepReason | null
}

/** The integer reduction an edge width implies, `round(1.4·width − 0.756)` in `[1, 8]`. */
export function factorForWidth(width: number): number {
  const f = Math.round(FACTOR_SLOPE * width - FACTOR_OFFSET)
  return Math.min(Math.max(f, 1), MAX_FACTOR)
}

/**
 * The reduction: the period in {@link GRID_PERIODS} within {@link GRID_REACH} of the implied
 * factor whose {@link gridContrast} is highest (the later period on a tie), if it reaches
 * {@link GRID_CONTRAST}, else {@link factorForWidth}.
 */
function factorFor(rgb: Float32Array, w: number, h: number, width: number): number {
  const implied = FACTOR_SLOPE * width - FACTOR_OFFSET
  let best = 0
  let bestContrast = -Infinity
  for (const k of GRID_PERIODS) {
    if (Math.abs(k - implied) > GRID_REACH) continue
    const c = gridContrast(rgb, w, h, k)
    if (c >= GRID_CONTRAST && c >= bestContrast) {
      best = k
      bestContrast = c
    }
  }
  return best > 0 ? best : factorForWidth(width)
}

/**
 * The largest divisor of the measured upscale `wanted` that is at most `cap`: the reduction
 * lands on a grid commensurate with the source's, so each source pixel becomes a whole number
 * of traced pixels. 0 when `cap` is 0.
 */
export function cappedFactor(wanted: number, cap: number): number {
  let f = Math.min(wanted, cap)
  while (f > 1 && Math.floor(wanted / f) * f !== wanted) f--
  return f
}

/**
 * Decide whether, and by how much, to reduce the raster `rgb` (composited over white,
 * `w × h`) before tracing: steps 1–6 of the module documentation, in order. O(pixels) for the
 * evidence, plus one pass per candidate grid period and one for the shading share when they
 * are reached.
 */
export function softVerdict(rgb: Float32Array, w: number, h: number): SoftVerdict {
  const evidence = rampEvidence(rgb, w, h)
  const keep = (reason: SoftKeepReason): SoftVerdict => ({ evidence, factor: 1, reason })
  if (evidence.edges < MIN_EDGES) return keep('too-few-edges')
  if (evidence.softFraction < SOFT_GATE) return keep('native-edges')
  if (evidence.sharpFraction >= SHARP_VETO) return keep('sharp-edges')
  if (evidence.width < MIN_WIDTH) return keep('barely-soft')
  const wanted = factorFor(rgb, w, h, evidence.width)
  if (wanted < MIN_UPSCALE) return keep('about-2x')
  const room = Math.max(Math.floor(evidence.featureP10 / MIN_FEATURE_PX), 1)
  const bySide = Math.max(Math.floor(Math.min(w, h) / MIN_SIDE), 1)
  const factor = cappedFactor(wanted, Math.min(room, bySide))
  if (factor < 2) return keep('thin-features')
  if (factor < SHADED_MIN_FACTOR && shadingShare(rgb, w, h, 3 * factor) >= SHADED_SHARE) {
    return keep('shaded-artwork')
  }
  return { evidence, factor, reason: null }
}

/**
 * `image` reduced by `factor`: each side `round(side / factor)` (at least 8 px) by the exact
 * area average, then every channel back on the 8-bit lattice, `round(255·v + 10⁻⁴)`. A blurred
 * raster's flat regions come out of the average a few thousandths of a level off flat, and the
 * stages that ask whether a fill is flat expect decoded input, where flat is exact; the `10⁻⁴`
 * rounds an exact half level up, as an image library writing the reduction would.
 */
export function reduceRaster(image: RasterImage, factor: number): RasterImage {
  const nw = Math.max(Math.round(image.width / factor), MIN_REDUCED_SIDE)
  const nh = Math.max(Math.round(image.height / factor), MIN_REDUCED_SIDE)
  const small = downsampleTo(rasterToRgba(image), nw, nh)
  const data = new Uint8ClampedArray(small.data.length)
  for (let i = 0; i < data.length; i++) data[i] = Math.round(small.data[i] * 255 + 1e-4)
  return { width: small.width, height: small.height, data }
}

/** The raster to trace, and the verdict it was decided by. */
export interface SoftIntake {
  /** `image` itself when the verdict keeps it, else its reduction. */
  image: RasterImage
  verdict: SoftVerdict
}

/**
 * The soft intake of a decoded raster: {@link softVerdict} on it composited over white, then
 * {@link reduceRaster} when the verdict asks for a reduction.
 */
export function softIntake(image: RasterImage): SoftIntake {
  const rgb = compositeOverWhite(rasterToRgba(image))
  const verdict = softVerdict(rgb, image.width, image.height)
  if (verdict.factor < 2) return { image, verdict }
  return { image: reduceRaster(image, verdict.factor), verdict }
}
