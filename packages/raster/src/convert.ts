/**
 * Color-space conversion buffers (Oklab, Ottosson 2020).
 *
 * The math below mirrors `rgbToOklab` from `@vectorizer/core` term for term —
 * same constants, same operation order — inlined over a precomputed
 * sRGB→linear LUT so converting a whole image allocates nothing per pixel and
 * produces bit-identical values to calling the core helper.
 */
import { srgbToLinear } from '@vectorizer/core'
import type { GrayImage, RasterImage } from '@vectorizer/core'

/** `srgbToLinear(v / 255)` for every byte value. */
const SRGB_LINEAR = (() => {
  const lut = new Float64Array(256)
  for (let i = 0; i < 256; i++) lut[i] = srgbToLinear(i / 255)
  return lut
})()

/** Interleaved [L, a, b] per pixel, length `width * height * 3`. Alpha is ignored. */
export function toOklabBuffer(image: RasterImage): Float32Array {
  const { width, height, data } = image
  const n = width * height
  const out = new Float32Array(n * 3)
  for (let i = 0, p = 0, o = 0; i < n; i++, p += 4, o += 3) {
    const lr = SRGB_LINEAR[data[p]]
    const lg = SRGB_LINEAR[data[p + 1]]
    const lb = SRGB_LINEAR[data[p + 2]]
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    out[o] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    out[o + 1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
    out[o + 2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  }
  return out
}

/** Perceptual grayscale: the Oklab L component per pixel, clamped to [0, 1]. */
export function toGrayscale(image: RasterImage): GrayImage {
  const { width, height, data } = image
  const n = width * height
  const out = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const lr = SRGB_LINEAR[data[p]]
    const lg = SRGB_LINEAR[data[p + 1]]
    const lb = SRGB_LINEAR[data[p + 2]]
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
    out[i] = L < 0 ? 0 : L > 1 ? 1 : L
  }
  return { width, height, data: out }
}
