/**
 * Gradient detection: find posterized color ramps and describe them as single
 * SVG gradients. After quantization has split a smooth ramp into several adjacent
 * flat bands, this merges the bands that form one ramp — linear or radial — into
 * a single region and returns a gradient paint for it. Geometry is untouched
 * (mesh-free) — only the fill changes — so the tracer, the cutout seam-free
 * partition and the stacked layer build are unaffected.
 *
 * The fits are closed-form and deterministic (per-label moment sums make every
 * candidate union's fit O(1)):
 * - linear: the ramp direction is the leading eigenvector of the per-channel
 *   color-gradient scatter in position space (covariance-normalized, so it is
 *   aspect-correct); its eigenvalue ratio is the ramp's directionality (1-D-ness);
 * - radial: modeling color as linear in r² makes it a quadratic in position, so
 *   the concentric center falls out of the per-channel quadratic coefficients
 *   (c = −½·ΣA·B / ΣA²).
 *
 * Bands are merged *agglomeratively* — repeatedly uniting the adjacent pair that
 * scores best — rather than by growing one seed to exhaustion, so a suboptimal
 * early union can't fragment the rest and a long multi-stop ramp is recovered
 * whole regardless of band count. A union is accepted when it is directional (its
 * color varies along one axis) and *monotone*: walking the member bands' mean
 * colors in axis order, the color path neither doubles back (a reversal — a flat
 * object continuing the ramp's axis with its own colors) nor lets one band jump
 * far off the local trend (a foreign object wedged in). Monotonicity is
 * curvature-agnostic, so a wide multi-stop ramp that bends through Oklab still
 * grows whole where a straight-line error gate would split it.
 *
 * Stops come from a binned color profile along the model's scalar (projection or
 * radius), simplified by Douglas–Peucker: a ramp that is straight in Oklab keeps
 * 2 stops, one that curves in Oklab (which most sRGB ramps do) keeps the few it
 * needs — up to MAX_STOPS — so the gradient follows the true perceptual path. A
 * profile ships only if it spans ≥ MIN_MEMBERS bands whose color changes steadily
 * across the extent (not two flats meeting at a seam) with low cross-axis spread.
 *
 * Bands merge into linear candidates first; each candidate is then built as both
 * a linear and (when it carries a curvature centre) a radial gradient, and the
 * model whose pixels fit tighter wins — an off-centre radial reads as a linear
 * ramp at the band-mean level, so only the pixel-level cross-axis spread tells
 * them apart. Leftover bands the linear pass released feed a second, radial merge.
 *
 * Reference: Du et al., "Image Vectorization and Editing via Linear Gradient
 * Layer Decomposition", ACM TOG (SIGGRAPH) 42(4), 2023.
 */

import { deltaEOk, oklabToHex } from '@trazor/core'
import type { GradientPaint, LabelMap, RasterImage } from '@trazor/core'
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
}

export interface GradientResult {
  /**
   * Per-label paint, indexed by the (rewritten) label: a `GradientPaint` for a
   * label that now covers a detected ramp, else `null` (keep the flat fill).
   * Length is `labels.count`.
   */
  gradients: (GradientPaint | null)[]
}

/**
 * Build-side fidelity gate: mean per-pixel Oklab distance to the (multi-stop)
 * ramp above which a fit is rejected. Measured as within-bin color spread, so
 * it accepts a curved 1-D ramp (the stops follow it) but rejects a 2-D field.
 */
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
 * a foreign object wedged into the ramp rather than part of it. Generous, because
 * a smooth ramp's bands barely deviate while an off-ramp blob (a sun, a
 * silhouette) strays a large fraction of the span.
 */
const MAX_OUTLIER = 0.35
/** Fraction of position→color energy on the principal axis required (1-D linear ramp). */
const MIN_DIRECTIONALITY = 0.88
/** Total Oklab distance across the ramp below which the region is treated as flat. */
const MIN_COLOR_SPAN = 0.06
/**
 * A ramp must merge at least this many quantized bands. Four, not two or three:
 * a couple of adjacent flats — two silhouettes with an anti-aliased seam, a step
 * with a transition band — make a two or three band progression that a ramp test
 * cannot tell from the real thing. A genuine posterized ramp spans many bands, so
 * requiring four rejects the flat-object cases while keeping any real gradient.
 */
const MIN_MEMBERS = 4
/** Bins used to sample a ramp's color profile before simplifying it to stops. */
const BIN_COUNT = 32
/** A populated-bin count below this is too coarse to be a ramp. */
const MIN_POPULATED_BINS = 3
/** Drop a stop whose color lies within this Oklab distance of its neighbors' interpolation. */
const STOP_TOLERANCE = 0.01
/** Maximum stops per gradient (keeps files small). */
const MAX_STOPS = 8
/** Reject as a hard edge (not a ramp) when one adjacent-bin jump exceeds this fraction of the whole path. */
const STEP_JUMP_FRAC = 0.5
/**
 * The offset span over which the middle 80% of a ramp's color path is traversed,
 * as a fraction of its full offset range, must be at least this. A ramp changes
 * color steadily across its extent; two flat regions meeting (e.g. two silhouettes
 * with an anti-aliased seam that quantized into a thin intermediate band) put the
 * whole change into a narrow band — a step, not a ramp — even when a hard single
 * jump is avoided.
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
 * unexplained and still be grouped as one radial. This proxy only groups rings
 * and locates the center; a true radial ramp is linear in r (not r²), so the r²
 * model misfits by a roughly constant *fraction* (≈4% on a clean disc)
 * independent of the ramp's steepness — hence a fraction, not an absolute
 * residual. The accurate color-vs-true-radius fit in {@link buildRadial} (gated
 * at MAX_RESIDUAL) is what actually decides whether a radial ships.
 */
const RADIAL_MAX_UNEXPLAINED = 0.15

// Moment layout per label (Σ over the label's pixels; positions are pixel centers).
//  0:n 1:Σx 2:Σy 3:Σxx 4:Σxy 5:Σyy 6:ΣL 7:Σa 8:Σb 9:ΣLL 10:Σaa 11:Σbb
// 12:ΣLx 13:ΣLy 14:Σax 15:Σay 16:Σbx 17:Σby
// 18:Σx³ 19:Σx²y 20:Σxy² 21:Σy³ 22:Σx⁴ 23:Σx²y² 24:Σy⁴   25:ΣLu 26:Σau 27:Σbu  (u = x²+y²)
const NM = 28

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
 * Backtracking catches reversals at the ends; the outlier term catches foreign
 * bands wedged into the middle, which a monotone walk would otherwise accept.
 */
function rampPathFit(
  m: Float64Array,
  members: readonly number[],
  candidate: number,
  dx: number,
  dy: number,
): { backtrack: number; outlier: number } {
  const pts: [number, number, Lab][] = []
  const push = (l: number) => {
    const o = l * NM
    const n = m[o]
    if (n <= 0) return
    pts.push([
      dx * (m[o + 1] / n) + dy * (m[o + 2] / n),
      l,
      [m[o + 6] / n, m[o + 7] / n, m[o + 8] / n],
    ])
  }
  for (const l of members) push(l)
  if (candidate >= 0) push(candidate)
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

/** True when a linear fit is a growable 1-D ramp (directional, monotone, outlier-free). */
function isRamp(
  m: Float64Array,
  members: readonly number[],
  candidate: number,
  fit: RampFit | null,
  maxBacktrack: number,
): fit is RampFit {
  if (fit === null || fit.directionality < MIN_DIRECTIONALITY) return false
  const q = rampPathFit(m, members, candidate, fit.dx, fit.dy)
  return q.backtrack <= maxBacktrack && q.outlier <= MAX_OUTLIER
}

/**
 * Solve a 4×4 system `A·x = b` for three right-hand sides at once (Gauss-Jordan
 * with partial pivoting). `a` is row-major length 16; each `rhs[c]` is length 4.
 * Returns the three solution vectors, or null when the matrix is near-singular.
 */
function solve4(a: readonly number[], rhs: readonly number[][]): number[][] | null {
  const A = a.slice()
  const B = [rhs[0].slice(), rhs[1].slice(), rhs[2].slice()]
  for (let col = 0; col < 4; col++) {
    let piv = col
    let max = Math.abs(A[col * 4 + col])
    for (let r = col + 1; r < 4; r++) {
      const v = Math.abs(A[r * 4 + col])
      if (v > max) {
        max = v
        piv = r
      }
    }
    if (max < 1e-12) return null
    if (piv !== col) {
      for (let k = 0; k < 4; k++) {
        const t = A[col * 4 + k]
        A[col * 4 + k] = A[piv * 4 + k]
        A[piv * 4 + k] = t
      }
      for (let c = 0; c < 3; c++) {
        const t = B[c][col]
        B[c][col] = B[c][piv]
        B[c][piv] = t
      }
    }
    const d = A[col * 4 + col]
    for (let k = 0; k < 4; k++) A[col * 4 + k] /= d
    for (let c = 0; c < 3; c++) B[c][col] /= d
    for (let r = 0; r < 4; r++) {
      if (r === col) continue
      const f = A[r * 4 + col]
      if (f === 0) continue
      for (let k = 0; k < 4; k++) A[r * 4 + k] -= f * A[col * 4 + k]
      for (let c = 0; c < 3; c++) B[c][r] -= f * B[c][col]
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
  const sol = solve4(M4, rhs)
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

interface Super {
  members: number[]
  rep: number
}

interface Cluster {
  members: number[]
  acc: Float64Array
  adj: Set<number> // roots of adjacent clusters
}

/**
 * Agglomeratively merge adjacent bands into ramps: start one cluster per
 * unclaimed band, then repeatedly merge the adjacent pair whose union scores best
 * under `accept` (which returns a score, or Infinity to reject), until no
 * acceptable merge remains. Merging the globally best pair first — rather than
 * greedily growing one seed to exhaustion — keeps a suboptimal early union from
 * fragmenting the rest: the clean bands of one ramp coalesce before any marginal
 * merge is considered, so a long multi-stop ramp is recovered whole regardless of
 * band count. Surviving clusters (≥ MIN_MEMBERS, ≥ minArea) are marked in the
 * shared `claimed` map; the rest are left for the next phase.
 */
function growRamps(
  m: Float64Array,
  adj: readonly number[][],
  seeds: readonly number[],
  claimed: Int32Array,
  minArea: number,
  accept: (trial: Float64Array, members: readonly number[]) => number,
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
  for (;;) {
    let bestA = -1
    let bestB = -1
    let bestScore = Infinity
    for (const [a, ca] of clusters) {
      for (const b of ca.adj) {
        if (b <= a) continue // each undirected pair once
        const cb = clusters.get(b)!
        for (let j = 0; j < NM; j++) trial[j] = ca.acc[j] + cb.acc[j]
        const score = accept(trial, ca.members.concat(cb.members))
        if (score < bestScore) {
          bestScore = score
          bestA = a
          bestB = b
        }
      }
    }
    if (bestA < 0) break
    // Merge the higher root into the lower so `rep` stays stable and deterministic.
    const ca = clusters.get(bestA)!
    const cb = clusters.get(bestB)!
    for (let j = 0; j < NM; j++) ca.acc[j] += cb.acc[j]
    for (const mem of cb.members) {
      ca.members.push(mem)
      rootOf.set(mem, bestA)
    }
    ca.adj.delete(bestB)
    cb.adj.delete(bestA)
    for (const x of cb.adj) {
      ca.adj.add(x)
      const cx = clusters.get(x)!
      cx.adj.delete(bestB)
      cx.adj.add(bestA)
    }
    clusters.delete(bestB)
  }

  const supers: Super[] = []
  for (const [root, c] of clusters) {
    if (c.members.length < MIN_MEMBERS || c.acc[0] < minArea) continue
    for (const mem of c.members) claimed[mem] = 1
    supers.push({ members: c.members.slice(), rep: root })
  }
  return supers
}

/** Sum the members' moment rows into `out` (length NM). */
function sumMembers(m: Float64Array, members: readonly number[], out: Float64Array): void {
  out.fill(0)
  for (const mem of members) {
    const o = mem * NM
    for (let j = 0; j < NM; j++) out[j] += m[o + j]
  }
}

// Fields per profile bin: [count, ΣL, Σa, Σb, ΣLL, Σaa, Σbb].
const BIN_FIELDS = 7

/**
 * Per-representative accumulators for the accept passes. `bins` holds, per
 * BIN_COUNT bin along the model's scalar (projection for linear, radius for
 * radial), the pixel count and summed + squared Oklab — a color-vs-scalar
 * profile the build reads (and whose within-bin spread it gates on).
 */
interface LinearMeta {
  kind: 'linear'
  dx: number
  dy: number
  /** Region centroid, so the gradient axis passes through it. */
  cx: number
  cy: number
  smin: number
  smax: number
  bins: Float64Array
}
interface RadialMeta {
  kind: 'radial'
  cx: number
  cy: number
  rmax: number
  bins: Float64Array
}
type Meta = LinearMeta | RadialMeta

/**
 * Detect linear and radial color ramps in a cleaned label map. Adjacent
 * quantized bands that form one ramp are relabeled into a single representative
 * label (mutating `labels`), and the returned `gradients[rep]` holds that
 * region's gradient. Bands that do not form a ramp are left untouched, so a run
 * with no detectable ramp returns all-`null` and leaves `labels` unchanged.
 */
export function fitRegionGradients(
  image: RasterImage,
  labels: LabelMap,
  opts?: GradientOptions,
): GradientResult {
  const { width, height, count } = labels
  const data = labels.data
  const gradients: (GradientPaint | null)[] = new Array(count).fill(null)
  if (count < MIN_MEMBERS) return { gradients }

  const minArea = opts?.minArea ?? 0
  const maxBacktrack = opts?.maxBacktrack ?? MAX_BACKTRACK
  const minColorSpan = opts?.minColorSpan ?? MIN_COLOR_SPAN
  const ok = opts?.oklab ?? toOklabBuffer(image)

  // ---- per-label moment sums (one pass) ----
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

  // ---- fill a super's per-scalar color profile (pass A: extents, pass B: bins)
  // and build its paint; returns the paint + residual or null. Only pixels whose
  // label maps to `rep` in `repOf` are read, so it is safe to call per phase. ----
  const profileAndBuild = (rep: number, info: Meta): Built | null => {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (repOf[data[y * width + x]] !== rep) continue
        const px = x + 0.5
        const py = y + 0.5
        if (info.kind === 'linear') {
          const s = info.dx * px + info.dy * py
          if (s < info.smin) info.smin = s
          if (s > info.smax) info.smax = s
        } else {
          const r = Math.hypot(px - info.cx, py - info.cy)
          if (r > info.rmax) info.rmax = r
        }
      }
    }
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const p = y * width + x
        if (repOf[data[p]] !== rep) continue
        const px = x + 0.5
        const py = y + 0.5
        let t: number
        if (info.kind === 'linear') {
          const span = info.smax - info.smin
          t = span > 1e-9 ? (info.dx * px + info.dy * py - info.smin) / span : 0
        } else {
          t = info.rmax > 1e-9 ? Math.hypot(px - info.cx, py - info.cy) / info.rmax : 0
        }
        let bin = Math.floor(t * BIN_COUNT)
        if (bin < 0) bin = 0
        else if (bin >= BIN_COUNT) bin = BIN_COUNT - 1
        const b = bin * BIN_FIELDS
        const base = p * 3
        info.bins[b] += 1
        info.bins[b + 1] += ok[base]
        info.bins[b + 2] += ok[base + 1]
        info.bins[b + 3] += ok[base + 2]
        info.bins[b + 4] += ok[base] * ok[base]
        info.bins[b + 5] += ok[base + 1] * ok[base + 1]
        info.bins[b + 6] += ok[base + 2] * ok[base + 2]
      }
    }
    return info.kind === 'linear'
      ? buildLinear(info, minColorSpan, maxBacktrack)
      : buildRadial(info, minColorSpan)
  }

  // ---- two-phase growth sharing one claim map: linear first, radial on the
  // leftovers. Directionality and monotonicity cannot tell an off-center radial
  // (whose ring means rise monotonically toward the far edge) from a real linear
  // ramp — only the pixel-level cross-axis spread can, and that is a build-time
  // measurement. So a linear super that fails to build (a 2-D field masquerading
  // as a ramp) releases its claim, handing those bands to the radial pass. ----
  const claimed = new Int32Array(count).fill(-1)
  const repOf = new Int32Array(count).fill(-1)
  const finalRep = new Int32Array(count).fill(-1)
  const sacc = new Float64Array(NM)

  const linearSupers = growRamps(m, adj, seeds, claimed, minArea, (t, members) => {
    const f = fitRamp(t, 0)
    if (f === null || f.directionality < MIN_DIRECTIONALITY) return Infinity
    const q = rampPathFit(m, members, -1, f.dx, f.dy)
    return q.backtrack <= maxBacktrack && q.outlier <= MAX_OUTLIER
      ? q.backtrack + q.outlier
      : Infinity
  })
  for (const s of linearSupers) {
    sumMembers(m, s.members, sacc)
    const fit = fitRamp(sacc, 0)
    if (!isRamp(m, s.members, -1, fit, maxBacktrack)) {
      for (const mem of s.members) claimed[mem] = -1 // fit slipped; hand back
      continue
    }
    for (const mem of s.members) repOf[mem] = s.rep
    // A concentric region reads as a linear ramp at the label-mean level (its
    // ring means rise monotonically outward), so the linear pass reaches it
    // first — and greedy radial growth cannot re-bootstrap it (a 2-3 band seed
    // gives an unstable centre). So when the region also carries a radial
    // signature, build BOTH models and keep whichever the pixels fit better
    // (lower within-bin residual): a real ramp wins as linear, an off-centre
    // radial wins as radial, and the choice needs no fragile threshold.
    const lin = profileAndBuild(s.rep, {
      kind: 'linear',
      dx: fit.dx,
      dy: fit.dy,
      cx: sacc[1] / sacc[0],
      cy: sacc[2] / sacc[0],
      smin: Infinity,
      smax: -Infinity,
      bins: new Float64Array(BIN_COUNT * BIN_FIELDS),
    })
    const rad = fitRadial(sacc, 0)
    const radBuilt = isRadial(rad)
      ? profileAndBuild(s.rep, {
          kind: 'radial',
          cx: rad.cx,
          cy: rad.cy,
          rmax: 0,
          bins: new Float64Array(BIN_COUNT * BIN_FIELDS),
        })
      : null
    const best =
      lin && radBuilt ? (radBuilt.residual < lin.residual ? radBuilt : lin) : (lin ?? radBuilt)
    if (best) {
      gradients[s.rep] = best.paint
      for (const mem of s.members) finalRep[mem] = s.rep
    } else {
      // Neither model fits (a 2-D field): release for the radial pass to try a
      // different grouping of these bands.
      for (const mem of s.members) {
        claimed[mem] = -1
        repOf[mem] = -1
      }
    }
  }

  const radialSupers = growRamps(m, adj, seeds, claimed, minArea, (t) => {
    const f = fitRadial(t, 0)
    return isRadial(f) ? f.misfit : Infinity
  })
  for (const s of radialSupers) {
    sumMembers(m, s.members, sacc)
    const fit = fitRadial(sacc, 0)
    if (!isRadial(fit)) continue
    for (const mem of s.members) repOf[mem] = s.rep
    const built = profileAndBuild(s.rep, {
      kind: 'radial',
      cx: fit.cx,
      cy: fit.cy,
      rmax: 0,
      bins: new Float64Array(BIN_COUNT * BIN_FIELDS),
    })
    if (built) {
      gradients[s.rep] = built.paint
      for (const mem of s.members) finalRep[mem] = s.rep
    } else {
      for (const mem of s.members) repOf[mem] = -1
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

  return { gradients }
}

interface Stop {
  offset: number
  color: string
}
type Lab = [number, number, number]

/**
 * Reduce a per-bin color profile to simplified gradient stops, or null when it
 * is not a clean ramp: too few populated bins; too much within-bin color spread
 * (a 2-D field, not a function of the scalar); one hard adjacent jump (an edge,
 * not a ramp); a profile that doubles back on itself (a reversal, not a ramp); or
 * too little total color change (flat). A straight ramp collapses back to 2
 * stops; a curved or bent one keeps the stops it needs (≤ MAX_STOPS).
 */
/** Simplified stops plus the profile's within-bin RMS (lower = color is a purer
 *  function of this model's scalar; used to pick linear vs radial per region). */
interface Profile {
  stops: Stop[]
  residual: number
}

/** Linear-interpolate the offset at which the cumulative color path first reaches `target`. */
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

function profileToStops(
  bins: Float64Array,
  minColorSpan: number,
  maxBacktrack: number,
): Profile | null {
  // Sparse bins are region corners and anti-aliased boundary pixels: a handful of
  // mixed colors that skew their bin mean and inflate the spread. Ignore any bin
  // holding less than SPARSE_FRAC of the fullest bin, so the profile and the
  // 2-D-field gate both read only the ramp's well-populated cross-sections.
  let maxPop = 0
  for (let i = 0; i < BIN_COUNT; i++)
    if (bins[i * BIN_FIELDS] > maxPop) maxPop = bins[i * BIN_FIELDS]
  const popFloor = maxPop * SPARSE_FRAC

  const offs: number[] = []
  const cols: Lab[] = []
  let totalN = 0
  let withinVar = 0
  for (let i = 0; i < BIN_COUNT; i++) {
    const b = i * BIN_FIELDS
    const cnt = bins[b]
    if (cnt < popFloor || cnt <= 0) continue
    const inv = 1 / cnt
    withinVar += Math.max(0, bins[b + 4] - bins[b + 1] * bins[b + 1] * inv)
    withinVar += Math.max(0, bins[b + 5] - bins[b + 2] * bins[b + 2] * inv)
    withinVar += Math.max(0, bins[b + 6] - bins[b + 3] * bins[b + 3] * inv)
    totalN += cnt
    offs.push(i / (BIN_COUNT - 1))
    cols.push([bins[b + 1] * inv, bins[b + 2] * inv, bins[b + 3] * inv])
  }
  const np = offs.length
  if (np < MIN_POPULATED_BINS || totalN <= 0) return null
  // A 2-D field spreads color at a fixed scalar; a true ramp does not.
  const residual = Math.sqrt(withinVar / totalN)
  if (residual > MAX_RESIDUAL) return null
  const first = cols[0]
  const last = cols[np - 1]
  if (deltaEOk(first[0], first[1], first[2], last[0], last[1], last[2]) < minColorSpan) return null
  // Hard-edge guard: a step concentrates the whole color change in one jump.
  let path = 0
  let maxJump = 0
  const cum: number[] = [0]
  for (let i = 1; i < np; i++) {
    const d = deltaEOk(
      cols[i - 1][0],
      cols[i - 1][1],
      cols[i - 1][2],
      cols[i][0],
      cols[i][1],
      cols[i][2],
    )
    path += d
    if (d > maxJump) maxJump = d
    cum.push(path)
  }
  if (path <= 0 || maxJump > STEP_JUMP_FRAC * path) return null
  // Ramp-spread guard: the middle 80% of the color change must be spread across
  // the offset range, not concentrated at one seam (two flats meeting).
  const range = offs[np - 1] - offs[0]
  const spread = offsetAtPath(offs, cum, 0.9 * path) - offsetAtPath(offs, cum, 0.1 * path)
  if (range < 1e-9 || spread / range < MIN_RAMP_SPREAD) return null

  const kept = simplifyProfile(offs, cols)
  // Monotonicity is judged on the simplified stops, not the raw bins: Douglas–
  // Peucker has already dropped sub-STOP_TOLERANCE wiggle, so sparse-bin noise no
  // longer reads as a reversal, while a genuine there-and-back still does.
  if (pathBacktrack(kept.map((i) => cols[i])) > maxBacktrack) return null

  return {
    residual,
    stops: kept.map((i) => ({
      offset: offs[i],
      color: oklabToHex(cols[i][0], cols[i][1], cols[i][2]),
    })),
  }
}

/**
 * Douglas–Peucker in offset×Oklab: keep the endpoints, then repeatedly insert
 * the interior bin that deviates most from the interpolation between its kept
 * neighbors, until every deviation is within STOP_TOLERANCE or MAX_STOPS is hit.
 */
function simplifyProfile(offs: readonly number[], cols: readonly Lab[]): number[] {
  const np = offs.length
  const kept = [0, np - 1]
  while (kept.length < MAX_STOPS) {
    let bestDev = STOP_TOLERANCE
    let bestIdx = -1
    let bestPos = -1
    for (let s = 0; s < kept.length - 1; s++) {
      const a = kept[s]
      const b = kept[s + 1]
      const denom = offs[b] - offs[a]
      for (let i = a + 1; i < b; i++) {
        const t = denom > 1e-9 ? (offs[i] - offs[a]) / denom : 0
        const L = cols[a][0] + (cols[b][0] - cols[a][0]) * t
        const A = cols[a][1] + (cols[b][1] - cols[a][1]) * t
        const Bv = cols[a][2] + (cols[b][2] - cols[a][2]) * t
        const dev = deltaEOk(cols[i][0], cols[i][1], cols[i][2], L, A, Bv)
        if (dev > bestDev) {
          bestDev = dev
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

/** A built paint together with its profile residual (for linear-vs-radial choice). */
interface Built {
  paint: GradientPaint
  residual: number
}

/** Build a linear gradient from its projected extent and binned color profile. */
function buildLinear(info: LinearMeta, minColorSpan: number, maxBacktrack: number): Built | null {
  if (!(info.smax - info.smin > 1e-6)) return null
  const prof = profileToStops(info.bins, minColorSpan, maxBacktrack)
  if (!prof) return null
  const { dx, dy, cx, cy, smin, smax } = info
  const sc = dx * cx + dy * cy
  return {
    residual: prof.residual,
    paint: {
      kind: 'linear',
      x1: cx + (smin - sc) * dx,
      y1: cy + (smin - sc) * dy,
      x2: cx + (smax - sc) * dx,
      y2: cy + (smax - sc) * dy,
      stops: prof.stops,
    },
  }
}

/** Build a radial gradient from its recovered center/radius and binned profile. */
function buildRadial(info: RadialMeta, minColorSpan: number): Built | null {
  if (!(info.rmax > 1e-6)) return null
  // Radial profiles are monotone in radius by construction, so no backtrack gate.
  const prof = profileToStops(info.bins, minColorSpan, 1)
  if (!prof) return null
  return {
    residual: prof.residual,
    paint: { kind: 'radial', cx: info.cx, cy: info.cy, r: info.rmax, stops: prof.stops },
  }
}
