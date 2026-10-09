/**
 * The fit's geometry vocabulary: the emitted alphabet (line, cubic, SVG arc) and
 * what each costs, cubic evaluation, the SVG endpoint-to-centre arc conversion,
 * the self-crossing test, and the distances a fitted run is scored by — dense
 * sampling ({@link chi2}, {@link maxDeviation}) and exact nearest points on lines
 * and cubics ({@link nearestCubicDist2}).
 *
 * A segment is an absolute `L`, `C` or `A` {@link PathCommand} running from the
 * previous segment's end. An arc keeps SVG's endpoint form: the centre is not
 * stored but rebuilt from the endpoints, radii, rotation and flags exactly as an
 * SVG renderer does (SVG 1.1 appendix F.6.5), so the arc that is scored is the
 * arc that is drawn. Coordinates are px, y down; angles are radians except an
 * `A` command's `rotation`, which is SVG's degrees.
 *
 * The cubic nearest point is kurbo's: the roots of the degree-5 polynomial
 * `(B(t) − p)·B'(t)` on `[0, 1]` (polycool's Yuksel solver, `./roots`) and the
 * two ends. Squared distances pick the nearest sample where inkvec compares
 * `hypot` distances, which can differ only in the last bit.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/curves.rs` (without the kurbo
 * smoothed-source fitter of the two-pass reference), `multimodel.rs`
 * (`nearest_dist2`), the `MAX_ARC_DEGREES` of `primitives.rs`, and kurbo 0.13
 * (Apache-2.0 OR MIT) `cubicbez.rs`, `line.rs` (`nearest`).
 */
import type { PathCommand } from '@trazor/core'
import { arcParams, cubicParams, PARAMS_ELLIPTICAL_ARC, PARAMS_LINE } from './cost'
import { fmax, fmin, rootsBetween } from './roots'

/** A point or displacement, px. */
export interface Vec {
  x: number
  y: number
}

/** One fitted segment: an absolute line, cubic or arc from the previous segment's end. */
export type FitSegment = Extract<PathCommand, { type: 'L' | 'C' | 'A' }>

/** A cubic Bézier by its control points, px: start `0`, controls `1`, `2`, end `3`. */
export interface Bezier {
  x0: number
  y0: number
  x1: number
  y1: number
  x2: number
  y2: number
  x3: number
  y3: number
}

/**
 * Longest sweep, in degrees, emitted as one arc. Near 180° the endpoint form is
 * badly conditioned (the centre's offset from the chord midpoint, `√(r² − h²)`,
 * has a diverging derivative in the half-chord `h`); at 120° that derivative is
 * 0.58, so the arc is as stable as its endpoints.
 */
export const MAX_ARC_DEGREES = 120

/** Degrees per radian, as Rust's `to_degrees` multiplies. */
const DEGREES_PER_RADIAN = 180 / Math.PI
/** Radians per degree, as Rust's `to_radians` multiplies. */
const RADIANS_PER_DEGREE = Math.PI / 180

/** A straight line to `(x, y)`. */
export function lineTo(x: number, y: number): FitSegment {
  return { type: 'L', x, y }
}

/** A cubic with controls `(x1, y1)`, `(x2, y2)` ending at `(x, y)`. */
export function cubicTo(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x: number,
  y: number,
): FitSegment {
  return { type: 'C', x1, y1, x2, y2, x, y }
}

/** An elliptical arc to `(x, y)` with its x-axis rotated `phi` radians. */
export function ellipticalArc(
  rx: number,
  ry: number,
  phi: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): FitSegment {
  return { type: 'A', rx, ry, rotation: phi * DEGREES_PER_RADIAN, largeArc, sweep, x, y }
}

/** A circular arc: equal radii, no rotation. */
export function circularArc(
  radius: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): FitSegment {
  return { type: 'A', rx: radius, ry: radius, rotation: 0, largeArc, sweep, x, y }
}

/** An arc's rotation in radians. */
export function arcPhi(seg: Extract<PathCommand, { type: 'A' }>): number {
  return seg.rotation * RADIANS_PER_DEGREE
}

/**
 * Whether an arc is a circle's (equal radii within `1e-9·max(rx, 1)`, no
 * rotation). True for every other segment, which has no radii to compare.
 */
export function isCircular(seg: FitSegment): boolean {
  if (seg.type !== 'A') return true
  return Math.abs(seg.rx - seg.ry) <= 1e-9 * Math.max(Math.abs(seg.rx), 1) && seg.rotation === 0
}

/**
 * Numbers a segment adds to the document under the prices in force: a line
 * {@link PARAMS_LINE}, a cubic `cubicParams()`, a circular arc `arcParams()`, an
 * elliptical arc {@link PARAMS_ELLIPTICAL_ARC}.
 */
export function segmentParams(seg: FitSegment): number {
  switch (seg.type) {
    case 'L':
      return PARAMS_LINE
    case 'C':
      return cubicParams()
    case 'A':
      return isCircular(seg) ? arcParams() : PARAMS_ELLIPTICAL_ARC
  }
}

/** The same segment ending at `(x, y)`, its type and shape parameters kept. */
export function withEnd(seg: FitSegment, x: number, y: number): FitSegment {
  return { ...seg, x, y }
}

/** The unit vector along `(x, y)`, or null for a length below 1e-12 or a non-finite one. */
export function unitVec(x: number, y: number): Vec | null {
  const n = Math.hypot(x, y)
  if (n < 1e-12 || !Number.isFinite(n)) return null
  return { x: x / n, y: y / n }
}

/**
 * Cubic Bernstein basis at `t`: `[(1−t)³, 3(1−t)²t, 3(1−t)t², t³]`. The weights
 * sum to 1; on `[0, 1]` they are non-negative. `t` is not clamped.
 */
export function bernstein(t: number): [number, number, number, number] {
  const u = 1 - t
  return [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
}

/** The cubic at `t`, `Σ b_k(t)·p_k` with the {@link bernstein} weights, into `out`. */
export function evalCubic(b: Bezier, t: number, out: Vec): Vec {
  const u = 1 - t
  const w0 = u * u * u
  const w1 = 3 * u * u * t
  const w2 = 3 * u * t * t
  const w3 = t * t * t
  out.x = w0 * b.x0 + w1 * b.x1 + w2 * b.x2 + w3 * b.x3
  out.y = w0 * b.y0 + w1 * b.y1 + w2 * b.y2 + w3 * b.y3
  return out
}

/**
 * The cubic's derivative at `t`, unnormalized (px per unit `t`), into `out`:
 * `3(1−t)²(p1 − p0) + 6(1−t)t(p2 − p1) + 3t²(p3 − p2)`. Zero at an end whose
 * control point coincides with it.
 */
export function cubicTangent(b: Bezier, t: number, out: Vec): Vec {
  const u = 1 - t
  const w0 = 3 * u * u
  const w1 = 6 * u * t
  const w2 = 3 * t * t
  out.x = w0 * (b.x1 - b.x0) + w1 * (b.x2 - b.x1) + w2 * (b.x3 - b.x2)
  out.y = w0 * (b.y1 - b.y0) + w1 * (b.y2 - b.y1) + w2 * (b.y3 - b.y2)
  return out
}

/**
 * Whether the cubic crosses itself strictly inside its span. Exact, closed form:
 * in the power basis `B(t) = a t³ + b t² + c t + d`, `B(t) − B(s)` factors as
 * `(t − s)·[a(t² + ts + s²) + b(t + s) + c]`; with `u = t + s`, `v = ts` and
 * `w = u² − v` both coordinates are linear in `(w, u)`, so one 2x2 solve gives
 * them, and `t`, `s` are the roots of `z² − u·z + v`. A singular system (the
 * cubic degenerating towards a conic or a line) is reported clean.
 */
export function cubicSelfIntersects(b: Bezier): boolean {
  const ax = -b.x0 + 3 * b.x1 - 3 * b.x2 + b.x3
  const ay = -b.y0 + 3 * b.y1 - 3 * b.y2 + b.y3
  const bx = 3 * (b.x0 - 2 * b.x1 + b.x2)
  const by = 3 * (b.y0 - 2 * b.y1 + b.y2)
  const cx = 3 * (b.x1 - b.x0)
  const cy = 3 * (b.y1 - b.y0)
  const det = ax * by - ay * bx
  if (Math.abs(det) < 1e-12) return false
  const w = (-cx * by + cy * bx) / det
  const u = (ax * -cy - ay * -cx) / det
  const v = u * u - w
  const disc = u * u - 4 * v
  if (disc <= 0) return false
  const r = Math.sqrt(disc)
  const t = 0.5 * (u - r)
  const s = 0.5 * (u + r)
  // Strictly inside and distinct: an endpoint touching is a closed loop, not a defect.
  const eps = 1e-9
  return t > eps && t < 1 - eps && s > eps && s < 1 - eps && Math.abs(s - t) > eps
}

/**
 * Centre parametrization of an SVG arc: a point at parameter `t` is
 * `c + R(phi)·(rx cos t, ry sin t)`; `delta` is the signed sweep, positive for
 * `sweep = true`. The radii are the ones drawn, scaled up when the chord does
 * not fit the ellipse.
 */
export interface ArcFrame {
  cx: number
  cy: number
  rx: number
  ry: number
  /** Rotation of the ellipse's x-axis, radians. */
  phi: number
  /** Parameter at the arc's start. */
  theta1: number
  /** Signed sweep, radians. */
  delta: number
}

/** The arc's point at parameter `t`, into `out`. */
export function arcFramePoint(f: ArcFrame, t: number, out: Vec): Vec {
  const sp = Math.sin(f.phi)
  const cp = Math.cos(f.phi)
  const x = f.rx * Math.cos(t)
  const y = f.ry * Math.sin(t)
  out.x = f.cx + cp * x - sp * y
  out.y = f.cy + sp * x + cp * y
  return out
}

/** A length bounding the arc from above, `|max(rx, ry)·delta|`, for a sample count. */
export function arcFrameSpan(f: ArcFrame): number {
  return Math.abs(Math.max(Math.abs(f.rx), Math.abs(f.ry)) * f.delta)
}

/**
 * Endpoint-to-centre conversion of an SVG arc from `(x0, y0)` to `(x1, y1)`
 * (SVG 1.1 appendix F.6.5), with `R(φ)` the rotation by `phi`:
 *
 * 1. the half-chord in the ellipse's frame, `(x1', y1') = R(−φ)·(start − end)/2`;
 * 2. if `Λ = x1'²/rx² + y1'²/ry² > 1` both radii are scaled by `√Λ` (F.6.6);
 * 3. the centre in that frame,
 *    `c' = ±√((rx²ry² − rx²y1'² − ry²x1'²) / (rx²y1'² + ry²x1'²))·(rx·y1'/ry, −ry·x1'/rx)`,
 *    negative when `largeArc === sweep`, the radicand clamped at 0;
 * 4. `c = R(φ)·c' + (start + end)/2`;
 * 5. `theta1` the angle of `((x1' − cx')/rx, (y1' − cy')/ry)` and `delta` the
 *    angle on to `((−x1' − cx')/rx, (−y1' − cy')/ry)`, in `(−2π, 0]` for
 *    `sweep = false` and `[0, 2π)` for `sweep = true`.
 *
 * Negative radii are taken by absolute value. Coincident endpoints or a zero
 * radius give `delta = 0`, which samples to nothing, as SVG draws nothing.
 */
export function arcEllipseCenter(
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
  const midX = (x0 + x1) * 0.5
  const midY = (y0 + y1) * 0.5
  const hx = (x0 - x1) * 0.5
  const hy = (y0 - y1) * 0.5
  if (hx * hx + hy * hy <= 1e-24 || rx <= 1e-12 || ry <= 1e-12) {
    return { cx: x0 - rx, cy: y0, rx, ry, phi, theta1: 0, delta: 0 }
  }
  const sp = Math.sin(phi)
  const cp = Math.cos(phi)
  // The half-chord in the ellipse's own frame.
  const xp = cp * hx + sp * hy
  const yp = -sp * hx + cp * hy
  const lambda = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = Math.max(rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp, 0)
  const den = rx * rx * yp * yp + ry * ry * xp * xp
  let coef = den > 0 ? Math.sqrt(num / den) : 0
  if (largeArc === sweep) coef = -coef
  const cxp = (coef * rx * yp) / ry
  const cyp = (-coef * ry * xp) / rx
  const cx = cp * cxp - sp * cyp + midX
  const cy = sp * cxp + cp * cyp + midY
  const theta1 = Math.atan2((yp - cyp) / ry, (xp - cxp) / rx)
  let delta = Math.atan2((-yp - cyp) / ry, (-xp - cxp) / rx) - theta1
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  else if (sweep && delta < 0) delta += 2 * Math.PI
  return { cx, cy, rx, ry, phi, theta1, delta }
}

/** The circular case of {@link arcEllipseCenter}: centre, drawn radius, start angle, signed sweep. */
export interface CircleArc {
  cx: number
  cy: number
  r: number
  theta1: number
  delta: number
}

/**
 * Centre of the circular arc of `radius` from `(x0, y0)` to `(x1, y1)`; the
 * radius returned is the one drawn, which exceeds `radius` when the chord is
 * longer than a diameter.
 */
export function arcCenter(
  x0: number,
  y0: number,
  radius: number,
  largeArc: boolean,
  sweep: boolean,
  x1: number,
  y1: number,
): CircleArc {
  const f = arcEllipseCenter(x0, y0, radius, radius, 0, largeArc, sweep, x1, y1)
  return { cx: f.cx, cy: f.cy, r: f.rx, theta1: f.theta1, delta: f.delta }
}

/** The frame of an `A` segment that starts at `(x0, y0)`. */
export function segmentArcFrame(
  x0: number,
  y0: number,
  seg: Extract<PathCommand, { type: 'A' }>,
): ArcFrame {
  return arcEllipseCenter(
    x0,
    y0,
    seg.rx,
    seg.ry,
    arcPhi(seg),
    seg.largeArc,
    seg.sweep,
    seg.x,
    seg.y,
  )
}

/** `ceil(v)` as Rust's saturating `as usize`, clamped to `[lo, hi]`. */
function sampleCount(v: number, lo: number, hi: number): number {
  const c = Math.ceil(v)
  if (Number.isNaN(c)) return lo
  return Math.min(Math.max(c, lo), hi)
}

/**
 * A fitted run sampled at roughly uniform spacing in space, interleaved
 * `x, y, …`: `start`, then every segment. Per segment `ceil(length / spacing)`
 * samples, the length of a cubic bounded by its control polygon and of an arc
 * by `max(rx, ry)·|delta|`; counts clamped to `[1, 4096]` for lines,
 * `[4, 4096]` for cubics (uniform in `t`) and `[2, 4096]` for arcs. An arc lands
 * exactly on its stored endpoint, so joins stay watertight.
 */
export function sampleRun(
  x0: number,
  y0: number,
  segs: readonly FitSegment[],
  spacing: number,
): Float64Array {
  const frames: (ArcFrame | null)[] = []
  const counts: number[] = []
  let total = 1
  let cx = x0
  let cy = y0
  for (const s of segs) {
    let n: number
    let frame: ArcFrame | null = null
    if (s.type === 'L') {
      n = sampleCount(Math.hypot(s.x - cx, s.y - cy) / spacing, 1, 4096)
    } else if (s.type === 'C') {
      const approx =
        Math.hypot(s.x1 - cx, s.y1 - cy) +
        Math.hypot(s.x2 - s.x1, s.y2 - s.y1) +
        Math.hypot(s.x - s.x2, s.y - s.y2)
      n = sampleCount(approx / spacing, 4, 4096)
    } else {
      frame = segmentArcFrame(cx, cy, s)
      n = sampleCount(arcFrameSpan(frame) / spacing, 2, 4096)
    }
    frames.push(frame)
    counts.push(n)
    total += n
    cx = s.x
    cy = s.y
  }
  const out = new Float64Array(2 * total)
  out[0] = x0
  out[1] = y0
  let o = 2
  cx = x0
  cy = y0
  const p: Vec = { x: 0, y: 0 }
  for (let q = 0; q < segs.length; q++) {
    const s = segs[q]
    const n = counts[q]
    if (s.type === 'L') {
      for (let i = 1; i <= n; i++) {
        const t = i / n
        out[o++] = cx + (s.x - cx) * t
        out[o++] = cy + (s.y - cy) * t
      }
    } else if (s.type === 'C') {
      for (let i = 1; i <= n; i++) {
        const t = i / n
        const mt = 1 - t
        const w0 = mt * mt * mt
        const w1 = 3 * mt * mt * t
        const w2 = 3 * mt * t * t
        const w3 = t * t * t
        out[o++] = w0 * cx + w1 * s.x1 + w2 * s.x2 + w3 * s.x
        out[o++] = w0 * cy + w1 * s.y1 + w2 * s.y2 + w3 * s.y
      }
    } else {
      const f = frames[q] as ArcFrame
      for (let i = 1; i < n; i++) {
        arcFramePoint(f, f.theta1 + (f.delta * i) / n, p)
        out[o++] = p.x
        out[o++] = p.y
      }
      out[o++] = s.x
      out[o++] = s.y
    }
    cx = s.x
    cy = s.y
  }
  return out
}

/**
 * Distance from `p` to the segment `a → b`: to `a + t·(b − a)` with
 * `t = clamp((p − a)·(b − a) / |b − a|², 0, 1)`. A zero-length segment is `a`.
 */
export function segmentDistance(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const l2 = dx * dx + dy * dy
  if (l2 <= 1e-24) return Math.hypot(px - ax, py - ay)
  const t = Math.min(Math.max(((px - ax) * dx + (py - ay) * dy) / l2, 0), 1)
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t))
}

/**
 * Distance from each point of `pts` (interleaved) to the polyline through
 * `samples` (interleaved), both running the same way along one boundary. A
 * cursor advances through the samples and only a window of `clamp(m/8, 16, 512)`
 * either side of each point's expected position is searched, so this is linear.
 * The distance is to the chords either side of the nearest sample, which removes
 * the half-spacing floor a nearest-sample distance has.
 */
export function runDistances(pts: Float64Array, samples: Float64Array): Float64Array {
  const n = pts.length >> 1
  const m = samples.length >> 1
  const out = new Float64Array(n)
  if (m === 0) return out.fill(Infinity)
  let cursor = 0
  const window = Math.min(Math.max(m >> 3, 16), 512)
  for (let k = 0; k < n; k++) {
    const px = pts[2 * k]
    const py = pts[2 * k + 1]
    const guess = n > 1 ? Math.floor((k * (m - 1)) / (n - 1)) : 0
    const centre = Math.max(guess, Math.max(cursor - (window >> 1), 0))
    const lo = Math.max(centre - window, 0)
    const hi = Math.min(centre + window, m - 1)
    let best2 = Infinity
    let bestI = cursor
    for (let i = lo; i <= hi; i++) {
      const dx = px - samples[2 * i]
      const dy = py - samples[2 * i + 1]
      const d2 = dx * dx + dy * dy
      if (d2 < best2) {
        best2 = d2
        bestI = i
      }
    }
    cursor = bestI
    let d = Math.sqrt(best2)
    const bx = samples[2 * bestI]
    const by = samples[2 * bestI + 1]
    if (bestI > 0) {
      d = fmin(d, segmentDistance(px, py, samples[2 * bestI - 2], samples[2 * bestI - 1], bx, by))
    }
    if (bestI + 1 < m) {
      d = fmin(d, segmentDistance(px, py, bx, by, samples[2 * bestI + 2], samples[2 * bestI + 3]))
    }
    out[k] = d
  }
  return out
}

/** Sample spacing, px, of the sampled residual. */
const SAMPLE_SPACING = 0.25

/**
 * Largest distance, px, from `pts` (interleaved) to the run from `(x0, y0)`
 * sampled every 0.25 px ({@link runDistances}). Infinite with no segments or
 * fewer than two points, so an empty fit never passes a tolerance test.
 */
export function maxDeviation(
  pts: Float64Array,
  x0: number,
  y0: number,
  segs: readonly FitSegment[],
): number {
  if (segs.length === 0 || pts.length < 4) return Infinity
  const d = runDistances(pts, sampleRun(x0, y0, segs, SAMPLE_SPACING))
  let worst = 0
  for (let k = 0; k < d.length; k++) if (d[k] > worst) worst = d[k]
  return worst
}

/**
 * Weighted χ² of a fitted run against measured points, `Σ (d_k / σ_k)²`, with
 * `d_k` the distance (px) from point `k` to the run from `(x0, y0)` sampled every
 * 0.25 px and `σ_k` floored at 1e-3 px (0.5 for a point beyond `sigma`).
 * Dimensionless; infinite for an empty run.
 */
export function chi2(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  x0: number,
  y0: number,
  segs: readonly FitSegment[],
): number {
  if (segs.length === 0) return Infinity
  const d = runDistances(pts, sampleRun(x0, y0, segs, SAMPLE_SPACING))
  let sum = 0
  for (let k = 0; k < d.length; k++) {
    const s = fmax(k < sigma.length ? sigma[k] : 0.5, 1e-3)
    sum += (d[k] / s) * (d[k] / s)
  }
  return sum
}

/**
 * Squared distance from `(px, py)` to the segment `a → b` (kurbo `Line::nearest`):
 * the projection parameter clamped to `[0, 1]`, a degenerate segment taking `a`.
 */
export function nearestLineDist2(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const vx = px - ax
  const vy = py - ay
  let t = (dx * vx + dy * vy) / (dx * dx + dy * dy)
  t = Math.min(Math.max(Number.isNaN(t) ? 0 : t, 0), 1)
  const ex = vx - t * dx
  const ey = vy - t * dy
  return ex * ex + ey * ey
}

/**
 * Squared distance from `(px, py)` to the cubic (kurbo `CubicBez::nearest`): the
 * critical points of `|B(t) − p|²` are the roots in `[0, 1]` of the quintic
 * `(B(t) − p)·B'(t)`, found to `accuracy` in `t`; the ends are also tried unless
 * all five roots were found.
 */
export function nearestCubicDist2(b: Bezier, px: number, py: number, accuracy: number): number {
  const q0x = b.x0 - px
  const q0y = b.y0 - py
  const q1x = 3 * (b.x1 - b.x0)
  const q1y = 3 * (b.y1 - b.y0)
  const q2x = 3 * (b.x0 - 2 * b.x1 + b.x2)
  const q2y = 3 * (b.y0 - 2 * b.y1 + b.y2)
  const q3x = -b.x0 + 3 * b.x1 - 3 * b.x2 + b.x3
  const q3y = -b.y0 + 3 * b.y1 - 3 * b.y2 + b.y3
  const c0 = q0x * q1x + q0y * q1y
  const c1 = q1x * q1x + q1y * q1y + 2 * (q2x * q0x + q2y * q0y)
  const c2 = 3 * (q2x * q1x + q2y * q1y + (q3x * q0x + q3y * q0y))
  const c3 = 4 * (q3x * q1x + q3y * q1y) + 2 * (q2x * q2x + q2y * q2y)
  const c4 = 5 * (q3x * q2x + q3y * q2y)
  const c5 = 3 * (q3x * q3x + q3y * q3y)
  const roots = rootsBetween([c0, c1, c2, c3, c4, c5], 0, 1, accuracy)
  // The first candidate is taken whatever it is; later ones only when nearer.
  let best = NaN
  let first = true
  for (const t of roots) {
    const mt = 1 - t
    // kurbo's evaluation order: p0·mt³ + (p1·3mt² + (p2·3mt + p3·t)·t)·t.
    const x = b.x0 * (mt * mt * mt) + (b.x1 * (mt * mt * 3) + (b.x2 * (mt * 3) + b.x3 * t) * t) * t
    const y = b.y0 * (mt * mt * mt) + (b.y1 * (mt * mt * 3) + (b.y2 * (mt * 3) + b.y3 * t) * t) * t
    const r = (x - px) * (x - px) + (y - py) * (y - py)
    if (first || r < best) best = r
    first = false
  }
  if (roots.length !== 5) {
    const r0 = q0x * q0x + q0y * q0y
    if (first || r0 < best) best = r0
    const ex = b.x3 - px
    const ey = b.y3 - py
    const r3 = ex * ex + ey * ey
    if (r3 < best) best = r3
  }
  return best
}
