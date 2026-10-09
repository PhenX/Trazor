/**
 * Cubic Béziers fitted to a span `i..j` of a measured polyline with per-point
 * σ: the G1 cubic with given end tangents and free arm lengths, its residual,
 * the free-tangent least-squares cubic, the arm polish, and the wobble charge.
 *
 * Under G1 constraints (endpoints and end directions fixed) a cubic has two free
 * numbers, its arm lengths `d0`, `d1` as fractions of the chord. Matching the
 * span's signed area fixes one relation between them, matching its first moment
 * a second, and together they reduce to one quartic in `d0` solved in closed
 * form: Levien (2021), "Fitting cubic Bézier curves", raphlinus.github.io, as
 * kurbo `fit::cubic_fit` states the coefficients. Area and moments of a polyline
 * are Green's-theorem sums of per-edge terms ({@link edgeTerms}), so they are
 * prefix-summable and a span's cubic costs O(1) before its residual. The
 * residual projects at most {@link MAX_RESIDUAL_SAMPLES} interior points onto the
 * curve by Gauss–Newton, from each point's chord-length parameter.
 *
 * Inputs are interleaved points `x0, y0, x1, y1, …` (px), their σ (px) and
 * cumulative arc lengths `s` (px, `arcLengths`). The fit is translation
 * invariant; callers centre the points so the moment sums stay well conditioned.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/candidates.rs` (`edge_terms`,
 * `raw_moments_direct`, `g1_frame`, `arms_from_moments`, `Cubic`,
 * `CubicSamples`, `chi2_cubic`, `free_cubic`, `best_cubic`, `fit_cubic_moments`,
 * the wobble penalty) and `multimodel.rs` (`polish_arms`).
 */
import type { Bezier, Vec } from './curves'
import { factorQuarticInner, fmax, solveCubic, solveQuadratic } from './roots'

/** Most interior points a cubic's residual is evaluated on. */
export const MAX_RESIDUAL_SAMPLES = 32

/** Gauss–Newton steps when projecting a point onto a cubic. */
export const NEWTON_STEPS = 3

/** Longest control arm, as a fraction of the chord: a longer one describes more than a half turn. */
export const MAX_ARM = 1

/** How far, in degrees, a free cubic's end direction may swing from the estimated tangent. */
export const FREE_MAX_SWING = 75

/** Scale of the {@link wobblePenalty}: 1 is the shipped weight. */
export const WOBBLE_PENALTY = 1

/**
 * Green's-theorem contributions of the straight edge `a → b`, into `out`:
 * `∫ y dx = dx·(a.y + dy/2)`, `∫ x·y dx = dx·(a.x·a.y + (a.x·dy + a.y·dx)/2 + dx·dy/3)`,
 * `∫ y² dx = dx·(a.y² + a.y·dy + dy²/3)`. Summed round a loop they give its area
 * and first moments.
 */
export function edgeTerms(ax: number, ay: number, bx: number, by: number, out: Float64Array) {
  const dx = bx - ax
  const dy = by - ay
  out[0] = dx * (ay + 0.5 * dy)
  out[1] = dx * (ax * ay + 0.5 * (ax * dy + ay * dx) + (dx * dy) / 3)
  out[2] = dx * (ay * ay + ay * dy + (dy * dy) / 3)
}

/**
 * `(∫ y dx, ∫ x·y dx, ∫ y² dx)` along the points from `i` to `j`, summed edge by
 * edge into `out`: the O(j − i) version of a prefix-sum difference.
 */
export function rawMomentsDirect(pts: Float64Array, i: number, j: number, out: Float64Array) {
  const e = new Float64Array(3)
  let a = 0
  let x = 0
  let y = 0
  for (let k = i; k < j; k++) {
    edgeTerms(pts[2 * k], pts[2 * k + 1], pts[2 * k + 2], pts[2 * k + 3], e)
    a += e[0]
    x += e[1]
    y += e[2]
  }
  out[0] = a
  out[1] = x
  out[2] = y
}

/** Rust's `f64::round`: halves away from zero. */
function roundHalfAway(x: number): number {
  return x < 0 ? -Math.round(-x) : Math.round(x)
}

/** An angle wrapped into `[−π, π]` by subtracting the nearest whole turn. */
function mod2pi(th: number): number {
  const scaled = th * (1 / Math.PI) * 0.5
  return 2 * Math.PI * (scaled - roundHalfAway(scaled))
}

/** A span in the frame Levien's quartic is stated in: unit chord on the x-axis. */
export interface G1Frame {
  /** Angle of the start tangent from the chord, radians in `[−π, π]`. */
  th0: number
  /** Angle of the chord from the end tangent, radians in `[−π, π]`. */
  th1: number
  /** Signed area between the points and the chord, over chord². */
  area: number
  /** First moment of that region along the chord, over chord⁴. */
  mx: number
  /** Chord length, px. */
  chord: number
}

/**
 * Reduce raw path integrals (`raw` = `∫ y dx, ∫ x·y dx, ∫ y² dx` along the points
 * from `(p0x, p0y)` to `(p1x, p1y)`) to the unit-chord frame: subtract the same
 * integrals along the chord, closing the path into a loop; move the origin to
 * `p0` (round a loop `∮ dx = ∮ x dx = 0`, so `X' = X − x0·A`, `½Y' = ½Y − y0·A`);
 * take the first moment along the chord, `M = dx·X' + dy·½Y'`; and scale area by
 * chord² and `M` by chord⁴. Null for a zero-length or non-finite chord. Only the
 * tangents' angles are used.
 */
export function g1Frame(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  t0: Vec,
  t1: Vec,
  raw: ArrayLike<number>,
): G1Frame | null {
  const dx = p1x - p0x
  const dy = p1y - p0y
  const chord2 = dx * dx + dy * dy
  if (chord2 < 1e-18 || !Number.isFinite(chord2)) return null
  const th = Math.atan2(dy, dx)
  const th0 = mod2pi(Math.atan2(t0.y, t0.x) - th)
  const th1 = mod2pi(th - Math.atan2(t1.y, t1.x))
  let area = raw[0]
  let x = raw[1]
  let y = raw[2]
  area -= dx * (p0y + 0.5 * dy)
  const dy3 = dy / 3
  x -= dx * (p0x * p0y + 0.5 * (p0x * dy + p0y * dx) + dy3 * dx)
  y -= dx * (p0y * p0y + p0y * dy + dy3 * dy)
  x -= p0x * area
  y = 0.5 * y - p0y * area
  const moment = dx * x + dy * y
  const inv = 1 / chord2
  return { th0, th1, area: area * inv, mx: moment * inv * inv, chord: Math.sqrt(chord2) }
}

/**
 * Arm lengths `(d0, d1)` of the G1 cubics matching signed `area` and x-moment
 * `mx` on a unit chord with end-tangent angles `th0`, `th1`, flattened as
 * `[d0, d1, d0, d1, …]` (at most four pairs). Requiring the area gives
 *
 *     d1 = (d0·sin θ0 − 10/3·area) / (½·d0·sin(θ0 + θ1) − sin θ1)
 *
 * and the moment then leaves a quartic in `d0` (kurbo's coefficients), solved
 * in closed form, falling back to the cubic or quadratic formula when leading
 * coefficients vanish; a quadratic factor with a complex pair contributes its
 * real part. All-zero coefficients give the conventional `(1/3, 1/3)`. A negative
 * `d0` becomes `(0, sin θ0 / sin(θ0+θ1))` and a non-positive `d1`
 * `(sin θ1 / sin(θ0+θ1), 0)`, the nearest cubic with one arm collapsed; pairs
 * still negative or non-finite are dropped.
 */
export function armsFromMoments(th0: number, th1: number, area: number, mx: number): number[] {
  const s0 = Math.sin(th0)
  const c0 = Math.cos(th0)
  const s1 = Math.sin(th1)
  const c1 = Math.cos(th1)
  const a4 =
    -9 * c0 * (((2 * s1 * c1 * c0 + s0 * (2 * c1 * c1 - 1)) * c0 - 2 * s1 * c1) * c0 - c1 * c1 * s0)
  const a3 =
    12 *
    ((((c1 * (30 * area * c1 - s1) - 15 * area) * c0 + 2 * s0 - c1 * s0 * (c1 + 30 * area * s1)) *
      c0 +
      c1 * (s1 - 15 * area * c1)) *
      c0 -
      s0 * c1 * c1)
  const a2 =
    12 *
    ((((70 * mx + 15 * area) * s1 * s1 + c1 * (9 * s1 - 70 * c1 * mx - 5 * c1 * area)) * c0 -
      5 * s0 * s1 * (3 * s1 - 4 * c1 * (7 * mx + area))) *
      c0 -
      c1 * (9 * s1 - 70 * c1 * mx - 5 * c1 * area))
  const a1 =
    16 *
    (((12 * s0 - 5 * c0 * (42 * mx - 17 * area)) * s1 -
      70 * c1 * (3 * mx - area) * s0 -
      75 * c0 * c1 * area * area) *
      s1 -
      75 * c1 * c1 * area * area * s0)
  const a0 = 80 * s1 * (42 * s1 * mx - 25 * area * (s1 - c1 * area))

  const roots: number[] = []
  const push = (r: number) => {
    if (roots.length < 4) roots.push(r)
  }
  const eps = 1e-12
  if (Math.abs(a4) > eps) {
    const quads = factorQuarticInner(a3 / a4, a2 / a4, a1 / a4, a0 / a4, false)
    if (quads) {
      for (let q = 0; q < 2; q++) {
        const qc1 = quads[2 * q]
        const qc0 = quads[2 * q + 1]
        const qroots = solveQuadratic(qc0, qc1, 1)
        if (qroots.length === 0) push(-0.5 * qc1)
        else for (const r of qroots) push(r)
      }
    }
  } else if (Math.abs(a3) > eps) {
    for (const r of solveCubic(a0, a1, a2, a3)) push(r)
  } else if (Math.abs(a2) > eps || Math.abs(a1) > eps || Math.abs(a0) > eps) {
    for (const r of solveQuadratic(a0, a1, a2)) push(r)
  } else {
    return [1 / 3, 1 / 3]
  }

  const out: number[] = []
  const s01 = s0 * c1 + s1 * c0
  for (const root of roots) {
    let d0: number
    let d1: number
    if (root > 0) {
      const v = (root * s0 - area * (10 / 3)) / (0.5 * root * s01 - s1)
      if (v > 0) {
        d0 = root
        d1 = v
      } else {
        d0 = s1 / s01
        d1 = 0
      }
    } else {
      d0 = 0
      d1 = s0 / s01
    }
    if (d0 >= 0 && d1 >= 0 && Number.isFinite(d0) && Number.isFinite(d1) && out.length < 8) {
      out.push(d0, d1)
    }
  }
  return out
}

/**
 * The G1 cubic from `(p0x, p0y)` to `(p3x, p3y)` with arms `d0`, `d1` (fractions
 * of `chord`, px) along the unit directions of travel `t0` (leaving) and `t1`
 * (arriving): `p1 = p0 + d0·chord·t0`, `p2 = p3 − d1·chord·t1`.
 */
export function cubicFromArms(
  p0x: number,
  p0y: number,
  p3x: number,
  p3y: number,
  t0: Vec,
  t1: Vec,
  chord: number,
  d0: number,
  d1: number,
): Bezier {
  return {
    x0: p0x,
    y0: p0y,
    x1: p0x + t0.x * d0 * chord,
    y1: p0y + t0.y * d0 * chord,
    x2: p3x - t1.x * d1 * chord,
    y2: p3y - t1.y * d1 * chord,
    x3: p3x,
    y3: p3y,
  }
}

/** `x` clamped to `[0, 1]`, NaN passing through as Rust's `clamp` does. */
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x
}

/**
 * Squared distance (px²) from `(px, py)` to the cubic, by Gauss–Newton on
 * `(B(t) − p)·B'(t)` from `tInit` (clamped to `[0, 1]`): `t ← clamp(t − (B − p)·B' / |B'|², 0, 1)`
 * for {@link NEWTON_STEPS} steps or until `t` stops moving or `B'` vanishes.
 * Started from the point's chord-length parameter three steps are enough; from a
 * poor start it can land on a local rather than the global nearest point.
 */
export function cubicDist2(b: Bezier, px: number, py: number, tInit: number): number {
  let t = clamp01(tInit)
  for (let step = 0; step < NEWTON_STEPS; step++) {
    const mt = 1 - t
    const w0 = mt * mt * mt
    const w1 = 3 * mt * mt * t
    const w2 = 3 * mt * t * t
    const w3 = t * t * t
    const rx = w0 * b.x0 + w1 * b.x1 + w2 * b.x2 + w3 * b.x3 - px
    const ry = w0 * b.y0 + w1 * b.y1 + w2 * b.y2 + w3 * b.y3 - py
    const v0 = 3 * mt * mt
    const v1 = 6 * mt * t
    const v2 = 3 * t * t
    const dx = v0 * (b.x1 - b.x0) + v1 * (b.x2 - b.x1) + v2 * (b.x3 - b.x2)
    const dy = v0 * (b.y1 - b.y0) + v1 * (b.y2 - b.y1) + v2 * (b.y3 - b.y2)
    const dd = dx * dx + dy * dy
    if (dd < 1e-18) break
    const next = clamp01(t - (rx * dx + ry * dy) / dd)
    if (next === t) break
    t = next
  }
  const mt = 1 - t
  const w0 = mt * mt * mt
  const w1 = 3 * mt * mt * t
  const w2 = 3 * mt * t * t
  const w3 = t * t * t
  const rx = w0 * b.x0 + w1 * b.x1 + w2 * b.x2 + w3 * b.x3 - px
  const ry = w0 * b.y0 + w1 * b.y1 + w2 * b.y2 + w3 * b.y3 - py
  return rx * rx + ry * ry
}

/**
 * Whether the control polygon turns both ways: the cross products
 * `(p1 − p0) × (p2 − p1)` and `(p2 − p1) × (p3 − p2)` have opposite signs beyond
 * `1e-6·max(chord², 1)` px². Cheap and catches S-bends; not an exact inflection test.
 */
export function hasInflection(b: Bezier): boolean {
  const d0x = b.x1 - b.x0
  const d0y = b.y1 - b.y0
  const d1x = b.x2 - b.x1
  const d1y = b.y2 - b.y1
  const d2x = b.x3 - b.x2
  const d2y = b.y3 - b.y2
  const cross0 = d0x * d1y - d0y * d1x
  const cross1 = d1x * d2y - d1y * d2x
  const chord2 = (b.x3 - b.x0) ** 2 + (b.y3 - b.y0) ** 2
  return cross0 * cross1 < -1e-6 * Math.max(chord2, 1)
}

/**
 * Scale-free bending energy `12(|A|² + A·B + |B|²) / L²` with `A = p2 − 2p1 + p0`,
 * `B = p3 − 2p2 + p1` and `L` the chord: `∫₀¹ |B''(t)|² dt` over the squared
 * chord. 0 for a chord under 1e-6 px.
 */
export function bendingEnergy(b: Bezier): number {
  const chord2 = (b.x3 - b.x0) ** 2 + (b.y3 - b.y0) ** 2
  if (chord2 <= 1e-12) return 0
  const ax = b.x2 - 2 * b.x1 + b.x0
  const ay = b.y2 - 2 * b.y1 + b.y0
  const bx = b.x3 - 2 * b.x2 + b.x1
  const by = b.y3 - 2 * b.y2 + b.y1
  const aa = ax * ax + ay * ay
  const ab = ax * bx + ay * by
  const bb = bx * bx + by * by
  return (12 * (aa + ab + bb)) / chord2
}

/**
 * Nats charged against a wobbly cubic, which the residual cannot see because it
 * passes through noisy points as well as a smooth one:
 * `f·λ·(2·[inflection] + ½·min(10, max(0, E − 2.5)))` with `f` = {@link WOBBLE_PENALTY}
 * and `E` the {@link bendingEnergy}. A gentle arc pays nothing; an S-bend two parameters.
 */
export function wobblePenalty(b: Bezier, lambda: number): number {
  const factor = WOBBLE_PENALTY
  let penalty = 0
  if (hasInflection(b)) penalty += 2 * lambda * factor
  const ebend = bendingEnergy(b)
  if (ebend > 2.5) penalty += Math.min(ebend - 2.5, 10) * lambda * factor * 0.5
  return penalty
}

/** Index of residual sample `m` of `count` among the `interior` points after `i`. */
function sampleIndex(i: number, j: number, m: number, interior: number, count: number): number {
  return Math.min(i + 1 + Math.floor(((m + 0.5) * interior) / count), j - 1)
}

/**
 * The interior points of a span a cubic's residual is scored on, gathered once
 * per span: at most {@link MAX_RESIDUAL_SAMPLES}, evenly spaced by index (sample
 * `m` of `count` is point `i + 1 + floor((m + ½)·interior / count)`), each with its
 * chord-length parameter and σ² (σ floored at 1e-6), and `weight = interior / count`
 * so the weighted sum estimates the residual over all of them.
 */
export class CubicSamples {
  readonly px = new Float64Array(MAX_RESIDUAL_SAMPLES)
  readonly py = new Float64Array(MAX_RESIDUAL_SAMPLES)
  /** Each sample's chord-length parameter, Newton's start. */
  readonly t = new Float64Array(MAX_RESIDUAL_SAMPLES)
  /** Each sample's σ², px². */
  readonly s2 = new Float64Array(MAX_RESIDUAL_SAMPLES)
  len = 0
  weight = 1

  /** The samples of span `(i, j)`, or null when it has no interior point. */
  static of(
    pts: Float64Array,
    sigma: ArrayLike<number>,
    s: ArrayLike<number>,
    i: number,
    j: number,
  ): CubicSamples | null {
    const out = new CubicSamples()
    return out.fill(pts, sigma, s, i, j) ? out : null
  }

  /** Gather the samples of span `(i, j)` into this instance; false when it has no interior point. */
  fill(pts: Float64Array, sigma: ArrayLike<number>, s: ArrayLike<number>, i: number, j: number) {
    const interior = Math.max(j - i - 1, 0)
    if (interior === 0) return false
    const count = Math.min(interior, MAX_RESIDUAL_SAMPLES)
    const span = Math.max(s[j] - s[i], 1e-12)
    this.len = count
    this.weight = interior / count
    for (let m = 0; m < count; m++) {
      const k = sampleIndex(i, j, m, interior, count)
      const sg = fmax(sigma[k], 1e-6)
      this.px[m] = pts[2 * k]
      this.py[m] = pts[2 * k + 1]
      this.t[m] = (s[k] - s[i]) / span
      this.s2[m] = sg * sg
    }
    return true
  }

  /**
   * The weighted residual against `b`, summed in sample order; returned as soon
   * as the partial sum reaches `bound` (a candidate that can no longer win).
   */
  chi2(b: Bezier, bound: number): number {
    let acc = 0
    for (let m = 0; m < this.len; m++) {
      acc += (this.weight * cubicDist2(b, this.px[m], this.py[m], this.t[m])) / this.s2[m]
      if (acc >= bound) return acc
    }
    return acc
  }
}

/**
 * Weighted residual of the interior points of `(i, j)` against a cubic,
 * `χ² = weight·Σ d²/σ²` with `d` the {@link cubicDist2} projection from each
 * point's chord-length parameter. With `subsample` the points are thinned to
 * {@link MAX_RESIDUAL_SAMPLES} as in {@link CubicSamples}; without, every interior
 * point counts once. The ends are not scored: the cubic passes through them. 0
 * for a span without interior points.
 */
export function chi2Cubic(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  s: ArrayLike<number>,
  i: number,
  j: number,
  b: Bezier,
  subsample: boolean,
): number {
  const interior = Math.max(j - i - 1, 0)
  if (interior === 0) return 0
  const count = subsample ? Math.min(interior, MAX_RESIDUAL_SAMPLES) : interior
  const weight = interior / count
  const span = Math.max(s[j] - s[i], 1e-12)
  let acc = 0
  for (let m = 0; m < count; m++) {
    const k = sampleIndex(i, j, m, interior, count)
    const sg = fmax(sigma[k], 1e-6)
    const d2 = cubicDist2(b, pts[2 * k], pts[2 * k + 1], (s[k] - s[i]) / span)
    acc += (weight * d2) / (sg * sg)
  }
  return acc
}

/** The sample buffer {@link bestCubic} gathers a span into. */
const spanSamples = new CubicSamples()

/** A G1 cubic fitted to a span: its residual and arms (fractions of the chord). */
export interface G1Fit {
  chi2: number
  d0: number
  d1: number
}

/**
 * The best G1 cubic for `(i, j)`: endpoints the measured points `i` and `j`,
 * directions the unit tangents `t0` (leaving `i`) and `t1` (arriving at `j`), arms
 * chosen among the real roots of Levien's quartic ({@link armsFromMoments}) with
 * both arms at most {@link MAX_ARM}, scored by {@link chi2Cubic}; the lowest
 * residual wins (the first on a tie). `raw` is `(∫ y dx, ∫ x·y dx, ∫ y² dx)` along
 * the points from `i` to `j`. With `subsample`, scoring stops early once a root
 * can no longer beat the best. Null for a zero-length chord or when no root is
 * admissible, which does not mean no cubic fits.
 */
export function bestCubic(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  s: ArrayLike<number>,
  i: number,
  j: number,
  t0: Vec,
  t1: Vec,
  raw: ArrayLike<number>,
  subsample: boolean,
): G1Fit | null {
  const p0x = pts[2 * i]
  const p0y = pts[2 * i + 1]
  const p3x = pts[2 * j]
  const p3y = pts[2 * j + 1]
  const fr = g1Frame(p0x, p0y, p3x, p3y, t0, t1, raw)
  if (!fr) return null
  const plan = subsample && spanSamples.fill(pts, sigma, s, i, j) ? spanSamples : null
  const arms = armsFromMoments(fr.th0, fr.th1, fr.area, fr.mx)
  let best: G1Fit | null = null
  for (let q = 0; q < arms.length; q += 2) {
    const d0 = arms[q]
    const d1 = arms[q + 1]
    if (d0 > MAX_ARM || d1 > MAX_ARM) continue
    const b = cubicFromArms(p0x, p0y, p3x, p3y, t0, t1, fr.chord, d0, d1)
    const bound: number = best ? best.chi2 : Infinity
    const chi2: number = plan ? plan.chi2(b, bound) : chi2Cubic(pts, sigma, s, i, j, b, subsample)
    if (best === null || chi2 < best.chi2) best = { chi2, d0, d1 }
  }
  return best
}

/**
 * Every G1 cubic matching the area and first moment of the whole run `pts`
 * (interleaved) with end directions `t0`, `t1`, in the quartic's order.
 */
export function fitCubicMoments(pts: Float64Array, t0: Vec, t1: Vec): Bezier[] {
  const n = pts.length >> 1
  if (n < 2) return []
  const raw = new Float64Array(3)
  rawMomentsDirect(pts, 0, n - 1, raw)
  const p0x = pts[0]
  const p0y = pts[1]
  const p3x = pts[2 * n - 2]
  const p3y = pts[2 * n - 1]
  const fr = g1Frame(p0x, p0y, p3x, p3y, t0, t1, raw)
  if (!fr) return []
  const arms = armsFromMoments(fr.th0, fr.th1, fr.area, fr.mx)
  const out: Bezier[] = []
  for (let q = 0; q < arms.length; q += 2) {
    out.push(cubicFromArms(p0x, p0y, p3x, p3y, t0, t1, fr.chord, arms[q], arms[q + 1]))
  }
  return out
}

/** Control points of a cubic whose ends are fixed elsewhere. */
export interface Controls {
  x1: number
  y1: number
  x2: number
  y2: number
}

/**
 * Control points of the least-squares cubic through the points `i..j`, its ends
 * pinned to points `i` and `j`. Each interior point `k` takes the chord-length
 * parameter `t_k = (s_k − s_i)/(s_j − s_i)`, and `P1`, `P2` minimize
 * `Σ w_k·|p_k − (b0·p0 + b1·P1 + b2·P2 + b3·p3)|²` (`w = 1/σ²`, `b` Bernstein): a
 * 2x2 linear system shared by x and y, solved by Cramer's rule. The first step of
 * Schneider's fit, without its reparametrization. Null for fewer than two
 * interior points, a singular system or a non-finite result.
 */
export function freeCubicFit(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  s: ArrayLike<number>,
  i: number,
  j: number,
): Controls | null {
  if (j < i + 3) return null
  const span = Math.max(s[j] - s[i], 1e-12)
  const p0x = pts[2 * i]
  const p0y = pts[2 * i + 1]
  const p3x = pts[2 * j]
  const p3y = pts[2 * j + 1]
  let a00 = 0
  let a01 = 0
  let a11 = 0
  let bx0 = 0
  let bx1 = 0
  let by0 = 0
  let by1 = 0
  for (let k = i + 1; k < j; k++) {
    const t = Math.min(Math.max((s[k] - s[i]) / span, 0), 1)
    const mt = 1 - t
    const w0 = mt * mt * mt
    const w1 = 3 * mt * mt * t
    const w2 = 3 * mt * t * t
    const w3 = t * t * t
    const w = 1 / (sigma[k] * sigma[k])
    a00 += w * w1 * w1
    a01 += w * w1 * w2
    a11 += w * w2 * w2
    const rx = pts[2 * k] - w0 * p0x - w3 * p3x
    const ry = pts[2 * k + 1] - w0 * p0y - w3 * p3y
    bx0 += w * w1 * rx
    bx1 += w * w2 * rx
    by0 += w * w1 * ry
    by1 += w * w2 * ry
  }
  const det = a00 * a11 - a01 * a01
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null
  const x1 = (a11 * bx0 - a01 * bx1) / det
  const x2 = (a00 * bx1 - a01 * bx0) / det
  const y1 = (a11 * by0 - a01 * by1) / det
  const y2 = (a00 * by1 - a01 * by0) / det
  if (!(Number.isFinite(x1) && Number.isFinite(y1) && Number.isFinite(x2) && Number.isFinite(y2))) {
    return null
  }
  return { x1, y1, x2, y2 }
}

/** An arm held to `[1e-3, 1.5]` chords, NaN passing through. */
function clampArm(a: number): number {
  return a < 1e-3 ? 1e-3 : a > 1.5 ? 1.5 : a
}

/**
 * Minimize the full residual (every interior point, {@link chi2Cubic}) of the G1
 * cubic over `(i, j)` over its two arms, directions `t0`, `t1` fixed, from
 * `(d0, d1)`. Newton with finite differences (`h = 1e-3`):
 *
 *     g   = ((f(d0+h,d1) − f(d0−h,d1)) / 2h, (f(d0,d1+h) − f(d0,d1−h)) / 2h)
 *     H00 = (f(d0+h,d1) − 2f + f(d0−h,d1)) / h²,   H11 likewise,
 *     H01 = (f(d0+h,d1+h) − f(d0+h,d1) − f(d0,d1+h) + f) / h²
 *
 * stepping `−H⁻¹g` when `H` is positive definite and 0.05 along `−g` otherwise,
 * halved from 1 down to 1e-4 until `f` decreases; at most 12 iterations, stopping
 * when the relative gain falls under 1e-9. Arms stay in `[1e-3, 1.5]` throughout.
 * Returns the arms and their residual.
 */
export function polishArms(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  s: ArrayLike<number>,
  i: number,
  j: number,
  t0: Vec,
  t1: Vec,
  d0Start: number,
  d1Start: number,
): G1Fit {
  const p0x = pts[2 * i]
  const p0y = pts[2 * i + 1]
  const p3x = pts[2 * j]
  const p3y = pts[2 * j + 1]
  const chord = Math.hypot(p0x - p3x, p0y - p3y)
  const f = (a: number, b: number) =>
    chi2Cubic(pts, sigma, s, i, j, cubicFromArms(p0x, p0y, p3x, p3y, t0, t1, chord, a, b), false)
  let d0 = clampArm(d0Start)
  let d1 = clampArm(d1Start)
  let cur = f(d0, d1)
  const h = 1e-3
  for (let it = 0; it < 12; it++) {
    const fp0 = f(d0 + h, d1)
    const fm0 = f(d0 - h, d1)
    const fp1 = f(d0, d1 + h)
    const fm1 = f(d0, d1 - h)
    const fpp = f(d0 + h, d1 + h)
    const g0 = (fp0 - fm0) / (2 * h)
    const g1 = (fp1 - fm1) / (2 * h)
    const h00 = (fp0 - 2 * cur + fm0) / (h * h)
    const h11 = (fp1 - 2 * cur + fm1) / (h * h)
    const h01 = (fpp - fp0 - fp1 + cur) / (h * h)
    const det = h00 * h11 - h01 * h01
    let step0: number
    let step1: number
    if (h00 > 0 && det > 0) {
      step0 = -(h11 * g0 - h01 * g1) / det
      step1 = -(h00 * g1 - h01 * g0) / det
    } else {
      const gn = fmax(Math.hypot(g0, g1), 1e-12)
      step0 = (-0.05 * g0) / gn
      step1 = (-0.05 * g1) / gn
    }
    let alpha = 1
    let improved = false
    while (alpha > 1e-4) {
      const c0 = clampArm(d0 + alpha * step0)
      const c1 = clampArm(d1 + alpha * step1)
      const v = f(c0, c1)
      if (v < cur) {
        const gain = cur - v
        d0 = c0
        d1 = c1
        cur = v
        improved = gain > 1e-9 * fmax(cur, 1)
        break
      }
      alpha *= 0.5
    }
    if (!improved) break
  }
  return { chi2: cur, d0, d1 }
}
