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
 * - linear: the ramp direction is the dominant least-squares color gradient in
 *   position space (covariance-normalized, so it is aspect-correct);
 * - radial: modeling color as linear in r² makes it a quadratic in position, so
 *   the concentric center falls out of the per-channel quadratic coefficients
 *   (c = −½·ΣA·B / ΣA²).
 *
 * Stops come from a binned color profile along the model's scalar (projection or
 * radius), simplified by Douglas–Peucker: a ramp that is straight in Oklab keeps
 * 2 stops, one that curves in Oklab (which most sRGB ramps do) keeps the few it
 * needs — up to MAX_STOPS — so the gradient follows the true perceptual path.
 *
 * Growth runs in two phases sharing one claim map: linear first, radial on the
 * leftovers — so a region a linear ramp already explains is never re-read as
 * radial, and the linear output is independent of the radial detector.
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
   * Max mean-Oklab fit error a ramp may have (growth + build). Lower = stricter,
   * so flat objects and messy regions are not merged into a gradient. Default
   * {@link MAX_RESIDUAL}.
   */
  maxResidual?: number
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
const MAX_RESIDUAL = 0.03
/** Fraction of position→color energy on the principal axis required (1-D linear ramp). */
const MIN_DIRECTIONALITY = 0.88
/** Total Oklab distance across the ramp below which the region is treated as flat. */
const MIN_COLOR_SPAN = 0.06
/** A ramp must merge at least this many quantized bands. */
const MIN_MEMBERS = 2
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
/** A radial center must sit within this many position std-devs of the region centroid. */
const CENTER_SANITY = 2.5
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

/** A linear ramp fitted from a moment vector: direction, per-channel line, error. */
interface RampFit {
  dx: number
  dy: number
  g0: [number, number, number]
  g1: [number, number, number]
  /** Mean Oklab distance of the pixels to the fitted ramp. */
  residual: number
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
 * Fit `color ≈ g0 + g1·(p·d)` over the pixels summarized by the moment vector at
 * `off`, choosing the position direction `d` of steepest color change. Returns
 * null when the region is too small or the fit is degenerate.
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

  // 1-D regression of each channel on the scalar s = d·p (moments only).
  const Ss = dx * m[off + 1] + dy * m[off + 2]
  const Sss = dx * dx * m[off + 3] + 2 * dx * dy * m[off + 4] + dy * dy * m[off + 5]
  const det2 = n * Sss - Ss * Ss
  if (Math.abs(det2) < 1e-9) return null
  const idet = 1 / det2

  const g0: [number, number, number] = [0, 0, 0]
  const g1: [number, number, number] = [0, 0, 0]
  let rss = 0
  for (let c = 0; c < 3; c++) {
    const Sc = m[off + 6 + c]
    const Scs = dx * m[off + 12 + 2 * c] + dy * m[off + 13 + 2 * c]
    const b0 = (Sss * Sc - Ss * Scs) * idet
    const b1 = (n * Scs - Ss * Sc) * idet
    g0[c] = b0
    g1[c] = b1
    rss += Math.max(0, m[off + 9 + c] - (b0 * Sc + b1 * Scs))
  }
  return { dx, dy, g0, g1, residual: Math.sqrt(rss * inv), directionality }
}

/** True when a fit is a growable linear ramp (1-D and straight enough to group). */
function isRamp(fit: RampFit | null, maxResidual: number): fit is RampFit {
  return fit !== null && fit.residual <= maxResidual && fit.directionality >= MIN_DIRECTIONALITY
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

/**
 * Greedily grow ramps: seed by descending area, then repeatedly add the adjacent
 * unclaimed band that keeps the union the tightest ramp under `accept` (which
 * returns a residual, or Infinity to reject). Members of an accepted super
 * (≥ MIN_MEMBERS, ≥ minArea) are marked in the shared `claimed` map; a failed
 * attempt claims nothing, leaving its labels for the next seed or phase.
 */
function growRamps(
  m: Float64Array,
  adj: readonly number[][],
  seeds: readonly number[],
  claimed: Int32Array,
  minArea: number,
  accept: (trial: Float64Array) => number,
): Super[] {
  const supers: Super[] = []
  const acc = new Float64Array(NM)
  const trial = new Float64Array(NM)
  for (const seed of seeds) {
    if (claimed[seed] >= 0) continue
    for (let j = 0; j < NM; j++) acc[j] = m[seed * NM + j]
    const members = [seed]
    const local = new Set<number>([seed])
    for (;;) {
      let best = -1
      let bestResidual = Infinity
      for (const mem of members) {
        for (const nb of adj[mem]) {
          if (claimed[nb] >= 0 || local.has(nb)) continue
          for (let j = 0; j < NM; j++) trial[j] = acc[j] + m[nb * NM + j]
          const res = accept(trial)
          if (res < bestResidual) {
            bestResidual = res
            best = nb
          }
        }
      }
      if (best < 0) break
      for (let j = 0; j < NM; j++) acc[j] += m[best * NM + j]
      members.push(best)
      local.add(best)
    }
    if (members.length < MIN_MEMBERS || acc[0] < minArea) continue
    let rep = members[0]
    for (const mem of members) if (mem < rep) rep = mem
    for (const mem of members) claimed[mem] = 1
    supers.push({ members: members.slice(), rep })
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
  const maxResidual = opts?.maxResidual ?? MAX_RESIDUAL
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

  // ---- two-phase growth: linear first, radial on the leftovers ----
  const claimed = new Int32Array(count).fill(-1)
  const linearSupers = growRamps(m, adj, seeds, claimed, minArea, (t) => {
    const f = fitRamp(t, 0)
    return isRamp(f, maxResidual) ? f.residual : Infinity
  })
  const radialSupers = growRamps(m, adj, seeds, claimed, minArea, (t) => {
    const f = fitRadial(t, 0)
    return isRadial(f) ? f.misfit : Infinity
  })
  if (linearSupers.length === 0 && radialSupers.length === 0) return { gradients }

  // ---- set up per-rep accumulators, decide model per super ----
  const repOf = new Int32Array(count).fill(-1)
  const meta = new Map<number, Meta>()
  const sacc = new Float64Array(NM)
  for (const s of linearSupers) {
    sumMembers(m, s.members, sacc)
    const fit = fitRamp(sacc, 0)
    if (!isRamp(fit, maxResidual)) continue
    for (const mem of s.members) repOf[mem] = s.rep
    meta.set(s.rep, {
      kind: 'linear',
      dx: fit.dx,
      dy: fit.dy,
      cx: sacc[1] / sacc[0],
      cy: sacc[2] / sacc[0],
      smin: Infinity,
      smax: -Infinity,
      bins: new Float64Array(BIN_COUNT * BIN_FIELDS),
    })
  }
  for (const s of radialSupers) {
    sumMembers(m, s.members, sacc)
    const fit = fitRadial(sacc, 0)
    if (!isRadial(fit)) continue
    for (const mem of s.members) repOf[mem] = s.rep
    meta.set(s.rep, {
      kind: 'radial',
      cx: fit.cx,
      cy: fit.cy,
      rmax: 0,
      bins: new Float64Array(BIN_COUNT * BIN_FIELDS),
    })
  }
  if (meta.size === 0) return { gradients }

  // ---- pass A: scalar extents (linear projection / radial radius) ----
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rep = repOf[data[y * width + x]]
      if (rep < 0) continue
      const info = meta.get(rep) as Meta
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

  // ---- pass B: bin the color profile along each model's scalar ----
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const rep = repOf[data[p]]
      if (rep < 0) continue
      const info = meta.get(rep) as Meta
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
      const L = ok[base]
      const A = ok[base + 1]
      const Bv = ok[base + 2]
      info.bins[b] += 1
      info.bins[b + 1] += L
      info.bins[b + 2] += A
      info.bins[b + 3] += Bv
      info.bins[b + 4] += L * L
      info.bins[b + 5] += A * A
      info.bins[b + 6] += Bv * Bv
    }
  }

  // ---- build paints from the profiles; relabel merged bands ----
  const finalRep = new Int32Array(count).fill(-1)
  for (const [rep, info] of meta) {
    const paint =
      info.kind === 'linear'
        ? buildLinear(info, maxResidual, minColorSpan)
        : buildRadial(info, maxResidual, minColorSpan)
    if (!paint) continue
    gradients[rep] = paint
    finalRep[rep] = rep
  }
  // Members share their rep's finalRep flag.
  for (const s of [...linearSupers, ...radialSupers]) {
    if (finalRep[s.rep] < 0) continue
    for (const mem of s.members) finalRep[mem] = s.rep
  }

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
 * not a ramp); or too little total color change (flat). A straight ramp collapses
 * back to 2 stops; a curved or bent one keeps the stops it needs (≤ MAX_STOPS).
 */
function profileToStops(
  bins: Float64Array,
  maxResidual: number,
  minColorSpan: number,
): Stop[] | null {
  const offs: number[] = []
  const cols: Lab[] = []
  let totalN = 0
  let withinVar = 0
  for (let i = 0; i < BIN_COUNT; i++) {
    const b = i * BIN_FIELDS
    const cnt = bins[b]
    if (cnt <= 0) continue
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
  if (Math.sqrt(withinVar / totalN) > maxResidual) return null
  const first = cols[0]
  const last = cols[np - 1]
  if (deltaEOk(first[0], first[1], first[2], last[0], last[1], last[2]) < minColorSpan) return null
  // Hard-edge guard: a step concentrates the whole color change in one jump.
  let path = 0
  let maxJump = 0
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
  }
  if (path <= 0 || maxJump > STEP_JUMP_FRAC * path) return null

  return simplifyProfile(offs, cols).map((i) => ({
    offset: offs[i],
    color: oklabToHex(cols[i][0], cols[i][1], cols[i][2]),
  }))
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

/** Build a linear gradient from its projected extent and binned color profile. */
function buildLinear(
  info: LinearMeta,
  maxResidual: number,
  minColorSpan: number,
): GradientPaint | null {
  if (!(info.smax - info.smin > 1e-6)) return null
  const stops = profileToStops(info.bins, maxResidual, minColorSpan)
  if (!stops) return null
  const { dx, dy, cx, cy, smin, smax } = info
  const sc = dx * cx + dy * cy
  return {
    kind: 'linear',
    x1: cx + (smin - sc) * dx,
    y1: cy + (smin - sc) * dy,
    x2: cx + (smax - sc) * dx,
    y2: cy + (smax - sc) * dy,
    stops,
  }
}

/** Build a radial gradient from its recovered center/radius and binned profile. */
function buildRadial(
  info: RadialMeta,
  maxResidual: number,
  minColorSpan: number,
): GradientPaint | null {
  if (!(info.rmax > 1e-6)) return null
  const stops = profileToStops(info.bins, maxResidual, minColorSpan)
  if (!stops) return null
  return { kind: 'radial', cx: info.cx, cy: info.cy, r: info.rmax, stops }
}
