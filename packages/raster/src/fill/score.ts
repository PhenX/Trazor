/**
 * Scoring a fill model against a region's samples: chi² beyond the half-LSB
 * dead zone, the contrast the model draws, the share of the region it shades,
 * and the test that refuses a gradient the emitter would paint flat.
 *
 * All three scores read the model's prediction at the same strided subsample
 * (every `max(⌊n / MAX_FIT_SAMPLES⌋, 1)`-th sample from the first), evaluated
 * once ({@link Predictions}).
 *
 * Models are evaluated at the samples' positions, in the fitting frame (see
 * `samples.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/score.rs` (`Predictions`,
 * `ramp_support`, `visible_contrast`, `imperceptible`, `IMPERCEPTIBLE_STOP_OKLAB`)
 * and `gradient.rs` (`QUANT_HALF_STEP`).
 */

import { rgbToOklab } from '@trazor/core'
import { FillEval } from './model'
import type { FillModel, Rgb } from './model'
import { fitStride } from './samples'
import type { Samples } from './samples'

/**
 * Half an 8-bit quantization step: the residual dead zone. An 8-bit value `v`
 * means the true value lies in `[v − ½LSB, v + ½LSB]`, so a prediction inside
 * that interval is fully consistent with the observation.
 */
export const QUANT_HALF_STEP = 0.5 / 255

/**
 * Largest OKLab distance between any two stops of a gradient the emitter still
 * paints flat (inkvec's emitter JND, `demote_imperceptible_gradient`).
 */
export const IMPERCEPTIBLE_STOP_OKLAB = 0.02

const fr = Math.fround
const F32_MAX = 3.4028234663852886e38

/** A model's predicted sRGB color at each sample of the strided scoring subsample. */
export class Predictions {
  /** Prediction at subsample `j` (sample `j·stride`), three per entry. */
  readonly p: Float32Array
  /** Number of predictions. */
  readonly m: number
  /** The subsample stride. */
  readonly stride: number

  constructor(model: FillModel, s: Samples) {
    const stride = fitStride(s.n)
    const m = s.n > 0 ? Math.ceil(s.n / stride) : 0
    const p = new Float32Array(3 * m)
    const e = new FillEval(model)
    for (let j = 0; j < m; j++) e.colorAt(s.x[j * stride], s.y[j * stride], p, 3 * j)
    this.p = p
    this.m = m
    this.stride = stride
  }

  /**
   * chi² of the model against the samples, per sRGB channel beyond the dead
   * zone, in units of `sigma`, scaled from the `m` scored samples to all `n`:
   *
   * `chi² = (n/m) · Σ_i Σ_ch max(|o − p| − ½LSB, 0)² / σ²`
   *
   * No samples gives 0.
   */
  chi2(s: Samples, sigma: number): number {
    const inv = 1 / (sigma * sigma)
    const p = this.p
    let sum = 0
    for (let j = 0; j < this.m; j++) {
      const o = 3 * j * this.stride
      for (let k = 0; k < 3; k++) {
        const d = Math.max(Math.abs(fr(s.srgb[o + k] - p[3 * j + k])) - QUANT_HALF_STEP, 0)
        sum += d * d
      }
    }
    if (this.m === 0) return 0
    return sum * inv * (s.n / this.m)
  }

  /**
   * Share of the predictions more than a quarter of `contrast` from `mean` (sRGB,
   * Euclidean): how much of the region the model visibly shades. No samples
   * gives 0.
   */
  support(mean: Rgb, contrast: number): number {
    const thr = fr(0.25 * contrast)
    const thr2 = fr(thr * thr)
    const p = this.p
    let k = 0
    for (let j = 0; j < this.m; j++) {
      const d0 = fr(p[3 * j] - mean[0])
      const d1 = fr(p[3 * j + 1] - mean[1])
      const d2 = fr(p[3 * j + 2] - mean[2])
      if (fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2)) > thr2) k++
    }
    return this.m === 0 ? 0 : k / this.m
  }

  /** Largest per-channel range of the predictions: the contrast the model draws. A flat model gives 0. */
  contrast(): number {
    const lo = [F32_MAX, F32_MAX, F32_MAX]
    const hi = [-F32_MAX, -F32_MAX, -F32_MAX]
    const p = this.p
    for (let j = 0; j < this.m; j++) {
      for (let k = 0; k < 3; k++) {
        const v = p[3 * j + k]
        if (v < lo[k]) lo[k] = v
        if (v > hi[k]) hi[k] = v
      }
    }
    let c = 0
    for (let k = 0; k < 3; k++) {
      const r = fr(hi[k] - lo[k])
      if (r > c) c = r
    }
    return c
  }
}

/** Largest per-channel sRGB range `model` draws over the scored samples. */
export function visibleContrast(model: FillModel, s: Samples): number {
  return new Predictions(model, s).contrast()
}

/** Share of the scored samples `model` shades visibly away from `mean` ({@link Predictions.support}). */
export function rampSupport(model: FillModel, s: Samples, mean: Rgb, contrast: number): number {
  return new Predictions(model, s).support(mean, contrast)
}

/**
 * Whether the emitter would paint `model` flat: a gradient every pair of whose
 * stops (ends and interior) lies closer than {@link IMPERCEPTIBLE_STOP_OKLAB} in
 * OKLab. Model selection refuses such a candidate, because what is drawn is the
 * flat midpoint of its end stops, not the gradient whose residual won.
 */
export function imperceptible(model: FillModel): boolean {
  if (model.kind === 'flat') return false
  const colors: Rgb[] = [model.c0, model.c1, ...model.mids.map((m) => m.color)]
  const lab = colors.map((c) => rgbToOklab(c[0], c[1], c[2]))
  for (let i = 0; i < lab.length; i++) {
    for (let j = i + 1; j < lab.length; j++) {
      const dl = lab[i][0] - lab[j][0]
      const da = lab[i][1] - lab[j][1]
      const db = lab[i][2] - lab[j][2]
      if (Math.sqrt(dl * dl + da * da + db * db) >= IMPERCEPTIBLE_STOP_OKLAB) return false
    }
  }
  return true
}
