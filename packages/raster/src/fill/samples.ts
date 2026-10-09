/**
 * The observations a fill fit is made on: a region's strictly interior pixels
 * (every 4-neighbor in the region, not on the picture edge) that testify about
 * its fill, with their positions and colors, and the sampling caps that bound
 * one fit's cost whatever the region's size.
 *
 * Positions are in the fitting frame: a pixel's center at its integer indices
 * `(i, j)`, inkvec's frame, so that every search makes inkvec's arithmetic to
 * the bit. A fitted model leaves `select.ts` moved by +½ into Trazor's frame,
 * where pixel `(i, j)` covers `[i, i+1] × [j, j+1]` ({@link toPixelFrame}).
 * Pixel indices `y·w + x` need no shift.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient.rs` (`Samples`,
 * `collect_samples`, `interior_count`, `mean3`, `centroid`, `colors`),
 * `gradient/budget.rs` (`MAX_FIT_SAMPLES`, `FIT_PIXELS_CAP`, `CENTRE_SEARCH_SAMPLES`,
 * `fit_cap`) and `gradient/bands.rs` (`strided_union`).
 */

import { srgbToLinear32 } from './model'
import type { FillModel, Interp } from './model'

/** The offset from the fitting frame (pixel centers at integer indices) to Trazor's (pixel centers at `i + ½`). */
export const FRAME_SHIFT = 0.5

/** A model fitted in the fitting frame, moved into Trazor's pixel frame (+½ in both axes). */
export function toPixelFrame(model: FillModel): FillModel {
  return shiftFill(model, FRAME_SHIFT)
}

/** A model in Trazor's pixel frame, moved into the fitting frame (−½ in both axes). */
export function toFittingFrame(model: FillModel): FillModel {
  return shiftFill(model, -FRAME_SHIFT)
}

/** `model` with its points moved by `(d, d)`. */
function shiftFill(model: FillModel, d: number): FillModel {
  if (model.kind === 'flat') return model
  if (model.kind === 'linear') {
    return {
      ...model,
      p0: [model.p0[0] + d, model.p0[1] + d],
      p1: [model.p1[0] + d, model.p1[1] + d],
    }
  }
  return { ...model, c: [model.c[0] + d, model.c[1] + d] }
}

/**
 * Most samples one fit scores: a larger sample set is strided down to about
 * this many ({@link fitStride}).
 */
export const MAX_FIT_SAMPLES = 4096

/**
 * Pixels one fit gathers before it is sampled down to {@link MAX_FIT_SAMPLES}:
 * sixteen times what the fit evaluates, a sample spread evenly over the
 * interior rather than over the region ({@link stridedUnion}).
 */
export const FIT_PIXELS_CAP = 65536

/**
 * Samples a radial or elliptical center search evaluates per candidate
 * geometry; the final stops are fitted on every sample.
 */
export const CENTRE_SEARCH_SAMPLES = 1024

/** Stride of the scoring subsample of `n` samples: `max(⌊n / MAX_FIT_SAMPLES⌋, 1)`. */
export function fitStride(n: number): number {
  return Math.max(Math.floor(n / MAX_FIT_SAMPLES), 1)
}

/** Whether pixel `p` belongs to the region being fitted (or may testify about its fill). */
export type PixelTest = (p: number) => boolean

/**
 * One region's samples, sorted by pixel index; the arrays are parallel, one
 * entry (or three, for colors) per sample.
 */
export interface Samples {
  readonly n: number
  /** Pixel indices `y·w + x`, ascending. */
  readonly px: Int32Array
  /** Pixel-center x in the fitting frame, the column index `i`. */
  readonly x: Float64Array
  /** Pixel-center y in the fitting frame, the row index `j`. */
  readonly y: Float64Array
  /** Observed encoded sRGB, three per sample. */
  readonly srgb: Float32Array
  /** The same in linear light, three per sample. */
  readonly lin: Float64Array
  /** The sRGB colors widened to doubles, three per sample (the `srgb` fitting space). */
  readonly srgbWide: Float64Array
}

/**
 * Whether pixel `p` of a `w × h` image is strictly interior to the region
 * `member`: not on the picture edge, and all four neighbors members. The picture
 * edge is a boundary: a pixel on it is half-covered by whatever lies off-canvas.
 */
export function isInterior(p: number, w: number, h: number, member: PixelTest): boolean {
  const x = p % w
  const y = (p - x) / w
  return (
    x > 0 &&
    x + 1 < w &&
    y > 0 &&
    y + 1 < h &&
    member(p - 1) &&
    member(p + 1) &&
    member(p - w) &&
    member(p + w)
  )
}

/** How many of `pixels` are strictly interior to `member` ({@link isInterior}). */
export function interiorCount(
  pixels: ArrayLike<number>,
  w: number,
  h: number,
  member: PixelTest,
): number {
  let n = 0
  for (let i = 0; i < pixels.length; i++) if (isInterior(pixels[i], w, h, member)) n++
  return n
}

/**
 * The samples among `pixels`: those that pass `evidence` (null: all do) and,
 * with `strict`, are strictly interior to `member`. Without `strict` every
 * evidence pixel is taken: the fallback for a region too thin to have an
 * interior (a 1 px line), which can only be fitted flat. `rgb` is the image
 * composited over white, encoded sRGB, three per pixel. The samples come sorted
 * by pixel index whatever order `pixels` is in.
 */
export function collectSamples(
  rgb: Float32Array,
  w: number,
  h: number,
  pixels: ArrayLike<number>,
  member: PixelTest,
  evidence: PixelTest | null,
  strict: boolean,
): Samples {
  const keep = new Int32Array(pixels.length)
  let n = 0
  for (let i = 0; i < pixels.length; i++) {
    const p = pixels[i]
    if (evidence !== null && !evidence(p)) continue
    if (strict && !isInterior(p, w, h, member)) continue
    keep[n++] = p
  }
  const px = keep.subarray(0, n).toSorted()
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const srgb = new Float32Array(3 * n)
  const lin = new Float64Array(3 * n)
  const srgbWide = new Float64Array(3 * n)
  for (let i = 0; i < n; i++) {
    const p = px[i]
    const xi = p % w
    x[i] = xi
    y[i] = (p - xi) / w
    for (let k = 0; k < 3; k++) {
      const v = rgb[3 * p + k]
      srgb[3 * i + k] = v
      srgbWide[3 * i + k] = v
      lin[3 * i + k] = srgbToLinear32(v)
    }
  }
  return { n, px, x, y, srgb, lin, srgbWide }
}

/** Samples from explicit arrays (positions in the fitting frame, colors sRGB): for tests and callers that build their own. */
export function samplesOf(
  px: ArrayLike<number>,
  x: ArrayLike<number>,
  y: ArrayLike<number>,
  srgb: ArrayLike<number>,
): Samples {
  const n = px.length
  const s32 = Float32Array.from(srgb)
  const lin = new Float64Array(3 * n)
  for (let i = 0; i < 3 * n; i++) lin[i] = srgbToLinear32(s32[i])
  return {
    n,
    px: Int32Array.from(px),
    x: Float64Array.from(x),
    y: Float64Array.from(y),
    srgb: s32,
    lin,
    srgbWide: Float64Array.from(s32),
  }
}

/** The sample index of pixel `p`, or -1 (binary search: `px` is ascending). */
export function sampleAt(s: Samples, p: number): number {
  let lo = 0
  let hi = s.n - 1
  const px = s.px
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1
    const v = px[mid]
    if (v === p) return mid
    if (v < p) lo = mid + 1
    else hi = mid - 1
  }
  return -1
}

/** Mean sample position; `(0, 0)` with no samples. */
export function centroid(s: Samples): [number, number] {
  const n = Math.max(s.n, 1)
  let sx = 0
  let sy = 0
  for (let i = 0; i < s.n; i++) sx += s.x[i]
  for (let i = 0; i < s.n; i++) sy += s.y[i]
  return [sx / n, sy / n]
}

/** The sample colors in a fitting space, three per sample (shared, not copied). */
export function colorsIn(s: Samples, space: Interp): Float64Array {
  return space === 'linearRgb' ? s.lin : s.srgbWide
}

/** Per-channel mean of `count` colors (three per entry); `[0, 0, 0]` when empty. */
export function mean3(cols: Float64Array, count: number): [number, number, number] {
  const n = Math.max(count, 1)
  let m0 = 0
  let m1 = 0
  let m2 = 0
  for (let i = 0; i < count; i++) {
    m0 += cols[3 * i]
    m1 += cols[3 * i + 1]
    m2 += cols[3 * i + 2]
  }
  return [m0 / n, m1 / n, m2 / n]
}

/**
 * The pixels a fit of a union gathers from the concatenation `a ++ b`: all of
 * them up to {@link FIT_PIXELS_CAP}, else every `⌊len / FIT_PIXELS_CAP⌋`-th,
 * starting at the first.
 */
export function stridedUnion(a: ArrayLike<number>, b: ArrayLike<number>): Int32Array {
  const la = a.length
  const total = la + b.length
  const stride = total <= FIT_PIXELS_CAP ? 1 : Math.floor(total / FIT_PIXELS_CAP)
  const out = new Int32Array(Math.ceil(total / stride))
  let n = 0
  for (let k = 0; k < total; k += stride) out[n++] = k < la ? a[k] : b[k - la]
  return out
}
