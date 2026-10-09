/**
 * Seam tests of the band merge: whether the seam between two connected components
 * is a band boundary inside one smooth region, or an edge between two regions.
 *
 * - **Smooth** (region recovery): a seam is smooth when at least half of its
 *   4-neighbor pixel pairs step by less than {@link SMOOTH_STEP} (CIE76, Lab units).
 *   A seam between two bands of one ramp is crossed in steps of the ramp's slope,
 *   a pixel at a time; a seam between two flat regions is crossed in one
 *   anti-aliased pixel, so at least one of the pairs across it steps half the
 *   contrast or more. Across a smooth seam blends are evidence for the union's
 *   fit, and two flat bands whose inks differ by less than {@link RAMP_STEP_DE00}
 *   are tried as one ramp.
 * - **Edge** (always): a seam is an edge when more than half of its pixel pairs
 *   step by more than {@link EDGE_STEP} (OKLab × 100), the discontinuity map of
 *   Chakraborty et al. 2025 §3.2; the band merge never unions across one.
 *
 * Seam counts are per component, a map from each neighboring component to a
 * number of pixel pairs, symmetric (`counts[a].get(b) === counts[b].get(a)`).
 *
 * Every color conversion here is inkvec's single-precision one, so a step on the
 * threshold falls on inkvec's side: the CIELAB of {@link srgbToLab32} (the
 * decoding curve in `f32`, the rest in `f64` with the classic rounded CIE
 * constants, rounded to `f32`) and the OKLab of {@link rgbToOklab32} (`f32`
 * throughout).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/regions.rs` (`RAMP_STEP_DE00`,
 * `SMOOTH_STEP`, `SMOOTH_FRACTION`, `EDGE_STEP`, `smooth_step`, `edge_step`, `is_edge`,
 * `is_smooth`, `absorb_counts`, `all_inside`) and `color.rs` (`rgb_to_oklab`,
 * `srgb_to_lab`, `de00`).
 */

import { ciede2000 } from '@trazor/core'
import { srgbToLinear32 } from './model'

export { partnersInside as allInside } from './evidence'

/**
 * Largest color difference (CIEDE2000) between the inks of two flat adjacent
 * regions for them to be tried as bands of one ramp.
 */
export const RAMP_STEP_DE00 = 15

/** Largest color step (CIE76, Lab units) between two 4-neighboring pixels inside one smooth region. */
export const SMOOTH_STEP = 3

/** Fraction of a seam's pixel pairs that must be smooth steps for the seam to lie inside a region. */
export const SMOOTH_FRACTION = 0.5

/**
 * Color step between two 4-neighboring pixels, OKLab × 100 (about CIELAB units),
 * above which the pair is a discontinuity: the threshold `τ_d` of the
 * discontinuity map in S. Chakraborty et al. (2025), Image Vectorization via
 * Gradient Reconstruction, Computer Graphics Forum 44(2), doi:10.1111/cgf.70055,
 * §3.2, at inkvec's value for 128 px icons (the paper's 10 is for 512–2048 px).
 */
export const EDGE_STEP = 6

/** Per component, a count per neighboring component: seam lengths in pixel pairs. */
export type SeamCounts = Map<number, number>[]

const fr = Math.fround

/** Ottosson's OKLab matrices as single-precision values, row-major. */
const OK_M1 = [
  0.41222147, 0.53633255, 0.051445995, 0.2119035, 0.6806995, 0.10739696, 0.08830246, 0.28171885,
  0.6299787,
].map(fr)
const OK_M2 = [
  0.21045426, 0.7936178, -0.004072047, 1.9779985, -2.4285922, 0.4505937, 0.025904037, 0.78277177,
  -0.80867577,
].map(fr)

/** Row `o` of a single-precision 3×3 matrix times `(x, y, z)`, summed left to right in `f32`. */
function row32(m: readonly number[], o: number, x: number, y: number, z: number): number {
  return fr(fr(fr(m[o] * x) + fr(m[o + 1] * y)) + fr(m[o + 2] * z))
}

/**
 * Encoded sRGB to OKLab (Ottosson 2020) in single precision, written to
 * `out[0..3]`: inkvec's `rgb_to_oklab`.
 */
export function rgbToOklab32(r: number, g: number, b: number, out: Float64Array): void {
  const lr = srgbToLinear32(fr(r))
  const lg = srgbToLinear32(fr(g))
  const lb = srgbToLinear32(fr(b))
  const l = fr(Math.cbrt(row32(OK_M1, 0, lr, lg, lb)))
  const m = fr(Math.cbrt(row32(OK_M1, 3, lr, lg, lb)))
  const s = fr(Math.cbrt(row32(OK_M1, 6, lr, lg, lb)))
  out[0] = row32(OK_M2, 0, l, m, s)
  out[1] = row32(OK_M2, 3, l, m, s)
  out[2] = row32(OK_M2, 6, l, m, s)
}

/** The CIELAB nonlinearity with the classic rounded constants (0.008856, 7.787). */
function labF(t: number): number {
  return t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116
}

/**
 * Encoded sRGB to CIELAB (D65 white) as inkvec computes it, written to
 * `out[0..3]` as `[L*, a*, b*]`: the decoding curve in single precision, the XYZ
 * matrix and the cube root in double, each result rounded to single precision.
 */
export function srgbToLab32(r: number, g: number, b: number, out: Float64Array): void {
  const lr = srgbToLinear32(fr(r))
  const lg = srgbToLinear32(fr(g))
  const lb = srgbToLinear32(fr(b))
  const x = (0.4124564 * lr + 0.3575761 * lg + 0.1804375 * lb) / 0.95047
  const y = 0.2126729 * lr + 0.7151522 * lg + 0.072175 * lb
  const z = (0.0193339 * lr + 0.119192 * lg + 0.9503041 * lb) / 1.08883
  const fx = labF(x)
  const fy = labF(y)
  const fz = labF(z)
  out[0] = fr(116 * fy - 16)
  out[1] = fr(500 * (fx - fy))
  out[2] = fr(200 * (fy - fz))
}

/**
 * CIEDE2000 between two encoded sRGB colors (Sharma, Wu & Dalal 2005), on the
 * CIELAB of {@link srgbToLab32}, rounded to single precision; a radicand rounded
 * below zero reads 0.
 */
export function de00(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  srgbToLab32(r1, g1, b1, LAB_P)
  srgbToLab32(r2, g2, b2, LAB_Q)
  const d = ciede2000(LAB_P[0], LAB_P[1], LAB_P[2], LAB_Q[0], LAB_Q[1], LAB_Q[2])
  return Number.isNaN(d) ? 0 : fr(d)
}

const LAB_P = new Float64Array(3)
const LAB_Q = new Float64Array(3)

/** Squared distance between `LAB_P` and `LAB_Q` (each scaled by `k`), summed in single precision. */
function dist2Scaled32(k: number): number {
  const d0 = fr(fr(LAB_P[0] * k) - fr(LAB_Q[0] * k))
  const d1 = fr(fr(LAB_P[1] * k) - fr(LAB_Q[1] * k))
  const d2 = fr(fr(LAB_P[2] * k) - fr(LAB_Q[2] * k))
  return fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2))
}

/**
 * Whether the step from pixel `p` to pixel `q` of `rgb` (encoded sRGB, three per
 * pixel) lies inside a smooth region: the CIE76 difference is below
 * {@link SMOOTH_STEP} (compared squared, in single precision).
 */
export function smoothStep(rgb: Float32Array, p: number, q: number): boolean {
  srgbToLab32(rgb[3 * p], rgb[3 * p + 1], rgb[3 * p + 2], LAB_P)
  srgbToLab32(rgb[3 * q], rgb[3 * q + 1], rgb[3 * q + 2], LAB_Q)
  return dist2Scaled32(1) < SMOOTH_STEP * SMOOTH_STEP
}

/**
 * Whether the step from pixel `p` to pixel `q` of `rgb` is a discontinuity: the
 * OKLab distance, scaled by 100, above {@link EDGE_STEP} (compared squared, in
 * single precision).
 */
export function edgeStep(rgb: Float32Array, p: number, q: number): boolean {
  rgbToOklab32(rgb[3 * p], rgb[3 * p + 1], rgb[3 * p + 2], LAB_P)
  rgbToOklab32(rgb[3 * q], rgb[3 * q + 1], rgb[3 * q + 2], LAB_Q)
  return dist2Scaled32(100) > EDGE_STEP * EDGE_STEP
}

/**
 * Whether the seam between components `a` and `b` is an edge: more than half of
 * its pixel pairs are discontinuities, `2·sharp[a][b] > adj[a][b]`, with `adj`
 * counting every pair across the seam and `sharp` those that pass
 * {@link edgeStep}. An empty seam is not an edge. Inspired by Chakraborty et al.
 * (2025, §3.2): segments that face each other across the discontinuity map are
 * never one region; read here off the seam the two components already share.
 */
export function isEdge(adj: SeamCounts, sharp: SeamCounts, a: number, b: number): boolean {
  const shared = adj[a].get(b) ?? 0
  const edge = sharp[a].get(b) ?? 0
  return 2 * edge > shared
}

/**
 * Whether the seam between components `a` and `b` is mostly smooth steps:
 * `smooth[a][b] ≥ SMOOTH_FRACTION · adj[a][b]` on a non-empty seam, with `smooth`
 * counting the pairs that pass {@link smoothStep}.
 */
export function isSmooth(adj: SeamCounts, smooth: SeamCounts, a: number, b: number): boolean {
  const shared = adj[a].get(b) ?? 0
  const calm = smooth[a].get(b) ?? 0
  return shared > 0 && calm >= SMOOTH_FRACTION * shared
}

/**
 * Absorb component `b` into `a`: move `b`'s seam counts onto `a`, keeping the
 * counts symmetric, and drop the `a`–`b` seam, which lies inside the union.
 * Neighbors are visited in ascending order.
 */
export function absorbCounts(counts: SeamCounts, a: number, b: number): void {
  const taken = [...counts[b]].toSorted((x, y) => x[0] - y[0])
  counts[b] = new Map()
  for (const [c, k] of taken) {
    if (c === a) continue
    counts[a].set(c, (counts[a].get(c) ?? 0) + k)
    const e = counts[c]
    e.delete(b)
    e.set(a, (e.get(a) ?? 0) + k)
  }
  counts[a].delete(b)
}
