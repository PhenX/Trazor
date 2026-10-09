/**
 * Where a gradient's interior stops go: an exact scan of every stop offset the
 * SVG carries (multiples of 1/1000), on weighted moments binned by the gradient
 * coordinate, alternated with Huber reweighting.
 *
 * With the ramp's geometry fixed every sample has a coordinate `t`, and a stop
 * is the join of a continuous piecewise-linear profile in `t`: a segmented
 * regression with an unknown join. Every entry of the hat basis's normal
 * equations on a piece `[τa, τb]` is a quadratic in `t`, so the per-bin sums
 * `Σw, Σwt, Σwt², Σwy, Σwty, Σw|y|²` (prefix-summed) price any set of grid knots
 * in O(1), and all ≤ 999 offsets are priced exactly. The scan minimizes a
 * weighted square that majorizes the Huber loss at the current fit, so the
 * search alternates the scan with a reweighting (the majorize–minimize reading
 * of IRLS).
 *
 * Method from: D. J. Hudson (1966), Fitting segmented curves whose join points
 * have to be estimated, JASA 61(316), doi:10.1080/01621459.1966.10482198; J. Bai,
 * P. Perron (2003), Computation and analysis of multiple structural change
 * models, J. Applied Econometrics 18(1), doi:10.1002/jae.659; S. Chakraborty et
 * al. (2025), Image Vectorization via Gradient Reconstruction, Computer Graphics
 * Forum 44(2), doi:10.1111/cgf.70055; G. Lecot, B. Lévy (2006), Ardeco, EGSR
 * (pre-integrated moments); P. J. Huber (1964), doi:10.1214/aoms/1177703732;
 * P. W. Holland, R. E. Welsch (1977), doi:10.1080/03610927708827533 (IRLS);
 * D. R. Hunter, K. Lange (2004), doi:10.1198/0003130042836 (MM algorithms).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/stops/knots.rs`
 * (`OFFSET_STEPS`, `MM_ROUNDS`, `BinnedProfile`, `bin_of`, `tau`, `huber_weights`,
 * `best_knot`) and `gradient/stops.rs` (`solve_small`, `MAX_NODES`).
 */

/** Stop offsets are written with three decimals: a knot is a multiple of `1 / OFFSET_STEPS`. */
export const OFFSET_STEPS = 1000

/** Rounds of the majorize–minimize search: the first at the starting weights, each later one at the previous fit's Huber weights. */
export const MM_ROUNDS = 3

/** Most profile nodes: the two end stops and two interior ones. */
export const MAX_NODES = 4

/** Moments per bin: `Σw, Σwt, Σwt²`, `Σwy` and `Σwty` per channel, `Σw|y|²`. */
const MOMENTS = 10

/** Whether `a ≥ b` in IEEE total order on non-negative values (a NaN is the largest). */
function totalGe(a: number, b: number): boolean {
  if (Number.isNaN(a)) return true
  if (Number.isNaN(b)) return false
  return a >= b
}

/**
 * Solve `A·x = b` for three right-hand sides (Gaussian elimination with partial
 * pivoting, the last of equal pivots), reading the leading `n×n` block of `a`
 * and the first `n` rows of `b` (three per row); neither is modified. Null when
 * a pivot is below 1e-12.
 */
export function solveSmall(
  a0: readonly number[][],
  b0: readonly number[][],
  n: number,
): number[][] | null {
  const a = a0.map((row) => row.slice())
  const b = b0.map((row) => row.slice())
  for (let i = 0; i < n; i++) {
    let piv = i
    for (let r = i + 1; r < n; r++) if (totalGe(Math.abs(a[r][i]), Math.abs(a[piv][i]))) piv = r
    if (Math.abs(a[piv][i]) < 1e-12) return null
    const tr = a[i]
    a[i] = a[piv]
    a[piv] = tr
    const tb = b[i]
    b[i] = b[piv]
    b[piv] = tb
    const pivotRow = a[i]
    const pivotB = b[i]
    for (let r = i + 1; r < n; r++) {
      const f = a[r][i] / pivotRow[i]
      if (f === 0) continue
      for (let c = i; c < n; c++) a[r][c] -= f * pivotRow[c]
      for (let k = 0; k < 3; k++) b[r][k] -= f * pivotB[k]
    }
  }
  const x: number[][] = []
  for (let i = 0; i < n; i++) x.push([0, 0, 0])
  for (let i = n - 1; i >= 0; i--) {
    for (let k = 0; k < 3; k++) {
      let s = b[i][k]
      for (let c = i + 1; c < n; c++) s -= a[i][c] * x[c][k]
      x[i][k] = s / a[i][i]
    }
  }
  return x
}

/** An empty `MAX_NODES × MAX_NODES` matrix. */
export function zeroMat(): number[][] {
  const a: number[][] = []
  for (let i = 0; i < MAX_NODES; i++) a.push([0, 0, 0, 0])
  return a
}

/** An empty `MAX_NODES × 3` right-hand side. */
export function zeroRhs(): number[][] {
  const b: number[][] = []
  for (let i = 0; i < MAX_NODES; i++) b.push([0, 0, 0])
  return b
}

/** The bin of a gradient coordinate `t ∈ [0, 1]`: `⌊1000·t⌋`, `t = 1` in bin 1000; anything else clamped to an end bin. */
export function binOf(t: number): number {
  const v = t * OFFSET_STEPS
  const b = v > 0 ? Math.floor(v) : 0
  return b < OFFSET_STEPS ? b : OFFSET_STEPS
}

/** The offset of grid position `j` (the end sentinel `OFFSET_STEPS + 1` is `t = 1`). */
export function tau(j: number): number {
  return Math.min(j, OFFSET_STEPS) / OFFSET_STEPS
}

/** The weighted least-squares profile through one candidate knot. */
export interface KnotFit {
  /** The new knot's grid position. */
  j: number
  /** Every node, ascending, as grid positions (ends included). */
  nodes: number[]
  /** The color at each node. */
  x: number[][]
}

/** The weighted moments of a stop problem's samples per offset bin, as prefix sums, centered on the weighted mean color. */
export class BinnedProfile {
  /** `prefix[j·10 + k]` sums moment `k` of the bins below `j`, `j = 0 ..= OFFSET_STEPS + 1`. */
  private readonly prefix: Float64Array
  private readonly mean: [number, number, number]

  /** Bin samples `(t_i, c_i)` (colors three per sample) with weights `w_i`; `t` in `[0, 1]`. */
  constructor(t: Float64Array, c: Float64Array, w: Float64Array) {
    const n = t.length
    let sw = 0
    const swy = [0, 0, 0]
    for (let i = 0; i < n; i++) {
      const wi = w[i]
      sw += wi
      for (let k = 0; k < 3; k++) swy[k] += wi * c[3 * i + k]
    }
    this.mean = sw > 0 ? [swy[0] / sw, swy[1] / sw, swy[2] / sw] : [0, 0, 0]
    const bins = new Float64Array((OFFSET_STEPS + 1) * MOMENTS)
    for (let i = 0; i < n; i++) {
      const ti = t[i]
      const wi = w[i]
      const o = binOf(ti) * MOMENTS
      const y0 = c[3 * i] - this.mean[0]
      const y1 = c[3 * i + 1] - this.mean[1]
      const y2 = c[3 * i + 2] - this.mean[2]
      bins[o] += wi
      bins[o + 1] += wi * ti
      bins[o + 2] += wi * ti * ti
      bins[o + 3] += wi * y0
      bins[o + 4] += wi * y1
      bins[o + 5] += wi * y2
      bins[o + 6] += wi * ti * y0
      bins[o + 7] += wi * ti * y1
      bins[o + 8] += wi * ti * y2
      bins[o + 9] += wi * (y0 * y0 + y1 * y1 + y2 * y2)
    }
    const prefix = new Float64Array((OFFSET_STEPS + 2) * MOMENTS)
    for (let j = 0; j <= OFFSET_STEPS; j++) {
      for (let k = 0; k < MOMENTS; k++) {
        prefix[(j + 1) * MOMENTS + k] = prefix[j * MOMENTS + k] + bins[j * MOMENTS + k]
      }
    }
    this.prefix = prefix
  }

  /**
   * The weighted least-squares profile with nodes at grid positions `nodes`
   * (ascending, first 0, last `OFFSET_STEPS + 1`): its weighted sum of squared
   * residuals and node colors. On a piece of length `L` with sums
   * `S0, S1, S2, Y0, Y1`: `Σw(1−u)² = (τb²S0 − 2τbS1 + S2)/L²`,
   * `Σwu(1−u) = ((τa+τb)S1 − τaτbS0 − S2)/L²`, `Σwu² = (τa²S0 − 2τaS1 + S2)/L²`,
   * `Σw(1−u)y = (τbY0 − Y1)/L`, `Σwuy = (Y1 − τaY0)/L`; a 1e-9 ridge, and the
   * residual `Σw|y|² − Σ x·b`. Null when singular or not finite.
   */
  solve(nodes: readonly number[]): { sse: number; x: number[][] } | null {
    const m = nodes.length
    const a = zeroMat()
    const b = zeroRhs()
    const pre = this.prefix
    const s = new Float64Array(MOMENTS)
    for (let i = 0; i < m - 1; i++) {
      const lo = nodes[i] * MOMENTS
      const hi = nodes[i + 1] * MOMENTS
      for (let k = 0; k < MOMENTS; k++) s[k] = pre[hi + k] - pre[lo + k]
      const ta = tau(nodes[i])
      const tb = tau(nodes[i + 1])
      const l = tb - ta
      const l2 = l * l
      a[i][i] += (tb * tb * s[0] - 2 * tb * s[1] + s[2]) / l2
      const off = ((ta + tb) * s[1] - ta * tb * s[0] - s[2]) / l2
      a[i][i + 1] += off
      a[i + 1][i] += off
      a[i + 1][i + 1] += (ta * ta * s[0] - 2 * ta * s[1] + s[2]) / l2
      for (let k = 0; k < 3; k++) {
        b[i][k] += (tb * s[3 + k] - s[6 + k]) / l
        b[i + 1][k] += (s[6 + k] - ta * s[3 + k]) / l
      }
    }
    for (let i = 0; i < m; i++) a[i][i] += 1e-9
    const x = solveSmall(a, b, m)
    if (x === null) return null
    let explained = 0
    for (let i = 0; i < m; i++)
      explained += x[i][0] * b[i][0] + x[i][1] * b[i][1] + x[i][2] * b[i][2]
    const sse = pre[(OFFSET_STEPS + 1) * MOMENTS + 9] - explained
    if (!Number.isFinite(sse)) return null
    const colors = x.map((v) => [v[0] + this.mean[0], v[1] + this.mean[1], v[2] + this.mean[2]])
    return { sse, x: colors }
  }

  /**
   * The grid position in `lo ..= hi`, not in `fixed`, whose knot added to `fixed`
   * leaves the least weighted sum of squares, with that fit; the lowest position
   * on a tie. Null when every candidate is singular or none remains.
   */
  scan(fixed: readonly number[], lo: number, hi: number): KnotFit | null {
    let best: KnotFit | null = null
    let bestSse = 0
    for (let j = lo; j <= hi; j++) {
      if (fixed.includes(j)) continue
      const nodes = [0, ...fixed, j, OFFSET_STEPS + 1].toSorted((p, q) => p - q)
      const fit = this.solve(nodes)
      if (fit === null) continue
      if (best === null || fit.sse < bestSse) {
        best = { j, nodes, x: fit.x }
        bestSse = fit.sse
      }
    }
    return best
  }
}

/**
 * The Huber weights `min(1, δ/r_i)` of the profile with nodes at grid positions
 * `nodes` and colors `x`, `r_i` each sample's Euclidean color residual.
 */
function huberWeights(
  t: Float64Array,
  c: Float64Array,
  nodes: readonly number[],
  x: readonly number[][],
  delta: number,
): Float64Array {
  const taus = nodes.map(tau)
  const m = taus.length
  const out = new Float64Array(t.length)
  for (let i = 0; i < t.length; i++) {
    const ti = t[i]
    let j = 0
    while (j < m && taus[j] < ti) j++
    j = Math.min(Math.max(j, 1), m - 1)
    const lo = taus[j - 1]
    const hi = taus[j]
    const u = hi > lo ? Math.min(Math.max((ti - lo) / (hi - lo), 0), 1) : 1
    let r2 = 0
    for (let k = 0; k < 3; k++) {
      const d = c[3 * i + k] - (x[j - 1][k] + (x[j][k] - x[j - 1][k]) * u)
      r2 += d * d
    }
    const r = Math.sqrt(r2)
    out[i] = r > delta ? delta / r : 1
  }
  return out
}

/**
 * The best grid position for one more knot given the knots already placed
 * (`fixed`, grid positions) and the range `lo ..= hi` a knot may take:
 * {@link MM_ROUNDS} exact scans from the weights `w0`, each later scan weighted
 * by the Huber weights (threshold `delta`) of the previous fit. Null when the
 * first scan finds no solvable knot.
 */
export function bestKnot(
  t: Float64Array,
  c: Float64Array,
  w0: Float64Array,
  delta: number,
  fixed: readonly number[],
  lo: number,
  hi: number,
): number | null {
  let w = w0
  let best: number | null = null
  for (let round = 0; round < MM_ROUNDS; round++) {
    const fit = new BinnedProfile(t, c, w).scan(fixed, lo, hi)
    if (fit === null) break
    best = fit.j
    if (round + 1 < MM_ROUNDS) w = huberWeights(t, c, fit.nodes, fit.x, delta)
  }
  return best
}
