/**
 * Two research post-fit passes that trade a little residual for fewer numbers,
 * off unless a caller asks for them: a line the measurement cannot tell from
 * horizontal or vertical put exactly on the axis ({@link snapAxisAligned}), and
 * a nearly smooth join between two cubics made exactly smooth, so the second
 * cubic can be written with SVG's `S` shorthand ({@link snapSmoothJoins}; a
 * cubic meeting a line nearly smoothly gets its arm laid along the line). Each
 * constrained description is taken the way every choice of the fit is settled,
 * when it is cheaper under `½·χ² + λ·params`.
 *
 * `S` reflects the previous control point about the join in the numbers the
 * reader gets, so the reflection is made on the {@link OutputGrid} the path is
 * written to: the previous cubic's second control point is put on the grid and
 * the next cubic's first control point is the reflection of it about the join
 * rounded to the grid, so the written coordinates satisfy `c1 = 2·join − c2`
 * exactly. The residual test is made on the snapped geometry.
 *
 * Both passes work on a path whose `vertices` are the measured-point indices of
 * its segment ends (`segments + 1`, strictly increasing), in place. Neither moves
 * a forced vertex: the smooth-join snap moves control points only, and the axis
 * snap moves only the vertex between two lines, which the caller runs on a fit
 * without pins.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/merge/snap.rs`.
 */
import type { FitConfig } from '../planar/types'
import { cubicParams, PARAMS_LINE } from './cost'
import { chi2Cubic } from './cubicfit'
import { cubicTo, lineTo } from './curves'
import type { Bezier, FitSegment, Vec } from './curves'
import type { FitPath, Polyline } from './objective'
import { fmax, hypot } from './roots'

/** Parameters of a line constrained to an axis: SVG writes `h16`, one number. */
export const PARAMS_AXIS_LINE = 1

/** How many σ the single worst-placed sample may sit from an axis candidate. */
const MAX_AXIS_DEV_SIGMA = 3

/** Parameters of a cubic whose first control point is the reflection of the one before: `S`. */
export const PARAMS_SMOOTH_CUBIC = 4

/** Turn, degrees, beyond which a join is a corner the smooth-join snap leaves alone. */
export const SMOOTH_JOIN_DEGREES = 20

/** Radians per degree, as Rust's `to_radians` multiplies. */
const RADIANS_PER_DEGREE = Math.PI / 180

/**
 * The grid output coordinates are written on: a coordinate `v` (px, in the
 * fit's frame) is written as the integer `round((v − origin)·scale)` of grid
 * units, so `scale` is grid units per px and `(x0, y0)` a grid point.
 */
export interface OutputGrid {
  scale: number
  x0: number
  y0: number
}

/** Two decimals of a px coordinate, from the origin: the SVG serializer's grid at precision 2. */
export const DEFAULT_GRID: OutputGrid = Object.freeze({ scale: 100, x0: 0, y0: 0 })

// ---------------------------------------------------------------------------
// Axis-aligned lines
// ---------------------------------------------------------------------------

/**
 * Largest perpendicular distance, in σ, from any point of `poly[a..=b]` to the
 * line through `p` and `q`: `max_k |(p_k − p)·n| / σ_k` (σ floored at 1e-6).
 * Infinite when `p` and `q` coincide.
 */
function maxDevSigma(poly: Polyline, a: number, b: number, p: Vec, q: Vec): number {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-12) return Infinity
  const nx = -dy / len
  const ny = dx / len
  const pts = poly.points
  const last = Math.min(b, (pts.length >> 1) - 1)
  let worst = 0
  for (let i = a; i <= last; i++) {
    const d = (pts[2 * i] - p.x) * nx + (pts[2 * i + 1] - p.y) * ny
    worst = fmax(worst, Math.abs(d / fmax(poly.sigma[i], 1e-6)))
  }
  return worst
}

/**
 * Weighted sum of squared perpendicular distances from `poly[a..=b]` to the
 * line through `p` and `q`, each in its own σ: one candidate line's χ².
 * Infinite when `p` and `q` coincide.
 */
function chi2About(poly: Polyline, a: number, b: number, p: Vec, q: Vec): number {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const len = Math.sqrt(dx * dx + dy * dy)
  if (len < 1e-12) return Infinity
  const nx = -dy / len
  const ny = dx / len
  const pts = poly.points
  const last = Math.min(b, (pts.length >> 1) - 1)
  let acc = 0
  for (let i = a; i <= last; i++) {
    const d = (pts[2 * i] - p.x) * nx + (pts[2 * i + 1] - p.y) * ny
    const s = fmax(poly.sigma[i], 1e-6)
    acc += (d / s) * (d / s)
  }
  return acc
}

/**
 * Put each line the measurement cannot distinguish from axis-aligned onto the
 * axis, in place: its end moves to the nearer axis through its start, and the
 * line costs {@link PARAMS_AXIS_LINE} instead of two. Taken when
 *
 *     ½·(χ²_axis − χ²_free) < λ·(PARAMS_LINE − PARAMS_AXIS_LINE)
 *
 * and only where three guards allow: the moved end is shared with a following
 * line (a cubic's control points are fixed in absolute coordinates, and a
 * segment without a successor in this path continues in another edge's fit), it
 * moves no further than its own σ, and no single point of the line sits more
 * than three σ from the axis (a consistent slope can hide under the summed
 * budget). The next line's own residual is not re-examined: a move within the
 * measurement's uncertainty is one it could not resolve either. Returns the
 * number of lines snapped.
 */
export function snapAxisAligned(
  path: FitPath,
  poly: Polyline,
  vertices: readonly number[],
  cfg: FitConfig,
): number {
  const segs = path.segments
  if (segs.length === 0 || vertices.length !== segs.length + 1) return 0
  const n = poly.points.length >> 1
  const budget = 2 * cfg.lambda * (PARAMS_LINE - PARAMS_AXIS_LINE)
  let snapped = 0
  let cur: Vec = { x: path.x0, y: path.y0 }
  for (let k = 0; k < segs.length; k++) {
    const seg = segs[k]
    const end: Vec = { x: seg.x, y: seg.y }
    if (seg.type !== 'L') {
      cur = end
      continue
    }
    const dx = end.x - cur.x
    const dy = end.y - cur.y
    if (dx === 0 && dy === 0) {
      cur = end
      continue
    }
    // The nearer axis, and the end it would take.
    const want: Vec = Math.abs(dy) <= Math.abs(dx) ? { x: end.x, y: cur.y } : { x: cur.x, y: end.y }
    const move = hypot(want.x - end.x, want.y - end.y)
    const nextIsLine = k + 1 < segs.length && segs[k + 1].type === 'L'
    const a = vertices[k]
    const b = vertices[k + 1]
    if (move < 1e-12 || !nextIsLine || b <= a || b >= n) {
      cur = end
      continue
    }
    if (move > fmax(poly.sigma[b], 1e-6)) {
      cur = end
      continue
    }
    if (maxDevSigma(poly, a, b, cur, want) > MAX_AXIS_DEV_SIGMA) {
      cur = end
      continue
    }
    const free = chi2About(poly, a, b, cur, end)
    const axis = chi2About(poly, a, b, cur, want)
    if (axis - free < budget) {
      segs[k] = lineTo(want.x, want.y)
      snapped++
      cur = want
    } else {
      cur = end
    }
  }
  return snapped
}

// ---------------------------------------------------------------------------
// Smooth joins
// ---------------------------------------------------------------------------

/** What every join test reads. */
interface JoinCtx {
  poly: Polyline
  /** Cumulative arc length of the polyline, px. */
  s: Float64Array
  /** The χ² two cubics may give up for the reflection: `2λ·(cubicParams − 4)`. */
  budget: number
  /** `λ`: the χ² a line–cubic join may give up. */
  lambda: number
  grid: OutputGrid | null
}

/** One join between segments `k − 1` and `k`: their measured-point ranges and starts (`q1` is the join). */
interface Join {
  a0: number
  b0: number
  a1: number
  b1: number
  q0: Vec
  q1: Vec
}

/** Scratch cubic the joins are scored through. */
const probe: Bezier = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 }

/** The subsampled residual of the points `a..=b` against the cubic `p0, p1, p2, p3` (`chi2Cubic`). */
function cubicChi2(cx: JoinCtx, a: number, b: number, p0: Vec, p1: Vec, p2: Vec, p3: Vec): number {
  probe.x0 = p0.x
  probe.y0 = p0.y
  probe.x1 = p1.x
  probe.y1 = p1.y
  probe.x2 = p2.x
  probe.y2 = p2.y
  probe.x3 = p3.x
  probe.y3 = p3.y
  return chi2Cubic(cx.poly.points, cx.poly.sigma, cx.s, a, b, probe, true)
}

/** Cumulative chord length at each point, px, with Rust's `hypot`. */
function arcLengthsOf(pts: Float64Array): Float64Array {
  const n = pts.length >> 1
  const out = new Float64Array(n)
  let acc = 0
  for (let k = 1; k < n; k++) {
    acc += hypot(pts[2 * k - 2] - pts[2 * k], pts[2 * k - 1] - pts[2 * k + 1])
    out[k] = acc
  }
  return out
}

/**
 * The lengths of the incoming and outgoing directions at a join, if both are at
 * least 1e-9 px and the turn between them is within {@link SMOOTH_JOIN_DEGREES}.
 */
function nearlySmooth(vin: Vec, vout: Vec): [number, number] | null {
  const nIn = hypot(vin.x, vin.y)
  const nOut = hypot(vout.x, vout.y)
  if (nIn < 1e-9 || nOut < 1e-9) return null
  let ang = (Math.atan2(vin.y, vin.x) - Math.atan2(vout.y, vout.x) + Math.PI) % (2 * Math.PI)
  if (ang < 0) ang += 2 * Math.PI
  ang -= Math.PI
  if (Math.abs(ang) > SMOOTH_JOIN_DEGREES * RADIANS_PER_DEGREE) return null
  return [nIn, nOut]
}

/**
 * Compass search from `v` (updated in place): try `± step` along each coordinate
 * `admissible` allows, move whenever the cost drops by more than 1e-9, halve the
 * step after a sweep without a move, and stop once it falls under 1e-4 or after
 * 12 sweeps. Returns the final cost.
 */
function compassSearch(
  v: Float64Array,
  step0: number,
  admissible: (i: number, t: Float64Array) => boolean,
  cost: (t: Float64Array) => number,
): number {
  let step = step0
  let best = cost(v)
  const t = new Float64Array(v.length)
  for (let sweep = 0; sweep < 12; sweep++) {
    let moved = false
    for (let i = 0; i < v.length; i++) {
      for (let dir = -1; dir <= 1; dir += 2) {
        t.set(v)
        t[i] += dir * step
        if (!admissible(i, t)) continue
        const c = cost(t)
        if (c < best - 1e-9) {
          best = c
          v.set(t)
          moved = true
        }
      }
    }
    if (!moved) {
      step *= 0.5
      if (step < 1e-4) break
    }
  }
  return best
}

/**
 * `v`'s grid index along one axis: `(v − origin)·scale` rounded half up, and
 * within rounding of a halfway point on a decimal grid from the origin, the
 * rounding of `v`'s decimal expansion, as the SVG serializer quantizes.
 */
function gridIndex(v: number, origin: number, scale: number): number {
  const t = (v - origin) * scale
  const r = Math.round(t)
  if (Math.abs(t - r) < 0.5 - (Math.abs(t) * 2e-16 + 1e-9)) return r
  const p = Math.round(Math.log10(scale))
  if (origin === 0 && p >= 0 && p <= 20 && 10 ** p === scale) {
    return Math.round(Number(v.toFixed(p)) * scale)
  }
  return r
}

/** The coordinate of grid index `k` along one axis. */
function gridCoord(k: number, origin: number, scale: number): number {
  return origin + k / scale
}

/**
 * Two cubics meeting nearly smoothly at `q1`: the first cubic's second control
 * point and the second cubic's second control point are searched, the second
 * cubic's first control point fixed to the reflection of the first's about the
 * join (on the output grid when there is one). The replacement pair when the
 * extra residual stays under `2λ·(cubicParams − 4)`.
 */
function snapCubicCubic(
  cx: JoinCtx,
  j: Join,
  prev: Extract<FitSegment, { type: 'C' }>,
  next: Extract<FitSegment, { type: 'C' }>,
): [FitSegment, FitSegment] | null {
  const { q0, q1 } = j
  const pc1 = { x: prev.x1, y: prev.y1 }
  const pc2 = { x: prev.x2, y: prev.y2 }
  const pp3 = { x: prev.x, y: prev.y }
  const c1 = { x: next.x1, y: next.y1 }
  const c2 = { x: next.x2, y: next.y2 }
  const p3 = { x: next.x, y: next.y }
  if (!nearlySmooth({ x: pp3.x - pc2.x, y: pp3.y - pc2.y }, { x: c1.x - q1.x, y: c1.y - q1.y })) {
    return null
  }
  const pairChi2 = (pc2v: Vec, c1v: Vec, c2v: Vec): number =>
    cubicChi2(cx, j.a0, j.b0, q0, pc1, pc2v, pp3) + cubicChi2(cx, j.a1, j.b1, q1, c1v, c2v, p3)
  const free = pairChi2(pc2, c1, c2)
  const reflect = (p: Vec): Vec => ({ x: 2 * q1.x - p.x, y: 2 * q1.y - p.y })
  const v = Float64Array.of(pc2.x, pc2.y, c2.x, c2.y)
  let best = compassSearch(
    v,
    fmax(0.25, hypot(q1.x - p3.x, q1.y - p3.y) * 0.05),
    () => true,
    (t) => {
      const p = { x: t[0], y: t[1] }
      return pairChi2(p, reflect(p), { x: t[2], y: t[3] })
    },
  )
  let newPc2: Vec = { x: v[0], y: v[1] }
  let newC1 = reflect(newPc2)
  const newC2: Vec = { x: v[2], y: v[3] }
  const g = cx.grid
  if (g) {
    // Reflect in the numbers the reader gets: c1 = 2·round(q1) − round(pc2).
    const kpx = gridIndex(newPc2.x, g.x0, g.scale)
    const kpy = gridIndex(newPc2.y, g.y0, g.scale)
    const kqx = gridIndex(q1.x, g.x0, g.scale)
    const kqy = gridIndex(q1.y, g.y0, g.scale)
    newPc2 = { x: gridCoord(kpx, g.x0, g.scale), y: gridCoord(kpy, g.y0, g.scale) }
    newC1 = {
      x: gridCoord(2 * kqx - kpx, g.x0, g.scale),
      y: gridCoord(2 * kqy - kpy, g.y0, g.scale),
    }
    best = pairChi2(newPc2, newC1, newC2)
  }
  if (!(best - free < cx.budget)) return null
  return [
    cubicTo(pc1.x, pc1.y, newPc2.x, newPc2.y, pp3.x, pp3.y),
    cubicTo(newC1.x, newC1.y, newC2.x, newC2.y, p3.x, p3.y),
  ]
}

/**
 * A line then a nearly smooth cubic: the cubic's first arm length along the
 * line's direction and its second control point are searched. The replacement
 * cubic when the extra residual stays under `λ` (half what the saved parameter
 * would justify).
 */
function snapLineCubic(
  cx: JoinCtx,
  j: Join,
  next: Extract<FitSegment, { type: 'C' }>,
): FitSegment | null {
  const { q0, q1 } = j
  const c1 = { x: next.x1, y: next.y1 }
  const c2 = { x: next.x2, y: next.y2 }
  const p3 = { x: next.x, y: next.y }
  const vin = { x: q1.x - q0.x, y: q1.y - q0.y }
  const lens = nearlySmooth(vin, { x: c1.x - q1.x, y: c1.y - q1.y })
  if (!lens) return null
  const ux = vin.x / lens[0]
  const uy = vin.y / lens[0]
  const free = cubicChi2(cx, j.a1, j.b1, q1, c1, c2, p3)
  const v = Float64Array.of(lens[1], c2.x, c2.y)
  const best = compassSearch(
    v,
    fmax(0.25, hypot(q1.x - p3.x, q1.y - p3.y) * 0.05),
    (i, t) => !(i === 0 && t[0] < 1e-4),
    (t) =>
      cubicChi2(
        cx,
        j.a1,
        j.b1,
        q1,
        { x: q1.x + ux * t[0], y: q1.y + uy * t[0] },
        { x: t[1], y: t[2] },
        p3,
      ),
  )
  if (!(best - free < cx.lambda)) return null
  return cubicTo(q1.x + ux * v[0], q1.y + uy * v[0], v[1], v[2], p3.x, p3.y)
}

/**
 * A cubic then a nearly smooth line: the cubic's first control point and its
 * second arm length along the line's direction are searched. The replacement
 * cubic when the extra residual stays under `λ`.
 */
function snapCubicLine(
  cx: JoinCtx,
  j: Join,
  prev: Extract<FitSegment, { type: 'C' }>,
  p3: Vec,
): FitSegment | null {
  const { q0, q1 } = j
  const pc1 = { x: prev.x1, y: prev.y1 }
  const pc2 = { x: prev.x2, y: prev.y2 }
  const pp3 = { x: prev.x, y: prev.y }
  const vout = { x: p3.x - q1.x, y: p3.y - q1.y }
  const lens = nearlySmooth({ x: pp3.x - pc2.x, y: pp3.y - pc2.y }, vout)
  if (!lens) return null
  const ux = vout.x / lens[1]
  const uy = vout.y / lens[1]
  const free = cubicChi2(cx, j.a0, j.b0, q0, pc1, pc2, pp3)
  const v = Float64Array.of(pc1.x, pc1.y, lens[0])
  const best = compassSearch(
    v,
    fmax(0.25, hypot(q0.x - q1.x, q0.y - q1.y) * 0.05),
    (i, t) => !(i === 2 && t[2] < 1e-4),
    (t) =>
      cubicChi2(
        cx,
        j.a0,
        j.b0,
        q0,
        { x: t[0], y: t[1] },
        { x: q1.x - ux * t[2], y: q1.y - uy * t[2] },
        q1,
      ),
  )
  if (!(best - free < cx.lambda)) return null
  return cubicTo(v[0], v[1], q1.x - ux * v[2], q1.y - uy * v[2], pp3.x, pp3.y)
}

/**
 * Make nearly smooth joins exactly smooth where the picture allows, in place.
 * Two cubics are offered the reflection (`S`: four numbers for the second
 * instead of six) and take it when
 *
 *     ½·(χ²_reflected − χ²_free) < λ·(cubicParams − PARAMS_SMOOTH_CUBIC);
 *
 * a line and a cubic (either order) are offered a cubic whose arm at the join
 * lies along the line, for a χ² budget of `λ`. A join is considered only when
 * its turn is within {@link SMOOTH_JOIN_DEGREES}; each constrained fit is a
 * compass search on the subsampled cubic residual (`chi2Cubic`). Only control
 * points move: every segment end, and so every vertex, stays where it is. With
 * a `grid` the reflection holds on it ({@link OutputGrid}); with null it holds
 * in floating point. Returns the number of joins snapped.
 */
export function snapSmoothJoins(
  path: FitPath,
  poly: Polyline,
  vertices: readonly number[],
  cfg: FitConfig,
  grid: OutputGrid | null = DEFAULT_GRID,
): number {
  const segs = path.segments
  if (segs.length < 2 || vertices.length !== segs.length + 1) return 0
  const n = poly.points.length >> 1
  const cx: JoinCtx = {
    poly,
    s: arcLengthsOf(poly.points),
    budget: 2 * cfg.lambda * (cubicParams() - PARAMS_SMOOTH_CUBIC),
    lambda: cfg.lambda,
    grid,
  }
  // Only control points change, so the starts computed once stay right.
  const starts: Vec[] = []
  let sx = path.x0
  let sy = path.y0
  for (const seg of segs) {
    starts.push({ x: sx, y: sy })
    sx = seg.x
    sy = seg.y
  }
  let snapped = 0
  for (let k = 1; k < segs.length; k++) {
    const j: Join = {
      a0: vertices[k - 1],
      b0: vertices[k],
      a1: vertices[k],
      b1: vertices[k + 1],
      q0: starts[k - 1],
      q1: starts[k],
    }
    if (j.b0 <= j.a0 || j.b1 <= j.a1 || j.b1 >= n) continue
    const prev = segs[k - 1]
    const next = segs[k]
    if (prev.type === 'C' && next.type === 'C') {
      const pair = snapCubicCubic(cx, j, prev, next)
      if (pair) {
        segs[k - 1] = pair[0]
        segs[k] = pair[1]
        snapped++
      }
    } else if (prev.type === 'L' && next.type === 'C') {
      const c = snapLineCubic(cx, j, next)
      if (c) {
        segs[k] = c
        snapped++
      }
    } else if (prev.type === 'C' && next.type === 'L') {
      const c = snapCubicLine(cx, j, prev, { x: next.x, y: next.y })
      if (c) {
        segs[k - 1] = c
        snapped++
      }
    }
  }
  return snapped
}
