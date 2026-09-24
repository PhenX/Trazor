import type { PathCommand } from '@trazor/core'
import { pathCoverageError } from '../coverage'
import type { CoveragePatch } from '../coverage'
import type { FlatPoints } from '../paths'
import { fitCubicSegment, refineParam } from '../fit'
import type { Cubic } from '../fit'
import { cornerAt } from './smooth'

/**
 * Multi-model run fitting as a bounded dynamic program: the curve half of the
 * chain, fitted directly to the refined boundary samples under inkvec's
 * description-length objective.
 *
 * Selinger's chain (2003) decides *where* to break (the straightness DP on the
 * lattice, §2.2) before it decides *what* to draw, and the earlier run fitter
 * could only merge adjacent polygon edges — so a rounded corner the polygon
 * split into short chords stayed chords, and a long arc came out as cubics with
 * line stubs at the joins. inkvec (`crates/inkvec-fit/{multimodel,curves,merge}.rs`,
 * `docs/algorithm/11-fitting.md`) decides both under one objective:
 * `cost = 0.5·χ² + λ·params`, χ² the sum of squared point-to-curve residuals
 * weighted by `1/σ²`, `λ = ln(extent/precision)`, a span admissible only when
 * every sample lies within `τ·σ` of the curve.
 *
 * This is the browser-fast form of inkvec's stage 11. Rather than inkvec's DP
 * over every point (O(n²) with an early cut-off), the DP runs over a bounded
 * candidate set per ring — the optimal-polygon vertices (Selinger §2.2) as a
 * prior, the sign changes of the discrete curvature, and a coarse stride so no
 * run is unbroken past a bound — and over the O(k²) spans of that candidate
 * graph it picks the segmentation and the per-span model (line / circular arc /
 * G1 cubic) jointly. `smoothing`/`cornerThreshold` keep their meaning as the
 * corner prior (a corner is a forced breakpoint; a non-corner join keeps the
 * shared data tangent, so it stays G1). After the DP a single merge pass folds
 * adjacent cubics one cubic explains (inkvec `merge_free_cubics`), and outside
 * geometric mode the span is refit as a G1 spline, so a chord the DP drew
 * across a curve does not leave a kink at either end ({@link g1Refit}).
 *
 * A circular span is emitted as circle-exact cubics so `@trazor/svg`'s `fitArcs`
 * recovers an `A` command when the output is optimized while the unoptimized
 * path stays valid; a straight span is a line; a cubic is Schneider's
 * least-squares fit (Graphics Gems, 1990) with the end tangents taken from the
 * neighbouring data.
 */
export interface RunFitOptions {
  /** alphamax for corner detection (Selinger §2.3.2), = smoothing × 4/3. */
  alphamax: number
  /** Interior angle (deg) gate for angle/scale-aware corners; omit for pure α. */
  cornerThreshold?: number
  /** Description-length weight λ = ln(extent/precision) (inkvec `FitConfig`). */
  lambda: number
  /** Admissibility band multiplier τ: a sample is admissible within τ·σ (inkvec `tau`). */
  tau: number
  /** Floor on the per-point admissibility band (px), from `optTolerance`. */
  band: number
  /** Longest span (candidate graph steps) the DP considers from a breakpoint. */
  reach: number
  /** Coarse candidate stride (samples): a candidate at least every `stride` points. */
  stride: number
  /** Image extent (longer side, px); scales the reach down on large canvases. */
  extent?: number
  /**
   * The observed coverage around the ring (small refined rings): a whole-ring
   * circle or ellipse replaces the fitted outline only where it renders that
   * coverage no worse.
   */
  coverage?: CoveragePatch
}

/** Parameter counts priced by the description length (inkvec `curves.rs`). */
const PARAMS_LINE = 2
const PARAMS_ARC = 6
const PARAMS_CUBIC = 6
/**
 * Output precision (px) in `λ = ln(extent/precision)` — inkvec's default 0.1,
 * giving λ ≈ 8.5 at a 512 px extent (`FitConfig::from_precision`).
 */
const PRECISION = 0.1
/** λ when the ring's extent is unknown (an un-refined lattice ring at ~512 px). */
const LAMBDA_DEFAULT = 8.5
/** Confidence multiplier on the measurement uncertainty (inkvec `tau`, default 2). */
const TAU = 2
/** Newton-Raphson reparameterizations of a Schneider cubic fit (Graphics Gems, 1990). */
const REPARAM_ITERS = 1
/**
 * Base positional uncertainty σ (px) of a sample snapped onto the coverage
 * ½-level (inkvec `contour.rs` base ≈ 0.05). Measured against the drawing,
 * refined points on clean anti-aliased edges land within about 0.05–0.1 px.
 */
const SIGMA_REFINED = 0.1
/**
 * σ of a sample left on the lattice along an axis-aligned stretch of the
 * optimal polygon: a hard edge the drawing put on the pixel grid (or the image
 * border), where the lattice point is the edge — tighter than any refined point.
 */
const SIGMA_HARD = 0.06
/**
 * σ of a sample left on the integer lattice elsewhere — a hard slanted edge or
 * an un-refined ring: it carries the ±0.5 px pixel-quantization staircase.
 */
const SIGMA_LATTICE = 0.5
/**
 * σ the fit reads refined samples at outside geometric mode: higher smoothing
 * asks it to simplify, and a looser σ lets one model span a hand-drawn
 * outline's wobble instead of buying segments to follow it.
 */
const SIGMA_SMOOTH = 0.2
/**
 * Smoothing at or below which fits run in geometric mode: the flat-ink profile
 * (sharp-cornered art) traces at 0.25, the illustration profiles at 0.6 and up.
 */
const GEOMETRIC_SMOOTHING = 0.5

/**
 * Whether a fit runs in geometric mode: low smoothing asks for the drawing's
 * own lines, rounds and corners, so samples keep their measured σ and closed
 * rings get the structural refit ({@link fitClosedRefit}).
 */
function geometricMode(opts: RunFitOptions): boolean {
  return opts.alphamax <= (GEOMETRIC_SMOOTHING * 4) / 3 + 1e-9
}

/** Sample σ as the fit reads it: loosened to SIGMA_SMOOTH outside geometric mode. */
function modeSigma(sigma: number[], opts: RunFitOptions): number[] {
  if (geometricMode(opts)) return sigma
  return sigma.map((v) => (v < SIGMA_SMOOTH ? SIGMA_SMOOTH : v))
}

/** Description-length weight λ from the image extent (longer side, px). */
export function descriptionLambda(extent: number): number {
  if (!(extent > 0)) return LAMBDA_DEFAULT
  return Math.max(1, Math.log(extent / PRECISION))
}

/** Confidence multiplier τ on the per-point band. */
export function runTau(): number {
  return TAU
}

/**
 * Per-point σ (px) for a ring's samples: a point snapped off the lattice onto
 * the sub-pixel edge is more certain than the ±0.5 px lattice; a point left in
 * place carries the staircase, unless it lies on an axis-aligned stretch of the
 * optimal polygon `vertices` of a refined ring — a hard edge on the pixel grid,
 * which the lattice point sits on exactly. `lattice` is the pre-refinement
 * geometry, `geom` the (possibly) refined geometry, both flat.
 */
export function ringSigmas(
  lattice: FlatPoints,
  geom: FlatPoints,
  refined: boolean,
  vertices?: readonly number[],
): number[] {
  const n = geom.length >> 1
  const axis = new Uint8Array(n)
  if (refined && vertices) {
    for (let k = 0; k + 1 < vertices.length; k++) {
      const a = vertices[k]
      const b = vertices[k + 1]
      if (lattice[a * 2] === lattice[b * 2] || lattice[a * 2 + 1] === lattice[b * 2 + 1]) {
        for (let i = a; i <= b && i < n; i++) axis[i] = 1
      }
    }
  }
  const sigma = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const moved =
      refined && (geom[i * 2] !== lattice[i * 2] || geom[i * 2 + 1] !== lattice[i * 2 + 1])
    sigma[i] = moved ? SIGMA_REFINED : axis[i] ? SIGMA_HARD : SIGMA_LATTICE
  }
  return sigma
}

/** Longest span (candidate steps) tried, from the curve-optimization flag. */
const MERGE_REACH_FULL = 32
const MERGE_REACH_LIGHT = 4
export function mergeReach(curveOptimize: boolean): number {
  return curveOptimize ? MERGE_REACH_FULL : MERGE_REACH_LIGHT
}

/**
 * Reach scaled down on a large canvas. The DP scores O(K·reach) spans over a
 * ring's candidates and a high-resolution illustration carries far more boundary
 * samples than an icon, so above `EXTENT_FULL_BELOW` px the reach falls off as
 * `1/extent` (floored at {@link MIN_REACH}) to keep the browser fast; the merge
 * pass re-joins any long run a smaller reach split, and the fine detail an
 * illustration would spend the extra reach on is below the visible threshold at
 * that size. An icon (small extent, or an unknown one) keeps the full reach, so
 * its fit is unchanged.
 */
const EXTENT_FULL_BELOW = 700
const MIN_REACH = 6
function scopeReach(opts: RunFitOptions): RunFitOptions {
  const extent = opts.extent ?? 0
  if (extent <= EXTENT_FULL_BELOW) return opts
  const r = EXTENT_FULL_BELOW / extent
  const scaled = Math.round(opts.reach * r * r)
  const reach = scaled < MIN_REACH ? MIN_REACH : scaled > opts.reach ? opts.reach : scaled
  return reach === opts.reach ? opts : { ...opts, reach }
}

/**
 * Coarse candidate stride (samples). The optimal-polygon vertices are the DP's
 * base breakpoints; a stride and the curvature sign changes subdivide only a
 * polygon edge long enough (`≥ stride` samples) to hide a bow — a coarse chord
 * of a large arc, or an inflection the polygon rode straight through — so an
 * organic run of short edges keeps its polygon segmentation.
 */
const STRIDE_FULL = 8
const STRIDE_LIGHT = 3
export function candidateStride(curveOptimize: boolean): number {
  return curveOptimize ? STRIDE_FULL : STRIDE_LIGHT
}

/** Admissibility-band floor (px) from the caller's optTolerance. */
export function runBand(optTolerance: number): number {
  return Math.max(0, optTolerance)
}

interface Circle {
  cx: number
  cy: number
  r: number
}

/** A chosen span and its fitted model, produced by the DP and merged after. */
type SegKind = 'line' | 'arc' | 'cubic'
interface SegFit {
  a: number
  b: number
  kind: SegKind
  circle?: Circle
  cubic?: Cubic
}

/**
 * Fit the curve half of a closed ring to its refined samples. `geom` is the
 * refined (or lattice) ring, first point repeated as the last; `sigma` is the
 * per-point uncertainty (parallel to `geom`); `vertices` are the optimal
 * polygon's ascending sample indices into it (first repeated as last);
 * `polygon` is the adjusted polygon, used only to decide corners under the same
 * rule the smoothing stage uses. Returns `M … Z`.
 */
export function fitClosedRuns(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  polygon: FlatPoints,
  opts: RunFitOptions,
): PathCommand[] | null {
  const n = (geom.length >> 1) - 1 // distinct ring points (last repeats first)
  const mv = (polygon.length >> 1) - 1 // distinct polygon vertices
  if (n < 3 || mv < 3) return null
  opts = scopeReach(opts)
  sigma = modeSigma(sigma, opts)

  // Corners among the polygon vertices, cyclically, read on the unadjusted
  // polygon (its lattice vertices on the refined ring): the vertex adjustment
  // pulls smooth vertices onto the chord and makes their turn angles erratic
  // (inkvec `curves.rs`). A corner turns at least CORNER_TURN_DEG — the drawing
  // turned there, not a round the pixels quantized — and is one under
  // alphamax/cornerThreshold, so the smoothing setting keeps its say.
  // A sharp corner the anti-aliasing cut across has two vertices a stub apart,
  // each turning only part of the way: the pair is judged as one vertex at the
  // stub's middle, between the vertices beyond it.
  const vx = (i: number): number => geom[vertices[i] * 2]
  const vy = (i: number): number => geom[vertices[i] * 2 + 1]
  const isCorner = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    cx: number,
    cy: number,
  ): boolean =>
    turnDeg(ax, ay, bx, by, cx, cy) >= CORNER_TURN_DEG &&
    cornerAt(ax, ay, bx, by, cx, cy, opts.alphamax, opts.cornerThreshold)
  const corner = new Uint8Array(mv)
  for (let i = 0; i < mv; i++) {
    const ip = (i + mv - 1) % mv
    const inx = (i + 1) % mv
    if (isCorner(vx(ip), vy(ip), vx(i), vy(i), vx(inx), vy(inx))) corner[i] = 1
    const in2 = (i + 2) % mv
    if (mv > 3 && Math.hypot(vx(inx) - vx(i), vy(inx) - vy(i)) <= CHAMFER_SPAN) {
      const mx = (vx(i) + vx(inx)) / 2
      const my = (vy(i) + vy(inx)) / 2
      if (isCorner(vx(ip), vy(ip), mx, my, vx(in2), vy(in2))) {
        corner[i] = 1
        corner[inx] = 1
      }
    }
  }
  const cornerVerts: number[] = []
  for (let i = 0; i < mv; i++) if (corner[i]) cornerVerts.push(i)

  if (geometricMode(opts)) {
    const refit = fitClosedRefit(geom, sigma, vertices, polygon, cornerVerts, n, mv, opts)
    if (refit) return refit
  }
  const out: PathCommand[] = []
  if (cornerVerts.length === 0) {
    // Wholly smooth ring: open at the guaranteed convex start and run the DP
    // around the loop with a G1 seam, unless one circle or ellipse over every
    // sample is the better description.
    const { pts, sig } = cyclicRun(geom, sigma, 0, 0, n)
    const splits: number[] = []
    for (let p = 1; p < mv; p++) splits.push(vertices[p])
    const seam = centralTangent(pts, 0)
    const dpCost = [Infinity]
    const segs = spanSegments(
      pts,
      sig,
      splits,
      [seam[0], seam[1]],
      [seam[0], seam[1]],
      opts,
      dpCost,
      true,
    )
    out.push({ type: 'M', x: geom[0], y: geom[1] })
    for (const sg of segs) emitSeg(out, pts, sg)
    out.push({ type: 'Z' })
    return ringPrimitiveOr(out, pts, sig, opts, dpCost[0])
  }

  // Runs corner → corner (cyclic). Each run's endpoints are the corner apexes,
  // pinned; the two runs meeting at a corner keep distinct tangents, so the
  // corner stays sharp.
  const apexCache = new Map<number, [number, number]>()
  // A sharp tip the anti-aliasing cut across comes out of the polygon as two
  // corners joined by a stub a pixel or two long: both take the meeting point
  // of the edges beyond the stub, and the stub's span drops out.
  for (let c = 0; c < cornerVerts.length && cornerVerts.length > 2; c++) {
    const hit = tipApex(geom, sigma, vertices, n, mv, cornerVerts, c)
    if (hit) {
      apexCache.set(cornerVerts[c], hit)
      apexCache.set(cornerVerts[(c + 1) % cornerVerts.length], hit)
    }
  }
  const apex = (cv: number): [number, number] => {
    const hit = apexCache.get(cv)
    if (hit) return hit
    const fallback: [number, number] = [polygon[cv * 2], polygon[cv * 2 + 1]]
    const a = sharpApex(geom, sigma, vertices, n, mv, cv, fallback)
    apexCache.set(cv, a)
    return a
  }
  const [x0, y0] = apex(cornerVerts[0])
  out.push({ type: 'M', x: x0, y: y0 })
  // The corner spans' description, priced to weigh a whole-ring primitive against.
  const splitCost = [0]
  for (let c = 0; c < cornerVerts.length; c++) {
    const cvA = cornerVerts[c]
    const cvB = cornerVerts[(c + 1) % cornerVerts.length]
    const [ax, ay] = apex(cvA)
    const [bx, by] = apex(cvB)
    if (ax === bx && ay === by && cornerVerts.length > 1) continue // a collapsed tip's stub
    const { pts, sig, splits } = spanData(geom, sigma, vertices, n, mv, cvA, cvB)
    pts[0] = ax
    pts[1] = ay
    pts[pts.length - 2] = bx
    pts[pts.length - 1] = by
    const t0 = forwardTangent(pts, 0)
    const t1 = forwardTangent(pts, pts.length / 2 - 1)
    emitSpanDP(out, pts, sig, splits, t0, t1, opts, splitCost)
  }
  out.push({ type: 'Z' })
  // Outside geometric mode a ring the corner rule cut up may still be one ellipse
  // or circle: a small round the lattice polygon renders as a few sharp turns.
  if (!geometricMode(opts) && measuredRing(sigma, n)) {
    const ring = cyclicRun(geom, sigma, 0, 0, n)
    return ringPrimitiveOr(out, ring.pts, ring.sig, opts, splitCost[0])
  }
  return out
}

/**
 * The cheapest whole-ring circle or ellipse over the closed ring `pts` (first
 * sample repeated last) that describes it more cheaply than `fitted`
 * ({@link ringPrimitives}) and, where the ring carries its observed coverage,
 * renders it no worse than `fitted` does; else `fitted`. The samples of a ring
 * a few pixels across sit on its half-coverage contour, which rounds a small
 * triangle or square into a blob a circle fits as well as the corners do — the
 * pixels the contour cuts across still show the corners. A circle the coverage
 * refuses leaves the ellipse its turn: an eye a little taller than wide.
 */
function ringPrimitiveOr(
  fitted: PathCommand[],
  pts: FlatPoints,
  sig: number[],
  opts: RunFitOptions,
  fittedCost: number,
): PathCommand[] {
  let fittedError = -1
  for (const { prim } of ringPrimitives(pts, sig, opts, fittedCost)) {
    const cmds: PathCommand[] = []
    emitRingPrimitive(cmds, prim, pts)
    cmds.push({ type: 'Z' })
    if (!opts.coverage) return cmds
    if (fittedError < 0) fittedError = pathCoverageError(fitted, opts.coverage)
    if (pathCoverageError(cmds, opts.coverage) <= fittedError) return cmds
  }
  return fitted
}

/** Append a whole-ring primitive's closed path (from its `M`), starting near the ring's first sample. */
function emitRingPrimitive(out: PathCommand[], prim: RingPrimitive, pts: FlatPoints): void {
  if (prim.kind === 'ellipse') {
    emitFullEllipse(out, prim.ellipse, pts)
    return
  }
  const [sx, sy] = projectCircle(prim.circle, pts[0], pts[1])
  out.push({ type: 'M', x: sx, y: sy })
  emitFullCircle(out, sx, sy, prim.circle, pts)
}

/** Least turn (degrees) at a corner (inkvec `CORNER_DEGREES`). */
const CORNER_TURN_DEG = 45

/** Turn (degrees) at b between the directions a→b and b→c. */
function turnDeg(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const ux = bx - ax
  const uy = by - ay
  const wx = cx - bx
  const wy = cy - by
  return (Math.atan2(Math.abs(ux * wy - uy * wx), ux * wx + uy * wy) * 180) / Math.PI
}

/** Samples nearer a vertex than this (px) sit on its anti-aliasing chamfer (inkvec CORNER_CHAMFER). */
const CORNER_CHAMFER = 1
/** Turn from which two edge lines' meeting may cross the chamfer (inkvec CORNER_TURN_MIN). */
const CORNER_TURN_MIN = Math.PI / 6

/** σ-weighted total-least-squares line over cyclic samples a..b, the chamfer at both ends dropped. */
function edgeLine(
  geom: FlatPoints,
  sigma: number[],
  a: number,
  b: number,
  n: number,
): { cx: number; cy: number; dx: number; dy: number } | null {
  const ax = geom[a * 2]
  const ay = geom[a * 2 + 1]
  const bx = geom[b * 2]
  const by = geom[b * 2 + 1]
  const steps = (b - a + n) % n
  const collect = (trim: boolean): number[] => {
    const idx: number[] = []
    for (let s = 0; s <= steps; s++) {
      const i = (a + s) % n
      const x = geom[i * 2]
      const y = geom[i * 2 + 1]
      if (
        trim &&
        (Math.hypot(x - ax, y - ay) <= CORNER_CHAMFER ||
          Math.hypot(x - bx, y - by) <= CORNER_CHAMFER)
      )
        continue
      idx.push(i)
    }
    return idx
  }
  let idx = collect(true)
  if (idx.length < 3) idx = collect(false)
  if (idx.length < 2) return null
  let sw = 0
  let mx = 0
  let my = 0
  for (const i of idx) {
    const w = 1 / (sigma[i] * sigma[i])
    sw += w
    mx += w * geom[i * 2]
    my += w * geom[i * 2 + 1]
  }
  mx /= sw
  my /= sw
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const i of idx) {
    const w = 1 / (sigma[i] * sigma[i])
    const x = geom[i * 2] - mx
    const y = geom[i * 2 + 1] - my
    sxx += w * x * x
    sxy += w * x * y
    syy += w * y * y
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let dx = Math.cos(theta)
  let dy = Math.sin(theta)
  if (dx * (bx - ax) + dy * (by - ay) < 0) {
    dx = -dx
    dy = -dy
  }
  return { cx: mx, cy: my, dx, dy }
}

/**
 * The tip where corner `cornerVerts[c]` and the next corner are joined by a
 * polygon edge no longer than CHAMFER_SPAN — the chamfer the anti-aliasing
 * cut across one sharp corner: the meeting point of the edge before the stub
 * and the edge after it, both fitted without their chamfer samples, when the
 * two turns agree and it lies within the corner allowance of the stub's
 * middle. Otherwise null.
 */
function tipApex(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  n: number,
  mv: number,
  cornerVerts: number[],
  c: number,
): [number, number] | null {
  const cvA = cornerVerts[c]
  const cvB = cornerVerts[(c + 1) % cornerVerts.length]
  if (cvB !== (cvA + 1) % mv) return null
  const va = vertices[cvA]
  const vb = vertices[cvB]
  const ax = geom[va * 2]
  const ay = geom[va * 2 + 1]
  const bx = geom[vb * 2]
  const by = geom[vb * 2 + 1]
  if (Math.hypot(bx - ax, by - ay) > CHAMFER_SPAN) return null
  const lp = edgeLine(geom, sigma, vertices[(cvA - 1 + mv) % mv], va, n)
  const ln = edgeLine(geom, sigma, vb, vertices[(cvB + 1) % mv], n)
  if (!lp || !ln) return null
  // Both corners turn the same way: a tip or a notch, not a step.
  const sx = bx - ax
  const sy = by - ay
  const turnA = lp.dx * sy - lp.dy * sx
  const turnB = sx * ln.dy - sy * ln.dx
  if (turnA * turnB <= 0) return null
  const cross = lp.dx * ln.dy - lp.dy * ln.dx
  if (Math.abs(cross) < 1e-6) return null
  const t = ((ln.cx - lp.cx) * ln.dy - (ln.cy - lp.cy) * ln.dx) / cross
  const hx = lp.cx + lp.dx * t
  const hy = lp.cy + lp.dy * t
  const turn = Math.atan2(Math.abs(cross), lp.dx * ln.dx + lp.dy * ln.dy)
  const allowed =
    0.5 + Math.min(3, CORNER_CHAMFER / Math.max(0.2, Math.sin(0.5 * (Math.PI - turn))))
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  return Math.hypot(hx - mx, hy - my) <= allowed ? [hx, hy] : null
}

/**
 * A corner's apex as the meeting of its two edges' fitted lines (inkvec
 * adjust_vertices_at): the samples beside a corner lie on the anti-aliasing
 * chamfer, inside the true corner, so the edges — fitted without them — are
 * intersected. Accepted within an allowance that grows with the corner's
 * sharpness; otherwise `fallback`.
 */
function sharpApex(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  n: number,
  mv: number,
  cv: number,
  fallback: [number, number],
): [number, number] {
  const vi = vertices[cv]
  const vp = vertices[(cv - 1 + mv) % mv]
  const vn = vertices[(cv + 1) % mv]
  const lp = edgeLine(geom, sigma, vp, vi, n)
  const ln = edgeLine(geom, sigma, vi, vn, n)
  if (!lp || !ln) return fallback
  const cross = lp.dx * ln.dy - lp.dy * ln.dx
  if (Math.abs(cross) < 1e-6) return fallback
  const t = ((ln.cx - lp.cx) * ln.dy - (ln.cy - lp.cy) * ln.dx) / cross
  const hx = lp.cx + lp.dx * t
  const hy = lp.cy + lp.dy * t
  const turn = Math.atan2(Math.abs(cross), lp.dx * ln.dx + lp.dy * ln.dy)
  const base = 0.5
  const allowed =
    turn >= CORNER_TURN_MIN
      ? base + Math.min(3, CORNER_CHAMFER / Math.max(0.2, Math.sin(0.5 * (Math.PI - turn))))
      : base
  if (Math.hypot(hx - geom[vi * 2], hy - geom[vi * 2 + 1]) <= allowed) return [hx, hy]
  return fallback
}

/**
 * A corner-to-corner span's linear sample array (from `cvA` to `cvB`, cyclic),
 * its parallel σ, and the sample-array positions of the interior polygon
 * vertices (prior breakpoints for the candidate set).
 */
function spanData(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  n: number,
  mv: number,
  cvA: number,
  cvB: number,
): { pts: FlatPoints; sig: number[]; splits: number[] } {
  const { pts, sig } = cyclicRun(geom, sigma, vertices[cvA], vertices[cvB], n)
  const splits: number[] = []
  for (let p = (cvA + 1) % mv; p !== cvB; p = (p + 1) % mv) {
    splits.push((vertices[p] - vertices[cvA] + n) % n)
  }
  return { pts, sig, splits }
}

/**
 * Fit the curve half of an open chain (a cutout junction-to-junction run) to its
 * refined samples, endpoints pinned. `geom` is the refined chain, `sigma` its
 * per-point uncertainty, `vertices` the optimal polyline's ascending indices.
 * Returns the commands WITHOUT a leading `M`, ending at the last sample; the
 * first and last samples are exact.
 */
export function fitOpenRuns(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  opts: RunFitOptions,
): PathCommand[] {
  const n = geom.length >> 1
  if (n < 2) return []
  if (n === 2) {
    return [{ type: 'L', x: geom[2], y: geom[3] }]
  }
  opts = scopeReach(opts)
  sigma = modeSigma(sigma, opts)

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
    const { pts, sig } = sliceRun(geom, sigma, a, b)
    const splits: number[] = []
    for (let p = cvA + 1; p < cvB; p++) splits.push(vertices[p] - a)
    const t0 = forwardTangent(pts, 0)
    const t1 = forwardTangent(pts, pts.length / 2 - 1)
    emitSpanDP(out, pts, sig, splits, t0, t1, opts)
  }
  return out
}

/**
 * Fit a corner-to-corner span by a bounded dynamic program over its candidate
 * breakpoints, appending the chosen `L`/`C` commands (no leading `M`; the first
 * point is the pen position). `t0`/`t1` are the span's end tangents (a corner
 * apex, or the shared seam tangent of a smooth loop). Candidates: the interior
 * polygon vertices `splits`, the discrete-curvature sign changes, and a coarse
 * stride. The DP picks the segmentation and per-span model jointly under
 * `0.5·χ² + λ·params`, then a single pass merges adjacent cubics.
 */
function emitSpanDP(
  out: PathCommand[],
  pts: FlatPoints,
  sig: number[],
  splits: number[],
  t0: [number, number],
  t1: [number, number],
  opts: RunFitOptions,
  costSum?: number[],
): void {
  const last = (pts.length >> 1) - 1
  if (last <= 0) return
  if (last === 1) {
    out.push({ type: 'L', x: pts[2], y: pts[3] })
    if (costSum) costSum[0] += opts.lambda * PARAMS_LINE
    return
  }
  const cost = [0]
  for (const s of spanSegments(pts, sig, splits, t0, t1, opts, cost)) emitSeg(out, pts, s)
  if (costSum) costSum[0] += cost[0]
}

/** The DP's chosen segments over one span (see {@link emitSpanDP}), merged. */
function spanSegments(
  pts: FlatPoints,
  sig: number[],
  splits: number[],
  t0: [number, number],
  t1: [number, number],
  opts: RunFitOptions,
  costOut?: number[],
  periodic = false,
): SegFit[] {
  const last = (pts.length >> 1) - 1
  if (last <= 1) return last === 1 ? [{ a: 0, b: 1, kind: 'line' }] : []

  const cand = buildCandidates(pts, splits, last, opts.stride)
  const K = cand.length - 1 // candidate index of `last`
  // Candidate tangents, computed once: the span endpoints keep the given corner /
  // seam tangents, interior candidates use the central-difference data tangent.
  const tans: [number, number][] = new Array(K + 1)
  tans[0] = t0
  tans[K] = t1
  for (let ci = 1; ci < K; ci++) tans[ci] = centralTangent(pts, cand[ci])

  // DP over candidate indices: best[m] = cheapest description of cand[0..m].
  const best = new Float64Array(K + 1).fill(Infinity)
  best[0] = 0
  const from = new Int32Array(K + 1).fill(-1)
  const seg: (SegFit | null)[] = new Array(K + 1).fill(null)

  for (let i = 0; i < K; i++) {
    if (best[i] === Infinity) continue
    const ta = tans[i]
    let over = 0
    const jHi = Math.min(K, i + opts.reach)
    for (let j = i + 1; j <= jHi; j++) {
      const c = spanCost(pts, sig, cand[i], cand[j], ta, tans[j], opts, j === i + 1)
      if (c < SPAN_INADMISSIBLE) {
        const total = best[i] + c
        if (total < best[j]) {
          best[j] = total
          from[j] = i
          seg[j] =
            spanKind === 'arc'
              ? { a: cand[i], b: cand[j], kind: 'arc', circle: spanCircle }
              : spanKind === 'cubic'
                ? { a: cand[i], b: cand[j], kind: 'cubic', cubic: spanCubic }
                : { a: cand[i], b: cand[j], kind: 'line' }
        }
        over = 0
      } else if (++over >= PRUNE_PATIENCE) {
        // Nothing admissible for a while: longer spans from i only get worse.
        break
      }
    }
  }

  // Reconstruct the chosen segments (start → end order).
  const segs: SegFit[] = []
  for (let m = K; m > 0; m = from[m]) {
    const s = seg[m]
    if (s === null || from[m] < 0) break
    segs.push(s)
  }
  segs.reverse()
  if (costOut) costOut[0] = best[K]
  mergeFreeCubics(pts, sig, segs, opts)
  if (!geometricMode(opts) && segs.length > 1) {
    const tau = g1Tau(pts, sig, segs, opts)
    const smooth = g1Refit(pts, sig, segs, periodic, tau < opts.tau ? { ...opts, tau } : opts)
    if (smooth) return smooth
  }
  return segs
}

/** Nothing admissible for this many growing spans ⇒ stop scanning (inkvec cut-off). */
const PRUNE_PATIENCE = 6

/**
 * Candidate breakpoint positions (into `pts`) for the DP over a span. The
 * optimal-polygon vertices `splits` are the DP's breakpoints (Selinger §2.2):
 * the DP merges across them — a rounded corner the polygon split into chords
 * becomes one arc, a long arc's chords become one arc, a jittery straight run
 * one line — but does not fragment below them, so an organic run of short edges
 * keeps its polygon segmentation (the fit still samples every point in a span,
 * so a merge is fit to the dense boundary, not to the chords). A coarse stride
 * only subdivides a polygon edge long enough (`≥ stride` samples) to hide a bow,
 * where a large arc under a coarse polygon needs an interior breakpoint. Deduped
 * and sorted; coarsened if the count would blow the per-span bound.
 */
function buildCandidates(
  pts: FlatPoints,
  splits: number[],
  last: number,
  stride: number,
): number[] {
  const mark = new Uint8Array(last + 1)
  mark[0] = 1
  mark[last] = 1
  for (const s of splits) if (s > 0 && s < last) mark[s] = 1

  // Base breakpoints in order, then subdivide only the long gaps between them.
  const base: number[] = []
  for (let i = 0; i <= last; i++) if (mark[i]) base.push(i)
  const inflect = curvatureBreaks(pts, last)
  for (let g = 0; g + 1 < base.length; g++) {
    const lo = base[g]
    const hi = base[g + 1]
    if (hi - lo < stride) continue
    for (const c of inflect) if (c > lo && c < hi) mark[c] = 1
    for (let p = lo + stride; p < hi; p += stride) mark[p] = 1
  }

  let cand: number[] = []
  for (let i = 0; i <= last; i++) if (mark[i]) cand.push(i)

  // Keep the DP O(k²) bounded on a very long span: coarsen the interior (never
  // the endpoints) so a pathological run cannot blow the budget. A long arc still
  // spans the kept candidates within the reach.
  const MAX_CANDIDATES = 256
  if (cand.length > MAX_CANDIDATES) {
    const keep = Math.max(2, MAX_CANDIDATES)
    const step = (cand.length - 1) / (keep - 1)
    const thinned: number[] = []
    for (let k = 0; k < keep; k++) thinned.push(cand[Math.round(k * step)])
    thinned[0] = 0
    thinned[thinned.length - 1] = last
    cand = dedupeSorted(thinned)
  }
  return cand
}

/** Sample positions where the signed discrete curvature changes sign (inflections). */
function curvatureBreaks(pts: FlatPoints, last: number): number[] {
  const breaks: number[] = []
  if (last < 3) return breaks
  let prevSign = 0
  for (let i = 1; i < last; i++) {
    const v1x = pts[i * 2] - pts[(i - 1) * 2]
    const v1y = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]
    const v2x = pts[(i + 1) * 2] - pts[i * 2]
    const v2y = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1]
    const cross = v1x * v2y - v1y * v2x
    const s = cross > 1e-9 ? 1 : cross < -1e-9 ? -1 : 0
    if (s !== 0 && prevSign !== 0 && s !== prevSign) breaks.push(i)
    if (s !== 0) prevSign = s
  }
  return breaks
}

function dedupeSorted(xs: number[]): number[] {
  xs.sort((a, b) => a - b)
  const out: number[] = []
  for (const x of xs) if (out.length === 0 || out[out.length - 1] !== x) out.push(x)
  return out
}

/** Cost returned by {@link spanCost} when no model is admissible on the span. */
const SPAN_INADMISSIBLE = Infinity
/**
 * Winning model of the most recent {@link spanCost} call. The DP reads these only
 * when the span improves a node, so one `SegFit` is allocated per kept segment
 * rather than one per candidate pair the DP examines.
 */
let spanKind: SegKind = 'line'
let spanCircle: Circle | undefined
let spanCubic: Cubic | undefined

/**
 * Cost of the cheapest admissible model (line / arc / cubic) explaining samples
 * `pts[first..last]` under `0.5·χ² + λ·params`, with the span's end tangents
 * `ta`/`tb`, or {@link SPAN_INADMISSIBLE} when none is admissible. The winning
 * model is left in `spanKind`/`spanCircle`/`spanCubic` for the caller to read.
 * When `atomic` (a candidate-adjacent span) the best-effort model is returned so
 * the DP always has a path.
 */
function spanCost(
  pts: FlatPoints,
  sig: number[],
  first: number,
  last: number,
  ta: [number, number],
  tb: [number, number],
  opts: RunFitOptions,
  atomic: boolean,
): number {
  if (last - first <= 1) {
    spanKind = 'line'
    return opts.lambda * PARAMS_LINE
  }

  const lambda = opts.lambda
  const line = lineDeviation(pts, sig, first, last, opts)
  let bestCost = SPAN_INADMISSIBLE
  let bestKind: SegKind | null = null
  let bestCircle: Circle | undefined
  let bestCubic: Cubic | undefined
  const lineOK = line.worst <= 1
  if (lineOK) {
    bestCost = 0.5 * line.chi2 + lambda * PARAMS_LINE
    bestKind = 'line'
  }

  // inkvec's O(1) floor pre-check (`curves.rs`): a 6-parameter curve can only
  // undercut the pinned 2-parameter line when the line's own description length
  // already exceeds what any curve would cost — `0.5·χ²_line > (6−2)·λ`. A
  // straight-enough run never pays for an arc or a cubic fit.
  const tryCurve = !lineOK || 0.5 * line.chi2 > (PARAMS_CUBIC - PARAMS_LINE) * lambda

  if (tryCurve) {
    const circle = fitCircleThrough(pts, first, last)
    let arcOK = false
    if (circle && arcSweepMonotone(pts, first, last, circle)) {
      const cd = circleDeviation(pts, sig, first, last, circle, opts)
      if (cd.worst <= 1) {
        arcOK = true
        const c = 0.5 * cd.chi2 + lambda * PARAMS_ARC
        if (c < bestCost) {
          bestCost = c
          bestKind = 'arc'
          bestCircle = circle
        }
      }
    }
    // The cubic carries the span's only per-point-to-curve scan, so it is fit
    // only where no circular arc covers the run (a smooth non-circular span,
    // the shape inkvec fits as a cubic); an admissible arc emits as one `A`.
    if (!arcOK) {
      const cubic = fitCubicRun(pts, first, last, ta, tb)
      const cbd = cubicDeviation(pts, sig, first, last, cubic, opts)
      if (cbd.worst <= 1) {
        const c = 0.5 * cbd.chi2 + lambda * PARAMS_CUBIC
        if (c < bestCost) {
          bestCost = c
          bestKind = 'cubic'
          bestCubic = cubic
        }
      }
    }
  }

  if (bestKind !== null) {
    spanKind = bestKind
    spanCircle = bestCircle
    spanCubic = bestCubic
    return bestCost
  }
  if (!atomic) return SPAN_INADMISSIBLE
  // A candidate-adjacent span nothing explains within the band: the lower-
  // residual of a line and a cubic, so the DP is never stuck.
  const cubic = fitCubicRun(pts, first, last, ta, tb)
  const cbd = cubicDeviation(pts, sig, first, last, cubic, opts)
  if (line.worst <= cbd.worst) {
    spanKind = 'line'
    return 0.5 * line.chi2 + lambda * PARAMS_LINE
  }
  spanKind = 'cubic'
  spanCubic = cubic
  return 0.5 * cbd.chi2 + lambda * PARAMS_CUBIC
}

/**
 * Merge adjacent curve segments a single cubic explains within the band and more
 * cheaply (inkvec `merge_free_cubics`): the DP is bounded by the candidate graph
 * and cannot re-cost a merge across its reach, so a smooth run the DP split into
 * short cubics or arcs — the fragmentation an organic boundary provokes — is
 * folded back into one cubic here. A pair is merged only when the single cubic
 * is admissible AND cheaper (6 params vs the pair's 12), so a genuine circular
 * arc a cubic cannot cover (over ~90°) is left as an arc. Iterated to a fixpoint,
 * longest-first per position.
 */
const MERGE_ROUNDS = 6
function mergeFreeCubics(
  pts: FlatPoints,
  sig: number[],
  segs: SegFit[],
  opts: RunFitOptions,
): void {
  for (let round = 0; round < MERGE_ROUNDS; round++) {
    let changed = false
    let i = 0
    while (i < segs.length - 1) {
      const s0 = segs[i]
      const s1 = segs[i + 1]
      const curves = s0.kind !== 'line' && s1.kind !== 'line'
      if (curves) {
        const t0 = forwardTangent(pts, s0.a)
        const t1 = backwardTangent(pts, s1.b)
        const merged = fitCubicRun(pts, s0.a, s1.b, t0, t1)
        const d = cubicDeviation(pts, sig, s0.a, s1.b, merged, opts)
        const oldParams =
          (s0.kind === 'arc' ? PARAMS_ARC : PARAMS_CUBIC) +
          (s1.kind === 'arc' ? PARAMS_ARC : PARAMS_CUBIC)
        const oldChi2 = modelChi2(pts, sig, s0, opts) + modelChi2(pts, sig, s1, opts)
        const merQual = 0.5 * d.chi2 + opts.lambda * PARAMS_CUBIC
        const oldQual = 0.5 * oldChi2 + opts.lambda * oldParams
        if (d.worst <= 1 && merQual < oldQual) {
          segs.splice(i, 2, { a: s0.a, b: s1.b, kind: 'cubic', cubic: merged })
          changed = true
          continue
        }
      }
      i++
    }
    if (!changed) break
  }
}

/** χ² of a fitted segment against its samples (0 for a line's pinned chord ends aside). */
function modelChi2(pts: FlatPoints, sig: number[], s: SegFit, opts: RunFitOptions): number {
  if (s.kind === 'arc' && s.circle) return circleDeviation(pts, sig, s.a, s.b, s.circle, opts).chi2
  if (s.kind === 'cubic' && s.cubic) return cubicDeviation(pts, sig, s.a, s.b, s.cubic, opts).chi2
  return lineDeviation(pts, sig, s.a, s.b, opts).chi2
}

/** Append one fitted segment's commands. */
function emitSeg(out: PathCommand[], pts: FlatPoints, s: SegFit): void {
  const bx = pts[s.b * 2]
  const by = pts[s.b * 2 + 1]
  if (s.kind === 'line') {
    out.push({ type: 'L', x: bx, y: by })
  } else if (s.kind === 'arc' && s.circle) {
    emitArc(out, pts[s.a * 2], pts[s.a * 2 + 1], bx, by, s.circle, pts, s.a, s.b)
  } else if (s.kind === 'cubic' && s.cubic) {
    const c = s.cubic
    out.push({ type: 'C', x1: c.c1x, y1: c.c1y, x2: c.c2x, y2: c.c2y, x: bx, y: by })
  } else {
    out.push({ type: 'L', x: bx, y: by })
  }
}

/** χ² (Σ (r/σ)²) and worst normalized residual (max r/(τ·σ+band)); admissible ⇔ worst ≤ 1. */
interface Dev {
  chi2: number
  worst: number
}

/** Per-point admissibility band = τ·σ, floored by `band`. */
function bandAt(sig: number[], i: number, opts: RunFitOptions): number {
  const b = opts.tau * sig[i]
  return b > opts.band ? b : opts.band
}

/** Perpendicular residuals of the interior samples to the chord (endpoints pinned). */
function lineDeviation(
  pts: FlatPoints,
  sig: number[],
  first: number,
  last: number,
  opts: RunFitOptions,
): Dev {
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
  let worst = 0
  let chi2 = 0
  for (let i = first + 1; i < last; i++) {
    const d = straight
      ? Math.abs((pts[i * 2] - ax) * ey - (pts[i * 2 + 1] - ay) * ex)
      : Math.hypot(pts[i * 2] - ax, pts[i * 2 + 1] - ay)
    const s = sig[i]
    chi2 += (d * d) / (s * s)
    const w = d / bandAt(sig, i, opts)
    if (w > worst) worst = w
  }
  return { chi2, worst }
}

/** Radial residuals of the interior samples from the fitted circle. */
function circleDeviation(
  pts: FlatPoints,
  sig: number[],
  first: number,
  last: number,
  c: Circle,
  opts: RunFitOptions,
): Dev {
  let worst = 0
  let chi2 = 0
  for (let i = first + 1; i < last; i++) {
    const d = Math.abs(Math.hypot(pts[i * 2] - c.cx, pts[i * 2 + 1] - c.cy) - c.r)
    const s = sig[i]
    chi2 += (d * d) / (s * s)
    const w = d / bandAt(sig, i, opts)
    if (w > worst) worst = w
  }
  return { chi2, worst }
}

/**
 * Residuals of the interior samples to the cubic. Each sample is projected by its
 * chord-length parameter refined by one Newton step onto the curve (the cubic was
 * least-squares fit to these samples at those parameters, so the projection is the
 * fit residual), a conservative over-estimate of the true point-to-curve distance
 * — never a bulge the band would miss — at one curve evaluation per sample instead
 * of a dense scan.
 */
function cubicDeviation(
  pts: FlatPoints,
  sig: number[],
  first: number,
  last: number,
  c: Cubic,
  opts: RunFitOptions,
): Dev {
  // Chord-length position of each sample along the run, normalized to [0, 1].
  const count = last - first + 1
  let acc = 0
  let prevx = pts[first * 2]
  let prevy = pts[first * 2 + 1]
  let worst = 0
  let chi2 = 0
  // Total chord length for normalization.
  let totalLen = 0
  for (let k = 1; k < count; k++) {
    const a = first + k
    totalLen += Math.hypot(pts[a * 2] - pts[(a - 1) * 2], pts[a * 2 + 1] - pts[(a - 1) * 2 + 1])
  }
  const total = totalLen > 1e-12 ? totalLen : 1
  for (let i = first + 1; i < last; i++) {
    acc += Math.hypot(pts[i * 2] - prevx, pts[i * 2 + 1] - prevy)
    prevx = pts[i * 2]
    prevy = pts[i * 2 + 1]
    const px = pts[i * 2]
    const py = pts[i * 2 + 1]
    const t = refineParam(c, px, py, acc / total)
    const mt = 1 - t
    const qx =
      mt * mt * mt * c.p0x + 3 * mt * mt * t * c.c1x + 3 * mt * t * t * c.c2x + t * t * t * c.p3x
    const qy =
      mt * mt * mt * c.p0y + 3 * mt * mt * t * c.c1y + 3 * mt * t * t * c.c2y + t * t * t * c.p3y
    const d = Math.hypot(qx - px, qy - py)
    const s = sig[i]
    chi2 += (d * d) / (s * s)
    const w = d / bandAt(sig, i, opts)
    if (w > worst) worst = w
  }
  return { chi2, worst }
}

/**
 * A least-squares G1 cubic through pts[first..last] with the given end tangents,
 * Schneider (Graphics Gems 1990) with two chord-length reparameterizations.
 */
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
  let cubic = fitCubicSegment(pts, first, last, u, t0[0], t0[1], -t1[0], -t1[1])
  // One Newton-Raphson reparameterization (Schneider): re-project each sample's
  // parameter onto the fitted curve and refit, so the least-squares fit tracks
  // the true arc-length rather than the chord-length guess.
  for (let iter = 0; iter < REPARAM_ITERS; iter++) {
    let monotone = true
    let prev = -1
    for (let i = 0; i < count; i++) {
      const t = refineParam(cubic, pts[(first + i) * 2], pts[(first + i) * 2 + 1], u[i])
      if (t <= prev) {
        monotone = false
        break
      }
      u[i] = t
      prev = t
    }
    if (!monotone) break
    cubic = fitCubicSegment(pts, first, last, u, t0[0], t0[1], -t1[0], -t1[1])
  }
  return cubic
}

/**
 * Whether the samples pts[first..last] wind monotonically around the fitted
 * circle's centre — no back-and-forth in angle (inkvec `try_arc`'s
 * DIRECTION_SAMPLES gate). A Kåsa circle through a wiggly organic span can carry
 * a sweep the boundary never traces; rejecting it there sends the span to the
 * flexible cubic instead of an arc that bulges.
 */
function arcSweepMonotone(pts: FlatPoints, first: number, last: number, c: Circle): boolean {
  let prev = Math.atan2(pts[first * 2 + 1] - c.cy, pts[first * 2] - c.cx)
  let sign = 0
  let total = 0
  for (let i = first + 1; i <= last; i++) {
    const a = Math.atan2(pts[i * 2 + 1] - c.cy, pts[i * 2] - c.cx)
    let d = a - prev
    while (d > Math.PI) d -= 2 * Math.PI
    while (d < -Math.PI) d += 2 * Math.PI
    if (Math.abs(d) > 1e-9) {
      const s = d > 0 ? 1 : -1
      if (sign === 0) sign = s
      else if (s !== sign) return false
      total += d
    }
    prev = a
  }
  // A near-full turn is a closed loop handled elsewhere, not a single arc span.
  return Math.abs(total) < (11 / 6) * Math.PI
}

/**
 * Circle through pts[first] and pts[last] whose centre rides their perpendicular
 * bisector, the one free parameter set by least squares over the interior
 * samples (endpoints pinned, so a shared breakpoint stays exact and the emitted
 * arc — drawn through those endpoints — is the curve that was scored). Null when
 * the run is (near-)straight or too short.
 */
function fitCircleThrough(pts: FlatPoints, first: number, last: number): Circle | null {
  if (last - first < 2) return null
  const ax = pts[first * 2]
  const ay = pts[first * 2 + 1]
  const bx = pts[last * 2]
  const by = pts[last * 2 + 1]
  const mx = (ax + bx) / 2
  const my = (ay + by) / 2
  let dx = bx - ax
  let dy = by - ay
  const chord = Math.hypot(dx, dy)
  if (chord < 1e-9) return null
  dx /= chord
  dy /= chord
  const nx = -dy
  const ny = dx
  const half2 = (chord * chord) / 4
  let num = 0
  let den = 0
  for (let i = first; i <= last; i++) {
    const px = pts[i * 2] - mx
    const py = pts[i * 2 + 1] - my
    const pp = px * px + py * py
    const pn = px * nx + py * ny
    num += (pp - half2) * pn
    den += pn * pn
  }
  if (den < 1e-9) return null
  const s = num / (2 * den)
  const r = Math.hypot(s, chord / 2)
  if (!isFinite(r) || r < 1e-6 || r > 1e7) return null
  return { cx: mx + s * nx, cy: my + s * ny, r }
}

/**
 * Free algebraic (Kåsa) circle over samples pts[first..last], centered on the
 * subtracted mean for conditioning (Kåsa 1976). Null when the run is
 * (near-)collinear or too short; the caller scores its residual separately.
 */
function fitCircleKasa(pts: FlatPoints, first: number, last: number): Circle | null {
  const n = last - first + 1
  if (n < 3) return null
  let sx = 0
  let sy = 0
  for (let i = first; i <= last; i++) {
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
  for (let i = first; i <= last; i++) {
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
  return { cx, cy, r }
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

// ---------------------------------------------------------------------------
// Structural refit: free models and geometric joins.
// ---------------------------------------------------------------------------

interface FreeLine {
  cx: number
  cy: number
  dx: number
  dy: number
}

/** One ring segment after the refit: its model and the span samples it covers. */
interface RingSeg {
  kind: SegKind
  line?: FreeLine
  circle?: Circle
  /** Span-local sample arrays the segment was fitted on, and its range in them. */
  pts: FlatPoints
  sig: number[]
  a: number
  b: number
  /** Whether the join at the segment's start is a corner (else smooth). */
  cornerStart: boolean
  /** Corner apex estimate at the segment's start (corner joins only). */
  apexX: number
  apexY: number
  /** Measured vertex at the start (corner joins only), for the allowance. */
  vertX: number
  vertY: number
  /** Samples the free models leave out (span apexes, corner chamfers). */
  skip: (i: number) => boolean
}

/** σ-weighted total-least-squares line over pts[a..b], `skip` samples left out. */
function fitLineFree(
  pts: FlatPoints,
  sig: number[],
  a: number,
  b: number,
  skip: (i: number) => boolean,
): FreeLine | null {
  let sw = 0
  let mx = 0
  let my = 0
  let count = 0
  for (let i = a; i <= b; i++) {
    if (skip(i)) continue
    const w = 1 / (sig[i] * sig[i])
    sw += w
    mx += w * pts[i * 2]
    my += w * pts[i * 2 + 1]
    count++
  }
  if (count < 2 || sw <= 0) return null
  mx /= sw
  my /= sw
  let sxx = 0
  let sxy = 0
  let syy = 0
  for (let i = a; i <= b; i++) {
    if (skip(i)) continue
    const w = 1 / (sig[i] * sig[i])
    const x = pts[i * 2] - mx
    const y = pts[i * 2 + 1] - my
    sxx += w * x * x
    sxy += w * x * y
    syy += w * y * y
  }
  const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  let dx = Math.cos(theta)
  let dy = Math.sin(theta)
  if (dx * (pts[b * 2] - pts[a * 2]) + dy * (pts[b * 2 + 1] - pts[a * 2 + 1]) < 0) {
    dx = -dx
    dy = -dy
  }
  return { cx: mx, cy: my, dx, dy }
}

/** Geometric (orthogonal-distance) circle fit over pts[a..b]: Kåsa start, Gauss-Newton polish. */
function fitCircleFree(
  pts: FlatPoints,
  sig: number[],
  a: number,
  b: number,
  skip: (i: number) => boolean,
): Circle | null {
  const idx: number[] = []
  for (let i = a; i <= b; i++) if (!skip(i)) idx.push(i)
  if (idx.length < 3) return null
  const flat: FlatPoints = []
  for (const i of idx) flat.push(pts[i * 2], pts[i * 2 + 1])
  const start = fitCircleKasa(flat, 0, idx.length - 1)
  if (!start) return null
  let { cx, cy, r } = start
  for (let iter = 0; iter < 6; iter++) {
    // Normal equations of the weighted residuals d_i = |p_i − c| − r.
    const A = [0, 0, 0, 0, 0, 0, 0, 0, 0]
    const g = [0, 0, 0]
    for (const i of idx) {
      const px = pts[i * 2] - cx
      const py = pts[i * 2 + 1] - cy
      const d = Math.hypot(px, py)
      if (d < 1e-9) continue
      const w = 1 / (sig[i] * sig[i])
      const res = d - r
      const j0 = -px / d
      const j1 = -py / d
      const j2 = -1
      const J = [j0, j1, j2]
      for (let u = 0; u < 3; u++) {
        g[u] += w * J[u] * res
        for (let v = 0; v < 3; v++) A[u * 3 + v] += w * J[u] * J[v]
      }
    }
    const step = solve3(A, g)
    if (!step) break
    cx -= step[0]
    cy -= step[1]
    r -= step[2]
    if (Math.abs(step[0]) + Math.abs(step[1]) + Math.abs(step[2]) < 1e-7) break
  }
  if (!isFinite(r) || r < 1e-6 || r > 1e7) return null
  return { cx, cy, r }
}

/** Parameters a whole-ring circle writes: its center and radius. */
const PARAMS_CIRCLE = 3

/** A rotated ellipse: center, semi-axes, and the rotation (radians) of its `rx` axis. */
interface Ellipse {
  cx: number
  cy: number
  rx: number
  ry: number
  angle: number
}

/** Parameters a whole-ring ellipse writes: its center, semi-axes and rotation. */
const PARAMS_ELLIPSE = 5

/** A whole-ring primitive: the circle or ellipse over every sample of a closed ring. */
type RingPrimitive = { kind: 'circle'; circle: Circle } | { kind: 'ellipse'; ellipse: Ellipse }

/**
 * Orthogonal distance from (x, y) to an ellipse: Eberly's robust bisection for
 * the nearest point ("Distance from a Point to an Ellipse, an Ellipsoid, or a
 * Hyperellipsoid", Geometric Tools, 2011), in the ellipse's first quadrant.
 */
function ellipseDistance(e: Ellipse, x: number, y: number): number {
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const dx = x - e.cx
  const dy = y - e.cy
  let y0 = Math.abs(dx * c + dy * s)
  let y1 = Math.abs(-dx * s + dy * c)
  let e0 = e.rx
  let e1 = e.ry
  if (e0 < e1) {
    ;[e0, e1] = [e1, e0]
    ;[y0, y1] = [y1, y0]
  }
  if (y1 > 0) {
    if (y0 > 0) {
      const z0 = y0 / e0
      const z1 = y1 / e1
      const g = z0 * z0 + z1 * z1 - 1
      if (g === 0) return 0
      const r0 = (e0 / e1) * (e0 / e1)
      const n0 = r0 * z0
      let s0 = z1 - 1
      let s1 = g < 0 ? 0 : Math.hypot(n0, z1) - 1
      let sm = 0
      for (let i = 0; i < 128; i++) {
        sm = (s0 + s1) / 2
        if (sm === s0 || sm === s1) break
        const q0 = n0 / (sm + r0)
        const q1 = z1 / (sm + 1)
        const gs = q0 * q0 + q1 * q1 - 1
        if (gs > 0) s0 = sm
        else if (gs < 0) s1 = sm
        else break
      }
      const x0 = (r0 * y0) / (sm + r0)
      const x1 = y1 / (sm + 1)
      return Math.hypot(x0 - y0, x1 - y1)
    }
    return Math.abs(y1 - e1)
  }
  const numer = e0 * y0
  const denom = e0 * e0 - e1 * e1
  if (numer < denom) {
    const t = numer / denom
    return Math.hypot(e0 * t - y0, e1 * Math.sqrt(1 - t * t))
  }
  return Math.abs(y0 - e0)
}

/** Solve the n×n system A·x = b in place (Gaussian elimination, partial pivoting); null when singular. */
function solveSmall(A: number[][], b: number[]): number[] | null {
  const n = b.length
  for (let k = 0; k < n; k++) {
    let piv = k
    for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > Math.abs(A[piv][k])) piv = i
    if (Math.abs(A[piv][k]) < 1e-300) return null
    ;[A[k], A[piv]] = [A[piv], A[k]]
    ;[b[k], b[piv]] = [b[piv], b[k]]
    for (let i = k + 1; i < n; i++) {
      const f = A[i][k] / A[k][k]
      for (let j = k; j < n; j++) A[i][j] -= f * A[k][j]
      b[i] -= f * b[k]
    }
  }
  const x = new Array<number>(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    let v = b[i]
    for (let j = i + 1; j < n; j++) v -= A[i][j] * x[j]
    x[i] = v / A[i][i]
  }
  return x.every(Number.isFinite) ? x : null
}

/** Most samples, evenly spaced along the ring, an ellipse is refined on. */
const ELLIPSE_FIT_SAMPLES = 256

/**
 * An ellipse fit to samples 0..m−1: started from the samples' moments (their
 * mean and covariance, the axes of a ring sampled along its length), then
 * refined by Levenberg–Marquardt on the σ-weighted first-order (Sampson)
 * distance — the orthogonal distance near the curve — over at most
 * `ELLIPSE_FIT_SAMPLES` of them. Returns the ellipse and that distance's mean
 * square per sample (in σ), or null when the fit degenerates.
 */
function fitEllipseFree(
  pts: FlatPoints,
  sig: number[],
  m: number,
): { ellipse: Ellipse; spread: number } | null {
  if (m < 6) return null
  let sx = 0
  let sy = 0
  for (let i = 0; i < m; i++) {
    sx += pts[i * 2]
    sy += pts[i * 2 + 1]
  }
  const mx = sx / m
  const my = sy / m
  let sxx = 0
  let syy = 0
  let sxy = 0
  for (let i = 0; i < m; i++) {
    const dx = pts[i * 2] - mx
    const dy = pts[i * 2 + 1] - my
    sxx += dx * dx
    syy += dy * dy
    sxy += dx * dy
  }
  sxx /= m
  syy /= m
  sxy /= m
  const tr = (sxx + syy) / 2
  const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy))
  const l1 = tr + det
  const l2 = tr - det
  if (!(l2 > 1e-6)) return null
  const k = Math.min(m, ELLIPSE_FIT_SAMPLES)
  const idx = new Int32Array(k)
  for (let j = 0; j < k; j++) idx[j] = Math.floor((j * m) / k)
  // Parameters: center, log semi-axes, rotation.
  let q = [
    mx,
    my,
    Math.log(Math.sqrt(2 * l1)),
    Math.log(Math.sqrt(2 * l2)),
    0.5 * Math.atan2(2 * sxy, sxx - syy),
  ]
  const residuals = (p: number[], out: Float64Array): number => {
    const rx = Math.exp(p[2])
    const ry = Math.exp(p[3])
    const c = Math.cos(p[4])
    const s = Math.sin(p[4])
    let cost = 0
    for (let j = 0; j < k; j++) {
      const i = idx[j]
      const dx = pts[i * 2] - p[0]
      const dy = pts[i * 2 + 1] - p[1]
      const u = dx * c + dy * s
      const v = -dx * s + dy * c
      const f = (u * u) / (rx * rx) + (v * v) / (ry * ry) - 1
      const g = 2 * Math.hypot(u / (rx * rx), v / (ry * ry))
      const r = g > 1e-12 ? f / g / sig[i] : 0
      out[j] = r
      cost += r * r
    }
    return cost
  }
  const r0 = new Float64Array(k)
  const r1 = new Float64Array(k)
  const J = Array.from({ length: 5 }, () => new Float64Array(k))
  let cost = residuals(q, r0)
  let mu = 1e-3
  const scale = Math.sqrt(l1)
  const h = [1e-6 * scale, 1e-6 * scale, 1e-7, 1e-7, 1e-7]
  for (let iter = 0; iter < 40; iter++) {
    for (let a = 0; a < 5; a++) {
      const pa = q.slice()
      pa[a] += h[a]
      residuals(pa, J[a])
      for (let j = 0; j < k; j++) J[a][j] = (J[a][j] - r0[j]) / h[a]
    }
    const A: number[][] = Array.from({ length: 5 }, () => new Array<number>(5).fill(0))
    const g = new Array<number>(5).fill(0)
    for (let a = 0; a < 5; a++) {
      for (let b = a; b < 5; b++) {
        let v = 0
        for (let j = 0; j < k; j++) v += J[a][j] * J[b][j]
        A[a][b] = v
        A[b][a] = v
      }
      let v = 0
      for (let j = 0; j < k; j++) v += J[a][j] * r0[j]
      g[a] = -v
    }
    let accepted = false
    for (let tries = 0; tries < 8 && !accepted; tries++) {
      const M = A.map((row, a) => row.map((v, b) => (a === b ? v * (1 + mu) + 1e-12 : v)))
      const step = solveSmall(M, g.slice())
      if (!step) {
        mu *= 10
        continue
      }
      const cand = q.map((v, a) => v + step[a])
      const c1 = residuals(cand, r1)
      if (c1 < cost) {
        const gain = cost - c1
        q = cand
        r0.set(r1)
        cost = c1
        mu = Math.max(1e-9, mu / 10)
        accepted = true
        if (gain <= 1e-10 * Math.max(1, cost)) iter = 40
      } else mu *= 10
    }
    if (!accepted) break
  }
  const e = { cx: q[0], cy: q[1], rx: Math.exp(q[2]), ry: Math.exp(q[3]), angle: q[4] }
  return Number.isFinite(e.cx + e.cy + e.rx + e.ry + e.angle + cost)
    ? { ellipse: e, spread: cost / k }
    : null
}

/** Smallest semi-axis (px) a whole-ring ellipse may have: a sliver is not an ellipse. */
const ELLIPSE_MIN_AXIS = 0.4

/**
 * The cheapest whole-ring primitive — a circle, or outside geometric mode an
 * ellipse — that the measurement accepts and whose `0.5·χ² + λ·params`
 * undercuts `rivalCost` ({@link ringPrimitives}); its cost comes back in
 * `costOut[0]` (`rivalCost` when there is none).
 */
function wholeRingPrimitive(
  pts: FlatPoints,
  sig: number[],
  opts: RunFitOptions,
  rivalCost: number,
  costOut?: number[],
): RingPrimitive | null {
  const [best] = ringPrimitives(pts, sig, opts, rivalCost)
  if (costOut) costOut[0] = best ? best.cost : rivalCost
  return best ? best.prim : null
}

/**
 * Every whole-ring primitive — a circle, and outside geometric mode an
 * ellipse — that the measurement accepts and whose `0.5·χ² + λ·params`
 * undercuts `rivalCost`, the description the ring gets otherwise (inkvec's
 * primitive rule, `fit_primitive_or_arcs`), cheapest first. A candidate is
 * accepted on its reduced χ² over every sample, by orthogonal distance, within
 * τ² — an rms residual inside τ standard deviations, where the per-sample band
 * would reject a true circle of a few hundred samples on its few ordinary 2.5σ
 * outliers — and must go once round its center with its diameter inside the
 * ring's extent. A real notch fails the cost test: the segments that follow it
 * buy back far more χ² than their parameters cost.
 */
function ringPrimitives(
  pts: FlatPoints,
  sig: number[],
  opts: RunFitOptions,
  rivalCost: number,
): { prim: RingPrimitive; cost: number }[] {
  const n = pts.length >> 1
  if (n < 5) return []
  const m = n - 1
  const found: { prim: RingPrimitive; cost: number }[] = []
  // The ring's bounding box: a primitive's diameter spans it, no more.
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let i = 0; i < m; i++) {
    x0 = Math.min(x0, pts[i * 2])
    x1 = Math.max(x1, pts[i * 2])
    y0 = Math.min(y0, pts[i * 2 + 1])
    y1 = Math.max(y1, pts[i * 2 + 1])
  }
  const reach = Math.hypot(x1 - x0, y1 - y0)
  const circle = fitCircleFree(pts, sig, 0, n - 2, () => false)
  if (circle && 2 * circle.r <= reach) {
    let chi2 = 0
    for (let i = 0; i < m; i++) {
      const d = Math.hypot(pts[i * 2] - circle.cx, pts[i * 2 + 1] - circle.cy) - circle.r
      chi2 += (d * d) / (sig[i] * sig[i])
    }
    const cost = 0.5 * chi2 + opts.lambda * PARAMS_CIRCLE
    if (
      chi2 <= opts.tau * opts.tau * Math.max(1, m - PARAMS_CIRCLE) &&
      cost <= rivalCost &&
      Math.abs(ellipseSweep({ ...circle, rx: circle.r, ry: circle.r, angle: 0 }, pts, m)) >
        1.9 * Math.PI
    ) {
      found.push({ prim: { kind: 'circle', circle }, cost })
    }
  }
  if (!geometricMode(opts) && measuredRing(sig, m)) {
    // The refined fit's first-order spread already rules out a ring far off any
    // ellipse, before its exact distances are paid for.
    const fit = fitEllipseFree(pts, sig, m)
    const e = fit && fit.spread <= 4 * opts.tau * opts.tau ? fit.ellipse : null
    if (e && Math.min(e.rx, e.ry) >= ELLIPSE_MIN_AXIS && 2 * Math.max(e.rx, e.ry) <= reach) {
      let chi2 = 0
      for (let i = 0; i < m; i++) {
        const d = ellipseDistance(e, pts[i * 2], pts[i * 2 + 1])
        chi2 += (d * d) / (sig[i] * sig[i])
      }
      const cost = 0.5 * chi2 + opts.lambda * PARAMS_ELLIPSE
      if (
        chi2 <= opts.tau * opts.tau * Math.max(1, m - PARAMS_ELLIPSE) &&
        cost < rivalCost &&
        Math.abs(ellipseSweep(e, pts, m)) > 1.9 * Math.PI
      ) {
        found.push({ prim: { kind: 'ellipse', ellipse: e }, cost })
      }
    }
  }
  // The circle is found first and wins a tie: fewer parameters.
  if (found.length === 2 && found[1].cost < found[0].cost) found.reverse()
  return found
}

/**
 * Whether most of a ring's samples were measured against a coverage field. A
 * ring left wholly on the lattice cannot tell a small ellipse from a small
 * rectangle — its staircase strays ±0.5 px from either — so it is not offered
 * one in their place.
 */
function measuredRing(sig: number[], m: number): boolean {
  let measured = 0
  for (let i = 0; i < m; i++) if (sig[i] < SIGMA_LATTICE) measured++
  return 2 * measured >= m
}

/** Total parametric angle the samples 0..m−1 sweep about the ellipse (±2π once round). */
function ellipseSweep(e: Ellipse, pts: FlatPoints, m: number): number {
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const at = (i: number): number => {
    const dx = pts[i * 2] - e.cx
    const dy = pts[i * 2 + 1] - e.cy
    return Math.atan2((-dx * s + dy * c) / e.ry, (dx * c + dy * s) / e.rx)
  }
  let sweep = 0
  let prev = at(0)
  for (let i = 1; i <= m; i++) {
    const t = at(i % m)
    let d = t - prev
    if (d > Math.PI) d -= 2 * Math.PI
    if (d < -Math.PI) d += 2 * Math.PI
    sweep += d
    prev = t
  }
  return sweep
}

/** The point of the ellipse at parameter t, and its derivative there. */
function ellipseAt(e: Ellipse, t: number): [number, number, number, number] {
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const ux = e.rx * Math.cos(t)
  const uy = e.ry * Math.sin(t)
  const dx = -e.rx * Math.sin(t)
  const dy = e.ry * Math.cos(t)
  return [e.cx + ux * c - uy * s, e.cy + ux * s + uy * c, dx * c - dy * s, dx * s + dy * c]
}

/**
 * A whole ellipse as four quarter cubics from the point nearest the ring's
 * first sample, in the ring's direction: each the affine image of a circle's
 * quarter cubic, so exact to the same few ten-thousandths. Starts the path
 * (`M`) and closes it back on its start.
 */
function emitFullEllipse(out: PathCommand[], e: Ellipse, pts: FlatPoints): void {
  const m = (pts.length >> 1) - 1
  const c = Math.cos(e.angle)
  const s = Math.sin(e.angle)
  const param = (i: number): number => {
    const dx = pts[i * 2] - e.cx
    const dy = pts[i * 2 + 1] - e.cy
    return Math.atan2((-dx * s + dy * c) / e.ry, (dx * c + dy * s) / e.rx)
  }
  const t0 = param(0)
  const sign = ellipseSweep(e, pts, m) >= 0 ? 1 : -1
  const step = (sign * Math.PI) / 2
  const k = (4 / 3) * Math.tan(step / 4)
  const [sx, sy] = ellipseAt(e, t0)
  out.push({ type: 'M', x: sx, y: sy })
  for (let j = 0; j < 4; j++) {
    const [ax, ay, adx, ady] = ellipseAt(e, t0 + j * step)
    const [bx, by, bdx, bdy] = ellipseAt(e, t0 + (j + 1) * step)
    const last = j === 3
    out.push({
      type: 'C',
      x1: ax + k * adx,
      y1: ay + k * ady,
      x2: bx - k * bdx,
      y2: by - k * bdy,
      x: last ? sx : bx,
      y: last ? sy : by,
    })
  }
}

/** Solve the 3×3 system A·x = b (row-major); null when singular. */
function solve3(A: number[], b: number[]): [number, number, number] | null {
  const [a, bb, c, d, e, f, g, h, i] = A
  const det = a * (e * i - f * h) - bb * (d * i - f * g) + c * (d * h - e * g)
  if (Math.abs(det) < 1e-12) return null
  const x = (b[0] * (e * i - f * h) - bb * (b[1] * i - f * b[2]) + c * (b[1] * h - e * b[2])) / det
  const y = (a * (b[1] * i - f * b[2]) - b[0] * (d * i - f * g) + c * (d * b[2] - b[1] * g)) / det
  const z = (a * (e * b[2] - b[1] * h) - bb * (d * b[2] - b[1] * g) + b[0] * (d * h - e * g)) / det
  return [x, y, z]
}

function projectLine(l: FreeLine, x: number, y: number): [number, number] {
  const t = (x - l.cx) * l.dx + (y - l.cy) * l.dy
  return [l.cx + t * l.dx, l.cy + t * l.dy]
}

function projectCircle(c: Circle, x: number, y: number): [number, number] {
  const dx = x - c.cx
  const dy = y - c.cy
  const d = Math.hypot(dx, dy)
  if (d < 1e-12) return [x, y]
  return [c.cx + (dx * c.r) / d, c.cy + (dy * c.r) / d]
}

function intersectLines(p: FreeLine, q: FreeLine): [number, number] | null {
  const cross = p.dx * q.dy - p.dy * q.dx
  if (Math.abs(cross) < 1e-9) return null
  const t = ((q.cx - p.cx) * q.dy - (q.cy - p.cy) * q.dx) / cross
  return [p.cx + p.dx * t, p.cy + p.dy * t]
}

/** The intersection of a line and a circle nearest (nx, ny), or null. */
function intersectLineCircle(
  l: FreeLine,
  c: Circle,
  nx: number,
  ny: number,
): [number, number] | null {
  const fx = l.cx - c.cx
  const fy = l.cy - c.cy
  const bq = fx * l.dx + fy * l.dy
  const cq = fx * fx + fy * fy - c.r * c.r
  const disc = bq * bq - cq
  if (disc < 0) return null
  const sq = Math.sqrt(disc)
  const p1: [number, number] = [l.cx + l.dx * (-bq - sq), l.cy + l.dy * (-bq - sq)]
  const p2: [number, number] = [l.cx + l.dx * (-bq + sq), l.cy + l.dy * (-bq + sq)]
  return Math.hypot(p1[0] - nx, p1[1] - ny) <= Math.hypot(p2[0] - nx, p2[1] - ny) ? p1 : p2
}

/** The intersection of two circles nearest (nx, ny), or null. */
function intersectCircles(c1: Circle, c2: Circle, nx: number, ny: number): [number, number] | null {
  const dx = c2.cx - c1.cx
  const dy = c2.cy - c1.cy
  const d = Math.hypot(dx, dy)
  if (d < 1e-9 || d > c1.r + c2.r || d < Math.abs(c1.r - c2.r)) return null
  const a = (c1.r * c1.r - c2.r * c2.r + d * d) / (2 * d)
  const h = Math.sqrt(Math.max(0, c1.r * c1.r - a * a))
  const mx = c1.cx + (a * dx) / d
  const my = c1.cy + (a * dy) / d
  const p1: [number, number] = [mx + (h * dy) / d, my - (h * dx) / d]
  const p2: [number, number] = [mx - (h * dy) / d, my + (h * dx) / d]
  return Math.hypot(p1[0] - nx, p1[1] - ny) <= Math.hypot(p2[0] - nx, p2[1] - ny) ? p1 : p2
}

/** Farthest a smooth join may move from its breakpoint sample (px). */
const JOIN_REACH = 1

/** The point where two consecutive segments meet, from their models. */
function resolveJoin(prev: RingSeg, next: RingSeg, px: number, py: number): [number, number] {
  const near = (q: [number, number] | null, reach: number): q is [number, number] =>
    q !== null && Math.hypot(q[0] - px, q[1] - py) <= reach
  if (next.cornerStart) {
    // A corner: where the two models meet, within the chamfer allowance.
    const qx = next.apexX
    const qy = next.apexY
    let hit: [number, number] | null = null
    let allowed = JOIN_REACH
    if (prev.kind === 'line' && next.kind === 'line' && prev.line && next.line) {
      hit = intersectLines(prev.line, next.line)
      const cross = prev.line.dx * next.line.dy - prev.line.dy * next.line.dx
      const turn = Math.atan2(
        Math.abs(cross),
        prev.line.dx * next.line.dx + prev.line.dy * next.line.dy,
      )
      allowed =
        turn >= CORNER_TURN_MIN
          ? 0.5 + Math.min(3, CORNER_CHAMFER / Math.max(0.2, Math.sin(0.5 * (Math.PI - turn))))
          : 0.5
      if (hit && Math.hypot(hit[0] - next.vertX, hit[1] - next.vertY) <= allowed) return hit
      return [qx, qy]
    }
    if (prev.line && next.circle) hit = intersectLineCircle(prev.line, next.circle, qx, qy)
    else if (prev.circle && next.line) hit = intersectLineCircle(next.line, prev.circle, qx, qy)
    else if (prev.circle && next.circle) hit = intersectCircles(prev.circle, next.circle, qx, qy)
    if (hit && Math.hypot(hit[0] - qx, hit[1] - qy) <= 1.5) return hit
    return [qx, qy]
  }
  // A smooth join: where the two models meet (lines crossing, a line tangent to
  // a round), near the sample. Where two lines or two rounds do not meet near
  // it, one of them is a short transition fitted on a handful of samples and
  // its model says little; the sample itself, measured on the edge, is the
  // join — averaging the two projections would drag a long, exact edge off its
  // line toward the stub's. A round beside a line keeps the line, the
  // better-determined of the two.
  if (prev.line && next.line) {
    const x = intersectLines(prev.line, next.line)
    if (near(x, JOIN_REACH)) return x
    return [px, py]
  }
  if (prev.line && next.circle) {
    const f = projectLine(prev.line, next.circle.cx, next.circle.cy)
    if (near(f, JOIN_REACH)) return f
    return projectLine(prev.line, px, py)
  }
  if (prev.circle && next.line) {
    const f = projectLine(next.line, prev.circle.cx, prev.circle.cy)
    if (near(f, JOIN_REACH)) return f
    return projectLine(next.line, px, py)
  }
  if (prev.circle && next.circle) return [px, py]
  if (prev.line) return projectLine(prev.line, px, py)
  if (next.line) return projectLine(next.line, px, py)
  if (prev.circle) return projectCircle(prev.circle, px, py)
  if (next.circle) return projectCircle(next.circle, px, py)
  return [px, py]
}

/** Unit tangent of a line/arc model at (x, y), oriented along travel from (fx, fy) to (tx, ty). */
function modelTangent(
  s: RingSeg,
  x: number,
  y: number,
  fx: number,
  fy: number,
  tx: number,
  ty: number,
): [number, number] | null {
  let dx: number
  let dy: number
  if (s.line) {
    dx = s.line.dx
    dy = s.line.dy
  } else if (s.circle) {
    dx = -(y - s.circle.cy)
    dy = x - s.circle.cx
    const l = Math.hypot(dx, dy)
    if (l < 1e-12) return null
    dx /= l
    dy /= l
  } else return null
  if (dx * (tx - fx) + dy * (ty - fy) < 0) {
    dx = -dx
    dy = -dy
  }
  return [dx, dy]
}

/**
 * Closed-ring fit with free models and geometric joins: the DP picks each
 * corner-to-corner span's segmentation and models as before, then every line
 * and arc is refitted to its samples by least squares (a line or circle
 * through measured points averages their noise; a chord pinned to two of them
 * inherits theirs), and each join is placed where the models meet — the
 * intersection at a corner, the tangent point at a smooth join — so a straight
 * edge, a rounded corner or a sharp tip lands where the drawing put it. A
 * cubic keeps its fit, re-pinned to the joins with its neighbours' tangents.
 */
function fitClosedRefit(
  geom: FlatPoints,
  sigma: number[],
  vertices: number[],
  polygon: FlatPoints,
  cornerVerts: number[],
  n: number,
  mv: number,
  opts: RunFitOptions,
): PathCommand[] | null {
  const segs: RingSeg[] = []
  if (cornerVerts.length === 0) {
    const { pts, sig } = cyclicRun(geom, sigma, 0, 0, n)
    const splits: number[] = []
    for (let p = 1; p < mv; p++) splits.push(vertices[p])
    const seam = centralTangent(pts, 0)
    const dpCost = [Infinity]
    const dp = spanSegments(pts, sig, splits, [seam[0], seam[1]], [seam[0], seam[1]], opts, dpCost)
    const whole = wholeRingPrimitive(pts, sig, opts, dpCost[0])
    if (whole) {
      const out: PathCommand[] = []
      emitRingPrimitive(out, whole, pts)
      out.push({ type: 'Z' })
      return out
    }
    for (const d of dp) segs.push(makeSeg(pts, sig, d, false, false, 0, 0, 0, 0))
  } else {
    const apexCache = new Map<number, [number, number]>()
    const apexOf = (cv: number): [number, number] => {
      const hit = apexCache.get(cv)
      if (hit) return hit
      const fallback: [number, number] = [polygon[cv * 2], polygon[cv * 2 + 1]]
      const a = sharpApex(geom, sigma, vertices, n, mv, cv, fallback)
      apexCache.set(cv, a)
      return a
    }
    for (let c = 0; c < cornerVerts.length; c++) {
      const cvA = cornerVerts[c]
      const cvB = cornerVerts[(c + 1) % cornerVerts.length]
      const { pts, sig, splits } = spanData(geom, sigma, vertices, n, mv, cvA, cvB)
      const [ax, ay] = apexOf(cvA)
      const [bx, by] = apexOf(cvB)
      const vax = pts[0]
      const vay = pts[1]
      const last = (pts.length >> 1) - 1
      const vbx = pts[last * 2]
      const vby = pts[last * 2 + 1]
      pts[0] = ax
      pts[1] = ay
      pts[pts.length - 2] = bx
      pts[pts.length - 1] = by
      // The samples a corner's anti-aliasing cut across lie off both its edges;
      // they carry no evidence of either, so the DP neither fits nor splits for them.
      const ra = chamferRadius(geom, vertices, mv, cvA)
      const rb = chamferRadius(geom, vertices, mv, cvB)
      for (let i = 1; i < last; i++) {
        const x = pts[i * 2]
        const y = pts[i * 2 + 1]
        const inA = Math.min(Math.hypot(x - vax, y - vay), Math.hypot(x - ax, y - ay)) <= ra
        const inB = Math.min(Math.hypot(x - vbx, y - vby), Math.hypot(x - bx, y - by)) <= rb
        if (inA || inB) sig[i] = CHAMFER_SIGMA
      }
      const t0 = forwardTangent(pts, 0)
      const t1 = forwardTangent(pts, pts.length / 2 - 1)
      const dp = spanSegments(pts, sig, splits, t0, t1, opts)
      dp.forEach((d, k) => segs.push(makeSeg(pts, sig, d, k === 0, true, ax, ay, vax, vay)))
    }
  }
  collapseChamfers(segs)
  const m = segs.length
  if (m === 0) return null
  // Joins: join[k] is where segment k starts (and segment k−1 ends).
  const join: [number, number][] = new Array(m)
  for (let k = 0; k < m; k++) {
    const prev = segs[(k - 1 + m) % m]
    const next = segs[k]
    const px = next.pts[next.a * 2]
    const py = next.pts[next.a * 2 + 1]
    join[k] = m === 1 ? [px, py] : resolveJoin(prev, next, px, py)
  }
  const out: PathCommand[] = [{ type: 'M', x: join[0][0], y: join[0][1] }]
  for (let k = 0; k < m; k++) {
    const s = segs[k]
    const [sx, sy] = join[k]
    const [ex, ey] = join[(k + 1) % m]
    if (s.kind === 'line' || (!s.circle && s.kind === 'arc')) {
      out.push({ type: 'L', x: ex, y: ey })
    } else if (s.kind === 'arc' && s.circle) {
      const c = s.circle
      const a0 = Math.atan2(sy - c.cy, sx - c.cx)
      const span = sampleSweep(c, s.pts, s.a, s.b, a0, Math.atan2(ey - c.cy, ex - c.cx))
      // An arc far longer than the samples it describes has turned the long
      // way round its circle: the ring falls back to the pinned fit.
      if (c.r * Math.abs(span) > 2 * samplePathLength(s.pts, s.a, s.b) + 3) return null
      emitArcSpan(out, c, a0, span, sx, sy, ex, ey)
    } else {
      // Cubic: re-pinned to the joins; a smooth join inherits its neighbour's tangent.
      const pts = s.pts.slice()
      pts[s.a * 2] = sx
      pts[s.a * 2 + 1] = sy
      pts[s.b * 2] = ex
      pts[s.b * 2 + 1] = ey
      const prev = segs[(k - 1 + m) % m]
      const nxt = segs[(k + 1) % m]
      let t0 = forwardTangent(pts, s.a)
      let t1 = forwardTangent(pts, s.b - 1)
      if (!s.cornerStart) {
        const t = modelTangent(prev, sx, sy, sx, sy, ex, ey)
        if (t) t0 = t
      }
      if (!nxt.cornerStart) {
        const t = modelTangent(nxt, ex, ey, sx, sy, ex, ey)
        if (t) t1 = t
      }
      let c = fitCubicRun(pts, s.a, s.b, t0, t1)
      if (s.b - s.a >= 2) {
        // A tangent borrowed from a neighbour fitted on a few samples can be far
        // off; a cubic forced through it leaves its own samples. Keep the data's
        // own end tangents when the borrowed ones cannot stay inside the band.
        const dev = cubicDeviation(pts, s.sig, s.a, s.b, c, opts)
        if (dev.worst > 1) {
          const own = fitCubicRun(
            pts,
            s.a,
            s.b,
            forwardTangent(pts, s.a),
            forwardTangent(pts, s.b - 1),
          )
          if (cubicDeviation(pts, s.sig, s.a, s.b, own, opts).chi2 < dev.chi2) c = own
        }
      }
      // Control points far outside the samples: the ring falls back to the pinned fit.
      if (!controlsNearSamples(c, s.pts, s.a, s.b)) return null
      out.push({ type: 'C', x1: c.c1x, y1: c.c1y, x2: c.c2x, y2: c.c2y, x: ex, y: ey })
    }
  }
  out.push({ type: 'Z' })
  return out
}

/** Polyline length of pts[a..b]. */
function samplePathLength(pts: FlatPoints, a: number, b: number): number {
  let len = 0
  for (let i = a + 1; i <= b; i++)
    len += Math.hypot(pts[i * 2] - pts[(i - 1) * 2], pts[i * 2 + 1] - pts[(i - 1) * 2 + 1])
  return len
}

/**
 * Signed sweep from angle a0 to a1 around `c` that follows the samples: of the
 * two arcs joining the ends, the one nearer the samples' own unwrapped angular
 * travel. One mid sample cannot decide it on a near-straight arc of a huge
 * circle, where the ends are displaced joins and a sample can fall outside.
 */
function sampleSweep(
  c: Circle,
  pts: FlatPoints,
  a: number,
  b: number,
  a0: number,
  a1: number,
): number {
  let travel = 0
  let prev = Math.atan2(pts[a * 2 + 1] - c.cy, pts[a * 2] - c.cx)
  for (let i = a + 1; i <= b; i++) {
    const ang = Math.atan2(pts[i * 2 + 1] - c.cy, pts[i * 2] - c.cx)
    let d = ang - prev
    while (d > Math.PI) d -= 2 * Math.PI
    while (d <= -Math.PI) d += 2 * Math.PI
    travel += d
    prev = ang
  }
  const dEnd = wrap2pi(a1 - a0)
  const other = dEnd - 2 * Math.PI
  return Math.abs(dEnd - travel) <= Math.abs(other - travel) ? dEnd : other
}

/** Whether a cubic's control points stay near the samples it was fitted to. */
function controlsNearSamples(c: Cubic, pts: FlatPoints, a: number, b: number): boolean {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = a; i <= b; i++) {
    const x = pts[i * 2]
    const y = pts[i * 2 + 1]
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  const pad = Math.max(4, Math.hypot(maxX - minX, maxY - minY))
  const inside = (x: number, y: number): boolean =>
    x >= minX - pad && x <= maxX + pad && y >= minY - pad && y <= maxY + pad
  return inside(c.c1x, c.c1y) && inside(c.c2x, c.c2y)
}

/** σ given to a sample on a corner's chamfer: large enough that it constrains nothing. */
const CHAMFER_SIGMA = 1e3

/**
 * How far along its edges a corner's anti-aliasing reaches (px): a pixel at a
 * right angle, further as the corner sharpens (CORNER_CHAMFER / sin of half
 * the interior angle, inkvec's allowance), at most three.
 */
function chamferRadius(geom: FlatPoints, vertices: number[], mv: number, cv: number): number {
  const vi = vertices[cv]
  const vp = vertices[(cv - 1 + mv) % mv]
  const vn = vertices[(cv + 1) % mv]
  const turn =
    (turnDeg(
      geom[vp * 2],
      geom[vp * 2 + 1],
      geom[vi * 2],
      geom[vi * 2 + 1],
      geom[vn * 2],
      geom[vn * 2 + 1],
    ) *
      Math.PI) /
    180
  const half = 0.5 * (Math.PI - turn)
  return Math.min(3, Math.max(CORNER_CHAMFER, CORNER_CHAMFER / Math.max(0.2, Math.sin(half))))
}

/** Longest segment (px) between two corners still read as the chamfer of one corner. */
const CHAMFER_SPAN = 2.5

/**
 * A sharp corner the anti-aliasing cut across comes out of the polygon as two
 * corners joined by a stub a pixel or two long (a star's tip). The stub is
 * the chamfer, not an edge: drop it, and let its neighbours meet in one corner
 * at their intersection, estimated at the stub's midpoint. Mutates `segs`.
 */
function collapseChamfers(segs: RingSeg[]): void {
  for (let guard = 0; guard < segs.length && segs.length > 3; guard++) {
    let hit = -1
    for (let k = 0; k < segs.length; k++) {
      const s = segs[k]
      const nxt = segs[(k + 1) % segs.length]
      if (!s.cornerStart || !nxt.cornerStart) continue
      const ax = s.pts[s.a * 2]
      const ay = s.pts[s.a * 2 + 1]
      const bx = s.pts[s.b * 2]
      const by = s.pts[s.b * 2 + 1]
      if (Math.hypot(bx - ax, by - ay) > CHAMFER_SPAN) continue
      const prev = segs[(k - 1 + segs.length) % segs.length]
      if (!prev.line && !prev.circle) continue
      if (!nxt.line && !nxt.circle) continue
      hit = k
      break
    }
    if (hit < 0) return
    const s = segs[hit]
    const nxt = segs[(hit + 1) % segs.length]
    nxt.apexX = (s.pts[s.a * 2] + s.pts[s.b * 2]) / 2
    nxt.apexY = (s.pts[s.a * 2 + 1] + s.pts[s.b * 2 + 1]) / 2
    nxt.vertX = nxt.apexX
    nxt.vertY = nxt.apexY
    segs.splice(hit, 1)
  }
}

/** A DP segment as a ring segment with its model refitted freely. */
function makeSeg(
  pts: FlatPoints,
  sig: number[],
  d: SegFit,
  cornerStart: boolean,
  spanHasCorners: boolean,
  apexX: number,
  apexY: number,
  vertX: number,
  vertY: number,
): RingSeg {
  const last = (pts.length >> 1) - 1
  // Leave out the span's apex endpoints (estimates, not samples) and, next to a
  // corner, the chamfer the anti-aliasing cut across it.
  const ax = pts[0]
  const ay = pts[1]
  const bx = pts[last * 2]
  const by = pts[last * 2 + 1]
  const skip = (i: number): boolean => {
    if (!spanHasCorners) return false
    if (i === 0 || i === last) return true
    if (sig[i] >= CHAMFER_SIGMA) return true
    const x = pts[i * 2]
    const y = pts[i * 2 + 1]
    return (
      Math.hypot(x - ax, y - ay) <= CORNER_CHAMFER || Math.hypot(x - bx, y - by) <= CORNER_CHAMFER
    )
  }
  const seg: RingSeg = {
    kind: d.kind,
    pts,
    sig,
    a: d.a,
    b: d.b,
    cornerStart,
    apexX,
    apexY,
    vertX,
    vertY,
    skip,
  }
  if (d.kind === 'line') {
    const l = fitLineFree(pts, sig, d.a, d.b, skip)
    if (l) seg.line = l
    else seg.kind = 'line'
  } else if (d.kind === 'arc') {
    const c = fitCircleFree(pts, sig, d.a, d.b, skip) ?? d.circle
    if (c) seg.circle = c
  }
  return seg
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

/** Unit tangent arriving at sample `i` (pointing back along the curve). */
function backwardTangent(pts: FlatPoints, i: number): [number, number] {
  const a = i - 1 >= 0 ? i - 1 : i
  const b = i - 1 >= 0 ? i : i + 1
  let dx = pts[a * 2] - pts[b * 2]
  let dy = pts[a * 2 + 1] - pts[b * 2 + 1]
  const l = Math.hypot(dx, dy)
  if (l < 1e-12) return [-1, 0]
  dx /= l
  dy /= l
  return [dx, dy]
}

/** Contiguous samples geom[a..b] (a ≤ b) and their σ as fresh parallel lists. */
function sliceRun(
  geom: FlatPoints,
  sigma: number[],
  a: number,
  b: number,
): { pts: FlatPoints; sig: number[] } {
  const pts: FlatPoints = new Array((b - a + 1) * 2)
  const sig = new Array<number>(b - a + 1)
  for (let i = a; i <= b; i++) {
    pts[(i - a) * 2] = geom[i * 2]
    pts[(i - a) * 2 + 1] = geom[i * 2 + 1]
    sig[i - a] = sigma[i]
  }
  return { pts, sig }
}

/**
 * Cyclic samples (and σ) from ring index `a` to `b` over `n` distinct points
 * (the ring's last point repeats its first). `a === b` returns the whole ring
 * back to the start. Always includes both endpoints.
 */
function cyclicRun(
  geom: FlatPoints,
  sigma: number[],
  a: number,
  b: number,
  n: number,
): { pts: FlatPoints; sig: number[] } {
  const steps = a === b ? n : (b - a + n) % n
  const pts: FlatPoints = new Array((steps + 1) * 2)
  const sig = new Array<number>(steps + 1)
  for (let s = 0; s <= steps; s++) {
    const idx = (a + s) % n
    pts[s * 2] = geom[idx * 2]
    pts[s * 2 + 1] = geom[idx * 2 + 1]
    sig[s] = sigma[idx]
  }
  return { pts, sig }
}

// --- G1 refit (illustration mode) ------------------------------------------------------

/** Rounds of the alternating G1 solve: shared directions, each piece's arms, reparameterization. */
const G1_ROUNDS = 3
/** Pieces either side of a changed one that a local re-solve refits. */
const G1_LOCAL = 2
/** Rounds of splitting the pieces the spline cannot keep inside the band. */
const G1_SPLIT_ROUNDS = 4
/** Rounds of the per-piece fallback ladder. */
const G1_FALLBACK_ROUNDS = 8
/** Rounds of knot removal. */
const G1_MERGE_ROUNDS = 6
/** Reparameterizations of a merged piece's fit. */
const G1_MERGE_REPARAMS = 2
/**
 * Gain from the refined samples' RMS residual about the DP's fit (in σ) to the
 * refit's band scale ({@link g1Tau}): the mode's band from a residual of half σ
 * up, narrower below.
 */
const G1_NOISE_GAIN = 2
/** Narrowest band scale the refit holds a clean edge to. */
const G1_BAND_MIN = 0.5
/** Refined samples from which a span's residual measures its noise. */
const G1_NOISE_SAMPLES = 8
/** Ridge (relative to a knot's own data weight) holding a direction near its last estimate. */
const G1_RIDGE = 1e-3
/** Weight pinning a knot's direction to a pinned neighbour's (a chord's, an arc's). */
const G1_PIN = 1e8
/** Turn (degrees) at which two DP lines are a chain of chords rather than one straight edge. */
const G1_LINE_KINK_DEG = 3
/** Longest control arm, as a fraction of the chord (inkvec `MAX_ARM`). */
const G1_MAX_ARM = 1
/** Shortest control arm, as a fraction of the chord (inkvec's admissible arms, `candidates.rs`). */
const G1_MIN_ARM = 0.02
/**
 * Sample intervals under which a piece is a short one: too short to split or
 * to free its directions, and, ending on an unrefined lattice point, a
 * staircase step.
 */
const G1_SHORT = 4
/**
 * Most a G1 piece may turn between its ends (radians): one cubic holds a
 * quarter circle to a few ten-thousandths of its radius, a half circle only to
 * about two percent — the same quarter-turn split as an arc's cubics.
 */
const G1_MAX_TURN = Math.PI / 2
/**
 * How far, in bands, a piece may stray from its sample polyline between two
 * samples. The band bounds the samples, and the zigzag between noisy samples is
 * not the edge, so only an excursion well past it — a loop — is refused.
 */
const G1_MID_BANDS = 2
/** Sample intervals either side searched for the one nearest a between-samples point. */
const G1_MID_WINDOW = 3
/**
 * Samples from which a failing piece is split again rather than given up on;
 * a shorter one may be replaced by the chords through its samples.
 */
const G1_POLY_MAX = 8

/**
 * One piece of the G1 spline. `cubic` pieces are solved; `line` (a straight edge
 * of the drawing) and `arc` (the DP's circle) keep their geometry and pin the
 * direction at their knots, so their neighbours meet them smoothly; `fixed` is a
 * DP segment (or a chord between two samples) kept as it is, with a break at
 * each end.
 */
interface G1Piece {
  kind: 'cubic' | 'line' | 'arc' | 'fixed'
  seg?: SegFit
  cubic: Cubic
  u: Float64Array
  armS: number
  armE: number
  chi2: number
  worst: number
  /** Changed since the last solve: the next local re-solve refits around it. */
  touched: boolean
}

function unit2(x: number, y: number): [number, number] | null {
  const l = Math.hypot(x, y)
  return l > 1e-12 && Number.isFinite(l) ? [x / l, y / l] : null
}

/** Unit direction a fitted segment leaves its start with. */
function segStartDir(pts: FlatPoints, s: SegFit): [number, number] {
  const ax = pts[s.a * 2]
  const ay = pts[s.a * 2 + 1]
  if (s.kind === 'cubic' && s.cubic) {
    const c = s.cubic
    const d = unit2(c.c1x - c.p0x, c.c1y - c.p0y) ?? unit2(c.c2x - c.p0x, c.c2y - c.p0y)
    if (d) return d
  } else if (s.kind === 'arc' && s.circle) {
    const c = s.circle
    let tx = -(ay - c.cy)
    let ty = ax - c.cx
    if (tx * (pts[(s.a + 1) * 2] - ax) + ty * (pts[(s.a + 1) * 2 + 1] - ay) < 0) {
      tx = -tx
      ty = -ty
    }
    const d = unit2(tx, ty)
    if (d) return d
  }
  return unit2(pts[s.b * 2] - ax, pts[s.b * 2 + 1] - ay) ?? [1, 0]
}

/** Unit direction a fitted segment arrives at its end with. */
function segEndDir(pts: FlatPoints, s: SegFit): [number, number] {
  const bx = pts[s.b * 2]
  const by = pts[s.b * 2 + 1]
  if (s.kind === 'cubic' && s.cubic) {
    const c = s.cubic
    const d = unit2(c.p3x - c.c2x, c.p3y - c.c2y) ?? unit2(c.p3x - c.c1x, c.p3y - c.c1y)
    if (d) return d
  } else if (s.kind === 'arc' && s.circle) {
    const c = s.circle
    let tx = -(by - c.cy)
    let ty = bx - c.cx
    if (tx * (bx - pts[(s.b - 1) * 2]) + ty * (by - pts[(s.b - 1) * 2 + 1]) < 0) {
      tx = -tx
      ty = -ty
    }
    const d = unit2(tx, ty)
    if (d) return d
  }
  return unit2(bx - pts[s.a * 2], by - pts[s.a * 2 + 1]) ?? [1, 0]
}

/** Unit tangent of a cubic at parameter t (forward), or null where it vanishes. */
function cubicDirAt(c: Cubic, t: number): [number, number] | null {
  const mt = 1 - t
  const dx =
    3 * mt * mt * (c.c1x - c.p0x) + 6 * mt * t * (c.c2x - c.c1x) + 3 * t * t * (c.p3x - c.c2x)
  const dy =
    3 * mt * mt * (c.c1y - c.p0y) + 6 * mt * t * (c.c2y - c.c1y) + 3 * t * t * (c.p3y - c.c2y)
  return unit2(dx, dy)
}

/** Point of a cubic at parameter t. */
function cubicPointAt(c: Cubic, t: number): [number, number] {
  const mt = 1 - t
  const b0 = mt * mt * mt
  const b1 = 3 * mt * mt * t
  const b2 = 3 * mt * t * t
  const b3 = t * t * t
  return [
    b0 * c.p0x + b1 * c.c1x + b2 * c.c2x + b3 * c.p3x,
    b0 * c.p0y + b1 * c.c1y + b2 * c.c2y + b3 * c.p3y,
  ]
}

/** The straight cubic from sample a to sample b (a chord's placeholder geometry). */
function chordCubic(pts: FlatPoints, a: number, b: number): Cubic {
  const ax = pts[a * 2]
  const ay = pts[a * 2 + 1]
  const bx = pts[b * 2]
  const by = pts[b * 2 + 1]
  return {
    p0x: ax,
    p0y: ay,
    c1x: ax + (bx - ax) / 3,
    c1y: ay + (by - ay) / 3,
    c2x: ax + (2 * (bx - ax)) / 3,
    c2y: ay + (2 * (by - ay)) / 3,
    p3x: bx,
    p3y: by,
  }
}

/**
 * The G1 piece through samples a..b leaving along `ds` and arriving along `de`
 * (unit directions): its two arm lengths by σ-weighted least squares at the
 * parameters `u` — Schneider's fit with the directions fixed, weighted as the
 * joint solve weighs the samples — held to [G1_MIN_ARM, G1_MAX_ARM] of the
 * chord. The residual is a convex quadratic in the arms, so when its minimum lies
 * outside that box the constrained one lies on the box's boundary: the best of
 * the four edges, on each the other arm clamped. A piece of a sample or two
 * cannot place two arms by itself — its free minimum is often a negative arm or
 * one several chords long — and gets the admissible arms that fit it best.
 */
function fitG1Cubic(
  pts: FlatPoints,
  sig: number[],
  a: number,
  b: number,
  u: Float64Array,
  ds: [number, number],
  de: [number, number],
): Cubic {
  const p0x = pts[a * 2]
  const p0y = pts[a * 2 + 1]
  const p3x = pts[b * 2]
  const p3y = pts[b * 2 + 1]
  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = a + 1; i < b; i++) {
    const t = u[i - a]
    const mt = 1 - t
    const b0 = mt * mt * mt
    const b1 = 3 * mt * mt * t
    const b2 = 3 * mt * t * t
    const b3 = t * t * t
    const w = 1 / (sig[i] * sig[i])
    const ax = b1 * ds[0]
    const ay = b1 * ds[1]
    const ex = -b2 * de[0]
    const ey = -b2 * de[1]
    const rx = pts[i * 2] - (b0 + b1) * p0x - (b2 + b3) * p3x
    const ry = pts[i * 2 + 1] - (b0 + b1) * p0y - (b2 + b3) * p3y
    c00 += w * (ax * ax + ay * ay)
    c01 += w * (ax * ex + ay * ey)
    c11 += w * (ex * ex + ey * ey)
    x0 += w * (ax * rx + ay * ry)
    x1 += w * (ex * rx + ey * ry)
  }
  const L = Math.hypot(p3x - p0x, p3y - p0y)
  const lo = G1_MIN_ARM * L
  const hi = G1_MAX_ARM * L
  let armS = L / 3
  let armE = L / 3
  if (c00 > 0 && c11 > 0) {
    const clamp = (v: number): number => (v < lo ? lo : v > hi ? hi : v)
    const cost = (s: number, e: number): number =>
      c00 * s * s + 2 * c01 * s * e + c11 * e * e - 2 * (x0 * s + x1 * e)
    const det = c00 * c11 - c01 * c01
    const s = (x0 * c11 - x1 * c01) / det
    const e = (c00 * x1 - c01 * x0) / det
    if (det > 1e-12 * c00 * c11 && s >= lo && s <= hi && e >= lo && e <= hi) {
      armS = s
      armE = e
    } else {
      let best = Infinity
      for (const bound of [lo, hi]) {
        const e1 = clamp((x1 - c01 * bound) / c11)
        const s2 = clamp((x0 - c01 * bound) / c00)
        const q1 = cost(bound, e1)
        const q2 = cost(s2, bound)
        if (q1 < best) {
          best = q1
          armS = bound
          armE = e1
        }
        if (q2 < best) {
          best = q2
          armS = s2
          armE = bound
        }
      }
    }
  }
  return {
    p0x,
    p0y,
    c1x: p0x + armS * ds[0],
    c1y: p0y + armS * ds[1],
    c2x: p3x - armE * de[0],
    c2y: p3y - armE * de[1],
    p3x,
    p3y,
  }
}

/** Cumulative chord length along the samples (`cum[0]` = 0), for {@link chordParams}. */
function chordLengths(pts: FlatPoints): Float64Array {
  const n = pts.length >> 1
  const cum = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    const dx = pts[i * 2] - pts[(i - 1) * 2]
    const dy = pts[i * 2 + 1] - pts[(i - 1) * 2 + 1]
    cum[i] = cum[i - 1] + Math.sqrt(dx * dx + dy * dy)
  }
  return cum
}

/** Chord-length parameters of samples a..b, normalized to [0, 1], from {@link chordLengths}. */
function chordParams(cum: Float64Array, a: number, b: number): Float64Array {
  const u = new Float64Array(b - a + 1)
  const total = cum[b] - cum[a] || 1
  for (let i = a + 1; i < b; i++) u[i - a] = (cum[i] - cum[a]) / total
  u[b - a] = 1
  return u
}

/**
 * One Newton reparameterization of samples a..b onto `c` (Schneider 1990), or
 * null when the parameters would stop increasing.
 */
function reparamOnto(pts: FlatPoints, a: number, c: Cubic, u: Float64Array): Float64Array | null {
  const n = u.length
  const nu = new Float64Array(n)
  nu[n - 1] = 1
  let prev = 0
  for (let i = 1; i < n - 1; i++) {
    const t = refineParam(c, pts[(a + i) * 2], pts[(a + i) * 2 + 1], u[i])
    if (t <= prev || t >= 1) return null
    nu[i] = t
    prev = t
  }
  return nu
}

/**
 * Symmetric tridiagonal solve (Thomas algorithm), `off[k]` coupling k and k+1,
 * for two right-hand sides at once. Null on a vanishing pivot.
 */
function solveTridiag(
  diag: Float64Array,
  off: Float64Array,
  rx: Float64Array,
  ry: Float64Array,
): [Float64Array, Float64Array] | null {
  const n = diag.length
  const cp = new Float64Array(n)
  const dx = new Float64Array(n)
  const dy = new Float64Array(n)
  let m = diag[0]
  if (!(Math.abs(m) > 1e-300)) return null
  cp[0] = n > 1 ? off[0] / m : 0
  dx[0] = rx[0] / m
  dy[0] = ry[0] / m
  for (let i = 1; i < n; i++) {
    m = diag[i] - off[i - 1] * cp[i - 1]
    if (!(Math.abs(m) > 1e-300)) return null
    cp[i] = i < n - 1 ? off[i] / m : 0
    dx[i] = (rx[i] - off[i - 1] * dx[i - 1]) / m
    dy[i] = (ry[i] - off[i - 1] * dy[i - 1]) / m
  }
  for (let i = n - 2; i >= 0; i--) {
    dx[i] -= cp[i] * dx[i + 1]
    dy[i] -= cp[i] * dy[i + 1]
  }
  return [dx, dy]
}

/**
 * Cyclic symmetric tridiagonal solve, `corner` coupling n−1 and 0, by the
 * Sherman–Morrison correction of a plain tridiagonal solve (Press et al.,
 * Numerical Recipes, §2.7). n ≥ 3.
 */
function solveCyclic(
  diag: Float64Array,
  off: Float64Array,
  corner: number,
  rx: Float64Array,
  ry: Float64Array,
): [Float64Array, Float64Array] | null {
  const n = diag.length
  const gamma = -diag[0]
  const bb = Float64Array.from(diag)
  bb[0] = diag[0] - gamma
  bb[n - 1] = diag[n - 1] - (corner * corner) / gamma
  const x = solveTridiag(bb, off, rx, ry)
  const uu = new Float64Array(n)
  uu[0] = gamma
  uu[n - 1] = corner
  const z = solveTridiag(bb, off, uu, uu)
  if (!x || !z) return null
  const zz = z[0]
  const den = 1 + zz[0] + (corner * zz[n - 1]) / gamma
  if (!(Math.abs(den) > 1e-300)) return null
  const fx = (x[0][0] + (corner * x[0][n - 1]) / gamma) / den
  const fy = (x[1][0] + (corner * x[1][n - 1]) / gamma) / den
  for (let i = 0; i < n; i++) {
    x[0][i] -= fx * zz[i]
    x[1][i] -= fy * zz[i]
  }
  return x
}

/**
 * Whether a G1 piece stays between its samples: both arms within
 * {@link G1_MAX_ARM} of the chord, a turn of at most {@link G1_MAX_TURN} from
 * end to end, and at the middle of every sample interval the curve within
 * {@link G1_MID_BANDS} bands of the nearest sample interval. The sample
 * residuals alone miss a piece whose forced end directions throw a loop out
 * between two samples it still passes through.
 */
function g1Shaped(
  pts: FlatPoints,
  sig: number[],
  a: number,
  b: number,
  c: Cubic,
  u: Float64Array,
  opts: RunFitOptions,
): boolean {
  const lim = G1_MAX_ARM * Math.hypot(c.p3x - c.p0x, c.p3y - c.p0y) + 1e-9
  if (
    Math.hypot(c.c1x - c.p0x, c.c1y - c.p0y) > lim ||
    Math.hypot(c.c2x - c.p3x, c.c2y - c.p3y) > lim
  ) {
    return false
  }
  const d0 = cubicDirAt(c, 0)
  const d1 = cubicDirAt(c, 1)
  if (d0 && d1 && d0[0] * d1[0] + d0[1] * d1[1] < Math.cos(G1_MAX_TURN)) return false
  // Whether (qx, qy) lies within G1_MID_BANDS bands of sample interval j.
  const near = (qx: number, qy: number, j: number): boolean => {
    const ax = pts[j * 2]
    const ay = pts[j * 2 + 1]
    const ex = pts[(j + 1) * 2] - ax
    const ey = pts[(j + 1) * 2 + 1] - ay
    const ll = ex * ex + ey * ey
    const k = ll < 1e-18 ? 0 : Math.max(0, Math.min(1, ((qx - ax) * ex + (qy - ay) * ey) / ll))
    const band = Math.max(bandAt(sig, j, opts), bandAt(sig, j + 1, opts))
    return Math.hypot(qx - ax - k * ex, qy - ay - k * ey) <= G1_MID_BANDS * band
  }
  for (let i = a; i < b; i++) {
    const [qx, qy] = cubicPointAt(c, 0.5 * (u[i - a] + u[i + 1 - a]))
    if (near(qx, qy, i)) continue
    // Else any interval nearby: a parameterization that lags a sample or two
    // does not read as a loop, and a loop is far from all of them.
    let ok = false
    const lo = Math.max(a, i - G1_MID_WINDOW)
    const hi = Math.min(b - 1, i + G1_MID_WINDOW)
    for (let j = lo; j <= hi && !ok; j++) ok = j !== i && near(qx, qy, j)
    if (!ok) return false
  }
  return true
}

/**
 * A least-squares cubic through samples a..b with both end directions free
 * (endpoints pinned): the two control points by weighted linear least squares
 * at chord-length parameters, then three Newton reparameterizations.
 */
function fitFreeCubic(
  pts: FlatPoints,
  sig: number[],
  cum: Float64Array,
  a: number,
  b: number,
): Cubic {
  let u = chordParams(cum, a, b)
  const p0x = pts[a * 2]
  const p0y = pts[a * 2 + 1]
  const p3x = pts[b * 2]
  const p3y = pts[b * 2 + 1]
  const solve = (): Cubic => {
    let a11 = 0
    let a12 = 0
    let a22 = 0
    let rx1 = 0
    let rx2 = 0
    let ry1 = 0
    let ry2 = 0
    for (let i = 0; i < u.length; i++) {
      const t = u[i]
      const mt = 1 - t
      const b0 = mt * mt * mt
      const b1 = 3 * mt * mt * t
      const b2 = 3 * mt * t * t
      const b3 = t * t * t
      const w = 1 / (sig[a + i] * sig[a + i])
      const ex = pts[(a + i) * 2] - b0 * p0x - b3 * p3x
      const ey = pts[(a + i) * 2 + 1] - b0 * p0y - b3 * p3y
      a11 += w * b1 * b1
      a12 += w * b1 * b2
      a22 += w * b2 * b2
      rx1 += w * b1 * ex
      rx2 += w * b2 * ex
      ry1 += w * b1 * ey
      ry2 += w * b2 * ey
    }
    const det = a11 * a22 - a12 * a12
    if (Math.abs(det) < 1e-12) return chordCubic(pts, a, b)
    return {
      p0x,
      p0y,
      c1x: (rx1 * a22 - rx2 * a12) / det,
      c1y: (ry1 * a22 - ry2 * a12) / det,
      c2x: (rx2 * a11 - rx1 * a12) / det,
      c2y: (ry2 * a11 - ry1 * a12) / det,
      p3x,
      p3y,
    }
  }
  let c = solve()
  for (let iter = 0; iter < 3; iter++) {
    const nu = reparamOnto(pts, a, c, u)
    if (!nu) break
    u = nu
    c = solve()
  }
  return c
}

/**
 * τ the G1 refit holds a span to: the mode's, narrowed on a clean edge. The RMS
 * residual of the refined samples about the DP's fit (in σ) measures the edge's
 * noise; below half σ the band narrows with it, to {@link G1_BAND_MIN}. Lattice
 * samples carry the staircase rather than the edge's noise and do not count.
 */
function g1Tau(pts: FlatPoints, sig: number[], segs: SegFit[], opts: RunFitOptions): number {
  const refined = sig.map((v) => (v >= SIGMA_LATTICE ? Infinity : v))
  let chi2 = 0
  let n = 0
  for (const sg of segs) {
    chi2 += modelChi2(pts, refined, sg, opts)
    for (let i = sg.a + 1; i < sg.b; i++) if (sig[i] < SIGMA_LATTICE) n++
  }
  if (n < G1_NOISE_SAMPLES) return opts.tau
  return opts.tau * Math.max(G1_BAND_MIN, Math.min(1, G1_NOISE_GAIN * Math.sqrt(chi2 / n)))
}

/**
 * Illustration mode's G1 refit of a span's DP segmentation: every join inside a
 * corner-to-corner span made tangent-continuous.
 *
 * The DP prices a chord at two parameters and a curve at six, so it paves a
 * gently curving outline with chords, and each chord meets the next at a kink
 * the per-sample residual never sees — the polygon look of a traced cartoon.
 * inkvec charges a tangent break in its DP and snaps the joins it leaves smooth
 * to one tangent afterwards (`multimodel.rs` `refine`); here, since a span has no
 * corner inside it by construction, every join inside is made G1, the model of
 * Plass & Stone (1983, piecewise parametric cubics with tangent continuity):
 *
 * 1. The DP's breakpoints become knots. A DP line that is a straight edge of the
 *    drawing — inside the refit's band, no line beside it turning away, no
 *    neighbouring arc whose circle runs through its samples, its samples not
 *    bowed like a chord across a curve — stays a chord, and a DP arc inside the
 *    band keeps its circle unless it meets such a chord or another kept arc at
 *    a turn; both pin the direction at their knots. Everything else becomes a
 *    cubic piece, an arc that gave up its circle one per quarter turn (a cubic
 *    holds a quarter circle, not a half). The band is the mode's, narrowed on a
 *    clean edge ({@link g1Tau}) so the spline does not spend it where the
 *    drawing is sharp.
 * 2. Each knot carries one direction shared by the two pieces meeting there,
 *    solved by linear least squares over all the span's samples (a symmetric
 *    tridiagonal system in the knot tangents, cyclic on a smooth loop), then each
 *    piece's two arm lengths with the directions fixed, held to the lengths a
 *    G1 cubic may take ({@link fitG1Cubic}), then a Newton reparameterization —
 *    alternated.
 * 3. A piece the spline cannot keep inside the band — or that takes a wrong
 *    shape: an arm longer than its chord, a turn past a quarter circle, a loop
 *    between two samples — is split at its worst sample. A piece that still
 *    fails climbs a ladder, a step per round: a staircase step of the lattice
 *    merges into a smooth neighbour; a long piece is split again, clear of its
 *    ends; a chord if a chord is admissible (its neighbours then meet it
 *    smoothly); free directions at its knots (a turn the corner rule let through
 *    becomes a corner); the chords through its samples. Whatever still fails
 *    takes, without a re-solve, the DP's own segments over the DP knots around
 *    it. Each repair is re-solved within {@link G1_LOCAL} pieces of it: the
 *    knot directions couple neighbours, and a solve reaching past them would
 *    move admissible pieces out of the band, which the next round would repair
 *    in turn.
 * 4. Knots are removed where the merged piece stays inside the band and the
 *    description length `0.5·χ² + λ·params` does not grow — with the outer
 *    directions kept, or re-chosen by a free fit with the smooth neighbours refit
 *    to meet them — and the whole span is solved once more, kept when every
 *    piece stays inside the band and χ² does not grow.
 *
 * `periodic`: the span is a whole smooth loop, its seam a knot like the others.
 * Returns null when there is nothing to refit (the caller keeps the DP's).
 */
function g1Refit(
  pts: FlatPoints,
  sig: number[],
  segs: SegFit[],
  periodic: boolean,
  opts: RunFitOptions,
): SegFit[] | null {
  const M0 = segs.length
  if (M0 < 2) return null
  const lambda = opts.lambda
  const cum = chordLengths(pts)
  const knots: number[] = [segs[0].a]
  for (const s of segs) knots.push(s.b)
  const dpKnots = knots.slice()
  // Directions at the knots, as the DP's models leave them: the bisector at a
  // smooth knot, each side's own at the span's ends.
  const dIn: [number, number][] = []
  const dOut: [number, number][] = []
  for (let k = 0; k <= M0; k++) {
    const inc = k > 0 ? segEndDir(pts, segs[k - 1]) : periodic ? segEndDir(pts, segs[M0 - 1]) : null
    const out = k < M0 ? segStartDir(pts, segs[k]) : periodic ? segStartDir(pts, segs[0]) : null
    const o = out ?? (inc as [number, number])
    const i = inc ?? o
    const shared = periodic || (k > 0 && k < M0)
    const bis = unit2(o[0] + i[0], o[1] + i[1]) ?? o
    dIn.push(shared ? bis : i)
    dOut.push(shared ? bis : o)
  }
  // A break lets the two sides of a knot keep their own directions.
  const brk: number[] = new Array(knots.length).fill(0)
  if (!periodic) {
    brk[0] = 1
    brk[M0] = 1
  }
  const setBrk = (k: number): void => {
    brk[k] = 1
    if (periodic && (k === 0 || k === knots.length - 1)) {
      brk[0] = 1
      brk[knots.length - 1] = 1
    }
  }
  const newPieceAt = (a: number, b: number): G1Piece => {
    const L = Math.hypot(pts[b * 2] - pts[a * 2], pts[b * 2 + 1] - pts[a * 2 + 1])
    return {
      kind: 'cubic',
      cubic: chordCubic(pts, a, b),
      u: chordParams(cum, a, b),
      armS: L / 3,
      armE: L / 3,
      chi2: Infinity,
      worst: Infinity,
      touched: true,
    }
  }
  let pieces: G1Piece[] = []
  for (let q = 0; q < M0; q++) pieces.push(newPieceAt(knots[q], knots[q + 1]))

  // 1. Straight edges stay chords; arcs keep their circles where they meet their
  //    pinned neighbours smoothly.
  const chord = (sg: SegFit): [number, number] | null =>
    unit2(pts[sg.b * 2] - pts[sg.a * 2], pts[sg.b * 2 + 1] - pts[sg.a * 2 + 1])
  const cosKink = Math.cos((G1_LINE_KINK_DEG * Math.PI) / 180)
  // Whether neighbour `u` shows line `v` to be a chord across a curve: a line at a
  // turn beside it (one under a third of v's length does not count — a short piece
  // where a straight edge starts its round), or an arc whose circle runs through
  // v's samples.
  const chordOf = (u: SegFit | undefined, v: SegFit): boolean => {
    if (!u) return false
    if (u.kind === 'arc' && u.circle) {
      return circleDeviation(pts, sig, v.a, v.b, u.circle, opts).worst <= 1
    }
    if (u.kind !== 'line' || 3 * (u.b - u.a) < v.b - v.a) return false
    const du = chord(u)
    const dv = chord(v)
    return !du || !dv || du[0] * dv[0] + du[1] * dv[1] < cosKink
  }
  // A DP model is kept only inside the refit's band, which is narrower than the
  // DP's on a clean edge ({@link g1Tau}): one outside it is refit as the spline.
  for (let q = 0; q < M0; q++) {
    const sg = segs[q]
    if (sg.kind === 'arc' && sg.circle) {
      if (circleDeviation(pts, sig, sg.a, sg.b, sg.circle, opts).worst > 1) continue
      pieces[q].kind = 'arc'
      pieces[q].seg = sg
      continue
    }
    if (sg.kind !== 'line' || sg.b - sg.a < 2) continue
    if (lineDeviation(pts, sig, sg.a, sg.b, opts).worst > 1) continue
    const prev = q > 0 ? segs[q - 1] : periodic ? segs[M0 - 1] : undefined
    const next = q + 1 < M0 ? segs[q + 1] : periodic ? segs[0] : undefined
    if (chordOf(prev, sg) || chordOf(next, sg)) continue
    // A chord across a curve bows: more residual than the noise explains, which a
    // circle explains far better.
    const circle = fitCircleThrough(pts, sg.a, sg.b)
    const lineChi2 = lineDeviation(pts, sig, sg.a, sg.b, opts).chi2
    if (
      circle &&
      lineChi2 > sg.b - sg.a - 1 &&
      4 * circleDeviation(pts, sig, sg.a, sg.b, circle, opts).chi2 < lineChi2
    ) {
      continue
    }
    pieces[q].kind = 'line'
  }
  // An arc meeting a pinned neighbour at a turn gives up its circle — its ends
  // are a chord's or another circle's, not the drawing's tangent points — and
  // becomes a G1 piece that takes the neighbour's direction.
  const pinnedStart = (q: number): [number, number] | null =>
    pieces[q].kind === 'line' ? chord(segs[q]) : segStartDir(pts, segs[q])
  const pinnedEnd = (q: number): [number, number] | null =>
    pieces[q].kind === 'line' ? chord(segs[q]) : segEndDir(pts, segs[q])
  const turns = (u: [number, number] | null, v: [number, number] | null): boolean =>
    !u || !v || u[0] * v[0] + u[1] * v[1] < cosKink
  for (let q = 0; q < M0; q++) {
    if (pieces[q].kind !== 'arc') continue
    const prev = q > 0 ? q - 1 : periodic ? M0 - 1 : -1
    const next = q + 1 < M0 ? q + 1 : periodic ? 0 : -1
    const atPrev =
      prev >= 0 &&
      prev !== q &&
      pieces[prev].kind !== 'cubic' &&
      turns(pinnedEnd(prev), segStartDir(pts, segs[q]))
    const atNext =
      next >= 0 &&
      next !== q &&
      pieces[next].kind !== 'cubic' &&
      turns(segEndDir(pts, segs[q]), pinnedStart(next))
    if (atPrev || atNext) {
      pieces[q].kind = 'cubic'
      pieces[q].seg = undefined
    }
  }
  const unpinned: number[] = []
  for (let q = 0; q < M0; q++) {
    if (segs[q].kind === 'arc' && segs[q].circle && pieces[q].kind === 'cubic') unpinned.push(q)
  }
  // An unpinned arc is split at equal turns into pieces a cubic can hold.
  for (let r = unpinned.length - 1; r >= 0; r--) {
    const q = unpinned[r]
    const c = segs[q].circle
    if (!c) continue
    const a = knots[q]
    const b = knots[q + 1]
    const ang: number[] = []
    let acc = 0
    let prev = Math.atan2(pts[a * 2 + 1] - c.cy, pts[a * 2] - c.cx)
    for (let i = a; i <= b; i++) {
      const t = Math.atan2(pts[i * 2 + 1] - c.cy, pts[i * 2] - c.cx)
      let d = t - prev
      if (d > Math.PI) d -= 2 * Math.PI
      if (d < -Math.PI) d += 2 * Math.PI
      acc += i > a ? d : 0
      ang.push(acc)
      prev = t
    }
    const parts = Math.ceil(Math.abs(acc) / G1_MAX_TURN - 1e-9)
    let at = q
    for (let j = 1; j < parts; j++) {
      const target = (acc * j) / parts
      let i = a + 1
      while (i < b - 1 && Math.abs(ang[i - a]) < Math.abs(target)) i++
      if (i <= knots[at] || i >= b) continue
      const dir = unit2(-(pts[i * 2 + 1] - c.cy), pts[i * 2] - c.cx) ?? centralTangent(pts, i)
      const fw = centralTangent(pts, i)
      const d: [number, number] = dir[0] * fw[0] + dir[1] * fw[1] < 0 ? [-dir[0], -dir[1]] : dir
      knots.splice(at + 1, 0, i)
      brk.splice(at + 1, 0, 0)
      dIn.splice(at + 1, 0, d)
      dOut.splice(at + 1, 0, d)
      pieces.splice(at, 1, newPieceAt(knots[at], i), newPieceAt(i, knots[at + 2]))
      at++
    }
  }
  // Two pinned pieces meeting cannot share one direction: their join keeps its break.
  const pinnedPair = (): void => {
    const m = pieces.length
    for (let q = 1; q < m; q++)
      if (pieces[q - 1].kind !== 'cubic' && pieces[q].kind !== 'cubic') setBrk(q)
    if (periodic && m > 1 && pieces[0].kind !== 'cubic' && pieces[m - 1].kind !== 'cubic') setBrk(0)
  }
  pinnedPair()

  // 2. The joint solve.
  const fitArms = (q: number): void => {
    const p = pieces[q]
    if (p.kind !== 'cubic') return
    const ds = dOut[q]
    const de = dIn[q + 1]
    const c = fitG1Cubic(pts, sig, knots[q], knots[q + 1], p.u, ds, de)
    p.cubic = c
    p.armS = Math.hypot(c.c1x - c.p0x, c.c1y - c.p0y)
    p.armE = Math.hypot(c.c2x - c.p3x, c.c2y - c.p3y)
  }
  const reparam = (q: number): void => {
    const p = pieces[q]
    if (p.kind !== 'cubic' || p.u.length <= 2) return
    const nu = reparamOnto(pts, knots[q], p.cubic, p.u)
    if (nu) p.u = nu
  }
  const measure = (q: number): void => {
    const p = pieces[q]
    const a = knots[q]
    const b = knots[q + 1]
    if (p.kind === 'fixed') {
      p.chi2 = p.seg ? modelChi2(pts, sig, p.seg, opts) : 0
      p.worst = 0
      return
    }
    const d =
      p.kind === 'line'
        ? lineDeviation(pts, sig, a, b, opts)
        : p.kind === 'arc' && p.seg?.circle
          ? circleDeviation(pts, sig, a, b, p.seg.circle, opts)
          : cubicDeviation(pts, sig, a, b, p.cubic, opts)
    p.chi2 = d.chi2
    p.worst = d.worst
    if (p.kind === 'cubic' && !g1Shaped(pts, sig, a, b, p.cubic, p.u, opts)) p.worst = Infinity
  }
  // Solve the knot tangents of pieces lo..hi. Unknowns run along the span, one
  // per smooth knot and two at a break; each piece couples its start and end
  // unknowns, so the normal equations are tridiagonal (cyclic when a smooth seam
  // closes the whole loop). A pinned piece contributes no data but pins its
  // knots' directions, and so does a piece outside the window at its end knots.
  const solveDirs = (lo: number, hi: number): void => {
    const M = pieces.length
    const sIdx = new Int32Array(M)
    const eIdx = new Int32Array(M)
    let idx = 0
    for (let q = lo; q <= hi; q++) {
      if (q > lo && brk[q]) idx++
      sIdx[q] = idx
      idx++
      eIdx[q] = idx
    }
    let nT = idx + 1
    const whole = lo === 0 && hi === M - 1
    let cyclic = false
    if (whole && periodic && !brk[0]) {
      eIdx[M - 1] = 0
      nT = idx
      cyclic = true
    }
    if (cyclic && nT < 2) return
    const t0x = new Float64Array(nT)
    const t0y = new Float64Array(nT)
    for (let q = lo; q <= hi; q++) {
      t0x[sIdx[q]] = dOut[q][0]
      t0y[sIdx[q]] = dOut[q][1]
      t0x[eIdx[q]] = dIn[q + 1][0]
      t0y[eIdx[q]] = dIn[q + 1][1]
    }
    const diag = new Float64Array(nT)
    const off = new Float64Array(nT)
    const rx = new Float64Array(nT)
    const ry = new Float64Array(nT)
    const pin = new Float64Array(nT)
    const pinX = new Float64Array(nT)
    const pinY = new Float64Array(nT)
    let corner = 0
    if (!whole) {
      // A window's end knot shared with a piece outside it keeps its direction.
      const outside = (k: number): boolean => !brk[k] && (periodic || (k > 0 && k < M))
      if (outside(lo)) {
        pin[sIdx[lo]] += 1
        pinX[sIdx[lo]] += dOut[lo][0]
        pinY[sIdx[lo]] += dOut[lo][1]
      }
      if (outside(hi + 1)) {
        pin[eIdx[hi]] += 1
        pinX[eIdx[hi]] += dIn[hi + 1][0]
        pinY[eIdx[hi]] += dIn[hi + 1][1]
      }
    }
    for (let q = lo; q <= hi; q++) {
      const p = pieces[q]
      const a = knots[q]
      const b = knots[q + 1]
      const s = sIdx[q]
      const e = eIdx[q]
      if (p.kind !== 'cubic') {
        const ds =
          p.kind === 'line'
            ? unit2(pts[b * 2] - pts[a * 2], pts[b * 2 + 1] - pts[a * 2 + 1])
            : p.kind === 'arc' && p.seg
              ? segStartDir(pts, p.seg)
              : dOut[q]
        const de =
          p.kind === 'line' ? ds : p.kind === 'arc' && p.seg ? segEndDir(pts, p.seg) : dIn[q + 1]
        if (ds && de) {
          pin[s] += 1
          pinX[s] += ds[0]
          pinY[s] += ds[1]
          pin[e] += 1
          pinX[e] += de[0]
          pinY[e] += de[1]
        }
        continue
      }
      // Sample i on the piece: B(u) = (b0+b1)·P0 + (b2+b3)·P3 + b1·armS·Ts − b2·armE·Te.
      const p0x = pts[a * 2]
      const p0y = pts[a * 2 + 1]
      const p3x = pts[b * 2]
      const p3y = pts[b * 2 + 1]
      let dss = 0
      let dee = 0
      let dse = 0
      let rsx = 0
      let rsy = 0
      let rex = 0
      let rey = 0
      for (let i = a + 1; i < b; i++) {
        const t = p.u[i - a]
        const mt = 1 - t
        const b0 = mt * mt * mt
        const b1 = 3 * mt * mt * t
        const b2 = 3 * mt * t * t
        const b3 = t * t * t
        const w = 1 / (sig[i] * sig[i])
        const ex = pts[i * 2] - (b0 + b1) * p0x - (b2 + b3) * p3x
        const ey = pts[i * 2 + 1] - (b0 + b1) * p0y - (b2 + b3) * p3y
        const ca = b1 * p.armS
        const cc = -b2 * p.armE
        dss += w * ca * ca
        dee += w * cc * cc
        dse += w * ca * cc
        rsx += w * ca * ex
        rsy += w * ca * ey
        rex += w * cc * ex
        rey += w * cc * ey
      }
      diag[s] += dss
      diag[e] += dee
      rx[s] += rsx
      ry[s] += rsy
      rx[e] += rex
      ry[e] += rey
      if (e === s + 1) off[s] += dse
      else corner += dse
    }
    for (let k = 0; k < nT; k++) {
      if (pin[k] > 0) {
        const r = G1_PIN * (diag[k] + 1)
        t0x[k] = pinX[k] / pin[k]
        t0y[k] = pinY[k] / pin[k]
        diag[k] += r
        rx[k] += r * t0x[k]
        ry[k] += r * t0y[k]
      } else {
        const r = G1_RIDGE * diag[k] + 1e-9
        diag[k] += r
        rx[k] += r * t0x[k]
        ry[k] += r * t0y[k]
      }
    }
    let sol: [Float64Array, Float64Array] | null
    if (!cyclic) sol = solveTridiag(diag, off, rx, ry)
    else if (nT === 2) {
      const a01 = off[0] + corner
      const det = diag[0] * diag[1] - a01 * a01
      sol =
        Math.abs(det) > 1e-300
          ? [
              Float64Array.of(
                (rx[0] * diag[1] - a01 * rx[1]) / det,
                (diag[0] * rx[1] - a01 * rx[0]) / det,
              ),
              Float64Array.of(
                (ry[0] * diag[1] - a01 * ry[1]) / det,
                (diag[0] * ry[1] - a01 * ry[0]) / det,
              ),
            ]
          : null
    } else sol = solveCyclic(diag, off, corner, rx, ry)
    if (!sol) return
    // Unit directions; the magnitude folds into the arms (refit next anyway). A
    // reversed or vanishing solution keeps the previous direction.
    const D: [number, number][] = new Array(nT)
    const mag = new Float64Array(nT)
    for (let k = 0; k < nT; k++) {
      const x = sol[0][k]
      const y = sol[1][k]
      const l = Math.hypot(x, y)
      if (l > 1e-9 && Number.isFinite(l) && x * t0x[k] + y * t0y[k] > 0) {
        D[k] = [x / l, y / l]
        mag[k] = pin[k] > 0 ? 1 : l
      } else {
        D[k] = unit2(t0x[k], t0y[k]) ?? [1, 0]
        mag[k] = 1
      }
    }
    for (let q = lo; q <= hi; q++) {
      dOut[q] = D[sIdx[q]]
      dIn[q + 1] = D[eIdx[q]]
      pieces[q].armS *= mag[sIdx[q]]
      pieces[q].armE *= mag[eIdx[q]]
    }
    if (cyclic) {
      dIn[0] = dOut[0]
      dOut[M] = dIn[M]
    }
  }
  const fitRange = (lo: number, hi: number): void => {
    for (let round = 0; round < G1_ROUNDS; round++) {
      solveDirs(lo, hi)
      for (let q = lo; q <= hi; q++) fitArms(q)
      for (let q = lo; q <= hi; q++) reparam(q)
      for (let q = lo; q <= hi; q++) fitArms(q)
    }
    for (let q = lo; q <= hi; q++) {
      measure(q)
      pieces[q].touched = false
    }
  }
  const fitAll = (): void => fitRange(0, pieces.length - 1)
  // Re-solve around the pieces changed since the last solve: a repair is local,
  // and a solve reaching past it would move admissible pieces out of the band.
  const refitTouched = (): void => {
    const M = pieces.length
    let q = 0
    while (q < M) {
      if (!pieces[q].touched) {
        q++
        continue
      }
      const lo = Math.max(0, q - G1_LOCAL)
      let hi = Math.min(M - 1, q + G1_LOCAL)
      for (let k = q + 1; k < M && k <= hi + G1_LOCAL; k++) {
        if (pieces[k].touched) hi = Math.min(M - 1, k + G1_LOCAL)
      }
      fitRange(lo, hi)
      q = hi + 1
    }
  }
  const bad = (): boolean => pieces.some((p) => p.worst > 1)
  // The sample of piece q farthest (in bands) from it, `margin` intervals clear of its ends.
  const worstSample = (q: number, margin = 2): number => {
    const p = pieces[q]
    const a = knots[q]
    const b = knots[q + 1]
    let best = -1
    let bestW = -1
    for (let i = a + margin; i <= b - margin; i++) {
      const [qx, qy] = cubicPointAt(p.cubic, p.u[i - a])
      const w = Math.hypot(qx - pts[i * 2], qy - pts[i * 2 + 1]) / bandAt(sig, i, opts)
      if (w > bestW) {
        bestW = w
        best = i
      }
    }
    return best
  }
  const splitAt = (q: number, i: number): void => {
    const p = pieces[q]
    const dir = cubicDirAt(p.cubic, p.u[i - knots[q]]) ?? centralTangent(pts, i)
    knots.splice(q + 1, 0, i)
    brk.splice(q + 1, 0, 0)
    dIn.splice(q + 1, 0, dir)
    dOut.splice(q + 1, 0, dir)
    pieces.splice(q, 1, newPieceAt(knots[q], i), newPieceAt(i, knots[q + 2]))
  }
  // Replace the pieces between knot indices lo..hi by `repl` kept as they are,
  // with a break at every knot.
  const replace = (lo: number, hi: number, repl: SegFit[]): void => {
    const fixed: G1Piece[] = repl.map((sg) => ({
      ...newPieceAt(sg.a, sg.b),
      kind: 'fixed' as const,
      seg: sg,
      chi2: modelChi2(pts, sig, sg, opts),
      worst: 0,
    }))
    const inner = repl.slice(0, -1).map((sg) => sg.b)
    knots.splice(lo + 1, hi - lo - 1, ...inner)
    brk.splice(lo + 1, hi - lo - 1, ...inner.map(() => 1))
    dIn.splice(lo + 1, hi - lo - 1, ...repl.slice(0, -1).map((sg) => segEndDir(pts, sg)))
    dOut.splice(lo + 1, hi - lo - 1, ...repl.slice(1).map((sg) => segStartDir(pts, sg)))
    pieces.splice(lo, hi - lo, ...fixed)
    setBrk(lo)
    setBrk(lo + repl.length)
    dOut[lo] = segStartDir(pts, repl[0])
    dIn[lo + repl.length] = segEndDir(pts, repl[repl.length - 1])
  }
  // The DP's segments over the DP knots around piece q, replacing the pieces
  // between them; returns the knot index the replacement starts at, or -1.
  const replaceByDp = (q: number): number => {
    const a = knots[q]
    const b = knots[q + 1]
    let A = a
    let B = b
    for (const k of dpKnots) {
      if (k <= a) A = k
      if (k >= b) {
        B = k
        break
      }
    }
    const lo = knots.indexOf(A)
    const hi = knots.indexOf(B, lo)
    const repl = segs.filter((sg) => sg.a >= A && sg.b <= B)
    if (lo < 0 || hi <= lo || repl.length === 0) return -1
    replace(lo, hi, repl)
    return lo
  }

  fitAll()
  // 3. Splits, then the fallback ladder.
  for (let round = 0; round < G1_SPLIT_ROUNDS && bad(); round++) {
    let split = false
    for (let q = pieces.length - 1; q >= 0; q--) {
      const p = pieces[q]
      if (p.worst <= 1 || p.kind !== 'cubic' || knots[q + 1] - knots[q] < G1_SHORT) continue
      const i = worstSample(q)
      if (i < 0) continue
      splitAt(q, i)
      split = true
    }
    if (!split) break
    refitTouched()
  }
  for (let round = 0; round < G1_FALLBACK_ROUNDS && bad(); round++) {
    let changed = false
    for (let q = pieces.length - 1; q >= 0; q--) {
      const p = pieces[q]
      if (p.worst <= 1 || p.kind !== 'cubic') continue
      changed = true
      const a = knots[q]
      const b = knots[q + 1]
      // A piece of a sample or two ending on an unrefined lattice point is a
      // staircase step: its chord's direction is the lattice's, not the edge's,
      // so its knot goes into a smooth neighbour rather than pinning a chord.
      const step = b - a < G1_SHORT && (sig[a] >= SIGMA_LATTICE || sig[b] >= SIGMA_LATTICE)
      const intoLeft = q > 0 && !brk[q] && pieces[q - 1].kind === 'cubic'
      const intoRight = q + 1 < pieces.length && !brk[q + 1] && pieces[q + 1].kind === 'cubic'
      if (step && (intoLeft || intoRight)) {
        const left =
          intoLeft && (!intoRight || knots[q] - knots[q - 1] >= knots[q + 2] - knots[q + 1])
        const k = left ? q : q + 1
        knots.splice(k, 1)
        brk.splice(k, 1)
        dIn.splice(k, 1)
        dOut.splice(k, 1)
        // Judged after the round's re-solve, not by the loop reaching it next.
        pieces.splice(k - 1, 2, { ...newPieceAt(knots[k - 1], knots[k]), worst: 0 })
      } else if (b - a >= G1_POLY_MAX) {
        // A long piece gets another knot first: a chord pinned across a bend
        // would turn its neighbours away at both ends. Neither part is short, so
        // no step merge takes the knot back out and the ladder does not cycle.
        splitAt(q, worstSample(q, G1_SHORT))
      } else if (
        (!step || (brk[q] && brk[q + 1])) &&
        lineDeviation(pts, sig, a, b, opts).worst <= 1
      ) {
        p.kind = 'line'
        p.cubic = chordCubic(pts, a, b)
        p.touched = true
      } else if (b - a >= G1_SHORT && (!brk[q] || !brk[q + 1])) {
        setBrk(q)
        setBrk(q + 1)
        p.touched = true
      } else {
        const repl: SegFit[] = []
        for (let i = a; i < b; i++) repl.push({ a: i, b: i + 1, kind: 'line' })
        replace(q, q + 1, repl)
      }
    }
    // Only pinned pieces fail: nothing here can help them.
    if (!changed) break
    pinnedPair()
    refitTouched()
  }
  // Last resort, without a re-solve (so no admissible piece moves).
  let dirty = false
  for (let q = pieces.length - 1; q >= 0 && bad(); q--) {
    if (pieces[q].worst <= 1) continue
    const lo = replaceByDp(q)
    if (lo >= 0) {
      q = lo
      dirty = true
    }
  }
  if (bad()) return null

  // 4. Knot removal.
  const paramsOf = (p: G1Piece): number => {
    const kind = p.kind === 'cubic' ? 'cubic' : p.kind === 'line' ? 'line' : (p.seg?.kind ?? 'line')
    return kind === 'line' ? PARAMS_LINE : kind === 'arc' ? PARAMS_ARC : PARAMS_CUBIC
  }
  const fitPiece = (a: number, b: number, ds: [number, number], de: [number, number]): G1Piece => {
    let u = chordParams(cum, a, b)
    let c = fitG1Cubic(pts, sig, a, b, u, ds, de)
    for (let it = 0; it < G1_MERGE_REPARAMS; it++) {
      const nu = reparamOnto(pts, a, c, u)
      if (!nu) break
      u = nu
      c = fitG1Cubic(pts, sig, a, b, u, ds, de)
    }
    const d = cubicDeviation(pts, sig, a, b, c, opts)
    return {
      kind: 'cubic',
      cubic: c,
      u,
      armS: Math.hypot(c.c1x - c.p0x, c.c1y - c.p0y),
      armE: Math.hypot(c.c2x - c.p3x, c.c2y - c.p3y),
      chi2: d.chi2,
      worst: g1Shaped(pts, sig, a, b, c, u, opts) ? d.worst : Infinity,
      touched: false,
    }
  }
  // A merge at knot q reads pieces q−2..q+1, so after one is taken at knot k only
  // knots k−3..k+2 can decide differently: the rest are not tried again.
  const stale: number[] = new Array(knots.length).fill(1)
  for (let round = 0; round < G1_MERGE_ROUNDS; round++) {
    let changed = false
    let q = 1
    while (q < pieces.length) {
      const A = pieces[q - 1]
      const B = pieces[q]
      if (!stale[q] || brk[q] || A.kind !== 'cubic' || B.kind !== 'cubic') {
        q++
        continue
      }
      const a = knots[q - 1]
      const b = knots[q + 1]
      const oldCost = 0.5 * (A.chi2 + B.chi2) + lambda * (paramsOf(A) + paramsOf(B))
      let dirL = dOut[q - 1]
      let dirR = dIn[q + 1]
      let merged = fitPiece(a, b, dirL, dirR)
      let newL: G1Piece | null = null
      let newR: G1Piece | null = null
      let accept = merged.worst <= 1 && 0.5 * merged.chi2 + lambda * PARAMS_CUBIC <= oldCost
      if (!accept && b - a >= 3) {
        // The merged piece chooses its own end directions (a free cubic); a G1
        // neighbour across a smooth knot is refit to meet it, a pinned one keeps
        // its direction and so does the merged piece.
        const free = fitFreeCubic(pts, sig, cum, a, b)
        const fL =
          unit2(free.c1x - free.p0x, free.c1y - free.p0y) ??
          unit2(free.c2x - free.p0x, free.c2y - free.p0y)
        const fR =
          unit2(free.p3x - free.c2x, free.p3y - free.c2y) ??
          unit2(free.p3x - free.c1x, free.p3y - free.c1y)
        const leftSmooth = !brk[q - 1] && q - 2 >= 0
        const rightSmooth = !brk[q + 1] && q + 1 < pieces.length
        const leftFree = brk[q - 1] === 1 || (leftSmooth && pieces[q - 2].kind === 'cubic')
        const rightFree = brk[q + 1] === 1 || (rightSmooth && pieces[q + 1].kind === 'cubic')
        if (fL && fR && (leftFree || rightFree)) {
          if (leftFree) dirL = fL
          if (rightFree) dirR = fR
          merged = fitPiece(a, b, dirL, dirR)
          let cost = 0.5 * merged.chi2 + lambda * PARAMS_CUBIC
          let base = oldCost
          let ok = merged.worst <= 1
          if (ok && leftFree && leftSmooth) {
            newL = fitPiece(knots[q - 2], a, dOut[q - 2], dirL)
            ok = newL.worst <= 1
            cost += 0.5 * newL.chi2
            base += 0.5 * pieces[q - 2].chi2
          }
          if (ok && rightFree && rightSmooth) {
            newR = fitPiece(b, knots[q + 2], dirR, dIn[q + 2])
            ok = newR.worst <= 1
            cost += 0.5 * newR.chi2
            base += 0.5 * pieces[q + 1].chi2
          }
          accept = ok && cost <= base
        }
      }
      if (!accept) {
        stale[q] = 0
        q++
        continue
      }
      dirty = true
      if (newL) pieces[q - 2] = newL
      if (newR) pieces[q + 1] = newR
      dOut[q - 1] = dirL
      dIn[q + 1] = dirR
      if (!brk[q - 1]) dIn[q - 1] = dirL
      if (!brk[q + 1]) dOut[q + 1] = dirR
      pieces.splice(q - 1, 2, merged)
      knots.splice(q, 1)
      brk.splice(q, 1)
      dIn.splice(q, 1)
      dOut.splice(q, 1)
      stale.splice(q, 1)
      for (let k = Math.max(0, q - 3); k <= Math.min(stale.length - 1, q + 2); k++) stale[k] = 1
      changed = true
    }
    if (!changed) break
  }
  // The whole span solved once more when a merge or the last resort changed it,
  // kept when every piece stays inside the band and χ² does not grow.
  if (dirty) {
    const saved = pieces.map((p) => ({ ...p, cubic: { ...p.cubic }, u: Float64Array.from(p.u) }))
    const savedIn = dIn.map((d): [number, number] => [d[0], d[1]])
    const savedOut = dOut.map((d): [number, number] => [d[0], d[1]])
    const before = saved.reduce((s, p) => s + p.chi2, 0)
    fitAll()
    if (bad() || pieces.reduce((s, p) => s + p.chi2, 0) > before) {
      pieces = saved
      for (let k = 0; k < savedIn.length; k++) {
        dIn[k] = savedIn[k]
        dOut[k] = savedOut[k]
      }
    }
  }

  const out: SegFit[] = []
  for (let q = 0; q < pieces.length; q++) {
    const p = pieces[q]
    const a = knots[q]
    const b = knots[q + 1]
    if ((p.kind === 'fixed' || p.kind === 'arc') && p.seg) out.push(p.seg)
    else if (p.kind === 'line' || p.kind === 'fixed') out.push({ a, b, kind: 'line' })
    else out.push({ a, b, kind: 'cubic', cubic: p.cubic })
  }
  return out
}
