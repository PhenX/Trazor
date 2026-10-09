/**
 * What each model costs on one span `i..j` of a measured polyline, as the
 * multimodel dynamic program prices it, in nats:
 *
 * | model          | fitter                                          | cost                              |
 * | -------------- | ----------------------------------------------- | --------------------------------- |
 * | line           | total least squares (`PrefixSums.chi2Line`)     | `½χ² + 2λ + breaks (+ bow)`       |
 * | G1 cubic       | area and moment matching, Levien's quartic      | `½χ² + 6λ + wobble + over-turn`   |
 * | circular arc   | Kåsa circle (`fitArcSpan`)                      | `½χ² + 5λ + breaks`               |
 * | elliptical arc | Taubin conic, Sampson distance                  | `½χ² + 7λ + breaks`               |
 *
 * "breaks" is the `breakCost` between the model's own end directions and the
 * estimated tangents at whichever ends are joins; the G1 cubic takes the
 * estimated tangents as its end directions and pays none. The cubic and arc
 * prices are the ones in force (`./cost`).
 *
 * The G1 cubic is scored here with early abandoning ({@link bestCubicBounded}):
 * the program reads a cubic's residual only to ask whether it can beat the best
 * cost at its end, whether it settles the ellipse's price gate, and whether it
 * is over the scan's cut-off floor, so each root's sum stops once its partial
 * sum settles all three. That is branch and bound inside a dynamic program,
 * one candidate at a time: Morin & Marsten (1976), "Branch-and-bound strategies
 * for dynamic programming", Oper. Res. 24(4); the per-candidate test of Killick,
 * Fearnhead & Eckley (2012), "Optimal detection of changepoints with a linear
 * computational cost", JASA 107; early abandoning of a sum of non-negative terms
 * as in Rakthanmanon et al. (2012), KDD, §4.1.3.
 *
 * Points are interleaved `x0, y0, x1, y1, …` (px), σ per point (px). The fit is
 * translation invariant, so the pixel-center convention does not enter.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/candidates.rs` (`bow_penalty`,
 * `line_cost_terms`, `end_break_cost`, `try_arc`, `try_ellipse`,
 * `ellipse_sampson_chi2`, `ellipse_turn`, `ellipse_end_tangents`),
 * `candidates/bounded.rs` and `candidates/turn.rs`.
 */
import type { FitConfig } from '../planar/types'
import type { ArcSpanFit, CirclePrefix } from './circle'
import { fitArcSpan } from './circle'
import {
  arcParams,
  cubicMaxTurnRadians,
  cubicParams,
  PARAMS_ELLIPTICAL_ARC,
  PARAMS_LINE,
} from './cost'
import {
  armsFromMoments,
  bestCubic,
  cubicFromArms,
  CubicSamples,
  g1Frame,
  MAX_ARM,
  NEWTON_STEPS,
} from './cubicfit'
import type { ArcFrame, Bezier, Vec } from './curves'
import { arcEllipseCenter, MAX_ARC_DEGREES, unitVec } from './curves'
import { taubinEllipse } from './ellipse'
import type { EllipseFit } from './ellipse'
import { fmax, fmin } from './roots'
import { breakCost, turnAngle } from './tangents'
import type { Tangents } from './tangents'

/** Most elongated ellipse worth fitting, major over minor radius. */
export const ELLIPSE_MAX_ASPECT = 12

/** Fewest span steps (`j − i`) an elliptical arc is tried on. */
export const ELLIPSE_MIN_POINTS = 24

/**
 * Span lengths an elliptical arc is tried on are multiples of this: the
 * algebraic fit is O(j − i), so the ellipse stays on a sparse grid of candidate
 * ends rather than making the program cubic.
 */
export const ELLIPSE_LENGTH_STRIDE = 16

/** Radians per degree, as Rust's `to_radians` multiplies. */
const RADIANS_PER_DEGREE = Math.PI / 180

/**
 * What a line's residual sign pattern says against it: when a circular arc
 * through the same span fits at least four times better (`4·χ²_arc < χ²_line`)
 * the residuals bow to one side and are not noise, so the line is charged
 * `span·ln 2` nats, one bit per point for which side it falls on. `span` is `j − i`.
 */
export function bowPenalty(chi2Line: number, chi2Arc: number, span: number): number {
  return chi2Arc * 4 < chi2Line ? span * Math.LN2 : 0
}

/**
 * The break costs (nats) a segment from `i` to `j` pays at its ends: between the
 * estimated tangent leaving `i` and its own start direction `d0`, and between its
 * end direction `d1` and the estimated tangent arriving at `j`. An end is charged
 * only where it is a join: not at the first or last point of an open polyline of
 * `n` points, unless `joinsAtEnds` marks the polyline as an opened loop.
 */
export function endBreakCost(
  tan: Tangents,
  n: number,
  i: number,
  j: number,
  d0: Vec,
  d1: Vec,
  lambda: number,
  joinsAtEnds: boolean,
): number {
  let dev = 0
  if (i > 0 || joinsAtEnds) dev += breakCost(tan.outgoing[i], d0, lambda)
  if (j + 1 < n || joinsAtEnds) dev += breakCost(d1, tan.incoming[j], lambda)
  return dev
}

/** The chord a line's breaks are measured against, reused across calls. */
const chordScratch: Vec = { x: 0, y: 0 }

/**
 * Cost of the line `i → j` with total-least-squares residual `chi2`:
 * `½·χ² + λ·PARAMS_LINE + brk(t_out[i], chord) + brk(chord, t_in[j])`, the
 * breaks charged at joins only ({@link endBreakCost}).
 */
export function lineCostTerms(
  pts: Float64Array,
  tan: Tangents,
  i: number,
  j: number,
  chi2: number,
  cfg: FitConfig,
  joinsAtEnds: boolean,
): number {
  chordScratch.x = pts[2 * j] - pts[2 * i]
  chordScratch.y = pts[2 * j + 1] - pts[2 * i + 1]
  const dev = endBreakCost(
    tan,
    pts.length >> 1,
    i,
    j,
    chordScratch,
    chordScratch,
    cfg.lambda,
    joinsAtEnds,
  )
  return 0.5 * chi2 + cfg.lambda * PARAMS_LINE + dev
}

/** A circular arc fitted to one span, with what it costs there. */
export interface ArcSpan extends ArcSpanFit {
  /** `½·χ² + λ·arcParams() + end breaks`, nats. */
  cost: number
}

/**
 * The circular arc for span `(i, j)` ({@link fitArcSpan}: Kåsa circle, one-way
 * sweep between 1e-3 rad and `MAX_ARC_DEGREES`, scored as SVG draws it) and its
 * cost, or null. Needs an interior point (`j ≥ i + 2`).
 */
export function tryArc(
  pts: Float64Array,
  tan: Tangents,
  pre: CirclePrefix,
  i: number,
  j: number,
  cfg: FitConfig,
  joinsAtEnds: boolean,
): ArcSpan | null {
  const f = fitArcSpan(pts, pre, i, j)
  if (!f) return null
  const dev = endBreakCost(tan, pts.length >> 1, i, j, f.t0, f.t1, cfg.lambda, joinsAtEnds)
  return {
    cost: 0.5 * f.chi2 + cfg.lambda * arcParams() + dev,
    chi2: f.chi2,
    radius: f.radius,
    largeArc: f.largeArc,
    sweep: f.sweep,
    t0: f.t0,
    t1: f.t1,
  }
}

/** An elliptical arc fitted to one span, as drawn, with what it costs there. */
export interface EllipseSpan {
  /** `½·χ² + λ·PARAMS_ELLIPTICAL_ARC + end breaks`, nats. */
  cost: number
  /** Radius along the ellipse's own x-axis, as drawn, px. */
  rx: number
  /** Radius along the ellipse's own y-axis, as drawn, px. */
  ry: number
  /** Rotation of the x-axis, radians. */
  phi: number
  largeArc: boolean
  sweep: boolean
  /** The arc's own unit tangent at its start, in the direction of travel. */
  t0: Vec
  /** The arc's own unit tangent at its end, in the direction of travel. */
  t1: Vec
}

/**
 * Weighted Sampson distance of `pts` (interleaved) from the ellipse with center
 * `(cx, cy)`, radii `rx`, `ry` and rotation `phi`: in the ellipse's frame `(u, v)`
 * the curve is `Q = u²/rx² + v²/ry² − 1 = 0` and `d ≈ Q / |∇Q|`,
 * `|∇Q| = √(4u²/rx⁴ + 4v²/ry⁴)` — the first-order geometric distance, accurate
 * near the curve and closed form where the exact one needs a quartic. Returns
 * `Σ (d/σ)²` (σ floored at 1e-3, 0.5 beyond `sigma`); infinite if a point sits at
 * the center.
 */
export function ellipseSampsonChi2(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  phi: number,
): number {
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  const ax = 1 / (rx * rx)
  const ay = 1 / (ry * ry)
  const n = pts.length >> 1
  let sum = 0
  for (let k = 0; k < n; k++) {
    const dx = pts[2 * k] - cx
    const dy = pts[2 * k + 1] - cy
    const u = cp * dx + sp * dy
    const v = -sp * dx + cp * dy
    const q = u * u * ax + v * v * ay - 1
    const g = Math.sqrt(4 * u * u * ax * ax + 4 * v * v * ay * ay)
    if (g < 1e-12) return Infinity
    const d = q / g
    const sg = fmax(k < sigma.length ? sigma[k] : 0.5, 1e-3)
    sum += (d / sg) * (d / sg)
  }
  return sum
}

/** How far and which way a run goes round an ellipse. */
interface EllipseTurn {
  /** `|total turn|`, radians. */
  turn: number
  ccw: boolean
}

/** The step from angle `prev` to `a`, unwrapped into `(−π, π]`. */
function angleStep(a: number, prev: number): number {
  let d = a - prev
  if (d > Math.PI) d -= 2 * Math.PI
  else if (d < -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * How far, and which way, the points go round a fitted ellipse, or null if they
 * do not go round it monotonically or the turn lies outside
 * `[1e-3, MAX_ARC_DEGREES]`. Each point's parametric angle is
 * `atan2(v/ry, u/rx)` of its projection into the ellipse's frame (monotone in the
 * true one near the curve); the sense is set by the first step, any later step
 * backwards by more than 1e-3 rad refuses, and steps are unwrapped into `(−π, π]`.
 */
function ellipseTurn(span: Float64Array, fit: EllipseFit): EllipseTurn | null {
  const sp0 = Math.sin(fit.angle)
  const cp0 = Math.cos(fit.angle)
  const angleOf = (k: number): number => {
    const dx = span[2 * k] - fit.cx
    const dy = span[2 * k + 1] - fit.cy
    const u = cp0 * dx + sp0 * dy
    const v = -sp0 * dx + cp0 * dy
    return Math.atan2(v / fit.ry, u / fit.rx)
  }
  const n = span.length >> 1
  let prev = angleOf(0)
  const ccw = angleStep(angleOf(1), prev) > 0
  let total = 0
  for (let k = 1; k < n; k++) {
    const a = angleOf(k)
    const d = angleStep(a, prev)
    if ((ccw && d < -1e-3) || (!ccw && d > 1e-3)) return null
    total += d
    prev = a
  }
  const turn = Math.abs(total)
  if (!(turn >= 1e-3 && turn <= MAX_ARC_DEGREES * RADIANS_PER_DEGREE)) return null
  return { turn, ccw }
}

/**
 * Unit tangents of a drawn elliptical arc at its start and end, along the
 * direction of travel: `R(φ)·(−rx sin t, ry cos t)`, reversed for a negative
 * sweep. Null if either vanishes.
 */
function ellipseEndTangents(frame: ArcFrame): [Vec, Vec] | null {
  const sp = Math.sin(frame.phi)
  const cp = Math.cos(frame.phi)
  const tangentAt = (t: number): Vec | null => {
    const dx = -frame.rx * Math.sin(t)
    const dy = frame.ry * Math.cos(t)
    let vx = cp * dx - sp * dy
    let vy = sp * dx + cp * dy
    if (!(frame.delta > 0)) {
      vx = -vx
      vy = -vy
    }
    return unitVec(vx, vy)
  }
  const t0 = tangentAt(frame.theta1)
  if (!t0) return null
  const t1 = tangentAt(frame.theta1 + frame.delta)
  if (!t1) return null
  return [t0, t1]
}

/**
 * The elliptical arc for span `(i, j)` and its cost, or null. Tried only on
 * spans of at least {@link ELLIPSE_MIN_POINTS} steps whose length is a multiple
 * of {@link ELLIPSE_LENGTH_STRIDE}. Then:
 *
 * 1. Taubin's algebraic ellipse (`taubinEllipse`), refused for an aspect over
 *    {@link ELLIPSE_MAX_ASPECT} or a major radius over a thousand times the span's
 *    extent from its first point;
 * 2. the points must go round it monotonically through 1e-3 rad to
 *    `MAX_ARC_DEGREES` ({@link ellipseTurn});
 * 3. the radii are rescaled by the endpoints' mean normalized radius (refused
 *    outside `[0.5, 2]`) so the arc a renderer rebuilds from the endpoints is the
 *    one scored, and rebuilt with `arcEllipseCenter`;
 * 4. scored by Sampson distance ({@link ellipseSampsonChi2}), the breaks charged
 *    against the drawn arc's own end tangents.
 */
export function tryEllipse(
  pts: Float64Array,
  sigma: Float64Array,
  tan: Tangents,
  i: number,
  j: number,
  cfg: FitConfig,
  joinsAtEnds: boolean,
): EllipseSpan | null {
  if (j < i + ELLIPSE_MIN_POINTS || (j - i) % ELLIPSE_LENGTH_STRIDE !== 0) return null
  const span = pts.subarray(2 * i, 2 * j + 2)
  const spanSigma = sigma.subarray(i, j + 1)
  const fit = taubinEllipse(span, spanSigma)
  if (!fit) return null
  if (!(Number.isFinite(fit.rx) && Number.isFinite(fit.ry)) || fit.rx <= 1e-6 || fit.ry <= 1e-6) {
    return null
  }
  const major = fmax(fit.rx, fit.ry)
  const minor = fmin(fit.rx, fit.ry)
  if (major / minor > ELLIPSE_MAX_ASPECT) return null
  const n = span.length >> 1
  let extent = 0
  for (let k = 0; k < n; k++) {
    extent = fmax(extent, Math.hypot(span[2 * k] - span[0], span[2 * k + 1] - span[1]))
  }
  if (major > 1e3 * fmax(extent, 1)) return null

  const sweep = ellipseTurn(span, fit)
  if (!sweep) return null
  const sp0 = Math.sin(fit.angle)
  const cp0 = Math.cos(fit.angle)
  // The radii that are drawn: SVG rebuilds the arc through both endpoints, so the
  // fitted radii are rescaled to put them on the ellipse before it is scored.
  const scaleAt = (x: number, y: number): number => {
    const dx = x - fit.cx
    const dy = y - fit.cy
    const u = cp0 * dx + sp0 * dy
    const v = -sp0 * dx + cp0 * dy
    const a = u / fit.rx
    const b = v / fit.ry
    return Math.sqrt(a * a + b * b)
  }
  const sx = span[0]
  const sy = span[1]
  const ex = span[2 * n - 2]
  const ey = span[2 * n - 1]
  const k = 0.5 * (scaleAt(sx, sy) + scaleAt(ex, ey))
  if (!(k >= 0.5 && k <= 2)) return null
  const largeArc = sweep.turn > Math.PI
  const frame = arcEllipseCenter(
    sx,
    sy,
    fit.rx * k,
    fit.ry * k,
    fit.angle,
    largeArc,
    sweep.ccw,
    ex,
    ey,
  )
  if (Math.abs(frame.delta) <= 1e-6) return null
  const chi2 = ellipseSampsonChi2(
    span,
    spanSigma,
    frame.cx,
    frame.cy,
    frame.rx,
    frame.ry,
    frame.phi,
  )
  if (!Number.isFinite(chi2)) return null
  const tangents = ellipseEndTangents(frame)
  if (!tangents) return null
  const [t0, t1] = tangents
  const dev = endBreakCost(tan, pts.length >> 1, i, j, t0, t1, cfg.lambda, joinsAtEnds)
  return {
    cost: 0.5 * chi2 + cfg.lambda * PARAMS_ELLIPTICAL_ARC + dev,
    rx: frame.rx,
    ry: frame.ry,
    phi: frame.phi,
    largeArc,
    sweep: sweep.ccw,
    t0,
    t1,
  }
}

/**
 * Extra parameters, beyond `cubicParams()`, charged to a cubic whose end
 * directions `t0`, `t1` (any length) turn by more than the limit in force
 * (`cubicMaxTurnRadians`): one more cubic's worth, what the two cubics that
 * could replace it cost. A cubic's radial error on a circular arc grows as the
 * sixth power of its sweep (Goldapp 1991, "Approximation of circular arcs by
 * cubic polynomials", CAGD 8(3)). 0 when the limit is infinite (the standard
 * prices), without the angle being computed.
 */
export function overTurnParams(t0: Vec, t1: Vec): number {
  const limit = cubicMaxTurnRadians()
  return Number.isFinite(limit) && turnAngle(t0, t1) > limit ? cubicParams() : 0
}

/**
 * {@link overTurnParams} of a cubic by its control points: the end directions
 * are `p1 − p0` and `p3 − p2`, each falling back to the chord through the next
 * control point when its arm has zero length.
 */
export function overTurnParamsOf(b: Bezier): number {
  const a0: Vec =
    Math.hypot(b.x1 - b.x0, b.y1 - b.y0) > 1e-12
      ? { x: b.x1 - b.x0, y: b.y1 - b.y0 }
      : { x: b.x2 - b.x0, y: b.y2 - b.y0 }
  const a1: Vec =
    Math.hypot(b.x3 - b.x2, b.y3 - b.y2) > 1e-12
      ? { x: b.x3 - b.x2, y: b.y3 - b.y2 }
      : { x: b.x3 - b.x1, y: b.y3 - b.y1 }
  return overTurnParams(a0, a1)
}

/**
 * When the dynamic program no longer needs a G1 cubic's exact residual. A root
 * may be dropped once its partial sum `acc` proves all three things the program
 * asks: the cubic cannot be offered (`base + ½·acc + cubicFloor ≥ best`, a floor on
 * its cost by the monotonicity of IEEE addition, wobble being non-negative), it
 * cannot decide the ellipse's price gate (`acc ≥ gate`), and it is over the
 * scan's cut-off floor where that answer is wanted (`½·acc > overFloor`).
 */
export class Abandon {
  /** A lower bound (nats) on the cost of reaching the span's start and leaving it. */
  base = 0
  /** An upper bound on the table's cost at the span's end when the span is offered. */
  best = Infinity
  /** `λ·cubicParams()`, the cubic's parameter price. */
  cubicFloor = 0
  /** The partial sum must reach this before a root may be dropped (the ellipse's gate). */
  gate = 0
  /** The cut-off's per-span floor when its answer is needed, `−∞` otherwise. */
  overFloor = -Infinity
  /**
   * A cheap pre-test on the partial sum below which {@link drops} is not asked;
   * any value is exact, a poor one merely drops later.
   */
  trigger = Infinity

  /** Never drop a root: {@link bestCubicBounded} is then `bestCubic`. */
  static readonly NONE: Readonly<Abandon> = Object.freeze(new Abandon())

  /**
   * Set the bound for one candidate span: `base` at most the cost of reaching its
   * start, `best` at least the table's value at its end. Returns this.
   */
  reset(base: number, best: number, cubicFloor: number, gate: number, overFloor: number): this {
    this.base = base
    this.best = best
    this.cubicFloor = cubicFloor
    this.gate = gate
    this.overFloor = overFloor
    if (best === Infinity) this.trigger = Infinity
    else {
      // A little under each threshold, so rounding here never delays a drop by
      // more than a sample or two; the exact test is `drops`.
      const deadAt = 2 * (best - base - cubicFloor)
      const t = fmax(fmax(deadAt, gate), 2 * overFloor)
      this.trigger = t - 1e-9 * Math.abs(t)
    }
    return this
  }

  /** Only the cut-off's "over" answer is wanted: the cubic is already known dead. Returns this. */
  overOnly(overFloor: number): this {
    this.base = 0
    this.best = -Infinity
    this.cubicFloor = 0
    this.gate = 0
    this.overFloor = overFloor
    this.trigger = 2 * overFloor
    return this
  }

  /** Whether a root whose residual is at least `acc` costs at least `best`, whatever its wobble. */
  dead(acc: number): boolean {
    return this.base + 0.5 * acc + this.cubicFloor >= this.best
  }

  /** Whether a root with partial residual `acc` can be dropped. */
  drops(acc: number): boolean {
    return this.dead(acc) && acc >= this.gate && 0.5 * acc > this.overFloor
  }
}

/** What {@link bestCubicBounded} found. */
export type BoundedG1 =
  /** No admissible arms or a degenerate chord: `bestCubic`'s null. */
  | { readonly kind: 'untried' }
  /** `bestCubic`'s answer: the residual and arms. */
  | { readonly kind: 'exact'; readonly chi2: number; readonly d0: number; readonly d1: number }
  /**
   * Admissible arms exist, but the best of them costs at least the bound's
   * `best` and cannot decide the ellipse gate; `over` is whether its residual
   * exceeds the cut-off floor (meaningful only where the floor was asked).
   */
  | { readonly kind: 'dead'; readonly over: boolean }

const UNTRIED: BoundedG1 = Object.freeze({ kind: 'untried' })
const DEAD_OVER: BoundedG1 = Object.freeze({ kind: 'dead', over: true })
const DEAD_UNDER: BoundedG1 = Object.freeze({ kind: 'dead', over: false })

/** How the scoring of one root ended. */
const ROOT_DONE = 0
/** The partial sum reached the best root's residual. */
const ROOT_BEST = 1
/** The partial sum proved the program cannot use the root. */
const ROOT_BOUND = 2

/** The samples {@link bestCubicBounded} gathers a span into. */
const boundedSamples = new CubicSamples()
/** How the last {@link chi2Until} ended. */
let rootEnd = ROOT_DONE

/** `x` clamped to `[0, 1]`, NaN passing through. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * `CubicSamples.chi2` with a second way to stop: the same terms summed in the
 * same order, returned once the partial sum reaches `best` ({@link ROOT_BEST}) or
 * {@link Abandon.drops} it ({@link ROOT_BOUND}); a sum that runs to the end is the
 * residual bit for bit. Each term is `cubicDist2`'s Gauss–Newton projection
 * written out with the control points held in locals, the same operations on
 * the same operands. Sets {@link rootEnd}.
 */
function chi2Until(plan: CubicSamples, b: Bezier, best: number, ab: Readonly<Abandon>): number {
  const { x0, y0, x1, y1, x2, y2, x3, y3 } = b
  const ax = x1 - x0
  const ay = y1 - y0
  const bx = x2 - x1
  const by = y2 - y1
  const cx = x3 - x2
  const cy = y3 - y2
  const { px, py, t: tInit, s2, weight } = plan
  let acc = 0
  for (let m = 0; m < plan.len; m++) {
    const qx = px[m]
    const qy = py[m]
    let t = clamp01(tInit[m])
    for (let step = 0; step < NEWTON_STEPS; step++) {
      const mt = 1 - t
      const w0 = mt * mt * mt
      const w1 = 3 * mt * mt * t
      const w2 = 3 * mt * t * t
      const w3 = t * t * t
      const rx = w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3 - qx
      const ry = w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3 - qy
      const v0 = 3 * mt * mt
      const v1 = 6 * mt * t
      const v2 = 3 * t * t
      const dx = v0 * ax + v1 * bx + v2 * cx
      const dy = v0 * ay + v1 * by + v2 * cy
      const dd = dx * dx + dy * dy
      if (dd < 1e-18) break
      const next = clamp01(t - (rx * dx + ry * dy) / dd)
      if (next === t) break
      t = next
    }
    const mt = 1 - t
    const w0 = mt * mt * mt
    const w1 = 3 * mt * mt * t
    const w2 = 3 * mt * t * t
    const w3 = t * t * t
    const rx = w0 * x0 + w1 * x1 + w2 * x2 + w3 * x3 - qx
    const ry = w0 * y0 + w1 * y1 + w2 * y2 + w3 * y3 - qy
    acc += (weight * (rx * rx + ry * ry)) / s2[m]
    if (acc >= best) {
      rootEnd = ROOT_BEST
      return acc
    }
    if (acc >= ab.trigger && ab.drops(acc)) {
      rootEnd = ROOT_BOUND
      return acc
    }
  }
  rootEnd = ROOT_DONE
  return acc
}

/**
 * `bestCubic` with subsampling, for the dynamic program, stopping each root's
 * residual as soon as `ab` says the program cannot use it. The roots are scored
 * in the quartic's order with `bestCubic`'s summation. The answer is `exact`
 * exactly when it is provably `bestCubic`'s own: no root was dropped (then this
 * is `bestCubic`'s loop), or the best completed root is not dead (a dropped root
 * has `χ² ≥ acc > ` that root's residual, by monotonicity). Otherwise every root
 * is dead and the answer is `dead`, with `over` exact; a completed dead root
 * inside the ellipse gate (a narrow band of rounding) sends the call back to
 * `bestCubic`, so no case is guessed. `raw` is `(∫ y dx, ∫ x·y dx, ∫ y² dx)` along
 * the points from `i` to `j`.
 */
export function bestCubicBounded(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  s: ArrayLike<number>,
  i: number,
  j: number,
  t0: Vec,
  t1: Vec,
  raw: ArrayLike<number>,
  ab: Readonly<Abandon>,
): BoundedG1 {
  const exact = (): BoundedG1 => {
    const f = bestCubic(pts, sigma, s, i, j, t0, t1, raw, true)
    return f ? { kind: 'exact', chi2: f.chi2, d0: f.d0, d1: f.d1 } : UNTRIED
  }
  const p0x = pts[2 * i]
  const p0y = pts[2 * i + 1]
  const p3x = pts[2 * j]
  const p3y = pts[2 * j + 1]
  const fr = g1Frame(p0x, p0y, p3x, p3y, t0, t1, raw)
  if (!fr) return UNTRIED
  if (!boundedSamples.fill(pts, sigma, s, i, j)) return exact()
  const plan = boundedSamples
  let hasBest = false
  let bestChi2 = Infinity
  let bestD0 = 0
  let bestD1 = 0
  let admissible = false
  let dropped = false
  let over = true
  const arms = armsFromMoments(fr.th0, fr.th1, fr.area, fr.mx)
  for (let q = 0; q < arms.length; q += 2) {
    const d0 = arms[q]
    const d1 = arms[q + 1]
    if (d0 > MAX_ARM || d1 > MAX_ARM) continue
    admissible = true
    const b = cubicFromArms(p0x, p0y, p3x, p3y, t0, t1, fr.chord, d0, d1)
    const chi2 = chi2Until(plan, b, hasBest ? bestChi2 : Infinity, ab)
    if (rootEnd === ROOT_DONE) {
      if (!Number.isFinite(chi2)) return exact()
      if (!hasBest || chi2 < bestChi2) {
        hasBest = true
        bestChi2 = chi2
        bestD0 = d0
        bestD1 = d1
      }
      if (0.5 * chi2 <= ab.overFloor) {
        over = false
        // Only the cut-off's answer was wanted, and it is in.
        if (ab.best === -Infinity) return DEAD_UNDER
      }
    } else if (rootEnd === ROOT_BOUND) dropped = true
  }
  if (!admissible) return UNTRIED
  if (hasBest && (!dropped || !ab.dead(bestChi2))) {
    return { kind: 'exact', chi2: bestChi2, d0: bestD0, d1: bestD1 }
  }
  if (hasBest && bestChi2 < ab.gate) return exact()
  return over ? DEAD_OVER : DEAD_UNDER
}
