/**
 * Per-region fill model selection by minimum description length: a region's
 * fill is chosen from flat (3 parameters), linear (10) and radial (9, or 11
 * elliptical), each plus 4 per interior stop, in both interpolation spaces, by
 *
 * `cost = 0.5·chi² + λ·params`
 *
 * with chi² the sRGB residual beyond the half-LSB dead zone in units of the
 * pixel noise ({@link Predictions.chi2}). Only strictly interior pixels that
 * testify about the fill enter a fit. Selection is conservative: a gradient must
 * draw a visible contrast, shade a tenth of the region, stay visible once
 * emitted, and fit better than two flat colors would (a step is not a ramp).
 *
 * Fitting runs in the fitting frame (pixel centers at integer indices,
 * inkvec's, see `samples.ts`); {@link fitPixels} and everything built on it return
 * models in Trazor's pixel frame, every point inkvec's plus ½.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient.rs` (`BIMODAL_MARGIN`,
 * `MIN_VISIBLE_CONTRAST`, `MIN_RAMP_SUPPORT`, `bic_lambda`, `dominant_color_axis`,
 * `chi2_two_flats`, `ramp_models`, `ramp_candidates`, `fit_samples`, `select`,
 * `fit_pixels`, `fit_candidates`, `fit_fill`) and `gradient/bands.rs`
 * (`UnionFitter::fit`, `common_pixel_gain`).
 */

import { fitFlat, fitLinear, fitRadial, fitRadialElliptic, fmax, fmin, restopRadial } from './fit'
import {
  FillEval,
  fillParams,
  flatOnly,
  INTERPS,
  MIN_GRADIENT_PIXELS,
  PARAMS_RADIAL,
} from './model'
import type { FillFit, FillModel, Interp, Rgb } from './model'
import { profileGeometries } from './profile'
import {
  collectSamples,
  colorsIn,
  fitStride,
  stridedUnion,
  toFittingFrame,
  toPixelFrame,
} from './samples'
import type { PixelTest, Samples } from './samples'
import { imperceptible, Predictions, QUANT_HALF_STEP } from './score'
import { fitMidStops } from './stops'

/**
 * How much better two flat colors must fit than the best gradient before a
 * region is judged a step rather than a ramp and every gradient is declined.
 */
export const BIMODAL_MARGIN = 0.85

/** A gradient must change the fill by at least this much (sRGB, some channel) across the region. */
export const MIN_VISIBLE_CONTRAST = 1.5 / 255

/**
 * Least fraction of a region's samples a gradient must visibly shade: a ramp
 * flat over nine tenths of the region and changing at one extreme explains a
 * feature (a lost dot, a stroke end), not shading.
 */
export const MIN_RAMP_SUPPORT = 0.1

/**
 * The BIC choice of `λ` for `n` observations, `½·ln(max(n, 2))`: the value at
 * which the MDL cost is the Bayesian information criterion. The pipeline calls it
 * with the image's pixel count.
 */
export function bicLambda(n: number): number {
  return 0.5 * Math.log(Math.max(n, 2))
}

/**
 * The principal axis of the subsample `idx`'s sRGB colors about `mean`, by eight
 * rounds of power iteration on their scatter matrix from the gray direction.
 * Null when the colors have no spread along the iterate.
 */
function dominantColorAxis(
  s: Samples,
  idx: Int32Array,
  mean: readonly number[],
): [number, number, number] | null {
  let axis: [number, number, number] = [1, 1, 1]
  const c = s.srgb
  for (let round = 0; round < 8; round++) {
    let n0 = 0
    let n1 = 0
    let n2 = 0
    for (let k = 0; k < idx.length; k++) {
      const i = idx[k]
      const d0 = c[3 * i] - mean[0]
      const d1 = c[3 * i + 1] - mean[1]
      const d2 = c[3 * i + 2] - mean[2]
      const dot = d0 * axis[0] + d1 * axis[1] + d2 * axis[2]
      n0 += dot * d0
      n1 += dot * d1
      n2 += dot * d2
    }
    const norm = Math.sqrt(n0 * n0 + n1 * n1 + n2 * n2)
    if (norm < 1e-12) return null
    axis = [n0 / norm, n1 / norm, n2 / norm]
  }
  return axis
}

/**
 * Residual of the best two flat colors for the samples, on the scale of
 * {@link Predictions.chi2}: one-dimensional k-means with k = 2 (Lloyd's
 * iteration, 24 rounds from the midpoint of the range) along the samples'
 * dominant color axis, the two cluster means scored like any model over the
 * strided subsample and scaled to all samples. Not a model the emitter can
 * write: it prices the alternative "this region is a step". Infinity when there
 * is no split to make (under two samples, under four scored, no axis, no
 * spread, or an empty cluster).
 */
export function chi2TwoFlats(s: Samples, sigma: number): number {
  const n = s.n
  if (n < 2) return Infinity
  const stride = fitStride(n)
  const m = Math.ceil(n / stride)
  if (m < 4) return Infinity
  const idx = new Int32Array(m)
  for (let k = 0; k < m; k++) idx[k] = k * stride
  const c = s.srgb
  const mean = [0, 0, 0]
  for (let k = 0; k < m; k++) {
    for (let ch = 0; ch < 3; ch++) mean[ch] += c[3 * idx[k] + ch]
  }
  for (let ch = 0; ch < 3; ch++) mean[ch] /= m
  const axis = dominantColorAxis(s, idx, mean)
  if (axis === null) return Infinity
  const t = new Float64Array(m)
  let lo = Number.MAX_VALUE
  let hi = -Number.MAX_VALUE
  for (let k = 0; k < m; k++) {
    const i = idx[k]
    t[k] =
      (c[3 * i] - mean[0]) * axis[0] +
      (c[3 * i + 1] - mean[1]) * axis[1] +
      (c[3 * i + 2] - mean[2]) * axis[2]
    lo = fmin(lo, t[k])
    hi = fmax(hi, t[k])
  }
  if (hi - lo < 1e-12) return Infinity
  let split = 0.5 * (lo + hi)
  for (let round = 0; round < 24; round++) {
    let sa = 0
    let na = 0
    let sb = 0
    let nb = 0
    for (let k = 0; k < m; k++) {
      if (t[k] < split) {
        sa += t[k]
        na++
      } else {
        sb += t[k]
        nb++
      }
    }
    if (na === 0 || nb === 0) return Infinity
    split = 0.5 * (sa / na + sb / nb)
  }
  const sum = [
    [0, 0, 0],
    [0, 0, 0],
  ]
  const cnt = [0, 0]
  for (let k = 0; k < m; k++) {
    const g = t[k] < split ? 0 : 1
    cnt[g]++
    for (let ch = 0; ch < 3; ch++) sum[g][ch] += c[3 * idx[k] + ch]
  }
  if (cnt[0] === 0 || cnt[1] === 0) return Infinity
  const mu = [
    [sum[0][0] / cnt[0], sum[0][1] / cnt[0], sum[0][2] / cnt[0]],
    [sum[1][0] / cnt[1], sum[1][1] / cnt[1], sum[1][2] / cnt[1]],
  ]
  let acc = 0
  for (let k = 0; k < m; k++) {
    const g = t[k] < split ? 0 : 1
    for (let ch = 0; ch < 3; ch++) {
      const d = Math.max(Math.abs(c[3 * idx[k] + ch] - mu[g][ch]) - QUANT_HALF_STEP, 0)
      acc += d * d
    }
  }
  return (acc / (sigma * sigma)) * (n / m)
}

/** The ramps of one interpolation space with the samples' colors in it: linear, then radial and elliptic. */
interface SpaceCandidates {
  space: Interp
  cols: Float64Array
  cands: FillModel[]
}

/** The linear, radial and elliptic ramps for the samples in one space, in that order. */
function rampModels(s: Samples, w: number, space: Interp): SpaceCandidates {
  const cols = colorsIn(s, space)
  const radial = fitRadial(s, cols, space, w)
  const elliptic = radial === null ? null : fitRadialElliptic(s, cols, space, radial)
  const linear = fitLinear(s, cols, space)
  const cands: FillModel[] = []
  for (const c of [linear, radial, elliptic]) if (c !== null) cands.push(c)
  return { space, cols, cands }
}

/**
 * The ramp candidates of each space (in {@link INTERPS} order), each followed by
 * the profile-aware radial geometries (found once, on the sRGB colors) with
 * their stops refitted in that space. The line-scored candidates come first, so
 * they win ties.
 */
function rampCandidates(s: Samples, w: number): SpaceCandidates[] {
  const geometry = profileGeometries(s, colorsIn(s, 'srgb'), w)
  const perSpace = INTERPS.map((space) => rampModels(s, w, space))
  for (const sc of perSpace) {
    for (const g of geometry) {
      const r = restopRadial(s, sc.cols, sc.space, g)
      if (r !== null) sc.cands.push(r)
    }
  }
  return perSpace
}

/**
 * Every admissible candidate for the samples, flat first.
 *
 * 1. The flat fit (always first, so a tie in {@link select} resolves to it).
 * 2. Done when `strict` is off, below {@link MIN_GRADIENT_PIXELS} samples, or when
 *    flat already costs no more than the cheapest gradient possibly could
 *    (`λ·PARAMS_RADIAL`): exact, since no gradient's cost falls below its own
 *    parameter term.
 * 3. Linear, radial and elliptical ramps in both spaces, then the profile-aware
 *    radials, each gated on a visible contrast of `max(3σ, 1.5/255)`, a
 *    {@link MIN_RAMP_SUPPORT} and on not being imperceptible once emitted, each
 *    followed by its interior-stop variants under the same gates.
 * 4. The ramp-or-step test: when two flat colors fit better than
 *    {@link BIMODAL_MARGIN} times the best gradient's chi², every gradient is
 *    dropped.
 *
 * `sigma` is the per-channel sRGB noise (0.5/255 when not positive), `lambda` the
 * price of one editable number, `w` the image width (to find neighbors by pixel
 * index). Models are in the fitting frame.
 */
export function fitSamples(
  s: Samples,
  w: number,
  strict: boolean,
  sigmaIn: number,
  lambda: number,
): FillFit[] {
  const sigma = sigmaIn > 0 ? sigmaIn : 0.5 / 255
  const scored = (model: FillModel, preds: Predictions): FillFit => {
    const chi2 = preds.chi2(s, sigma)
    const params = fillParams(model)
    return { model, chi2, params, cost: 0.5 * chi2 + lambda * params }
  }
  const flat = fitFlat(s)
  const flatC: Rgb = flat.kind === 'flat' ? flat.color : [0, 0, 0]
  const out = [scored(flat, new Predictions(flat, s))]
  if (!strict || s.n < MIN_GRADIENT_PIXELS) return out
  if (out[0].cost <= lambda * PARAMS_RADIAL) return out
  const nFlatOnly = out.length
  const minContrast = Math.max(3 * sigma, MIN_VISIBLE_CONTRAST)
  for (const { space, cols, cands } of rampCandidates(s, w)) {
    for (const cand of cands) {
      const preds = new Predictions(cand, s)
      const contrast = preds.contrast()
      const support = preds.support(flatC, contrast)
      if (contrast < minContrast || support < MIN_RAMP_SUPPORT || imperceptible(cand)) continue
      const multi = fitMidStops(cand, s, cols, space)
      out.push(scored(cand, preds))
      for (const m of multi) {
        const pm = new Predictions(m, s)
        const c = pm.contrast()
        if (c >= minContrast && pm.support(flatC, c) >= MIN_RAMP_SUPPORT && !imperceptible(m)) {
          out.push(scored(m, pm))
        }
      }
    }
  }
  if (out.length > nFlatOnly) {
    let bestGrad = Infinity
    for (let i = nFlatOnly; i < out.length; i++) bestGrad = fmin(bestGrad, out[i].chi2)
    const two = chi2TwoFlats(s, sigma)
    if (Number.isFinite(two) && Number.isFinite(bestGrad) && two < BIMODAL_MARGIN * bestGrad) {
      out.length = nFlatOnly
    }
  }
  return out
}

/** The cheapest candidate; on a tie the earlier (simpler) one. `candidates` must not be empty. */
export function select(candidates: readonly FillFit[]): FillFit {
  let best = 0
  for (let i = 1; i < candidates.length; i++) {
    if (candidates[i].cost < candidates[best].cost) best = i
  }
  return candidates[best]
}

/**
 * Every candidate for the region of `pixels` (membership `member`), flat first.
 * Three tiers of samples, taken in order until one is non-empty: strictly
 * interior pixels that pass `evidence` (every model is tried); any pixel that
 * passes `evidence`; any pixel (both flat only). No pixels gives a black flat
 * fill at the cost of its parameters. `evidence` null lets every pixel testify.
 * Models are in Trazor's pixel frame.
 */
export function fitPixels(
  rgb: Float32Array,
  w: number,
  h: number,
  pixels: ArrayLike<number>,
  member: PixelTest,
  evidence: PixelTest | null,
  sigma: number,
  lambda: number,
): FillFit[] {
  if (pixels.length === 0) return [flatOnly([0, 0, 0], lambda)]
  let fits: FillFit[]
  const interior = collectSamples(rgb, w, h, pixels, member, evidence, true)
  if (interior.n > 0) {
    fits = fitSamples(interior, w, true, sigma, lambda)
  } else {
    const anyEvidence = collectSamples(rgb, w, h, pixels, member, evidence, false)
    fits =
      anyEvidence.n > 0
        ? fitSamples(anyEvidence, w, false, sigma, lambda)
        : fitSamples(
            collectSamples(rgb, w, h, pixels, member, null, false),
            w,
            false,
            sigma,
            lambda,
          )
  }
  return fits.map((f) => ({
    model: toPixelFrame(f.model),
    chi2: f.chi2,
    params: f.params,
    cost: f.cost,
  }))
}

/** The pixels of `label` in a label map, ascending. */
export function pixelsOf(labels: ArrayLike<number>, label: number): Int32Array {
  let n = 0
  for (let p = 0; p < labels.length; p++) if (labels[p] === label) n++
  const out = new Int32Array(n)
  let k = 0
  for (let p = 0; p < labels.length; p++) if (labels[p] === label) out[k++] = p
  return out
}

/**
 * Every admissible fill model for region `label` of `labels` (every pixel of it
 * testifies), scored; the flat model first. `rgb` is the image over white
 * (encoded sRGB, three per pixel), `sigmaNoise` the per-channel sRGB noise,
 * `lambda` the price of one editable number ({@link bicLambda} of the image's
 * pixel count in the pipeline).
 */
export function fitCandidates(
  rgb: Float32Array,
  w: number,
  h: number,
  labels: ArrayLike<number>,
  label: number,
  sigmaNoise: number,
  lambda: number,
): FillFit[] {
  return fitPixels(
    rgb,
    w,
    h,
    pixelsOf(labels, label),
    (p) => labels[p] === label,
    null,
    sigmaNoise,
    lambda,
  )
}

/** The fill model for region `label` by minimum description length: {@link select} of {@link fitCandidates}. */
export function fitFill(
  rgb: Float32Array,
  w: number,
  h: number,
  labels: ArrayLike<number>,
  label: number,
  sigmaNoise: number,
  lambda: number,
): FillFit {
  return select(fitCandidates(rgb, w, h, labels, label, sigmaNoise, lambda))
}

/**
 * The selected fill of a union of two pixel lists (`b` empty for one region):
 * the fit gathers {@link stridedUnion}'s pixels (at most `FIT_PIXELS_CAP`, evenly
 * strided), and when it saw fewer than all, chi² is scaled back up by the
 * subsampling factor (and the cost with it) so costs stay comparable across
 * region sizes. `member` is the union's membership, `evidence` which pixels
 * testify (null: all).
 */
export function fitUnion(
  rgb: Float32Array,
  w: number,
  h: number,
  a: ArrayLike<number>,
  b: ArrayLike<number>,
  member: PixelTest,
  evidence: PixelTest | null,
  sigma: number,
  lambda: number,
): FillFit {
  const total = a.length + b.length
  const seen = stridedUnion(a, b)
  const fit = select(fitPixels(rgb, w, h, seen, member, evidence, sigma, lambda))
  if (seen.length >= total) return fit
  const k = total / seen.length
  const paramsTerm = fit.cost - 0.5 * fit.chi2
  const chi2 = fit.chi2 * k
  return { model: fit.model, params: fit.params, chi2, cost: paramsTerm + 0.5 * chi2 }
}

/**
 * The gain of merging two regions priced on common observations: over a strided
 * subsample of `m` of the `n` strictly interior evidence pixels of the union
 * (`pixels`, membership `member`), with `e(q) = max(|o − q| − ½LSB, 0)` per sRGB
 * channel,
 *
 * `gain = ½·(n/m)·Σ_i Σ_ch (e(split_i)² − e(merged_i)²)/σ² + λ·(params_a + params_b − params_union)`
 *
 * where `split_i` is the prediction of the side the pixel belongs to (`left`
 * where `inA`, else `right`) and `merged_i` the union's. Positive means the
 * union is cheaper. Null when the union has no such pixel or the gain is not
 * finite. The fits' models are in Trazor's pixel frame.
 */
export function commonPixelGain(
  rgb: Float32Array,
  w: number,
  h: number,
  pixels: ArrayLike<number>,
  member: PixelTest,
  inA: PixelTest,
  evidence: PixelTest | null,
  left: FillFit,
  right: FillFit,
  union: FillFit,
  sigma: number,
  lambda: number,
): number | null {
  const s = collectSamples(rgb, w, h, pixels, member, evidence, true)
  if (s.n === 0) return null
  const stride = fitStride(s.n)
  const le = new FillEval(toFittingFrame(left.model))
  const re = new FillEval(toFittingFrame(right.model))
  const ue = new FillEval(toFittingFrame(union.model))
  const split = new Float32Array(3)
  const merged = new Float32Array(3)
  let difference = 0
  let used = 0
  for (let i = 0; i < s.n; i += stride) {
    const side = inA(s.px[i]) ? le : re
    side.colorAt(s.x[i], s.y[i], split, 0)
    ue.colorAt(s.x[i], s.y[i], merged, 0)
    for (let c = 0; c < 3; c++) {
      const o = s.srgb[3 * i + c]
      const old = Math.max(Math.abs(Math.fround(o - split[c])) - QUANT_HALF_STEP, 0)
      const now = Math.max(Math.abs(Math.fround(o - merged[c])) - QUANT_HALF_STEP, 0)
      difference += old * old - now * now
    }
    used++
  }
  const gain =
    (((0.5 * difference) / (sigma * sigma)) * s.n) / used +
    lambda * (left.params + right.params - union.params)
  return Number.isFinite(gain) ? gain : null
}
