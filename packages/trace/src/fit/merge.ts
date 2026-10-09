/**
 * The fitter's post-fit passes: peephole edits of the path the dynamic program
 * chose, each priced by the objective that chose it, `½·χ² + λ·params`.
 *
 * - {@link mergeFreeCubics} replaces a short run of segments (a rounded corner
 *   fitted as chord, cubic, chord) by one cubic whose end tangents are free. The
 *   program's own cubic is G1: its end directions are inherited from the
 *   per-vertex tangent estimate, which is wrong at a corner, so it pays four
 *   extra parameters to avoid it. A free cubic breaks G1 with its neighbors and
 *   is charged {@link BREAK_PARAMS} for the two joins; a run is replaced only when
 *
 *       ½·χ²_new + λ·(cubicParams + BREAK_PARAMS)  <  ½·Σχ²_old + λ·Σparams_old (+ SMOOTH_SLACK·λ)
 *
 *   and the cubic does not cross itself. Up to {@link MAX_ROUNDS} sweeps run.
 * - {@link sharpenCorners} replaces a short cubic (or chord) bridging two lines
 *   that meet at an angle by the lines' intersection: the coverage level set
 *   rounds a rasterized corner off by about a pixel, and a fillet that small is
 *   the renderer's, not the artist's.
 * - `./snap` holds the research passes (axis-aligned lines, smooth joins), off
 *   unless asked for.
 *
 * The free cubic from the run's fixed start `P0` to its fixed end `P3` is
 * searched over four numbers, the rotations `r0`, `r1` (degrees) of its end
 * directions away from the contour's own (the chords to the second point in from
 * each end) and the arm lengths `d0`, `d1` in chords: a coarse grid
 * ({@link GRID_ANGLES} × {@link GRID_ARMS} at each end, 2,025 candidates on
 * {@link COARSE_SAMPLES} + 1 samples) picks the basin and a compass search
 * finishes. Every candidate is scored by its residual against the run
 * ({@link mergeChi2}),
 *
 *       χ²_n(B) = Σ_{k=a..=b} (d_k / s_k)²,   d_k = |p_k − B(j_k/n)|,   s_k = max(σ_k, 1e-6)
 *
 * with `B(j_k/n)` the nearest of `n + 1` samples. The search only asks whether a
 * candidate beats the best so far, so a candidate is screened middle-first on a
 * lower bound of each term (no square root; early abandoning, Bei & Gray 1985,
 * with the reordered sum compared against `bound·(1 + 1e-12)`, Higham 1993
 * eq. 2.6) and only a survivor is summed exactly, in point order. The grid's
 * samples are assembled from cached Bernstein partial sums, in `evalCubic`'s
 * order of operations, and its self-crossing test runs only on a candidate that
 * would become the best. Neither changes which candidate wins.
 *
 * The passes read no absolute coordinate (every quantity is a difference of
 * points), so inkvec's pixel-center convention needs no shift here. Distances
 * are `hypot` as Rust computes it (`./roots`), so the residuals match inkvec's
 * bit for bit wherever the sines of the search rotations do.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/merge.rs`, `merge/residual.rs`,
 * `merge/grid.rs`, `multimodel.rs` (`post_fit_passes`) and `candidates/turn.rs`
 * (`over_turn_params_of`).
 */
import type { PathCommand } from '@trazor/core'
import type { FitConfig, FittedEdge } from '../planar/types'
import { cubicMaxTurnRadians, cubicParams } from './cost'
import { MAX_ARM } from './cubicfit'
import { chi2 as sampledChi2, cubicSelfIntersects, cubicTo, lineTo, segmentParams } from './curves'
import type { Bezier, FitSegment, Vec } from './curves'
import { CORNER_CHAMFER, CORNER_TURN_MIN, pathParams } from './objective'
import type { FitPath, Polyline } from './objective'
import { fmax, fmin, hypot } from './roots'
import { DEFAULT_GRID, snapAxisAligned, snapSmoothJoins } from './snap'
import type { OutputGrid } from './snap'
import { turnAngle } from './tangents'

/**
 * Parameters charged for the two joins a free-tangent cubic no longer meets
 * smoothly: one per join, the price the program puts on a tangent break.
 */
export const BREAK_PARAMS = 2

/** Longest run, in measured points, a merge attempts; bounds the pass at O(n · span). */
export const MAX_SPAN = 96

/** Most segments one cubic may absorb in one sweep. */
export const MAX_RUN = 4

/** Merge sweeps; the pass stops early after a sweep that merges nothing. */
export const MAX_ROUNDS = 6

/** Parameters, in units of λ, by which a merged curve may score worse and still be taken. */
export const SMOOTH_SLACK = 0

/** Curve samples of the residual that decides a merge. */
export const SAMPLES = 96

/** How far, in degrees, a free cubic's end direction may swing from the contour's own. */
export const SEARCH_DEGREES = 100

/** Curve samples while ranking the grid's candidates; the winner is re-scored in full. */
export const COARSE_SAMPLES = 24

/** The grid's rotations of each end direction, degrees. */
export const GRID_ANGLES: readonly number[] = [-90, -65, -45, -22, 0, 22, 45, 65, 90]

/** The grid's arm lengths, as fractions of the chord. */
export const GRID_ARMS: readonly number[] = [0.15, 0.3, 0.45, 0.6, 0.8]

/** Shortest arm, as a fraction of the chord, a free cubic may have. */
const MIN_ARM = 0.02

/**
 * Longest chord, px, of a cubic or line that may be a corner's anti-aliasing
 * chamfer rather than a curve the artist drew: the chamfer spans about one
 * pixel per side.
 */
export const SHARPEN_MAX_CHORD = 2.5

/**
 * Longest chord, px, of a cubic that may be a whole short edge with a chamfered
 * corner at each end (a bar's end, a glyph terminal).
 */
export const SHARPEN_MAX_EDGE = 8

/** Turn between two lines from which their meeting is a corner: {@link CORNER_TURN_MIN}. */
export const SHARPEN_MIN_TURN = CORNER_TURN_MIN

/** Below this a lower-bound quotient may involve subnormals and screens as 0. */
const SCREEN_FLOOR = 1e-290
/** Above this a lower-bound quotient screens as 0, so no overflow can differ. */
const SCREEN_CEIL = 1e300
/** Keeps a lower bound below the exact term: about 4,500 units of rounding. */
const SCREEN_SHRINK = 1 - 1e-12
/**
 * Margin on the early exit when the partial sum runs in another order than the
 * exact one: a recursive sum of at most `RUN_POINTS` non-negative terms errs by
 * under 1.1e-14 of the total (Higham 1993, eq. 2.6).
 */
const REORDER_MARGIN = 1 + 1e-12
/** Most measured points a merge run spans. */
const RUN_POINTS = MAX_SPAN + 1

/** Radians per degree, as Rust's `to_radians` multiplies. */
const RADIANS_PER_DEGREE = Math.PI / 180

// ---------------------------------------------------------------------------
// The residual
// ---------------------------------------------------------------------------

/** Samples of the candidate being scored, interleaved `x, y`. */
const fineSamples = new Float64Array(2 * (SAMPLES + 1))
/** Each run point's nearest sample, by position in the run, from the screen. */
const nearestOf = new Uint8Array(RUN_POINTS)

/** The `n + 1` samples `B(k/n)`, `k = 0..=n`, of `c` into `out`, as `evalCubic` computes them. */
function fillSamples(c: Bezier, n: number, out: Float64Array): void {
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const u = 1 - t
    const w0 = u * u * u
    const w1 = 3 * u * u * t
    const w2 = 3 * u * t * t
    const w3 = t * t * t
    out[2 * k] = w0 * c.x0 + w1 * c.x1 + w2 * c.x2 + w3 * c.x3
    out[2 * k + 1] = w0 * c.y0 + w1 * c.y1 + w2 * c.y2 + w3 * c.y3
  }
}

/**
 * Index of the sample nearest `(px, py)` among the first `count` of `s`: the
 * first at the smallest squared distance (ranking by the square needs no square
 * root), 0 when every distance is NaN.
 */
function nearestSample(px: number, py: number, s: Float64Array, count: number): number {
  let best = Infinity
  let bestK = 0
  for (let k = 0; k < count; k++) {
    const dx = px - s[2 * k]
    const dy = py - s[2 * k + 1]
    const d2 = dx * dx + dy * dy
    if (d2 < best) {
      best = d2
      bestK = k
    }
  }
  return bestK
}

/** One point's term `(d/s)²`, `d = |p − q|`, `s = max(σ, 1e-6)`. */
function exactTerm(px: number, py: number, sigma: number, qx: number, qy: number): number {
  const d = hypot(px - qx, py - qy)
  const s = sigma >= 1e-6 ? sigma : 1e-6
  return (d / s) * (d / s)
}

/**
 * A lower bound of {@link exactTerm} from the squared distance:
 * `fl(d²/fl(s²))·(1 − 1e-12)`, or 0 outside `[1e-290, 1e300]` and for NaN.
 */
function lowerTerm(d2: number, sigma: number): number {
  const s = sigma >= 1e-6 ? sigma : 1e-6
  const q = d2 / (s * s)
  return q >= SCREEN_FLOOR && q <= SCREEN_CEIL ? q * SCREEN_SHRINK : 0
}

/** `Σ_{i=a..=b}` of each point's exact term against its nearest of `count` samples, in point order. */
function inOrderSum(
  s: Float64Array,
  count: number,
  pts: Float64Array,
  sigma: Float64Array,
  a: number,
  b: number,
): number {
  let total = 0
  for (let i = a; i <= b; i++) {
    const px = pts[2 * i]
    const py = pts[2 * i + 1]
    const k = nearestSample(px, py, s, count)
    total += exactTerm(px, py, sigma[i], s[2 * k], s[2 * k + 1])
  }
  return total
}

/**
 * The run `a..=b` scored against `count` curve samples, answering only "is the
 * residual below `bound`?": the exact in-order residual when it is, infinity or a
 * value `≥ bound` when it is not.
 *
 * 1. `bound` infinite or NaN: the exact in-order sum. A run longer than
 *    `MAX_SPAN + 1` points or a `bound` under 1e-250: the in-order sum, stopped
 *    as soon as it reaches `bound`.
 * 2. Otherwise the points are visited middle-first (`mid = ⌊(m − 1)/2⌋`, then
 *    alternately one step right and one step left) and the lower bounds of their
 *    terms summed; once the partial sum reaches `bound·(1 + 1e-12)` the answer is
 *    infinity.
 * 3. A survivor's exact terms are summed in point order, each against the sample
 *    its screen found nearest.
 */
function scoreBelow(
  s: Float64Array,
  count: number,
  pts: Float64Array,
  sigma: Float64Array,
  a: number,
  b: number,
  bound: number,
): number {
  if (Number.isNaN(bound) || bound === Infinity) return inOrderSum(s, count, pts, sigma, a, b)
  const m = b + 1 - a
  if (m > RUN_POINTS || bound < 1e-250) {
    let total = 0
    for (let i = a; i <= b; i++) {
      const px = pts[2 * i]
      const py = pts[2 * i + 1]
      const k = nearestSample(px, py, s, count)
      total += exactTerm(px, py, sigma[i], s[2 * k], s[2 * k + 1])
      if (total >= bound) return Infinity
    }
    return total
  }
  const exit = bound * REORDER_MARGIN
  const mid = (m - 1) >> 1
  const end = 2 * count
  let partial = 0
  for (let step = 0; step < m; step++) {
    const half = (step + 1) >> 1
    const q = (step & 1) === 1 ? mid + half : mid - half
    const i = a + q
    // The nearest sample as `nearestSample` finds it, and its term's lower bound.
    const px = pts[2 * i]
    const py = pts[2 * i + 1]
    let best = Infinity
    let bestK = 0
    for (let k = 0; k < end; k += 2) {
      const dx = px - s[k]
      const dy = py - s[k + 1]
      const d2 = dx * dx + dy * dy
      if (d2 < best) {
        best = d2
        bestK = k
      }
    }
    nearestOf[q] = bestK >> 1
    partial += lowerTerm(best, sigma[i])
    if (partial >= exit) return Infinity
  }
  let total = 0
  for (let q = 0; q < m; q++) {
    const i = a + q
    const k = nearestOf[q]
    total += exactTerm(pts[2 * i], pts[2 * i + 1], sigma[i], s[2 * k], s[2 * k + 1])
  }
  return total
}

/**
 * Weighted residual of the measured points `a..=b` of `poly` against the cubic
 * `c`: `Σ (d_k/σ_k)²` (σ floored at 1e-6 px), with `d_k` the distance to the
 * nearest of `n + 1` samples evenly spaced in the curve parameter (`n` at most
 * {@link SAMPLES}, its default). A line is the degenerate cubic
 * `[start, start, end, end]`. Nearest-sample distance overstates the true one by
 * up to half the sample spacing; every description a merge compares is scored
 * the same way. O((b − a + 1)·n).
 */
export function mergeChi2(c: Bezier, poly: Polyline, a: number, b: number, n = SAMPLES): number {
  const count = Math.min(Math.max(Math.floor(n), 1), SAMPLES)
  fillSamples(c, count, fineSamples)
  return inOrderSum(fineSamples, count + 1, poly.points, poly.sigma, a, b)
}

/**
 * {@link mergeChi2}, answering only "is it below `bound`?": a residual below
 * `bound` comes back bit for bit as {@link mergeChi2} returns it, and one at or
 * above it as infinity or some value `≥ bound`. What the search asks of every
 * candidate.
 */
export function mergeChi2Below(
  c: Bezier,
  poly: Polyline,
  a: number,
  b: number,
  bound: number,
  n = SAMPLES,
): number {
  const count = Math.min(Math.max(Math.floor(n), 1), SAMPLES)
  fillSamples(c, count, fineSamples)
  return scoreBelow(fineSamples, count + 1, poly.points, poly.sigma, a, b, bound)
}

// ---------------------------------------------------------------------------
// The free-cubic search
// ---------------------------------------------------------------------------

/** Samples per grid candidate, `COARSE_SAMPLES + 1`. */
const N1 = COARSE_SAMPLES + 1
/** One end's `(angle, arm)` choices, indexed `angle · GRID_ARMS.length + arm`. */
const END_CHOICES = GRID_ANGLES.length * GRID_ARMS.length

/** Bernstein weights `b0..b3` of the grid's sample parameters `k/24`. */
const GRID_BERN = (() => {
  const out = new Float64Array(4 * N1)
  for (let k = 0; k < N1; k++) {
    const t = k / COARSE_SAMPLES
    const u = 1 - t
    out[4 * k] = u * u * u
    out[4 * k + 1] = 3 * u * u * t
    out[4 * k + 2] = 3 * u * t * t
    out[4 * k + 3] = t * t * t
  }
  return out
})()

/** Whether each grid arm lies in `[MIN_ARM, MAX_ARM]`. */
const GRID_ARM_OK = GRID_ARMS.map((d) => d >= MIN_ARM && d <= MAX_ARM)

/**
 * The grid's cache: `head[e0][k] = b0(k)·P0 + b1(k)·P1(e0)`, `tail[e1][k] =
 * b2(k)·P2(e1)`, `last[k] = b3(k)·P3`, per coordinate, and the control points
 * the crossing test needs. A candidate's sample is `(head + tail) + last`, the
 * operations `evalCubic` performs in its order.
 */
const headX = new Float64Array(END_CHOICES * N1)
const headY = new Float64Array(END_CHOICES * N1)
const tailX = new Float64Array(END_CHOICES * N1)
const tailY = new Float64Array(END_CHOICES * N1)
const lastX = new Float64Array(N1)
const lastY = new Float64Array(N1)
const ctrl1X = new Float64Array(END_CHOICES)
const ctrl1Y = new Float64Array(END_CHOICES)
const ctrl2X = new Float64Array(END_CHOICES)
const ctrl2Y = new Float64Array(END_CHOICES)
/** One grid candidate's samples. */
const coarseSamples = new Float64Array(2 * N1)
/** Scratch cubic for the crossing tests and builds. */
const scratch: Bezier = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 }
/** Scratch direction for {@link rotateInto}. */
const turned: Vec = { x: 0, y: 0 }

/** `(vx, vy)` rotated by `deg` degrees (counter-clockwise in y-up, clockwise on screen) into `out`. */
function rotateInto(vx: number, vy: number, deg: number, out: Vec): Vec {
  const r = deg * RADIANS_PER_DEGREE
  const s = Math.sin(r)
  const c = Math.cos(r)
  out.x = vx * c - vy * s
  out.y = vx * s + vy * c
  return out
}

/**
 * The search space of the free cubic for the measured run `a..=b`: the fixed
 * ends, the chord, and the contour's own unit directions at each end, from which
 * the rotations are measured.
 */
class FreeCubicSearch {
  constructor(
    readonly pts: Float64Array,
    readonly sigma: Float64Array,
    readonly a: number,
    readonly b: number,
    readonly p0x: number,
    readonly p0y: number,
    readonly p3x: number,
    readonly p3y: number,
    readonly chord: number,
    readonly base0x: number,
    readonly base0y: number,
    readonly base1x: number,
    readonly base1y: number,
  ) {}

  /** The cubic with end directions rotated `r0`, `r1` degrees and arms `d0`, `d1` chords, into `out`. */
  build(r0: number, r1: number, d0: number, d1: number, out: Bezier): Bezier {
    const chord = this.chord
    rotateInto(this.base0x, this.base0y, r0, turned)
    const e0x = turned.x
    const e0y = turned.y
    rotateInto(this.base1x, this.base1y, r1, turned)
    out.x0 = this.p0x
    out.y0 = this.p0y
    out.x1 = this.p0x + e0x * d0 * chord
    out.y1 = this.p0y + e0y * d0 * chord
    out.x2 = this.p3x - turned.x * d1 * chord
    out.y2 = this.p3y - turned.y * d1 * chord
    out.x3 = this.p3x
    out.y3 = this.p3y
    return out
  }

  /**
   * The residual of a candidate on {@link SAMPLES} samples, or infinity outside
   * the search box (arms outside `[0.02, MAX_ARM]`, rotations beyond
   * {@link SEARCH_DEGREES}) or for a self-crossing cubic. A candidate certain to
   * reach `bound` may be cut short and scored infinity; pass infinity for the
   * exact value.
   */
  score(r0: number, r1: number, d0: number, d1: number, bound: number): number {
    if (!(d0 >= MIN_ARM && d0 <= MAX_ARM) || !(d1 >= MIN_ARM && d1 <= MAX_ARM)) return Infinity
    if (Math.abs(r0) > SEARCH_DEGREES || Math.abs(r1) > SEARCH_DEGREES) return Infinity
    const c = this.build(r0, r1, d0, d1, scratch)
    if (cubicSelfIntersects(c)) return Infinity
    fillSamples(c, SAMPLES, fineSamples)
    return scoreBelow(fineSamples, SAMPLES + 1, this.pts, this.sigma, this.a, this.b, bound)
  }

  /**
   * The coarse grid: 9 rotations at each end by 5 arm lengths at each, visited
   * `r0`, `r1`, `d0`, `d1` outermost first; the first candidate with the smallest
   * residual on {@link COARSE_SAMPLES} + 1 samples that does not cross itself is
   * written to `cur` as `[r0, r1, d0, d1]`. A pattern search alone settles into a
   * symmetric basin; the fits that matter are asymmetric. False when every
   * candidate is inadmissible.
   */
  grid(cur: Float64Array): boolean {
    const { p0x, p0y, p3x, p3y, chord } = this
    const arms = GRID_ARMS.length
    for (let ai = 0; ai < GRID_ANGLES.length; ai++) {
      rotateInto(this.base0x, this.base0y, GRID_ANGLES[ai], turned)
      const u0x = turned.x
      const u0y = turned.y
      rotateInto(this.base1x, this.base1y, GRID_ANGLES[ai], turned)
      const u1x = turned.x
      const u1y = turned.y
      for (let di = 0; di < arms; di++) {
        const e = ai * arms + di
        const d = GRID_ARMS[di]
        ctrl1X[e] = p0x + u0x * d * chord
        ctrl1Y[e] = p0y + u0y * d * chord
        ctrl2X[e] = p3x - u1x * d * chord
        ctrl2Y[e] = p3y - u1y * d * chord
      }
    }
    for (let e = 0; e < END_CHOICES; e++) {
      const q1x = ctrl1X[e]
      const q1y = ctrl1Y[e]
      const q2x = ctrl2X[e]
      const q2y = ctrl2Y[e]
      for (let k = 0; k < N1; k++) {
        const w = 4 * k
        headX[e * N1 + k] = GRID_BERN[w] * p0x + GRID_BERN[w + 1] * q1x
        headY[e * N1 + k] = GRID_BERN[w] * p0y + GRID_BERN[w + 1] * q1y
        tailX[e * N1 + k] = GRID_BERN[w + 2] * q2x
        tailY[e * N1 + k] = GRID_BERN[w + 2] * q2y
      }
    }
    for (let k = 0; k < N1; k++) {
      lastX[k] = GRID_BERN[4 * k + 3] * p3x
      lastY[k] = GRID_BERN[4 * k + 3] * p3y
    }
    let rough = Infinity
    cur[0] = 0
    cur[1] = 0
    cur[2] = 0.35
    cur[3] = 0.35
    for (let a0 = 0; a0 < GRID_ANGLES.length; a0++) {
      for (let a1 = 0; a1 < GRID_ANGLES.length; a1++) {
        for (let i0 = 0; i0 < arms; i0++) {
          for (let i1 = 0; i1 < arms; i1++) {
            if (!GRID_ARM_OK[i0] || !GRID_ARM_OK[i1]) continue
            const e0 = a0 * arms + i0
            const e1 = a1 * arms + i1
            const h = e0 * N1
            const t = e1 * N1
            for (let k = 0; k < N1; k++) {
              coarseSamples[2 * k] = headX[h + k] + tailX[t + k] + lastX[k]
              coarseSamples[2 * k + 1] = headY[h + k] + tailY[t + k] + lastY[k]
            }
            const x = scoreBelow(coarseSamples, N1, this.pts, this.sigma, this.a, this.b, rough)
            if (x < rough && !this.crosses(e0, e1)) {
              rough = x
              cur[0] = GRID_ANGLES[a0]
              cur[1] = GRID_ANGLES[a1]
              cur[2] = GRID_ARMS[i0]
              cur[3] = GRID_ARMS[i1]
            }
          }
        }
      }
    }
    return Number.isFinite(rough)
  }

  /** Whether the grid candidate `(e0, e1)` crosses itself. */
  private crosses(e0: number, e1: number): boolean {
    scratch.x0 = this.p0x
    scratch.y0 = this.p0y
    scratch.x1 = ctrl1X[e0]
    scratch.y1 = ctrl1Y[e0]
    scratch.x2 = ctrl2X[e1]
    scratch.y2 = ctrl2Y[e1]
    scratch.x3 = this.p3x
    scratch.y3 = this.p3y
    return cubicSelfIntersects(scratch)
  }

  /**
   * Compass search from `cur` on the full residual: try ± one step in each of
   * the four coordinates, move on any improvement, repeat until none; then halve
   * the steps (from 10° and 0.1 chord) and go again, six times. Updates `cur` and
   * returns its residual.
   */
  refine(cur: Float64Array): number {
    let best = this.score(cur[0], cur[1], cur[2], cur[3], Infinity)
    const step = [10, 10, 0.1, 0.1]
    const trial = new Float64Array(4)
    for (let round = 0; round < 6; round++) {
      let improved = true
      while (improved) {
        improved = false
        for (let k = 0; k < 4; k++) {
          for (let sign = -1; sign <= 1; sign += 2) {
            trial.set(cur)
            trial[k] += sign * step[k]
            const x = this.score(trial[0], trial[1], trial[2], trial[3], best)
            if (x < best) {
              best = x
              cur.set(trial)
              improved = true
            }
          }
        }
      }
      for (let k = 0; k < 4; k++) step[k] *= 0.5
    }
    return best
  }
}

/** A free-tangent cubic and its residual, {@link mergeChi2} of exactly that cubic. */
export interface FreeCubic {
  cubic: Bezier
  chi2: number
}

/**
 * The cubic from `(p0x, p0y)` to `(p3x, p3y)` that best fits the measured points
 * `a..=b` with both end tangents free, and its residual ({@link mergeChi2}, bit
 * for bit). The ends are passed in rather than read from the polyline: a
 * segment starts where the previous one ended, at a refined vertex, and the
 * curve scored must be the curve emitted. Null for a zero-length chord, fewer
 * than two interior points, a contour of zero length, or when no admissible
 * cubic was found.
 */
export function freeCubic(
  poly: Polyline,
  a: number,
  b: number,
  p0x: number,
  p0y: number,
  p3x: number,
  p3y: number,
): FreeCubic | null {
  const pts = poly.points
  const chord = hypot(p0x - p3x, p0y - p3y)
  if (chord <= 1e-9 || b <= a + 1) return null
  // Where the contour leaves and arrives: the center of the search.
  const qi = Math.min(a + 2, b)
  const d0x = pts[2 * qi] - p0x
  const d0y = pts[2 * qi + 1] - p0y
  const qj = Math.max(b >= 2 ? b - 2 : 0, a)
  const d1x = p3x - pts[2 * qj]
  const d1y = p3y - pts[2 * qj + 1]
  const n0 = hypot(d0x, d0y)
  const n1 = hypot(d1x, d1y)
  if (n0 <= 1e-9 || n1 <= 1e-9) return null
  let acc = 0
  for (let i = a; i < b; i++) {
    acc += hypot(pts[2 * i] - pts[2 * i + 2], pts[2 * i + 1] - pts[2 * i + 3])
  }
  if (acc <= 1e-9) return null
  const search = new FreeCubicSearch(
    pts,
    poly.sigma,
    a,
    b,
    p0x,
    p0y,
    p3x,
    p3y,
    chord,
    d0x / n0,
    d0y / n0,
    d1x / n1,
    d1y / n1,
  )
  const cur = new Float64Array(4)
  if (!search.grid(cur)) return null
  const best = search.refine(cur)
  if (!Number.isFinite(best)) return null
  const cubic = search.build(cur[0], cur[1], cur[2], cur[3], {
    x0: 0,
    y0: 0,
    x1: 0,
    y1: 0,
    x2: 0,
    y2: 0,
    x3: 0,
    y3: 0,
  })
  return { cubic, chi2: best }
}

// ---------------------------------------------------------------------------
// Merging runs into free cubics
// ---------------------------------------------------------------------------

/**
 * Extra parameters, beyond `cubicParams()`, a cubic is charged when its end
 * directions turn by more than the limit in force (`cubicMaxTurnRadians`, finite
 * only under the written-arcs prices): one more cubic's worth. The directions
 * are `p1 − p0` and `p3 − p2`, each falling back to the chord through the next
 * control point when its arm has zero length. 0 at the default prices.
 */
function overTurnParams(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): number {
  const limit = cubicMaxTurnRadians()
  if (!Number.isFinite(limit)) return 0
  const d0 =
    hypot(x1 - x0, y1 - y0) > 1e-12 ? { x: x1 - x0, y: y1 - y0 } : { x: x2 - x0, y: y2 - y0 }
  const d1 =
    hypot(x3 - x2, y3 - y2) > 1e-12 ? { x: x3 - x2, y: y3 - y2 } : { x: x3 - x1, y: y3 - y1 }
  return turnAngle(d0, d1) > limit ? cubicParams() : 0
}

/** Scratch cubic the old side of a run is scored through. */
const oldQuad: Bezier = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 0, y2: 0, x3: 0, y3: 0 }

/**
 * One sweep of {@link mergeFreeCubics}. At each segment `m`, runs of
 * {@link MAX_RUN} down to 2 segments are tried, longest first (a corner is
 * usually three segments, and absorbing all of it removes the kink rather than
 * moving it). A run qualifies when it covers more than three and at most
 * {@link MAX_SPAN} measured points, holds no arc, and has no vertex of `keep`
 * strictly inside. The first run whose free cubic, through the run's actual
 * start and end on the path, costs less than the segments it replaces is
 * spliced in and its interior vertices dropped. A run already turned down with
 * the same vertices is not tried again (local invalidation, Garland & Heckbert
 * 1997): a run is a pure function of its vertices, since no merge moves a
 * segment end. Returns the number of merges.
 */
function mergeRound(
  path: FitPath,
  poly: Polyline,
  verts: number[],
  cfg: FitConfig,
  rejected: Set<string>,
  keep: ReadonlySet<number> | null,
): number {
  const segs = path.segments
  let merged = 0
  let m = 0
  while (m + 1 < segs.length) {
    let bestRun = 0
    let bestCubic: Bezier | null = null
    for (let run = Math.min(MAX_RUN, segs.length - m); run >= 2; run--) {
      if (m + run >= verts.length) continue
      const a = verts[m]
      const b = verts[m + run]
      if (b <= a + 3 || b - a > MAX_SPAN) continue
      // A pinned vertex stays a vertex.
      if (keep) {
        let pinned = false
        for (let q = m + 1; q < m + run; q++) if (keep.has(verts[q])) pinned = true
        if (pinned) continue
      }
      // An arc carries its own parametrization; runs holding one are left alone.
      let arc = false
      for (let q = m; q < m + run; q++) if (segs[q].type === 'A') arc = true
      if (arc) continue
      const key = verts.slice(m, m + run + 1).join(',')
      if (rejected.has(key)) continue
      // The old side does not depend on the candidate, so it is priced first.
      let oldChi2 = 0
      let oldParams = 0
      let cx = m === 0 ? path.x0 : segs[m - 1].x
      let cy = m === 0 ? path.y0 : segs[m - 1].y
      for (let q = m; q < m + run; q++) {
        const seg = segs[q]
        oldParams += segmentParams(seg)
        oldQuad.x0 = cx
        oldQuad.y0 = cy
        if (seg.type === 'C') {
          oldParams += overTurnParams(cx, cy, seg.x1, seg.y1, seg.x2, seg.y2, seg.x, seg.y)
          oldQuad.x1 = seg.x1
          oldQuad.y1 = seg.y1
          oldQuad.x2 = seg.x2
          oldQuad.y2 = seg.y2
        } else {
          oldQuad.x1 = cx
          oldQuad.y1 = cy
          oldQuad.x2 = seg.x
          oldQuad.y2 = seg.y
        }
        oldQuad.x3 = seg.x
        oldQuad.y3 = seg.y
        oldChi2 += mergeChi2(oldQuad, poly, verts[q], verts[q + 1])
        cx = seg.x
        cy = seg.y
      }
      const limit = 0.5 * oldChi2 + cfg.lambda * oldParams + SMOOTH_SLACK * cfg.lambda
      // A free cubic costs at least its parameters (½·χ² ≥ 0): a run already
      // cheaper than that floor can never be replaced, so its search is skipped.
      const floor = cfg.lambda * (cubicParams() + BREAK_PARAMS)
      if (floor >= limit) {
        rejected.add(key)
        continue
      }
      const sx = m === 0 ? path.x0 : segs[m - 1].x
      const sy = m === 0 ? path.y0 : segs[m - 1].y
      const end = segs[m + run - 1]
      const fit = freeCubic(poly, a, b, sx, sy, end.x, end.y)
      if (!fit || cubicSelfIntersects(fit.cubic)) {
        rejected.add(key)
        continue
      }
      const c = fit.cubic
      const newCost =
        0.5 * fit.chi2 +
        floor +
        cfg.lambda * overTurnParams(c.x0, c.y0, c.x1, c.y1, c.x2, c.y2, c.x3, c.y3)
      if (newCost < limit) {
        bestRun = run
        bestCubic = c
        break
      }
      rejected.add(key)
    }
    if (bestCubic) {
      const c = bestCubic
      segs.splice(m, bestRun, cubicTo(c.x1, c.y1, c.x2, c.y2, c.x3, c.y3))
      // Drop the interior vertices the merge absorbed, so the two stay aligned.
      verts.splice(m + 1, bestRun - 1)
      merged++
    }
    m++
  }
  return merged
}

/**
 * Merge runs of segments into single free-tangent cubics wherever the objective
 * prefers it, in place: `path.segments` and `vertices` (the measured-point index
 * of each segment end, `segments + 1` of them, into `poly`) are updated
 * together. No run with a vertex of `keep` strictly inside it is tried, so those
 * vertices survive. Runs up to {@link MAX_ROUNDS} sweeps, stopping after one that
 * merges nothing, and returns the number of merges. Nothing happens with fewer
 * than two segments or a vertex list out of step with them. The path's start,
 * and every segment end that survives, stay exactly where they were.
 */
export function mergeFreeCubics(
  path: FitPath,
  poly: Polyline,
  vertices: number[],
  cfg: FitConfig,
  keep: readonly number[] = [],
): number {
  if (path.segments.length < 2 || vertices.length !== path.segments.length + 1) return 0
  const keepSet = keep.length > 0 ? new Set(keep) : null
  const rejected = new Set<string>()
  let merged = 0
  for (let round = 0; round < MAX_ROUNDS; round++) {
    const got = mergeRound(path, poly, vertices, cfg, rejected, keepSet)
    merged += got
    if (got === 0) break
  }
  return merged
}

// ---------------------------------------------------------------------------
// Sharp corners the program rounded off
// ---------------------------------------------------------------------------

/** `(x, y)` normalized, or null for a length at or below 1e-12. */
function unit(x: number, y: number): Vec | null {
  const n = hypot(x, y)
  return n > 1e-12 ? { x: x / n, y: y / n } : null
}

/**
 * Where the line through `a` with unit direction `d0` meets the line through `b`
 * with unit direction `d1`, `a + t·d0` with `t = ((b − a) × d1) / (d0 × d1)`, if
 * the two turn by at least {@link SHARPEN_MIN_TURN}, the meeting lies ahead of
 * `p0` along the first line and behind `p1` along the second (a convex corner
 * between them, not a crossing behind the curve), and it is within the chamfer
 * allowance `min(3, CORNER_CHAMFER / max(0.2, sin(½(π − turn)))) + 0.5` px of
 * both `p0` and `p1`. The sign tests carry the same slack, since a sample can
 * sit a fraction past the corner along the other edge. Near-parallel lines
 * (`|d0 × d1| ≤ 1e-9`) have no corner.
 */
function cornerBetween(a: Vec, d0: Vec, p0: Vec, b: Vec, d1: Vec, p1: Vec): Vec | null {
  const denom = d0.x * d1.y - d0.y * d1.x
  const turn = Math.atan2(Math.abs(denom), d0.x * d1.x + d0.y * d1.y)
  if (turn < SHARPEN_MIN_TURN || Math.abs(denom) <= 1e-9) return null
  const t = ((b.x - a.x) * d1.y - (b.y - a.y) * d1.x) / denom
  const hit = { x: a.x + d0.x * t, y: a.y + d0.y * t }
  const halfInterior = 0.5 * (Math.PI - turn)
  const allow = fmin(CORNER_CHAMFER / fmax(Math.sin(halfInterior), 0.2), 3) + 0.5
  const ahead = (hit.x - p0.x) * d0.x + (hit.y - p0.y) * d0.y >= -allow
  const behind = (p1.x - hit.x) * d1.x + (p1.y - hit.y) * d1.y >= -allow
  if (
    ahead &&
    behind &&
    hypot(hit.x - p0.x, hit.y - p0.y) <= allow &&
    hypot(hit.x - p1.x, hit.y - p1.y) <= allow
  ) {
    return hit
  }
  return null
}

/** One or two corners that replace a segment. */
interface Corners {
  h1: Vec
  h2: Vec | null
}

/**
 * The corner(s) that replace the short cubic `c` between the incoming line
 * (through `a`, direction `d0`) and the outgoing one (through `b`, direction
 * `d1`): one corner when the cubic is the chamfer itself (chord at most
 * {@link SHARPEN_MAX_CHORD} and the lines meet within the allowance of its
 * ends); otherwise two, when it is a short edge with a chamfer at each end, the
 * edge's own line taken through the cubic's midpoint along its tangent there,
 * the two corners between 1 px and {@link SHARPEN_MAX_EDGE} apart.
 */
function cornersOfShortCubic(c: Bezier, a: Vec, d0: Vec, b: Vec, d1: Vec): Corners | null {
  const s0 = { x: c.x0, y: c.y0 }
  const e = { x: c.x3, y: c.y3 }
  // B(½) and B'(½)/3, as `eval_cubic` and inkvec's `cubic_tangent_at` round them.
  const w0 = 0.5 * 0.5 * 0.5
  const w1 = 3 * 0.5 * 0.5 * 0.5
  const mid = {
    x: w0 * c.x0 + w1 * c.x1 + w1 * c.x2 + w0 * c.x3,
    y: w0 * c.y0 + w1 * c.y1 + w1 * c.y2 + w0 * c.y3,
  }
  const tx = 3 * (0.25 * (c.x1 - c.x0) + 2 * 0.5 * 0.5 * (c.x2 - c.x1) + 0.25 * (c.x3 - c.x2))
  const ty = 3 * (0.25 * (c.y1 - c.y0) + 2 * 0.5 * 0.5 * (c.y2 - c.y1) + 0.25 * (c.y3 - c.y2))
  if (hypot(s0.x - e.x, s0.y - e.y) <= SHARPEN_MAX_CHORD) {
    const hit = cornerBetween(a, d0, s0, b, d1, e)
    if (hit) return { h1: hit, h2: null }
  }
  const dm = unit(tx, ty)
  if (!dm) return null
  const h1 = cornerBetween(a, d0, s0, mid, dm, s0)
  const h2 = cornerBetween(mid, dm, e, b, d1, e)
  if (h1 && h2) {
    const gap = hypot(h1.x - h2.x, h1.y - h2.y)
    if (gap >= 1 && gap <= SHARPEN_MAX_EDGE) return { h1, h2 }
  }
  return null
}

/**
 * If segment `i` (starting at `starts[i]`) should be sharpened away, the
 * corner(s) that replace it. Only a segment between two lines qualifies: a cubic
 * with a chord up to {@link SHARPEN_MAX_EDGE} as {@link cornersOfShortCubic}
 * decides, a line with a chord up to {@link SHARPEN_MAX_CHORD} (a chamfer drawn
 * straight) by the neighbors' own meeting point. Arcs are left alone.
 */
function cornerFor(
  segs: readonly FitSegment[],
  starts: readonly Vec[],
  i: number,
  prev: number,
  next: number,
): Corners | null {
  if (prev < 0 || next < 0) return null
  if (segs[prev].type !== 'L' || segs[next].type !== 'L') return null
  const a = starts[prev]
  const b = { x: segs[next].x, y: segs[next].y }
  const s0 = starts[i]
  const seg = segs[i]
  const chord = hypot(s0.x - seg.x, s0.y - seg.y)
  if (seg.type === 'C' && chord <= SHARPEN_MAX_EDGE) {
    const d0 = unit(s0.x - a.x, s0.y - a.y)
    if (!d0) return null
    const d1 = unit(b.x - seg.x, b.y - seg.y)
    if (!d1) return null
    const c = {
      x0: s0.x,
      y0: s0.y,
      x1: seg.x1,
      y1: seg.y1,
      x2: seg.x2,
      y2: seg.y2,
      x3: seg.x,
      y3: seg.y,
    }
    return cornersOfShortCubic(c, a, d0, b, d1)
  }
  if (seg.type === 'L' && chord <= SHARPEN_MAX_CHORD) {
    const d0 = unit(s0.x - a.x, s0.y - a.y)
    if (!d0) return null
    const d1 = unit(b.x - seg.x, b.y - seg.y)
    if (!d1) return null
    const hit = cornerBetween(a, d0, s0, b, d1, { x: seg.x, y: seg.y })
    return hit ? { h1: hit, h2: null } : null
  }
  return null
}

/** Move the end of the last segment of `out` to `p` if it is a line; whether it moved. */
function endLastLineAt(out: FitSegment[], p: Vec): boolean {
  const last = out[out.length - 1]
  if (!last || last.type !== 'L') return false
  out[out.length - 1] = lineTo(p.x, p.y)
  return true
}

/** The index in `lo..=hi` of the point of `pts` nearest `p`, the first on a tie. */
function nearestIndex(pts: Float64Array, p: Vec, lo: number, hi: number): number {
  let best = Infinity
  let at = lo
  for (let i = lo; i <= hi; i++) {
    const dx = pts[2 * i] - p.x
    const dy = pts[2 * i + 1] - p.y
    const d2 = dx * dx + dy * dy
    if (d2 < best) {
      best = d2
      at = i
    }
  }
  return at
}

/** What {@link sharpenCorners} keeps in step with the path it edits. */
export interface SharpenTrack {
  /** The measured-point index of each segment end (`segments + 1`), updated in place. */
  vertices: number[]
  /** The polyline the vertices index. */
  poly: Polyline
  /** Measured-point indices that must stay where they are (the repair's pins). */
  keep?: readonly number[]
}

/**
 * Replace short cubics (and chamfer chords) that bridge two lines meeting at an
 * angle by the lines' actual intersection, in place: one vertex instead of a
 * cubic, and the corner where the artist put it. The level set rounds a
 * rasterized corner off by about a pixel, which to the residual is a fillet; an
 * icon artist draws corners, and a sub-two-pixel fillet at this scale is the
 * renderer's. Guarded by geometry, not residual ({@link cornerBetween}). A
 * closed path is treated as a ring, so its first segment has the last as
 * predecessor and its start may move to a corner; an open path's ends never
 * move. With `track`, the vertex list is kept in step (a corner takes the
 * measured index nearest it within the replaced span) and a segment touching a
 * vertex of `track.keep` is never sharpened. Returns the number of corners made.
 */
export function sharpenCorners(path: FitPath, track?: SharpenTrack): number {
  const segs = path.segments
  const n = segs.length
  if (n < 3) return 0
  const v = track && track.vertices.length === n + 1 ? track.vertices : null
  const vpts = track ? track.poly.points : new Float64Array(0)
  const keep = track?.keep && track.keep.length > 0 ? new Set(track.keep) : null
  const starts: Vec[] = []
  let cx = path.x0
  let cy = path.y0
  for (const s of segs) {
    starts.push({ x: cx, y: cy })
    cx = s.x
    cy = s.y
  }
  const looped = path.closed && hypot(cx - path.x0, cy - path.y0) < 1e-9
  const out: FitSegment[] = []
  const outVerts: number[] = v ? [v[0]] : []
  let startX = path.x0
  let startY = path.y0
  // When segment 0 is sharpened its predecessor is the last segment, which is
  // not in `out` yet; remember where it must end.
  let lastEnd: Vec | null = null
  let sharpened = 0
  for (let i = 0; i < n; i++) {
    const prev = i >= 1 ? i - 1 : looped ? n - 1 : -1
    const next = i + 1 < n ? i + 1 : looped ? 0 : -1
    const pinned = v !== null && keep !== null && (keep.has(v[i]) || keep.has(v[i + 1]))
    const corner = pinned ? null : cornerFor(segs, starts, i, prev, next)
    if (!corner) {
      out.push(segs[i])
      if (v) outVerts.push(v[i + 1])
      continue
    }
    const { h1, h2 } = corner
    const seam = i === n - 1 && looped
    // The segment is dropped; the line before it now runs on to the corner,
    // which takes the measured index nearest it within the dropped span.
    const hi1 = h2 ? v && v[i + 1] - 1 : v && v[i + 1]
    if (i === 0) {
      lastEnd = h1
      startX = h1.x
      startY = h1.y
    } else if (endLastLineAt(out, h1) && v && hi1 !== null) {
      outVerts[outVerts.length - 1] = seam && !h2 ? v[i + 1] : nearestIndex(vpts, h1, v[i], hi1)
    }
    if (seam) {
      // The path now closes through the corner(s): it starts at the last one.
      startX = (h2 ?? h1).x
      startY = (h2 ?? h1).y
    }
    if (h2) {
      out.push(lineTo(h2.x, h2.y))
      if (v) {
        const lo = Math.min(outVerts[outVerts.length - 1] + 1, v[i + 1])
        outVerts.push(seam ? v[i + 1] : nearestIndex(vpts, h2, lo, v[i + 1]))
      }
      sharpened++
    }
    sharpened++
  }
  // A ring of chamfers only has nothing left to draw: it stays as it was.
  if (sharpened > 0 && out.length < (looped ? 2 : 1)) return 0
  if (sharpened > 0) {
    if (lastEnd) {
      endLastLineAt(out, lastEnd)
      startX = lastEnd.x
      startY = lastEnd.y
    }
    path.x0 = startX
    path.y0 = startY
    path.segments = out
    if (v) v.splice(0, v.length, ...outVerts)
  }
  return sharpened
}

// ---------------------------------------------------------------------------
// The passes on a fitted edge
// ---------------------------------------------------------------------------

/** How many edits each pass made. */
export interface PostFitCounts {
  merged: number
  sharpened: number
  axisSnapped: number
  smoothSnapped: number
}

/** Options of {@link runPostFitPasses}. */
export interface PassOptions {
  /** Measured-point indices that must stay segment ends (the repair's pins). */
  keep?: readonly number[]
  /** Research pass: lines the measurement cannot tell from an axis put on it. Off by default. */
  axisLines?: boolean
  /** Research pass: nearly smooth joins made exactly smooth (`S` on the output grid). Off by default. */
  smoothJoins?: boolean
  /** The output grid the smooth-join snap rounds to; null for exact floats. */
  grid?: OutputGrid | null
}

/**
 * The post-fit passes on a path in place, in inkvec's order: the free-cubic
 * merge (keeping `keep`), the corner sharpening, then, on a fit without pins
 * and only when asked for, the research snaps of axis-aligned lines and smooth
 * joins. `vertices` (the measured-point index of each segment end into `poly`,
 * `segments + 1` of them, strictly increasing: a closed boundary is passed
 * opened at its cut) is kept in step. For a fit without a span cap; a capped fit
 * takes none of these passes.
 */
export function runPostFitPasses(
  path: FitPath,
  poly: Polyline,
  vertices: number[],
  cfg: FitConfig,
  opts: PassOptions = {},
): PostFitCounts {
  const keep = opts.keep ?? []
  const counts: PostFitCounts = { merged: 0, sharpened: 0, axisSnapped: 0, smoothSnapped: 0 }
  counts.merged = mergeFreeCubics(path, poly, vertices, cfg, keep)
  counts.sharpened = sharpenCorners(path, { vertices, poly, keep })
  if (keep.length === 0) {
    if (opts.axisLines) counts.axisSnapped = snapAxisAligned(path, poly, vertices, cfg)
    if (opts.smoothJoins) {
      const grid = opts.grid === undefined ? DEFAULT_GRID : opts.grid
      counts.smoothSnapped = snapSmoothJoins(path, poly, vertices, cfg, grid)
    }
  }
  return counts
}

/**
 * Strictly increasing measured-point indices, one per vertex position
 * (interleaved `pos`), into the `count` points of `pts`, the first pinned to 0
 * and the last to `count − 1`, minimizing the summed squared distance between
 * each position and its point: a monotone alignment by dynamic programming,
 * O(vertices · points). Null when there are more vertices than points.
 */
function alignVertices(pos: Float64Array, pts: Float64Array, count: number): number[] | null {
  const nv = pos.length >> 1
  if (nv < 2 || nv > count) return null
  const out = new Array<number>(nv)
  out[0] = 0
  out[nv - 1] = count - 1
  const inner = nv - 2
  if (inner === 0) return out
  // Row r places vertex r + 1 at an index in [r + 1, count − 2 − (inner − 1 − r)].
  const width = count - nv + 1
  let prev = new Float64Array(width)
  let cur = new Float64Array(width)
  const from = new Int32Array(inner * width)
  for (let r = 0; r < inner; r++) {
    const vx = pos[2 * (r + 1)]
    const vy = pos[2 * (r + 1) + 1]
    let bestPrev = Infinity
    let bestAt = 0
    for (let c = 0; c < width; c++) {
      const i = r + 1 + c
      // The best placement of the previous vertex strictly before `i`.
      if (r === 0) {
        bestPrev = 0
        bestAt = 0
      } else if (prev[c] < bestPrev) {
        bestPrev = prev[c]
        bestAt = c
      }
      const dx = pts[2 * i] - vx
      const dy = pts[2 * i + 1] - vy
      cur[c] = bestPrev + dx * dx + dy * dy
      from[r * width + c] = bestAt
    }
    const t = prev
    prev = cur
    cur = t
  }
  let c = 0
  for (let k = 1; k < width; k++) if (prev[k] < prev[c]) c = k
  for (let r = inner - 1; r >= 0; r--) {
    out[r + 1] = r + 1 + c
    c = from[r * width + c]
  }
  return out
}

/** The path's vertex positions, interleaved: its start, then every segment's end. */
function vertexPositions(path: FitPath): Float64Array {
  const out = new Float64Array(2 * (path.segments.length + 1))
  out[0] = path.x0
  out[1] = path.y0
  path.segments.forEach((s, k) => {
    out[2 * k + 2] = s.x
    out[2 * k + 3] = s.y
  })
  return out
}

/**
 * The measured-point index of each segment end of `edge` into `points`
 * (interleaved), as the dynamic program reports its vertices: an open edge's run
 * from 0 to the last point; a closed edge's from its cut back to it, indices
 * taken modulo the point count (the first and last equal). Recovered from the
 * geometry by a monotone alignment of the segment ends to the points (a closed
 * edge cut at the point nearest its start), which is exact wherever a segment
 * ends on a measured point. Null when the edge has more segments than points.
 */
export function edgeVertices(edge: FittedEdge, points: Float64Array): number[] | null {
  const n = points.length >> 1
  const path: FitPath = {
    x0: edge.x0,
    y0: edge.y0,
    segments: edge.segments as FitSegment[],
    closed: edge.closed,
  }
  const pos = vertexPositions(path)
  if (!edge.closed) return alignVertices(pos, points, n)
  const cut = nearestIndex(points, { x: edge.x0, y: edge.y0 }, 0, n - 1)
  const opened = openAt(points, null, cut).points
  const v = alignVertices(pos, opened, n + 1)
  return v && v.map((i) => (cut + i) % n)
}

/**
 * `points` (and `sigma`) of a closed boundary opened at `cut`: `n + 1` points
 * from the cut round to the cut again.
 */
function openAt(
  points: Float64Array,
  sigma: Float64Array | null,
  cut: number,
): { points: Float64Array; sigma: Float64Array } {
  const n = points.length >> 1
  const p = new Float64Array(2 * (n + 1))
  const s = new Float64Array(n + 1)
  for (let k = 0; k <= n; k++) {
    const i = (cut + k) % n
    p[2 * k] = points[2 * i]
    p[2 * k + 1] = points[2 * i + 1]
    if (sigma) s[k] = sigma[i]
  }
  return { points: p, sigma: s }
}

/** Whether `v` runs strictly upwards from 0 to `last`. */
function isRun(v: readonly number[], last: number): boolean {
  if (v[0] !== 0 || v[v.length - 1] !== last) return false
  for (let k = 1; k < v.length; k++) {
    if (!(v[k] > v[k - 1]) || !Number.isInteger(v[k])) return false
  }
  return true
}

/** Options of {@link postFitPasses}. */
export interface PostFitOptions {
  /**
   * The measured-point index of each segment end, `segments + 1` of them, as
   * the dynamic program chose them (a closed edge's from its cut round to it,
   * modulo the point count). Recovered from the geometry when absent or
   * inconsistent ({@link edgeVertices}).
   */
  vertices?: ArrayLike<number>
  /** Point indices that must stay segment ends, as the fit was forced to keep them. */
  forced?: ArrayLike<number>
  /** Research pass: axis-aligned lines. Off by default. */
  axisLines?: boolean
  /** Research pass: smooth joins written as `S` on the output grid. Off by default. */
  smoothJoins?: boolean
  /** The output grid of the smooth-join snap ({@link DEFAULT_GRID} by default). */
  grid?: OutputGrid | null
  /**
   * The χ² recorded for a changed edge; by default the residual the
   * curve-or-primitive choice scores (`chi2` of `./curves`, sampled every
   * quarter pixel) against the polyline in path order.
   */
  measure?: (poly: Polyline, path: FitPath) => number
}

/**
 * The post-fit passes of the shipping fit (inkvec `post_fit_passes`) on one
 * fitted edge and the polyline it was fitted to (`points` interleaved, per-point
 * `sigma`, closed as the edge is): runs one free cubic explains merged
 * ({@link mergeFreeCubics}), chamfer cubics sharpened into corners
 * ({@link sharpenCorners}), and the research snaps when asked for. An open
 * edge's ends and every forced vertex stay exactly where they are. A primitive,
 * a path of fewer than two segments, or an edge no pass changes comes back as
 * the same object; a changed one as a new edge with `params` recounted and
 * `chi2` re-measured. Run it on an uncapped fit only.
 */
export function postFitPasses(
  edge: FittedEdge,
  points: Float64Array,
  sigma: Float64Array,
  cfg: FitConfig,
  opts: PostFitOptions = {},
): FittedEdge {
  const n = points.length >> 1
  if (edge.primitive || edge.segments.length < 2 || sigma.length !== n || n < 2) return edge
  for (const s of edge.segments as PathCommand[]) {
    if (s.type !== 'L' && s.type !== 'C' && s.type !== 'A') return edge
  }
  const path: FitPath = {
    x0: edge.x0,
    y0: edge.y0,
    segments: (edge.segments as FitSegment[]).slice(),
    closed: edge.closed,
  }
  const segCount = path.segments.length
  let given = opts.vertices ? Array.from(opts.vertices) : null
  if (given && given.length !== segCount + 1) given = null
  const forced = opts.forced ? Array.from(opts.forced) : []
  let poly: Polyline
  let vertices: number[] | null
  let keep: number[]
  if (!edge.closed) {
    poly = { points, sigma, closed: false }
    vertices = given && isRun(given, n - 1) ? given : edgeVertices(edge, points)
    keep = forced.filter((f) => f > 0 && f < n - 1)
  } else {
    // A loop is passed opened at its cut, so no run wraps past the polyline's
    // first point: indices count from the cut, which is 0 and `n` at once.
    const fromCut = (wrapped: number[] | null): number[] | null =>
      wrapped && wrapped.map((i, k) => (k === segCount ? n : (((i - wrapped[0]) % n) + n) % n))
    let wrapped = given && given[0] === given[segCount] ? given : null
    vertices = fromCut(wrapped)
    if (!vertices || !isRun(vertices, n)) {
      wrapped = edgeVertices(edge, points)
      vertices = fromCut(wrapped)
    }
    if (!wrapped) return edge
    const cut = ((wrapped[0] % n) + n) % n
    const opened = openAt(points, sigma, cut)
    poly = { points: opened.points, sigma: opened.sigma, closed: false }
    keep = forced.map((f) => (((f - cut) % n) + n) % n).filter((f) => f > 0)
  }
  if (!vertices || !isRun(vertices, edge.closed ? n : n - 1)) return edge
  keep.sort((a, b) => a - b)
  const counts = runPostFitPasses(path, poly, vertices, cfg, {
    keep,
    axisLines: opts.axisLines,
    smoothJoins: opts.smoothJoins,
    grid: opts.grid,
  })
  if (counts.merged + counts.sharpened + counts.axisSnapped + counts.smoothSnapped === 0) {
    return edge
  }
  let chi2: number
  if (opts.measure) chi2 = opts.measure({ points, sigma, closed: edge.closed }, path)
  else if (!edge.closed) chi2 = sampledChi2(points, sigma, path.x0, path.y0, path.segments)
  else {
    // The residual is aligned in path order: the loop read from its cut.
    const m = 2 * n
    chi2 = sampledChi2(
      poly.points.subarray(0, m),
      poly.sigma.subarray(0, n),
      path.x0,
      path.y0,
      path.segments,
    )
  }
  return {
    x0: path.x0,
    y0: path.y0,
    segments: path.segments,
    closed: edge.closed,
    params: pathParams(path),
    chi2,
  }
}
