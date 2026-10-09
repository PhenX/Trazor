/**
 * The intake measurements every later stage is tuned by, and the exact-area resampling that
 * reduces an intake.
 *
 * - {@link intakePixels}: a decoded raster as the front end reads it, composited over white.
 * - {@link intakeScale}: how many pixels an edge takes to cross (1.0 on a native render).
 * - {@link ringingScore}: whether compression ringing surrounds the strong edges.
 * - {@link oversampleFactor}: how many times more pixels the raster has than its drawing needs.
 * - {@link intakeEvidence}: the palette's soft-intake switch built from those measurements
 *   (edge width, ringing, the lossy-container flag) and the noise estimate.
 * - {@link rasterUnitScales}: how the pixel-denominated knobs are priced in the raster's own units.
 * - {@link downsampleTo}: the exact box filter, premultiplied.
 *
 * Every measurement is index-based (rows, columns, pixel neighborhoods) and needs no shift
 * between inkvec's pixel-center and Trazor's pixel-corner coordinates; the resampler already
 * works in pixel-edge coordinates, source pixel `(x, y)` covering `[x, x+1) × [y, y+1)`.
 * Single-precision steps of inkvec are kept with `Math.fround`, so every reading matches it bit
 * for bit on the same image.
 *
 * Method from: T. Porter, T. Duff, "Compositing Digital Images", SIGGRAPH 1984 (the "over"
 * operator); G. Borgefors, "Distance transformations in digital images", CVGIP 34(3), 1986
 * (the 3-4 chamfer transform); the quantiles by selection, C. A. R. Hoare, "Algorithm 65:
 * Find", CACM 4(7), 1961. Inspired by: R. J. Hyndman, A. B. Koehler, "Another look at measures
 * of forecast accuracy", IJF 22(4), 2006 (the round trip's error relative to the best constant
 * image).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/coverage.rs` (`Rgba::composited`,
 * `intake_scale`, `ringing_score`, `chamfer_distance_to_edges`, `kth_smallest`),
 * `inkvec-trace/src/coverage/oversample.rs` (`oversample_factor`, `flat_error`,
 * `OVERSAMPLE_TOL`, `OVERSAMPLE_KEEP`), `inkvec-trace/src/coverage/resample.rs`
 * (`downsample_to`, `box_resample`), `inkvec-trace/src/load.rs` (`UNIT`), the soft-intake gate
 * of `inkvec-trace/src/lib.rs` (`trace_color_full_with_alpha`) and `inkvec-cli/src/lib.rs`
 * (`price_in_raster_units`) with `inkvec-cli/src/units.rs` (`REF_EXTENT`).
 */
import { estimateNoise } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import {
  isSoftIntake,
  NOISE_SIGMAS,
  RINGING_MIN_DIM,
  SAME_INK_DE00,
  SOFT_INTAKE_EDGE,
  SOFT_NOISE_SIGMAS,
  SOFT_RINGING,
  SOFT_RINGING_LARGE,
  SOFT_SAME_INK_DE00,
} from '../ink/palette'

const F = Math.fround

/** A straight (unpremultiplied) RGBA image, four values in `[0, 1]` per pixel, row-major. */
export interface RgbaImage {
  readonly width: number
  readonly height: number
  readonly data: Float32Array
}

/** A decoded raster as the front end reads it. */
export interface IntakePixels {
  /** The image composited over white, encoded sRGB in `[0, 1]`, three values per pixel. */
  rgb: Float32Array
  /** Straight alpha in `[0, 1]` per pixel, or null when every pixel is opaque. */
  alpha: Float32Array | null
}

/** The single-precision `k / 255` of every byte `k`. */
const UNIT = Float32Array.from({ length: 256 }, (_, k) => k / 255)

/** A raster's 8-bit RGBA as straight floats, each byte `k` read as the single-precision `k / 255`. */
export function rasterToRgba(image: RasterImage): RgbaImage {
  const count = image.width * image.height * 4
  const data = new Float32Array(count)
  for (let i = 0; i < count; i++) data[i] = UNIT[image.data[i]]
  return { width: image.width, height: image.height, data }
}

/**
 * Each pixel of a straight RGBA image composited over opaque white, `c·a + (1 − a)` per
 * channel in single precision (Porter–Duff "over" with an opaque ground), three values per
 * pixel.
 */
export function compositeOverWhite(image: RgbaImage): Float32Array {
  const n = image.width * image.height
  const src = image.data
  const rgb = new Float32Array(n * 3)
  for (let p = 0; p < n; p++) {
    const a = src[p * 4 + 3]
    if (a === 1) {
      rgb[p * 3] = src[p * 4]
      rgb[p * 3 + 1] = src[p * 4 + 1]
      rgb[p * 3 + 2] = src[p * 4 + 2]
      continue
    }
    const back = F(1 - a)
    rgb[p * 3] = F(src[p * 4] * a) + back
    rgb[p * 3 + 1] = F(src[p * 4 + 1] * a) + back
    rgb[p * 3 + 2] = F(src[p * 4 + 2] * a) + back
  }
  return rgb
}

/** `image` composited over white, with its alpha beside it (null when every pixel is opaque). */
export function intakePixels(image: RasterImage): IntakePixels {
  const rgba = rasterToRgba(image)
  const n = image.width * image.height
  let opaque = true
  for (let p = 0; p < n; p++) {
    if (image.data[p * 4 + 3] !== 255) {
      opaque = false
      break
    }
  }
  let alpha: Float32Array | null = null
  if (!opaque) {
    alpha = new Float32Array(n)
    for (let p = 0; p < n; p++) alpha[p] = rgba.data[p * 4 + 3]
  }
  return { rgb: compositeOverWhite(rgba), alpha }
}

const LUMA_R = F(0.2126)
const LUMA_G = F(0.7152)
const LUMA_B = F(0.0722)

/** Rec. 709 luma of each pixel of `rgb`, `0.2126 R + 0.7152 G + 0.0722 B` in single precision. */
export function lumaF32(rgb: Float32Array): Float32Array {
  const n = Math.floor(rgb.length / 3)
  const lum = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    lum[p] = F(F(LUMA_R * rgb[p * 3]) + F(LUMA_G * rgb[p * 3 + 1])) + F(LUMA_B * rgb[p * 3 + 2])
  }
  return lum
}

/**
 * The value at index `k` of `v` sorted ascending, by Hoare's selection with a median-of-three
 * pivot (Hoare 1961, "Algorithm 65: Find", CACM 4(7)); `v` is reordered. The values must not
 * be NaN.
 */
export function kthSmallest(v: Float32Array | Float64Array, k: number): number {
  let lo = 0
  let hi = v.length - 1
  while (lo < hi) {
    const a = v[lo]
    const b = v[(lo + hi) >>> 1]
    const c = v[hi]
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b
    let i = lo
    let j = hi
    while (i <= j) {
      while (v[i] < pivot) i++
      while (v[j] > pivot) j--
      if (i <= j) {
        const t = v[i]
        v[i] = v[j]
        v[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return v[k]
  }
  return v[k]
}

/** Below this first difference (two 8-bit levels) a run of three pixels is not on an edge. */
const SCALE_EDGE_FLOOR = F(2 / 255)
/** A second difference at or below this is a straight ramp, which says nothing about width. */
const SCALE_STRAIGHT = F(1e-6)
/** Narrowest single edge-width observation. */
const SCALE_MIN_W = 0.25
/** Widest single edge-width observation. */
const SCALE_MAX_W = 64
/** Fewest observations that are read; fewer and the scale is 1. */
const SCALE_MIN_VOTES = 16

/**
 * How many raster pixels one unit of genuine edge detail occupies: the intake's point-spread
 * width, in pixels, at least 1.
 *
 * A ramp of height `d` spread over `w` pixels has first difference `d/w` and second difference
 * about `d/w²`, so their ratio reads `w` whatever the contrast. Over every run of three pixels
 * `a, b, c` along a row or a column of the channel mean `(r + g + b)/3`, with `d0 = b − a` and
 * `d1 = c − b`:
 *
 * ```text
 *     w_obs = max(|d0|, |d1|) / |d1 − d0|     kept when max(|d0|, |d1|) > 2/255
 *     scale = max(1, median(clamp(w_obs, 0.25, 64)))
 * ```
 *
 * A straight ramp (`d1 = d0`) and any non-finite ratio are skipped; fewer than 16 votes, an
 * image under 3×3 or a short buffer read 1. The median is the element at `⌊len/2⌋` of the
 * sorted votes. A native render reads 1.00 at any size; a 4× Lanczos upsample about 2.4, a
 * Gaussian blur of σ = 2 about 3; JPEG reads 1.00, since compression rings rather than widens.
 */
export function intakeScale(rgb: Float32Array, width: number, height: number): number {
  if (width < 3 || height < 3 || rgb.length < width * height * 3) return 1
  const n = width * height
  const lum = new Float32Array(n)
  for (let p = 0; p < n; p++) lum[p] = F(F(F(rgb[p * 3] + rgb[p * 3 + 1]) + rgb[p * 3 + 2]) / 3)
  const votes = new Float32Array(height * (width - 2) + width * (height - 2))
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x + 2 < width; x++) {
      const i = y * width + x
      count = scaleVote(lum[i], lum[i + 1], lum[i + 2], votes, count)
    }
  }
  for (let y = 0; y + 2 < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      count = scaleVote(lum[i], lum[i + width], lum[i + 2 * width], votes, count)
    }
  }
  if (count < SCALE_MIN_VOTES) return 1
  return Math.max(kthSmallest(votes.subarray(0, count), count >>> 1), 1)
}

/** One run of three pixels `a, b, c` votes `|first difference| / |second difference|` into `votes` at `at`; returns the next free slot. */
function scaleVote(a: number, b: number, c: number, votes: Float32Array, at: number): number {
  const d0 = F(b - a)
  const d1 = F(c - b)
  const first = Math.max(Math.abs(d0), Math.abs(d1))
  const second = Math.abs(F(d1 - d0))
  if (first > SCALE_EDGE_FLOOR && second > SCALE_STRAIGHT) {
    const r = F(first / second)
    if (Number.isFinite(r)) {
      votes[at] = r < SCALE_MIN_W ? SCALE_MIN_W : r > SCALE_MAX_W ? SCALE_MAX_W : r
      return at + 1
    }
  }
  return at
}

/** A luma gradient above this marks an edge the ring is measured around. */
const RING_EDGE_FLOOR = F(24 / 255)
/** Chamfer 3-4 units to a pixel. */
const CHAMFER_UNIT = 3
/** Core: within one pixel of an edge. */
const CORE_D = CHAMFER_UNIT
/** Ring: more than three and at most seven pixels out (the 8×8 DCT block's reach, fixed in pixels). */
const RING_IN = 3 * CHAMFER_UNIT
const RING_OUT = 7 * CHAMFER_UNIT
/** Fewest core samples, ring samples or hot pairs for an answer other than 0. */
const RING_MIN_SAMPLES = 64
/** Distance of a pixel with no edge anywhere: half the 16-bit range, so the additions cannot overflow. */
const NO_EDGE = 32767

/**
 * How much of the image looks like compression ringing rather than artwork: where the
 * Laplacian's energy sits, not how much of it there is. Anti-aliasing hugs a boundary and dies
 * within a pixel or two; ringing sits in a band a few pixels out, where clean vector art is
 * flat, and it alternates in sign from pixel to pixel (Gibbs oscillation) where a gradient's
 * ramp does not. With `L` the 4-neighbor Laplacian of Rec. 709 luma and `d` the chamfer 3-4
 * distance to the nearest pixel whose central-difference gradient exceeds 24/255:
 *
 * ```text
 *     core  = { |L_i| : d_i <= 1 px }         ring = { |L_i| : 3 px < d_i <= 7 px }
 *     ratio = P90(ring) / P50(core)
 *     hot   = ring pixels with |L| > P60(ring)
 *     score = ratio · (#hot right/down neighbor pairs whose L changes sign) / (#hot pairs)
 * ```
 *
 * Percentile `q` of `len` values is the element at `round((len − 1)·q)`. Returns 0, the safe
 * answer for a guard that only positive evidence opens, with no edge, under 9×9, a short
 * buffer, or fewer than 64 samples in either set or 64 hot pairs.
 */
export function ringingScore(rgb: Float32Array, width: number, height: number): number {
  if (width < 9 || height < 9 || rgb.length < width * height * 3) return 0
  return ringingOfLuma(lumaF32(rgb), width, height)
}

/** {@link ringingScore} on the Rec. 709 luma of the image ({@link lumaF32}). */
export function ringingOfLuma(lum: Float32Array, width: number, height: number): number {
  if (width < 9 || height < 9 || lum.length < width * height) return 0
  const dist = chamferToEdges(lum, width, height)
  if (dist === null) return 0
  let nCore = 0
  let nRing = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const d = dist[y * width + x]
      if (d <= CORE_D) nCore++
      else if (d > RING_IN && d <= RING_OUT) nRing++
    }
  }
  if (nCore < RING_MIN_SAMPLES || nRing < RING_MIN_SAMPLES) return 0
  const core = new Float32Array(nCore)
  const ring = new Float32Array(nRing)
  const ringAt = new Int32Array(nRing)
  let c = 0
  let r = 0
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const d = dist[i]
      if (d <= CORE_D) core[c++] = Math.abs(laplacian(lum, i, width))
      else if (d > RING_IN && d <= RING_OUT) {
        ring[r] = Math.abs(laplacian(lum, i, width))
        ringAt[r++] = i
      }
    }
  }
  const coreMedian = Math.max(kthSmallest(core, percentileIndex(nCore, 0.5)), 1e-9)
  const ringSel = ring.slice()
  const ringP90 = kthSmallest(ringSel, percentileIndex(nRing, 0.9))
  const ringP60 = Math.max(kthSmallest(ringSel, percentileIndex(nRing, 0.6)), 1e-9)
  const ratio = ringP90 / coreMedian
  if (ratio <= 0) return 0

  // Sign alternation among the ring pixels that carry energy; a pixel pairs only with a hot
  // neighbor, so flat zeros cannot drift the rate.
  const n = width * height
  const hot = new Uint8Array(n)
  for (let t = 0; t < nRing; t++) if (ring[t] > ringP60) hot[ringAt[t]] = 1
  let flips = 0
  let pairs = 0
  for (let t = 0; t < nRing; t++) {
    const i = ringAt[t]
    if (hot[i] === 0) continue
    const li = laplacian(lum, i, width)
    // The right neighbor and the one below; a ring pixel is interior, so both exist.
    const right = i + 1
    const down = i + width
    if (hot[right] === 1) {
      pairs++
      if (F(li * laplacian(lum, right, width)) < 0) flips++
    }
    if (hot[down] === 1) {
      pairs++
      if (F(li * laplacian(lum, down, width)) < 0) flips++
    }
  }
  if (pairs < RING_MIN_SAMPLES) return 0
  return ratio * (flips / pairs)
}

/** Index of percentile `q` among `len` sorted values, `round((len − 1)·q)`. */
function percentileIndex(len: number, q: number): number {
  return Math.round((len - 1) * q)
}

/** The 4-neighbor Laplacian `4·l − left − right − up − down` at interior pixel `i`, in single precision. */
function laplacian(lum: Float32Array, i: number, width: number): number {
  return F(F(F(F(4 * lum[i] - lum[i - 1]) - lum[i + 1]) - lum[i - width]) - lum[i + width])
}

/**
 * Chamfer 3-4 distance (Borgefors 1986) from every pixel to the nearest strong edge of `lum`,
 * three units to a pixel. An interior pixel is an edge (distance 0) when its central-difference
 * gradient `sqrt((l[x+1] − l[x−1])² + (l[y+1] − l[y−1])²)` exceeds 24/255; then a forward raster
 * pass over the N, NW, NE and W neighbors and a backward pass over S, SW, SE and E, axial steps
 * costing 3 and diagonal 4. A pixel with no edge anywhere keeps {@link NO_EDGE}. Null when there
 * is no edge at all.
 */
function chamferToEdges(lum: Float32Array, width: number, height: number): Uint16Array | null {
  const dist = new Uint16Array(width * height).fill(NO_EDGE)
  let anyEdge = false
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = y * width + x
      const gx = F(lum[i + 1] - lum[i - 1])
      const gy = F(lum[i + width] - lum[i - width])
      if (F(Math.sqrt(F(F(gx * gx) + F(gy * gy)))) > RING_EDGE_FLOOR) {
        dist[i] = 0
        anyEdge = true
      }
    }
  }
  if (!anyEdge) return null
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      let best = dist[i]
      if (y > 0) {
        best = Math.min(best, dist[i - width] + 3)
        if (x > 0) best = Math.min(best, dist[i - width - 1] + 4)
        if (x + 1 < width) best = Math.min(best, dist[i - width + 1] + 4)
      }
      if (x > 0) best = Math.min(best, dist[i - 1] + 3)
      dist[i] = best
    }
  }
  for (let y = height - 1; y >= 0; y--) {
    for (let x = width - 1; x >= 0; x--) {
      const i = y * width + x
      let best = dist[i]
      if (y + 1 < height) {
        best = Math.min(best, dist[i + width] + 3)
        if (x > 0) best = Math.min(best, dist[i + width - 1] + 4)
        if (x + 1 < width) best = Math.min(best, dist[i + width + 1] + 4)
      }
      if (x + 1 < width) best = Math.min(best, dist[i + 1] + 3)
      dist[i] = best
    }
  }
  return dist
}

/**
 * Mean absolute round-trip error, in 8-bit levels, from which a downsample has lost something.
 * Not a native-versus-oversampled gate on its own (smooth native art survives halving too):
 * the caller decides nativeness by edge width and asks this only by how much.
 */
const OVERSAMPLE_TOL = 3.0

/**
 * Largest share of the image's detail (its {@link flatError}) a round trip may lose and still
 * count as lossless, so a lone small shape on a near-empty canvas, too small a share of the
 * mean to fail {@link OVERSAMPLE_TOL}, is not read as oversampled.
 */
const OVERSAMPLE_KEEP = 0.5

/**
 * The mean absolute error of the best single color, in 8-bit levels: with `m_c` the
 * per-channel median, `Σ_p Σ_c |rgb_p,c − m_c| · 255 / (3·width·height)`. 0 for a flat image.
 */
export function flatError(rgb: Float32Array, width: number, height: number): number {
  const n = width * height
  const v = new Float32Array(n)
  let err = 0
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < n; p++) v[p] = rgb[p * 3 + c]
    const median = kthSmallest(v, n >>> 1)
    let sum = 0
    for (let p = 0; p < n; p++) sum += Math.abs(rgb[p * 3 + c] - median)
    err += sum
  }
  return (err * 255) / (n * 3)
}

/**
 * By what factor this raster carries the same drawing on more pixels than it needs: 1, 2, 4
 * or 8.
 *
 * For `k` in 2, 4, 8: box-average `k × k` blocks (the trailing `width mod k` columns and rows
 * dropped), resample back to full size bilinearly (pixel center `x` maps to `(x + 0.5)/k − 0.5`
 * in the small image, clamped to its edge) and take the mean absolute error over all pixels and
 * channels, in 8-bit levels. A `k` passes when that error is under {@link OVERSAMPLE_TOL} and at
 * most {@link OVERSAMPLE_KEEP} of {@link flatError}; the answer is the largest `k` that passes
 * with every smaller `k` passing too. The search stops once the small image would be under 8 px
 * on a side; under 16×16, or a short buffer, reads 1. Indifferent to whether the surplus pixels
 * are crisp or blurred, so a super-resolution model's sharp output still reads oversampled.
 */
export function oversampleFactor(rgb: Float32Array, width: number, height: number): number {
  if (width < 16 || height < 16 || rgb.length < width * height * 3) return 1
  let flat = -1
  let best = 1
  for (const k of [2, 4, 8]) {
    const sw = Math.floor(width / k)
    const sh = Math.floor(height / k)
    if (sw < 8 || sh < 8) break
    const small = new Float32Array(sw * sh * 3)
    const area = k * k
    for (let y = 0; y < sh; y++) {
      for (let x = 0; x < sw; x++) {
        let a0 = 0
        let a1 = 0
        let a2 = 0
        for (let dy = 0; dy < k; dy++) {
          for (let dx = 0; dx < k; dx++) {
            const p = ((y * k + dy) * width + (x * k + dx)) * 3
            a0 += rgb[p]
            a1 += rgb[p + 1]
            a2 += rgb[p + 2]
          }
        }
        const o = (y * sw + x) * 3
        small[o] = a0 / area
        small[o + 1] = a1 / area
        small[o + 2] = a2 / area
      }
    }
    // Per column: the small image's two neighboring columns (as offsets) and the weight.
    const c0s = new Int32Array(width)
    const c1s = new Int32Array(width)
    const txs = new Float64Array(width)
    for (let x = 0; x < width; x++) {
      const fx = Math.min(Math.max((x + 0.5) / k - 0.5, 0), sw - 1)
      const x0 = Math.floor(fx)
      c0s[x] = x0 * 3
      c1s[x] = Math.min(x0 + 1, sw - 1) * 3
      txs[x] = fx - x0
    }
    let err = 0
    for (let y = 0; y < height; y++) {
      const fy = Math.min(Math.max((y + 0.5) / k - 0.5, 0), sh - 1)
      const y0 = Math.floor(fy)
      const row0 = y0 * sw * 3
      const row1 = Math.min(y0 + 1, sh - 1) * sw * 3
      const ty = fy - y0
      const uy = 1 - ty
      let q = y * width * 3
      for (let x = 0; x < width; x++, q += 3) {
        const tx = txs[x]
        const ux = 1 - tx
        const p00 = row0 + c0s[x]
        const p01 = row0 + c1s[x]
        const p10 = row1 + c0s[x]
        const p11 = row1 + c1s[x]
        const a0 = small[p00] * ux + small[p01] * tx
        const b0 = small[p10] * ux + small[p11] * tx
        err += Math.abs(a0 * uy + b0 * ty - rgb[q])
        const a1 = small[p00 + 1] * ux + small[p01 + 1] * tx
        const b1 = small[p10 + 1] * ux + small[p11 + 1] * tx
        err += Math.abs(a1 * uy + b1 * ty - rgb[q + 1])
        const a2 = small[p00 + 2] * ux + small[p01 + 2] * tx
        const b2 = small[p10 + 2] * ux + small[p11 + 2] * tx
        err += Math.abs(a2 * uy + b2 * ty - rgb[q + 2])
      }
    }
    err = (err * 255) / (width * height * 3)
    if (err >= OVERSAMPLE_TOL) break
    if (flat < 0) flat = flatError(rgb, width, height)
    if (err > OVERSAMPLE_KEEP * flat) break
    best = k
  }
  return best
}

/**
 * Area-average a straight RGBA image to `nw × nh` by exact continuous integration: target
 * pixel `(ox, oy)` covers `[ox·sx, (ox+1)·sx) × [oy·sy, (oy+1)·sy)` in source pixel units
 * (`sx = w/nw`, `sy = h/nh`, the last row and column ending exactly at `h` and `w`), and each
 * source pixel weighs by its overlap area:
 *
 * ```text
 *     alpha_T = Σ wgt(S)·a_S / Σ wgt(S)
 *     c_T     = Σ wgt(S)·a_S·c_S / Σ wgt(S)·a_S     (premultiplied, then un-premultiplied)
 * ```
 *
 * so a transparent pixel's stored color cannot bleed into its neighbors as a dark halo.
 * Results are clamped to `[0, 1]`, a non-finite value becomes 0, and a cell with no alpha gets
 * color 0. Also upsamples (`nw > w`), each target cell averaging the one or two source pixels
 * it straddles. Returns a copy of the input, at its own size, when the size is unchanged, a
 * dimension is zero or the buffer is short.
 */
export function downsampleTo(image: RgbaImage, nw: number, nh: number): RgbaImage {
  const { width: w, height: h, data: src } = image
  if (
    w === 0 ||
    h === 0 ||
    nw === 0 ||
    nh === 0 ||
    (nw === w && nh === h) ||
    src.length < w * h * 4
  ) {
    return { width: w, height: h, data: src.slice() }
  }
  const out = new Float32Array(nw * nh * 4)
  const sx = w / nw
  const sy = h / nh
  for (let oy = 0; oy < nh; oy++) {
    const yStart = oy * sy
    const yEnd = oy + 1 === nh ? h : (oy + 1) * sy
    const y0 = Math.min(Math.floor(yStart), h)
    const y1 = Math.min(Math.ceil(yEnd), h)
    for (let ox = 0; ox < nw; ox++) {
      const xStart = ox * sx
      const xEnd = ox + 1 === nw ? w : (ox + 1) * sx
      const x0 = Math.min(Math.floor(xStart), w)
      const x1 = Math.min(Math.ceil(xEnd), w)
      let r = 0
      let g = 0
      let b = 0
      let aSum = 0
      let total = 0
      for (let y = y0; y < y1; y++) {
        const wy = Math.min(y + 1, yEnd) - Math.max(y, yStart)
        if (wy <= 0) continue
        for (let x = x0; x < x1; x++) {
          const wx = Math.min(x + 1, xEnd) - Math.max(x, xStart)
          if (wx <= 0) continue
          const weight = wx * wy
          total += weight
          const p = (y * w + x) * 4
          const wa = src[p + 3] * weight
          r += src[p] * wa
          g += src[p + 1] * wa
          b += src[p + 2] * wa
          aSum += wa
        }
      }
      const o = (oy * nw + ox) * 4
      out[o] = unitOrZero(aSum > 1e-9 ? F(r / aSum) : 0)
      out[o + 1] = unitOrZero(aSum > 1e-9 ? F(g / aSum) : 0)
      out[o + 2] = unitOrZero(aSum > 1e-9 ? F(b / aSum) : 0)
      out[o + 3] = unitOrZero(total > 0 ? F(aSum / total) : 0)
    }
  }
  return { width: nw, height: nh, data: out }
}

/** `v` clamped to `[0, 1]`, or 0 when it is not finite. */
function unitOrZero(v: number): number {
  if (!Number.isFinite(v)) return 0
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/** What the intake measurements say about how the palette must read the raster. */
export interface IntakeEvidence {
  /** Per-channel pixel noise in encoded sRGB units, from the Rec. 709 luma (`estimateNoise`). */
  sigmaNoise: number
  /** Edge width in pixels ({@link intakeScale}), 1.0 on a native render. */
  edgeWidth: number
  /** Compression ringing ({@link ringingScore}). */
  ringing: number
  /** The ringing threshold for this size: {@link SOFT_RINGING_LARGE} when the smaller side is at least {@link RINGING_MIN_DIM}, else {@link SOFT_RINGING}. */
  ringingGate: number
  /** Whether the container is known to be lossy (JPEG, lossy WebP), as the caller said. */
  lossy: boolean
  /** Soft intake: an edge wider than {@link SOFT_INTAKE_EDGE}, a lossy container, or ringing above the gate. */
  soft: boolean
  /** The palette's noise guard: {@link SOFT_NOISE_SIGMAS} on a soft intake, else {@link NOISE_SIGMAS}. */
  noiseSigmas: number
  /** The palette's same-ink floor: {@link SOFT_SAME_INK_DE00} on a soft intake, else {@link SAME_INK_DE00}. */
  sameInkDe00: number
}

/**
 * The palette's intake switches for the image `rgb` (composited over white) as it will be
 * traced: the noise estimate, then three independent ways into the soft-intake branch, a wide
 * edge (resampled, blurred or upscaled), a lossy container, and ringing (a lossy file re-saved
 * losslessly, which only the pixels still show), each sufficient on its own. A soft intake
 * raises the palette's noise guard and same-ink floor; a clean one keeps both at their native
 * values, so a native render is read exactly as without the measurement.
 */
export function intakeEvidence(
  rgb: Float32Array,
  width: number,
  height: number,
  lossy: boolean,
): IntakeEvidence {
  const lum = lumaF32(rgb)
  const sigmaNoise = estimateNoise(lum, width, height)
  const edgeWidth = intakeScale(rgb, width, height)
  const ringing = ringingOfLuma(lum, width, height)
  const ringingGate = Math.min(width, height) >= RINGING_MIN_DIM ? SOFT_RINGING_LARGE : SOFT_RINGING
  const soft = isSoftIntake(edgeWidth, ringing, lossy, width, height)
  return {
    sigmaNoise,
    edgeWidth,
    ringing,
    ringingGate,
    lossy,
    soft,
    noiseSigmas: soft ? SOFT_NOISE_SIGMAS : NOISE_SIGMAS,
    sameInkDe00: soft ? SOFT_SAME_INK_DE00 : SAME_INK_DE00,
  }
}

/** The longest side, in pixels, the pixel-denominated knobs were tuned at. */
export const REF_EXTENT = 128

/** How the pixel-denominated knobs are priced in a raster's own units. */
export interface RasterUnitScales {
  /** Edge width ({@link intakeScale}). */
  edgeWidth: number
  /** The round-trip factor ({@link oversampleFactor}). */
  roundTrip: number
  /** Multiplier of the coordinate precision: the round trip when the edge width exceeds {@link SOFT_INTAKE_EDGE}, else 1. */
  precision: number
  /** Multiplier of the speckle floor (an area): the round trip squared when the longest side exceeds {@link REF_EXTENT}, else 1. */
  minArea: number
  /** Multiplier of the fit's lambda: the round trip when the longest side exceeds {@link REF_EXTENT} and it is above 1, else 1. */
  lambda: number
}

/**
 * The scales that price `--precision`, the speckle floor and lambda in the raster's own units.
 * Edge width decides whether the raster is a native render (every corpus raster reads at most
 * 1.50); the downsampling round trip measures by how much it carries the drawing on surplus
 * pixels, which a super-resolution model's sharp edges cannot hide. At or below
 * {@link REF_EXTENT}, where the knobs were fitted, the floor and lambda stay as they are.
 */
export function rasterUnitScales(
  rgb: Float32Array,
  width: number,
  height: number,
): RasterUnitScales {
  const edgeWidth = intakeScale(rgb, width, height)
  const roundTrip = oversampleFactor(rgb, width, height)
  const overReference = Math.max(width, height) > REF_EXTENT
  return {
    edgeWidth,
    roundTrip,
    precision: edgeWidth > SOFT_INTAKE_EDGE ? roundTrip : 1,
    minArea: overReference ? roundTrip * roundTrip : 1,
    lambda: overReference && roundTrip > 1 ? roundTrip : 1,
  }
}
