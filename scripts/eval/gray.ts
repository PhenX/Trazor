/**
 * Shared luminance conversion for the GMSD metric. GMSD operates on a single
 * luminance plane, computed here so the metric sees one well-defined set of
 * pixels — the same grayscale conversion and 2× box downsample the studio's
 * `metrics/gray.ts` uses, so the two implementations produce identical numbers.
 */
import type { RasterImage } from '@trazor/core'

/**
 * Rec. 601 luma of an RGBA raster as a Float64 plane in [0, 255], matching the
 * `rgb2gray` weighting the metric literature assumes. Alpha is ignored — callers
 * pass images already composited over white.
 */
export function toLuma(img: RasterImage): Float64Array {
  const n = img.width * img.height
  const out = new Float64Array(n)
  const d = img.data
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    out[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
  }
  return out
}

/**
 * Downsample a plane by 2 with a 2×2 box average, dropping a trailing odd
 * row/column — the low-pass step GMSD uses before the gradient.
 */
export function downsample2(
  plane: Float64Array,
  w: number,
  h: number,
): {
  data: Float64Array
  w: number
  h: number
} {
  const w2 = w >> 1
  const h2 = h >> 1
  const out = new Float64Array(w2 * h2)
  for (let y = 0; y < h2; y++) {
    const r0 = 2 * y * w
    const r1 = r0 + w
    for (let x = 0; x < w2; x++) {
      const c = 2 * x
      out[y * w2 + x] =
        0.25 * (plane[r0 + c] + plane[r0 + c + 1] + plane[r1 + c] + plane[r1 + c + 1])
    }
  }
  return { data: out, w: w2, h: h2 }
}
