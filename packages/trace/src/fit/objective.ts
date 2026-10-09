/**
 * The fit's objective and the pieces every fitter shares: the measured polyline
 * with per-point σ, the weighted prefix sums that price any straight span in
 * O(1), the line-only optimal polygon, corner adjustment, and the fitted path
 * with its parameter count and exact χ².
 *
 * A description costs `E = ½·χ² + λ·P` nats, `χ² = Σ (d_k/σ_k)²` with `d_k` the
 * distance (px) from measured point `k` to the emitted geometry and `P` the
 * numbers it writes (`FitConfig` in `../planar/types`). A segment is worth adding
 * exactly when it removes more misfit than it costs to write down. The line
 * program is Potrace's optimal polygon (Selinger 2003, §2.2) with the penalty
 * replaced by this objective and the straightness test by the weighted
 * total-least-squares residual (Pearson 1901).
 *
 * Coordinates are px, y down. The objective is translation invariant, so
 * inkvec's convention of pixel centres on integers needs no shift here: nothing
 * in the fit reads an absolute coordinate.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/lib.rs` (`PrefixSums`,
 * `optimal_polygon`, `spans_loop`, `adjust_vertices_at`, `fit_line`,
 * `line_distance`, `max_normalized_deviation`, `FittedPath`), `multimodel.rs`
 * (`Prefix`, `translate_path`, `path_chi2`, `path_max_deviation`, `path_cost`),
 * `tangents.rs` (`arc_lengths`), `candidates.rs` (`scatter_min_eigen`) and
 * `inkvec-core/src/lib.rs` (`Polyline`).
 */
import type { FitConfig, FittedEdge } from '../planar/types'
import { PARAMS_LINE } from './cost'
import { edgeTerms } from './cubicfit'
import { nearestCubicDist2, nearestLineDist2, sampleRun, segmentParams, withEnd } from './curves'
import type { Bezier, FitSegment, Vec } from './curves'
import { fmax, fmin } from './roots'

/**
 * Safety factor on the scan cut-off: the scan from a start stops once one
 * span's `½·χ²` exceeds `PRUNE_SLACK·λ·PARAMS_LINE·(j − i)`.
 */
export const PRUNE_SLACK = 4

/**
 * Distance, px, from a vertex within which contour samples lie on the
 * anti-aliasing chamfer rather than on the edge: one pixel, the level set's
 * sampling step.
 */
export const CORNER_CHAMFER = 1

/** Turn between two fitted lines from which their meeting is a corner whose chamfer the intersection may cross. */
export const CORNER_TURN_MIN = Math.PI / 6

/** Turn, degrees, above which a vertex is a corner rather than a smooth join. */
export const CORNER_DEGREES = 45

/** Smallest σ, px, a polyline admits, keeping `d/σ` finite. */
export const MIN_SIGMA = 1e-6

/**
 * A measured boundary: interleaved points `x0, y0, x1, y1, …` (px) and each
 * point's positional uncertainty σ (px, along the boundary normal). A closed
 * polyline is a loop that does not repeat its first point. A planar-map edge is
 * one as it stands.
 */
export interface Polyline {
  readonly points: Float64Array
  readonly sigma: Float64Array
  readonly closed: boolean
}

/** A polyline from points and per-point σ, each σ clamped to {@link MIN_SIGMA}. */
export function polyline(
  points: ArrayLike<number>,
  sigma: ArrayLike<number>,
  closed: boolean,
): Polyline {
  if (sigma.length * 2 !== points.length) throw new Error('sigma must be per-point')
  const s = new Float64Array(sigma.length)
  for (let k = 0; k < s.length; k++) s[k] = fmax(sigma[k], MIN_SIGMA)
  return { points: Float64Array.from(points), sigma: s, closed }
}

/** A polyline with one σ for every point. */
export function uniformPolyline(
  points: ArrayLike<number>,
  sigma: number,
  closed: boolean,
): Polyline {
  return polyline(points, new Float64Array(points.length >> 1).fill(sigma), closed)
}

/** Number of points. */
export function polylineSize(poly: Polyline): number {
  return poly.points.length >> 1
}

/** Cumulative arc length at each point, px: `s[0] = 0`, `s[k] = s[k−1] + |p_k − p_{k−1}|`. */
export function arcLengths(pts: Float64Array): Float64Array {
  const n = pts.length >> 1
  const s = new Float64Array(n)
  let acc = 0
  for (let k = 1; k < n; k++) {
    acc += Math.hypot(pts[2 * k] - pts[2 * k - 2], pts[2 * k + 1] - pts[2 * k - 1])
    s[k] = acc
  }
  return s
}

/**
 * Smaller eigenvalue of the weighted scatter matrix from raw sums (`w = Σw_k`,
 * `sx = Σw_k·x_k`, `sxx = Σw_k·x_k²`, …): with `Cxx = sxx − sx²/w` and so on,
 * `λ_min = ½(Cxx + Cyy − √((Cxx − Cyy)² + 4·Cxy²))`, the weighted sum of squared
 * perpendicular distances to the total-least-squares line — that line's χ².
 * Clamped at 0 against cancellation; `w` must be positive.
 */
export function scatterMinEigen(
  w: number,
  sx: number,
  sy: number,
  sxx: number,
  syy: number,
  sxy: number,
): number {
  const cxx = sxx - (sx * sx) / w
  const cyy = syy - (sy * sy) / w
  const cxy = sxy - (sx * sy) / w
  const tr = cxx + cyy
  const diff = cxx - cyy
  const disc = Math.sqrt(Math.max(diff * diff + 4 * cxy * cxy, 0))
  return Math.max(0.5 * (tr - disc), 0)
}

/**
 * Everything a candidate span `(i, j)` needs, in O(1): the six weighted sums
 * that make the line residual O(1) (Potrace's constant-time penalty, with
 * per-point weights `1/σ²`), the three Green's-theorem partials that make the
 * area and first moments of any sub-polyline O(1), and the arc length that
 * gives each point its parameter on a candidate cubic.
 *
 * `w[k]`, `x[k]`, … hold the sums over points `< k` (`n + 1` entries), so the
 * inclusive range `[i, j]` is `v[j + 1] − v[i]`; `ga[k]`, `gx[k]`, `gy[k]` the sums
 * of `∫ y dx`, `∫ x·y dx`, `∫ y² dx` over edges `< k` (`n` entries, edge `k` from
 * point `k` to `k + 1`); `s` the cumulative arc length. σ must be positive.
 */
export class PrefixSums {
  readonly w: Float64Array
  readonly x: Float64Array
  readonly y: Float64Array
  readonly xx: Float64Array
  readonly yy: Float64Array
  readonly xy: Float64Array
  readonly ga: Float64Array
  readonly gx: Float64Array
  readonly gy: Float64Array
  readonly s: Float64Array

  constructor(pts: Float64Array, sigma: ArrayLike<number>) {
    const n = pts.length >> 1
    this.w = new Float64Array(n + 1)
    this.x = new Float64Array(n + 1)
    this.y = new Float64Array(n + 1)
    this.xx = new Float64Array(n + 1)
    this.yy = new Float64Array(n + 1)
    this.xy = new Float64Array(n + 1)
    this.ga = new Float64Array(n)
    this.gx = new Float64Array(n)
    this.gy = new Float64Array(n)
    this.s = arcLengths(pts)
    const e = new Float64Array(3)
    for (let k = 0; k < n; k++) {
      const qx = pts[2 * k]
      const qy = pts[2 * k + 1]
      const iv = 1 / (sigma[k] * sigma[k])
      this.w[k + 1] = this.w[k] + iv
      this.x[k + 1] = this.x[k] + qx * iv
      this.y[k + 1] = this.y[k] + qy * iv
      this.xx[k + 1] = this.xx[k] + qx * qx * iv
      this.yy[k + 1] = this.yy[k] + qy * qy * iv
      this.xy[k + 1] = this.xy[k] + qx * qy * iv
      if (k + 1 < n) {
        edgeTerms(qx, qy, pts[2 * k + 2], pts[2 * k + 3], e)
        this.ga[k + 1] = this.ga[k] + e[0]
        this.gx[k + 1] = this.gx[k] + e[1]
        this.gy[k + 1] = this.gy[k] + e[2]
      }
    }
  }

  /**
   * Weighted sum of squared orthogonal distances from points `[i, j]` to their
   * best-fit line ({@link scatterMinEigen}), in σ units. Not the distance to the
   * chord `p_i → p_j`: a chord pinned to two noisy endpoints tilts enough over a
   * long span to push interior points out of a tolerance they each satisfy. 0
   * for fewer than two points or zero weight.
   */
  chi2Line(i: number, j: number): number {
    if (j <= i) return 0
    const a = i
    const b = j + 1
    const w = this.w[b] - this.w[a]
    if (w <= 0) return 0
    return scatterMinEigen(
      w,
      this.x[b] - this.x[a],
      this.y[b] - this.y[a],
      this.xx[b] - this.xx[a],
      this.yy[b] - this.yy[a],
      this.xy[b] - this.xy[a],
    )
  }

  /** `(∫ y dx, ∫ x·y dx, ∫ y² dx)` along the polyline from `i` to `j`, into `out`. */
  rawMoments(i: number, j: number, out: Float64Array): Float64Array {
    out[0] = this.ga[j] - this.ga[i]
    out[1] = this.gx[j] - this.gx[i]
    out[2] = this.gy[j] - this.gy[i]
    return out
  }
}

/** A segmentation of a polyline: the indices kept as vertices, and its cost (nats). */
export interface Segmentation {
  vertices: number[]
  cost: number
}

/**
 * The globally optimal polygon under `½·χ² + λ·PARAMS_LINE` per segment, over
 * every segmentation:
 *
 *     best[0] = 0
 *     best[j] = min_{i < j} ( best[i] + ½·χ²(i, j) + λ·PARAMS_LINE )
 *
 * with `χ²(i, j)` the total-least-squares residual ({@link PrefixSums.chi2Line}),
 * ties to the smallest `i`, read back from `n − 1`. The start point is not
 * charged. The scan from `i` stops once `½·χ²(i, j) > PRUNE_SLACK·λ·PARAMS_LINE·(j − i)`:
 * covering `i..j` costs at least `λ·PARAMS_LINE·(j − i)`, and χ² only grows with
 * the span, so the bound discards only spans the objective rejects. Fewer than
 * two points return every index at cost 0; a closed polyline is cut at the point
 * farthest from its centroid and solved open, the cut appearing at both ends.
 */
export function optimalPolygon(poly: Polyline, cfg: FitConfig): Segmentation {
  const n = polylineSize(poly)
  if (n < 2) return { vertices: Array.from({ length: n }, (_, k) => k), cost: 0 }
  if (poly.closed) return optimalPolygonClosed(poly, cfg)
  const sums = new PrefixSums(poly.points, poly.sigma)
  const best = new Float64Array(n).fill(Infinity)
  const from = new Int32Array(n).fill(-1)
  best[0] = 0
  for (let i = 0; i < n - 1; i++) {
    if (!Number.isFinite(best[i])) continue
    for (let j = i + 1; j < n; j++) {
      const chi2 = sums.chi2Line(i, j)
      const c = best[i] + 0.5 * chi2 + cfg.lambda * PARAMS_LINE
      if (c < best[j]) {
        best[j] = c
        from[j] = i
      }
      const floor = cfg.lambda * PARAMS_LINE * (j - i)
      if (0.5 * chi2 > PRUNE_SLACK * floor) break
    }
  }
  const vertices: number[] = []
  let cur = n - 1
  while (cur !== -1) {
    vertices.push(cur)
    if (cur === 0) break
    cur = from[cur]
  }
  vertices.reverse()
  return { vertices, cost: best[n - 1] }
}

/**
 * Index of the point farthest from the points' centroid (the last of equals),
 * a cut stable under rotation and resampling.
 */
export function farthestFromCentroid(pts: Float64Array): number {
  const n = pts.length >> 1
  let sx = 0
  let sy = 0
  for (let k = 0; k < n; k++) sx += pts[2 * k]
  for (let k = 0; k < n; k++) sy += pts[2 * k + 1]
  const cx = sx / n
  const cy = sy / n
  let cut = 0
  let far = -Infinity
  for (let k = 0; k < n; k++) {
    const d = Math.hypot(pts[2 * k] - cx, pts[2 * k + 1] - cy)
    if (d >= far || Number.isNaN(d)) {
      far = d
      cut = k
    }
  }
  return cut
}

/** The closed case of {@link optimalPolygon}: cut, open with the cut repeated, solve. */
function optimalPolygonClosed(poly: Polyline, cfg: FitConfig): Segmentation {
  const n = polylineSize(poly)
  const cut = farthestFromCentroid(poly.points)
  const points = new Float64Array(2 * (n + 1))
  const sigma = new Float64Array(n + 1)
  for (let k = 0; k <= n; k++) {
    const idx = (cut + k) % n
    points[2 * k] = poly.points[2 * idx]
    points[2 * k + 1] = poly.points[2 * idx + 1]
    sigma[k] = poly.sigma[idx]
  }
  const seg = optimalPolygon({ points, sigma, closed: false }, cfg)
  return { vertices: seg.vertices.map((i) => (cut + i) % n), cost: seg.cost }
}

/**
 * MDL cost of the single straight segment `i → j`, `½·χ² + λ·PARAMS_LINE`.
 * Builds the prefix sums from scratch, O(n): a reference for checking programs.
 */
export function segmentCost(poly: Polyline, i: number, j: number, cfg: FitConfig): number {
  const sums = new PrefixSums(poly.points, poly.sigma)
  return 0.5 * sums.chi2Line(i, j) + cfg.lambda * PARAMS_LINE
}

/**
 * Whether the vertex list `v` runs all the way round a closed polyline, so its
 * first and last vertex are one point and the join between the last and first
 * segment is a vertex like any other: the same index at both ends, or a loop
 * opened at a cut (vertices `0` and `n − 1` on coincident points).
 */
export function spansLoop(poly: Polyline, v: readonly number[]): boolean {
  if (!poly.closed || v.length < 2) return false
  if (v[0] === v[v.length - 1]) return true
  const n = polylineSize(poly)
  const p = poly.points
  return (
    v[0] === 0 &&
    v[v.length - 1] === n - 1 &&
    Math.hypot(p[0] - p[2 * n - 2], p[1] - p[2 * n - 1]) < 1e-9
  )
}

/** A line as `(centroid, unit direction)`. */
interface FittedLine {
  px: number
  py: number
  dx: number
  dy: number
}

/**
 * Weighted total-least-squares line through `count` points (`xs`, `ys`, weights
 * `ws`): through the weighted centroid along the major eigenvector
 * `(λ_max − Cyy, Cxy)` of the weighted scatter, the larger-spread axis when `Cxy`
 * vanishes. Null for fewer than two points or a non-positive weight.
 */
function fitLine(xs: number[], ys: number[], ws: number[]): FittedLine | null {
  let w = 0
  for (const k of ws) w += k
  if (xs.length < 2 || w <= 0) return null
  let mx = 0
  let my = 0
  for (let q = 0; q < xs.length; q++) mx += xs[q] * ws[q]
  for (let q = 0; q < xs.length; q++) my += ys[q] * ws[q]
  mx /= w
  my /= w
  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (let q = 0; q < xs.length; q++) {
    const dx = xs[q] - mx
    const dy = ys[q] - my
    cxx += ws[q] * dx * dx
    cyy += ws[q] * dy * dy
    cxy += ws[q] * dx * dy
  }
  const tr = cxx + cyy
  const diff = cxx - cyy
  const disc = Math.sqrt(Math.max(diff * diff + 4 * cxy * cxy, 0))
  const major = 0.5 * (tr + disc)
  let dx: number
  let dy: number
  if (Math.abs(cxy) > 1e-12) {
    dx = major - cyy
    dy = cxy
  } else if (cxx >= cyy) {
    dx = 1
    dy = 0
  } else {
    dx = 0
    dy = 1
  }
  const nrm = Math.hypot(dx, dy)
  if (nrm <= 1e-12) return null
  return { px: mx, py: my, dx: dx / nrm, dy: dy / nrm }
}

/**
 * The best-fit line of the points from index `a` to `b`, walking (and wrapping
 * on a closed polyline) the actual points. The samples within
 * {@link CORNER_CHAMFER} of either end sit on the chamfer, inside the true
 * edge, and are dropped when at least three remain without them.
 */
function segmentLine(poly: Polyline, a: number, b: number): FittedLine | null {
  const n = polylineSize(poly)
  const p = poly.points
  const ax = p[2 * a]
  const ay = p[2 * a + 1]
  const bx = p[2 * b]
  const by = p[2 * b + 1]
  const xs: number[] = []
  const ys: number[] = []
  const ws: number[] = []
  let i = a
  for (;;) {
    xs.push(p[2 * i])
    ys.push(p[2 * i + 1])
    ws.push(1 / (poly.sigma[i] * poly.sigma[i]))
    if (i === b) break
    i = (i + 1) % n
    if (xs.length > n) break
  }
  const tx: number[] = []
  const ty: number[] = []
  const tw: number[] = []
  for (let q = 0; q < xs.length; q++) {
    const da = Math.hypot(xs[q] - ax, ys[q] - ay)
    const db = Math.hypot(xs[q] - bx, ys[q] - by)
    if (da > CORNER_CHAMFER && db > CORNER_CHAMFER) {
      tx.push(xs[q])
      ty.push(ys[q])
      tw.push(ws[q])
    }
  }
  return tx.length >= 3 ? fitLine(tx, ty, tw) : fitLine(xs, ys, ws)
}

/** As {@link adjustVerticesAt} with every vertex treated as a corner. */
export function adjustVertices(
  poly: Polyline,
  vertices: readonly number[],
  maxShift: number,
): Float64Array {
  return adjustVerticesAt(poly, vertices, maxShift, () => true)
}

/**
 * Vertex positions (interleaved, px, one per entry of `vertices`) with each
 * selected corner moved to the intersection of its two neighbouring segments'
 * fitted lines (Potrace's vertex adjustment, Selinger 2003 §2.3.3, with the unit
 * box generalized to an allowed shift):
 *
 *     hit = p0 + t·d0,   t = ((p1 − p0) × d1) / (d0 × d1)
 *     allowed = maxShift + min(3, CORNER_CHAMFER / max(0.2, sin(½(π − turn))))   if turn ≥ 30°
 *     allowed = maxShift                                                          otherwise
 *
 * The level set rounds a corner off and its nearest sample can be another pixel
 * away, further for sharper corners; nearly collinear lines keep the tight cap,
 * because their intersection is ill-conditioned. `isCorner(k)` receives a
 * position in `vertices`. Unselected vertices, near-parallel neighbours
 * (`|d0 × d1| < 1e-6`) and intersections out of reach keep their measured
 * position. On a loop ({@link spansLoop}) the last position equals the first.
 * Fewer than three vertices are returned unchanged.
 */
export function adjustVerticesAt(
  poly: Polyline,
  vertices: readonly number[],
  maxShift: number,
  isCorner: (k: number) => boolean,
): Float64Array {
  const v = vertices
  const p = poly.points
  const out = new Float64Array(2 * v.length)
  for (let k = 0; k < v.length; k++) {
    out[2 * k] = p[2 * v[k]]
    out[2 * k + 1] = p[2 * v[k] + 1]
  }
  if (v.length < 3) return out
  const closed = spansLoop(poly, v)
  const n = v.length
  const segCount = n - 1
  const lines: (FittedLine | null)[] = []
  for (let k = 0; k < segCount; k++) lines.push(segmentLine(poly, v[k], v[k + 1]))
  const first = closed ? 0 : 1
  const last = closed ? segCount : n - 1
  for (let k = first; k < last; k++) {
    if (!isCorner(k)) continue
    const prev = closed ? (k + segCount - 1) % segCount : k - 1
    const next = closed ? k % segCount : k
    const l0 = lines[prev]
    const l1 = lines[next]
    if (!l0 || !l1) continue
    const denom = l0.dx * l1.dy - l0.dy * l1.dx
    if (Math.abs(denom) < 1e-6) continue
    const t = ((l1.px - l0.px) * l1.dy - (l1.py - l0.py) * l1.dx) / denom
    const hx = l0.px + l0.dx * t
    const hy = l0.py + l0.dy * t
    const turn = Math.atan2(Math.abs(denom), l0.dx * l1.dx + l0.dy * l1.dy)
    let allowed = maxShift
    if (turn >= CORNER_TURN_MIN) {
      const halfInterior = 0.5 * (Math.PI - turn)
      allowed = maxShift + fmin(CORNER_CHAMFER / fmax(Math.sin(halfInterior), 0.2), 3)
    }
    if (Math.hypot(hx - out[2 * k], hy - out[2 * k + 1]) <= allowed) {
      out[2 * k] = hx
      out[2 * k + 1] = hy
    }
  }
  if (closed) {
    out[2 * n - 2] = out[0]
    out[2 * n - 1] = out[1]
  }
  return out
}

/**
 * Perpendicular distance from `p` to the infinite line through `a` and `b`,
 * `|(p − a) × (b − a)| / |b − a|`; the distance to `a` when they coincide.
 */
export function lineDistance(p: Vec, a: Vec, b: Vec): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  if (len <= Number.EPSILON) return Math.hypot(p.x - a.x, p.y - a.y)
  return Math.abs(((p.x - a.x) * dy - (p.y - a.y) * dx) / len)
}

/**
 * Largest perpendicular deviation of the polyline from a segmentation, in units
 * of each point's σ — the quantity `tau` bounds — measured against each chord's
 * line for the points strictly between its vertices. A pair whose indices wrap
 * has no points between them in index order. 0 with no interior points.
 */
export function maxNormalizedDeviation(poly: Polyline, seg: Segmentation): number {
  const p = poly.points
  let worst = 0
  for (let q = 0; q + 1 < seg.vertices.length; q++) {
    const i = seg.vertices[q]
    const j = seg.vertices[q + 1]
    const a = { x: p[2 * i], y: p[2 * i + 1] }
    const b = { x: p[2 * j], y: p[2 * j + 1] }
    for (let k = i + 1; k < j; k++) {
      const d = lineDistance({ x: p[2 * k], y: p[2 * k + 1] }, a, b) / poly.sigma[k]
      worst = fmax(worst, d)
    }
  }
  return worst
}

/**
 * A boundary fitted with the mixed alphabet: a start point and segments, each
 * running from the previous one's end; `closed` when the path returns to its
 * start.
 */
export interface FitPath {
  x0: number
  y0: number
  segments: FitSegment[]
  closed: boolean
}

/** Total description length in parameters: the start point (2) plus every segment's. */
export function pathParams(path: FitPath): number {
  let sum = 0
  for (const s of path.segments) sum += segmentParams(s)
  return 2 + sum
}

/** The path's end: its last segment's end, or its start without segments. */
export function pathEnd(path: FitPath): Vec {
  const last = path.segments[path.segments.length - 1]
  return last ? { x: last.x, y: last.y } : { x: path.x0, y: path.y0 }
}

/**
 * The same curve traversed backwards: a cubic swaps its control points, an arc
 * keeps its circle and side of the chord and flips its sweep, so the two faces
 * sharing an edge share it exactly.
 */
export function reversePath(path: FitPath): FitPath {
  const segs = path.segments
  const out: FitSegment[] = []
  for (let q = segs.length - 1; q >= 0; q--) {
    const s = segs[q]
    const px = q > 0 ? segs[q - 1].x : path.x0
    const py = q > 0 ? segs[q - 1].y : path.y0
    if (s.type === 'L') out.push({ type: 'L', x: px, y: py })
    else if (s.type === 'C') {
      out.push({ type: 'C', x1: s.x2, y1: s.y2, x2: s.x1, y2: s.y1, x: px, y: py })
    } else out.push({ ...s, sweep: !s.sweep, x: px, y: py })
  }
  const end = pathEnd(path)
  return { x0: end.x, y0: end.y, segments: out, closed: path.closed }
}

/** The path moved by `(dx, dy)`: an arc moves only its endpoint. */
export function translatePath(path: FitPath, dx: number, dy: number): FitPath {
  const segments = path.segments.map((s): FitSegment => {
    if (s.type === 'C') {
      return {
        ...s,
        x1: s.x1 + dx,
        y1: s.y1 + dy,
        x2: s.x2 + dx,
        y2: s.y2 + dy,
        x: s.x + dx,
        y: s.y + dy,
      }
    }
    return { ...s, x: s.x + dx, y: s.y + dy }
  })
  return { x0: path.x0 + dx, y0: path.y0 + dy, segments, closed: path.closed }
}

/** Move the last segment's end to `(x, y)`, its type and shape kept. */
export function pinEnd(segs: FitSegment[], x: number, y: number): void {
  if (segs.length > 0) segs[segs.length - 1] = withEnd(segs[segs.length - 1], x, y)
}

/** Spacing, px, at which an arc is chorded for the exact evaluator. */
const ARC_CHORD_SPACING = 0.02

/** A path as straight pieces (interleaved `ax, ay, bx, by`) and cubics, for nearest-point queries. */
interface NearestSet {
  lines: Float64Array
  cubics: Bezier[]
}

/**
 * The path's segments for exact nearest-point queries: lines as they are,
 * cubics as they are, arcs sampled every 0.02 px (the chord would over-state an
 * arc's distance by its sagitta). Null without segments.
 */
function nearestSet(path: FitPath): NearestSet | null {
  if (path.segments.length === 0) return null
  const lines: number[] = []
  const cubics: Bezier[] = []
  let cx = path.x0
  let cy = path.y0
  for (const s of path.segments) {
    if (s.type === 'L') lines.push(cx, cy, s.x, s.y)
    else if (s.type === 'C') {
      cubics.push({ x0: cx, y0: cy, x1: s.x1, y1: s.y1, x2: s.x2, y2: s.y2, x3: s.x, y3: s.y })
    } else {
      const pts = sampleRun(cx, cy, [s], ARC_CHORD_SPACING)
      for (let k = 0; k + 3 < pts.length; k += 2) {
        lines.push(pts[k], pts[k + 1], pts[k + 2], pts[k + 3])
      }
    }
    cx = s.x
    cy = s.y
  }
  return { lines: Float64Array.from(lines), cubics }
}

/** Squared distance (px²) from `(px, py)` to the nearest piece of `set`. */
function nearestDist2(set: NearestSet, px: number, py: number): number {
  let best = Infinity
  const l = set.lines
  for (let k = 0; k < l.length; k += 4) {
    best = fmin(best, nearestLineDist2(px, py, l[k], l[k + 1], l[k + 2], l[k + 3]))
  }
  for (const b of set.cubics) best = fmin(best, nearestCubicDist2(b, px, py, 1e-6))
  return best
}

/**
 * Weighted χ² of a fitted path against the polyline by exact nearest distance
 * to its closest segment (kurbo's nearest-point solvers), `Σ d²/σ²`. The
 * evaluator for comparing fitters, free of the sampled residual's floor.
 * Infinite for a path without segments.
 */
export function pathChi2(poly: Polyline, path: FitPath): number {
  const set = nearestSet(path)
  if (!set) return Infinity
  const n = polylineSize(poly)
  let sum = 0
  for (let k = 0; k < n; k++) {
    const sg = poly.sigma[k]
    sum += nearestDist2(set, poly.points[2 * k], poly.points[2 * k + 1]) / (sg * sg)
  }
  return sum
}

/** Largest distance, px, from any measured point to the path; infinite without segments. */
export function pathMaxDeviation(poly: Polyline, path: FitPath): number {
  const set = nearestSet(path)
  if (!set) return Infinity
  const n = polylineSize(poly)
  let worst = 0
  for (let k = 0; k < n; k++) {
    worst = fmax(worst, Math.sqrt(nearestDist2(set, poly.points[2 * k], poly.points[2 * k + 1])))
  }
  return worst
}

/**
 * The MDL objective of a fitted path, `½·pathChi2 + λ·params`, its parameters
 * counted per segment as the dynamic program counts them (the start point is
 * not charged).
 */
export function pathCost(poly: Polyline, path: FitPath, cfg: FitConfig): number {
  let params = 0
  for (const s of path.segments) params += segmentParams(s)
  return 0.5 * pathChi2(poly, path) + cfg.lambda * params
}

/** The fitted-edge record of a path whose χ² is `chi2`; `params` counts its start point. */
export function fittedEdge(path: FitPath, chi2: number): FittedEdge {
  return {
    x0: path.x0,
    y0: path.y0,
    segments: path.segments,
    closed: path.closed,
    params: pathParams(path),
    chi2,
  }
}
