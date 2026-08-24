/**
 * Illumination flattening — a single-scale Retinex / homomorphic flat-field
 * correction applied to the Oklab **L** channel only.
 *
 * A smoothly shaded region (a 3D render's highlight, a soft drop shadow, an
 * uneven scan) is one surface color under a low-frequency lightness gradient.
 * Color quantization has no notion of "shading", so it slices that gradient
 * into concentric tone bands — the vector equivalent of a topographic contour
 * map — and the tracer then emits a nest of layers for what should be one flat
 * fill. Estimating the gradient and dividing it out collapses the region back
 * to a single tone the quantizer keeps as one color.
 *
 * The illumination estimate is a large-radius blur of L (approximated by three
 * box-blur passes, so cost is independent of radius); the correction divides
 * each pixel's L by that estimate, renormalized to the image's mean L. Chroma
 * (Oklab a, b) is left untouched, so hue and saturation are preserved and only
 * lightness is flattened — a colored region stays its color, just evenly lit.
 *
 * This is the multiplicative reflectance × illumination model: it removes soft,
 * smooth shading well, but a hard cast-shadow edge is low-frequency to the blur
 * and will leave a residual halo. It is a preprocessing aid for smoothly shaded
 * color art, not a physical relighting.
 *
 * Land & McCann 1971 (Retinex theory of lightness); single-scale form after
 * Jobson, Rahman & Woodell 1997 ("Properties and performance of a center/surround
 * retinex").
 */
import { cloneRaster, linearToSrgb } from '@trazor/core'
import type { RasterImage } from '@trazor/core'
import { toOklabBuffer } from './convert'

export interface FlattenIlluminationOptions {
  /**
   * Radius of the illumination estimate as a fraction of the larger image
   * dimension, in (0, 1]. Larger ⇒ only the very lowest frequencies count as
   * shading (safer for detailed art); smaller ⇒ more aggressive flattening that
   * can start eating real large-scale tone. Default `0.12`.
   */
  scale?: number
  /**
   * Correction strength in [0, 1]. `0` is an exact no-op (returns a clone); `1`
   * divides the estimate out fully; values between raise the gain to that power,
   * blending toward the original. Default `1`.
   */
  strength?: number
}

const DEFAULT_SCALE = 0.12
const DEFAULT_STRENGTH = 1
/** Floor on the illumination estimate so near-black pixels never divide by ~0. */
const ILLUM_EPS = 1e-3

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * One separable box blur (horizontal then vertical) of a single-channel field,
 * averaging only in-bounds samples at the borders. Reads `src`, writes `dst`,
 * uses `scratch` for the intermediate. `src` is left unchanged.
 */
function boxBlurPass(
  src: Float32Array,
  dst: Float32Array,
  scratch: Float32Array,
  w: number,
  h: number,
  r: number,
): void {
  // Horizontal: src → scratch.
  for (let y = 0; y < h; y++) {
    const row = y * w
    let sum = 0
    for (let x = 0; x <= r && x < w; x++) sum += src[row + x]
    let right = Math.min(r, w - 1)
    let left = -r - 1
    for (let x = 0; x < w; x++) {
      const lo = x - r < 0 ? 0 : x - r
      const hi = x + r >= w ? w - 1 : x + r
      scratch[row + x] = sum / (hi - lo + 1)
      // Advance the window to x+1: add the incoming right sample, drop the
      // outgoing left one, both only when in bounds.
      const nextRight = right + 1
      if (nextRight < w) {
        sum += src[row + nextRight]
        right = nextRight
      }
      const nextLeft = left + 1
      if (nextLeft >= 0) sum -= src[row + nextLeft]
      left = nextLeft
    }
  }
  // Vertical: scratch → dst.
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = 0; y <= r && y < h; y++) sum += scratch[y * w + x]
    let bottom = Math.min(r, h - 1)
    let top = -r - 1
    for (let y = 0; y < h; y++) {
      const lo = y - r < 0 ? 0 : y - r
      const hi = y + r >= h ? h - 1 : y + r
      dst[y * w + x] = sum / (hi - lo + 1)
      const nextBottom = bottom + 1
      if (nextBottom < h) {
        sum += scratch[nextBottom * w + x]
        bottom = nextBottom
      }
      const nextTop = top + 1
      if (nextTop >= 0) sum -= scratch[nextTop * w + x]
      top = nextTop
    }
  }
}

/**
 * Flatten smooth lightness shading out of an image ahead of quantization.
 *
 * Returns a new image; the source is not modified. Alpha is copied through
 * unchanged. Deterministic: same input and options ⇒ identical output.
 */
export function flattenIllumination(
  image: RasterImage,
  opts: FlattenIlluminationOptions = {},
): RasterImage {
  const { width: w, height: h, data } = image
  const strength = opts.strength ?? DEFAULT_STRENGTH
  const scale = opts.scale ?? DEFAULT_SCALE
  const n = w * h
  if (n === 0 || strength <= 0) return cloneRaster(image)

  const lab = toOklabBuffer(image)
  const light = new Float32Array(n)
  let meanL = 0
  for (let i = 0, o = 0; i < n; i++, o += 3) {
    const L = lab[o]
    light[i] = L
    meanL += L
  }
  meanL /= n

  // Low-frequency illumination estimate: three box-blur passes ≈ a wide
  // Gaussian, cost independent of the (large) radius.
  const radius = Math.max(1, Math.round(scale * Math.max(w, h)))
  let a = light
  let b = new Float32Array(n)
  const scratch = new Float32Array(n)
  for (let pass = 0; pass < 3; pass++) {
    boxBlurPass(a, b, scratch, w, h, radius)
    const swap = a
    a = b
    b = swap
  }
  const illum = a // final estimate (never the caller's `light` after 3 swaps)

  const out = new Uint8ClampedArray(data.length)
  const full = strength === 1
  // Oklab → sRGB inlined (mirrors `oklabToRgb` in @trazor/core term for term) so
  // the per-pixel loop allocates no tuple; only L is rescaled, a/b pass through.
  for (let i = 0, o = 0, p = 0; i < n; i++, o += 3, p += 4) {
    const est = illum[i] < ILLUM_EPS ? ILLUM_EPS : illum[i]
    const ratio = meanL / est
    const gain = full ? ratio : Math.pow(ratio, strength)
    let newL = lab[o] * gain
    if (newL < 0) newL = 0
    else if (newL > 1) newL = 1
    const A = lab[o + 1]
    const B = lab[o + 2]
    const lp = newL + 0.3963377774 * A + 0.2158037573 * B
    const mp = newL - 0.1055613458 * A - 0.0638541728 * B
    const sp = newL - 0.0894841775 * A - 1.291485548 * B
    const l3 = lp * lp * lp
    const m3 = mp * mp * mp
    const s3 = sp * sp * sp
    const lr = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3
    const lg = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3
    const lb = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3
    out[p] = Math.round(clamp01(linearToSrgb(lr)) * 255)
    out[p + 1] = Math.round(clamp01(linearToSrgb(lg)) * 255)
    out[p + 2] = Math.round(clamp01(linearToSrgb(lb)) * 255)
    out[p + 3] = data[p + 3]
  }
  return { width: w, height: h, data: out }
}
