/**
 * Junction refinement: every node of a planar map moved to the sub-pixel point where its
 * incident boundaries meet. The sub-pixel stage cannot place a node — the pixel there mixes
 * three or more colors, which two-color unmixing does not model — so nodes are still on their
 * lattice corners when this runs. Each node goes where its edges, extrapolated from their
 * refined interiors, actually meet, and every incident edge's end takes that one position, so
 * the edges still share it exactly.
 *
 * Two estimators, in order:
 *
 * 1. **Tangent intersection.** Each incident edge contributes a line fitted to its points near
 *    the node (skipping the one nearest, which the mixture contaminates), weighted by `1/σ²`,
 *    with the variance of its position at the node; a quadratic replaces the line where the
 *    edge is significantly curved. The node is the weighted least-squares point nearest all the
 *    lines. Refused with fewer than two lines, lines too near parallel to cross (eigenvalue ratio
 *    of `Σ n nᵀ` under 0.02, about 16°), or a move over 1.5 px.
 * 2. **Taper.** Where two boundaries meet tangentially the intersection is ill-posed; the
 *    branch that tapers into the through boundary is fitted with a circle tangent to it, and the
 *    node goes where the taper vanishes (inkvec `taper.rs`). Tried only when the intersection
 *    fails; it may slide the node past points an incident edge still holds, which are trimmed.
 *
 * If neither is trusted the node stays where it is, with σ ½. A node on the image frame stays
 * on its frame line, and no node leaves the image.
 *
 * Coordinates: Trazor's (pixel centers on half-integers). Nothing here samples the image, so
 * inkvec's formulas carry over unshifted; a node's lattice position is its position as built.
 *
 * Method from Kåsa 1976 for the algebraic circle, imposed tangent to the through line (inkvec);
 * weighted least squares for the line intersection.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/planar/junctions.rs` (`refine_junctions`,
 * `end_tangent`, `fit_end_polynomial`, `invert_small`, `solve_junction`, `eigen2`,
 * `taper_junction`, `trim_passed_over`) and `inkvec-trace/src/taper.rs` (`fit`).
 */
import { OUTSIDE, syncNodes } from './types'
import type { PlanarEdge, PlanarMap } from './types'

/** Interior points, nearest the node, a near-node extrapolation is fitted on. */
export const JUNCTION_FIT_POINTS = 6

/** Interior points next to the node left out of its edges' tangent fits. */
export const JUNCTION_SKIP = 1

/** Interior points, nearest the node, an edge is tested for curvature on. */
export const JUNCTION_CURVATURE_POINTS = 16

/** Farthest the tangent intersection may move a node, in px. */
export const JUNCTION_MAX_MOVE = 1.5

/**
 * Smallest eigenvalue ratio of the unweighted normal matrix `Σ n nᵀ`: two lines at angle `θ`
 * give `tan²(θ/2)`, so this refuses crossings under about 16°.
 */
export const JUNCTION_MIN_CONDITION = 0.02

/** Fewest points for the quadratic tangent model. */
const MIN_QUADRATIC_POINTS = 5

/** Standard deviations the quadratic term must clear to replace the line. */
const CURVATURE_SIGNIFICANCE = 3

/** Largest angle between a branch and the through line (either way) for a taper, in degrees. */
export const TAPER_DEGREES = 55

/** Farthest a taper may move a node, in px. */
export const TAPER_MAX_MOVE = 8

/** Largest share of the shortest incident edge's length a taper move may consume. */
export const TAPER_MAX_CONSUMED = 0.35

/** Largest standard error of a taper's vanishing point, in px. */
export const TAPER_MAX_SIGMA = 1

/** Fewest points an edge keeps when a taper move trims it. */
const TRIM_MIN_POINTS = 4

/** Points along an edge read to tell which way it leaves its node. */
const TRIM_LOOK = 3

/** Smallest taper width trusted, in px: below it the measurement is noise. */
const TAPER_MIN_WIDTH = 0.05

/** Largest taper width admitted, in px: beyond it the region is no longer one arc. */
const TAPER_MAX_WIDTH = 6

/** Fewest taper samples trusted. */
const TAPER_MIN_SAMPLES = 4

/** Largest distance of the samples from the fitted tangent circle, in px. */
const TAPER_MAX_DEFECT = 0.15

/** Grid steps of the taper's search for its tangent point. */
const TAPER_GRID = 2000

/** Halving rounds refining the taper's tangent point. */
const TAPER_ROUNDS = 50

/** Position σ of a node no estimator placed, in px. */
const GRID_SIGMA = 0.5

/**
 * One incident edge's end tangent as a line `n·p = c` with unit normal `(nx, ny)`, and the
 * variance of its perpendicular position at the node (px²).
 */
export interface TangentLine {
  nx: number
  ny: number
  c: number
  variance: number
}

/** A node position and its σ, in px. */
export interface NodeEstimate {
  x: number
  y: number
  sigma: number
}

/** The result of a taper fit. */
export interface Taper {
  /** Where the tapering region vanishes, in the samples' position units. */
  vanish: number
  /** Standard error of `vanish`, from the fit's own residuals. */
  sigma: number
  /** Radius of the fitted tangent circle. */
  impliedRadius: number
  /** Samples the fit used. */
  used: number
  /** How far the samples sit from the fitted tangent circle, in px. */
  tangencyDefect: number
}

/**
 * Inverse of the leading `m × m` block (`m ≤ 3`) of a symmetric positive 3×3 matrix (row-major),
 * by Gauss–Jordan elimination with partial pivoting (the last of equal pivots). `null` when a
 * pivot is at most `1e-12` times the largest diagonal entry. Entries outside the block are zero.
 */
function invertSmall(mat: Float64Array, m: number): Float64Array | null {
  const a = Float64Array.from(mat)
  const inv = new Float64Array(9)
  for (let i = 0; i < m; i++) inv[4 * i] = 1
  let scale = 0
  for (let i = 0; i < m; i++) scale = Math.max(scale, Math.abs(a[4 * i]))
  for (let col = 0; col < m; col++) {
    let piv = col
    for (let p = col + 1; p < m; p++) {
      if (Math.abs(a[3 * p + col]) >= Math.abs(a[3 * piv + col])) piv = p
    }
    if (Math.abs(a[3 * piv + col]) <= 1e-12 * scale) return null
    if (piv !== col) {
      for (let j = 0; j < 3; j++) {
        let t = a[3 * col + j]
        a[3 * col + j] = a[3 * piv + j]
        a[3 * piv + j] = t
        t = inv[3 * col + j]
        inv[3 * col + j] = inv[3 * piv + j]
        inv[3 * piv + j] = t
      }
    }
    const d = a[3 * col + col]
    for (let j = 0; j < m; j++) {
      a[3 * col + j] /= d
      inv[3 * col + j] /= d
    }
    for (let r = 0; r < m; r++) {
      if (r === col) continue
      const f = a[3 * r + col]
      if (f === 0) continue
      for (let j = 0; j < m; j++) {
        a[3 * r + j] -= f * a[3 * col + j]
        inv[3 * r + j] -= f * inv[3 * col + j]
      }
    }
  }
  return inv
}

/**
 * Weighted least-squares polynomial of `degree` (1 or 2) through the first `n` samples
 * `r(t)`, by the normal equations `(Aᵀ W A) x = Aᵀ W r`: coefficients into `x` and their
 * variances (the diagonal of `(Aᵀ W A)⁻¹` scaled by `max(χ²/dof, 1)`) into `v`. False when the
 * normal matrix is singular.
 */
function polyFit(
  ts: ArrayLike<number>,
  rs: ArrayLike<number>,
  ws: ArrayLike<number>,
  degree: number,
  n: number,
  x: Float64Array,
  v: Float64Array,
): boolean {
  const m = degree + 1
  const mat = new Float64Array(9)
  const rhs = new Float64Array(3)
  const tp = new Float64Array(5)
  for (let k = 0; k < n; k++) {
    const t = ts[k]
    const r = rs[k]
    const w = ws[k]
    tp[0] = 1
    tp[1] = t
    tp[2] = t * t
    tp[3] = t * t * t
    tp[4] = t * t * t * t
    for (let i = 0; i < m; i++) {
      for (let j = 0; j < m; j++) mat[3 * i + j] += w * tp[i + j]
      rhs[i] += w * tp[i] * r
    }
  }
  const inv = invertSmall(mat, m)
  if (inv === null) return false
  x.fill(0)
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < m; j++) x[i] += inv[3 * i + j] * rhs[j]
  }
  let chi2 = 0
  for (let k = 0; k < n; k++) {
    const t = ts[k]
    const res = rs[k] - (x[0] + x[1] * t + x[2] * t * t)
    chi2 += ws[k] * res * res
  }
  const dof = Math.max(n - m, 0)
  const scale = dof > 0 ? Math.max(chi2 / dof, 1) : 1
  v[0] = inv[0] * scale
  v[1] = inv[4] * scale
  v[2] = inv[8] * scale
  return true
}

/**
 * The tangent line at `t = 0` of a weighted polynomial `r(t)` through local samples ordered
 * nearest the node first: `[a, b, var(a)]` with intercept `a` and slope `b`, or `null` when
 * the normal matrix is singular.
 *
 * A straight line through the first `nFit` samples is the default. A quadratic replaces it
 * when the edge is measurably curved: fitted over all samples (at least 5, with `nFit` at least
 * 5), its `t²` coefficient must exceed 3 standard deviations; the quadratic is then
 * extrapolated from the first `nFit` samples again. Variances are scaled by the reduced χ²
 * when the scatter exceeds the stated σ, never narrowed.
 */
export function fitEndPolynomial(
  ts: ArrayLike<number>,
  rs: ArrayLike<number>,
  ws: ArrayLike<number>,
  nFit: number,
): [number, number, number] | null {
  const nAll = ts.length
  const n = Math.min(nFit, nAll)
  const x = new Float64Array(3)
  const v = new Float64Array(3)
  if (!polyFit(ts, rs, ws, 1, n, x, v)) return null
  const line: [number, number, number] = [x[0], x[1], v[0]]
  if (nAll >= MIN_QUADRATIC_POINTS && n >= MIN_QUADRATIC_POINTS) {
    if (polyFit(ts, rs, ws, 2, nAll, x, v)) {
      if (Math.abs(x[2]) > CURVATURE_SIGNIFICANCE * Math.sqrt(Math.max(v[2], 0))) {
        if (n < nAll && !polyFit(ts, rs, ws, 2, n, x, v)) return null
        return [x[0], x[1], v[0]]
      }
    }
  }
  return line
}

/**
 * The weighted least-squares tangent line of edge `e` at its start (`atStart`) or end,
 * extrapolated to the node at `(ox, oy)`; `null` for an edge too short to fit or a degenerate
 * fit.
 *
 * The points used are up to {@link JUNCTION_CURVATURE_POINTS} interior points nearest the end,
 * skipping {@link JUNCTION_SKIP}, each weighted `1/σ²`. Their weighted principal direction `u`
 * (`θ = ½·atan2(2·Sxy, Sxx − Syy)`) and its perpendicular `v` give local coordinates from the
 * node: `t` along `u`, `r` along `v`; {@link fitEndPolynomial} gives `r`'s value `a` and slope
 * `b` at the node, so the line passes `origin + a·v` along `u + b·v`, its variance projected on
 * its own normal. An edge against the frame is exact by construction: its first segment's line,
 * with a negligible variance.
 */
export function endTangent(
  e: PlanarEdge,
  atStart: boolean,
  ox: number,
  oy: number,
): TangentLine | null {
  const pts = e.points
  const n = pts.length >> 1
  if (n < 2) return null
  if (e.left === OUTSIDE || e.right === OUTSIDE) {
    const p = atStart ? 0 : n - 1
    const q = atStart ? 1 : n - 2
    const dx = pts[2 * q] - pts[2 * p]
    const dy = pts[2 * q + 1] - pts[2 * p + 1]
    const l = Math.hypot(dx, dy)
    if (l < 1e-9) return null
    const nx = -dy / l
    const ny = dx / l
    return { nx, ny, c: nx * pts[2 * p] + ny * pts[2 * p + 1], variance: 1e-6 }
  }

  // Interior indices nearest the end, leaving out both end points and the skipped ones.
  const idx: number[] = []
  if (atStart) {
    for (let k = 1 + JUNCTION_SKIP; k < n - 1 && idx.length < JUNCTION_CURVATURE_POINTS; k++) {
      idx.push(k)
    }
  } else {
    for (let k = n - 2 - JUNCTION_SKIP; k >= 1 && idx.length < JUNCTION_CURVATURE_POINTS; k--) {
      idx.push(k)
    }
  }
  const count = idx.length
  if (count < 2) return null
  const ws = new Float64Array(count)
  let wsum = 0
  let mx = 0
  let my = 0
  for (let i = 0; i < count; i++) {
    const s = Math.max(e.sigma[idx[i]], 1e-3)
    const w = 1 / (s * s)
    ws[i] = w
    wsum += w
  }
  for (let i = 0; i < count; i++) {
    mx += ws[i] * pts[2 * idx[i]]
    my += ws[i] * pts[2 * idx[i] + 1]
  }
  mx /= wsum
  my /= wsum
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < count; i++) {
    const dx = pts[2 * idx[i]] - mx
    const dy = pts[2 * idx[i] + 1] - my
    sxx += ws[i] * dx * dx
    syy += ws[i] * dy * dy
    sxy += ws[i] * dx * dy
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ux = Math.cos(theta)
  const uy = Math.sin(theta)
  const vx = -uy
  const vy = ux

  const ts = new Float64Array(count)
  const rs = new Float64Array(count)
  for (let i = 0; i < count; i++) {
    const dx = pts[2 * idx[i]] - ox
    const dy = pts[2 * idx[i] + 1] - oy
    ts[i] = dx * ux + dy * uy
    rs[i] = dx * vx + dy * vy
  }
  const fit = fitEndPolynomial(ts, rs, ws, JUNCTION_FIT_POINTS)
  if (fit === null) return null
  const [a, b, varA] = fit

  const dx = ux + b * vx
  const dy = uy + b * vy
  const dl = Math.hypot(dx, dy)
  const nx = -dy / dl
  const ny = dx / dl
  const px = ox + a * vx
  const py = oy + a * vy
  // The variance of `a` is along `v`; projected on the line's own normal.
  const cosang = Math.max(Math.abs(nx * vx + ny * vy), 1e-3)
  return { nx, ny, c: nx * px + ny * py, variance: Math.max(varA * cosang * cosang, 1e-6) }
}

/** Eigenvalues `[min, max]` of the symmetric matrix `[[a, b], [b, c]]`, in closed form. */
function eigen2(a: number, b: number, c: number): [number, number] {
  const m = 0.5 * (a + c)
  const d = Math.sqrt(0.25 * (a - c) * (a - c) + b * b)
  return [m - d, m + d]
}

/**
 * Weighted least-squares intersection of `lines`, minimizing `Σ (n_i·p − c_i)² / var_i`: the
 * 2×2 normal equations `A p = b`, `A = Σ n_i n_iᵀ / var_i`, `b = Σ c_i n_i / var_i`, solved in
 * closed form, with σ `sqrt(1/λ_min(A))` clamped to `[0.02, 2]` px. `null` with fewer than two
 * lines, when the unweighted `Σ n nᵀ` is too near singular ({@link JUNCTION_MIN_CONDITION}, so
 * one confident line cannot make a shallow crossing look well posed), when `A` is singular, or
 * when the solution is not finite or more than {@link JUNCTION_MAX_MOVE} from `(ox, oy)`.
 */
export function solveJunction(
  lines: readonly TangentLine[],
  ox: number,
  oy: number,
): NodeEstimate | null {
  if (lines.length < 2) return null
  let gxx = 0
  let gxy = 0
  let gyy = 0
  for (const l of lines) {
    gxx += l.nx * l.nx
    gxy += l.nx * l.ny
    gyy += l.ny * l.ny
  }
  const [lmin, lmax] = eigen2(gxx, gxy, gyy)
  if (lmax <= 0 || lmin / lmax < JUNCTION_MIN_CONDITION) return null

  let axx = 0
  let axy = 0
  let ayy = 0
  let bx = 0
  let by = 0
  for (const l of lines) {
    const wt = 1 / l.variance
    axx += wt * l.nx * l.nx
    axy += wt * l.nx * l.ny
    ayy += wt * l.ny * l.ny
    bx += wt * l.nx * l.c
    by += wt * l.ny * l.c
  }
  const det = axx * ayy - axy * axy
  if (det <= 1e-12 * (axx + ayy) * (axx + ayy)) return null
  const x = (ayy * bx - axy * by) / det
  const y = (axx * by - axy * bx) / det
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    Math.hypot(x - ox, y - oy) > JUNCTION_MAX_MOVE
  ) {
    return null
  }
  const [amin] = eigen2(axx, axy, ayy)
  const sigma = Math.min(Math.max(Math.sqrt(1 / Math.max(amin, 1e-12)), 0.02), 2)
  return { x, y, sigma }
}

/**
 * Where a tapering region between two boundaries vanishes. `samples` are interleaved `(u, w)`:
 * position along the shared tangent and the region's width there, in either order.
 *
 * Over the samples with `0.05 < w < 6` (at least 4), the curving boundary is fitted with a
 * circle tangent to the straight one (`w = 0`) at `u = a`: `(u − a)² + w² − 2Rw = 0`, where `R`
 * is linear given `a`,
 *
 * ```text
 *     R(a) = Σ ((u−a)² + w²)·w / (2 Σ w²)
 *     F(a) = Σ ((u−a)² + w² − 2R(a)·w)²
 * ```
 *
 * `F` minimized over `a` on a grid of 2001 values spanning three times the samples' extent past
 * each end, then refined by 50 halving rounds. Refused for a radius of ½ px or less, a
 * non-finite result, or a defect `sqrt(F/n) / 2R` (the samples' distance from the circle) over
 * 0.15 px. σ is `sqrt(2s²/F''(a))` with `s² = F/(n − 2)` and `F''` by central difference.
 */
export function taperFit(samples: ArrayLike<number>): Taper | null {
  const xs: number[] = []
  const ys: number[] = []
  for (let i = 0; i + 1 < samples.length; i += 2) {
    const w = samples[i + 1]
    if (w > TAPER_MIN_WIDTH && w < TAPER_MAX_WIDTH) {
      xs.push(samples[i])
      ys.push(w)
    }
  }
  const n = xs.length
  if (n < TAPER_MIN_SAMPLES) return null

  let fitRadius = 0
  const residual = (a: number): number => {
    let num = 0
    let den = 0
    for (let i = 0; i < n; i++) {
      const dx = xs[i] - a
      const y = ys[i]
      num += (dx * dx + y * y) * y
      den += y * y
    }
    const r = num / (2 * den)
    let sse = 0
    for (let i = 0; i < n; i++) {
      const y = ys[i]
      const e = (xs[i] - a) * (xs[i] - a) + y * y - 2 * r * y
      sse += e * e
    }
    fitRadius = r
    return sse
  }

  let lo = Number.MAX_VALUE
  let hi = -Number.MAX_VALUE
  for (let i = 0; i < n; i++) {
    lo = Math.min(lo, xs[i])
    hi = Math.max(hi, xs[i])
  }
  const span = Math.max(hi - lo, 1)
  // The tangent point lies past the thin end of the samples, not among them.
  const from = lo - 3 * span
  const to = hi + 3 * span

  let sse = Number.MAX_VALUE
  let a = from
  let radius = 0
  for (let i = 0; i <= TAPER_GRID; i++) {
    const cand = from + (to - from) * (i / TAPER_GRID)
    const v = residual(cand)
    if (Number.isFinite(v) && v < sse) {
      sse = v
      a = cand
      radius = fitRadius
    }
  }
  let step = (to - from) / TAPER_GRID
  for (let round = 0; round < TAPER_ROUNDS; round++) {
    step *= 0.5
    const below = a - step
    const above = a + step
    for (const cand of [below, above]) {
      const v = residual(cand)
      if (Number.isFinite(v) && v < sse) {
        sse = v
        a = cand
        radius = fitRadius
      }
    }
  }
  if (!Number.isFinite(a) || !Number.isFinite(radius) || radius <= 0.5) return null

  // The algebraic residual is a squared length; over `2R` (its gradient at the circle) it is
  // the samples' distance from the fitted tangent circle.
  const defect = Math.sqrt(sse / n) / (2 * radius)
  if (defect > TAPER_MAX_DEFECT) return null

  const h = Math.max(span * 1e-3, 1e-4)
  const f2 = (residual(a + h) - 2 * sse + residual(a - h)) / (h * h)
  const s2 = sse / Math.max(n - 2, 1)
  const sigma = f2 > 1e-12 ? Math.sqrt((2 * s2) / f2) : Number.POSITIVE_INFINITY
  return { vanish: a, sigma, impliedRadius: radius, used: n, tangencyDefect: defect }
}

/** The x coordinate of point `i` of edge `e`. */
function xOf(e: PlanarEdge, i: number): number {
  return e.points[2 * i]
}

/** The y coordinate of point `i` of edge `e`. */
function yOf(e: PlanarEdge, i: number): number {
  return e.points[2 * i + 1]
}

/** Length of an edge's polyline. */
function polylineLength(e: PlanarEdge): number {
  const pts = e.points
  let len = 0
  for (let i = 2; i < pts.length; i += 2) {
    len += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1])
  }
  return len
}

/** Unsigned angle between two directions, in radians. */
function angleBetween(ax: number, ay: number, bx: number, by: number): number {
  return Math.abs(Math.atan2(ax * by - ay * bx, ax * bx + ay * by))
}

/**
 * Place a node where two boundaries meet tangentially, from the region that tapers. `ends` are
 * the node's edge ends (`2·edge` for a start, `2·edge + 1` for an end).
 *
 * Needs three incident edges. Each edge's direction leaving the node runs from its end point to
 * the point three along. The pair of directions with the widest angle is the *through*
 * boundary; another edge within {@link TAPER_DEGREES} of that line is the *branch* (the last
 * one, if several). The branch's points as `(t, |r|)` — `t` along the through direction from
 * the node, `|r|` their distance from the through line — are the taper's half-width profile;
 * {@link taperFit} finds the `t` where it vanishes, and the node moves to `origin + t·through`
 * with σ clamped to `[0.05, 1]`. `null` with no branch, no fit, or a move too large
 * ({@link TAPER_MAX_MOVE}, {@link TAPER_MAX_SIGMA}, {@link TAPER_MAX_CONSUMED}).
 */
function taperJunction(
  map: PlanarMap,
  ends: readonly number[],
  ox: number,
  oy: number,
): NodeEstimate | null {
  if (ends.length < 3) return null
  const dirEnd: number[] = []
  const dirX: number[] = []
  const dirY: number[] = []
  for (const end of ends) {
    const e = map.edges[end >> 1]
    const atStart = (end & 1) === 0
    const n = e.points.length >> 1
    if (n < 2) continue
    const step = Math.min(3, n - 1)
    const a = atStart ? 0 : n - 1
    const b = atStart ? step : n - 1 - step
    const vx = xOf(e, b) - xOf(e, a)
    const vy = yOf(e, b) - yOf(e, a)
    const len = Math.hypot(vx, vy)
    if (len > 1e-9) {
      dirEnd.push(end)
      dirX.push(vx / len)
      dirY.push(vy / len)
    }
  }
  const count = dirEnd.length
  if (count < 3) return null

  let best = 0
  let bi = 0
  let bj = 1
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const t = angleBetween(dirX[i], dirY[i], dirX[j], dirY[j])
      if (t > best) {
        best = t
        bi = i
        bj = j
      }
    }
  }
  const thx = dirX[bi]
  const thy = dirY[bi]

  let branch = -1
  for (let k = 0; k < count; k++) {
    if (k === bi || k === bj) continue
    const deg = angleBetween(thx, thy, dirX[k], dirY[k]) * (180 / Math.PI)
    if (Math.min(deg, 180 - deg) <= TAPER_DEGREES) branch = dirEnd[k]
  }
  if (branch < 0) return null

  const nx = -thy
  const ny = thx
  const be = map.edges[branch >> 1]
  const bn = be.points.length >> 1
  const samples = new Float64Array(2 * bn)
  for (let i = 0; i < bn; i++) {
    const vx = xOf(be, i) - ox
    const vy = yOf(be, i) - oy
    samples[2 * i] = vx * thx + vy * thy
    samples[2 * i + 1] = Math.abs(vx * nx + vy * ny)
  }
  const t = taperFit(samples)
  if (t === null) return null
  let shortest = Number.POSITIVE_INFINITY
  for (const end of ends) shortest = Math.min(shortest, polylineLength(map.edges[end >> 1]))
  const move = Math.abs(t.vanish)
  if (move > TAPER_MAX_MOVE || t.sigma > TAPER_MAX_SIGMA || move > TAPER_MAX_CONSUMED * shortest) {
    return null
  }
  return {
    x: ox + thx * t.vanish,
    y: oy + thy * t.vanish,
    sigma: Math.min(Math.max(t.sigma, 0.05), 1),
  }
}

/** Remove points `from .. to` (exclusive) of an edge, with their σ and fixed flags. */
function removePoints(e: PlanarEdge, from: number, to: number): void {
  const n = e.points.length >> 1
  const keep = n - (to - from)
  const points = new Float64Array(2 * keep)
  const sigma = new Float64Array(keep)
  const fixed = new Uint8Array(keep)
  points.set(e.points.subarray(0, 2 * from))
  points.set(e.points.subarray(2 * to), 2 * from)
  sigma.set(e.sigma.subarray(0, from))
  sigma.set(e.sigma.subarray(to), from)
  fixed.set(e.fixed.subarray(0, from))
  fixed.set(e.fixed.subarray(to), from)
  e.points = points
  e.sigma = sigma
  e.fixed = fixed
}

/**
 * Drop the points a node moved from `(ox, oy)` to `(x, y)` has slid past. With `step` the unit
 * direction of the move, an incident edge that leaves the node that same way (its point
 * {@link TRIM_LOOK} along lies ahead of its end along `step`) now starts at the new position,
 * so its interior points still behind it along `step` would make it double back: they are
 * removed, nearest the node first, while the edge keeps at least {@link TRIM_MIN_POINTS}. The
 * end point stays; the caller writes it.
 */
function trimPassedOver(
  map: PlanarMap,
  ends: readonly number[],
  ox: number,
  oy: number,
  x: number,
  y: number,
): void {
  const len = Math.hypot(x - ox, y - oy)
  if (len < 1e-9) return
  const sx = (x - ox) / len
  const sy = (y - oy) / len
  for (const end of ends) {
    const e = map.edges[end >> 1]
    const atStart = (end & 1) === 0
    const n = e.points.length >> 1
    if (n < TRIM_MIN_POINTS) continue
    const look = Math.min(TRIM_LOOK, n - 1)
    const ahead = atStart ? look : n - 1 - look
    const tip = atStart ? 0 : n - 1
    if ((xOf(e, ahead) - xOf(e, tip)) * sx + (yOf(e, ahead) - yOf(e, tip)) * sy <= 0) continue
    let drop = 0
    while (n - drop > TRIM_MIN_POINTS) {
      const i = atStart ? drop + 1 : n - 2 - drop
      if ((xOf(e, i) - x) * sx + (yOf(e, i) - y) * sy < 0) drop++
      else break
    }
    if (drop === 0) continue
    if (atStart) removePoints(e, 1, 1 + drop)
    else removePoints(e, n - 1 - drop, n - 1)
  }
}

/**
 * An estimate held to the image: a node on the frame keeps its frame coordinate exactly (it may
 * only slide along the frame), and a position outside `[0, w] × [0, h]` is refused.
 */
function onImage(map: PlanarMap, ox: number, oy: number, p: NodeEstimate): NodeEstimate | null {
  const { width: w, height: h } = map
  const x = ox === 0 || ox === w ? ox : p.x
  const y = oy === 0 || oy === h ? oy : p.y
  if (x < 0 || x > w || y < 0 || y > h) return null
  return { x, y, sigma: p.sigma }
}

/**
 * Move every node of `map` to the sub-pixel point where its incident boundaries meet, after the
 * sub-pixel stage has placed the edges' interiors. Nodes are visited in index order (increasing
 * lattice id); each tries the tangent intersection ({@link solveJunction} over every incident
 * edge's {@link endTangent}) and, only when that fails, the taper ({@link taperFit}), whose
 * move also trims the points the node slid past. Every incident edge's end point and σ take the
 * one result — the node's position with σ ½ when neither estimator is trusted — and
 * {@link syncNodes} keeps the edges' ends equal to their nodes.
 */
export function refineJunctions(map: PlanarMap): void {
  const { edges, nodes } = map
  // Each node's edge ends in edge order, an edge's start before its end.
  const lists: number[][] = nodes.map(() => [])
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]
    if (e.closed || e.points.length < 4) continue
    lists[e.start].push(2 * k)
    lists[e.end].push(2 * k + 1)
  }

  for (let v = 0; v < nodes.length; v++) {
    const ends = lists[v]
    if (ends.length < 2) continue
    const node = nodes[v]
    const ox = node.x
    const oy = node.y

    const lines: TangentLine[] = []
    for (const end of ends) {
      const line = endTangent(edges[end >> 1], (end & 1) === 0, ox, oy)
      if (line !== null) lines.push(line)
    }
    const solved = solveJunction(lines, ox, oy)
    const intersection = solved === null ? null : onImage(map, ox, oy, solved)
    let taper: NodeEstimate | null = null
    if (intersection === null) {
      const t = taperJunction(map, ends, ox, oy)
      taper = t === null ? null : onImage(map, ox, oy, t)
    }
    const p = taper ?? intersection ?? { x: ox, y: oy, sigma: GRID_SIGMA }
    if (taper !== null) trimPassedOver(map, ends, ox, oy, p.x, p.y)

    for (const end of ends) {
      const e = edges[end >> 1]
      const i = (end & 1) === 0 ? 0 : (e.points.length >> 1) - 1
      e.points[2 * i] = p.x
      e.points[2 * i + 1] = p.y
      e.sigma[i] = p.sigma
    }
    node.x = p.x
    node.y = p.y
  }
  syncNodes(map)
}
