/**
 * Is this raster soft (resampled, upscaled or blurred), and by how much? The measurement
 * behind the soft intake (`soft.ts`); it decides nothing.
 *
 * {@link rampEvidence} walks every row and every column of the Rec. 709 luma once. A
 * *transition* is a maximal monotone run of first differences above {@link FLAT_EPS} whose
 * summed rise reaches {@link MIN_CONTRAST} (a strong edge, not texture). For each:
 *
 * - **its spread**, when it runs between two flat stretches ({@link PLATEAU} pixels either side
 *   moving by at most {@link PLATEAU_SLACK} of the contrast) and its Sobel gradient points along
 *   the scan (`cos ≥ COS_MIN`, about 23°): the second moment of its first differences about
 *   their centroid, corrected by `cos²`. A native box-filtered render puts an edge into one
 *   partial pixel, two taps of weights `c` and `1 − c`, variance `c(1 − c) ≤ 1/4`; resampling
 *   or blur spreads every edge wider.
 * - **its core**, for every near-axis strong transition, plateaus or not: the differences
 *   around the largest that reach {@link CORE_SHARE} of it, and their second moment. A native
 *   edge's core has variance at most {@link NATIVE_EDGE_VAR}; on a resampled raster every core
 *   is wide. This tells a blurred raster from a sharp drawing with a blurred element (a glow,
 *   a drop shadow), whose own edges run into the glow's ramp and never have two plateaus.
 * - **the distance to the previous opposite transition** along the line: the width of a
 *   stroke or a gap, which a reduction must not squeeze out.
 *
 * {@link gridContrast} asks whether the raster repeats with an upscale's period, and
 * {@link shadingShare} whether its flat areas are smoothly shaded.
 *
 * Profiles and spacings are index-based; no pixel-center shift applies.
 *
 * Inspired by: P. Marziliano, F. Dufaux, S. Winkler, T. Ebrahimi, "A no-reference perceptual
 * blur metric", ICIP 2002, DOI 10.1109/ICIP.2002.1038902 (edge width along scan lines; here a
 * second moment of strong, isolated, near-axis edges, decided on a share rather than a mean);
 * A. C. Popescu, H. Farid, "Exposing Digital Forgeries by Detecting Traces of Resampling",
 * IEEE TSP 53(2):758–767, 2005, DOI 10.1109/TSP.2004.839932 (resampling leaves periodic
 * correlations, {@link gridContrast}). The core test and the shading share are not from the
 * literature.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/softness.rs` (`ramp_evidence`, `RampEvidence`,
 * `axis_cosine`, `scan_profile`, `core_variance`, `Scan::summarise`, `grid_contrast`,
 * `shading_share`, `dilate` and the constants).
 */

/** A first difference at or below this is flat (two 8-bit levels). */
const FLAT_EPS = 2 / 255
/** Least summed rise (of 1.0) of a strong edge. */
const MIN_CONTRAST = 0.2
/** Pixels either side of a transition that must stay nearly flat for its spread to be measured. */
const PLATEAU = 3
/** How much of the contrast the plateaus may still move by (bicubic overshoot, noise). */
const PLATEAU_SLACK = 0.12
/** Least cosine between the gradient and the scan axis (about 23°). */
const COS_MIN = 0.92
/** A spread variance above this is wider than any native render makes an edge (one partial pixel gives at most 1/4). */
export const SOFT_EDGE_VAR = 0.3
/** A core variance at or below this is a native edge: one partial pixel, `c(1 − c)`. */
export const NATIVE_EDGE_VAR = 0.25
/**
 * The differences of a transition's core are those at least this share of its largest: keeps
 * a bilinear 2× ramp's `[1/4, 1/2, 1/4]` whole and drops the shallow tail a glow adds behind a
 * crisp edge.
 */
const CORE_SHARE = 0.25
/** Fewer measured edges than this and nothing is claimed. */
export const MIN_EDGES = 16
/**
 * Least share of measured edges wider than native for the raster to be soft: native renders
 * reach at most 0.18 over the corpus, every resampled or blurred raster reads 1.00, JPEG at most
 * 0.67.
 */
export const SOFT_FRACTION_GATE = 0.9
/** Share of the spread variances dropped from the top before they are averaged into a width. */
const TRIM_TOP = 0.2

/** What the edge ramps say about the intake. */
export interface RampEvidence {
  /** Plateau-to-plateau, near-axis strong edges whose spread was measured. */
  edges: number
  /** Share of them wider than a native render can produce, in `[0, 1]`. */
  softFraction: number
  /**
   * Box-filter-equivalent edge width of those edges, in pixels: 1.0 on a native render, about
   * 2.1 for a bilinear 2× or a blur of σ = 1, 3.3 for a bicubic 4×.
   */
  width: number
  /**
   * The 10th percentile of the distance, along a row or column, between the centroids of two
   * consecutive strong transitions of opposite sign: the thinnest strokes and gaps, in pixels.
   * Infinite when fewer than {@link MIN_EDGES} were seen.
   */
  featureP10: number
  /** Near-axis strong transitions whose core was measured, plateaus or not. */
  cores: number
  /** Share of those whose core is native-sharp (variance at most {@link NATIVE_EDGE_VAR}); 0 when none was measured. */
  sharpFraction: number
}

/** Nothing measured: a native-looking verdict with no sharp edge either. */
export const NO_RAMP_EVIDENCE: Readonly<RampEvidence> = Object.freeze({
  edges: 0,
  softFraction: 0,
  width: 1,
  featureP10: Infinity,
  cores: 0,
  sharpFraction: 0,
})

/** Rec. 709 luma of each pixel of `rgb` in double precision, `0.2126 R + 0.7152 G + 0.0722 B`. */
function luma64(rgb: Float32Array, n: number): Float64Array {
  const lum = new Float64Array(n)
  for (let p = 0; p < n; p++) {
    lum[p] = 0.2126 * rgb[p * 3] + 0.7152 * rgb[p * 3 + 1] + 0.0722 * rgb[p * 3 + 2]
  }
  return lum
}

/**
 * `√(x² + y²)` without undue overflow or underflow, within one ulp: the square root of the
 * rounded sum, then one Newton-like correction from the exactly expanded residual (C. F. Borges,
 * "An Improved Algorithm for hypot(a,b)", arXiv:1904.09481, 2019, its unfused correction), as
 * the GNU C library computes it, so a gradient's orientation reads the bits inkvec reads.
 */
function hypot(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return Math.abs(x) === Infinity || Math.abs(y) === Infinity ? Infinity : NaN
  }
  const a = Math.abs(x)
  const b = Math.abs(y)
  const ax = a < b ? b : a
  const ay = a < b ? a : b
  if (ax > HYPOT_LARGE) {
    if (ay <= ax * HYPOT_EPS) return ax + ay
    return hypotKernel(ax * HYPOT_SCALE, ay * HYPOT_SCALE) / HYPOT_SCALE
  }
  if (ay < HYPOT_TINY) {
    if (ax >= ay / HYPOT_EPS) return ax + ay
    return hypotKernel(ax / HYPOT_SCALE, ay / HYPOT_SCALE) * HYPOT_SCALE
  }
  if (ay <= ax * HYPOT_EPS) return ax + ay
  return hypotKernel(ax, ay)
}

const HYPOT_SCALE = 2 ** -600
const HYPOT_LARGE = 2 ** 511
const HYPOT_TINY = 2 ** -511
const HYPOT_EPS = 2 ** -54

/** {@link hypot} for `ax ≥ ay ≥ 0` in range: the rounded root, corrected by the residual. */
function hypotKernel(ax: number, ay: number): number {
  let h = Math.sqrt(ax * ax + ay * ay)
  let t1: number
  let t2: number
  if (h <= 2 * ay) {
    const delta = h - ay
    t1 = ax * (2 * delta - ax)
    t2 = (delta - 2 * (ax - ay)) * delta
  } else {
    const delta = h - ax
    t1 = 2 * delta * (ax - 2 * ay)
    t2 = (4 * delta - ay) * ay + delta * delta
  }
  h -= (t1 + t2) / (2 * h)
  return h
}

/** What the scans collect, `cos²`-corrected where an orientation applies. */
interface Scan {
  /** Spread variances of plateau-to-plateau edges. */
  spreads: number[]
  /** Core variances of every near-axis strong edge. */
  cores: number[]
  /** Distances between consecutive opposite transitions. */
  spacings: number[]
}

/**
 * Measure the edge ramps of `rgb` (straight color composited over a background, row-major
 * `width × height`, three values per pixel). O(pixels): one luma buffer, then every row and
 * every column walked once, with a Sobel gradient evaluated only at transition centers. A
 * raster under `2·PLATEAU + 4` on either side, or a short buffer, gives
 * {@link NO_RAMP_EVIDENCE}.
 */
export function rampEvidence(rgb: Float32Array, width: number, height: number): RampEvidence {
  if (width < 2 * PLATEAU + 4 || height < 2 * PLATEAU + 4 || rgb.length < width * height * 3) {
    return { ...NO_RAMP_EVIDENCE }
  }
  const lum = luma64(rgb, width * height)
  const scan: Scan = { spreads: [], cores: [], spacings: [] }
  for (let y = 0; y < height; y++) {
    scanProfile(lum.subarray(y * width, (y + 1) * width), lum, width, height, true, y, scan)
  }
  const column = new Float64Array(height)
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) column[y] = lum[y * width + x]
    scanProfile(column, lum, width, height, false, x, scan)
  }
  return summarise(scan)
}

/**
 * Cosine between the Sobel gradient at `(x, y)` and the scan axis (`rows`: x, else y), or -1
 * at the image border, on a vanishing gradient, or when the edge is too oblique
 * (`cos < COS_MIN`) for the scan to read its cross-section.
 */
function axisCosine(
  lum: Float64Array,
  w: number,
  h: number,
  x: number,
  y: number,
  rows: boolean,
): number {
  if (x < 1 || y < 1 || x + 1 >= w || y + 1 >= h) return -1
  const up = (y - 1) * w
  const mid = y * w
  const down = (y + 1) * w
  const gx =
    lum[up + x + 1] +
    2 * lum[mid + x + 1] +
    lum[down + x + 1] -
    (lum[up + x - 1] + 2 * lum[mid + x - 1] + lum[down + x - 1])
  const gy =
    lum[down + x - 1] +
    2 * lum[down + x] +
    lum[down + x + 1] -
    (lum[up + x - 1] + 2 * lum[up + x] + lum[up + x + 1])
  const g = hypot(gx, gy)
  if (g < 1e-9) return -1
  const cos = Math.abs(rows ? gx : gy) / g
  return cos >= COS_MIN ? cos : -1
}

/**
 * Walk one row (`rows`, line `line`) or column `prof` of luma and record every strong
 * transition in `scan`.
 *
 * With `d(i) = prof[i+1] − prof[i]`, a transition is `d[s..e)` of one sign with every
 * `|d| > FLAT_EPS`; with `total = Σ |d|`, its centroid is `μ = Σ |d_i|·i / total` and its
 * spread `Σ |d_i|·(i − μ)² / total`. Its center pixel, where the gradient is read, is
 * `⌊(s + e)/2⌋ + 1`. O(length).
 */
function scanProfile(
  prof: Float64Array,
  lum: Float64Array,
  w: number,
  h: number,
  rows: boolean,
  line: number,
  scan: Scan,
): void {
  const m = Math.max(prof.length - 1, 0)
  let lastCentre = 0
  let lastSign = 0
  let k = 0
  while (k < m) {
    if (Math.abs(prof[k + 1] - prof[k]) <= FLAT_EPS) {
      k++
      continue
    }
    const sgn = prof[k + 1] - prof[k] > 0 ? 1 : -1
    const s = k
    while (k < m && (prof[k + 1] - prof[k]) * sgn > FLAT_EPS) k++
    const e = k
    let total = 0
    for (let i = s; i < e; i++) total += (prof[i + 1] - prof[i]) * sgn
    if (total < MIN_CONTRAST) continue
    let centre = 0
    for (let i = s; i < e; i++) centre += (((prof[i + 1] - prof[i]) * sgn) / total) * i
    if (lastSign !== 0 && lastSign !== sgn) scan.spacings.push(centre - lastCentre)
    lastCentre = centre
    lastSign = sgn
    const c = ((s + e) >>> 1) + 1
    const cos = rows ? axisCosine(lum, w, h, c, line, true) : axisCosine(lum, w, h, line, c, false)
    if (cos < 0) continue
    scan.cores.push(coreVariance(prof, s, e, sgn) * cos * cos)
    if (s < PLATEAU || e + PLATEAU > m) continue
    const pre = Math.abs(prof[s] - prof[s - PLATEAU])
    const post = Math.abs(prof[e + PLATEAU] - prof[e])
    if (pre > PLATEAU_SLACK * total || post > PLATEAU_SLACK * total) continue
    let spread = 0
    for (let i = s; i < e; i++) {
      const di = i - centre
      spread += (((prof[i + 1] - prof[i]) * sgn) / total) * (di * di)
    }
    scan.spreads.push(spread * cos * cos)
  }
}

/**
 * The core of the transition `d[s..e)` of sign `sgn`: from its largest difference `j` (ties
 * to the first), extend left and right while the differences are at least {@link CORE_SHARE}
 * of `|d_j|`, and return the second moment of that window about its own centroid. O(e − s).
 */
function coreVariance(prof: Float64Array, s: number, e: number, sgn: number): number {
  let j = s
  for (let i = s; i < e; i++) {
    if ((prof[i + 1] - prof[i]) * sgn > (prof[j + 1] - prof[j]) * sgn) j = i
  }
  const floor = CORE_SHARE * (prof[j + 1] - prof[j]) * sgn
  let a = j
  while (a > s && (prof[a] - prof[a - 1]) * sgn >= floor) a--
  let b = j + 1
  while (b < e && (prof[b + 1] - prof[b]) * sgn >= floor) b++
  let total = 0
  for (let i = a; i < b; i++) total += (prof[i + 1] - prof[i]) * sgn
  let mu = 0
  for (let i = a; i < b; i++) mu += (((prof[i + 1] - prof[i]) * sgn) / total) * i
  let variance = 0
  for (let i = a; i < b; i++) {
    const di = i - mu
    variance += (((prof[i + 1] - prof[i]) * sgn) / total) * (di * di)
  }
  return variance
}

/**
 * The evidence: counts, the soft and sharp shares, the trimmed-mean width and the 10th
 * percentile spacing. Below {@link MIN_EDGES} spreads the spread fields are
 * {@link NO_RAMP_EVIDENCE}'s; the core fields are reported whatever their number.
 */
function summarise(scan: Scan): RampEvidence {
  const cores = scan.cores.length
  let sharp = 0
  for (const v of scan.cores) if (v <= NATIVE_EDGE_VAR) sharp++
  const sharpFraction = cores === 0 ? 0 : sharp / cores
  const n = scan.spreads.length
  if (n < MIN_EDGES) return { ...NO_RAMP_EVIDENCE, edges: n, cores, sharpFraction }
  let featureP10 = Infinity
  if (scan.spacings.length >= MIN_EDGES) {
    const spacings = Float64Array.from(scan.spacings).toSorted()
    featureP10 = spacings[Math.floor(spacings.length / 10)]
  }
  let soft = 0
  for (const v of scan.spreads) if (v > SOFT_EDGE_VAR) soft++
  const spreads = Float64Array.from(scan.spreads).toSorted()
  const keep = Math.min(Math.max(Math.ceil(n * (1 - TRIM_TOP)), 1), n)
  let sum = 0
  for (let i = 0; i < keep; i++) sum += spreads[i]
  const mean = sum / keep
  // A box of width `s` pixels, seen through the pixel's own box and one difference, spreads a
  // step with variance (s² + 1)/12 plus a phase term; the native average is 1/6, which reads 1.
  const width = Math.sqrt((12 * mean + 1) / 3)
  return { edges: n, softFraction: soft / n, width, featureP10, cores, sharpFraction }
}

/**
 * How strongly the raster's second differences repeat with period `k` pixels, along the weaker
 * of the two axes: the spread `(max − min)/mean` of the per-phase means of
 * `|second difference|` of the luma, summed across each column and then each row.
 *
 * An integer upscale by `k` resamples every source pixel through the same kernel, so the
 * curvature of every edge ramp peaks at the same `k` phases; a native render or a blur has no
 * preferred phase. Bicubic 3× and 4× read 0.68–1.52 at their own period, blurs and 2× upscales
 * stay under 0.39 at 3; at `k = 2` a symmetric kernel shows no phase. 0 when `k < 2`, the raster
 * is under `4k` on a side or a short buffer, or there is no curvature at all. O(pixels).
 */
export function gridContrast(rgb: Float32Array, width: number, height: number, k: number): number {
  if (k < 2 || width < 4 * k || height < 4 * k || rgb.length < width * height * 3) return 0
  const lum = luma64(rgb, width * height)
  let worst = Infinity
  for (const rows of [true, false]) {
    const along = rows ? width : height
    // `sums[a]`: Σ over the line across of |second difference| at position `a` along.
    const sums = new Float64Array(along)
    if (rows) {
      for (let y = 0; y < height; y++) {
        const o = y * width
        for (let x = 1; x < width - 1; x++) {
          sums[x] += Math.abs(lum[o + x + 1] - 2 * lum[o + x] + lum[o + x - 1])
        }
      }
    } else {
      for (let y = 1; y < height - 1; y++) {
        let sum = 0
        for (let x = 0; x < width; x++) {
          const i = y * width + x
          sum += Math.abs(lum[i + width] - 2 * lum[i] + lum[i - width])
        }
        sums[y] = sum
      }
    }
    const phase = new Float64Array(k)
    const count = new Float64Array(k)
    let ph = 1
    for (let a = 1; a < along - 1; a++) {
      phase[ph] += sums[a]
      count[ph] += 1
      ph++
      if (ph === k) ph = 0
    }
    let mean = 0
    let lo = Infinity
    let hi = 0
    for (let i = 0; i < k; i++) {
      const m = phase[i] / Math.max(count[i], 1)
      mean += m
      lo = Math.min(lo, m)
      hi = Math.max(hi, m)
    }
    mean /= k
    if (mean <= 1e-12) return 0
    worst = Math.min(worst, (hi - lo) / mean)
  }
  return worst
}

/** Luma gradient, in 8-bit levels per pixel, above which a pixel is a strong edge. */
const SHADING_STRONG = 12
/** Luma gradient, in 8-bit levels per pixel, above which a pixel away from the edges is shaded. */
const SHADING_FAINT = 0.4

/**
 * Share of the raster, away from its strong edges, that is smoothly shaded rather than flat:
 * among the pixels more than `reach` pixels (chessboard distance) from any pixel whose luma
 * gradient exceeds 12 levels per pixel, the share whose own gradient exceeds 0.4 levels per
 * pixel. Gradients are central differences, `√(g_x² + g_y²)` in 8-bit levels, zero on the
 * border. Resampling and blur only touch an edge's neighborhood, so flat artwork reads 0
 * however soft its edges; a gradient fill or an airbrushed highlight raises it. 0 when fewer
 * than 100 pixels are that far from an edge, or the raster is under 3 px on a side.
 */
export function shadingShare(
  rgb: Float32Array,
  width: number,
  height: number,
  reach: number,
): number {
  const w = width
  const h = height
  if (w < 3 || h < 3 || rgb.length < w * h * 3) return 0
  const n = w * h
  const lum = luma64(rgb, n)
  for (let p = 0; p < n; p++) lum[p] *= 255
  const grad = new Float64Array(n)
  const strong = new Uint8Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const gx = x > 0 && x + 1 < w ? (lum[i + 1] - lum[i - 1]) / 2 : 0
      const gy = y > 0 && y + 1 < h ? (lum[i + w] - lum[i - w]) / 2 : 0
      grad[i] = hypot(gx, gy)
      strong[i] = grad[i] > SHADING_STRONG ? 1 : 0
    }
  }
  const near = dilate(dilate(strong, w, h, reach, true), w, h, reach, false)
  let far = 0
  let shaded = 0
  for (let p = 0; p < n; p++) {
    if (near[p] === 0) {
      far++
      if (grad[p] > SHADING_FAINT) shaded++
    }
  }
  if (far < 100) return 0
  return shaded / far
}

/**
 * `mask` dilated by `reach` pixels along rows (`alongX`) or columns: `out[k]` is set when any
 * of `mask[k − reach ..= k + reach]` on the same line is. A running count per line.
 */
function dilate(
  mask: Uint8Array,
  w: number,
  h: number,
  reach: number,
  alongX: boolean,
): Uint8Array {
  const lines = alongX ? h : w
  const len = alongX ? w : h
  const step = alongX ? 1 : w
  const out = new Uint8Array(w * h)
  for (let l = 0; l < lines; l++) {
    const base = alongX ? l * w : l
    let count = 0
    for (let k = 0; k < Math.min(reach, len); k++) count += mask[base + k * step]
    for (let k = 0; k < len; k++) {
      if (k + reach < len) count += mask[base + (k + reach) * step]
      if (k > reach) count -= mask[base + (k - reach - 1) * step]
      out[base + k * step] = count > 0 ? 1 : 0
    }
  }
  return out
}
