/**
 * The profile-aware radial search: circular and elliptical gradient geometries
 * placed under a clamped color profile (a flat core and a ramp at the rim, or a
 * bump on a pad), not under a straight one.
 *
 * A radial gradient is `color = s(t(x; θ))`: the geometry `θ` (center, and for
 * an ellipse its angle and `ln` aspect) maps each sample to `t`, the profile `s`
 * maps `t` to color. The line-scored fitters choose `θ` under a straight
 * profile; here the geometry is searched a second time under a continuous
 * piecewise-linear profile with {@link SPLINE_KNOTS} uniform knots over the range
 * of `t`, linear in its knot values once `θ` is fixed. Variable projection
 * eliminates the knot values in closed form and leaves `F(θ) = ‖P⊥(θ)·C‖²`,
 * exactly {@link Resid1d.finishSpline}. The geometries found are offered as
 * extra candidates (re-stopped per fitting space by `restopRadial`).
 *
 * The search: the gradient-line seed of `fitRadial` (the centroid when the lines
 * are parallel), clamped to within one bounding-box size of the region;
 * Levenberg–Marquardt over the center; then the orientation sweep of
 * `fitRadialElliptic` about it and Levenberg–Marquardt over all four
 * coordinates, kept from an aspect of 1.02.
 *
 * Method from: L. Kaufman (1975), A variable projection method for solving
 * separable nonlinear least squares problems, BIT 15(1):49–57,
 * doi:10.1007/BF01932995 — the Gauss–Newton step with `J = −P⊥·(∂A/∂θ)·X`, whose
 * gradient `∇F = −2·Dᵀr` is exact; G. H. Golub, V. Pereyra (1973), SIAM J. Numer.
 * Anal. 10(2):413–432, doi:10.1137/0710036, for the functional; K. Levenberg
 * (1944), doi:10.1090/qam/10666, and D. W. Marquardt (1963),
 * doi:10.1137/0111030, for the damping, scaled by the diagonal so pixels,
 * radians and `ln` aspect need no common unit. Adapted: `∂A/∂θ` follows the hat
 * basis and the knots' stretch with the range of `t`; `P⊥·D` is never formed
 * (`Dᵀ·P⊥·D = DᵀD − (AᵀD)ᵀ(AᵀA)⁻¹(AᵀD)` with the tridiagonal `AᵀA`). Inspired by
 * S. Chakraborty et al. (2025), Image Vectorization via Gradient Reconstruction,
 * Computer Graphics Forum 44(2), doi:10.1111/cgf.70055, §3.3.
 *
 * Geometries are in the fitting frame (pixel centers at integer indices, see
 * `samples.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/fit/profile.rs`
 * (`profile_geometries`, `SplineFit`, `piece`, `thomas`, `solve_small`, `score_at`,
 * `spline_fit`, `dt`, `kaufman_system`, `refine_spline`, the `LM_*` constants).
 */

import { MIN_GRADIENT_PIXELS } from './model'
import type { RadialFill } from './model'
import {
  centreSubsample,
  clampCentre,
  colorAxis,
  fmax,
  gradientLineCentre,
  MAX_ASPECT,
  projectColors,
  RADS_PER_DEG,
  Resid1d,
  searchBox,
  SPLINE_KNOTS,
} from './fit'
import { centroid } from './samples'
import type { Samples } from './samples'

/** Most score evaluations of one refinement, trial steps included. */
export const LM_MAX_EVALS = 60
/** An accepted step lowering the score by at most this fraction of it ends the refinement. */
export const LM_REL_TOL = 1e-9
/** The damping at which the refinement gives up looking for a lower score. */
export const LM_MU_MAX = 1e10
/** An accepted step smaller than this in every coordinate (center px, angle rad, `ln` aspect) ends the refinement. */
export const LM_STEP_TOL: readonly number[] = [0.01, 0.01, 1e-3, 1e-3]

/** A radial geometry: center x, center y (px), angle (rad), `ln` aspect. */
export type Geom = [number, number, number, number]

const K = SPLINE_KNOTS
/** The smallest positive normal double (Rust's `f64::MIN_POSITIVE`). */
const F64_MIN_POSITIVE = 2.2250738585072014e-308

/** The spline fit at the current `t`: knot range (and the samples attaining it), knot values and the factored normal matrix. */
interface SplineFit {
  lo: number
  loAt: number
  hi: number
  hiAt: number
  h: number
  /** Knot values per channel (centered colors), three per knot. */
  x: Float64Array
  /** Thomas pivots of `AᵀA` (ridge included). */
  m: Float64Array
  /** Thomas upper coefficients. */
  cp: Float64Array
  /** Off-diagonal of `AᵀA`. */
  e: Float64Array
}

/**
 * The profile-aware circular and elliptical geometries of the samples (colors
 * `cols` in the space the search runs in; `w` the image width, for the seed),
 * as radial models whose center, aspect and angle are the search's and whose
 * radius and stops are placeholders. Empty below {@link MIN_GRADIENT_PIXELS}
 * samples or without color variance; no circle under a 0.5 px radius (and then
 * no ellipse); no ellipse below `2·MIN_GRADIENT_PIXELS` samples, under an aspect
 * of 1.02, or under a 0.5 px radius.
 */
export function profileGeometries(s: Samples, cols: Float64Array, w: number): RadialFill[] {
  const n = s.n
  if (n < MIN_GRADIENT_PIXELS) return []
  const axis = colorAxis(cols, n)
  if (axis === null) return []
  const seed = gradientLineCentre(s, projectColors(cols, n, axis), w) ?? centroid(s)
  const box = searchBox(s)
  const lnMax = Math.log(MAX_ASPECT)
  const clamp = (g: Geom): Geom => {
    const [x, y] = clampCentre(box, g[0], g[1])
    return [x, y, g[2], g[3] < 0 ? 0 : g[3] > lnMax ? lnMax : g[3]]
  }
  const sub = centreSubsample(n, cols)
  const rz = new Resid1d(s, sub.idx, sub.cols)
  const radius = (g: Geom): number => {
    const sn = Math.sin(g[2])
    const cs = Math.cos(g[2])
    const k = Math.exp(g[3])
    let r = -Number.MAX_VALUE
    for (let i = 0; i < n; i++) {
      const dx = s.x[i] - g[0]
      const dy = s.y[i] - g[1]
      const u = dx * cs + dy * sn
      const v = (-dx * sn + dy * cs) * k
      r = fmax(r, Math.sqrt(u * u + v * v))
    }
    return r
  }
  const start = clamp([seed[0], seed[1], 0, 0])
  const circleBox = (g: Geom): Geom => {
    const q = clamp(g)
    return [q[0], q[1], 0, 0]
  }
  const circle = refineSpline(rz, start, 2, circleBox).g
  if (radius(circle) < 0.5) return []
  const out = [asModel(circle)]
  if (n < 2 * MIN_GRADIENT_PIXELS) return out
  let st = clamp(circle)
  let best = scoreAt(rz, st)
  for (let deg = 0; deg < 180; deg += 15) {
    for (const la of [Math.log(2), Math.log(3)]) {
      const cand = clamp([st[0], st[1], deg * RADS_PER_DEG, la])
      const r = scoreAt(rz, cand)
      if (r < best - 1e-12) {
        best = r
        st = cand
      }
    }
  }
  const ellipse = refineSpline(rz, st, 4, clamp).g
  if (Math.exp(ellipse[3]) >= 1.02 && radius(ellipse) >= 0.5) out.push(asModel(ellipse))
  return out
}

/** A searched geometry as a radial model whose radius and stops are placeholders. */
function asModel(g: Geom): RadialFill {
  return {
    kind: 'radial',
    c: [g[0], g[1]],
    r: 1,
    c0: [0, 0, 0],
    c1: [0, 0, 0],
    interp: 'srgb',
    aspect: Math.exp(g[3]),
    angle: g[2],
    mids: [],
  }
}

/**
 * Knot coordinate `u = j + f` of `t` in `lo..lo + (K − 1)·h` (piece `j = ⌊u⌋`,
 * fraction `f`), held just under `K − 1` so `t = hi` falls in the last piece at
 * `f = 1`.
 */
function knotCoordinate(t: number, lo: number, h: number): number {
  const uMax = K - 1 - 1e-12
  const q = (t - lo) / h
  return q < uMax ? q : uMax
}

/** The piece of knot coordinate `u`. */
function pieceOf(u: number): number {
  return u > 0 ? Math.floor(u) : 0
}

/** Solve `AᵀA·z = b` by the Thomas algorithm with the pivots of `fit`. */
function thomas(fit: SplineFit, b: ArrayLike<number>): Float64Array {
  const dp = new Float64Array(K)
  dp[0] = b[0] / fit.m[0]
  for (let i = 1; i < K; i++) dp[i] = (b[i] - fit.e[i - 1] * dp[i - 1]) / fit.m[i]
  const z = new Float64Array(K)
  z[K - 1] = dp[K - 1]
  for (let i = K - 2; i >= 0; i--) z[i] = dp[i] - fit.cp[i] * z[i + 1]
  return z
}

/** Whether `a ≥ b` in IEEE total order on non-negative values (a NaN is the largest). */
function totalGe(a: number, b: number): boolean {
  if (Number.isNaN(a)) return true
  if (Number.isNaN(b)) return false
  return a >= b
}

/**
 * Solve the `p × p` system `a·δ = b` (`p ≤ 4`) by Gaussian elimination with
 * partial pivoting (the last of equal pivots). Null when a pivot vanishes
 * relative to the largest diagonal, or the solution is not finite.
 */
export function solveSmall4(
  a0: readonly number[][],
  b0: readonly number[],
  p: number,
): number[] | null {
  const a = a0.map((row) => row.slice())
  const b = b0.slice()
  let scale = 0
  for (let i = 0; i < p; i++) scale = fmax(scale, Math.abs(a[i][i]))
  if (scale <= 0 || !Number.isFinite(scale)) return null
  for (let col = 0; col < p; col++) {
    let piv = col
    for (let i = col + 1; i < p; i++)
      if (totalGe(Math.abs(a[i][col]), Math.abs(a[piv][col]))) piv = i
    if (Math.abs(a[piv][col]) <= 1e-14 * scale) return null
    const tr = a[col]
    a[col] = a[piv]
    a[piv] = tr
    const tb = b[col]
    b[col] = b[piv]
    b[piv] = tb
    for (let row = col + 1; row < p; row++) {
      const f = a[row][col] / a[col][col]
      for (let k = col; k < p; k++) a[row][k] -= f * a[col][k]
      b[row] -= f * b[col]
    }
  }
  const x = [0, 0, 0, 0]
  for (let row = p - 1; row >= 0; row--) {
    let s = b[row]
    for (let k = row + 1; k < p; k++) s -= a[row][k] * x[k]
    x[row] = s / a[row][row]
  }
  for (let i = 0; i < p; i++) if (!Number.isFinite(x[i])) return null
  return x
}

/** The spline score at geometry `g`, leaving the samples' `t` in `rz.t`. */
export function scoreAt(rz: Resid1d, g: Geom): number {
  rz.ellipticT(g[0], g[1], Math.sin(g[2]), Math.cos(g[2]), Math.exp(g[3]))
  return rz.finishSpline()
}

/** The least-squares spline through the current `(t, color)`; null when `t` has no spread. */
function splineFit(rz: Resid1d): SplineFit | null {
  const t = rz.t
  let lo = Number.MAX_VALUE
  let loAt = 0
  let hi = -Number.MAX_VALUE
  let hiAt = 0
  for (let i = 0; i < t.length; i++) {
    if (t[i] < lo) {
      lo = t[i]
      loAt = i
    }
    if (t[i] > hi) {
      hi = t[i]
      hiAt = i
    }
  }
  if (hi - lo <= 1e-9) return null
  const h = (hi - lo) / (K - 1)
  const d = new Float64Array(K)
  const e = new Float64Array(K)
  const b = new Float64Array(3 * K)
  const c = rz.cols
  for (let i = 0; i < t.length; i++) {
    const u = knotCoordinate(t[i], lo, h)
    const j = pieceOf(u)
    const f = u - j
    const w0 = 1 - f
    const w1 = f
    d[j] += w0 * w0
    d[j + 1] += w1 * w1
    e[j] += w0 * w1
    for (let ch = 0; ch < 3; ch++) {
      const dc = c[3 * i + ch] - rz.cbar[ch]
      b[3 * j + ch] += w0 * dc
      b[3 * (j + 1) + ch] += w1 * dc
    }
  }
  const m = new Float64Array(K)
  const cp = new Float64Array(K)
  m[0] = d[0] + 1e-9
  cp[0] = e[0] / m[0]
  for (let i = 1; i < K; i++) {
    m[i] = d[i] + 1e-9 - e[i - 1] * cp[i - 1]
    cp[i] = i + 1 < K ? e[i] / m[i] : 0
  }
  const fit: SplineFit = { lo, loAt, hi, hiAt, h, x: new Float64Array(3 * K), m, cp, e }
  const rhs = new Float64Array(K)
  for (let ch = 0; ch < 3; ch++) {
    for (let j = 0; j < K; j++) rhs[j] = b[3 * j + ch]
    const z = thomas(fit, rhs)
    for (let j = 0; j < K; j++) fit.x[3 * j + ch] = z[j]
  }
  return fit
}

/**
 * `∂t_i/∂θ` of sample `i` at geometry `g` (`sn`, `cs`, `k = e^a` its rotation and
 * aspect) for the first `p` coordinates: with `u = dx·cos φ + dy·sin φ`,
 * `v = (−dx·sin φ + dy·cos φ)·k`, `t = √(u² + v²)`: `∂t/∂cx = (−u·cos φ + v·k·sin φ)/t`,
 * `∂t/∂cy = (−u·sin φ − v·k·cos φ)/t`, `∂t/∂φ = u·v·(1/k − k)/t`, `∂t/∂a = v²/t`.
 * Zero at `t = 0`.
 */
function dt(
  rz: Resid1d,
  i: number,
  g: Geom,
  sn: number,
  cs: number,
  k: number,
  p: number,
  out: number[],
): void {
  const dx = rz.xs[i] - g[0]
  const dy = rz.ys[i] - g[1]
  const u = dx * cs + dy * sn
  const v = (-dx * sn + dy * cs) * k
  const t = Math.sqrt(u * u + v * v)
  if (t <= 1e-12) {
    out.fill(0)
    return
  }
  out[0] = p > 0 ? (-u * cs + v * k * sn) / t : 0
  out[1] = p > 1 ? (-u * sn - v * k * cs) / t : 0
  out[2] = p > 2 ? (u * v * (1 / k - k)) / t : 0
  out[3] = p > 3 ? (v * v) / t : 0
}

/**
 * Kaufman's undamped system at geometry `g`, whose `t` must be in `rz.t`: the
 * matrix `Dᵀ·P⊥·D` and the vector `Dᵀ·r` over the first `p` coordinates. Null
 * when `t` has no spread.
 */
export function kaufmanSystem(
  rz: Resid1d,
  g: Geom,
  p: number,
): { a: number[][]; b: number[] } | null {
  const fit = splineFit(rz)
  if (fit === null) return null
  const sn = Math.sin(g[2])
  const cs = Math.cos(g[2])
  const k = Math.exp(g[3])
  const dtLo = [0, 0, 0, 0]
  const dtHi = [0, 0, 0, 0]
  const dti = [0, 0, 0, 0]
  dt(rz, fit.loAt, g, sn, cs, k, p, dtLo)
  dt(rz, fit.hiAt, g, sn, cs, k, p, dtHi)
  const dd = [
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]
  const dr = [0, 0, 0, 0]
  // AᵀD per channel and coordinate: atd[(ch·4 + q)·K + j].
  const atd = new Float64Array(3 * 4 * K)
  const du = [0, 0, 0, 0]
  const t = rz.t
  const c = rz.cols
  const x = fit.x
  for (let i = 0; i < t.length; i++) {
    const u = knotCoordinate(t[i], fit.lo, fit.h)
    const j = pieceOf(u)
    const f = u - j
    dt(rz, i, g, sn, cs, k, p, dti)
    for (let q = 0; q < 4; q++) {
      du[q] = (dti[q] - dtLo[q] - (u * (dtHi[q] - dtLo[q])) / (K - 1)) / fit.h
    }
    for (let ch = 0; ch < 3; ch++) {
      const xj = x[3 * j + ch]
      const xj1 = x[3 * (j + 1) + ch]
      const slope = xj1 - xj
      const pred = (1 - f) * xj + f * xj1
      const r = c[3 * i + ch] - rz.cbar[ch] - pred
      for (let q = 0; q < p; q++) {
        const dq = slope * du[q]
        dr[q] += dq * r
        const base = (ch * 4 + q) * K
        atd[base + j] += (1 - f) * dq
        atd[base + j + 1] += f * dq
        for (let l = 0; l <= q; l++) dd[q][l] += dq * slope * du[l]
      }
    }
  }
  for (let ch = 0; ch < 3; ch++) {
    const z: Float64Array[] = []
    for (let q = 0; q < p; q++)
      z.push(thomas(fit, atd.subarray((ch * 4 + q) * K, (ch * 4 + q + 1) * K)))
    for (let q = 0; q < p; q++) {
      for (let l = 0; l <= q; l++) {
        let proj = 0
        const base = (ch * 4 + q) * K
        for (let jj = 0; jj < K; jj++) proj += atd[base + jj] * z[l][jj]
        dd[q][l] -= proj
      }
    }
  }
  for (let q = 0; q < p; q++) for (let l = q + 1; l < p; l++) dd[q][l] = dd[l][q]
  return { a: dd, b: dr }
}

/**
 * Minimize the spline score over the first `p` coordinates of the geometry (2:
 * a circle's center, angle and aspect held; 4: an ellipse) from `start`, by
 * Levenberg–Marquardt on Kaufman's step. `clamp` keeps a trial in the search
 * box. Never worse than `start` (clamped).
 *
 * Each pass forms the system at the current geometry and tries damped steps,
 * the damping `μ` (from 1e-3) multiplied by 4 after a step that does not lower
 * the score strictly (or a singular system) and by 0.3 (floored at 1e-12) after
 * one that does, which ends the pass. Stops on an accepted step smaller than
 * {@link LM_STEP_TOL} in every coordinate or lowering the score by at most
 * {@link LM_REL_TOL} of it, on `μ` past {@link LM_MU_MAX}, after
 * {@link LM_MAX_EVALS} evaluations, or without spread in `t`.
 */
export function refineSpline(
  rz: Resid1d,
  start: Geom,
  p: number,
  clamp: (g: Geom) => Geom,
): { g: Geom; score: number } {
  let g = clamp(start)
  let best = scoreAt(rz, g)
  let evals = 1
  let mu = 1e-3
  while (evals < LM_MAX_EVALS) {
    const sys = kaufmanSystem(rz, g, p)
    if (sys === null) break
    const { a, b } = sys
    let diagMax = 0
    for (let q = 0; q < p; q++) diagMax = fmax(diagMax, a[q][q])
    const floor = 1e-12 * diagMax
    let accepted = false
    while (evals < LM_MAX_EVALS && mu <= LM_MU_MAX) {
      const damped = a.map((row) => row.slice())
      for (let q = 0; q < p; q++) damped[q][q] += mu * (a[q][q] + floor)
      const step = solveSmall4(damped, b, p)
      if (step === null) {
        mu *= 4
        continue
      }
      const moved = g.slice() as Geom
      for (let q = 0; q < p; q++) moved[q] += step[q]
      const trial = clamp(moved)
      const score = scoreAt(rz, trial)
      evals++
      if (score < best) {
        const gained = best - score
        let largest = 0
        for (let q = 0; q < p; q++)
          largest = fmax(largest, Math.abs(trial[q] - g[q]) / LM_STEP_TOL[q])
        g = trial
        best = score
        mu = Math.max(mu * 0.3, 1e-12)
        accepted = true
        if (gained <= LM_REL_TOL * Math.max(best, F64_MIN_POSITIVE) || largest < 1) {
          return { g, score: best }
        }
        break
      }
      mu *= 4
    }
    if (!accepted) break
  }
  return { g, score: best }
}
