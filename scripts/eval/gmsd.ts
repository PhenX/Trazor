/**
 * Gradient Magnitude Similarity Deviation (GMSD).
 *
 * Xue, Zhang, Mou, Bovik, "Gradient Magnitude Similarity Deviation: A Highly
 * Efficient Perceptual Image Quality Index", IEEE TIP 23(2), 2014.
 * https://doi.org/10.1109/TIP.2013.2293423 (reference MATLAB: `GMSD.m`).
 *
 * The gradient magnitude of both images is compared pixel-wise; the standard
 * deviation of that similarity map is the score. A low, uniform similarity map
 * means the render distorts structure evenly; a high deviation means it is
 * locally wrong — the seam/corner error a whole-image mean dilutes. Lower is
 * better (0 = identical).
 *
 * Human-validated as the primary A/B metric across two blind judged batches
 * (`docs/studies/perceptual-metrics.md` in the studio): it tracks the eye on
 * 30 of 33 decisive pairs pooled. `ab-report.ts` reads it as the default
 * verdict primary. This is a byte-for-byte port of the studio's
 * `scripts/eval/metrics/gmsd.ts` so the engine and the studio panel report one
 * GMSD, not two.
 */
import type { RasterImage } from '@trazor/core'
import { downsample2, toLuma } from './gray'

/** Constant stabilizing the similarity map for images in [0, 255] (paper: T = 170). */
const T = 170

/**
 * Prewitt gradient magnitude of a plane, with replicate padding at the border.
 * Kernels are the paper's `[1 0 -1; 1 0 -1; 1 0 -1] / 3` and its transpose.
 */
function prewittMagnitude(p: Float64Array, w: number, h: number): Float64Array {
  const out = new Float64Array(w * h)
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    return p[cy * w + cx]
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = at(x - 1, y - 1)
      const b = at(x, y - 1)
      const c = at(x + 1, y - 1)
      const d = at(x - 1, y)
      const f = at(x + 1, y)
      const g = at(x - 1, y + 1)
      const hh = at(x, y + 1)
      const k = at(x + 1, y + 1)
      const gx = (a + d + g - c - f - k) / 3
      const gy = (a + b + c - g - hh - k) / 3
      out[y * w + x] = Math.sqrt(gx * gx + gy * gy)
    }
  }
  return out
}

/** GMSD between a render and its reference, both same-sized and opaque over white. */
export function gmsd(render: RasterImage, ref: RasterImage): number {
  // The reference averages by 2×2 and downsamples by 2 before the gradient.
  const r = downsample2(toLuma(render), render.width, render.height)
  const s = downsample2(toLuma(ref), ref.width, ref.height)
  const w = Math.min(r.w, s.w)
  const h = Math.min(r.h, s.h)
  const gr = prewittMagnitude(r.data, r.w, r.h)
  const gs = prewittMagnitude(s.data, s.w, s.h)

  let sum = 0
  let sumSq = 0
  let n = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = gr[y * r.w + x]
      const b = gs[y * s.w + x]
      const gms = (2 * a * b + T) / (a * a + b * b + T)
      sum += gms
      sumSq += gms * gms
      n++
    }
  }
  if (n === 0) return 0
  const mean = sum / n
  const variance = Math.max(0, sumSq / n - mean * mean)
  return Math.sqrt(variance)
}
