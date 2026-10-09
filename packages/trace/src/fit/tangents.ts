/**
 * Tangent estimation and the cost of a turn at a join.
 *
 * Before the dynamic program runs, every measured point gets an incoming and
 * an outgoing unit tangent ({@link estimateTangents}); the program's G1 cubics
 * inherit these directions at their ends, and every chosen vertex pays for the
 * turn between its two tangents ({@link vertexCost}, {@link breakCost}).
 *
 * The tangent at a point is the derivative of a weighted least-squares quadratic
 * fitted to the points around it, parametrized by arc length (a local
 * Savitzky–Golay derivative, Savitzky & Golay 1964). The window is the widest,
 * up to {@link TANGENT_WINDOW_MAX} points a side, whose quadratic is consistent
 * with the measurement model, `χ² ≤ τ²·dof`. A window centred on the point is
 * tried first: it passes on smooth runs, where averaging both sides beats noise,
 * and fails across a true corner, where the two sides are then estimated
 * separately so each keeps its own direction instead of their bisector.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/tangents.rs`.
 */
import type { FitConfig } from '../planar/types'
import { g1BreakRadians } from './cost'
import type { Vec } from './curves'
import type { Polyline } from './objective'
import { fmin, solve3 } from './roots'

/** Widest tangent window, in points on each side. */
export const TANGENT_WINDOW_MAX = 16

/**
 * One-sided unit tangents at every point: `incoming[k]` the direction the
 * boundary arrives at `k` with, `outgoing[k]` the direction it leaves with. Both
 * point forward.
 */
export interface Tangents {
  incoming: Vec[]
  outgoing: Vec[]
}

/** Samples of one quadratic window: arc-length offset, position and weight `1/σ²`. */
class TangentWindow {
  readonly u = new Float64Array(2 * TANGENT_WINDOW_MAX + 1)
  readonly x = new Float64Array(2 * TANGENT_WINDOW_MAX + 1)
  readonly y = new Float64Array(2 * TANGENT_WINDOW_MAX + 1)
  readonly w = new Float64Array(2 * TANGENT_WINDOW_MAX + 1)
  /** Arc-length offsets behind the point, nearest first. */
  readonly back = new Float64Array(TANGENT_WINDOW_MAX)
  len = 0
  readonly m = new Float64Array(9)
  readonly tx = new Float64Array(3)
  readonly ty = new Float64Array(3)
  readonly cx = new Float64Array(3)
  readonly cy = new Float64Array(3)
  /** The fitted direction and residual of the last {@link quadraticTangent} call. */
  dirX = 0
  dirY = 0
  resid = 0

  push(u: number, x: number, y: number, w: number): void {
    this.u[this.len] = u
    this.x[this.len] = x
    this.y[this.len] = y
    this.w[this.len] = w
    this.len++
  }
}

/**
 * Weighted least-squares quadratic `a + b·u + c·u²` through the first `count`
 * samples of `win`: the normal equations
 *
 *     [S0 S1 S2] [a]   [Σw·x    ]
 *     [S1 S2 S3] [b] = [Σw·u·x  ]      S_m = Σ w·u^m
 *     [S2 S3 S4] [c]   [Σw·u²·x ]
 *
 * solved for x and y separately. Leaves the normalized derivative `(b_x, b_y)`
 * (pointing towards increasing `u`) and the residual `Σ w·|p − q(u)|²` (a χ² with
 * `2·count − 6` degrees of freedom) on `win`. False for a singular system or a
 * zero or non-finite derivative.
 */
function quadraticTangent(win: TangentWindow, count: number): boolean {
  let s0 = 0
  let s1 = 0
  let s2 = 0
  let s3 = 0
  let s4 = 0
  let tx0 = 0
  let tx1 = 0
  let tx2 = 0
  let ty0 = 0
  let ty1 = 0
  let ty2 = 0
  for (let q = 0; q < count; q++) {
    const u = win.u[q]
    const w = win.w[q]
    const px = win.x[q]
    const py = win.y[q]
    // w·u^k accumulated as in the moment loop: up = u^k, built by repeated products.
    const up1 = u
    const up2 = up1 * u
    const up3 = up2 * u
    const up4 = up3 * u
    s0 += w
    tx0 += w * px
    ty0 += w * py
    s1 += w * up1
    tx1 += w * up1 * px
    ty1 += w * up1 * py
    s2 += w * up2
    tx2 += w * up2 * px
    ty2 += w * up2 * py
    s3 += w * up3
    s4 += w * up4
  }
  const m = win.m
  m[0] = s0
  m[1] = s1
  m[2] = s2
  m[3] = s1
  m[4] = s2
  m[5] = s3
  m[6] = s2
  m[7] = s3
  m[8] = s4
  win.tx[0] = tx0
  win.tx[1] = tx1
  win.tx[2] = tx2
  win.ty[0] = ty0
  win.ty[1] = ty1
  win.ty[2] = ty2
  if (!solve3(m, win.tx, win.cx)) return false
  if (!solve3(m, win.ty, win.cy)) return false
  const cx = win.cx
  const cy = win.cy
  let resid = 0
  for (let q = 0; q < count; q++) {
    const u = win.u[q]
    const rx = win.x[q] - (cx[0] + cx[1] * u + cx[2] * u * u)
    const ry = win.y[q] - (cy[0] + cy[1] * u + cy[2] * u * u)
    resid += win.w[q] * (rx * rx + ry * ry)
  }
  const n = Math.hypot(cx[1], cy[1])
  if (n < 1e-12 || !Number.isFinite(n)) return false
  win.dirX = cx[1] / n
  win.dirY = cy[1] / n
  win.resid = resid
  return true
}

/** What the tangent estimators read of a polyline: its points, edge lengths and weights. */
interface Source {
  poly: Polyline
  n: number
  /** `|p_{k+1} − p_k|` (wrapping), or null to measure on demand. */
  edges: Float64Array | null
}

/** Length of the edge from point `a` to its successor `(a + 1) mod n`. */
function edgeLength(src: Source, a: number): number {
  if (src.edges) return src.edges[a]
  const p = src.poly.points
  const b = (a + 1) % src.n
  return Math.hypot(p[2 * a] - p[2 * b], p[2 * a + 1] - p[2 * b + 1])
}

/** Weight `1/σ²` of point `k`. */
function weightOf(poly: Polyline, k: number): number {
  return 1 / (poly.sigma[k] * poly.sigma[k])
}

/**
 * Tangent at point `k` from the points on one side only: `forward` uses
 * `k, k+1, …` (outgoing), otherwise `k, k−1, …` with negative `u` (incoming,
 * still pointing along the boundary). Windows of `w = wmax..2` points beyond `k`
 * are tried widest first and the first whose quadratic has
 * `χ² ≤ τ²·(2(w+1) − 6)` is taken; at `w = 2` there are no spare degrees of
 * freedom and it is always accepted. `wmax` is {@link TANGENT_WINDOW_MAX}, less
 * near the end of an open polyline; a closed one wraps. With only one
 * neighbour, or every fit singular, the chord to the neighbour is used. Null
 * without a neighbour on that side or when it coincides with `k`.
 */
function oneSidedTangent(
  src: Source,
  k: number,
  forward: boolean,
  cfg: FitConfig,
  win: TangentWindow,
): Vec | null {
  const { poly, n } = src
  const p = poly.points
  const avail = poly.closed ? n - 1 : forward ? n - 1 - k : k
  const wmax = Math.min(TANGENT_WINDOW_MAX, avail)
  if (wmax < 1) return null
  const idx = (m: number) => (forward ? (k + m) % n : (k + n - (m % n)) % n)
  win.len = 0
  let u = 0
  for (let m = 0; m <= wmax; m++) {
    const i = idx(m)
    if (m > 0) {
      // The step between consecutive points i and idx(m − 1), whichever way they run.
      const step = edgeLength(src, forward ? idx(m - 1) : i)
      u += forward ? step : -step
    }
    win.push(u, p[2 * i], p[2 * i + 1], weightOf(poly, i))
  }
  const tau2 = cfg.tau * cfg.tau
  for (let w = wmax; w >= 2; w--) {
    if (!quadraticTangent(win, w + 1)) continue
    const dof = Math.max(2 * (w + 1) - 6, 0)
    if (dof <= 0 || win.resid <= tau2 * dof) return { x: win.dirX, y: win.dirY }
  }
  const j = idx(1)
  const dx = p[2 * j] - p[2 * k]
  const dy = p[2 * j + 1] - p[2 * k + 1]
  const nrm = Math.hypot(dx, dy)
  if (nrm < 1e-12) return null
  const sign = forward ? 1 : -1
  return { x: (sign * dx) / nrm, y: (sign * dy) / nrm }
}

/** {@link symmetricTangent} on a prepared source. */
function symmetricTangentOf(
  src: Source,
  k: number,
  halfIn: number,
  cfg: FitConfig,
  win: TangentWindow,
): Vec | null {
  const { poly, n } = src
  const p = poly.points
  const avail = poly.closed ? Math.floor((n - 1) / 2) : Math.min(k, n - 1 - k)
  const half = Math.min(halfIn, TANGENT_WINDOW_MAX, avail)
  if (half < 2) return null
  const idx = (d: number) => (((k + d) % n) + n) % n
  const tau2 = cfg.tau * cfg.tau
  const back = win.back
  for (let w = half; w >= 2; w--) {
    win.len = 0
    // Backwards from k: offsets −1 … −w, then laid out in increasing u.
    let u = 0
    for (let m = 1; m <= w; m++) {
      u -= edgeLength(src, idx(-m))
      back[m - 1] = u
    }
    for (let m = w; m >= 1; m--) {
      const a = idx(-m)
      win.push(back[m - 1], p[2 * a], p[2 * a + 1], weightOf(poly, a))
    }
    win.push(0, p[2 * k], p[2 * k + 1], weightOf(poly, k))
    u = 0
    for (let m = 1; m <= w; m++) {
      const a = idx(m)
      u += edgeLength(src, idx(m - 1))
      win.push(u, p[2 * a], p[2 * a + 1], weightOf(poly, a))
    }
    if (!quadraticTangent(win, win.len)) continue
    const dof = 2 * (2 * w + 1) - 6
    if (win.resid <= tau2 * dof) return { x: win.dirX, y: win.dirY }
  }
  return null
}

/**
 * Symmetric tangent at point `k` from the widest window of at most `half` points
 * each side (capped by {@link TANGENT_WINDOW_MAX} and what the polyline has),
 * fitted with a quadratic in signed arc length, widest first; the first with
 * `χ² ≤ τ²·(2(2w+1) − 6)` wins. Null when fewer than two points are available
 * on a side or no window is consistent — what happens across a corner, and the
 * signal to fall back to one-sided estimates.
 */
export function symmetricTangent(
  poly: Polyline,
  k: number,
  half: number,
  cfg: FitConfig,
): Vec | null {
  const src: Source = { poly, n: poly.points.length >> 1, edges: null }
  return symmetricTangentOf(src, k, half, cfg, new TangentWindow())
}

/**
 * The tangents at every point. Where a symmetric window fits, incoming and
 * outgoing are the same direction (a smooth run); otherwise each side is
 * estimated on its own; with one side only (the ends of an open polyline) both
 * take it, and with neither the x axis stands in. All are unit vectors along the
 * direction of travel.
 */
export function estimateTangents(poly: Polyline, cfg: FitConfig): Tangents {
  const n = poly.points.length >> 1
  const p = poly.points
  const edges = new Float64Array(n)
  for (let a = 0; a < n; a++) {
    const b = (a + 1) % n
    edges[a] = Math.hypot(p[2 * a] - p[2 * b], p[2 * a + 1] - p[2 * b + 1])
  }
  const src: Source = { poly, n, edges }
  const win = new TangentWindow()
  const incoming: Vec[] = []
  const outgoing: Vec[] = []
  for (let k = 0; k < n; k++) {
    const t = symmetricTangentOf(src, k, TANGENT_WINDOW_MAX, cfg, win)
    if (t) {
      incoming.push(t)
      outgoing.push({ x: t.x, y: t.y })
      continue
    }
    const fwd = oneSidedTangent(src, k, true, cfg, win)
    const bwd = oneSidedTangent(src, k, false, cfg, win)
    const o = fwd ?? bwd ?? { x: 1, y: 0 }
    const i = bwd ?? fwd ?? { x: 1, y: 0 }
    outgoing.push(o)
    incoming.push(i === o ? { x: i.x, y: i.y } : i)
  }
  return { incoming, outgoing }
}

/**
 * Unsigned angle between two directions, radians in `[0, π]`:
 * `acos(a·b / (|a||b|))`. A zero vector has no direction and gives 0.
 */
export function turnAngle(a: Vec, b: Vec): number {
  const na = Math.hypot(a.x, a.y)
  const nb = Math.hypot(b.x, b.y)
  if (na < 1e-12 || nb < 1e-12) return 0
  return Math.acos(Math.min(Math.max((a.x * b.x + a.y * b.y) / (na * nb), -1), 1))
}

/**
 * Cost, nats, of a tangent break between directions `a` and `b`:
 * `λ·min(1, (θ / θ_break)²)` with `θ` the {@link turnAngle} and `θ_break` the
 * full-corner turn in force (`g1BreakRadians`). A corner is one extra free
 * parameter (the outgoing direction no longer implied by the incoming one), hence
 * the saturation at `λ`; the quadratic ramp keeps estimator noise on a smooth
 * join nearly free.
 */
export function breakCost(a: Vec, b: Vec, lambda: number): number {
  const r = turnAngle(a, b) / g1BreakRadians()
  return lambda * fmin(r * r, 1)
}

/** Turn cost of choosing point `k` as a vertex: the {@link breakCost} between its tangents. */
export function vertexCost(tan: Tangents, k: number, cfg: FitConfig): number {
  return breakCost(tan.incoming[k], tan.outgoing[k], cfg.lambda)
}
