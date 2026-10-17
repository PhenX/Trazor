/**
 * Whole-boundary primitives: circles, ellipses, rectangles and rounded
 * rectangles fitted to a closed σ-weighted polyline, and runs of circular arcs
 * for an open one, each scored by the fit's objective `0.5·χ² + λ·params` with
 * χ² the weighted sum of squared **orthogonal** distances. Algebraic fits
 * (Taubin's, whose normalization removes most of the small-arc radius bias)
 * give the starts and Levenberg–Marquardt on the true geometric distance (Ahn,
 * Rauh & Warnecke 2001) finishes; the Jacobians use the envelope argument (the
 * contact parameter contributes nothing to first order).
 *
 * A primitive is offered only when it is statistically acceptable (χ² within
 * `τ²·n`, a reduced χ² of `τ²`), goes once round its centre, stays near the
 * samples, and is cheaper than the line-only optimum over the same samples;
 * the caller compares the offer's cost with its curve fit. A circle is three
 * numbers where four cubics are twenty-six, which is why the offer matters.
 *
 * Points are interleaved `x0, y0, x1, y1, …` in px (y down), σ per point in px.
 * Every fit is translation-invariant, so inkvec's pixel-centre origin needs no
 * shift here. Path forms are absolute `L` and `A` commands; `A` rotations are
 * degrees, primitive rotations radians.
 *
 * After inkvec (Apache-2.0): `crates/inkvec-fit/src/primitives.rs`, with the
 * sampled χ² of `crates/inkvec-fit/src/curves.rs` and the line-only baseline
 * of `crates/inkvec-fit/src/lib.rs` (`optimal_polygon`).
 */
import type { PathCommand } from '@trazor/core'
import type { EdgePrimitive, FitConfig, FittedEdge } from '../planar/types'
import { ellipseAt, ellipseContact, fitEllipseFrom, fitEllipseScreened } from './ellipse'
import type { EllipseFit } from './ellipse'
import { levenbergMarquardt, solveLinear, weightAt, weights } from './lm'
import { fitRoundRect, minAreaRectAngle, nearestOnRect, rectCommands } from './roundrect'
import type { RoundRectFit } from './roundrect'

/** `<circle cx cy r>`. */
export const PARAMS_CIRCLE = 3
/** `<ellipse cx cy rx ry>` plus a rotation. */
export const PARAMS_ELLIPSE = 5
/** `<rect x y width height rx ry>`: six, as the element carries both radii. */
export const PARAMS_ROUND_RECT = 6
/** `<rect x y width height>`, the corner radius at zero. */
export const PARAMS_RECT = 4
/** The rotation a tilted rectangle adds to its element. */
export const PARAMS_ROTATION = 1
/** A circular arc: one radius, two flags, an endpoint (inkvec `PARAMS_ARC`). */
export const PARAMS_ARC = 5
/**
 * Longest sweep emitted as one arc, degrees. Near 180° the endpoint
 * parametrization is ill-conditioned (the centre's offset from the chord
 * midpoint is `√(r² − h²)`, whose derivative diverges as `h → r`); at 120° its
 * derivative is 0.58, so the arc is as stable as its endpoints.
 */
export const MAX_ARC_DEGREES = 120
/**
 * Reduced χ² above which arcs are not offered at all: `τ²` at the default
 * `τ = 2` — an rms residual beyond two σ is a model the measurement rejects.
 */
export const MAX_REDUCED_CHI2 = 4

const MAX_ARC_RADIANS = MAX_ARC_DEGREES * (Math.PI / 180)
const TAU = 2 * Math.PI
/** A line segment's endpoint (inkvec `PARAMS_LINE`). */
const PARAMS_LINE = 2
/** Safety factor on the line program's cut-off (inkvec `PRUNE_SLACK`). */
const PRUNE_SLACK = 4
/** Spacing of the samples the path χ² measures to, px. */
const SAMPLE_SPACING = 0.25

/** A fitted circle with its weighted orthogonal-distance χ². */
export interface CircleFit {
  cx: number
  cy: number
  r: number
  chi2: number
}

/**
 * A primitive-or-arcs description of a run: its path form as a
 * {@link FittedEdge} (from `(x0, y0)`; a closed one back to it), the whole
 * primitive when it is one, and `cost = 0.5·chi2 + λ·params`.
 */
export interface PrimitiveOffer extends FittedEdge {
  cost: number
}

// ---------------------------------------------------------------------------
// Circles
// ---------------------------------------------------------------------------

/** `χ² = Σ w_k·(|p_k − c| − r)²`, `w_k = 1/σ_k²`; dimensionless. */
export function circleChi2(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  cx: number,
  cy: number,
  r: number,
): number {
  const n = pts.length >> 1
  let chi2 = 0
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(pts[2 * k] - cx, pts[2 * k + 1] - cy) - r
    chi2 += weightAt(sigma, k) * d * d
  }
  return chi2
}

/** Weighted centroid of the samples. */
function centroid(pts: Float64Array, w: Float64Array): [number, number, number] {
  let sw = 0
  let mx = 0
  let my = 0
  for (let k = 0; k < w.length; k++) {
    sw += w[k]
    mx += pts[2 * k] * w[k]
    my += pts[2 * k + 1] * w[k]
  }
  return [mx / sw, my / sw, sw]
}

/**
 * The plain algebraic circle fit (Kåsa): linear least squares on
 * `x² + y² + Bx + Cy + D`, weighted by `1/σ²`. Its residual `|p − c|² − r²`
 * weighs a point by its distance from the centre rather than from the circle,
 * which pulls a partial arc toward a smaller circle; kept as the reference for
 * what algebraic-only costs. Null for fewer than three samples or no circle.
 */
export function fitCircleKasa(pts: Float64Array, sigma: ArrayLike<number>): CircleFit | null {
  const n = pts.length >> 1
  if (n < 3) return null
  const w = weights(sigma, n)
  const [mx, my] = centroid(pts, w)
  const a = new Float64Array(9)
  const b = new Float64Array(3)
  const row = new Float64Array(3)
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k] - mx
    const y = pts[2 * k + 1] - my
    row[0] = x
    row[1] = y
    row[2] = 1
    const rhs = -(x * x + y * y)
    for (let i = 0; i < 3; i++) {
      b[i] += w[k] * row[i] * rhs
      for (let j = 0; j < 3; j++) a[i * 3 + j] += w[k] * row[i] * row[j]
    }
  }
  const x = new Float64Array(3)
  if (!solveLinear(a, b, 3, x)) return null
  const cx = -0.5 * x[0]
  const cy = -0.5 * x[1]
  const r2 = cx * cx + cy * cy - x[2]
  if (!(r2 > 0)) return null
  const r = Math.sqrt(r2)
  return { cx: cx + mx, cy: cy + my, r, chi2: circleChi2(pts, sigma, cx + mx, cy + my, r) }
}

/**
 * Taubin's algebraic circle fit in Chernov's Newton formulation, weighted by
 * `1/σ²`: minimizes `Σ w (|p − c|² − r²)²` under Taubin's gradient
 * normalization. In coordinates centred on the weighted centroid, from the
 * weighted mean moments of `(x, y, z = x² + y²)`, the smallest non-negative
 * root `η` of Taubin's characteristic cubic (Newton from 0, at most 40 steps,
 * stopping once `|P|` no longer decreases) gives
 * `c = ((Mxz(Myy − η) − Myz·Mxy)/2D, (Myz(Mxx − η) − Mxz·Mxy)/2D)`,
 * `D = η² − η·Mz + (Mxx·Myy − Mxy²)`, `r = √(|c|² + Mz)`. `chi2` is the
 * orthogonal residual. Null for fewer than three samples, `D ≈ 0` (collinear)
 * or a non-finite radius.
 */
export function fitCircleAlgebraic(pts: Float64Array, sigma: ArrayLike<number>): CircleFit | null {
  const n = pts.length >> 1
  if (n < 3) return null
  const w = weights(sigma, n)
  const [mx, my, sw] = centroid(pts, w)
  let mxx = 0
  let myy = 0
  let mxy = 0
  let mxz = 0
  let myz = 0
  let mzz = 0
  for (let k = 0; k < n; k++) {
    const xi = pts[2 * k] - mx
    const yi = pts[2 * k + 1] - my
    const zi = xi * xi + yi * yi
    mxx += w[k] * xi * xi
    myy += w[k] * yi * yi
    mxy += w[k] * xi * yi
    mxz += w[k] * xi * zi
    myz += w[k] * yi * zi
    mzz += w[k] * zi * zi
  }
  mxx /= sw
  myy /= sw
  mxy /= sw
  mxz /= sw
  myz /= sw
  mzz /= sw

  const mz = mxx + myy
  const covXy = mxx * myy - mxy * mxy
  const varZ = mzz - mz * mz
  const a3 = 4 * mz
  const a2 = -3 * mz * mz - mzz
  const a1 = varZ * mz + 4 * covXy * mz - mxz * mxz - myz * myz
  const a0 = mxz * (mxz * myy - myz * mxy) + myz * (myz * mxx - mxz * mxy) - varZ * covXy
  const a22 = a2 + a2
  const a33 = a3 + a3 + a3
  // Newton from 0 converges to the smallest positive root (Chernov).
  let x = 0
  let y = a0
  for (let i = 0; i < 40; i++) {
    const dy = a1 + x * (a22 + x * a33)
    if (Math.abs(dy) < 1e-300) break
    const xNew = x - y / dy
    if (xNew === x || !Number.isFinite(xNew)) break
    const yNew = a0 + xNew * (a1 + xNew * (a2 + xNew * a3))
    if (Math.abs(yNew) >= Math.abs(y)) break
    x = xNew
    y = yNew
  }
  const eta = Math.max(x, 0)
  const det = eta * eta - eta * mz + covXy
  if (Math.abs(det) < 1e-300) return null
  const cx = (mxz * (myy - eta) - myz * mxy) / det / 2
  const cy = (myz * (mxx - eta) - mxz * mxy) / det / 2
  const r = Math.sqrt(cx * cx + cy * cy + mz)
  if (!(Number.isFinite(r) && r > 0)) return null
  return { cx: cx + mx, cy: cy + my, r, chi2: circleChi2(pts, sigma, cx + mx, cy + my, r) }
}

/** Keep a circle's radius `p[2]` positive, at least 1e-6 px. */
function keepRadius(p: Float64Array): void {
  p[2] = Math.max(Math.abs(p[2]), 1e-6)
}

/**
 * Orthogonal-distance circle fit: Taubin's start, then Levenberg–Marquardt on
 * `e_k = |p_k − c| − r` weighted by `1/σ²` (Jacobian `(−(p_k − c)/|p_k − c|, −1)`;
 * a sample on the centre has no direction and is skipped), the radius kept at
 * least 1e-6 px, at most 100 iterations. Returns whichever of the refined and
 * the algebraic circle has the smaller χ².
 */
export function fitCircle(pts: Float64Array, sigma: ArrayLike<number>): CircleFit | null {
  const init = fitCircleAlgebraic(pts, sigma)
  if (init === null) return null
  const n = pts.length >> 1
  const w = weights(sigma, n)
  const evaluate = (p: Float64Array, jtj: Float64Array, jtr: Float64Array): number => {
    jtj.fill(0)
    jtr.fill(0)
    let chi2 = 0
    for (let k = 0; k < n; k++) {
      const dx = pts[2 * k] - p[0]
      const dy = pts[2 * k + 1] - p[1]
      const d = Math.hypot(dx, dy)
      if (d < 1e-12) continue
      const res = d - p[2]
      const j0 = -dx / d
      const j1 = -dy / d
      const wk = w[k]
      chi2 += wk * res * res
      jtr[0] += wk * j0 * res
      jtr[1] += wk * j1 * res
      jtr[2] -= wk * res
      jtj[0] += wk * j0 * j0
      jtj[1] += wk * j0 * j1
      jtj[2] -= wk * j0
      jtj[3] += wk * j1 * j0
      jtj[4] += wk * j1 * j1
      jtj[5] -= wk * j1
      jtj[6] -= wk * j0
      jtj[7] -= wk * j1
      jtj[8] += wk
    }
    return chi2
  }
  const out = levenbergMarquardt([init.cx, init.cy, init.r], 100, evaluate, keepRadius)
  if (out === null) return null
  const refined = { cx: out.p[0], cy: out.p[1], r: out.p[2], chi2: out.chi2 }
  return refined.chi2 <= init.chi2 ? refined : init
}

/** The five-start orthogonal ellipse fit, seeded by {@link fitCircle} of the same samples. */
export function fitEllipse(pts: Float64Array, sigma: ArrayLike<number>): EllipseFit | null {
  if (pts.length >> 1 < 6) return null
  return fitEllipseFrom(pts, sigma, fitCircle(pts, sigma))
}

// ---------------------------------------------------------------------------
// Sweeps, arcs and path forms
// ---------------------------------------------------------------------------

/**
 * Total signed angle the samples sweep about `(cx, cy)`, the closing step
 * included when `closed`; positive is increasing angle (SVG `sweep = 1`).
 */
export function totalSweep(pts: Float64Array, cx: number, cy: number, closed: boolean): number {
  const n = pts.length >> 1
  let total = 0
  let prev = Math.atan2(pts[1] - cy, pts[0] - cx)
  const last = closed ? n : n - 1
  for (let k = 1; k <= last; k++) {
    const i = k % n
    const a = Math.atan2(pts[2 * i + 1] - cy, pts[2 * i] - cx)
    let d = a - prev
    if (d > Math.PI) d -= TAU
    else if (d < -Math.PI) d += TAU
    total += d
    prev = a
  }
  return total
}

/**
 * Arcs of the circle `(cx, cy, r)` from angle `a0` sweeping `delta`, from the
 * caller's current point to exactly `(endX, endY)`, in
 * `max(1, ceil(|delta|/MAX_ARC_DEGREES − 1e-9))` equal pieces whose interior
 * split points lie on the circle.
 */
function circleArcs(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  delta: number,
  endX: number,
  endY: number,
): PathCommand[] {
  const count = Math.ceil(Math.abs(delta) / MAX_ARC_RADIANS - 1e-9)
  const pieces = count >= 1 ? count : 1
  const sweep = delta > 0
  const largeArc = Math.abs(delta) / pieces > Math.PI
  const out: PathCommand[] = []
  for (let i = 1; i <= pieces; i++) {
    const a = a0 + (delta * i) / pieces
    const x = i === pieces ? endX : cx + r * Math.cos(a)
    const y = i === pieces ? endY : cy + r * Math.sin(a)
    out.push({ type: 'A', rx: r, ry: r, rotation: 0, largeArc, sweep, x, y })
  }
  return out
}

/** Largest distance from the first sample to any other, px. */
function spanFromFirst(pts: Float64Array): number {
  let span = 0
  for (let k = 1; k < pts.length >> 1; k++) {
    span = Math.max(span, Math.hypot(pts[2 * k] - pts[0], pts[2 * k + 1] - pts[1]))
  }
  return span
}

/**
 * The run as arcs of the already fitted circle `cf`, from its first sample to
 * its last (or back to the first when `closed`), or null when the circle's χ²
 * exceeds `MAX_REDUCED_CHI2·n`, its radius is over a thousand times the run's
 * extent (a straight run in disguise) or the run sweeps under 1e-3 rad.
 */
function arcsOnCircle(pts: Float64Array, closed: boolean, cf: CircleFit): PathCommand[] | null {
  const n = pts.length >> 1
  if (cf.chi2 > MAX_REDUCED_CHI2 * n) return null
  if (!(Number.isFinite(cf.r) && cf.r <= 1e3 * Math.max(spanFromFirst(pts), 1))) return null
  const delta = totalSweep(pts, cf.cx, cf.cy, closed)
  if (Math.abs(delta) < 1e-3) return null
  const a0 = Math.atan2(pts[1] - cf.cy, pts[0] - cf.cx)
  const endX = closed ? pts[0] : pts[2 * n - 2]
  const endY = closed ? pts[1] : pts[2 * n - 1]
  return circleArcs(cf.cx, cf.cy, cf.r, a0, delta, endX, endY)
}

/**
 * The run as circular arcs, when a circle explains it: from its first sample
 * to its last (back to the first when `closed`), radius and interior split
 * points from {@link fitCircle}, endpoints the measurements. Null for fewer
 * than four samples, a reduced χ² over `MAX_REDUCED_CHI2`, a straight run or a
 * negligible sweep.
 */
export function fitArcs(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  closed: boolean,
): PathCommand[] | null {
  if (pts.length >> 1 < 4) return null
  const cf = fitCircle(pts, sigma)
  return cf === null ? null : arcsOnCircle(pts, closed, cf)
}

/** The ellipse primitive in the fitter's form. */
function ellipseOf(e: Extract<EdgePrimitive, { kind: 'ellipse' }>): EllipseFit {
  return { cx: e.cx, cy: e.cy, rx: e.rx, ry: e.ry, angle: e.rotation, chi2: 0 }
}

/**
 * An ellipse as `A` arcs from the caller's current point `(x0, y0)`: from the
 * foot of `(x0, y0)` once round in parametric angle, in pieces of at most
 * `MAX_ARC_DEGREES` (the conditioning argument holds in the ellipse's
 * normalized frame), the last ending exactly at `(x0, y0)`.
 */
function ellipseCommands(
  e: Extract<EdgePrimitive, { kind: 'ellipse' }>,
  x0: number,
  y0: number,
  increasing: boolean,
): PathCommand[] {
  const fit = ellipseOf(e)
  const scratch = new Float64Array(4)
  ellipseContact(fit, x0, y0, scratch)
  const t0 = scratch[1]
  const delta = increasing ? TAU : -TAU
  const pieces = Math.ceil(TAU / MAX_ARC_RADIANS - 1e-9)
  const rotation = (e.rotation * 180) / Math.PI
  const out: PathCommand[] = []
  for (let i = 1; i <= pieces; i++) {
    let x = x0
    let y = y0
    if (i < pieces) {
      ellipseAt(fit, t0 + (delta * i) / pieces, scratch)
      x = scratch[0]
      y = scratch[1]
    }
    out.push({ type: 'A', rx: e.rx, ry: e.ry, rotation, largeArc: false, sweep: increasing, x, y })
  }
  return out
}

/**
 * The point of `prim`'s outline nearest `(x, y)`: the radial foot on a circle,
 * the orthogonal foot on an ellipse, the nearest point of the nearest piece on
 * a rectangle.
 */
export function nearestOnPrimitive(prim: EdgePrimitive, x: number, y: number): [number, number] {
  switch (prim.kind) {
    case 'circle': {
      const d = Math.hypot(x - prim.cx, y - prim.cy)
      if (!(d > 0)) return [prim.cx + prim.r, prim.cy]
      return [prim.cx + (prim.r * (x - prim.cx)) / d, prim.cy + (prim.r * (y - prim.cy)) / d]
    }
    case 'ellipse': {
      const fit = ellipseOf(prim)
      const scratch = new Float64Array(4)
      ellipseContact(fit, x, y, scratch)
      ellipseAt(fit, scratch[1], scratch)
      return [scratch[0], scratch[1]]
    }
    case 'rect':
      return nearestOnRect(prim, x, y)
  }
}

/**
 * `prim` as path commands from the caller's current point `(x0, y0)` once round
 * and back to exactly `(x0, y0)`: a circle or an ellipse as `A` arcs of at most
 * `MAX_ARC_DEGREES`, a rectangle as `L` sides and quarter-arc corners.
 * `increasing` runs toward increasing angle (SVG `sweep = 1`, clockwise on a
 * y-down screen). Exactly the primitive when `(x0, y0)` lies on it
 * ({@link nearestOnPrimitive}); otherwise the first and last commands absorb
 * the gap.
 */
export function primitiveCommands(
  prim: EdgePrimitive,
  x0: number,
  y0: number,
  increasing: boolean,
): PathCommand[] {
  switch (prim.kind) {
    case 'circle': {
      const a0 = Math.atan2(y0 - prim.cy, x0 - prim.cx)
      return circleArcs(prim.cx, prim.cy, prim.r, a0, increasing ? TAU : -TAU, x0, y0)
    }
    case 'ellipse':
      return ellipseCommands(prim, x0, y0, increasing)
    case 'rect':
      return rectCommands(prim, x0, y0, increasing)
  }
}

/**
 * Signed area of the closed polygon by the shoelace formula, px²; positive
 * when the angle about the interior increases (clockwise on a y-down screen).
 */
export function signedArea(pts: Float64Array): number {
  const n = pts.length >> 1
  let sum = 0
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n
    sum += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]
  }
  return sum * 0.5
}

// ---------------------------------------------------------------------------
// The sampled χ² of a path (inkvec `curves::chi2`)
// ---------------------------------------------------------------------------

/** Endpoint-to-centre form of an SVG arc (SVG 1.1 appendix F.6.5), angles in radians. */
export interface ArcFrame {
  cx: number
  cy: number
  /** Radii as drawn: scaled up by `√Λ` when too small to span the chord (F.6.6). */
  rx: number
  ry: number
  phi: number
  /** Parametric angle at the start. */
  theta1: number
  /** Signed sweep, positive for `sweep = true`. */
  delta: number
}

/**
 * The centre parametrization of the arc from `(x0, y0)` to `(x1, y1)` with
 * radii `rx`, `ry` rotated by `phi` radians. Coincident endpoints or a zero
 * radius give a zero sweep, as SVG draws no arc then.
 */
export function arcCenter(
  x0: number,
  y0: number,
  rxIn: number,
  ryIn: number,
  phi: number,
  largeArc: boolean,
  sweep: boolean,
  x1: number,
  y1: number,
): ArcFrame {
  let rx = Math.abs(rxIn)
  let ry = Math.abs(ryIn)
  const hx = (x0 - x1) * 0.5
  const hy = (y0 - y1) * 0.5
  if (hx * hx + hy * hy <= 1e-24 || rx <= 1e-12 || ry <= 1e-12) {
    return { cx: x0 - rx, cy: y0, rx, ry, phi, theta1: 0, delta: 0 }
  }
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  const px = cp * hx + sp * hy
  const py = -sp * hx + cp * hy
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = Math.max(rx * rx * ry * ry - rx * rx * py * py - ry * ry * px * px, 0)
  const den = rx * rx * py * py + ry * ry * px * px
  let coef = den > 0 ? Math.sqrt(num / den) : 0
  if (largeArc === sweep) coef = -coef
  const cxp = (coef * rx * py) / ry
  const cyp = (-coef * ry * px) / rx
  const cx = cp * cxp - sp * cyp + (x0 + x1) * 0.5
  const cy = sp * cxp + cp * cyp + (y0 + y1) * 0.5
  const theta1 = Math.atan2((py - cyp) / ry, (px - cxp) / rx)
  let delta = Math.atan2((-py - cyp) / ry, (-px - cxp) / rx) - theta1
  if (!sweep && delta > 0) delta -= TAU
  else if (sweep && delta < 0) delta += TAU
  return { cx, cy, rx, ry, phi, theta1, delta }
}

/** `ceil(x)` clamped to `[lo, hi]`, a NaN taking `lo`. */
function sampleCount(x: number, lo: number, hi: number): number {
  const c = Math.ceil(x)
  return c >= lo ? Math.min(c, hi) : lo
}

/**
 * The path from `(x0, y0)` densely sampled at about `spacing` px, interleaved:
 * a line by its length, a cubic by its control polygon, an arc by
 * `max(rx, ry)·|delta|`, counts clamped to `[1|4|2, 4096]`; arcs land exactly
 * on their endpoints.
 */
export function samplePath(
  x0: number,
  y0: number,
  segs: readonly PathCommand[],
  spacing: number,
): number[] {
  const out = [x0, y0]
  let cx = x0
  let cy = y0
  for (const s of segs) {
    if (s.type === 'L') {
      const n = sampleCount(Math.hypot(s.x - cx, s.y - cy) / spacing, 1, 4096)
      for (let i = 1; i <= n; i++) out.push(cx + ((s.x - cx) * i) / n, cy + ((s.y - cy) * i) / n)
    } else if (s.type === 'C' || s.type === 'Q') {
      // A quadratic is sampled as its degree-elevated cubic.
      const ax = s.type === 'C' ? s.x1 : cx + (2 / 3) * (s.x1 - cx)
      const ay = s.type === 'C' ? s.y1 : cy + (2 / 3) * (s.y1 - cy)
      const bx = s.type === 'C' ? s.x2 : s.x + (2 / 3) * (s.x1 - s.x)
      const by = s.type === 'C' ? s.y2 : s.y + (2 / 3) * (s.y1 - s.y)
      const approx =
        Math.hypot(ax - cx, ay - cy) + Math.hypot(bx - ax, by - ay) + Math.hypot(s.x - bx, s.y - by)
      const n = sampleCount(approx / spacing, 4, 4096)
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const mt = 1 - t
        const w0 = mt * mt * mt
        const w1 = 3 * mt * mt * t
        const w2 = 3 * mt * t * t
        const w3 = t * t * t
        out.push(w0 * cx + w1 * ax + w2 * bx + w3 * s.x, w0 * cy + w1 * ay + w2 * by + w3 * s.y)
      }
    } else if (s.type === 'A') {
      const f = arcCenter(
        cx,
        cy,
        s.rx,
        s.ry,
        (s.rotation * Math.PI) / 180,
        s.largeArc,
        s.sweep,
        s.x,
        s.y,
      )
      const n = sampleCount(Math.abs(Math.max(f.rx, f.ry) * f.delta) / spacing, 2, 4096)
      const sp = Math.sin(f.phi)
      const cp = Math.cos(f.phi)
      for (let i = 1; i < n; i++) {
        const t = f.theta1 + (f.delta * i) / n
        const ex = f.rx * Math.cos(t)
        const ey = f.ry * Math.sin(t)
        out.push(f.cx + cp * ex - sp * ey, f.cy + sp * ex + cp * ey)
      }
      out.push(s.x, s.y)
    } else {
      continue
    }
    cx = s.x
    cy = s.y
  }
  return out
}

/** Distance from `(x, y)` to the segment `a → b`; a zero-length segment is the point `a`. */
function segmentDistance(x: number, y: number, ax: number, ay: number, bx: number, by: number) {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 <= 1e-24) return Math.hypot(x - ax, y - ay)
  const t = Math.min(Math.max(((x - ax) * dx + (y - ay) * dy) / l2, 0), 1)
  return Math.hypot(x - ax - dx * t, y - ay - dy * t)
}

/**
 * Distance from each sample to the polyline through the path's samples. Both
 * run the same way along the boundary, so a cursor advances through the path
 * samples and only a window of `clamp(m/8, 16, 512)` about each point's
 * expected position is searched; the distance is to the chords either side of
 * the nearest path sample, which removes the half-spacing floor of the
 * nearest-sample distance.
 */
function sampleDistances(pts: Float64Array, samples: readonly number[]): Float64Array {
  const n = pts.length >> 1
  const m = samples.length >> 1
  const out = new Float64Array(n)
  if (m === 0) return out.fill(Infinity)
  const window = Math.min(Math.max(Math.floor(m / 8), 16), 512)
  let cursor = 0
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k]
    const y = pts[2 * k + 1]
    const guess = n > 1 ? Math.floor((k * (m - 1)) / (n - 1)) : 0
    const centre = Math.max(guess, Math.max(cursor - Math.floor(window / 2), 0))
    const lo = Math.max(centre - window, 0)
    const hi = Math.min(centre + window, m - 1)
    let best = Infinity
    let bestI = cursor
    for (let i = lo; i <= hi; i++) {
      const d = Math.hypot(x - samples[2 * i], y - samples[2 * i + 1])
      if (d < best) {
        best = d
        bestI = i
      }
    }
    cursor = bestI
    let d = best
    const sx = samples[2 * bestI]
    const sy = samples[2 * bestI + 1]
    if (bestI > 0) {
      d = Math.min(d, segmentDistance(x, y, samples[2 * bestI - 2], samples[2 * bestI - 1], sx, sy))
    }
    if (bestI + 1 < m) {
      d = Math.min(d, segmentDistance(x, y, sx, sy, samples[2 * bestI + 2], samples[2 * bestI + 3]))
    }
    out[k] = d
  }
  return out
}

/**
 * `χ² = Σ (d_k/σ_k)²` of a path from `(x0, y0)` against the samples, `d_k` the
 * distance to the path sampled every 0.25 px (σ as {@link weightAt} reads it).
 * Infinite for an empty path.
 */
export function pathChi2(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  x0: number,
  y0: number,
  segs: readonly PathCommand[],
): number {
  if (segs.length === 0) return Infinity
  const d = sampleDistances(pts, samplePath(x0, y0, segs, SAMPLE_SPACING))
  let chi2 = 0
  for (let k = 0; k < d.length; k++) chi2 += d[k] * d[k] * weightAt(sigma, k)
  return chi2
}

/** Largest distance from the samples to the path from `(x0, y0)`, px; infinite for an empty path. */
export function maxDeviation(
  pts: Float64Array,
  x0: number,
  y0: number,
  segs: readonly PathCommand[],
): number {
  if (segs.length === 0 || pts.length < 4) return Infinity
  const d = sampleDistances(pts, samplePath(x0, y0, segs, SAMPLE_SPACING))
  let worst = 0
  for (let k = 0; k < d.length; k++) if (d[k] > worst) worst = d[k]
  return worst
}

// ---------------------------------------------------------------------------
// The line-only baseline (inkvec `optimal_polygon`)
// ---------------------------------------------------------------------------

/**
 * Cost of the globally optimal polygon over an open run (`best[n − 1]` of the
 * dynamic program `best[j] = min_i best[i] + ½·χ²(i, j) + λ·PARAMS_LINE`, the
 * start point not charged), `χ²(i, j)` the total-least-squares residual of
 * samples `i..j` about their best line — the scatter matrix's smaller
 * eigenvalue, O(1) from weighted prefix sums (taken about the first sample for
 * conditioning). The scan from `i` stops once `½·χ²` exceeds
 * `PRUNE_SLACK·λ·PARAMS_LINE·(j − i)`, which no longer segment can beat.
 */
function openPolygonCost(pts: Float64Array, w: Float64Array, lambda: number): number {
  const n = w.length
  if (n < 2) return 0
  const sw = new Float64Array(n + 1)
  const sx = new Float64Array(n + 1)
  const sy = new Float64Array(n + 1)
  const sxx = new Float64Array(n + 1)
  const syy = new Float64Array(n + 1)
  const sxy = new Float64Array(n + 1)
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k] - pts[0]
    const y = pts[2 * k + 1] - pts[1]
    const iv = w[k]
    sw[k + 1] = sw[k] + iv
    sx[k + 1] = sx[k] + x * iv
    sy[k + 1] = sy[k] + y * iv
    sxx[k + 1] = sxx[k] + x * x * iv
    syy[k + 1] = syy[k] + y * y * iv
    sxy[k + 1] = sxy[k] + x * y * iv
  }
  const chi2Line = (i: number, j: number): number => {
    const b = j + 1
    const ww = sw[b] - sw[i]
    if (!(ww > 0)) return 0
    const ax = sx[b] - sx[i]
    const ay = sy[b] - sy[i]
    const cxx = sxx[b] - sxx[i] - (ax * ax) / ww
    const cyy = syy[b] - syy[i] - (ay * ay) / ww
    const cxy = sxy[b] - sxy[i] - (ax * ay) / ww
    const diff = cxx - cyy
    const disc = Math.sqrt(Math.max(diff * diff + 4 * cxy * cxy, 0))
    return Math.max(0.5 * (cxx + cyy - disc), 0)
  }
  const best = new Float64Array(n).fill(Infinity)
  best[0] = 0
  for (let i = 0; i < n - 1; i++) {
    if (!Number.isFinite(best[i])) continue
    for (let j = i + 1; j < n; j++) {
      const chi2 = chi2Line(i, j)
      const c = best[i] + 0.5 * chi2 + lambda * PARAMS_LINE
      if (c < best[j]) best[j] = c
      if (0.5 * chi2 > PRUNE_SLACK * lambda * PARAMS_LINE * (j - i)) break
    }
  }
  return best[n - 1]
}

/**
 * The line-only optimum's cost over the run: open as is; closed cut at the
 * sample farthest from the centroid (the last of equal maxima) and solved open
 * over `n + 1` samples, the cut repeated at both ends.
 */
function linePolygonCost(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  closed: boolean,
  lambda: number,
): number {
  const n = pts.length >> 1
  if (!closed || n < 2) return openPolygonCost(pts, weights(sigma, n), lambda)
  let mx = 0
  let my = 0
  for (let k = 0; k < n; k++) {
    mx += pts[2 * k]
    my += pts[2 * k + 1]
  }
  mx /= n
  my /= n
  let cut = 0
  let far = -Infinity
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(pts[2 * k] - mx, pts[2 * k + 1] - my)
    if (d >= far) {
      far = d
      cut = k
    }
  }
  const opened = new Float64Array(2 * (n + 1))
  const w = new Float64Array(n + 1)
  for (let k = 0; k <= n; k++) {
    const i = (cut + k) % n
    opened[2 * k] = pts[2 * i]
    opened[2 * k + 1] = pts[2 * i + 1]
    w[k] = weightAt(sigma, i)
  }
  return openPolygonCost(opened, w, lambda)
}

// ---------------------------------------------------------------------------
// The search
// ---------------------------------------------------------------------------

/**
 * The cheapest sane offer so far. No offer may place geometry far outside the
 * samples it describes: the allowed box is their bounding box grown by eight
 * times its larger side (at least 8 px) on every side, and an arc's radii must
 * stay under that margin.
 */
class Cheapest {
  readonly loX: number
  readonly loY: number
  readonly hiX: number
  readonly hiY: number
  readonly slack: number
  best: PrimitiveOffer | null = null

  constructor(pts: Float64Array) {
    let loX = Infinity
    let loY = Infinity
    let hiX = -Infinity
    let hiY = -Infinity
    for (let k = 0; k < pts.length; k += 2) {
      loX = Math.min(loX, pts[k])
      loY = Math.min(loY, pts[k + 1])
      hiX = Math.max(hiX, pts[k])
      hiY = Math.max(hiY, pts[k + 1])
    }
    this.loX = loX
    this.loY = loY
    this.hiX = hiX
    this.hiY = hiY
    this.slack = 8 * Math.max(hiX - loX, hiY - loY, 1)
  }

  inBounds(x: number, y: number): boolean {
    return (
      Number.isFinite(x) &&
      Number.isFinite(y) &&
      x >= this.loX - this.slack &&
      x <= this.hiX + this.slack &&
      y >= this.loY - this.slack &&
      y <= this.hiY + this.slack
    )
  }

  /** Keep a non-empty, finite, in-bounds offer strictly cheaper than the best so far. */
  consider(offer: PrimitiveOffer): void {
    if (offer.segments.length === 0 || !Number.isFinite(offer.cost)) return
    if (!this.inBounds(offer.x0, offer.y0)) return
    for (const s of offer.segments) {
      if (s.type === 'Z') continue
      if (!this.inBounds(s.x, s.y)) return
      if ((s.type === 'C' || s.type === 'Q') && !this.inBounds(s.x1, s.y1)) return
      if (s.type === 'C' && !this.inBounds(s.x2, s.y2)) return
      if (s.type === 'A' && !(Math.max(s.rx, s.ry) <= this.slack && Number.isFinite(s.rx + s.ry))) {
        return
      }
    }
    if (this.best === null || offer.cost < this.best.cost) this.best = offer
  }
}

/** The run the search describes and what every offer is judged against. */
interface Run {
  pts: Float64Array
  sigma: ArrayLike<number>
  closed: boolean
  lambda: number
  /** The χ² gate on a whole primitive: `τ²·n`, a reduced χ² of `τ²`. */
  gate: number
}

/** Whether a closed run goes once round `(cx, cy)`: a sweep over 1.9π and under 3π. */
function windsOnce(pts: Float64Array, cx: number, cy: number): boolean {
  const sweep = Math.abs(totalSweep(pts, cx, cy, true))
  return sweep > 1.9 * Math.PI && sweep < 3 * Math.PI
}

/** A closed primitive's offer: its path from the foot of the first sample, with its cost. */
function wholeOffer(
  run: Run,
  primitive: EdgePrimitive,
  chi2: number,
  params: number,
  increasing: boolean,
): PrimitiveOffer {
  const [x0, y0] = nearestOnPrimitive(primitive, run.pts[0], run.pts[1])
  return {
    x0,
    y0,
    segments: primitiveCommands(primitive, x0, y0, increasing),
    closed: true,
    params,
    chi2,
    primitive,
    cost: 0.5 * chi2 + run.lambda * params,
  }
}

/**
 * The circular-arc offer: for an open run its arcs, costed as a path (sampled
 * χ² plus `PARAMS_ARC` per arc, the shared start point not charged); for a
 * closed run that goes once round the centre and passes the gate, the whole
 * `<circle>` at three parameters.
 */
function offerArcs(run: Run, circle: CircleFit | null, best: Cheapest): void {
  if (circle === null) return
  const { pts } = run
  const arcs = arcsOnCircle(pts, run.closed, circle)
  if (arcs === null) return
  if (!run.closed) {
    const chi2 = pathChi2(pts, run.sigma, pts[0], pts[1], arcs)
    const params = PARAMS_ARC * arcs.length
    best.consider({
      x0: pts[0],
      y0: pts[1],
      segments: arcs,
      closed: false,
      params,
      chi2,
      cost: 0.5 * chi2 + run.lambda * params,
    })
    return
  }
  if (circle.chi2 > run.gate || !windsOnce(pts, circle.cx, circle.cy)) return
  const sweep = totalSweep(pts, circle.cx, circle.cy, true)
  const primitive: EdgePrimitive = { kind: 'circle', cx: circle.cx, cy: circle.cy, r: circle.r }
  best.consider(wholeOffer(run, primitive, circle.chi2, PARAMS_CIRCLE, sweep > 0))
}

/**
 * The whole `<ellipse>` offer for a closed run: the screened orthogonal fit,
 * finite and with radii at most a thousand times the run's extent (a thin
 * sliver is fitted well by an absurdly eccentric ellipse), passing the gate
 * and going once round its centre.
 */
function offerEllipse(run: Run, circle: CircleFit | null, increasing: boolean, best: Cheapest) {
  const { pts } = run
  const span = Math.max(spanFromFirst(pts), 1)
  const e = fitEllipseScreened(pts, run.sigma, circle, run.gate)
  if (e === null) return
  const sane =
    Number.isFinite(e.rx) &&
    Number.isFinite(e.ry) &&
    Number.isFinite(e.cx) &&
    Number.isFinite(e.cy) &&
    Math.max(e.rx, e.ry) <= 1e3 * span
  if (!sane || !(e.chi2 <= run.gate) || !windsOnce(pts, e.cx, e.cy)) return
  const primitive: EdgePrimitive = {
    kind: 'ellipse',
    cx: e.cx,
    cy: e.cy,
    rx: e.rx,
    ry: e.ry,
    rotation: e.angle,
  }
  best.consider(wholeOffer(run, primitive, e.chi2, PARAMS_ELLIPSE, increasing))
}

/**
 * The rounded-rectangle and plain-rectangle offers for a closed run, each
 * axis-aligned and, when the minimum-area bounding rectangle is tilted, also
 * with a free rotation at one parameter more; the objective picks (a corner
 * radius the noise cannot resolve is not worth two parameters). Each must pass
 * the gate with a positive width and height.
 */
function offerRoundRects(run: Run, increasing: boolean, best: Cheapest): void {
  const { pts, sigma } = run
  const fits: [RoundRectFit | null, number][] = [
    [fitRoundRect(pts, sigma, null), PARAMS_ROUND_RECT],
    [fitRoundRect(pts, sigma, 0), PARAMS_RECT],
  ]
  const tilt = minAreaRectAngle(pts)
  if (tilt !== 0) {
    fits.push(
      [fitRoundRect(pts, sigma, null, tilt, true), PARAMS_ROUND_RECT],
      [fitRoundRect(pts, sigma, 0, tilt, true), PARAMS_RECT],
    )
  }
  for (const [rr, base] of fits) {
    if (rr === null || !(rr.chi2 <= run.gate) || !(rr.hw > 0 && rr.hh > 0)) continue
    const primitive: EdgePrimitive = {
      kind: 'rect',
      cx: rr.cx,
      cy: rr.cy,
      w: 2 * rr.hw,
      h: 2 * rr.hh,
      r: rr.r,
      rotation: rr.rotation,
    }
    const params = base + (rr.rotation === 0 ? 0 : PARAMS_ROTATION)
    best.consider(wholeOffer(run, primitive, rr.chi2, params, increasing))
  }
}

/**
 * The cheapest primitive-or-arcs description of a run under the objective
 * `0.5·χ² + λ·params`, or null.
 *
 * Offers, in order (a tie keeps the earlier): the circular arcs (an open run's
 * only offer; for a closed run the whole circle), then for a closed run the
 * ellipse and the (rounded) rectangles. A whole primitive is costed by its own
 * parameters and orthogonal χ², its path starting at the foot of the first
 * sample on it and closing there; open arcs run from the first sample to the
 * last. Null for fewer than four samples or sigmas, when no offer is
 * acceptable, or when the best is not cheaper than the line-only optimum over
 * the same samples — the "not fitting" baseline this search computes itself.
 * The caller compares the cost with its curve fit's, in the same units.
 */
export function fitPrimitiveOrArcs(
  points: Float64Array,
  sigma: Float64Array,
  closed: boolean,
  cfg: FitConfig,
): PrimitiveOffer | null {
  const n = points.length >> 1
  if (n < 4 || sigma.length < n) return null
  const run: Run = {
    pts: points.length === 2 * n ? points : points.subarray(0, 2 * n),
    sigma: sigma.length === n ? sigma : sigma.subarray(0, n),
    closed,
    lambda: cfg.lambda,
    gate: cfg.tau * cfg.tau * n,
  }
  // One orthogonal circle serves both the arcs and the ellipse's near-circle starts.
  const circle = fitCircle(run.pts, run.sigma)
  const best = new Cheapest(run.pts)
  offerArcs(run, circle, best)
  if (closed) {
    const increasing = signedArea(run.pts) >= 0
    offerEllipse(run, circle, increasing, best)
    offerRoundRects(run, increasing, best)
  }
  if (best.best === null) return null
  const baseline = linePolygonCost(run.pts, run.sigma, closed, cfg.lambda)
  return best.best.cost < baseline ? best.best : null
}
