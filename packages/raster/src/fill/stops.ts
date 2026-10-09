/**
 * Interior stops for a fitted ramp: with the candidate's geometry fixed, up to
 * two knots of a piecewise-linear color profile in the gradient coordinate `t`,
 * placed greedily on the 1/1000 offset grid by the exact binned scan
 * (`knots.ts`), re-placed against each other, and the profile refitted by
 * iteratively reweighted least squares under a Huber loss. Each variant is
 * scored against the plain ramp by the caller, so a stop is kept only when it
 * pays for its parameters.
 *
 * Method from: P. J. Huber (1964), Robust estimation of a location parameter,
 * doi:10.1214/aoms/1177703732, and P. W. Holland, R. E. Welsch (1977),
 * doi:10.1080/03610927708827533 (IRLS); J. Bai (1997), Estimating Multiple
 * Breaks One at a Time, Econometric Theory 13(3):315–352,
 * doi:10.1017/S0266466600005831 (breaks found one at a time, then each
 * re-estimated with the others held).
 *
 * Models and samples are in the fitting frame (see `samples.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/stops.rs` (`fit_mid_stops`,
 * `repartition`, `StopProblem`, `fit_piecewise`, `normal_equations`,
 * `cuts_a_misfit_sliver`, `IRLS_ROUNDS`, `MAX_SLIVER_MISFIT`, `REPARTITION_PASSES`).
 */

import { bestKnot, OFFSET_STEPS, solveSmall, zeroMat, zeroRhs } from './knots'
import {
  FillEval,
  fromSpace,
  MAX_MID_STOPS,
  MIN_GRADIENT_PIXELS,
  srgbToLinear32,
  withStops,
} from './model'
import type { FillModel, Interp, Stop } from './model'
import { fitStride } from './samples'
import type { Samples } from './samples'

/** Rounds of reweighting when a stop count's final profile is fitted. */
export const IRLS_ROUNDS = 2

/** How much worse, in median residual, a sliver cut off by a new stop may be fitted than the rest of its segment. */
export const MAX_SLIVER_MISFIT = 4

/** Passes of the repartition of two interior stops. */
export const REPARTITION_PASSES = 1

const fr = Math.fround

/** The hat basis of samples against profile nodes: the piece each sample is in (`j ≥ 1`, between nodes `j − 1` and `j`) and its position `u` along it. */
function hatBasis(t: Float64Array, nodes: readonly number[]): { j: Int32Array; u: Float64Array } {
  const m = nodes.length
  const j = new Int32Array(t.length)
  const u = new Float64Array(t.length)
  for (let i = 0; i < t.length; i++) {
    const ti = t[i]
    let k = 0
    while (k < m && nodes[k] < ti) k++
    k = Math.min(Math.max(k, 1), m - 1)
    const lo = nodes[k - 1]
    const hi = nodes[k]
    j[i] = k
    u[i] = hi > lo ? Math.min(Math.max((ti - lo) / (hi - lo), 0), 1) : 1
  }
  return { j, u }
}

/** The normal equations `AᵀWA` (with a 1e-9 ridge on its diagonal) and `AᵀWc` of the hat basis over `m` nodes. */
function normalEquations(
  cols: Float64Array,
  basis: { j: Int32Array; u: Float64Array },
  weight: Float64Array,
  m: number,
): { a: number[][]; b: number[][] } {
  const diag = [0, 0, 0, 0]
  // off[j] couples nodes j − 1 and j.
  const off = [0, 0, 0, 0]
  const b = zeroRhs()
  for (let i = 0; i < weight.length; i++) {
    const j = basis.j[i]
    const u = basis.u[i]
    const wt = weight[i]
    const w0 = 1 - u
    const w1 = u
    diag[j - 1] += wt * w0 * w0
    off[j] += wt * w0 * w1
    diag[j] += wt * w1 * w1
    for (let k = 0; k < 3; k++) {
      b[j - 1][k] += wt * w0 * cols[3 * i + k]
      b[j][k] += wt * w1 * cols[3 * i + k]
    }
  }
  const a = zeroMat()
  for (let i = 0; i < m; i++) {
    a[i][i] = diag[i] + 1e-9
    if (i > 0) a[i][i - 1] = off[i]
    if (i + 1 < m) a[i][i + 1] = off[i + 1]
  }
  return { a, b }
}

/** Euclidean distance of color `c` (index `i`, three per entry) from the lerp of node colors `a`, `b` at `u`. */
function residual(
  c: Float64Array,
  i: number,
  a: readonly number[],
  b: readonly number[],
  u: number,
): number {
  let s = 0
  for (let k = 0; k < 3; k++) {
    const d = c[3 * i + k] - (a[k] + (b[k] - a[k]) * u)
    s += d * d
  }
  return Math.sqrt(s)
}

/**
 * Robust least squares of a piecewise-linear color profile in `t` with nodes at
 * `0, knots.., 1`: the Huber objective (`r²` within `delta`, `δ(2r − δ)` beyond)
 * and the color at each node. Each round solves the weighted normal equations;
 * after the first, every weight is reset by the Huber rule (`1` within `δ`, else
 * `δ/r`), `rounds` extra rounds. `knots` ascending inside `(0, 1)`. Null when the
 * solve meets a pivot below 1e-12.
 */
export function fitPiecewise(
  cols: Float64Array,
  t: Float64Array,
  knots: readonly number[],
  weight0: Float64Array,
  delta: number,
  rounds: number,
): { objective: number; x: number[][] } | null {
  const nodes = [0, ...knots, 1]
  const m = nodes.length
  const basis = hatBasis(t, nodes)
  let weight = weight0
  let x: number[][] = []
  for (let round = 0; round <= rounds; round++) {
    if (round > 0) {
      if (weight === weight0) weight = new Float64Array(weight0.length)
      for (let i = 0; i < t.length; i++) {
        const j = basis.j[i]
        const r = residual(cols, i, x[j - 1], x[j], basis.u[i])
        weight[i] = r > delta ? delta / r : 1
      }
    }
    const { a, b } = normalEquations(cols, basis, weight, m)
    const solved = solveSmall(a, b, m)
    if (solved === null) return null
    x = solved
  }
  let objective = 0
  for (let i = 0; i < t.length; i++) {
    const j = basis.j[i]
    const r = residual(cols, i, x[j - 1], x[j], basis.u[i])
    objective += r > delta ? delta * (2 * r - delta) : r * r
  }
  return { objective, x }
}

/**
 * The fixed data of one stop search: the strided subsample, each sample's
 * gradient coordinate and color, the Huber threshold and starting weights, and
 * the range new knots may take.
 */
export class StopProblem {
  readonly s: Samples
  /** Indices into `s` of the strided subsample. */
  readonly idx: Int32Array
  readonly t: Float64Array
  /** Subsample colors in the fitting space, three per sample. */
  readonly c: Float64Array
  readonly weight: Float64Array
  readonly delta: number
  /** Width of the 2–98 % quantile range of `t`. */
  readonly span: number
  readonly kLo: number
  readonly kHi: number

  private constructor(
    s: Samples,
    idx: Int32Array,
    t: Float64Array,
    c: Float64Array,
    weight: Float64Array,
    delta: number,
    span: number,
    kLo: number,
    kHi: number,
  ) {
    this.s = s
    this.idx = idx
    this.t = t
    this.c = c
    this.weight = weight
    this.delta = delta
    this.span = span
    this.kLo = kLo
    this.kHi = kHi
  }

  /**
   * The search for `model`'s samples: the Huber threshold is
   * `δ = max(3 · 1.4826 · median_i r_i, 1/255)` over each sample's color distance
   * `r_i` to the two-stop parent (in the fitting space), and samples beyond it
   * start down-weighted as `δ/r_i`; knots are confined to the central 90 % of the
   * 2–98 % quantile range of `t`. Null below `4·MIN_GRADIENT_PIXELS` subsamples
   * or when that range is under 0.1.
   */
  static of(model: FillModel, s: Samples, cols: Float64Array, space: Interp): StopProblem | null {
    const n = s.n
    const stride = fitStride(n)
    const count = n > 0 ? Math.ceil(n / stride) : 0
    if (count < 4 * MIN_GRADIENT_PIXELS) return null
    const idx = new Int32Array(count)
    for (let j = 0; j < count; j++) idx[j] = j * stride
    const parent = new FillEval(model)
    const t = new Float64Array(count)
    const c = new Float64Array(3 * count)
    const parentR = new Float64Array(count)
    const p = [0, 0, 0]
    for (let j = 0; j < count; j++) {
      const i = idx[j]
      t[j] = parent.tAt(s.x[i], s.y[i])
      c[3 * j] = cols[3 * i]
      c[3 * j + 1] = cols[3 * i + 1]
      c[3 * j + 2] = cols[3 * i + 2]
      parent.colorAt(s.x[i], s.y[i], p, 0)
      let r2 = 0
      for (let k = 0; k < 3; k++) {
        const q = space === 'linearRgb' ? srgbToLinear32(p[k]) : p[k]
        const d = cols[3 * i + k] - q
        r2 += d * d
      }
      parentR[j] = Math.sqrt(r2)
    }
    const sortedR = parentR.toSorted()
    const delta = Math.max(3 * 1.4826 * sortedR[count >> 1], 1 / 255)
    const weight = new Float64Array(count)
    for (let j = 0; j < count; j++) weight[j] = parentR[j] > delta ? delta / parentR[j] : 1
    const sorted = t.toSorted()
    const q = (f: number): number => sorted[Math.round((count - 1) * f)]
    const qLo = q(0.02)
    const qHi = q(0.98)
    const span = qHi - qLo
    if (span < 0.1) return null
    return new StopProblem(s, idx, t, c, weight, delta, span, qLo + 0.05 * span, qHi - 0.05 * span)
  }

  /**
   * Where one more knot, added to `knots` (offsets on the 1/1000 grid), goes: the
   * offset in `[kLo, kHi]` the binned scan picks. Null when the range holds no
   * grid offset or no offset gives a solvable profile.
   */
  bestKnot(knots: readonly number[]): number | null {
    const steps = OFFSET_STEPS
    const fixed = knots.map((k) => toIndex(Math.round(k * steps)))
    // A whisker of slack so an end of the range that is itself a grid offset counts.
    const lo = toIndex(Math.max(Math.ceil(this.kLo * steps - 1e-9), 1))
    const hi = Math.min(toIndex(Math.floor(this.kHi * steps + 1e-9)), OFFSET_STEPS - 1)
    if (lo > hi) return null
    const j = bestKnot(this.t, this.c, this.weight, this.delta, fixed, lo, hi)
    return j === null ? null : j / steps
  }

  /**
   * Whether the knot `k` (in the ascending `knots`) cuts its segment
   * `[previous knot, next knot]` into a sliver that `cand` fits much worse than
   * the rest: the smaller side, split at `k`, holds under a tenth of the
   * subsamples and its median residual (sRGB distance to the observation)
   * exceeds {@link MAX_SLIVER_MISFIT} times the other side's, floored at 1/255.
   */
  cutsAMisfitSliver(cand: FillModel, knots: readonly number[], k: number): boolean {
    const s = this.s
    const seg = knots.indexOf(k)
    const loT = seg === 0 ? -Infinity : knots[seg - 1]
    const hiT = seg + 1 < knots.length ? knots[seg + 1] : Infinity
    const sides: number[][] = [[], []]
    const ev = new FillEval(cand)
    const p = [0, 0, 0]
    for (let j = 0; j < this.idx.length; j++) {
      const tj = this.t[j]
      if (tj < loT || tj > hiT) continue
      const i = this.idx[j]
      ev.colorAt(s.x[i], s.y[i], p, 0)
      const d0 = fr(p[0] - s.srgb[3 * i])
      const d1 = fr(p[1] - s.srgb[3 * i + 1])
      const d2 = fr(p[2] - s.srgb[3 * i + 2])
      sides[tj >= k ? 1 : 0].push(fr(Math.sqrt(fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2)))))
    }
    const short = sides[1].length < sides[0].length ? 1 : 0
    const sliver = sides[short].length < Math.floor(this.t.length / 10)
    const mShort = median(sides[short])
    const mLong = median(sides[1 - short])
    return sliver && mShort > MAX_SLIVER_MISFIT * Math.max(mLong, 1 / 255)
  }
}

/** The median of `v` (its upper middle element when even); 0 when empty. */
function median(v: readonly number[]): number {
  if (v.length === 0) return 0
  return Float64Array.from(v).toSorted()[v.length >> 1]
}

/** A non-negative integer from a rounded float (Rust's saturating `as usize`). */
function toIndex(v: number): number {
  return v > 0 ? v : 0
}

/**
 * Re-place two greedily found interior stops: each in turn moves to the offset
 * the scan picks with the other held, for {@link REPARTITION_PASSES} passes,
 * unless that lands within 5 % of the `t` span of the other. `knots` stays
 * ascending.
 */
export function repartition(p: StopProblem, knots: number[]): void {
  for (let pass = 0; pass < REPARTITION_PASSES; pass++) {
    for (let i = 0; i < 2; i++) {
      const other = knots[1 - i]
      const k = p.bestKnot([other])
      if (k === null) continue
      if (Math.abs(k - other) < 0.05 * p.span) continue
      knots[i] = k
      knots.sort((a, b) => a - b)
    }
  }
}

/**
 * The candidate `model` with one, then two, interior stops (in that order), its
 * geometry held. Knots are added greedily by the binned scan; a round stops the
 * search, keeping what was found, when no knot gives a solvable profile, a new
 * knot lands within 5 % of the `t` span of an existing one, the IRLS refit
 * ({@link IRLS_ROUNDS}) is singular, or the knot cuts off a misfit sliver. Two
 * knots are re-placed against each other before the refit. Empty below
 * `4·MIN_GRADIENT_PIXELS` subsamples or under 0.1 of `t` span.
 */
export function fitMidStops(
  model: FillModel,
  s: Samples,
  cols: Float64Array,
  space: Interp,
): FillModel[] {
  const p = StopProblem.of(model, s, cols, space)
  if (p === null) return []
  const out: FillModel[] = []
  const knots: number[] = []
  for (let round = 0; round < MAX_MID_STOPS; round++) {
    const k = p.bestKnot(knots)
    if (k === null) break
    if (knots.some((q) => Math.abs(q - k) < 0.05 * p.span)) break
    knots.push(k)
    knots.sort((a, b) => a - b)
    if (knots.length === 2) repartition(p, knots)
    const fit = fitPiecewise(p.c, p.t, knots, p.weight, p.delta, IRLS_ROUNDS)
    if (fit === null) break
    const x = fit.x
    const m = x.length
    const mids: Stop[] = knots.map((offset, i) => ({ offset, color: fromSpace(x[i + 1], space) }))
    const cand = withStops(model, fromSpace(x[0], space), mids, fromSpace(x[m - 1], space))
    const moved = knots.length === 2 ? knots.slice() : [k]
    if (moved.some((q) => p.cutsAMisfitSliver(cand, knots, q))) break
    out.push(cand)
  }
  return out
}
