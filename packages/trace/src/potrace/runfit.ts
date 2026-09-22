import type { PathCommand } from '@trazor/core'
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
 * adjacent cubics one cubic explains (inkvec `merge_free_cubics`).
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
 * ½-level (inkvec `contour.rs` base ≈ 0.05; a browser-fast field localizes an
 * anti-aliased edge to ~0.2 px and still jitters sample to sample).
 */
const SIGMA_REFINED = 0.2
/**
 * σ of a sample left on the integer lattice — a hard edge, the image border, or
 * an un-refined ring: it carries the ±0.5 px pixel-quantization staircase.
 */
const SIGMA_LATTICE = 0.5

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
 * the sub-pixel edge is more certain than the ±0.5 px lattice, a point left in
 * place (hard edge, border, un-refined) carries the staircase. `lattice` is the
 * pre-refinement geometry; `geom` the (possibly) refined geometry; both flat.
 */
export function ringSigmas(lattice: FlatPoints, geom: FlatPoints, refined: boolean): number[] {
  const n = geom.length >> 1
  const sigma = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    const moved =
      refined && (geom[i * 2] !== lattice[i * 2] || geom[i * 2 + 1] !== lattice[i * 2 + 1])
    sigma[i] = moved ? SIGMA_REFINED : SIGMA_LATTICE
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
    // Wholly smooth ring: try one circle over every sample, else open at the
    // guaranteed convex start and run the DP around the loop with a G1 seam.
    const { pts, sig } = cyclicRun(geom, sigma, 0, 0, n)
    out.push({ type: 'M', x: geom[0], y: geom[1] })
    const circle = admissibleCircle(pts, sig, opts)
    if (circle) {
      emitFullCircle(out, geom[0], geom[1], circle, pts)
    } else {
      const splits: number[] = []
      for (let p = 1; p < mv; p++) splits.push(vertices[p])
      const seam = centralTangent(pts, 0)
      emitSpanDP(out, pts, sig, splits, [seam[0], seam[1]], [seam[0], seam[1]], opts)
    }
    out.push({ type: 'Z' })
    return out
  }

  // Runs corner → corner (cyclic). Each run's endpoints are the corner apexes —
  // the adjusted polygon vertices (Selinger §2.3.1) — pinned; the two runs
  // meeting at a corner keep distinct tangents, so the corner stays sharp.
  const apex = (cv: number): [number, number] => [polygon[cv * 2], polygon[cv * 2 + 1]]
  const [x0, y0] = apex(cornerVerts[0])
  out.push({ type: 'M', x: x0, y: y0 })
  for (let c = 0; c < cornerVerts.length; c++) {
    const cvA = cornerVerts[c]
    const cvB = cornerVerts[(c + 1) % cornerVerts.length]
    const { pts, sig, splits } = spanData(geom, sigma, vertices, n, mv, cvA, cvB)
    const [ax, ay] = apex(cvA)
    const [bx, by] = apex(cvB)
    pts[0] = ax
    pts[1] = ay
    pts[pts.length - 2] = bx
    pts[pts.length - 1] = by
    const t0 = forwardTangent(pts, 0)
    const t1 = forwardTangent(pts, pts.length / 2 - 1)
    emitSpanDP(out, pts, sig, splits, t0, t1, opts)
  }
  out.push({ type: 'Z' })
  return out
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
): void {
  const last = (pts.length >> 1) - 1
  if (last <= 0) return
  if (last === 1) {
    out.push({ type: 'L', x: pts[2], y: pts[3] })
    return
  }

  const cand = buildCandidates(pts, splits, last, opts.stride)
  const K = cand.length - 1 // candidate index of `last`
  const tanAt = (ci: number): [number, number] =>
    ci === 0 ? t0 : ci === K ? t1 : centralTangent(pts, cand[ci])

  // DP over candidate indices: best[m] = cheapest description of cand[0..m].
  const best = new Float64Array(K + 1).fill(Infinity)
  best[0] = 0
  const from = new Int32Array(K + 1).fill(-1)
  const seg: (SegFit | null)[] = new Array(K + 1).fill(null)

  for (let i = 0; i < K; i++) {
    if (best[i] === Infinity) continue
    const ta = tanAt(i)
    let over = 0
    const jHi = Math.min(K, i + opts.reach)
    for (let j = i + 1; j <= jHi; j++) {
      const fit = spanCost(pts, sig, cand[i], cand[j], ta, tanAt(j), opts, j === i + 1)
      if (fit) {
        const total = best[i] + fit.cost
        if (total < best[j]) {
          best[j] = total
          from[j] = i
          seg[j] = fit.seg
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
  mergeFreeCubics(pts, sig, segs, opts)
  for (const s of segs) emitSeg(out, pts, s)
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

interface SpanFit {
  cost: number
  seg: SegFit
}

/**
 * The cheapest admissible model (line / arc / cubic) explaining samples
 * `pts[first..last]` under `0.5·χ² + λ·params`, with the span's end tangents
 * `ta`/`tb`, or null when none is admissible. When `atomic` (a candidate-
 * adjacent span) the best-effort model is returned so the DP always has a path.
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
): SpanFit | null {
  if (last - first <= 1) {
    return { cost: opts.lambda * PARAMS_LINE, seg: { a: first, b: last, kind: 'line' } }
  }

  const cost = (chi2: number, params: number): number => 0.5 * chi2 + opts.lambda * params

  const line = lineDeviation(pts, sig, first, last, opts)
  let bestCost = Infinity
  let best: SegFit | null = null
  const consider = (d: Dev, params: number, seg: SegFit): void => {
    if (d.worst > 1) return
    const c = cost(d.chi2, params)
    if (c < bestCost) {
      bestCost = c
      best = seg
    }
  }
  consider(line, PARAMS_LINE, { a: first, b: last, kind: 'line' })

  // Only price an arc / cubic when the line is not already the cheap winner
  // (inkvec's O(1) floor pre-check keeps straight runs from paying for a fit).
  const lineCost = line.worst <= 1 ? cost(line.chi2, PARAMS_LINE) : Infinity
  const tryCurve = lineCost > opts.lambda * PARAMS_LINE + 1e-9 || line.worst > 1

  if (tryCurve) {
    const circle = fitCircleThrough(pts, first, last)
    if (circle && arcSweepMonotone(pts, first, last, circle)) {
      const cd = circleDeviation(pts, sig, first, last, circle, opts)
      consider(cd, PARAMS_ARC, { a: first, b: last, kind: 'arc', circle })
    }
    const cubic = fitCubicRun(pts, first, last, ta, tb)
    const cbd = cubicDeviation(pts, sig, first, last, cubic, opts)
    consider(cbd, PARAMS_CUBIC, { a: first, b: last, kind: 'cubic', cubic })
  }

  if (best !== null) return { cost: bestCost, seg: best }
  if (!atomic) return null
  // A candidate-adjacent span nothing explains within the band: the lower-
  // residual of a line and a cubic, so the DP is never stuck.
  const cubic = fitCubicRun(pts, first, last, ta, tb)
  const cbd = cubicDeviation(pts, sig, first, last, cubic, opts)
  if (line.worst <= cbd.worst) {
    return { cost: cost(line.chi2, PARAMS_LINE), seg: { a: first, b: last, kind: 'line' } }
  }
  return { cost: cost(cbd.chi2, PARAMS_CUBIC), seg: { a: first, b: last, kind: 'cubic', cubic } }
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

/** Residuals of the interior samples to the cubic (coarse parameter scan). */
function cubicDeviation(
  pts: FlatPoints,
  sig: number[],
  first: number,
  last: number,
  c: Cubic,
  opts: RunFitOptions,
): Dev {
  let worst = 0
  let chi2 = 0
  for (let i = first + 1; i < last; i++) {
    const d = distancePointCubic(c, pts[i * 2], pts[i * 2 + 1])
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

/** Free Kåsa circle over all samples, admissible under the band, else null. */
function admissibleCircle(pts: FlatPoints, sig: number[], opts: RunFitOptions): Circle | null {
  const n = pts.length >> 1
  if (n < 4) return null
  const circle = fitCircleKasa(pts, 0, n - 1)
  if (!circle) return null
  // Score every sample (a full loop has no pinned interior endpoints).
  let worst = 0
  for (let i = 0; i < n; i++) {
    const d = Math.abs(Math.hypot(pts[i * 2] - circle.cx, pts[i * 2 + 1] - circle.cy) - circle.r)
    const w = d / bandAt(sig, i, opts)
    if (w > worst) worst = w
  }
  return worst <= 1 ? circle : null
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
