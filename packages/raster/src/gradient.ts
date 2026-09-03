/**
 * Gradient detection: find color ramps in a cleaned label map and describe them
 * as SVG gradients. Quantization splits a smooth ramp into flat bands; this
 * merges the bands that form one ramp — linear or radial — into a single region
 * and returns a gradient paint for it. Geometry is untouched (mesh-free) — only
 * the fill changes — so the tracer, the cutout seam-free partition and the
 * stacked layer build are unaffected.
 *
 * Every accepted gradient is verified at the pixel level: the union's pixels are
 * profiled along the model's scalar (axis projection or radius), the profile is
 * simplified to stops, and the pixels are scored against the stops they will be
 * painted with. A fit ships only when
 * - the profile is a ramp (populated, monotone, no hard step, color spread across
 *   the extent, not flat);
 * - the mean per-pixel Oklab error is below MAX_RESIDUAL (a 2-D field is not a
 *   ramp);
 * - it explains the pixels better than the members' own flat fills by
 *   MIN_IMPROVEMENT (model comparison, Favreau et al. 2017 §4). Bands that are
 *   flat inside — a cel-shaded or already posterized source — have nothing for
 *   a ramp to explain and stay flat, while a band whose own pixels ramp becomes a
 *   gradient even on its own, so a ramp quantized to one, two or three bands is
 *   still recovered.
 *
 * Bands are merged agglomeratively — repeatedly uniting the adjacent pair whose
 * union screens best, verified at the pixel level before it is accepted — so a
 * long multi-stop ramp is recovered whole regardless of band count. Screening is
 * closed-form from per-label moment sums (every candidate union is O(1)): the
 * linear axis is the leading eigenvector of the covariance-normalized color
 * gradient scatter, its eigenvalue ratio the ramp's 1-D-ness, and the band means
 * walked along the axis must be monotone and outlier-free; the radial center
 * falls out of an isotropic quadratic fit (color linear in r²). Only screened
 * pairs pay for pixel passes, and each union scans its own pixels only (per-label
 * pixel lists), never the whole image.
 *
 * A band whose pixels mix two layers — quantization put a glow's faint skirt and
 * the sky behind it under one centroid — is explained by neither a ramp nor an
 * overlay and keeps its flat fill; the ramps on either side of it ship
 * separately.
 *
 * Stops follow the pixel profile in Oklab and are simplified by Douglas–Peucker,
 * so a straight ramp keeps 2 stops and a curved one the few it needs. When the
 * source carried transparency (`alpha`), a ramp whose coverage varies gets stops
 * with `opacity` and un-composited colors, so a fade to transparent is emitted as
 * one.
 *
 * Stacked gradients: a semi-transparent layer over a detected gradient — a sun
 * glow or a vignette on a sky ramp, a shadow across it — composites to a 2-D
 * color field no single gradient can paint. Leftover bands adjacent to a built
 * gradient are fitted as an overlay of one constant color F whose opacity ramps
 * (linear or radial): with the base color B(p) known under every pixel, a
 * constant-color layer moves every pixel straight toward F, so F is the
 * least-squares meeting point of the lines B(p)→c(p) (refined by alternating
 * least squares with the per-pixel opacities, the projection of c(p) − B(p)
 * onto F − B(p)), and the opacity field is fitted and gated exactly like a
 * color ramp. The overlay ships as a gradient whose stops carry `opacity`, painted over
 * an underlay of the base paint (`underlays`) with the same geometry — the SVG
 * then composites the two paint servers just as the layers were.
 *
 * References: Du et al., "Image Vectorization and Editing via Linear Gradient
 * Layer Decomposition", ACM TOG 42(4), 2023; Favreau, Lafarge & Bousseau,
 * "Photo2ClipArt: Image Abstraction and Vectorization Using Layered Linear
 * Gradients", ACM TOG 36(6), 2017; Richardt et al., "Vectorising Bitmaps into
 * Semi-Transparent Gradient Layers", CGF 33(4), 2014.
 */

import { deltaEOk, oklabToHex, oklabToRgb, rgbToHex, srgbToLinear } from '@trazor/core'
import type { GradientPaint, GradientStop, LabelMap, RasterImage } from '@trazor/core'
import { toOklabBuffer } from './convert'

export interface GradientOptions {
  /** Minimum pixel area of a merged ramp for it to become a gradient. Default 0. */
  minArea?: number
  /**
   * Max fraction of a ramp's color-path length that may run *backwards* (against
   * the ramp's overall color direction) and still grow as one gradient. Higher =
   * more tolerant of reversals, so more bands merge; lower keeps flat objects and
   * reversing neighbours out. Curvature never counts as backtracking. Default
   * {@link MAX_BACKTRACK}.
   */
  maxBacktrack?: number
  /**
   * Minimum total Oklab color change a region must span to become a gradient.
   * Higher = only strong ramps qualify. Default {@link MIN_COLOR_SPAN}.
   */
  minColorSpan?: number
  /** Interleaved Oklab buffer for `image` (length w*h*3); computed if absent. */
  oklab?: Float32Array
  /**
   * Per-pixel source coverage (0-255, length w*h) of an image that was
   * composited over white before it was labeled. A ramp whose coverage varies
   * then gets stops carrying `opacity`, with the colors un-composited, so a fade
   * to transparent stays transparent. Absent ⇒ every stop is opaque.
   */
  alpha?: Uint8Array | Uint8ClampedArray
  /**
   * Also detect semi-transparent overlays stacked over a detected gradient (a
   * constant color whose opacity ramps linearly or radially); see
   * {@link GradientResult.underlays}. Default true.
   */
  overlays?: boolean
}

export interface GradientResult {
  /**
   * Per-label paint, indexed by the (rewritten) label: a `GradientPaint` for a
   * label that now covers a detected ramp, else `null` (keep the flat fill).
   * Length is `labels.count`.
   */
  gradients: (GradientPaint | null)[]
  /**
   * Per label, the label whose paint must be painted *beneath* this label's own
   * paint with the same geometry, or -1. Set only for an overlay gradient (its
   * stops carry `opacity`): the overlay composites over the underlay just as the
   * source's layers did. Length is `labels.count`.
   */
  underlays: Int32Array
}

/** Mean per-pixel Oklab distance to the fitted ramp above which a fit is rejected (a 2-D field, not a ramp). */
const MAX_RESIDUAL = 0.045
/**
 * Default max fraction of a ramp's color-path length that may run backwards
 * against its overall color direction (growth + build gate). Curvature advances
 * the path, so a monotone curved ramp reads as 0 backtracking and grows whole; a
 * reversal (a flat object continuing the ramp's axis with the ramp's own colors)
 * spends much of the path going back, and is refused.
 */
const MAX_BACKTRACK = 0.15
/**
 * Max a single band's mean color may stray (over the ramp's color span) from the
 * straight interpolation between its two projection-neighbours before it reads as
 * a foreign object wedged into the ramp rather than part of it.
 */
const MAX_OUTLIER = 0.35
/** Fraction of position→color energy on the principal axis required (1-D linear ramp). */
const MIN_DIRECTIONALITY = 0.88
/** Total Oklab distance across the ramp below which the region is treated as flat. */
const MIN_COLOR_SPAN = 0.06
/**
 * Fraction of the members' pooled within-band color variance a ramp must
 * remove — (flat − ramp) / flat — to ship. A ramp quantized into bands leaves
 * each band a slice of the ramp that the union explains almost entirely; bands
 * that are flat inside (a posterized source) or vary in ways no ramp explains
 * (a textured object) fall short, and keep their flat fill.
 */
const MIN_IMPROVEMENT = 0.3
/**
 * Pooled within-band Oklab variance (summed over the three channels) below which
 * the members are flat inside and there is nothing for a ramp to explain. At
 * the level of 8-bit rounding noise.
 */
const MIN_FLAT_VAR = 1e-5
/** Bins used to sample a ramp's profile along its scalar before simplifying it to stops. */
const BIN_COUNT = 32
/** A populated-bin count below this is too coarse to be a ramp. */
const MIN_POPULATED_BINS = 3
/** Drop a stop whose color lies within this Oklab distance of its neighbors' interpolation. */
const STOP_TOLERANCE = 0.01
/** Drop an opacity stop that lies within this of its neighbors' interpolation. */
const ALPHA_STOP_TOLERANCE = 0.02
/** Maximum stops per gradient (keeps files small). */
const MAX_STOPS = 8
/** Reject as a hard edge (not a ramp) when one adjacent-bin jump exceeds this fraction of the whole path. */
const STEP_JUMP_FRAC = 0.5
/**
 * The offset span over which the middle 80% of a ramp's path is traversed, as a
 * fraction of its full offset range, must be at least this. A ramp changes
 * steadily across its extent; two flat regions meeting (two silhouettes with an
 * anti-aliased seam that quantized into a thin intermediate band) put the whole
 * change into a narrow band — a step, not a ramp.
 */
const MIN_RAMP_SPREAD = 0.33
/**
 * A radial center must sit within this many position std-devs of the region
 * centroid. Tight enough that a curved *linear* ramp — whose r²-model center
 * lands well outside the band (~1.7 std) — is not mistaken for a concentric
 * region, while a genuine radial (center inside, ≲1 std even when off-centre)
 * still qualifies.
 */
const CENTER_SANITY = 1.4
/** Ignore profile bins holding less than this fraction of the fullest bin (edge/corner noise). */
const SPARSE_FRAC = 0.15
/**
 * Fraction of a region's color variance the radial r²-model may leave
 * unexplained and still be screened as one radial. The r² proxy only groups
 * rings and locates the center; a true radial ramp is linear in r, so the r²
 * model misfits by a roughly constant *fraction* (≈4% on a clean disc)
 * independent of the ramp's steepness. The pixel-level fit decides.
 */
const RADIAL_MAX_UNEXPLAINED = 0.15
/**
 * A union's ramp may exceed any one member's own flat fill (mean squared error,
 * both capped) by at most this: a member the union fails to explain — a foreign
 * flat object whose color the multi-stop profile bends to pass through — keeps
 * its flat fill. Binning and stop simplification cost about this much.
 */
const MEMBER_TOLERANCE = 2.5e-4
/**
 * Per-pixel Oklab error is capped at this before ramp and flat fills are
 * compared, so a minority of pixels that neither fill explains — the fringe of
 * a glow that quantized into a sky band, a speck, a stroke — cannot decide the
 * comparison for the majority that the ramp does explain. A pixel beyond it is
 * an outlier of the fit.
 */
const ERROR_CAP = 0.08
/**
 * Largest share of a profile bin's pixels that may be outliers of the fit. A
 * ramp is a function of its scalar: the pixels of one bin share one color. A
 * foreign object quantization lumped into a band — a bird in a sky band — fills
 * part of the bins it spans with another color; the band-mean profile would
 * bend through it and paint a streak of that color across the ramp.
 */
const MAX_BIN_OUTLIERS = 0.2
/** Most pixels a verification pass scans; larger unions are sampled at a fixed stride. */
const MAX_SAMPLE = 32768
/** An overlay replaces an opaque fit of the same bands only when its error is at most this fraction of the opaque one's. */
const OVERLAY_PREFER = 0.5
/**
 * An opaque ramp touching an overlay joins it when the overlay fitted over both
 * errs by at most this more than the worse of the two separate fits — a glow's
 * core, opaque enough to have shipped as a radial of its own, rejoins its skirt.
 */
const OVERLAY_JOIN_TOLERANCE = 0.002
/** An overlay's opacity must ramp by at least this much across its extent; a flat opacity is a flat object. */
const MIN_ALPHA_SPAN = 0.2
/**
 * Tikhonov weight (× the mean line weight) pulling the overlay color toward the
 * pixel farthest from the base, which decides where F sits along the lines when
 * they leave it undetermined (a flat base).
 */
const OVERLAY_REG = 0.01
/** Alternating least-squares rounds (opacities ⇄ overlay color) refining the meeting point. */
const OVERLAY_ITERATIONS = 2

// Moment layout per label (Σ over the label's pixels; positions are pixel centers).
//  0:n 1:Σx 2:Σy 3:Σxx 4:Σxy 5:Σyy 6:ΣL 7:Σa 8:Σb 9:ΣLL 10:Σaa 11:Σbb
// 12:ΣLx 13:ΣLy 14:Σax 15:Σay 16:Σbx 17:Σby
// 18:Σx³ 19:Σx²y 20:Σxy² 21:Σy³ 22:Σx⁴ 23:Σx²y² 24:Σy⁴   25:ΣLu 26:Σau 27:Σbu  (u = x²+y²)
const NM = 28

// Fields per profile bin: [count, ΣL, Σa, Σb, ΣLL, Σaa, Σbb, Σα, ΣPr, ΣPg, ΣPb, Σt]
// (α = coverage in [0,1]; P = coverage-premultiplied sRGB, 0-255; t = scalar).
const BIN_FIELDS = 12
// Fields per opacity-profile bin: [count, Σα, Σt].
const ABIN_FIELDS = 3

type Lab = [number, number, number]

/** A linear ramp's fitted axis and how 1-D its color variation is. */
interface RampFit {
  dx: number
  dy: number
  /** λ1 / (λ1 + λ2) of the color-gradient scatter; 1 = the ramp is perfectly 1-D. */
  directionality: number
}

/** A radial ramp's recovered center and the r²-model's unexplained-variance fraction. */
interface RadialFit {
  cx: number
  cy: number
  /** Fraction of the region's color variance the r² model leaves unexplained. */
  misfit: number
}

/**
 * Recover a linear ramp's axis from the moment vector at `off`: the direction of
 * steepest color change (leading eigenvector of the per-channel color-gradient
 * scatter) and the scatter's eigenvalue ratio (how 1-D the color variation is).
 * Returns null when the region is too small or the fit is degenerate.
 */
function fitRamp(m: Float64Array, off: number): RampFit | null {
  const n = m[off]
  if (n < 3) return null
  const inv = 1 / n
  const mx = m[off + 1] * inv
  const my = m[off + 2] * inv

  // Position covariance P (2×2 symmetric). Normalizing by it — the least-squares
  // color gradient a_c = P⁻¹·q_c, not the raw cross-covariance q_c — keeps the
  // direction aspect-correct: a diagonal ramp on a non-square region stays
  // diagonal instead of tilting toward the axis with the larger pixel spread.
  const Pxx = m[off + 3] * inv - mx * mx
  const Pxy = m[off + 4] * inv - mx * my
  const Pyy = m[off + 5] * inv - my * my
  const detP = Pxx * Pyy - Pxy * Pxy
  if (detP <= 1e-9) return null // collinear / zero-area spatial extent
  const iP00 = Pyy / detP
  const iP01 = -Pxy / detP
  const iP11 = Pxx / detP

  // Scatter of the three channels' color gradients: M = Σ_c a_c a_cᵀ (2×2).
  let a00 = 0
  let a01 = 0
  let a11 = 0
  for (let c = 0; c < 3; c++) {
    const mc = m[off + 6 + c] * inv
    const covXc = m[off + 12 + 2 * c] * inv - mx * mc
    const covYc = m[off + 13 + 2 * c] * inv - my * mc
    const ax = iP00 * covXc + iP01 * covYc
    const ay = iP01 * covXc + iP11 * covYc
    a00 += ax * ax
    a01 += ax * ay
    a11 += ay * ay
  }
  const tr = a00 + a11
  if (tr <= 1e-12) return null
  const det = a00 * a11 - a01 * a01
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = tr / 2 - disc
  const directionality = l1 / (l1 + l2)

  // Leading eigenvector of the 2×2 symmetric matrix: (λ1 − a11, a01), with an
  // axis-aligned fallback when the off-diagonal vanishes.
  let dx: number
  let dy: number
  if (Math.abs(a01) > 1e-12) {
    dx = l1 - a11
    dy = a01
  } else if (a00 >= a11) {
    dx = 1
    dy = 0
  } else {
    dx = 0
    dy = 1
  }
  const dn = Math.hypot(dx, dy)
  if (dn < 1e-12) return null
  dx /= dn
  dy /= dn
  return { dx, dy, directionality }
}

/**
 * Backtracking fraction of a color path: the share of its total step length that
 * runs *against* the overall first→last direction. 0 for a monotone path (every
 * step advances, however much it curves); ~0.5 for a symmetric there-and-back
 * reversal. Returns 1 when the path has no net color change (not a ramp). Fewer
 * than three points cannot double back, so they read as 0.
 */
function pathBacktrack(cols: readonly Lab[]): number {
  if (cols.length < 3) return 0
  const first = cols[0]
  const last = cols[cols.length - 1]
  let dL = last[0] - first[0]
  let da = last[1] - first[1]
  let db = last[2] - first[2]
  const norm = Math.hypot(dL, da, db)
  if (norm < 1e-6) return 1
  dL /= norm
  da /= norm
  db /= norm
  let fwd = 0
  let back = 0
  for (let i = 1; i < cols.length; i++) {
    const proj =
      (cols[i][0] - cols[i - 1][0]) * dL +
      (cols[i][1] - cols[i - 1][1]) * da +
      (cols[i][2] - cols[i - 1][2]) * db
    if (proj >= 0) fwd += proj
    else back -= proj
  }
  const total = fwd + back
  return total > 1e-9 ? back / total : 0
}

/**
 * How well a set of member labels' mean colors form one ramp when walked in order
 * of their centroid's projection onto the ramp axis (dx, dy):
 * - `backtrack`: fraction of the color path that runs backwards (monotonicity) —
 *   ~0 as a curved ramp accretes bands, high when a reversing neighbor is added;
 * - `outlier`: the largest a single band's mean color strays from the straight
 *   interpolation between its two projection-neighbours, over the path span — ~0
 *   along a smooth ramp, large for an off-ramp object (a bright sun, a dark
 *   silhouette) that happens to fall inside the ramp's projection range.
 */
function rampPathFit(
  m: Float64Array,
  members: readonly number[],
  dx: number,
  dy: number,
): { backtrack: number; outlier: number } {
  const pts: [number, number, Lab][] = []
  for (const l of members) {
    const o = l * NM
    const n = m[o]
    if (n <= 0) continue
    pts.push([
      dx * (m[o + 1] / n) + dy * (m[o + 2] / n),
      l,
      [m[o + 6] / n, m[o + 7] / n, m[o + 8] / n],
    ])
  }
  // Order by axis projection; label id breaks ties so the walk is deterministic.
  pts.sort((p, q) => p[0] - q[0] || p[1] - q[1])
  const cols = pts.map((p) => p[2])
  const n = cols.length
  let outlier = 0
  if (n >= 3) {
    const f = cols[0]
    const l = cols[n - 1]
    const span = Math.hypot(l[0] - f[0], l[1] - f[1], l[2] - f[2])
    if (span > 1e-6)
      for (let i = 1; i < n - 1; i++) {
        const s0 = pts[i - 1][0]
        const s2 = pts[i + 1][0]
        const t = s2 - s0 > 1e-9 ? (pts[i][0] - s0) / (s2 - s0) : 0.5
        const iL = cols[i - 1][0] + (cols[i + 1][0] - cols[i - 1][0]) * t
        const iA = cols[i - 1][1] + (cols[i + 1][1] - cols[i - 1][1]) * t
        const iB = cols[i - 1][2] + (cols[i + 1][2] - cols[i - 1][2]) * t
        const dev = Math.hypot(cols[i][0] - iL, cols[i][1] - iA, cols[i][2] - iB) / span
        if (dev > outlier) outlier = dev
      }
  }
  return { backtrack: pathBacktrack(cols), outlier }
}

/**
 * Solve a `size`×`size` system `A·x = b` for several right-hand sides at once
 * (Gauss-Jordan with partial pivoting). `a` is row-major; each `rhs[c]` has
 * length `size`. Returns the solution vectors, or null when near-singular.
 */
function solve(size: number, a: readonly number[], rhs: readonly number[][]): number[][] | null {
  const A = a.slice()
  const B = rhs.map((r) => r.slice())
  for (let col = 0; col < size; col++) {
    let piv = col
    let max = Math.abs(A[col * size + col])
    for (let r = col + 1; r < size; r++) {
      const v = Math.abs(A[r * size + col])
      if (v > max) {
        max = v
        piv = r
      }
    }
    if (max < 1e-12) return null
    if (piv !== col) {
      for (let k = 0; k < size; k++) {
        const t = A[col * size + k]
        A[col * size + k] = A[piv * size + k]
        A[piv * size + k] = t
      }
      for (const b of B) {
        const t = b[col]
        b[col] = b[piv]
        b[piv] = t
      }
    }
    const d = A[col * size + col]
    for (let k = 0; k < size; k++) A[col * size + k] /= d
    for (const b of B) b[col] /= d
    for (let r = 0; r < size; r++) {
      if (r === col) continue
      const f = A[r * size + col]
      if (f === 0) continue
      for (let k = 0; k < size; k++) A[r * size + k] -= f * A[col * size + k]
      for (const b of B) b[r] -= f * b[col]
    }
  }
  return B
}

/**
 * Fit an isotropic quadratic `color ≈ A·(x²+y²) + Bx·x + By·y + C` per channel
 * over the moment vector at `off`. Modeling color as linear in r² makes it a
 * quadratic in position, so the concentric center is `c = −½·ΣA·B / ΣA²` (a
 * least-squares combination over channels). Returns the center and the model's
 * moment residual, or null when there is no curvature or the center is not near
 * the region (i.e. the ramp is not actually radial).
 */
function fitRadial(m: Float64Array, off: number): RadialFit | null {
  const n = m[off]
  if (n < 6) return null
  const inv = 1 / n
  const Sx = m[off + 1]
  const Sy = m[off + 2]
  const Sxx = m[off + 3]
  const Sxy = m[off + 4]
  const Syy = m[off + 5]
  const Su = Sxx + Syy
  const Suu = m[off + 22] + 2 * m[off + 23] + m[off + 24]
  const Sux = m[off + 18] + m[off + 20]
  const Suy = m[off + 19] + m[off + 21]
  // Design matrix over basis {u, x, y, 1}, u = x²+y² (row-major, symmetric).
  const M4 = [Suu, Sux, Suy, Su, Sux, Sxx, Sxy, Sx, Suy, Sxy, Syy, Sy, Su, Sx, Sy, n]
  const rhs = [
    [m[off + 25], m[off + 12], m[off + 13], m[off + 6]],
    [m[off + 26], m[off + 14], m[off + 15], m[off + 7]],
    [m[off + 27], m[off + 16], m[off + 17], m[off + 8]],
  ]
  const sol = solve(4, M4, rhs)
  if (!sol) return null

  let sumA2 = 0
  let sABx = 0
  let sABy = 0
  let rss = 0
  let totalVar = 0
  for (let c = 0; c < 3; c++) {
    const [A, Bx, By, C] = sol[c]
    sumA2 += A * A
    sABx += A * Bx
    sABy += A * By
    const r = rhs[c]
    const Sc = m[off + 6 + c]
    const Scc = m[off + 9 + c]
    rss += Math.max(0, Scc - (A * r[0] + Bx * r[1] + By * r[2] + C * r[3]))
    totalVar += Scc - Sc * Sc * inv
  }
  if (sumA2 < 1e-12) return null // no curvature ⇒ planar, not radial
  if (totalVar < 1e-9) return null // flat ⇒ not a ramp

  const cx = -sABx / (2 * sumA2)
  const cy = -sABy / (2 * sumA2)
  const mx = Sx * inv
  const my = Sy * inv
  const stdX = Math.sqrt(Math.max(Sxx * inv - mx * mx, 1e-9))
  const stdY = Math.sqrt(Math.max(Syy * inv - my * my, 1e-9))
  if (Math.abs(cx - mx) > CENTER_SANITY * stdX + 1) return null
  if (Math.abs(cy - my) > CENTER_SANITY * stdY + 1) return null
  return { cx, cy, misfit: rss / totalVar }
}

/** True when a radial r²-model fit is close enough to group rings and trust its center. */
function isRadial(fit: RadialFit | null): fit is RadialFit {
  return fit !== null && fit.misfit <= RADIAL_MAX_UNEXPLAINED
}

/** Sum the members' moment rows into `out` (length NM). */
function sumMembers(m: Float64Array, members: readonly number[], out: Float64Array): void {
  out.fill(0)
  for (const mem of members) {
    const o = mem * NM
    for (let j = 0; j < NM; j++) out[j] += m[o + j]
  }
}

/** Pooled within-member Oklab variance per pixel (summed over channels): what the members' flat fills leave unexplained. */
function flatVariance(m: Float64Array, members: readonly number[]): number {
  let ss = 0
  let n = 0
  for (const mem of members) {
    const o = mem * NM
    const k = m[o]
    if (k <= 0) continue
    n += k
    for (let c = 0; c < 3; c++) ss += Math.max(0, m[o + 9 + c] - (m[o + 6 + c] * m[o + 6 + c]) / k)
  }
  return n > 0 ? ss / n : 0
}

/** Everything the pixel passes read; shared by every fit of one detection run. */
interface Ctx {
  width: number
  /** Interleaved Oklab of the (composited) image. */
  ok: Float32Array
  /** RGBA bytes of the (composited) image. */
  rgb: Uint8ClampedArray
  /** Source coverage per pixel (0-255), or null when the image is opaque. */
  alpha: Uint8Array | Uint8ClampedArray | null
  /** Per-label moments (NM per label). */
  m: Float64Array
  /** Per-label pixel lists: label l owns bucket[offset[l] .. offset[l+1]). */
  offset: Int32Array
  bucket: Int32Array
  maxBacktrack: number
  minColorSpan: number
  /** Scratch moment vector (NM). */
  sacc: Float64Array
  /** Scratch Oklab triple. */
  lab: Float64Array
}

/** A built paint together with what the overlay pass needs to paint over it. */
interface Built {
  paint: GradientPaint
  /** Mean per-pixel Oklab distance of the fitted pixels to the painted ramp. */
  residual: number
  /** Kept stops as [offset, L, a, b] per stop (composited colors): what the paint renders at a point. */
  lab: Float64Array
  /**
   * Every populated profile bin as [offset, r, g, b] (sRGB, 0-1): the ramp
   * before stop simplification, accurate to the noise, in the space an SVG
   * renderer composites in — for fitting an overlay on top of it.
   */
  fineRgb: Float64Array
  /** Any stop carries opacity (a fade of the source, or an overlay). */
  translucent: boolean
}

/** Simplified stops plus the per-bin Oklab colors they were read from. */
/** Simplified stops, the same stops' composited Oklab (for scoring), and the unsimplified bins in sRGB. */
interface Profile {
  stops: GradientStop[]
  lab: Float64Array
  fineRgb: Float64Array
  translucent: boolean
}

/** Linear-interpolate the offset at which the cumulative path first reaches `target`. */
function offsetAtPath(offs: readonly number[], cum: readonly number[], target: number): number {
  for (let i = 1; i < cum.length; i++) {
    if (cum[i] >= target) {
      const seg = cum[i] - cum[i - 1]
      const t = seg > 1e-9 ? (target - cum[i - 1]) / seg : 0
      return offs[i - 1] + (offs[i] - offs[i - 1]) * t
    }
  }
  return offs[offs.length - 1]
}

/**
 * Ramp-shape gates on a profile's adjacent-step lengths (`steps[i]` = distance
 * from point i to i+1): a hard step concentrates the whole change in one jump;
 * two flats meeting put the middle 80% of the change into a narrow band; a flat
 * has no change. Returns the path length, or -1 when the profile is not a ramp.
 */
function rampShape(offs: readonly number[], steps: readonly number[], minSpread: number): number {
  let path = 0
  let maxJump = 0
  const cum: number[] = [0]
  for (const d of steps) {
    path += d
    if (d > maxJump) maxJump = d
    cum.push(path)
  }
  if (path <= 0 || maxJump > STEP_JUMP_FRAC * path) return -1
  const range = offs[offs.length - 1] - offs[0]
  if (range < 1e-9) return -1
  const spread = offsetAtPath(offs, cum, 0.9 * path) - offsetAtPath(offs, cum, 0.1 * path)
  if (spread / range < minSpread) return -1
  return path
}

/**
 * Douglas–Peucker over offset × value: keep the endpoints, then repeatedly insert
 * the interior point that deviates most from the interpolation between its kept
 * neighbors, until every deviation is within `tolerance` or MAX_STOPS is hit.
 * `dev(i, a, b, t)` measures point i against the interpolation of a→b at t.
 */
function simplify(
  offs: readonly number[],
  tolerance: number,
  dev: (i: number, a: number, b: number, t: number) => number,
): number[] {
  const np = offs.length
  const kept = [0, np - 1]
  while (kept.length < MAX_STOPS) {
    let bestDev = tolerance
    let bestIdx = -1
    let bestPos = -1
    for (let s = 0; s < kept.length - 1; s++) {
      const a = kept[s]
      const b = kept[s + 1]
      const denom = offs[b] - offs[a]
      for (let i = a + 1; i < b; i++) {
        const d = dev(i, a, b, denom > 1e-9 ? (offs[i] - offs[a]) / denom : 0)
        if (d > bestDev) {
          bestDev = d
          bestIdx = i
          bestPos = s + 1
        }
      }
    }
    if (bestIdx < 0) break
    kept.splice(bestPos, 0, bestIdx)
  }
  return kept
}

/** Round an opacity to 3 decimals; `undefined` when it rounds to fully opaque. */
function opacityOf(v: number): number | undefined {
  const o = Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000
  return o >= 1 ? undefined : o
}

/**
 * Extend a kept polyline's end segments to offsets 0 and 1: `u` such that
 * `from + u·(to − from)` lands on `target`, for the segment from kept index
 * `from` to `to`. The profile's outermost bins sit half a bin inside the extent
 * (and sparse end bins are dropped), so the ramp is extrapolated over that last
 * stretch rather than padded flat.
 */
function extendTo(offs: readonly number[], from: number, to: number, target: number): number {
  const span = offs[to] - offs[from]
  return Math.abs(span) > 1e-9 ? (target - offs[from]) / span : 0
}

/**
 * Copy `bins` (of `fields` per bin) with the sparse bins outside the dense span
 * folded into the nearest dense bin, and return that copy with the dense span.
 * Sparse bins are region corners and anti-aliased boundary pixels: a handful of
 * mixed colors that would skew a bin mean of their own. At either end they are
 * still the ramp's last stretch, so they join the outermost dense bin (whose
 * mean scalar moves out with them); inside the span they are dropped by the
 * caller. Returns null when no bin is dense.
 */
function foldSparseEnds(
  bins: Float64Array,
  fields: number,
  popFloor: number,
): { bins: Float64Array; first: number; last: number } | null {
  let first = -1
  let last = -1
  for (let i = 0; i < BIN_COUNT; i++) {
    const cnt = bins[i * fields]
    if (cnt <= 0 || cnt < popFloor) continue
    if (first < 0) first = i
    last = i
  }
  if (first < 0) return null
  const out = bins.slice()
  const fold = (from: number, into: number): void => {
    for (let f = 0; f < fields; f++) out[into * fields + f] += out[from * fields + f]
    out[from * fields] = 0
  }
  for (let i = 0; i < first; i++) fold(i, first)
  for (let i = last + 1; i < BIN_COUNT; i++) fold(i, last)
  return { bins: out, first, last }
}

/**
 * Reduce a per-bin color profile to simplified gradient stops, or null when it
 * is not a clean ramp: too few populated bins; one hard adjacent jump (an edge,
 * not a ramp); the change concentrated at one seam; a profile that doubles back
 * on itself (a reversal); or too little total color change (flat). A straight
 * ramp collapses back to 2 stops; a curved or bent one keeps the stops it needs
 * (≤ MAX_STOPS). Stops sit at their bin's mean scalar, the end ones extended to
 * 0 and 1. A bin whose source coverage is partial yields a stop with `opacity`
 * and the coverage-weighted straight color.
 */
function profileToStops(
  raw: Float64Array,
  ctx: Ctx,
  maxBacktrack: number,
  minSpan: number,
): Profile | null {
  // Ignore any interior bin holding less than SPARSE_FRAC of the fullest bin,
  // so the profile reads only the ramp's well-populated cross-sections.
  let maxPop = 0
  for (let i = 0; i < BIN_COUNT; i++) if (raw[i * BIN_FIELDS] > maxPop) maxPop = raw[i * BIN_FIELDS]
  const popFloor = maxPop * SPARSE_FRAC
  const folded = foldSparseEnds(raw, BIN_FIELDS, popFloor)
  if (!folded) return null
  const { bins, first: firstBin, last: lastBin } = folded

  const offs: number[] = []
  const cols: Lab[] = []
  const idx: number[] = []
  for (let i = firstBin; i <= lastBin; i++) {
    const b = i * BIN_FIELDS
    const cnt = bins[b]
    if (cnt < popFloor || cnt <= 0) continue
    const inv = 1 / cnt
    offs.push(bins[b + 11] * inv)
    cols.push([bins[b + 1] * inv, bins[b + 2] * inv, bins[b + 3] * inv])
    idx.push(b)
  }
  const np = offs.length
  if (np < MIN_POPULATED_BINS) return null
  const first = cols[0]
  const last = cols[np - 1]
  if (deltaEOk(first[0], first[1], first[2], last[0], last[1], last[2]) < minSpan) return null
  const steps: number[] = []
  for (let i = 1; i < np; i++) {
    const p = cols[i - 1]
    const q = cols[i]
    steps.push(deltaEOk(p[0], p[1], p[2], q[0], q[1], q[2]))
  }
  if (rampShape(offs, steps, MIN_RAMP_SPREAD) < 0) return null

  const kept = simplify(offs, STOP_TOLERANCE, (i, a, b, t) => {
    const L = cols[a][0] + (cols[b][0] - cols[a][0]) * t
    const A = cols[a][1] + (cols[b][1] - cols[a][1]) * t
    const Bv = cols[a][2] + (cols[b][2] - cols[a][2]) * t
    return deltaEOk(cols[i][0], cols[i][1], cols[i][2], L, A, Bv)
  })
  // Monotonicity is judged on the simplified stops, not the raw bins: Douglas–
  // Peucker has already dropped sub-STOP_TOLERANCE wiggle, so sparse-bin noise no
  // longer reads as a reversal, while a genuine there-and-back still does.
  if (pathBacktrack(kept.map((i) => cols[i])) > maxBacktrack) return null

  const fineRgb = new Float64Array(np * 4)
  for (let i = 0; i < np; i++) {
    const [r, g, b] = oklabToRgb(cols[i][0], cols[i][1], cols[i][2])
    fineRgb[i * 4] = offs[i]
    fineRgb[i * 4 + 1] = r
    fineRgb[i * 4 + 2] = g
    fineRgb[i * 4 + 3] = b
  }
  const nk = kept.length
  const lab = new Float64Array(nk * 4)
  let translucent = false
  const stops: GradientStop[] = []
  for (let k = 0; k < nk; k++) {
    const i = kept[k]
    const b = idx[i]
    const cnt = bins[b]
    let cover = bins[b + 7]
    let offset = offs[i]
    let L = cols[i][0]
    let A = cols[i][1]
    let B = cols[i][2]
    // Extend the end segments to the extent's ends, along the last raw step.
    const end = k === 0 && offset > 0 ? 0 : k === nk - 1 && offset < 1 ? 1 : -1
    if (end >= 0 && np > 1) {
      const j = k === 0 ? i + 1 : i - 1
      const u = extendTo(offs, i, j, end)
      L += (cols[j][0] - L) * u
      A += (cols[j][1] - A) * u
      B += (cols[j][2] - B) * u
      const bj = idx[j]
      cover = cnt * (cover / cnt + (bins[bj + 7] / bins[bj] - cover / cnt) * u)
      offset = end
    }
    lab[k * 4] = offset
    lab[k * 4 + 1] = L
    lab[k * 4 + 2] = A
    lab[k * 4 + 3] = B
    // A fully covered bin keeps the composited Oklab mean; a partially covered
    // one un-composites: straight color = Σ(premultiplied) / Σα.
    const opacity = ctx.alpha === null || cover >= cnt - 1e-9 ? undefined : opacityOf(cover / cnt)
    if (opacity === undefined) {
      stops.push({ offset, color: oklabToHex(L, A, B) })
      continue
    }
    translucent = true
    const pre = bins[b + 7]
    const color =
      pre > 1e-9
        ? rgbToHex(bins[b + 8] / pre, bins[b + 9] / pre, bins[b + 10] / pre)
        : oklabToHex(L, A, B)
    stops.push({ offset, color, opacity })
  }
  return { stops, lab, fineRgb, translucent }
}

/**
 * Reduce a per-bin opacity profile to stops of one constant color `hex`, or null
 * when the opacity is not a ramp (populated, monotone, no hard step, spanning
 * at least `minSpan`).
 */
function alphaProfileToStops(
  raw: Float64Array,
  hex: string,
  maxBacktrack: number,
  minSpan: number,
): GradientStop[] | null {
  let maxPop = 0
  for (let i = 0; i < BIN_COUNT; i++)
    if (raw[i * ABIN_FIELDS] > maxPop) maxPop = raw[i * ABIN_FIELDS]
  const popFloor = maxPop * SPARSE_FRAC
  const folded = foldSparseEnds(raw, ABIN_FIELDS, popFloor)
  if (!folded) return null
  const { bins, first: firstBin, last: lastBin } = folded
  const offs: number[] = []
  const vals: number[] = []
  for (let i = firstBin; i <= lastBin; i++) {
    const b = i * ABIN_FIELDS
    const cnt = bins[b]
    if (cnt < popFloor || cnt <= 0) continue
    offs.push(bins[b + 2] / cnt)
    vals.push(bins[b + 1] / cnt)
  }
  const np = offs.length
  if (np < MIN_POPULATED_BINS) return null
  if (Math.abs(vals[np - 1] - vals[0]) < minSpan) return null
  const steps: number[] = []
  for (let i = 1; i < np; i++) steps.push(Math.abs(vals[i] - vals[i - 1]))
  // No spread floor: an overlay's opacity may fade out well inside its extent
  // (a glow's skirt reaching 0 with sky beyond it) and stay 0 — the padded
  // gradient paints exactly that.
  const path = rampShape(offs, steps, 0)
  if (path < 0) return null
  // Backtracking: the share of the path that runs against the net direction.
  const sign = vals[np - 1] >= vals[0] ? 1 : -1
  let back = 0
  for (let i = 1; i < np; i++) {
    const d = (vals[i] - vals[i - 1]) * sign
    if (d < 0) back -= d
  }
  if (back / path > maxBacktrack) return null
  const kept = simplify(offs, ALPHA_STOP_TOLERANCE, (i, a, b, t) =>
    Math.abs(vals[i] - (vals[a] + (vals[b] - vals[a]) * t)),
  )
  const nk = kept.length
  const stops: GradientStop[] = []
  for (let k = 0; k < nk; k++) {
    const i = kept[k]
    let offset = offs[i]
    let v = vals[i]
    const end = k === 0 && offset > 0 ? 0 : k === nk - 1 && offset < 1 ? 1 : -1
    if (end >= 0 && np > 1) {
      const j = k === 0 ? i + 1 : i - 1
      v += (vals[j] - v) * extendTo(offs, i, j, end)
      offset = end
    }
    const opacity = opacityOf(v)
    stops.push(opacity === undefined ? { offset, color: hex } : { offset, color: hex, opacity })
  }
  return stops
}

/** Write the profile's interpolated Oklab at `t` into `out` (clamped past the ends). */
function labAt(lab: Float64Array, t: number, out: Float64Array): void {
  const k = lab.length / 4
  if (t <= lab[0] || k === 1) {
    out[0] = lab[1]
    out[1] = lab[2]
    out[2] = lab[3]
    return
  }
  const lastOff = (k - 1) * 4
  if (t >= lab[lastOff]) {
    out[0] = lab[lastOff + 1]
    out[1] = lab[lastOff + 2]
    out[2] = lab[lastOff + 3]
    return
  }
  let s = 1
  while (lab[s * 4] < t) s++
  const a = (s - 1) * 4
  const b = s * 4
  const span = lab[b] - lab[a]
  const u = span > 1e-12 ? (t - lab[a]) / span : 0
  out[0] = lab[a + 1] + (lab[b + 1] - lab[a + 1]) * u
  out[1] = lab[a + 2] + (lab[b + 2] - lab[a + 2]) * u
  out[2] = lab[a + 3] + (lab[b + 3] - lab[a + 3]) * u
}

/** Opacity stops as a flat [offset, opacity] table for interpolation. */
function alphaTable(stops: readonly GradientStop[]): Float64Array {
  const t = new Float64Array(stops.length * 2)
  stops.forEach((s, i) => {
    t[i * 2] = s.offset
    t[i * 2 + 1] = s.opacity ?? 1
  })
  return t
}

/** Interpolated opacity at `t` (clamped past the ends). */
function alphaAt(table: Float64Array, t: number): number {
  const k = table.length / 2
  if (t <= table[0] || k === 1) return table[1]
  if (t >= table[(k - 1) * 2]) return table[(k - 1) * 2 + 1]
  let s = 1
  while (table[s * 2] < t) s++
  const a = (s - 1) * 2
  const span = table[s * 2] - table[a]
  const u = span > 1e-12 ? (t - table[a]) / span : 0
  return table[a + 1] + (table[s * 2 + 1] - table[a + 1]) * u
}

/** The paint's scalar (offset along the axis or radius fraction) at a pixel center, clamped to [0,1]. */
function scalarAt(paint: GradientPaint, px: number, py: number): number {
  let t: number
  if (paint.kind === 'linear') {
    const dx = paint.x2 - paint.x1
    const dy = paint.y2 - paint.y1
    const len2 = dx * dx + dy * dy
    t = len2 > 1e-12 ? ((px - paint.x1) * dx + (py - paint.y1) * dy) / len2 : 0
  } else {
    t = paint.r > 1e-12 ? Math.hypot(px - paint.cx, py - paint.cy) / paint.r : 0
  }
  return t < 0 ? 0 : t > 1 ? 1 : t
}

/** Accumulate pixel `p` at scalar `t` into the profile bin for `t`. */
function addToBin(bins: Float64Array, t: number, ctx: Ctx, p: number): void {
  const b = binOf(t) * BIN_FIELDS
  const base = p * 3
  const L = ctx.ok[base]
  const A = ctx.ok[base + 1]
  const B = ctx.ok[base + 2]
  bins[b] += 1
  bins[b + 1] += L
  bins[b + 2] += A
  bins[b + 3] += B
  bins[b + 4] += L * L
  bins[b + 5] += A * A
  bins[b + 6] += B * B
  bins[b + 11] += t
  if (ctx.alpha === null) {
    bins[b + 7] += 1
    return
  }
  // Composited over white: premultiplied = composited − (1 − α)·255.
  const a = ctx.alpha[p] / 255
  const q = p * 4
  const w = (1 - a) * 255
  bins[b + 7] += a
  bins[b + 8] += ctx.rgb[q] - w
  bins[b + 9] += ctx.rgb[q + 1] - w
  bins[b + 10] += ctx.rgb[q + 2] - w
}

/** Accumulate opacity `a` at scalar `t` into the opacity-profile bin for `t`. */
function addToAlphaBin(bins: Float64Array, t: number, a: number): void {
  const b = binOf(t) * ABIN_FIELDS
  bins[b] += 1
  bins[b + 1] += a
  bins[b + 2] += t
}

/** Bin index for a scalar in [0,1]. */
function binOf(t: number): number {
  const bin = Math.floor(t * BIN_COUNT)
  return bin < 0 ? 0 : bin >= BIN_COUNT ? BIN_COUNT - 1 : bin
}

/** Oklab of an sRGB triple (0-1 components) into `out` (the conversion `toOklabBuffer` applies). */
function oklabInto(r: number, g: number, b: number, out: Float64Array): void {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
}

/** Squared Oklab distance between the pixel at `base` in `ok` and the triple in `c`. */
function deltaEOkSq3(ok: Float32Array, base: number, c: Float64Array): number {
  const dL = ok[base] - c[0]
  const da = ok[base + 1] - c[1]
  const db = ok[base + 2] - c[2]
  return dL * dL + da * da + db * db
}

/**
 * Stride at which a union of `n` pixels is sampled so a pass scans at most
 * ~MAX_SAMPLE of them. Coprime with the image width, so the sample never lines
 * up on a few columns.
 */
function strideFor(n: number, width: number): number {
  let s = Math.max(1, Math.ceil(n / MAX_SAMPLE))
  while (s > 1 && gcd(s, width) !== 1) s++
  return s
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Scores of one model over the sampled union: absolute error, capped squared
 * error, and the same for the members' flat fills, in total and per member.
 */
interface Score {
  abs: number
  sse: number
  flatSse: number
  perMember: Float64Array
  perMemberFlat: Float64Array
  /** Per profile bin: sampled pixels, and those farther than ERROR_CAP from the fit. */
  binN: Float64Array
  binOutliers: Float64Array
}

function newScore(members: number): Score {
  return {
    abs: 0,
    sse: 0,
    flatSse: 0,
    perMember: new Float64Array(members),
    perMemberFlat: new Float64Array(members),
    binN: new Float64Array(BIN_COUNT),
    binOutliers: new Float64Array(BIN_COUNT),
  }
}

/** Add one pixel's ramp error `d2` and flat error `f2` (both squared) for member `i` at scalar `t`. */
function addError(sc: Score, i: number, t: number, d2: number, f2: number): void {
  sc.abs += Math.sqrt(d2)
  const cap = ERROR_CAP * ERROR_CAP
  const bin = binOf(t)
  sc.binN[bin]++
  if (d2 > cap) sc.binOutliers[bin]++
  const cd = d2 > cap ? cap : d2
  const cf = f2 > cap ? cap : f2
  sc.sse += cd
  sc.flatSse += cf
  sc.perMember[i] += cd
  sc.perMemberFlat[i] += cf
}

/**
 * Whether a model's score clears every pixel-level gate: mean error under
 * MAX_RESIDUAL; the members' pooled flat-fill error reduced by
 * MIN_IMPROVEMENT; no member left worse off than its own flat fill by more
 * than MEMBER_TOLERANCE; and no well-populated bin with more than
 * MAX_BIN_OUTLIERS of its pixels off the fit.
 */
function accepts(sc: Score, n: number, memberN: Float64Array): boolean {
  if (sc.abs / n > MAX_RESIDUAL) return false
  if (sc.flatSse <= 0 || 1 - sc.sse / sc.flatSse < MIN_IMPROVEMENT) return false
  for (let i = 0; i < memberN.length; i++) {
    if (memberN[i] > 0 && (sc.perMember[i] - sc.perMemberFlat[i]) / memberN[i] > MEMBER_TOLERANCE) {
      return false
    }
  }
  let maxPop = 0
  for (let b = 0; b < BIN_COUNT; b++) if (sc.binN[b] > maxPop) maxPop = sc.binN[b]
  for (let b = 0; b < BIN_COUNT; b++) {
    if (sc.binN[b] < maxPop * SPARSE_FRAC) continue
    if (sc.binOutliers[b] > MAX_BIN_OUTLIERS * sc.binN[b]) return false
  }
  return true
}

/** Per-member mean Oklab as a flat [L, a, b] table, from the moments. */
function memberMeans(m: Float64Array, members: readonly number[]): Float64Array {
  const out = new Float64Array(members.length * 3)
  members.forEach((mem, i) => {
    const o = mem * NM
    const k = m[o]
    if (k <= 0) return
    for (let c = 0; c < 3; c++) out[i * 3 + c] = m[o + 6 + c] / k
  })
  return out
}

/** Squared Oklab distance from the pixel at `base` to member `i`'s mean in `means`. */
function flatError(ok: Float32Array, base: number, means: Float64Array, i: number): number {
  const dL = ok[base] - means[i * 3]
  const da = ok[base + 1] - means[i * 3 + 1]
  const db = ok[base + 2] - means[i * 3 + 2]
  return dL * dL + da * da + db * db
}

/**
 * Fit the members' pixels as one opaque ramp — linear along the moment-fitted
 * axis and/or radial about the moment-fitted center, whichever their pixels fit
 * tighter — verified at the pixel level ({@link accepts}).
 */
function fitOpaque(ctx: Ctx, members: readonly number[], final: boolean): Built | null {
  const { m, sacc, offset, bucket, width, ok } = ctx
  sumMembers(m, members, sacc)
  const n = sacc[0]
  if (n < 3) return null
  const flatVar = flatVariance(m, members)
  if (flatVar < MIN_FLAT_VAR) return null
  const lin = fitRamp(sacc, 0)
  const rad = fitRadial(sacc, 0)
  const useLin = lin !== null && lin.directionality >= MIN_DIRECTIONALITY
  const useRad = isRadial(rad)
  if (!useLin && !useRad) return null
  const dx = useLin ? lin.dx : 0
  const dy = useLin ? lin.dy : 0
  const rcx = useRad ? rad.cx : 0
  const rcy = useRad ? rad.cy : 0
  const stride = strideFor(n, width)

  // Pass 1: extents of each model's scalar.
  let smin = Infinity
  let smax = -Infinity
  let rmax = 0
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      if (useLin) {
        const s = dx * px + dy * py
        if (s < smin) smin = s
        if (s > smax) smax = s
      }
      if (useRad) {
        const r = Math.hypot(px - rcx, py - rcy)
        if (r > rmax) rmax = r
      }
    }
  }
  const span = smax - smin
  const doLin = useLin && span > 1e-6
  const doRad = useRad && rmax > 1e-6
  if (!doLin && !doRad) return null

  // Pass 2: color profile per model.
  const binsL = doLin ? new Float64Array(BIN_COUNT * BIN_FIELDS) : null
  const binsR = doRad ? new Float64Array(BIN_COUNT * BIN_FIELDS) : null
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      if (binsL) addToBin(binsL, (dx * px + dy * py - smin) / span, ctx, p)
      if (binsR) addToBin(binsR, Math.hypot(px - rcx, py - rcy) / rmax, ctx, p)
    }
  }
  // The color span is a shipping gate: two narrow bands of a gentle ramp span
  // little, yet are one ramp and must be allowed to start merging.
  const minSpan = final ? ctx.minColorSpan : 0
  const profL = binsL ? profileToStops(binsL, ctx, ctx.maxBacktrack, minSpan) : null
  // Radial profiles are monotone in radius by construction, so no backtrack gate.
  const profR = binsR ? profileToStops(binsR, ctx, 1, minSpan) : null
  if (!profL && !profR) return null

  // Pass 3: score each surviving model against the stops it would paint, and
  // the members' own flat fills against the same pixels.
  const out = ctx.lab
  const scL = newScore(members.length)
  const scR = newScore(members.length)
  const memberN = new Float64Array(members.length)
  const means = memberMeans(m, members)
  let sampled = 0
  for (let i = 0; i < members.length; i++) {
    const mem = members[i]
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      const base = p * 3
      memberN[i]++
      sampled++
      const f2 = flatError(ok, base, means, i)
      if (profL) {
        const t = (dx * px + dy * py - smin) / span
        labAt(profL.lab, t, out)
        addError(scL, i, t, deltaEOkSq3(ok, base, out), f2)
      }
      if (profR) {
        const t = Math.hypot(px - rcx, py - rcy) / rmax
        labAt(profR.lab, t, out)
        addError(scR, i, t, deltaEOkSq3(ok, base, out), f2)
      }
    }
  }
  let best: Built | null = null
  if (profL && accepts(scL, sampled, memberN)) {
    const cx = sacc[1] / n
    const cy = sacc[2] / n
    const sc = dx * cx + dy * cy
    best = {
      residual: scL.abs / sampled,
      lab: profL.lab,
      fineRgb: profL.fineRgb,
      translucent: profL.translucent,
      paint: {
        kind: 'linear',
        x1: cx + (smin - sc) * dx,
        y1: cy + (smin - sc) * dy,
        x2: cx + (smax - sc) * dx,
        y2: cy + (smax - sc) * dy,
        stops: profL.stops,
      },
    }
  }
  if (profR && accepts(scR, sampled, memberN)) {
    if (best === null || scR.abs < scL.abs) {
      best = {
        residual: scR.abs / sampled,
        lab: profR.lab,
        fineRgb: profR.fineRgb,
        translucent: profR.translucent,
        paint: { kind: 'radial', cx: rcx, cy: rcy, r: rmax, stops: profR.stops },
      }
    }
  }
  return best
}

/**
 * Fit the members' pixels as a constant color F at a ramping opacity a(p)
 * composited over `base`: c(p) = B(p) + a(p)·(F − B(p)), in sRGB (the space
 * an SVG renderer composites in), with B read from the base's unsimplified
 * profile. F is the weighted least-squares meeting point of
 * the lines B(p)→c(p), refined by alternating least squares with the per-pixel
 * opacities (the projection of c(p) − B(p) onto F − B(p)); the opacity field is
 * then fitted (axis or center from its moments), profiled, gated and scored
 * against the composite it would paint — the same bar as an opaque ramp
 * ({@link accepts}).
 */
/**
 * Fit the members' pixels as a constant color F at a ramping opacity a(p)
 * composited over `base`: c(p) = B(p) + a(p)·(F − B(p)), in sRGB (the space
 * an SVG renderer composites in), with B read from the base's unsimplified
 * profile. F is the weighted least-squares meeting point of
 * the lines B(p)→c(p), refined by alternating least squares with the per-pixel
 * opacities (the projection of c(p) − B(p) onto F − B(p)); the opacity field is
 * then fitted (axis or center from its moments), profiled, gated and scored
 * against the composite it would paint — the same bar as an opaque ramp
 * ({@link accepts}).
 */
function fitOverlay(
  ctx: Ctx,
  members: readonly number[],
  base: Built,
  final: boolean,
): Built | null {
  const { m, sacc, offset, bucket, width, ok, rgb, lab: bcol } = ctx
  sumMembers(m, members, sacc)
  const n = sacc[0]
  if (n < 6) return null
  const flatVar = flatVariance(m, members)
  if (flatVar < MIN_FLAT_VAR) return null
  const bp = base.paint
  const stride = strideFor(n, width)
  const inv255 = 1 / 255

  // Pass 1: residual lines c(p) − B(p), in sRGB — the space the renderer
  // composites in, where a constant-color layer moves every pixel straight
  // toward F. F is the least-squares meeting point of those lines, weighted by
  // the residual's fourth power (a barely covered pixel's line direction is
  // mostly noise), and pulled toward the pixel farthest from the base where
  // the lines leave it undetermined (a flat base: one shared ray, along which
  // the farthest pixel anchors F at full opacity).
  let m00 = 0
  let m01 = 0
  let m02 = 0
  let m11 = 0
  let m12 = 0
  let m22 = 0
  let r0 = 0
  let r1 = 0
  let r2 = 0
  let farD2 = -1
  const F = new Float64Array(3)
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      labAt(base.fineRgb, scalarAt(bp, px, py), bcol)
      const q = p * 4
      const dr = rgb[q] * inv255 - bcol[0]
      const dg = rgb[q + 1] * inv255 - bcol[1]
      const db = rgb[q + 2] * inv255 - bcol[2]
      const d2 = dr * dr + dg * dg + db * db
      if (d2 > farD2) {
        farD2 = d2
        F[0] = rgb[q] * inv255
        F[1] = rgb[q + 1] * inv255
        F[2] = rgb[q + 2] * inv255
      }
      // W = |r|²·(|r|²·I − r·rᵀ): the line's normal-plane projector, weighted.
      const w00 = d2 * (d2 - dr * dr)
      const w01 = d2 * -dr * dg
      const w02 = d2 * -dr * db
      const w11 = d2 * (d2 - dg * dg)
      const w12 = d2 * -dg * db
      const w22 = d2 * (d2 - db * db)
      m00 += w00
      m01 += w01
      m02 += w02
      m11 += w11
      m12 += w12
      m22 += w22
      r0 += w00 * bcol[0] + w01 * bcol[1] + w02 * bcol[2]
      r1 += w01 * bcol[0] + w11 * bcol[1] + w12 * bcol[2]
      r2 += w02 * bcol[0] + w12 * bcol[1] + w22 * bcol[2]
    }
  }
  if (farD2 <= 1e-9) return null
  const tr = m00 + m11 + m22
  if (tr > 1e-18) {
    const reg = (OVERLAY_REG * tr) / 3
    const sol = solve(
      3,
      [m00 + reg, m01, m02, m01, m11 + reg, m12, m02, m12, m22 + reg],
      [[r0 + reg * F[0], r1 + reg * F[1], r2 + reg * F[2]]],
    )
    if (sol) {
      F[0] = sol[0][0]
      F[1] = sol[0][1]
      F[2] = sol[0][2]
    }
  }
  /** Opacity of the pixel at RGBA index `q` over base color `bcol` for the current F. */
  const alphaOf = (q: number): number => {
    const fr = F[0] - bcol[0]
    const fg = F[1] - bcol[1]
    const fb = F[2] - bcol[2]
    const f2 = fr * fr + fg * fg + fb * fb
    return f2 > 1e-9
      ? ((rgb[q] * inv255 - bcol[0]) * fr +
          (rgb[q + 1] * inv255 - bcol[1]) * fg +
          (rgb[q + 2] * inv255 - bcol[2]) * fb) /
          f2
      : 0
  }
  // Refine by alternating least squares on c = B + a·(F − B): opacities from
  // F, then F from the opacities (a·F = c − (1 − a)·B, weighted by a).
  for (let iter = 0; iter < OVERLAY_ITERATIONS; iter++) {
    let sa2 = 0
    const acc = [0, 0, 0]
    for (const mem of members) {
      for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
        const p = bucket[k]
        const px = (p % width) + 0.5
        const py = (p - (p % width)) / width + 0.5
        labAt(base.fineRgb, scalarAt(bp, px, py), bcol)
        const q = p * 4
        const a = Math.min(1, Math.max(0, alphaOf(q)))
        sa2 += a * a
        for (let c = 0; c < 3; c++) acc[c] += a * (rgb[q + c] * inv255 - (1 - a) * bcol[c])
      }
    }
    if (sa2 <= 1e-9) return null
    for (let c = 0; c < 3; c++) F[c] = acc[c] / sa2
  }
  for (let c = 0; c < 3; c++) F[c] = F[c] < 0 ? 0 : F[c] > 1 ? 1 : F[c]
  const hex = rgbToHex(F[0] * 255, F[1] * 255, F[2] * 255)

  // Pass 2: per-pixel opacity → moments of the opacity field (channel L; a, b zero).
  const am = new Float64Array(NM)
  for (let j = 0; j < 6; j++) am[j] = sacc[j]
  for (let j = 18; j < 25; j++) am[j] = sacc[j]
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      labAt(base.fineRgb, scalarAt(bp, px, py), bcol)
      const a = alphaOf(p * 4)
      am[6] += a
      am[9] += a * a
      am[12] += a * px
      am[13] += a * py
      am[25] += a * (px * px + py * py)
    }
  }
  // The sampled moments stand in for the full ones the position sums came from.
  if (stride > 1) {
    const f = stride
    am[6] *= f
    am[9] *= f
    am[12] *= f
    am[13] *= f
    am[25] *= f
  }
  const lin = fitRamp(am, 0)
  const rad = fitRadial(am, 0)
  const useLin = lin !== null && lin.directionality >= MIN_DIRECTIONALITY
  const useRad = isRadial(rad)
  if (!useLin && !useRad) return null
  const dx = useLin ? lin.dx : 0
  const dy = useLin ? lin.dy : 0
  const rcx = useRad ? rad.cx : 0
  const rcy = useRad ? rad.cy : 0

  // Pass 3: extents.
  let smin = Infinity
  let smax = -Infinity
  let rmax = 0
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      if (useLin) {
        const s = dx * px + dy * py
        if (s < smin) smin = s
        if (s > smax) smax = s
      }
      if (useRad) {
        const r = Math.hypot(px - rcx, py - rcy)
        if (r > rmax) rmax = r
      }
    }
  }
  const span = smax - smin
  const doLin = useLin && span > 1e-6
  const doRad = useRad && rmax > 1e-6
  if (!doLin && !doRad) return null

  // Pass 4: opacity profile per model.
  const binsL = doLin ? new Float64Array(BIN_COUNT * ABIN_FIELDS) : null
  const binsR = doRad ? new Float64Array(BIN_COUNT * ABIN_FIELDS) : null
  for (const mem of members) {
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      labAt(base.fineRgb, scalarAt(bp, px, py), bcol)
      const a = alphaOf(p * 4)
      if (binsL) addToAlphaBin(binsL, (dx * px + dy * py - smin) / span, a)
      if (binsR) addToAlphaBin(binsR, Math.hypot(px - rcx, py - rcy) / rmax, a)
    }
  }
  const minSpan = final ? MIN_ALPHA_SPAN : 0
  const stopsL = binsL ? alphaProfileToStops(binsL, hex, ctx.maxBacktrack, minSpan) : null
  const stopsR = binsR ? alphaProfileToStops(binsR, hex, 1, minSpan) : null
  if (!stopsL && !stopsR) return null
  const alphaL = stopsL ? alphaTable(stopsL) : null
  const alphaR = stopsR ? alphaTable(stopsR) : null

  // Pass 5: score the composite each model paints (in Oklab, like every other
  // gate), and the members' own flat fills.
  const scL = newScore(members.length)
  const scR = newScore(members.length)
  const memberN = new Float64Array(members.length)
  const means = memberMeans(m, members)
  let sampled = 0
  const comp = new Float64Array(3)
  for (let i = 0; i < members.length; i++) {
    const mem = members[i]
    for (let k = offset[mem], end = offset[mem + 1]; k < end; k += stride) {
      const p = bucket[k]
      const px = (p % width) + 0.5
      const py = (p - (p % width)) / width + 0.5
      labAt(base.fineRgb, scalarAt(bp, px, py), bcol)
      const q = p * 3
      memberN[i]++
      sampled++
      const f2 = flatError(ok, q, means, i)
      if (alphaL) {
        const t = (dx * px + dy * py - smin) / span
        const a = alphaAt(alphaL, t)
        oklabInto(
          bcol[0] + a * (F[0] - bcol[0]),
          bcol[1] + a * (F[1] - bcol[1]),
          bcol[2] + a * (F[2] - bcol[2]),
          comp,
        )
        addError(scL, i, t, deltaEOkSq3(ok, q, comp), f2)
      }
      if (alphaR) {
        const t = Math.hypot(px - rcx, py - rcy) / rmax
        const a = alphaAt(alphaR, t)
        oklabInto(
          bcol[0] + a * (F[0] - bcol[0]),
          bcol[1] + a * (F[1] - bcol[1]),
          bcol[2] + a * (F[2] - bcol[2]),
          comp,
        )
        addError(scR, i, t, deltaEOkSq3(ok, q, comp), f2)
      }
    }
  }
  const none = new Float64Array(0)
  let best: Built | null = null
  if (stopsL && accepts(scL, sampled, memberN)) {
    const cx = sacc[1] / n
    const cy = sacc[2] / n
    const sc = dx * cx + dy * cy
    best = {
      residual: scL.abs / sampled,
      lab: none,
      fineRgb: none,
      translucent: true,
      paint: {
        kind: 'linear',
        x1: cx + (smin - sc) * dx,
        y1: cy + (smin - sc) * dy,
        x2: cx + (smax - sc) * dx,
        y2: cy + (smax - sc) * dy,
        stops: stopsL,
      },
    }
  }
  if (stopsR && accepts(scR, sampled, memberN)) {
    if (best === null || scR.abs < scL.abs) {
      best = {
        residual: scR.abs / sampled,
        lab: none,
        fineRgb: none,
        translucent: true,
        paint: { kind: 'radial', cx: rcx, cy: rcy, r: rmax, stops: stopsR },
      }
    }
  }
  return best
}

interface Super {
  members: number[]
  rep: number
  built: Built
}

interface Cluster {
  members: number[]
  acc: Float64Array
  adj: Set<number> // roots of adjacent clusters
}

/**
 * Agglomeratively merge adjacent bands into ramps: start one cluster per
 * unclaimed seed, then repeatedly merge the adjacent pair whose union screens
 * best (`screen` returns a score, Infinity to reject) *and* verifies at the
 * pixel level (`verify` returns the union's fit, or null), until no acceptable
 * merge remains. Merging the globally best pair first — rather than greedily
 * growing one seed to exhaustion — keeps a suboptimal early union from
 * fragmenting the rest. Verifications are cached per pair and invalidated when
 * either side changes (`verify(members, false)`). Every surviving cluster,
 * singletons included, is verified against the shipping gates
 * (`verify(members, true)`); those ≥ minArea are marked in `claimed` and returned.
 */
function growRamps(
  m: Float64Array,
  adj: readonly number[][],
  seeds: readonly number[],
  claimed: Int32Array,
  minArea: number,
  screen: (trial: Float64Array, members: readonly number[]) => number,
  verify: (members: readonly number[], final: boolean) => Built | null,
  count: number,
): Super[] {
  const rootOf = new Map<number, number>()
  const clusters = new Map<number, Cluster>()
  for (const seed of seeds) {
    if (claimed[seed] >= 0) continue
    const acc = new Float64Array(NM)
    for (let j = 0; j < NM; j++) acc[j] = m[seed * NM + j]
    clusters.set(seed, { members: [seed], acc, adj: new Set() })
    rootOf.set(seed, seed)
  }
  for (const [root, c] of clusters)
    for (const mem of c.members)
      for (const nb of adj[mem]) {
        const nr = rootOf.get(nb)
        if (nr !== undefined && nr !== root) c.adj.add(nr)
      }

  const trial = new Float64Array(NM)
  const cache = new Map<number, Built | null>()
  for (;;) {
    const pairs: [number, number, number][] = []
    for (const [a, ca] of clusters) {
      for (const b of ca.adj) {
        if (b <= a) continue // each undirected pair once
        if (cache.get(a * count + b) === null) continue
        const cb = clusters.get(b)!
        for (let j = 0; j < NM; j++) trial[j] = ca.acc[j] + cb.acc[j]
        const score = screen(trial, ca.members.concat(cb.members))
        if (Number.isFinite(score)) pairs.push([score, a, b])
      }
    }
    pairs.sort((p, q) => p[0] - q[0] || p[1] - q[1] || p[2] - q[2])
    let merged = false
    for (const [, a, b] of pairs) {
      const key = a * count + b
      const ca = clusters.get(a)!
      const cb = clusters.get(b)!
      let built = cache.get(key)
      if (built === undefined) {
        built = verify(ca.members.concat(cb.members), false)
        cache.set(key, built)
      }
      if (built === null) continue
      // Merge the higher root into the lower so `rep` stays stable and deterministic.
      for (let j = 0; j < NM; j++) ca.acc[j] += cb.acc[j]
      for (const mem of cb.members) {
        ca.members.push(mem)
        rootOf.set(mem, a)
      }
      ca.adj.delete(b)
      cb.adj.delete(a)
      for (const x of cb.adj) {
        ca.adj.add(x)
        const cx = clusters.get(x)!
        cx.adj.delete(b)
        cx.adj.add(a)
      }
      clusters.delete(b)
      const stale: number[] = []
      for (const k of cache.keys()) {
        const ka = Math.floor(k / count)
        const kb = k % count
        if (ka === a || ka === b || kb === a || kb === b) stale.push(k)
      }
      for (const k of stale) cache.delete(k)
      merged = true
      break
    }
    if (!merged) break
  }

  const supers: Super[] = []
  for (const [root, c] of clusters) {
    if (c.acc[0] < minArea) continue
    const built = verify(c.members, true)
    if (!built) continue
    for (const mem of c.members) claimed[mem] = 1
    supers.push({ members: c.members.slice(), rep: root, built })
  }
  return supers
}

/**
 * Detect linear and radial color ramps in a cleaned label map. Adjacent
 * quantized bands that form one ramp — or a single band whose own pixels ramp —
 * are relabeled into a single representative label (mutating `labels`), and the
 * returned `gradients[rep]` holds that region's gradient. Semi-transparent
 * overlays stacked over a detected ramp are returned with `underlays[rep]` set to
 * the base label. Bands that do not form a ramp are left untouched, so a run with
 * no detectable ramp returns all-`null` and leaves `labels` unchanged.
 */
export function fitRegionGradients(
  image: RasterImage,
  labels: LabelMap,
  opts?: GradientOptions,
): GradientResult {
  const { width, height, count } = labels
  const data = labels.data
  const gradients: (GradientPaint | null)[] = new Array(count).fill(null)
  const underlays = new Int32Array(count).fill(-1)
  if (count < 1) return { gradients, underlays }

  const minArea = opts?.minArea ?? 0
  const maxBacktrack = opts?.maxBacktrack ?? MAX_BACKTRACK
  const minColorSpan = opts?.minColorSpan ?? MIN_COLOR_SPAN
  const ok = opts?.oklab ?? toOklabBuffer(image)
  // Coverage only matters when some labeled pixel is not fully covered.
  let alpha: Uint8Array | Uint8ClampedArray | null = opts?.alpha ?? null
  if (alpha !== null) {
    let partial = false
    for (let p = 0; p < data.length && !partial; p++) partial = data[p] >= 0 && alpha[p] < 255
    if (!partial) alpha = null
  }

  // ---- per-label moment sums and pixel counts (one pass) ----
  const m = new Float64Array(count * NM)
  const counts = new Uint32Array(count)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const l = data[p]
      if (l < 0) continue
      counts[l]++
      const cx = x + 0.5
      const cy = y + 0.5
      const x2 = cx * cx
      const y2 = cy * cy
      const u = x2 + y2
      const base = p * 3
      const L = ok[base]
      const A = ok[base + 1]
      const B = ok[base + 2]
      const o = l * NM
      m[o] += 1
      m[o + 1] += cx
      m[o + 2] += cy
      m[o + 3] += x2
      m[o + 4] += cx * cy
      m[o + 5] += y2
      m[o + 6] += L
      m[o + 7] += A
      m[o + 8] += B
      m[o + 9] += L * L
      m[o + 10] += A * A
      m[o + 11] += B * B
      m[o + 12] += L * cx
      m[o + 13] += L * cy
      m[o + 14] += A * cx
      m[o + 15] += A * cy
      m[o + 16] += B * cx
      m[o + 17] += B * cy
      m[o + 18] += x2 * cx
      m[o + 19] += x2 * cy
      m[o + 20] += cx * y2
      m[o + 21] += y2 * cy
      m[o + 22] += x2 * x2
      m[o + 23] += x2 * y2
      m[o + 24] += y2 * y2
      m[o + 25] += L * u
      m[o + 26] += A * u
      m[o + 27] += B * u
    }
  }

  // ---- per-label pixel lists (CSR), so a union scans only its own pixels ----
  const offset = new Int32Array(count + 1)
  for (let l = 0; l < count; l++) offset[l + 1] = offset[l] + counts[l]
  const bucket = new Int32Array(offset[count])
  const cursor = offset.slice(0, count)
  for (let p = 0; p < data.length; p++) {
    const l = data[p]
    if (l >= 0) bucket[cursor[l]++] = p
  }

  // ---- label adjacency (4-connected), as sorted neighbor lists ----
  const adjSets: Set<number>[] = Array.from({ length: count }, () => new Set<number>())
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const l = data[p]
      if (l < 0) continue
      if (x + 1 < width) {
        const r = data[p + 1]
        if (r >= 0 && r !== l) {
          adjSets[l].add(r)
          adjSets[r].add(l)
        }
      }
      if (y + 1 < height) {
        const d = data[p + width]
        if (d >= 0 && d !== l) {
          adjSets[l].add(d)
          adjSets[d].add(l)
        }
      }
    }
  }
  const adj: number[][] = adjSets.map((s) => [...s].toSorted((a, b) => a - b))

  const seeds: number[] = []
  for (let l = 0; l < count; l++) if (counts[l] > 0) seeds.push(l)
  seeds.sort((a, b) => counts[b] - counts[a] || a - b)

  const ctx: Ctx = {
    width,
    ok,
    rgb: image.data,
    alpha,
    m,
    offset,
    bucket,
    maxBacktrack,
    minColorSpan,
    sacc: new Float64Array(NM),
    lab: new Float64Array(3),
  }
  // A band's own fit is the same wherever it is tried; verify it once.
  const single = new Map<number, Built | null>()
  const verifyOpaque = (members: readonly number[], final: boolean): Built | null => {
    if (members.length !== 1 || !final) return fitOpaque(ctx, members, final)
    let b = single.get(members[0])
    if (b === undefined) {
      b = fitOpaque(ctx, members, true)
      single.set(members[0], b)
    }
    return b
  }

  // ---- phase 1: opaque ramps. A pair is screened O(1) from its moments as a
  // linear ramp (directional, monotone, outlier-free band means) or as a radial
  // one (the r² center fit explains the variance) — concentric rings are
  // isotropic at the band-mean level, so only the second screen pairs them —
  // and the better screen orders the verifications. ----
  const claimed = new Int32Array(count).fill(-1)
  const finalRep = new Int32Array(count).fill(-1)
  const supers = growRamps(
    m,
    adj,
    seeds,
    claimed,
    minArea,
    (t, members) => {
      let score = Infinity
      const f = fitRamp(t, 0)
      if (f !== null && f.directionality >= MIN_DIRECTIONALITY) {
        const q = rampPathFit(m, members, f.dx, f.dy)
        if (q.backtrack <= maxBacktrack && q.outlier <= MAX_OUTLIER) score = q.backtrack + q.outlier
      }
      const r = fitRadial(t, 0)
      if (isRadial(r) && r.misfit < score) score = r.misfit
      return score
    },
    verifyOpaque,
    count,
  )
  for (const s of supers) {
    gradients[s.rep] = s.built.paint
    for (const mem of s.members) finalRep[mem] = s.rep
  }

  // ---- phase 2: semi-transparent overlays over each opaque ramp, largest base
  // first. Candidates are the unclaimed bands reachable from the base through
  // other unclaimed bands (a glow's rings enclose its core), plus the smaller
  // ramps touching the base whose pixels an overlay explains far better than
  // their own opaque fit did. ----
  if (opts?.overlays !== false) {
    const areaOf = (s: Super): number => {
      let area = 0
      for (const mem of s.members) area += counts[mem]
      return area
    }
    const byArea = supers.toSorted((p, q) => areaOf(q) - areaOf(p) || p.rep - q.rep)
    const dissolved = new Set<Super>()
    const stacked: { overlay: Super; base: Super }[] = []
    for (const base of byArea) {
      if (base.built.translucent || dissolved.has(base)) continue
      const reach = new Set<number>()
      const stack: number[] = []
      const touching = new Set<number>()
      for (const mem of base.members)
        for (const nb of adj[mem]) {
          if (claimed[nb] < 0 && !reach.has(nb)) {
            reach.add(nb)
            stack.push(nb)
          }
          if (finalRep[nb] >= 0 && finalRep[nb] !== base.rep) touching.add(finalRep[nb])
        }
      while (stack.length > 0) {
        const l = stack.pop()!
        for (const nb of adj[l])
          if (claimed[nb] < 0 && !reach.has(nb)) {
            reach.add(nb)
            stack.push(nb)
          }
      }
      const overlays =
        reach.size === 0
          ? []
          : growRamps(
              m,
              adj,
              seeds.filter((l) => reach.has(l)),
              claimed,
              minArea,
              (_t, members) => (flatVariance(m, members) >= MIN_FLAT_VAR ? 0 : Infinity),
              (members, final) => fitOverlay(ctx, members, base.built, final),
              count,
            )
      // A smaller opaque ramp touching the base whose pixels an overlay
      // explains far better than its own opaque fit did is an overlay too.
      for (const other of byArea) {
        if (!touching.has(other.rep) || other.built.translucent || dissolved.has(other)) continue
        if (areaOf(other) >= areaOf(base)) continue
        const over = fitOverlay(ctx, other.members, base.built, true)
        if (over === null || over.residual > OVERLAY_PREFER * other.built.residual) continue
        other.built = over
        overlays.push(other)
      }
      // An opaque ramp touching an overlay — a glow's core, which shipped as a
      // radial of its own before its base existed — joins the overlay when the
      // overlay fitted over both explains them at least as well.
      for (const o of overlays) {
        const inO = new Set(o.members)
        for (let grew = true; grew;) {
          grew = false
          for (const other of byArea) {
            if (other === base || other === o || other.built.translucent) continue
            if (dissolved.has(other) || areaOf(other) >= areaOf(base)) continue
            if (!other.members.some((mem) => adj[mem].some((nb) => inO.has(nb)))) continue
            const union = fitOverlay(ctx, o.members.concat(other.members), base.built, true)
            if (union === null) continue
            const worst = Math.max(o.built.residual, other.built.residual)
            if (union.residual > worst + OVERLAY_JOIN_TOLERANCE) continue
            for (const mem of other.members) {
              o.members.push(mem)
              inO.add(mem)
            }
            o.built = union
            gradients[other.rep] = null
            dissolved.add(other)
            grew = true
          }
        }
        gradients[o.rep] = o.built.paint
        underlays[o.rep] = base.rep
        for (const mem of o.members) finalRep[mem] = o.rep
        stacked.push({ overlay: o, base })
      }
    }
    // A ramp an overlay cut in two — the sky above and below a glow whose skirt
    // took the band between them — is one ramp again: another opaque ramp that
    // touches the overlay joins its base when their union verifies, and the
    // overlay is refitted over the joined base.
    for (const { overlay, base } of stacked) {
      if (dissolved.has(base)) continue
      const inO = new Set(overlay.members)
      for (const other of byArea) {
        if (other === base || other.built.translucent || dissolved.has(other)) continue
        if (!other.members.some((mem) => adj[mem].some((nb) => inO.has(nb)))) continue
        const union = verifyOpaque(base.members.concat(other.members), true)
        if (union === null) continue
        base.members.push(...other.members)
        base.built = union
        gradients[base.rep] = union.paint
        gradients[other.rep] = null
        for (const mem of other.members) finalRep[mem] = base.rep
        dissolved.add(other)
        const refit = fitOverlay(ctx, overlay.members, union, true)
        if (refit) {
          overlay.built = refit
          gradients[overlay.rep] = refit.paint
        }
      }
    }
  }

  // ---- relabel merged bands onto their representative ----
  let any = false
  for (let l = 0; l < count; l++) if (finalRep[l] >= 0 && l !== finalRep[l]) any = true
  if (any) {
    for (let p = 0; p < data.length; p++) {
      const l = data[p]
      if (l >= 0 && finalRep[l] >= 0) data[p] = finalRep[l]
    }
  }

  return { gradients, underlays }
}
