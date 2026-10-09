/**
 * The fill fitters: flat, linear, circular radial and elliptical radial. Each
 * takes a region's samples and their colors in one fitting space and places one
 * model with two end stops, or none when the region cannot support it; scoring,
 * selection and interior stops happen in `select.ts` and `stops.ts`.
 *
 * Every ramp reduces to one-dimensional least squares once its geometry is
 * fixed: a coordinate `t` per sample (along an axis, or from a center) and a line
 * `color = a + g·t` per channel ({@link fit1d}). The fitters differ in how they
 * search the geometry that makes that line fit best. Positions and fitted
 * points are in the fitting frame (pixel centers at integer indices, see
 * `samples.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/fit.rs` (`fit_1d`,
 * `SPLINE_KNOTS`, `Resid1d` with `radial`, `elliptic`, `finish`, `finish_spline`,
 * `fit_flat`, `fit_linear`, `color_axis`, `gradient_line_centre`, `fit_radial`,
 * `MAX_ASPECT`, `fit_radial_elliptic`, `restop_radial`).
 */

import { fromSpace, MIN_GRADIENT_PIXELS } from './model'
import type { FillModel, Interp, RadialFill } from './model'
import { CENTRE_SEARCH_SAMPLES, centroid, fitStride, mean3, sampleAt } from './samples'
import type { Samples } from './samples'

/** Radians per degree, as `f64::to_radians` multiplies. */
export const RADS_PER_DEG = Math.PI / 180

/** Largest aspect an elliptical gradient may take; beyond it the gradient is, across any region it could fill, a linear one. */
export const MAX_ASPECT = 8

/**
 * Knots of the spline profile score ({@link Resid1d.finishSpline}), uniform over
 * the range of `t`: seven pieces, enough to bend at a clamp and at both ends of
 * a bump.
 */
export const SPLINE_KNOTS = 8

/** `a` and `b`'s larger, ignoring a NaN (Rust's `f64::max`). */
export function fmax(a: number, b: number): number {
  return a > b || Number.isNaN(b) ? a : b
}

/** `a` and `b`'s smaller, ignoring a NaN (Rust's `f64::min`). */
export function fmin(a: number, b: number): number {
  return a < b || Number.isNaN(b) ? a : b
}

/** A one-dimensional line fit: its residual summed over the channels, intercept `a` and slope `g`. */
export interface LineFit {
  resid: number
  a: [number, number, number]
  g: [number, number, number]
}

/**
 * Least squares of `color = a + g·t` per channel over `n` samples (colors three
 * per sample), on centered moments: `g = S_tc / S_tt`, `a = c̄ − g·t̄`, residual
 * `Σ_ch max(S_cc − g²·S_tt, 0)`. With no spread in `t` (`S_tt ≤ 1e-12`) the slope
 * is 0 and the line is the mean color.
 */
export function fit1d(cols: Float64Array, t: Float64Array, n: number): LineFit {
  let tsum = 0
  for (let i = 0; i < n; i++) tsum += t[i]
  const tbar = tsum / n
  const cbar = mean3(cols, n)
  let stt = 0
  const stc = [0, 0, 0]
  const scc = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const dt = t[i] - tbar
    stt += dt * dt
    for (let k = 0; k < 3; k++) {
      const dc = cols[3 * i + k] - cbar[k]
      stc[k] += dt * dc
      scc[k] += dc * dc
    }
  }
  const a: [number, number, number] = [0, 0, 0]
  const g: [number, number, number] = [0, 0, 0]
  let resid = 0
  for (let k = 0; k < 3; k++) {
    g[k] = stt > 1e-12 ? stc[k] / stt : 0
    a[k] = cbar[k] - g[k] * tbar
    resid += fmax(scc[k] - g[k] * g[k] * stt, 0)
  }
  return { resid, a, g }
}

/**
 * The geometry-free half of {@link fit1d} formed once for a search over many
 * geometries: the subsample's positions, colors, mean color and per-channel
 * color variance, and a buffer for the current `t`. Every residual is the one
 * `fit1d` would give on the same subsample.
 */
export class Resid1d {
  readonly xs: Float64Array
  readonly ys: Float64Array
  /** Subsample colors in the fitting space, three per sample. */
  readonly cols: Float64Array
  readonly cbar: [number, number, number]
  readonly scc: [number, number, number]
  /** The geometric coordinate of each sample for the current candidate. */
  readonly t: Float64Array

  /** Over the samples `idx` of `s`, with their colors `cols` (three per entry of `idx`). */
  constructor(s: Samples, idx: ArrayLike<number>, cols: Float64Array) {
    const m = idx.length
    this.cols = cols
    this.cbar = mean3(cols, m)
    const scc: [number, number, number] = [0, 0, 0]
    for (let i = 0; i < m; i++) {
      for (let k = 0; k < 3; k++) {
        const dc = cols[3 * i + k] - this.cbar[k]
        scc[k] += dc * dc
      }
    }
    this.scc = scc
    this.xs = new Float64Array(m)
    this.ys = new Float64Array(m)
    for (let j = 0; j < m; j++) {
      this.xs[j] = s.x[idx[j]]
      this.ys[j] = s.y[idx[j]]
    }
    this.t = new Float64Array(m)
  }

  /** The line residual with `t_i = |P_i − c|`: what a circular gradient centered at `c` leaves. */
  radial(cx: number, cy: number): number {
    const t = this.t
    for (let j = 0; j < t.length; j++) {
      const dx = this.xs[j] - cx
      const dy = this.ys[j] - cy
      t[j] = Math.sqrt(dx * dx + dy * dy)
    }
    return this.finish()
  }

  /**
   * The line residual with `t_i` the elliptical distance about `c` in the frame
   * `(sin, cos, aspect k)`: `u = dx·cos + dy·sin`, `v = (−dx·sin + dy·cos)·k`, `t = √(u² + v²)`.
   */
  elliptic(cx: number, cy: number, sn: number, cs: number, k: number): number {
    this.ellipticT(cx, cy, sn, cs, k)
    return this.finish()
  }

  /** Fill {@link Resid1d.t} with the elliptical distances of {@link Resid1d.elliptic}. */
  ellipticT(cx: number, cy: number, sn: number, cs: number, k: number): void {
    const t = this.t
    for (let j = 0; j < t.length; j++) {
      const dx = this.xs[j] - cx
      const dy = this.ys[j] - cy
      const u = dx * cs + dy * sn
      const v = (-dx * sn + dy * cs) * k
      t[j] = Math.sqrt(u * u + v * v)
    }
  }

  /** The residual of the least-squares line through `(t, color)`: `Σ_ch max(S_cc − S_tc²/S_tt, 0)`. */
  finish(): number {
    const t = this.t
    const n = t.length
    let tsum = 0
    for (let j = 0; j < n; j++) tsum += t[j]
    const tbar = tsum / n
    let stt = 0
    let stc0 = 0
    let stc1 = 0
    let stc2 = 0
    const c = this.cols
    const [m0, m1, m2] = this.cbar
    for (let j = 0; j < n; j++) {
      const dt = t[j] - tbar
      stt += dt * dt
      stc0 += dt * (c[3 * j] - m0)
      stc1 += dt * (c[3 * j + 1] - m1)
      stc2 += dt * (c[3 * j + 2] - m2)
    }
    const stc = [stc0, stc1, stc2]
    let resid = 0
    for (let k = 0; k < 3; k++) {
      const g = stt > 1e-12 ? stc[k] / stt : 0
      resid += fmax(this.scc[k] - g * g * stt, 0)
    }
    return resid
  }

  /**
   * The residual of the least-squares continuous piecewise-linear profile through
   * `(t, color)`, with {@link SPLINE_KNOTS} uniform knots over the range of `t`:
   * the variable-projection functional (Golub & Pereyra 1973) of the hat basis.
   * The tridiagonal normal equations (1e-9 ridge on the diagonal) are solved per
   * channel by the Thomas algorithm, and the residual is `Σ_ch (S_cc − xᵀb)`,
   * clamped at 0. All `t` equal gives the total variance.
   */
  finishSpline(): number {
    const K = SPLINE_KNOTS
    const total = this.scc[0] + this.scc[1] + this.scc[2]
    const t = this.t
    let lo = Number.MAX_VALUE
    let hi = -Number.MAX_VALUE
    for (let j = 0; j < t.length; j++) {
      lo = fmin(lo, t[j])
      hi = fmax(hi, t[j])
    }
    if (hi - lo <= 1e-9) return total
    const h = (hi - lo) / (K - 1)
    const uMax = K - 1 - 1e-12
    const d = new Float64Array(K)
    const e = new Float64Array(K)
    const b = new Float64Array(3 * K)
    const c = this.cols
    for (let i = 0; i < t.length; i++) {
      const u = fmin((t[i] - lo) / h, uMax)
      const j = u > 0 ? Math.floor(u) : 0
      const f = u - j
      const w0 = 1 - f
      const w1 = f
      d[j] += w0 * w0
      d[j + 1] += w1 * w1
      e[j] += w0 * w1
      for (let ch = 0; ch < 3; ch++) {
        const dc = c[3 * i + ch] - this.cbar[ch]
        b[3 * j + ch] += w0 * dc
        b[3 * (j + 1) + ch] += w1 * dc
      }
    }
    for (let i = 0; i < K; i++) d[i] += 1e-9
    const cp = new Float64Array(K)
    const m = new Float64Array(K)
    m[0] = d[0]
    cp[0] = e[0] / m[0]
    for (let i = 1; i < K; i++) {
      m[i] = d[i] - e[i - 1] * cp[i - 1]
      cp[i] = i + 1 < K ? e[i] / m[i] : 0
    }
    let explained = 0
    const dp = new Float64Array(K)
    const x = new Float64Array(K)
    for (let ch = 0; ch < 3; ch++) {
      dp[0] = b[ch] / m[0]
      for (let i = 1; i < K; i++) dp[i] = (b[3 * i + ch] - e[i - 1] * dp[i - 1]) / m[i]
      x[K - 1] = dp[K - 1]
      for (let i = K - 2; i >= 0; i--) x[i] = dp[i] - cp[i] * x[i + 1]
      for (let i = 0; i < K; i++) explained += x[i] * b[3 * i + ch]
    }
    return fmax(total - explained, 0)
  }
}

/**
 * The flat fill: the per-channel median of the samples' sRGB colors over the
 * strided subsample (the sRGB residual's robust optimum: a minority of outliers,
 * blends the evidence test let through or a lost dot, cannot move it). No
 * samples gives black.
 */
export function fitFlat(s: Samples): FillModel {
  const n = s.n
  if (n === 0) return { kind: 'flat', color: [0, 0, 0] }
  const stride = fitStride(n)
  const m = Math.ceil(n / stride)
  const v = new Float32Array(m)
  const c: [number, number, number] = [0, 0, 0]
  for (let k = 0; k < 3; k++) {
    for (let j = 0; j < m; j++) v[j] = s.srgb[3 * j * stride + k]
    v.sort()
    c[k] = v[m >> 1]
  }
  return { kind: 'flat', color: c }
}

/**
 * Linear gradient: axis by PCA of the color-versus-position slopes, refined by
 * an angle scan and golden-section search on the exact 1-D residual, stops by
 * least squares.
 *
 * With positions centered on the centroid and colors on their mean: second
 * moments `Sxx, Sxy, Syy` and `Sxc, Syc, Scc` per channel; the affine slope per
 * channel `(Bx, By) = [Sxx Sxy; Sxy Syy]⁻¹(Sxc, Syc)`; the seed angle
 * `θ0 = ½·atan2(2·M01, M00 − M11)` of `M = Σ_ch BᵀB`; the residual along
 * `d = (cos θ, sin θ)`, `R(θ) = Σ Scc − Σ_ch (d·(Sxc, Syc))² / (dᵀSd)`; a scan of
 * `θ0 ± 45°` in 1° steps and 40 golden-section steps within ±1° of the best. The
 * stops are the line at the extreme projections, and the axis runs between those
 * points. Null below {@link MIN_GRADIENT_PIXELS} samples, for collinear positions,
 * or when the projections have no spread.
 */
export function fitLinear(s: Samples, cols: Float64Array, space: Interp): FillModel | null {
  const n = s.n
  if (n < MIN_GRADIENT_PIXELS) return null
  const [xc, yc] = centroid(s)
  const cbar = mean3(cols, n)
  let sxx = 0
  let sxy = 0
  let syy = 0
  const sxc = [0, 0, 0]
  const syc = [0, 0, 0]
  const scc = [0, 0, 0]
  for (let i = 0; i < n; i++) {
    const dx = s.x[i] - xc
    const dy = s.y[i] - yc
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
    for (let k = 0; k < 3; k++) {
      const dc = cols[3 * i + k] - cbar[k]
      sxc[k] += dx * dc
      syc[k] += dy * dc
      scc[k] += dc * dc
    }
  }
  const det = sxx * syy - sxy * sxy
  const tr = sxx + syy
  if (det <= 1e-9 * (tr * tr)) return null

  let m00 = 0
  let m01 = 0
  let m11 = 0
  for (let k = 0; k < 3; k++) {
    const bx = (syy * sxc[k] - sxy * syc[k]) / det
    const by = (sxx * syc[k] - sxy * sxc[k]) / det
    m00 += bx * bx
    m01 += bx * by
    m11 += by * by
  }
  const theta0 = 0.5 * Math.atan2(2 * m01, m00 - m11)
  const sccTotal = scc[0] + scc[1] + scc[2]

  const resid = (theta: number): number => {
    const c = Math.cos(theta)
    const sn = Math.sin(theta)
    const sss = c * c * sxx + 2 * c * sn * sxy + sn * sn * syy
    if (sss <= 1e-12) return Number.MAX_VALUE
    let explained = 0
    for (let k = 0; k < 3; k++) {
      const ssc = c * sxc[k] + sn * syc[k]
      explained += (ssc * ssc) / sss
    }
    return sccTotal - explained
  }

  const deg = RADS_PER_DEG
  let bestTh = theta0
  let bestR = resid(theta0)
  for (let k = -45; k <= 45; k++) {
    const th = theta0 + k * deg
    const r = resid(th)
    if (r < bestR) {
      bestTh = th
      bestR = r
    }
  }
  let lo = bestTh - deg
  let hi = bestTh + deg
  const phi = 0.5 * (Math.sqrt(5) - 1)
  let a = hi - phi * (hi - lo)
  let b = lo + phi * (hi - lo)
  let fa = resid(a)
  let fb = resid(b)
  for (let it = 0; it < 40; it++) {
    if (fa < fb) {
      hi = b
      b = a
      fb = fa
      a = hi - phi * (hi - lo)
      fa = resid(a)
    } else {
      lo = a
      a = b
      fa = fb
      b = lo + phi * (hi - lo)
      fb = resid(b)
    }
  }
  const theta = 0.5 * (lo + hi)
  const dc = Math.cos(theta)
  const ds = Math.sin(theta)

  const t = new Float64Array(n)
  let smin = Number.MAX_VALUE
  let smax = -Number.MAX_VALUE
  for (let i = 0; i < n; i++) {
    t[i] = (s.x[i] - xc) * dc + (s.y[i] - yc) * ds
    smin = fmin(smin, t[i])
    smax = fmax(smax, t[i])
  }
  if (smax - smin < 1e-6) return null
  const line = fit1d(cols, t, n)
  const at = (sv: number): number[] => [
    line.a[0] + line.g[0] * sv,
    line.a[1] + line.g[1] * sv,
    line.a[2] + line.g[2] * sv,
  ]
  return {
    kind: 'linear',
    p0: [xc + smin * dc, yc + smin * ds],
    p1: [xc + smax * dc, yc + smax * ds],
    c0: fromSpace(at(smin), space),
    c1: fromSpace(at(smax), space),
    interp: space,
    mids: [],
  }
}

/**
 * Principal direction of `n` colors (three per entry), by thirty rounds of power
 * iteration on their scatter matrix from the gray direction. A unit vector of
 * arbitrary sign; null with no variance (trace ≤ 1e-12) or when the iterate
 * collapses.
 */
export function colorAxis(cols: Float64Array, n: number): [number, number, number] | null {
  const cbar = mean3(cols, n)
  const cov = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]
  for (let p = 0; p < n; p++) {
    const d = [cols[3 * p] - cbar[0], cols[3 * p + 1] - cbar[1], cols[3 * p + 2] - cbar[2]]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) cov[i][j] += d[i] * d[j]
  }
  const trace = cov[0][0] + cov[1][1] + cov[2][2]
  if (trace <= 1e-12) return null
  const s0 = 1 / Math.sqrt(3)
  let v: [number, number, number] = [s0, s0, s0]
  for (let it = 0; it < 30; it++) {
    const nv = [0, 0, 0]
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) nv[i] += cov[i][j] * v[j]
    const norm = Math.sqrt(nv[0] * nv[0] + nv[1] * nv[1] + nv[2] * nv[2])
    if (norm <= 1e-15) return null
    v = [nv[0] / norm, nv[1] / norm, nv[2] / norm]
  }
  return v
}

/**
 * The weighted least-squares point nearest every gradient line of the scalar
 * field `f` (one value per sample): with `g_i` the central difference of `f` at
 * a sample whose four neighbors are samples, and `n_i = (−g_y, g_x)/|g_i|`, the
 * point minimizing `Σ |g_i| (n_i·(C − P_i))²`, a 2×2 solve over the scoring
 * subsample. Null when the system is near singular (`det ≤ 1e-9·trace²`): all
 * lines parallel, or none. `w` is the image width.
 */
export function gradientLineCentre(
  s: Samples,
  f: Float64Array,
  w: number,
): [number, number] | null {
  const n = s.n
  let a00 = 0
  let a01 = 0
  let a11 = 0
  let b0 = 0
  let b1 = 0
  const stride = fitStride(n)
  for (let i = 0; i < n; i += stride) {
    const p = s.px[i]
    if (p % w === 0 || p < w) continue
    const l = sampleAt(s, p - 1)
    const r = sampleAt(s, p + 1)
    const u = sampleAt(s, p - w)
    const d = sampleAt(s, p + w)
    if (l < 0 || r < 0 || u < 0 || d < 0) continue
    const gx = 0.5 * (f[r] - f[l])
    const gy = 0.5 * (f[d] - f[u])
    const mag = Math.sqrt(gx * gx + gy * gy)
    if (mag <= 1e-9) continue
    const nx = -gy / mag
    const ny = gx / mag
    const rhs = nx * s.x[i] + ny * s.y[i]
    a00 += mag * nx * nx
    a01 += mag * nx * ny
    a11 += mag * ny * ny
    b0 += mag * nx * rhs
    b1 += mag * ny * rhs
  }
  const det = a00 * a11 - a01 * a01
  const tr = a00 + a11
  if (det > 1e-9 * (tr * tr)) return [(a11 * b0 - a01 * b1) / det, (a00 * b1 - a01 * b0) / det]
  return null
}

/** The bounding box of the sample positions, each side at least 4 px: the box a center may leave the region by. */
export interface SearchBox {
  xmin: number
  xmax: number
  ymin: number
  ymax: number
  bw: number
  bh: number
}

/** The {@link SearchBox} of `s`. */
export function searchBox(s: Samples): SearchBox {
  let xmin = Number.MAX_VALUE
  let xmax = -Number.MAX_VALUE
  let ymin = Number.MAX_VALUE
  let ymax = -Number.MAX_VALUE
  for (let i = 0; i < s.n; i++) xmin = fmin(xmin, s.x[i])
  for (let i = 0; i < s.n; i++) xmax = fmax(xmax, s.x[i])
  for (let i = 0; i < s.n; i++) ymin = fmin(ymin, s.y[i])
  for (let i = 0; i < s.n; i++) ymax = fmax(ymax, s.y[i])
  return { xmin, xmax, ymin, ymax, bw: fmax(xmax - xmin, 4), bh: fmax(ymax - ymin, 4) }
}

/** `v` clamped to `[lo, hi]` (Rust's `f64::clamp`). */
function clampTo(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

/** A center kept within one bounding-box size of the region. */
export function clampCentre(b: SearchBox, x: number, y: number): [number, number] {
  return [clampTo(x, b.xmin - b.bw, b.xmax + b.bw), clampTo(y, b.ymin - b.bh, b.ymax + b.bh)]
}

/** The strided center-search subsample of `n` samples (at most {@link CENTRE_SEARCH_SAMPLES}) and its colors. */
export function centreSubsample(
  n: number,
  cols: Float64Array,
): { idx: Int32Array; cols: Float64Array } {
  const cstride = Math.max(Math.floor(n / CENTRE_SEARCH_SAMPLES), 1)
  const m = n > 0 ? Math.ceil(n / cstride) : 0
  const idx = new Int32Array(m)
  const sub = new Float64Array(3 * m)
  for (let j = 0; j < m; j++) {
    const i = j * cstride
    idx[j] = i
    sub[3 * j] = cols[3 * i]
    sub[3 * j + 1] = cols[3 * i + 1]
    sub[3 * j + 2] = cols[3 * i + 2]
  }
  return { idx, cols: sub }
}

/** The colors of `n` samples projected on `axis`. */
export function projectColors(
  cols: Float64Array,
  n: number,
  axis: readonly number[],
): Float64Array {
  const f = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    f[i] = cols[3 * i] * axis[0] + cols[3 * i + 1] * axis[1] + cols[3 * i + 2] * axis[2]
  }
  return f
}

/** The compass directions of the center search, in the order tried. */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/** Elliptical distances of every sample from `(cx, cy)` in the frame `(sn, cs, aspect)` (Euclidean for aspect 1), and their maximum. */
function radii(
  s: Samples,
  cx: number,
  cy: number,
  aspect: number,
  sn: number,
  cs: number,
): { rho: Float64Array; r: number } {
  const rho = new Float64Array(s.n)
  let r = -Number.MAX_VALUE
  for (let i = 0; i < s.n; i++) {
    const dx = s.x[i] - cx
    const dy = s.y[i] - cy
    if (aspect === 1) {
      rho[i] = Math.sqrt(dx * dx + dy * dy)
    } else {
      const u = dx * cs + dy * sn
      const v = (-dx * sn + dy * cs) * aspect
      rho[i] = Math.sqrt(u * u + v * v)
    }
    r = fmax(r, rho[i])
  }
  return { rho, r }
}

/** A radial model on a geometry, its stops the least-squares line in `space` at `ρ = 0` and `ρ = r`. */
function radialOn(
  cols: Float64Array,
  n: number,
  space: Interp,
  c: readonly [number, number],
  rho: Float64Array,
  r: number,
  aspect: number,
  angle: number,
): RadialFill {
  const { a, g } = fit1d(cols, rho, n)
  return {
    kind: 'radial',
    c: [c[0], c[1]],
    r,
    c0: fromSpace(a, space),
    c1: fromSpace([a[0] + g[0] * r, a[1] + g[1] * r, a[2] + g[2] * r], space),
    interp: space,
    aspect,
    angle,
    mids: [],
  }
}

/**
 * Circular radial gradient: the center from the weighted least-squares
 * intersection of the gradient lines of the colors' principal axis (the
 * centroid when they are parallel), clamped to within one bounding-box size of
 * the region, then a compass search on the exact 1-D residual: steps of 4 px
 * along the eight directions, the first improvement (by more than 1e-12) taken,
 * the step halved when none improves, down to 0.03 px or 600 evaluations, each on
 * at most {@link CENTRE_SEARCH_SAMPLES} samples. The radius is the farthest
 * sample. Null below {@link MIN_GRADIENT_PIXELS} samples, without color variance,
 * or under a 0.5 px radius.
 */
export function fitRadial(
  s: Samples,
  cols: Float64Array,
  space: Interp,
  w: number,
): RadialFill | null {
  const n = s.n
  if (n < MIN_GRADIENT_PIXELS) return null
  const axis = colorAxis(cols, n)
  if (axis === null) return null
  const f = projectColors(cols, n, axis)
  const box = searchBox(s)
  let c = gradientLineCentre(s, f, w) ?? centroid(s)
  c = clampCentre(box, c[0], c[1])

  const sub = centreSubsample(n, cols)
  const rz = new Resid1d(s, sub.idx, sub.cols)
  let best = rz.radial(c[0], c[1])
  let step = 4
  let evals = 0
  while (step > 0.03 && evals < 600) {
    let improved = false
    for (const [dx, dy] of DIRS) {
      const cand = clampCentre(box, c[0] + dx * step, c[1] + dy * step)
      const r = rz.radial(cand[0], cand[1])
      evals++
      if (r < best - 1e-12) {
        best = r
        c = cand
        improved = true
        break
      }
    }
    if (!improved) step *= 0.5
  }

  const { rho, r } = radii(s, c[0], c[1], 1, 0, 1)
  if (r < 0.5) return null
  return radialOn(cols, n, space, c, rho, r, 1, 0)
}

/**
 * Elliptical radial gradient from the circular fit's center: an orientation
 * sweep every 15° at aspects 2 and 3, then a compass search over
 * `(cx, cy, angle, ln aspect)` with scales `(1 px, 1 px, 10°, 0.25)`, from step 4
 * down to 0.03 or 800 evaluations, the center within one bounding-box size and
 * `ln aspect` in `[0, ln 8]`. Null when `circular` is not a radial model, below
 * `2·MIN_GRADIENT_PIXELS` samples, at an aspect under 1.02 (the circle has it),
 * or under a 0.5 px radius.
 */
export function fitRadialElliptic(
  s: Samples,
  cols: Float64Array,
  space: Interp,
  circular: FillModel,
): RadialFill | null {
  if (circular.kind !== 'radial') return null
  const n = s.n
  if (n < 2 * MIN_GRADIENT_PIXELS) return null
  const sub = centreSubsample(n, cols)
  const rz = new Resid1d(s, sub.idx, sub.cols)
  const box = searchBox(s)
  const lnMax = Math.log(MAX_ASPECT)
  const clamp = (st: readonly number[]): number[] => {
    const [x, y] = clampCentre(box, st[0], st[1])
    return [x, y, st[2], clampTo(st[3], 0, lnMax)]
  }
  const resid = (st: readonly number[]): number =>
    rz.elliptic(st[0], st[1], Math.sin(st[2]), Math.cos(st[2]), Math.exp(st[3]))

  let st = [circular.c[0], circular.c[1], 0, 0]
  let best = resid(st)
  for (let deg = 0; deg < 180; deg += 15) {
    for (const la of [Math.log(2), Math.log(3)]) {
      const cand = clamp([st[0], st[1], deg * RADS_PER_DEG, la])
      const r = resid(cand)
      if (r < best - 1e-12) {
        best = r
        st = cand
      }
    }
  }
  const scale = [1, 1, 10 * RADS_PER_DEG, 0.25]
  let step = 4
  let evals = 0
  while (step > 0.03 && evals < 800) {
    let improved = false
    search: for (let ax = 0; ax < 4; ax++) {
      for (const sign of [1, -1]) {
        const moved = st.slice()
        moved[ax] += sign * step * scale[ax]
        const cand = clamp(moved)
        const r = resid(cand)
        evals++
        if (r < best - 1e-12) {
          best = r
          st = cand
          improved = true
          break search
        }
      }
    }
    if (!improved) step *= 0.5
  }
  const aspect = Math.exp(st[3])
  if (aspect < 1.02) return null
  const { rho, r } = radii(s, st[0], st[1], aspect, Math.sin(st[2]), Math.cos(st[2]))
  if (r < 0.5) return null
  return radialOn(cols, n, space, [st[0], st[1]], rho, r, aspect, st[2])
}

/**
 * A radial geometry found by a search (`geometry`) with its radius and two stops
 * refitted in another space: `ρ_i` under the geometry, `r = max ρ_i`, and the
 * least-squares line in `space`. Null for a non-radial model or a radius under
 * 0.5 px.
 */
export function restopRadial(
  s: Samples,
  cols: Float64Array,
  space: Interp,
  geometry: FillModel,
): RadialFill | null {
  if (geometry.kind !== 'radial') return null
  const { c, aspect, angle } = geometry
  const sn = aspect === 1 ? 0 : Math.sin(angle)
  const cs = aspect === 1 ? 1 : Math.cos(angle)
  const { rho, r } = radii(s, c[0], c[1], aspect, sn, cs)
  if (r < 0.5) return null
  return radialOn(cols, s.n, space, c, rho, r, aspect, angle)
}
