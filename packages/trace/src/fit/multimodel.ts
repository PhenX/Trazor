/**
 * One global dynamic program over the `{line, cubic, arc}` alphabet: where a
 * measured boundary breaks and what each piece is drawn with, chosen under one
 * objective, `½·χ² + λ·params` plus the turn charged at every vertex.
 *
 * The state is the vertex index alone. The tangent at every point is estimated
 * once, before the program runs (`estimateTangents`): where a local quadratic
 * fits within the noise both one-sided tangents are its derivative, across a
 * true corner they come from the points before and after. The cost is then a sum
 * of per-span and per-vertex terms, so the program is exact over every
 * segmentation and type assignment (checked against exhaustive enumeration),
 * at the price of tangents that are estimated rather than optimized with their
 * segments. A G1 cubic's end directions are those estimates and only its arm
 * lengths are fitted, from the span's signed area and first moment in O(1)
 * (Levien 2021, "Fitting cubic Bézier curves"), so the program is O(n²) in the
 * points. A corner costs one extra parameter, `λ`, ramping quadratically from a
 * perfect join to the full-corner turn; corners emerge where no single segment
 * can span the turn.
 *
 * `optimalMultimodel` decimates a long boundary ({@link DP_MAX_POINTS}), centers
 * the points (the Green's-theorem sums reach `x·y·dx`, and centering keeps their
 * differences well conditioned; the objective is translation invariant), then
 * solves an open polyline directly or cuts a closed one twice
 * ({@link solveClosed}). Each solve is the program (`./scan`) followed by the
 * continuous refinement: line–line corners move to the intersection of their
 * fitted lines (Selinger 2003 §2.3.3, the shift capped at `3·max(σ_max, 0.25)` px
 * plus a chamfer allowance at real corners), each cubic's arms are polished
 * against the full residual, and joins the program left smooth are made exactly
 * G1 where that costs less residual than the break it removes. The post-fit
 * passes (free-cubic merge, corner sharpening) live in the merge module; a caller
 * hands them in as {@link PostFitPass} to run them on the centered polyline as the
 * reference does.
 *
 * Coordinates are px, y down; the fit is translation invariant, so inkvec's
 * pixel-center convention needs no shift here.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/multimodel.rs`,
 * `multimodel/limits.rs` (`optimal_multimodel_forced`) and `decimate.rs`.
 */
import type { FitConfig, FittedEdge } from '../planar/types'
import { bowPenalty, lineCostTerms, overTurnParams, tryArc } from './candidates'
import { CirclePrefix } from './circle'
import { arcParams, cubicParams, g1BreakRadians } from './cost'
import { bestCubic, cubicFromArms, polishArms, rawMomentsDirect, wobblePenalty } from './cubicfit'
import type { G1Fit } from './cubicfit'
import { chi2 as sampledChi2, cubicTo, ellipticalArc, lineTo, unitVec, withEnd } from './curves'
import type { FitSegment, Vec } from './curves'
import { Limits } from './limits'
import {
  adjustVerticesAt,
  arcLengths,
  farthestFromCentroid,
  pathParams,
  polyline,
  polylineSize,
  PrefixSums,
  scatterMinEigen,
  spansLoop,
  translatePath,
} from './objective'
import type { FitPath, Polyline } from './objective'
import { fmax, fmin } from './roots'
import { SpanScorer } from './scan'
import type { ArcShape, EndTangents, SegKind } from './scan'
import { breakCost, estimateTangents, symmetricTangent, turnAngle, vertexCost } from './tangents'
import type { Tangents } from './tangents'

export type { SegKind } from './scan'

/**
 * Most measured points the program runs on; a longer free fit is decimated to
 * at most this many. The program is O(n²) and its cut-off never fires on a
 * smooth arc, where a cubic spanning most of the loop is still a passable fit.
 */
export const DP_MAX_POINTS = 768

/** The program's answer, with its discrete decisions exposed. */
export interface MultimodelFit {
  /** The fitted path, in the caller's coordinates. */
  path: FitPath
  /**
   * Indices into the source polyline chosen as vertices, first to last; for a
   * closed input the first and last are the same index (the cut).
   */
  vertices: number[]
  /** The model of each segment `vertices[k] → vertices[k + 1]`. */
  kinds: SegKind[]
  /** The program's objective at its optimum, nats, before the continuous refinement. */
  cost: number
}

/**
 * A post-fit pass (the merge module's free-cubic merge and corner sharpening),
 * run on the centered polyline `poly` the fit was computed against, with the
 * program's `vertices` (indices into `poly`). `keep` holds the forced vertices of
 * a pinned, uncapped refit, which the pass must keep; null for a free fit.
 * Returns the improved path.
 */
export type PostFitPass = (
  path: FitPath,
  poly: Polyline,
  vertices: readonly number[],
  cfg: FitConfig,
  keep: readonly number[] | null,
) => FitPath

/** How the program runs beyond its constraints. */
export interface MultimodelOptions {
  /** The decimation threshold, {@link DP_MAX_POINTS} by default, at least 16. */
  maxPoints?: number
  /**
   * The post-fit passes, run on every free fit and every pinned, uncapped one
   * (never under a span cap). None by default.
   */
  postFit?: PostFitPass
}

/** Fit a measured boundary with lines, cubics and arcs in one global optimization. */
export function optimalMultimodel(
  poly: Polyline,
  cfg: FitConfig,
  opts: MultimodelOptions = {},
): MultimodelFit {
  return multimodel(poly, cfg, Limits.FREE, opts)
}

/**
 * {@link optimalMultimodel} with no segment spanning more than `maxSpan`
 * measured points: the crossing repair's blunt instrument. At `maxSpan = 1`
 * every segment is one polyline edge and the measured contour is reproduced. A
 * capped fit is never decimated and runs no post-fit pass.
 */
export function optimalMultimodelCapped(
  poly: Polyline,
  cfg: FitConfig,
  maxSpan: number,
  opts: MultimodelOptions = {},
): MultimodelFit {
  return multimodel(poly, cfg, Limits.capped(maxSpan), opts)
}

/**
 * {@link optimalMultimodelCapped} with the vertices in `forced` (indices into
 * `poly`, any order, duplicates ignored) imposed on every solution: the local
 * crossing repair's refit. No span may pass over a forced vertex, and breaking
 * there costs what any vertex costs, so among the segmentations that keep them
 * this is still the optimum. It runs on every measured point (no decimation, so
 * the indices mean what the caller meant). Uncapped (`maxSpan ≥ n`) it runs the
 * post-fit passes with the forced vertices kept; a closed boundary is cut at its
 * first forced vertex, which is exact. With nothing forced it is the capped
 * program under a cap below the point count and the free one without.
 */
export function optimalMultimodelForced(
  poly: Polyline,
  cfg: FitConfig,
  maxSpan: number,
  forced: readonly number[],
  opts: MultimodelOptions = {},
): MultimodelFit {
  const lim = Limits.pinned(polylineSize(poly), poly.closed, maxSpan, forced)
  return multimodel(poly, cfg, lim, opts)
}

/** Options of {@link fitPolyline}. */
export interface FitPolylineOptions extends MultimodelOptions {
  /** Point indices that must be segment ends. */
  forced?: readonly number[]
  /** The most measured points one segment may span; no cap by default. */
  maxSpan?: number
}

/**
 * Fit one measured boundary (interleaved `points`, per-point `sigma`, px) as a
 * {@link FittedEdge}: absolute `L`/`C`/`A` segments from `(x0, y0)`, an open
 * polyline running exactly from its first point to its last, a closed one back
 * to its start. With `forced` or `maxSpan` the program runs as
 * {@link optimalMultimodelForced}. `params` counts the start point's two numbers
 * and every segment's; `chi2` is the description's χ² against the points,
 * sampled every quarter pixel (`curves.chi2`), with a closed boundary's points
 * read from the path's start so the two run together.
 */
export function fitPolyline(
  points: Float64Array,
  sigma: Float64Array,
  closed: boolean,
  cfg: FitConfig,
  opts: FitPolylineOptions = {},
): FittedEdge {
  const poly = polyline(points, sigma, closed)
  const n = polylineSize(poly)
  const lim = Limits.pinned(n, closed, opts.maxSpan ?? Infinity, opts.forced ?? [])
  const fit = multimodel(poly, cfg, lim, opts)
  return fittedEdgeOf(poly, fit)
}

/** The edge record of a fit of `poly`, its ends pinned exactly (see {@link fitPolyline}). */
function fittedEdgeOf(poly: Polyline, fit: MultimodelFit): FittedEdge {
  const n = polylineSize(poly)
  const p = poly.points
  const segments = fit.path.segments.slice()
  let x0 = fit.path.x0
  let y0 = fit.path.y0
  if (segments.length > 0) {
    // Centering and moving back can each round the last bit: an open edge ends on
    // its nodes and a closed one returns to its start exactly.
    const last = segments.length - 1
    if (!poly.closed) {
      x0 = p[0]
      y0 = p[1]
      segments[last] = withEnd(segments[last], p[2 * n - 2], p[2 * n - 1])
    } else if (n >= 3) {
      segments[last] = withEnd(segments[last], x0, y0)
    }
  }
  const path: FitPath = { x0, y0, segments, closed: poly.closed }
  let chi2 = 0
  if (segments.length > 0) {
    if (poly.closed && fit.vertices.length > 0 && fit.vertices[0] !== 0) {
      const cut = fit.vertices[0]
      const pts = new Float64Array(2 * n)
      const sig = new Float64Array(n)
      for (let k = 0; k < n; k++) {
        const s = (cut + k) % n
        pts[2 * k] = p[2 * s]
        pts[2 * k + 1] = p[2 * s + 1]
        sig[k] = poly.sigma[s]
      }
      chi2 = sampledChi2(pts, sig, x0, y0, segments)
    } else {
      chi2 = sampledChi2(p, poly.sigma, x0, y0, segments)
    }
  }
  return { x0, y0, segments, closed: poly.closed, params: pathParams(path), chi2 }
}

/**
 * The body of every entry point. `lim` says which spans may be used. The work
 * is done on a centered copy and the path moved back. Fewer than two points give
 * an empty path.
 */
function multimodel(
  poly: Polyline,
  cfg: FitConfig,
  lim: Limits,
  opts: MultimodelOptions,
): MultimodelFit {
  const n = polylineSize(poly)
  if (n < 2) {
    return {
      path: {
        x0: n > 0 ? poly.points[0] : 0,
        y0: n > 0 ? poly.points[1] : 0,
        segments: [],
        closed: poly.closed,
      },
      vertices: Array.from({ length: n }, (_, k) => k),
      kinds: [],
      cost: 0,
    }
  }
  // The capped and pinned fits are never decimated: the crossing repair relies
  // on the measured contour being reproducible at `maxSpan = 1`, a decimated
  // contour is not simple by construction, and a forced vertex is an index of
  // the full contour.
  const maxPoints = Math.max(opts.maxPoints ?? DP_MAX_POINTS, 16)
  const stride = lim.free ? Math.ceil(n / maxPoints) : 1
  if (stride > 1) return solveDecimated(poly, cfg, lim, opts, stride)

  const { cx, cy, shifted } = centered(poly)
  let fit: MultimodelFit
  if (poly.closed && n >= 3) fit = solveClosed(shifted, cfg, lim)
  else {
    const tan = estimateTangents(shifted, cfg)
    const { sol, path } = solveAndRefine(shifted, tan, cfg, false, lim)
    fit = { path, vertices: sol.vertices, kinds: sol.kinds, cost: sol.cost }
  }
  if (opts.postFit) {
    // Not under a span cap: the cap exists for the crossing repair, which needs
    // the constrained program's own answer. A pinned, uncapped refit keeps its pins.
    if (lim.free) fit.path = opts.postFit(fit.path, shifted, fit.vertices, cfg, null)
    else if (lim.maxSpan === Infinity) {
      fit.path = opts.postFit(fit.path, shifted, fit.vertices, cfg, lim.forced)
    }
  }
  fit.path = translatePath(fit.path, cx, cy)
  return fit
}

/**
 * Fit a long boundary on a decimated copy and map the chosen vertices back to
 * indices of the full polyline. One point per cell of `stride` points is kept
 * ({@link decimateIndices}, which keeps significant bends), with σ divided by
 * `√stride` so each kept point carries the weight of the run it stands for and
 * χ² keeps its meaning against λ.
 */
function solveDecimated(
  poly: Polyline,
  cfg: FitConfig,
  lim: Limits,
  opts: MultimodelOptions,
  stride: number,
): MultimodelFit {
  const keep = decimateIndices(poly, stride, cfg)
  const w = Math.sqrt(stride)
  const points = new Float64Array(2 * keep.length)
  const sigma = new Float64Array(keep.length)
  keep.forEach((i, k) => {
    points[2 * k] = poly.points[2 * i]
    points[2 * k + 1] = poly.points[2 * i + 1]
    sigma[k] = poly.sigma[i] / w
  })
  const fit = multimodel({ points, sigma, closed: poly.closed }, cfg, lim, opts)
  fit.vertices = fit.vertices.map((v) => keep[v])
  return fit
}

/**
 * A bounded sampling grid that keeps sharp corners: every `stride`-th index,
 * plus the last point of an open polyline, each grid sample (but an open
 * polyline's two ends) free to move within its own cell — the indices halfway to
 * its grid neighbors `prev` and `next`, wrapping on a closed polyline — onto a
 * sharp bend the coarse polygon would cut. A candidate `j` is eligible only where
 * the polyline turns there by at least the full-corner angle (`g1BreakRadians`)
 * between `p_j − p_prev` and `p_next − p_j`, so smooth arcs and noisy straight
 * runs keep their uniform samples; the eligible candidate farthest from the
 * chord `p_prev → p_next` in units of its own σ,
 * `r_j = ((p_j − p_prev) × (p_next − p_prev))² / (|p_next − p_prev|²·σ_j²)`,
 * replaces the sample if `r_j > τ²`. Neighbors are the original grid positions,
 * so moves do not interact and the count never changes. Ascending.
 */
export function decimateIndices(poly: Polyline, stride: number, cfg: FitConfig): number[] {
  const n = polylineSize(poly)
  const p = poly.points
  const grid: number[] = []
  for (let k = 0; k < n; k += stride) grid.push(k)
  if (!poly.closed && grid[grid.length - 1] !== n - 1) grid.push(n - 1)
  const keep = grid.slice()
  const g = grid.length
  const index = (v: number) => ((v % n) + n) % n
  const corner = g1BreakRadians()
  for (let k = 0; k < g; k++) {
    if (!poly.closed && (k === 0 || k + 1 === g)) continue
    const i = grid[k]
    const prev = k === 0 ? grid[g - 1] - n : grid[k - 1]
    const next = k + 1 === g ? n : grid[k + 1]
    const a = index(prev)
    const b = index(next)
    const ax = p[2 * a]
    const ay = p[2 * a + 1]
    const chx = p[2 * b] - ax
    const chy = p[2 * b + 1] - ay
    const length2 = chx * chx + chy * chy
    if (length2 < 1e-12) continue
    let best = cfg.tau * cfg.tau
    // Disjoint cells: ties at the midpoint belong to the following sample.
    const lo = Math.floor((prev + i + 1) / 2)
    const hi = Math.floor((i + next + 1) / 2)
    for (let c = lo; c < hi; c++) {
      const j = index(c)
      const vx = p[2 * j] - ax
      const vy = p[2 * j + 1] - ay
      const ox = p[2 * b] - p[2 * j]
      const oy = p[2 * b + 1] - p[2 * j + 1]
      const norm = Math.hypot(vx, vy) * Math.hypot(ox, oy)
      if (norm < 1e-12) continue
      const cos = Math.min(Math.max((vx * ox + vy * oy) / norm, -1), 1)
      if (Math.acos(cos) < corner) continue
      const cross = vx * chy - vy * chx
      const residual = (cross * cross) / (length2 * fmax(poly.sigma[j] * poly.sigma[j], 1e-12))
      if (residual > best) {
        best = residual
        keep[k] = j
      }
    }
  }
  return keep.toSorted((x, y) => x - y)
}

/** The polyline moved so its bounding-box center is the origin, and that center (px). */
function centered(poly: Polyline): { cx: number; cy: number; shifted: Polyline } {
  const n = polylineSize(poly)
  const p = poly.points
  let loX = Infinity
  let loY = Infinity
  let hiX = -Infinity
  let hiY = -Infinity
  for (let k = 0; k < n; k++) {
    loX = fmin(loX, p[2 * k])
    loY = fmin(loY, p[2 * k + 1])
    hiX = fmax(hiX, p[2 * k])
    hiY = fmax(hiY, p[2 * k + 1])
  }
  const cx = 0.5 * (loX + hiX)
  const cy = 0.5 * (loY + hiY)
  const points = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    points[2 * k] = p[2 * k] - cx
    points[2 * k + 1] = p[2 * k + 1] - cy
  }
  return { cx, cy, shifted: { points, sigma: poly.sigma, closed: poly.closed } }
}

// --- the dynamic program -------------------------------------------------------

/** Arm lengths of a cubic, fractions of its chord. */
interface Arms {
  d0: number
  d1: number
}

/**
 * What the program chose, before the continuous refinement: one entry per
 * segment in every array but `vertices`, which has one more.
 */
export interface Solution {
  /** Indices into the (opened) polyline where segments meet, first to last. */
  vertices: number[]
  kinds: SegKind[]
  /** Arms of the cubics, null elsewhere. */
  arms: (Arms | null)[]
  /** An arc's own end directions; null where the estimator's are used. */
  tans: (EndTangents | null)[]
  /** An arc's drawn shape, null elsewhere. */
  arcs: (ArcShape | null)[]
  /** The program's objective at its optimum, nats. */
  cost: number
}

/**
 * The program on an open polyline (`./scan`): the cheapest path through the
 * spans `lim` allows, read back from the last point. `joinsAtEnds` marks the
 * ends as joins (the cut of a closed loop) so the break terms apply there too.
 */
export function solveOpen(
  poly: Polyline,
  tan: Tangents,
  pre: PrefixSums,
  cfg: FitConfig,
  joinsAtEnds: boolean,
  lim: Limits,
): Solution {
  const n = polylineSize(poly)
  const tab = new SpanScorer(poly.points, poly.sigma, tan, pre, cfg, joinsAtEnds).fillTable(lim)
  const vertices: number[] = []
  const kinds: SegKind[] = []
  const arms: (Arms | null)[] = []
  const tans: (EndTangents | null)[] = []
  const arcs: (ArcShape | null)[] = []
  let cur = n - 1
  while (cur !== -1) {
    vertices.push(cur)
    if (cur === 0) break
    kinds.push(tab.kind[cur])
    const d0 = tab.arms[2 * cur]
    arms.push(Number.isNaN(d0) ? null : { d0, d1: tab.arms[2 * cur + 1] })
    tans.push(tab.tans[cur])
    arcs.push(tab.arcs[cur])
    cur = tab.from[cur]
  }
  vertices.reverse()
  kinds.reverse()
  arms.reverse()
  tans.reverse()
  arcs.reverse()
  return { vertices, kinds, arms, tans, arcs, cost: tab.best[n - 1] }
}

/**
 * Cost of one candidate segment computed without prefix sums, O(j − i): the
 * independent implementation the exhaustive tests check the program against.
 * The residual and the quartic are shared; the bookkeeping is not. Infinite for
 * an empty or out-of-range span and for a cubic without an interior point or
 * admissible arms.
 */
export function segmentCostDirect(
  poly: Polyline,
  tan: Tangents,
  i: number,
  j: number,
  kind: SegKind,
  cfg: FitConfig,
  joinsAtEnds: boolean,
): number {
  const pts = poly.points
  const sigma = poly.sigma
  if (j <= i || j >= polylineSize(poly)) return Infinity
  if (kind === 'arc') {
    const f = tryArc(pts, tan, new CirclePrefix(pts, sigma), i, j, cfg, joinsAtEnds)
    return f ? f.cost : Infinity
  }
  if (kind === 'line') {
    let w = 0
    let sx = 0
    let sy = 0
    let sxx = 0
    let syy = 0
    let sxy = 0
    for (let k = i; k <= j; k++) {
      const iv = 1 / (sigma[k] * sigma[k])
      const x = pts[2 * k]
      const y = pts[2 * k + 1]
      w += iv
      sx += x * iv
      sy += y * iv
      sxx += x * x * iv
      syy += y * y * iv
      sxy += x * y * iv
    }
    const chi2 = scatterMinEigen(w, sx, sy, sxx, syy, sxy)
    const plain = lineCostTerms(pts, tan, i, j, chi2, cfg, joinsAtEnds)
    // The same evidence the program charges: a line whose residuals all bow one
    // way is not a line.
    const arcFloor = cfg.lambda * arcParams()
    let bow = 0
    if (j >= i + 2 && (plain > arcFloor || chi2 > j - i)) {
      const f = tryArc(pts, tan, new CirclePrefix(pts, sigma), i, j, cfg, joinsAtEnds)
      if (f) bow = bowPenalty(chi2, f.chi2, j - i)
    }
    return plain + bow
  }
  if (j < i + 2) return Infinity
  const s = arcLengths(pts)
  const raw = new Float64Array(3)
  rawMomentsDirect(pts, i, j, raw)
  const t0 = tan.outgoing[i]
  const t1 = tan.incoming[j]
  const f = bestCubic(pts, sigma, s, i, j, t0, t1, raw, false)
  if (!f) return Infinity
  const pix = pts[2 * i]
  const piy = pts[2 * i + 1]
  const pjx = pts[2 * j]
  const pjy = pts[2 * j + 1]
  const chord = Math.hypot(pjx - pix, pjy - piy)
  const cb = cubicFromArms(pix, piy, pjx, pjy, t0, t1, chord, f.d0, f.d1)
  const wobble = wobblePenalty(cb, cfg.lambda)
  const turn = cfg.lambda * overTurnParams(t0, t1)
  return fmin(0.5 * f.chi2 + cfg.lambda * cubicParams() + wobble + turn, Infinity)
}

// --- continuous refinement --------------------------------------------------------

/**
 * Turn the program's discrete decisions into geometry, then improve what the
 * program could not optimize: line–line corners move to the intersection of
 * their fitted lines ({@link adjustLineCorners}); each cubic's arms are polished
 * against the full residual (`polishArms`); joins left smooth are made exactly
 * G1 where that pays ({@link makeJoinsSmooth}). `poly` is the (opened) polyline
 * the solution indexes into. The path is closed exactly when `poly` is and the
 * solution's first and last vertex are the same index.
 */
export function refine(
  poly: Polyline,
  tan: Tangents,
  pre: PrefixSums,
  sol: Solution,
  cfg: FitConfig,
): FitPath {
  const v = sol.vertices
  const m = v.length
  // Corner adjustment and smooth joins treat the cut of an opened loop as a
  // vertex like any other; the emitted path keeps the caller's notion.
  const closed = spansLoop(poly, v)
  const emittedClosed = poly.closed && m >= 2 && v[0] === v[m - 1]
  const pos = adjustLineCorners(poly, sol, closed)
  const st = polishedState(poly, tan, pre, sol)
  makeJoinsSmooth(poly, pre, sol, pos, closed, cfg, st)
  return assemble(poly, sol, pos, st, emittedClosed)
}

/**
 * Every vertex position (interleaved, px), each vertex between two lines moved
 * to the intersection of their fitted lines (`adjustVerticesAt`, shift cap
 * `3·max(σ_max, 0.25)` px). A vertex touching a cubic or an arc stays where it
 * was measured: the curve was fitted to pass through it.
 */
function adjustLineCorners(poly: Polyline, sol: Solution, closed: boolean): Float64Array {
  const m = sol.vertices.length
  const nseg = m - 1
  const kinds = sol.kinds
  const isCorner = (k: number): boolean => {
    let a: number
    let b: number
    if (closed) {
      a = (k + nseg - 1) % nseg
      b = k % nseg
    } else {
      if (k === 0 || k >= m - 1) return false
      a = k - 1
      b = k
    }
    return kinds[a] === 'line' && kinds[b] === 'line'
  }
  let sigmaMax = 0
  for (let k = 0; k < poly.sigma.length; k++) sigmaMax = fmax(sigmaMax, poly.sigma[k])
  return adjustVerticesAt(poly, sol.vertices, 3 * fmax(sigmaMax, 0.25), isCorner)
}

/** The continuous parameters of a solution while {@link refine} improves them, per segment. */
interface SegState {
  /** Unit direction leaving each segment's start. */
  tStart: Vec[]
  /** Unit direction arriving at each segment's end. */
  tEnd: Vec[]
  /** Arm lengths of the cubics. */
  arms: (Arms | null)[]
  /** Each cubic's residual over all its interior points; 0 elsewhere. */
  chi2: number[]
}

/**
 * The solution's end directions (an arc's own, the estimator's elsewhere:
 * outgoing at the start, incoming at the end), every cubic's arms polished
 * against its full residual.
 */
function polishedState(poly: Polyline, tan: Tangents, pre: PrefixSums, sol: Solution): SegState {
  const v = sol.vertices
  const nseg = v.length - 1
  const tStart: Vec[] = []
  const tEnd: Vec[] = []
  const arms: (Arms | null)[] = []
  const chi2: number[] = []
  for (let q = 0; q < nseg; q++) {
    const own = sol.tans[q]
    tStart.push(own ? own.t0 : tan.outgoing[v[q]])
    tEnd.push(own ? own.t1 : tan.incoming[v[q + 1]])
    const a = sol.arms[q]
    if (a) {
      const r = polishArms(
        poly.points,
        poly.sigma,
        pre.s,
        v[q],
        v[q + 1],
        tStart[q],
        tEnd[q],
        a.d0,
        a.d1,
      )
      arms.push({ d0: r.d0, d1: r.d1 })
      chi2.push(r.chi2)
    } else {
      arms.push(null)
      chi2.push(0)
    }
  }
  return { tStart, tEnd, arms, chi2 }
}

/**
 * Make the joins the program left smooth exactly G1. At every join whose turn
 * is below the full-corner angle and that touches no arc, a shared direction is
 * chosen ({@link joinTarget}) and the cubic(s) either side are refitted to it (G1
 * arms by moments, then `polishArms`); the change is kept when
 * `½·χ²_new ≤ ½·χ²_old + breakCost(old directions)`. Joins are visited in order,
 * each seeing the previous ones' changes; `pos` gives a line its direction.
 */
function makeJoinsSmooth(
  poly: Polyline,
  pre: PrefixSums,
  sol: Solution,
  pos: Float64Array,
  closed: boolean,
  cfg: FitConfig,
  st: SegState,
): void {
  const pts = poly.points
  const v = sol.vertices
  const kinds = sol.kinds
  const nseg = v.length - 1
  const raw = new Float64Array(3)
  const lineDir = (q: number): Vec | null =>
    unitVec(pos[2 * q + 2] - pos[2 * q], pos[2 * q + 3] - pos[2 * q + 1])
  const solveSeg = (q: number, t0: Vec, t1: Vec): G1Fit | null => {
    const i = v[q]
    const j = v[q + 1]
    const f = bestCubic(pts, poly.sigma, pre.s, i, j, t0, t1, pre.rawMoments(i, j, raw), false)
    if (!f) return null
    return polishArms(pts, poly.sigma, pre.s, i, j, t0, t1, f.d0, f.d1)
  }
  for (let k = closed ? 0 : 1; k < nseg; k++) {
    const a = closed ? (k + nseg - 1) % nseg : k - 1
    const b = closed ? k % nseg : k
    if (a === b) continue
    const outA = kinds[a] === 'line' ? lineDir(a) : st.tEnd[a]
    const inB = kinds[b] === 'line' ? lineDir(b) : st.tStart[b]
    if (!outA || !inB) continue
    const target = joinTarget(poly, sol, a, b, k, outA, inB, cfg)
    if (!target) continue
    const oldBreak = breakCost(outA, inB, cfg.lambda)
    let newA: G1Fit | null = null
    let newB: G1Fit | null = null
    let oldChi2 = 0
    let newChi2 = 0
    if (kinds[a] === 'cubic') {
      newA = solveSeg(a, st.tStart[a], target)
      if (!newA) continue
      oldChi2 += st.chi2[a]
      newChi2 += newA.chi2
    }
    if (kinds[b] === 'cubic') {
      newB = solveSeg(b, target, st.tEnd[b])
      if (!newB) continue
      oldChi2 += st.chi2[b]
      newChi2 += newB.chi2
    }
    if (0.5 * newChi2 <= 0.5 * oldChi2 + oldBreak) {
      if (newA) {
        st.tEnd[a] = target
        st.arms[a] = { d0: newA.d0, d1: newA.d1 }
        st.chi2[a] = newA.chi2
      }
      if (newB) {
        st.tStart[b] = target
        st.arms[b] = { d0: newB.d0, d1: newB.d1 }
        st.chi2[b] = newB.chi2
      }
    }
  }
}

/**
 * The shared direction to give the join `k` between segments `a` and `b`, or
 * null to leave it alone: a turn at or above the full-corner angle (a real
 * corner), two lines (nothing to refit), and any join with an arc (its direction
 * is the circle the points fit) are left alone. A line next to a cubic gives the
 * cubic the line's direction. Two cubics take a symmetric tangent estimated at
 * the vertex over at most half of the shorter neighbor (`symmetricTangent`),
 * falling back to the bisector of their directions, then to `outA`.
 */
function joinTarget(
  poly: Polyline,
  sol: Solution,
  a: number,
  b: number,
  k: number,
  outA: Vec,
  inB: Vec,
  cfg: FitConfig,
): Vec | null {
  const v = sol.vertices
  const kinds = sol.kinds
  if (turnAngle(outA, inB) >= g1BreakRadians()) return null
  if (kinds[a] === 'arc' || kinds[b] === 'arc') return null
  if (kinds[a] === 'line' && kinds[b] === 'line') return null
  if (kinds[a] === 'line') return outA
  if (kinds[b] === 'line') return inB
  const half = Math.max(
    Math.min(Math.floor((v[a + 1] - v[a]) / 2), Math.floor((v[b + 1] - v[b]) / 2)),
    1,
  )
  return (
    symmetricTangent(poly, v[k % v.length], half, cfg) ??
    unitVec(outA.x + inB.x, outA.y + inB.y) ??
    outA
  )
}

/**
 * The emitted path from the refined state. Every segment ends at its vertex's
 * position; a cubic keeps its measured start and end for its arms, so its shape
 * is the one that was scored. An arc or cubic whose parameters are missing
 * degrades to a line.
 */
function assemble(
  poly: Polyline,
  sol: Solution,
  pos: Float64Array,
  st: SegState,
  emittedClosed: boolean,
): FitPath {
  const pts = poly.points
  const v = sol.vertices
  const nseg = v.length - 1
  const segments: FitSegment[] = []
  for (let q = 0; q < nseg; q++) {
    const x = pos[2 * q + 2]
    const y = pos[2 * q + 3]
    const kind = sol.kinds[q]
    const arc = sol.arcs[q]
    const arms = st.arms[q]
    if (kind === 'arc' && arc) {
      segments.push(ellipticalArc(arc.rx, arc.ry, arc.phi, arc.largeArc, arc.sweep, x, y))
    } else if (kind === 'cubic' && arms) {
      const i = v[q]
      const j = v[q + 1]
      const pix = pts[2 * i]
      const piy = pts[2 * i + 1]
      const pjx = pts[2 * j]
      const pjy = pts[2 * j + 1]
      const chord = Math.hypot(pix - pjx, piy - pjy)
      const cb = cubicFromArms(
        pix,
        piy,
        pjx,
        pjy,
        st.tStart[q],
        st.tEnd[q],
        chord,
        arms.d0,
        arms.d1,
      )
      segments.push(cubicTo(cb.x1, cb.y1, cb.x2, cb.y2, x, y))
    } else {
      segments.push(lineTo(x, y))
    }
  }
  return { x0: pos[0], y0: pos[1], segments, closed: emittedClosed }
}

/** The program on an opened polyline and its refined answer. */
function solveAndRefine(
  poly: Polyline,
  tan: Tangents,
  cfg: FitConfig,
  joinsAtEnds: boolean,
  lim: Limits,
): { sol: Solution; path: FitPath } {
  const pre = new PrefixSums(poly.points, poly.sigma)
  const sol = solveOpen(poly, tan, pre, cfg, joinsAtEnds, lim)
  return { sol, path: refine(poly, tan, pre, sol, cfg) }
}

// --- closed loops ------------------------------------------------------------------

/**
 * A closed polyline opened at `cut`, the cut point repeated at the end (`n + 1`
 * points; index `k` is original index `(cut + k) mod n`), with the tangent
 * estimates re-indexed to match. Marked closed so vertex adjustment treats the
 * cut as a join.
 */
export function openAt(
  poly: Polyline,
  tan: Tangents,
  cut: number,
): { poly: Polyline; tan: Tangents } {
  const n = polylineSize(poly)
  const points = new Float64Array(2 * (n + 1))
  const sigma = new Float64Array(n + 1)
  const incoming: Vec[] = []
  const outgoing: Vec[] = []
  for (let k = 0; k <= n; k++) {
    const i = (cut + k) % n
    points[2 * k] = poly.points[2 * i]
    points[2 * k + 1] = poly.points[2 * i + 1]
    sigma[k] = poly.sigma[i]
    incoming.push(tan.incoming[i])
    outgoing.push(tan.outgoing[i])
  }
  return { poly: { points, sigma, closed: true }, tan: { incoming, outgoing } }
}

/**
 * Closed loops: cut, solve the open problem, and try once more from a better
 * cut. The true optimum is a minimum-cost cycle; fixing a cut is an
 * approximation that can cost a segment when the cut lands mid-curve. The first
 * cut is the sharpest corner when its turn reaches the full-corner angle, else
 * the point farthest from the centroid; then the program runs again from the
 * chosen vertex farthest (round the loop) from that cut, and the cheaper result
 * is kept. The cut vertex pays its `vertexCost`, which the opened program cannot
 * see. With forced vertices the loop is cut at the first one, which every
 * admissible solution has, and solved once. Returned vertices index `poly`, the
 * cut at both ends.
 */
function solveClosed(poly: Polyline, cfg: FitConfig, lim: Limits): MultimodelFit {
  const n = polylineSize(poly)
  const tan = estimateTangents(poly, cfg)
  const run = (cut: number, l: Limits): MultimodelFit => {
    const opened = openAt(poly, tan, cut)
    const { sol, path } = solveAndRefine(opened.poly, opened.tan, cfg, true, l)
    return {
      path,
      vertices: sol.vertices.map((i) => (cut + i) % n),
      kinds: sol.kinds,
      cost: sol.cost + vertexCost(tan, cut, cfg),
    }
  }
  if (lim.forced.length > 0) {
    const cut = lim.forced[0]
    const forced = lim.forced
      .map((f) => (f + n - cut) % n)
      .filter((f) => f > 0)
      .toSorted((x, y) => x - y)
    return run(cut, new Limits(lim.maxSpan, forced))
  }
  // The last of equal maxima, as Rust's `max_by`.
  let sharpest = 0
  let sharpTurn = -Infinity
  for (let k = 0; k < n; k++) {
    const t = turnAngle(tan.incoming[k], tan.outgoing[k])
    if (t >= sharpTurn || Number.isNaN(t)) {
      sharpTurn = t
      sharpest = k
    }
  }
  const cut1 = sharpTurn >= g1BreakRadians() ? sharpest : farthestFromCentroid(poly.points)
  const first = run(cut1, lim)
  let cut2 = cut1
  let far = -1
  for (const v of first.vertices) {
    const d = (v + n - cut1) % n
    const c = Math.min(d, n - d)
    if (c >= far) {
      far = c
      cut2 = v
    }
  }
  if (cut2 === cut1) return first
  const second = run(cut2, lim)
  return second.cost < first.cost ? second : first
}
