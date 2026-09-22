import type { PathCommand } from '@trazor/core'
import type { FlatPoints } from '../paths'
import { fitCubicSegment } from '../fit'
import type { Cubic } from '../fit'
import { cornerAt } from './smooth'

/**
 * Multi-model run fitting: the curve half of the chain fit directly to the
 * refined ring samples rather than to the adjusted polygon's chords.
 *
 * Selinger's chain (2003) adjusts each polygon vertex to the intersection of its
 * two chord-fitted edge lines — which circumscribes a convex arc — and then runs
 * the smoothed curve through the edge midpoints, which inscribe it; the emitted
 * curve is a fraction of a pixel small on every convex outline. inkvec instead
 * fits its curves to the measured boundary directly under a minimum-description-
 * length objective (Levien's `kurbo` fit; inkvec `crates/inkvec-fit/multimodel.rs`,
 * `curves.rs`), which carries no such bias.
 *
 * This is the browser-fast form of that idea: the optimal polygon (Selinger
 * §2.2) still supplies the segmentation and the corners, but each smooth run —
 * the refined ring points between two corners — is fitted by least squares,
 * choosing per run between a line, a circular arc and a G1 (tangent-preserving)
 * cubic, priced by description length (`0.5·χ² + λ·params`, inkvec's objective).
 * It runs linear in the ring (recursive descent from the longest admissible
 * span), not inkvec's O(n²) per-vertex dynamic program (`fit_dp`, ~0.5–1 s per
 * ring). A circular run is emitted as circle-exact cubics, so `@trazor/svg`'s
 * `fitArcs` can recover an `A` arc where the output is optimized while the
 * unoptimized path stays valid; a straight run is emitted as a line.
 */
export interface RunFitOptions {
  /** alphamax for corner detection (Selinger §2.3.2), = smoothing × 4/3. */
  alphamax: number
  /** Interior angle (deg) gate for angle/scale-aware corners; omit for pure α. */
  cornerThreshold?: number
  /** Fit tolerance (px): a run is admissible when every sample lies within it. */
  tol: number
  /** Longest merge (polygon edges) tried from a breakpoint; small = more, shorter pieces. */
  reach: number
}

/** Parameter counts priced by the description length (inkvec `curves.rs`). */
const PARAMS_LINE = 2
const PARAMS_ARC = 5
const PARAMS_CUBIC = 6
/**
 * Description-length cost per emitted parameter, in nats: λ = ln(extent/precision)
 * for a ~512 px canvas at ~0.1 px precision (inkvec `FitConfig::from_precision`).
 * λ enters the model choice only through the fidelity/parameter trade below.
 */
const LAMBDA = 8.5
/** Confidence multiplier on the measurement uncertainty (inkvec `tau`, default 2). */
const TAU = 2
/**
 * A run is admissible when its RMS residual is within `tol` (the reduced-χ²
 * gate, inkvec `MAX_REDUCED_CHI2`) AND no single sample strays past this multiple
 * of `tol` — so random sub-pixel scatter around a true arc is smoothed over while
 * a systematic excursion (real shape the model misses) still forces a split.
 */
const MAX_DEV_FACTOR = 2.5
/**
 * Run tolerance floor for a sub-pixel-refined ring. The coverage/color-boundary
 * refinement localizes an edge to a few tenths of a pixel but still jitters
 * sample to sample; a tighter tolerance chases that jitter into an explosion of
 * tiny segments, so this floor keeps a smooth run merged into one arc or cubic.
 */
const MIN_TOL = 0.2
/**
 * Run tolerance floor for an un-refined (lattice) ring: its samples carry the
 * ±0.5 px pixel-quantization staircase, so a tighter tolerance would fit the
 * staircase itself instead of the shape it approximates.
 */
const LATTICE_TOL = 0.5

/** Effective run tolerance from the caller's optTolerance and the ring's origin. */
export function runTolerance(optTolerance: number, refined: boolean): number {
  return Math.max(optTolerance, refined ? MIN_TOL : LATTICE_TOL)
}

/** Longest merge (polygon edges) tried, from the curve-optimization flag. */
const MERGE_REACH_FULL = 24
const MERGE_REACH_LIGHT = 3
export function mergeReach(curveOptimize: boolean): number {
  return curveOptimize ? MERGE_REACH_FULL : MERGE_REACH_LIGHT
}

interface Circle {
  cx: number
  cy: number
  r: number
}

/**
 * Fit the curve half of a closed ring to its refined samples. `geom` is the
 * refined (or lattice) ring, first point repeated as the last; `vertices` are
 * the optimal polygon's ascending sample indices into it (first repeated as
 * last); `polygon` is the adjusted polygon, used only to decide corners under
 * the same rule the smoothing stage uses. Returns `M … Z`.
 */
export function fitClosedRuns(
  geom: FlatPoints,
  vertices: number[],
  polygon: FlatPoints,
  opts: RunFitOptions,
): PathCommand[] | null {
  const n = (geom.length >> 1) - 1 // distinct ring points (last repeats first)
  const mv = (polygon.length >> 1) - 1 // distinct polygon vertices
  if (n < 3 || mv < 3) return null

  // Corners among the polygon vertices, cyclically, under alphamax/cornerThreshold.
  const cornerVerts: number[] = []
  for (let i = 0; i < mv; i++) {
    const ip = (i + mv - 1) % mv
    const inx = (i + 1) % mv
    if (
      cornerAt(
        polygon[ip * 2],
        polygon[ip * 2 + 1],
        polygon[i * 2],
        polygon[i * 2 + 1],
        polygon[inx * 2],
        polygon[inx * 2 + 1],
        opts.alphamax,
        opts.cornerThreshold,
      )
    ) {
      cornerVerts.push(i)
    }
  }

  const out: PathCommand[] = []
  if (cornerVerts.length === 0) {
    // Wholly smooth ring: try one circle over every sample, else merge the
    // polygon edges around the loop, opening at the guaranteed convex start.
    const pts = cyclicRun(geom, 0, 0, n)
    const circle = admissibleCircle(pts, opts.tol)
    out.push({ type: 'M', x: geom[0], y: geom[1] })
    if (circle) {
      emitFullCircle(out, geom[0], geom[1], circle, pts)
    } else {
      // Interior polygon vertices are the only merge breakpoints; the seam holds
      // its central tangent on both sides so the loop closes G1.
      const splits: number[] = []
      for (let p = 1; p < mv; p++) splits.push(vertices[p])
      const seam = centralTangent(pts, 0)
      emitSpan(out, pts, splits, [seam[0], seam[1]], [seam[0], seam[1]], opts)
    }
    out.push({ type: 'Z' })
    return out
  }

  // Runs corner → corner (cyclic). Each run's endpoints are the two corner
  // apexes — the adjusted polygon vertices, i.e. the least-squares intersection
  // of the incident edge fits (Selinger §2.3.1), which localizes a corner far
  // better than the staircase sample under it — and the polygon edges between
  // them are merged into the fewest arcs/cubics/lines, never split below a
  // vertex. The two runs meeting at a corner keep distinct tangents, so the
  // corner stays sharp without any G1 constraint across it.
  const apex = (cv: number): [number, number] => [polygon[cv * 2], polygon[cv * 2 + 1]]
  const [x0, y0] = apex(cornerVerts[0])
  out.push({ type: 'M', x: x0, y: y0 })
  for (let c = 0; c < cornerVerts.length; c++) {
    const cvA = cornerVerts[c]
    const cvB = cornerVerts[(c + 1) % cornerVerts.length]
    const { pts, splits } = spanData(geom, vertices, n, mv, cvA, cvB)
    // Pin the two corner ends to the accurate apexes.
    const [ax, ay] = apex(cvA)
    const [bx, by] = apex(cvB)
    pts[0] = ax
    pts[1] = ay
    pts[pts.length - 2] = bx
    pts[pts.length - 1] = by
    const t0 = forwardTangent(pts, 0)
    const t1 = forwardTangent(pts, pts.length / 2 - 1)
    emitSpan(out, pts, splits, t0, t1, opts)
  }
  out.push({ type: 'Z' })
  return out
}

/**
 * A corner-to-corner span's linear sample array (from `cvA` to `cvB`, cyclic)
 * and the sample-array positions of the interior polygon vertices — the only
 * places a merge may break. `vertices` are ascending geom indices (first
 * repeated as last); `n` distinct ring points; `mv` distinct polygon vertices.
 */
function spanData(
  geom: FlatPoints,
  vertices: number[],
  n: number,
  mv: number,
  cvA: number,
  cvB: number,
): { pts: FlatPoints; splits: number[] } {
  const pts = cyclicRun(geom, vertices[cvA], vertices[cvB], n)
  const splits: number[] = []
  for (let p = (cvA + 1) % mv; p !== cvB; p = (p + 1) % mv) {
    splits.push((vertices[p] - vertices[cvA] + n) % n)
  }
  return { pts, splits }
}

/**
 * Fit the curve half of an open chain (a cutout junction-to-junction run) to its
 * refined samples, endpoints pinned. `geom` is the refined chain, `vertices` the
 * optimal polyline's ascending indices into it. Returns the commands WITHOUT a
 * leading `M`, ending at the last sample; the first and last samples are exact.
 */
export function fitOpenRuns(
  geom: FlatPoints,
  vertices: number[],
  opts: RunFitOptions,
): PathCommand[] {
  const n = geom.length >> 1
  if (n < 2) return []
  if (n === 2) {
    return [{ type: 'L', x: geom[2], y: geom[3] }]
  }

  // Corner detection over the polyline's interior vertices (endpoints are pinned
  // junctions, always kept).
  const mv = vertices.length
  const cornerPos: number[] = [0]
  for (let i = 1; i < mv - 1; i++) {
    const ip = vertices[i - 1]
    const ic = vertices[i]
    const inx = vertices[i + 1]
    if (
      cornerAt(
        geom[ip * 2],
        geom[ip * 2 + 1],
        geom[ic * 2],
        geom[ic * 2 + 1],
        geom[inx * 2],
        geom[inx * 2 + 1],
        opts.alphamax,
        opts.cornerThreshold,
      )
    ) {
      cornerPos.push(i)
    }
  }
  cornerPos.push(mv - 1)

  const out: PathCommand[] = []
  for (let c = 0; c + 1 < cornerPos.length; c++) {
    const cvA = cornerPos[c]
    const cvB = cornerPos[c + 1]
    const a = vertices[cvA]
    const b = vertices[cvB]
    const pts = sliceRun(geom, a, b)
    const splits: number[] = []
    for (let p = cvA + 1; p < cvB; p++) splits.push(vertices[p] - a)
    const t0 = forwardTangent(pts, 0)
    const t1 = forwardTangent(pts, pts.length / 2 - 1)
    emitSpan(out, pts, splits, t0, t1, opts)
  }
  return out
}

/**
 * Fit a corner-to-corner span by merging its polygon edges into the fewest
 * primitives, breaking only at the interior polygon vertices `splits` (positions
 * into `pts`). From each breakpoint the longest run that a single line / arc /
 * cubic explains within tolerance is emitted; a single edge that nothing explains
 * is emitted as its best-effort primitive rather than split further, so a jittery
 * straight edge stays one line. `t0`/`t1` are the span's end tangents. Appends
 * `L`/`C` commands (no leading `M`); the first point is the pen position.
 */
function emitSpan(
  out: PathCommand[],
  pts: FlatPoints,
  splits: number[],
  t0: [number, number],
  t1: [number, number],
  opts: RunFitOptions,
): void {
  const last = (pts.length >> 1) - 1
  // Breakpoints: the span start, every interior polygon vertex, the span end.
  const breaks = [0, ...splits, last]
  const tanAt = (k: number): [number, number] =>
    k === 0 ? t0 : k === breaks.length - 1 ? t1 : centralTangent(pts, breaks[k])

  let i = 0
  while (i < breaks.length - 1) {
    const reachLimit = Math.min(breaks.length - 1, i + opts.reach)
    let chosen = i + 1
    let plan: Plan | null = null
    for (let j = reachLimit; j > i; j--) {
      const cand = fitBetween(pts, breaks[i], breaks[j], tanAt(i), tanAt(j), opts, j === i + 1)
      if (cand) {
        chosen = j
        plan = cand
        break
      }
    }
    // A single edge always yields a best-effort plan; fall back to a line only in
    // the impossible case that none was produced.
    if (plan) plan(out)
    else out.push({ type: 'L', x: pts[breaks[i + 1] * 2], y: pts[breaks[i + 1] * 2 + 1] })
    i = chosen
  }
}

/** Appends the chosen primitive's commands to a run's output. */
type Plan = (out: PathCommand[]) => void

/**
 * The cheapest admissible primitive (line / arc / cubic) explaining samples
 * `pts[first..last]`, as a {@link Plan}, or null. When `atomic` (a single polygon
 * edge), the best-effort primitive is always returned so a run is never split
 * below a vertex.
 */
function fitBetween(
  pts: FlatPoints,
  first: number,
  last: number,
  t0: [number, number],
  t1: [number, number],
  opts: RunFitOptions,
  atomic: boolean,
): Plan | null {
  const ax = pts[first * 2]
  const ay = pts[first * 2 + 1]
  const bx = pts[last * 2]
  const by = pts[last * 2 + 1]
  const lineP: Plan = (out) => out.push({ type: 'L', x: bx, y: by })
  if (last - first <= 1) return lineP

  const cap = MAX_DEV_FACTOR * opts.tol
  const sigma = opts.tol / TAU
  const cost = (d: Dev, params: number): number =>
    0.5 * ((d.rms * d.rms * (last - first + 1)) / (sigma * sigma)) + LAMBDA * params

  const line = lineDeviation(pts, first, last)
  const circle = fitCircleThrough(pts, first, last)
  const circleDev = circle ? circleDeviation(pts, first, last, circle) : null
  const cubic = fitCubicRun(pts, first, last, t0, t1)
  const cubicDev = cubicDeviation(pts, first, last, cubic)
  const cubicP: Plan = (out) =>
    out.push({
      type: 'C',
      x1: cubic.c1x,
      y1: cubic.c1y,
      x2: cubic.c2x,
      y2: cubic.c2y,
      x: bx,
      y: by,
    })

  let bestCost = Infinity
  let best: Plan | null = null
  const consider = (d: Dev, params: number, plan: Plan): void => {
    if (d.rms > opts.tol || d.max > cap) return
    const c = cost(d, params)
    if (c < bestCost) {
      bestCost = c
      best = plan
    }
  }
  consider(line, PARAMS_LINE, lineP)
  if (circle && circleDev) {
    consider(circleDev, PARAMS_ARC, (out) => emitArc(out, ax, ay, bx, by, circle, pts, first, last))
  }
  consider(cubicDev, PARAMS_CUBIC, cubicP)

  if (best !== null) return best
  if (!atomic) return null
  // A single edge nothing explains within tolerance: emit the lower-residual of a
  // line and a cubic, never split further.
  return line.max <= cubicDev.max ? lineP : cubicP
}

/** RMS and max residual of a run against a model. */
interface Dev {
  rms: number
  max: number
}

/** Perpendicular residuals of the interior samples to the chord. */
function lineDeviation(pts: FlatPoints, first: number, last: number): Dev {
  const ax = pts[first * 2]
  const ay = pts[first * 2 + 1]
  const bx = pts[last * 2]
  const by = pts[last * 2 + 1]
  let ex = bx - ax
  let ey = by - ay
  const len = Math.hypot(ex, ey)
  const straight = len >= 1e-12
  if (straight) {
    ex /= len
    ey /= len
  }
  let max = 0
  let sum2 = 0
  let count = 0
  for (let i = first + 1; i < last; i++) {
    const d = straight
      ? Math.abs((pts[i * 2] - ax) * ey - (pts[i * 2 + 1] - ay) * ex)
      : Math.hypot(pts[i * 2] - ax, pts[i * 2 + 1] - ay)
    sum2 += d * d
    count++
    if (d > max) max = d
  }
  return { rms: count > 0 ? Math.sqrt(sum2 / count) : 0, max }
}

/** Radial residuals of the samples from the fitted circle. */
function circleDeviation(pts: FlatPoints, first: number, last: number, c: Circle): Dev {
  let max = 0
  let sum2 = 0
  let count = 0
  for (let i = first; i <= last; i++) {
    const d = Math.abs(Math.hypot(pts[i * 2] - c.cx, pts[i * 2 + 1] - c.cy) - c.r)
    sum2 += d * d
    count++
    if (d > max) max = d
  }
  return { rms: count > 0 ? Math.sqrt(sum2 / count) : 0, max }
}

/** Residuals of the samples to the cubic (coarse parameter scan). */
function cubicDeviation(pts: FlatPoints, first: number, last: number, c: Cubic): Dev {
  let max = 0
  let sum2 = 0
  let count = 0
  for (let i = first + 1; i < last; i++) {
    const d = distancePointCubic(c, pts[i * 2], pts[i * 2 + 1])
    sum2 += d * d
    count++
    if (d > max) max = d
  }
  return { rms: count > 0 ? Math.sqrt(sum2 / count) : 0, max }
}

/** A least-squares G1 cubic through pts[first..last] with the given end tangents. */
function fitCubicRun(
  pts: FlatPoints,
  first: number,
  last: number,
  t0: [number, number],
  t1: [number, number],
): Cubic {
  const count = last - first + 1
  const u = new Float64Array(count)
  for (let i = 1; i < count; i++) {
    const a = first + i
    u[i] =
      u[i - 1] + Math.hypot(pts[a * 2] - pts[(a - 1) * 2], pts[a * 2 + 1] - pts[(a - 1) * 2 + 1])
  }
  const total = u[count - 1] || 1
  for (let i = 0; i < count; i++) u[i] /= total
  // fitCubicSegment wants t1 pointing back along the curve from the end.
  return fitCubicSegment(pts, first, last, u, t0[0], t0[1], -t1[0], -t1[1])
}

/**
 * Circle through pts[first] and pts[last] whose center lies on their
 * perpendicular bisector, the one free parameter set by least squares over the
 * interior samples (endpoints pinned, so a shared junction stays exact). Null
 * when the run is (near) straight or too short.
 */
function fitCircleThrough(pts: FlatPoints, first: number, last: number): Circle | null {
  if (last - first < 2) return null
  const ax = pts[first * 2]
  const ay = pts[first * 2 + 1]
  const bx = pts[last * 2]
  const by = pts[last * 2 + 1]
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  // Unit normal to the chord = direction of the bisector the center rides.
  let dx = bx - ax
  let dy = by - ay
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-9) return null
  dx /= chord
  dy /= chord
  const nx = -dy
  const ny = dx
  // Center = M + s·n. r² = (s)² + (chord/2)². Each sample i:
  //   (P_i − M − s·n)·(P_i − M − s·n) = s² + (chord/2)²
  // is linear in s ⇒ least-squares s in closed form.
  const half2 = (chord * chord) / 4
  let num = 0
  let den = 0
  for (let i = first; i <= last; i++) {
    const px = pts[i * 2] - mx
    const py = pts[i * 2 + 1] - my
    const pp = px * px + py * py
    const pn = px * nx + py * ny
    // residual r_i(s) = pp − 2 s pn − half2 ; minimize Σ r_i² ⇒ Σ(pp−half2−2s pn)(−2pn)=0
    num += (pp - half2) * pn
    den += pn * pn
  }
  if (den < 1e-9) return null
  const s = num / (2 * den)
  const cx = mx + s * nx
  const cy = my + s * ny
  const r = Math.hypot(s, chord / 2)
  if (!isFinite(r) || r < 1e-6 || r > 1e7) return null
  return { cx, cy, r }
}

/** Free algebraic (Kåsa) circle over all samples; null when it is near-collinear. */
function admissibleCircle(pts: FlatPoints, tol: number): Circle | null {
  const n = pts.length >> 1
  if (n < 4) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < n; i++) {
    sx += pts[i * 2]
    sy += pts[i * 2 + 1]
  }
  const mx = sx / n
  const my = sy / n
  let suu = 0
  let suv = 0
  let svv = 0
  let suuu = 0
  let svvv = 0
  let suvv = 0
  let svuu = 0
  for (let i = 0; i < n; i++) {
    const u = pts[i * 2] - mx
    const v = pts[i * 2 + 1] - my
    suu += u * u
    suv += u * v
    svv += v * v
    suuu += u * u * u
    svvv += v * v * v
    suvv += u * v * v
    svuu += v * u * u
  }
  const det = suu * svv - suv * suv
  if (Math.abs(det) < 1e-9) return null
  const bu = (suuu + suvv) / 2
  const bv = (svvv + svuu) / 2
  const uc = (bu * svv - bv * suv) / det
  const vc = (bv * suu - bu * suv) / det
  const cx = uc + mx
  const cy = vc + my
  const r = Math.sqrt(Math.max(0, uc * uc + vc * vc + (suu + svv) / n))
  if (!isFinite(r) || r < 1e-6 || r > 1e7) return null
  const circle = { cx, cy, r }
  const d = circleDeviation(pts, 0, n - 1, circle)
  return d.rms <= tol && d.max <= MAX_DEV_FACTOR * tol ? circle : null
}

/** Distance from a point to a cubic by a coarse parameter scan (fit-free). */
function distancePointCubic(c: Cubic, px: number, py: number): number {
  let best = Infinity
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const mt = 1 - t
    const x =
      mt * mt * mt * c.p0x + 3 * mt * mt * t * c.c1x + 3 * mt * t * t * c.c2x + t * t * t * c.p3x
    const y =
      mt * mt * mt * c.p0y + 3 * mt * mt * t * c.c1y + 3 * mt * t * t * c.c2y + t * t * t * c.p3y
    const d = (x - px) * (x - px) + (y - py) * (y - py)
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** Emit an arc from A to B along `circle` as ≤90° circle-exact cubics. */
function emitArc(
  out: PathCommand[],
  ax: number,
  ay: number,
  bx: number,
  by: number,
  circle: Circle,
  pts: FlatPoints,
  first: number,
  last: number,
): void {
  const a0 = Math.atan2(ay - circle.cy, ax - circle.cx)
  const a1 = Math.atan2(by - circle.cy, bx - circle.cx)
  const mid = (first + last) >> 1
  const am = Math.atan2(pts[mid * 2 + 1] - circle.cy, pts[mid * 2] - circle.cx)
  const span = arcSpan(a0, a1, am)
  emitArcSpan(out, circle, a0, span, ax, ay, bx, by)
}

/** Emit a full circle (start at A) as four circle-exact cubics. */
function emitFullCircle(
  out: PathCommand[],
  ax: number,
  ay: number,
  circle: Circle,
  pts: FlatPoints,
): void {
  const a0 = Math.atan2(ay - circle.cy, ax - circle.cx)
  // Winding from the samples: a quarter-way point tells CW from CCW.
  const q = (pts.length >> 1) >> 2
  const aq = Math.atan2(pts[q * 2 + 1] - circle.cy, pts[q * 2] - circle.cx)
  let d = aq - a0
  while (d <= -Math.PI) d += 2 * Math.PI
  while (d > Math.PI) d -= 2 * Math.PI
  const span = d >= 0 ? 2 * Math.PI : -2 * Math.PI
  emitArcSpan(out, circle, a0, span, ax, ay, ax, ay)
}

/** An angle wrapped into [0, 2π). */
function wrap2pi(x: number): number {
  let v = x
  while (v < 0) v += 2 * Math.PI
  while (v >= 2 * Math.PI) v -= 2 * Math.PI
  return v
}

/** Signed sweep a0→a1 (radians) that passes through the mid-sample angle `am`. */
function arcSpan(a0: number, a1: number, am: number): number {
  const dEnd = wrap2pi(a1 - a0)
  const dMid = wrap2pi(am - a0)
  // CCW if the mid sample is reached before the end going CCW.
  return dMid <= dEnd ? dEnd : dEnd - 2 * Math.PI
}

/** Append cubics tracing `circle` from angle a0 over signed `span`, pinning ends. */
function emitArcSpan(
  out: PathCommand[],
  circle: Circle,
  a0: number,
  span: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): void {
  const pieces = Math.max(1, Math.ceil(Math.abs(span) / (Math.PI / 2)))
  const step = span / pieces
  const k = (4 / 3) * Math.tan(step / 4)
  const { cx, cy, r } = circle
  let a = a0
  let px = ax
  let py = ay
  for (let i = 0; i < pieces; i++) {
    const a2 = i === pieces - 1 ? a0 + span : a + step
    const nx = cx + r * Math.cos(a2)
    const ny = cy + r * Math.sin(a2)
    // Tangent control arms (Goldapp 1991 / standard circle→Bézier).
    const c1x = px - k * r * Math.sin(a)
    const c1y = py + k * r * Math.cos(a)
    const c2x = nx + k * r * Math.sin(a2)
    const c2y = ny - k * r * Math.cos(a2)
    const endX = i === pieces - 1 ? bx : nx
    const endY = i === pieces - 1 ? by : ny
    out.push({ type: 'C', x1: c1x, y1: c1y, x2: c2x, y2: c2y, x: endX, y: endY })
    a = a2
    px = nx
    py = ny
  }
}

/** Central-difference unit tangent at sample `i` (forward at the ends). */
function centralTangent(pts: FlatPoints, i: number): [number, number] {
  const n = pts.length >> 1
  const a = Math.max(0, i - 1)
  const b = Math.min(n - 1, i + 1)
  let dx = pts[b * 2] - pts[a * 2]
  let dy = pts[b * 2 + 1] - pts[a * 2 + 1]
  const l = Math.hypot(dx, dy)
  if (l < 1e-12) return forwardTangent(pts, i)
  dx /= l
  dy /= l
  return [dx, dy]
}

/** Unit tangent along the segment leaving sample `i` (previous one at the end). */
function forwardTangent(pts: FlatPoints, i: number): [number, number] {
  const n = pts.length >> 1
  const j = i + 1 < n ? i + 1 : i
  const a = i + 1 < n ? i : i - 1
  let dx = pts[j * 2] - pts[a * 2]
  let dy = pts[j * 2 + 1] - pts[a * 2 + 1]
  const l = Math.hypot(dx, dy)
  if (l < 1e-12) return [1, 0]
  dx /= l
  dy /= l
  return [dx, dy]
}

/** Contiguous samples geom[a..b] (a ≤ b) as a fresh flat list. */
function sliceRun(geom: FlatPoints, a: number, b: number): FlatPoints {
  const out: FlatPoints = new Array((b - a + 1) * 2)
  for (let i = a; i <= b; i++) {
    out[(i - a) * 2] = geom[i * 2]
    out[(i - a) * 2 + 1] = geom[i * 2 + 1]
  }
  return out
}

/**
 * Cyclic samples from ring index `a` to `b` over `n` distinct points (the ring's
 * last point repeats its first). `a === b` returns the whole ring back to the
 * start. Always includes both endpoints.
 */
function cyclicRun(geom: FlatPoints, a: number, b: number, n: number): FlatPoints {
  const steps = a === b ? n : (b - a + n) % n
  const out: FlatPoints = new Array((steps + 1) * 2)
  for (let s = 0; s <= steps; s++) {
    const idx = (a + s) % n
    out[s * 2] = geom[idx * 2]
    out[s * 2 + 1] = geom[idx * 2 + 1]
  }
  return out
}
