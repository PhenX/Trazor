/**
 * Circles fitted to any span of a measured polyline in constant time, and the
 * circular arc a span is offered as.
 *
 * The circle fit is Kåsa's algebraic fit (Kåsa 1976, "A circle fitting procedure
 * and its error analysis", IEEE Trans. Instrum. Meas. 25(1)). With `z = x² + y²`
 * a circle is `z + a·x + b·y + c = 0`, centre `(−a/2, −b/2)`, `r² = (a² + b²)/4 − c`,
 * and the algebraic residual `|p − centre|² − r²` is linear in `(a, b, c)`, so
 * minimizing `Σ w·(z + a·x + b·y + c)²` (`w = 1/σ²`) is a 3x3 linear problem whose
 * normal equations need only ten weighted moments, kept as prefix sums.
 *
 * The arc offered for a span is the arc a renderer draws: SVG rebuilds the circle
 * from the two endpoints and a radius, so the radius written is the endpoints'
 * mean distance from the fitted centre, and χ² is measured about the circle
 * {@link arcCenter} rebuilds from it.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/candidates.rs` (`CirclePrefix`, and
 * `try_arc` without its end-break and parameter charges).
 */
import { arcCenter, MAX_ARC_DEGREES, unitVec } from './curves'
import type { Vec } from './curves'
import { fmax, signum, solve3 } from './roots'

/** Moments per prefix entry: `w·[1, x, y, z, x², x·y, y², x·z, y·z, z²]`. */
const MOMENTS = 10

/** A circle fitted to a span: centre and radius (px) and its χ² ({@link CirclePrefix.residualAbout}). */
export interface CircleFit {
  cx: number
  cy: number
  r: number
  chi2: number
}

/**
 * Weighted moments of `(x, y, x² + y²)` along a polyline, so a circle can be
 * fitted to any span `[i, j]` in O(1). Weights are `1/σ²`, σ floored at 1e-3 px
 * and taken as 0.5 beyond `sigma`.
 */
export class CirclePrefix {
  /** Entry `k` (of `n + 1`) holds the moments of points `0..k`. */
  private readonly m: Float64Array
  private readonly win = new Float64Array(MOMENTS)
  private readonly mat = new Float64Array(9)
  private readonly rhs = new Float64Array(3)
  private readonly sol = new Float64Array(3)

  constructor(pts: Float64Array, sigma: ArrayLike<number>) {
    const n = pts.length >> 1
    this.m = new Float64Array(MOMENTS * (n + 1))
    const acc = new Float64Array(MOMENTS)
    for (let k = 0; k < n; k++) {
      const sg = fmax(k < sigma.length ? sigma[k] : 0.5, 1e-3)
      const w = 1 / (sg * sg)
      const x = pts[2 * k]
      const y = pts[2 * k + 1]
      const z = x * x + y * y
      acc[0] += w
      acc[1] += w * x
      acc[2] += w * y
      acc[3] += w * z
      acc[4] += w * x * x
      acc[5] += w * x * y
      acc[6] += w * y * y
      acc[7] += w * x * z
      acc[8] += w * y * z
      acc[9] += w * z * z
      this.m.set(acc, MOMENTS * (k + 1))
    }
  }

  /** The ten moments over the inclusive range `[i, j]`, into a shared buffer. */
  private window(i: number, j: number): Float64Array {
    const a = MOMENTS * i
    const b = MOMENTS * (j + 1)
    for (let k = 0; k < MOMENTS; k++) this.win[k] = this.m[b + k] - this.m[a + k]
    return this.win
  }

  /**
   * RMS distance (px) of the points `[i, j]` from their weighted centroid, floored
   * at 1: the span's size, against which an implausibly large radius is judged.
   */
  scale(i: number, j: number): number {
    const w = this.window(i, j)
    const s0 = w[0]
    if (s0 <= 0) return 1
    const varX = Math.max(w[4] - (w[1] * w[1]) / s0, 0) / s0
    const varY = Math.max(w[6] - (w[2] * w[2]) / s0, 0) / s0
    return Math.max(Math.sqrt(varX + varY), 1)
  }

  /**
   * χ² of the points `[i, j]` about the circle `(cx, cy, r)`, from the algebraic
   * residual `e = |p − c|² − r² = d·(2r + d)` (`d` the signed distance), so
   * `e²/4r² ≈ d²` near the circle. O(1); infinite for `r ≤ 1e-12`.
   */
  residualAbout(i: number, j: number, cx: number, cy: number, r: number): number {
    if (r <= 1e-12) return Infinity
    const w = this.window(i, j)
    const a = -2 * cx
    const b = -2 * cy
    const cc = cx * cx + cy * cy - r * r
    return Math.max(algebraicResidual(w, a, b, cc), 0) / (4 * r * r)
  }

  /**
   * Kåsa fit to the points `[i, j]`. Null for zero weight, a system `solve3`
   * finds singular (coincident points) or a non-positive `r²`. Two points or
   * nearly collinear ones give an arbitrary or huge radius rather than null; the
   * algebraic fit is biased towards smaller radii on short arcs.
   */
  fit(i: number, j: number): CircleFit | null {
    const w = this.window(i, j)
    if (w[0] <= 0) return null
    // Normal equations [[Σxx, Σxy, Σx], [Σxy, Σyy, Σy], [Σx, Σy, Σ1]]·(a, b, c) = −(Σxz, Σyz, Σz).
    const m = this.mat
    m[0] = w[4]
    m[1] = w[5]
    m[2] = w[1]
    m[3] = w[5]
    m[4] = w[6]
    m[5] = w[2]
    m[6] = w[1]
    m[7] = w[2]
    m[8] = w[0]
    this.rhs[0] = -w[7]
    this.rhs[1] = -w[8]
    this.rhs[2] = -w[3]
    if (!solve3(m, this.rhs, this.sol)) return null
    const a = this.sol[0]
    const b = this.sol[1]
    const c = this.sol[2]
    const r2 = 0.25 * (a * a + b * b) - c
    if (!(Number.isFinite(r2) && r2 > 1e-12)) return null
    const resid = algebraicResidual(w, a, b, c)
    return { cx: -0.5 * a, cy: -0.5 * b, r: Math.sqrt(r2), chi2: Math.max(resid, 0) / (4 * r2) }
  }
}

/**
 * `Σ w·(z + a·x + b·y + c)²` from the ten window moments
 * `w = [Σ1, Σx, Σy, Σz, Σxx, Σxy, Σyy, Σxz, Σyz, Σzz]`.
 */
function algebraicResidual(w: Float64Array, a: number, b: number, c: number): number {
  return (
    w[9] +
    a * a * w[4] +
    b * b * w[6] +
    c * c * w[0] +
    2 * (a * w[7] + b * w[8] + c * w[3] + a * b * w[5] + a * c * w[1] + b * c * w[2])
  )
}

/** A circular arc fitted to one span, as it will be drawn. */
export interface ArcSpanFit {
  /** χ² of the span's points about the drawn circle. */
  chi2: number
  /** Radius to write, px: the endpoints' mean distance from the fitted centre. */
  radius: number
  /** SVG `large-arc-flag`. */
  largeArc: boolean
  /** SVG `sweep-flag`: the arc turns towards increasing angle (clockwise on screen). */
  sweep: boolean
  /** The arc's own unit tangent at its start, in the direction of travel. */
  t0: Vec
  /** The arc's own unit tangent at its end, in the direction of travel. */
  t1: Vec
}

/** Points sampled along a span to check it goes round the centre one way. */
export const DIRECTION_SAMPLES = 8

/**
 * The circular arc for the span `(i, j)` of `pts` (interleaved), or null:
 *
 * 1. Kåsa-fit a circle ({@link CirclePrefix.fit}); refuse a radius at or below
 *    1e-6 px or over a thousand times the span's own size (a straight run);
 * 2. the points must go round the centre one way only: the cross products of
 *    consecutive radius vectors, at a stride of `max((j − i)/8, 1)`, never change sign;
 * 3. the turn from start to end must agree with that sense and lie between 1e-3
 *    rad and {@link MAX_ARC_DEGREES};
 * 4. the radius is the endpoints' mean distance from the centre and χ² is taken
 *    about the circle SVG rebuilds from it ({@link arcCenter}).
 *
 * The span needs an interior point (`j ≥ i + 2`). The DP's price adds
 * `λ·arcParams()` and the breaks between `t0`, `t1` and the estimated tangents.
 */
export function fitArcSpan(
  pts: Float64Array,
  pre: CirclePrefix,
  i: number,
  j: number,
): ArcSpanFit | null {
  if (j < i + 2) return null
  const circle = pre.fit(i, j)
  if (!circle) return null
  const { cx, cy, r } = circle
  if (!Number.isFinite(r) || r <= 1e-6) return null
  if (r > 1e3 * Math.max(pre.scale(i, j), 1)) return null
  const stride = Math.max(Math.floor((j - i) / DIRECTION_SAMPLES), 1)
  const sx = pts[2 * i]
  const sy = pts[2 * i + 1]
  const ex = pts[2 * j]
  const ey = pts[2 * j + 1]
  let sign = 0
  let prevX = sx - cx
  let prevY = sy - cy
  let k = i
  while (k < j) {
    k = Math.min(k + stride, j)
    const curX = pts[2 * k] - cx
    const curY = pts[2 * k + 1] - cy
    const cross = prevX * curY - prevY * curX
    if (Math.abs(cross) > 1e-12) {
      if (sign === 0) sign = signum(cross)
      else if (signum(cross) !== sign) return null
    }
    prevX = curX
    prevY = curY
  }
  if (sign === 0) return null
  const usx = sx - cx
  const usy = sy - cy
  const uex = ex - cx
  const uey = ey - cy
  let turn = Math.atan2(usx * uey - usy * uex, usx * uex + usy * uey)
  if (turn === 0 || signum(turn) !== sign) return null
  turn = Math.abs(turn)
  if (!(turn >= 1e-3 && turn <= MAX_ARC_DEGREES * (Math.PI / 180))) return null
  const ccw = sign > 0
  // The tangent is the radius turned a quarter in the direction of travel.
  const t0 = ccw ? unitVec(-usy, usx) : unitVec(usy, -usx)
  const t1 = ccw ? unitVec(-uey, uex) : unitVec(uey, -uex)
  if (!t0 || !t1) return null
  const largeArc = turn > Math.PI
  const radius = 0.5 * (Math.hypot(sx - cx, sy - cy) + Math.hypot(ex - cx, ey - cy))
  const drawn = arcCenter(sx, sy, radius, largeArc, ccw, ex, ey)
  const chi2 = pre.residualAbout(i, j, drawn.cx, drawn.cy, drawn.r)
  return { chi2, radius, largeArc, sweep: ccw, t0, t1 }
}
