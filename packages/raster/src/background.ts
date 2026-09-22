/**
 * Alpha flattening and background-color probing.
 */
import { createMask, hexToRgb } from '@trazor/core'
import type { BinaryMask, GrayImage, RasterImage, VectorizeSettings } from '@trazor/core'

export interface FlattenResult {
  /** RGB composited over white (`transparent`) or `backgroundColor` (`custom`), alpha 255. */
  image: RasterImage
  /** `null` under fully-opaque handling; else 1 for each pixel that produces a shape (see {@link flattenImage}). */
  opaque: BinaryMask | null
  /** Source alpha per pixel (0-255), kept whenever `opaque` is; `null` otherwise. */
  alpha: Uint8Array | null
}

/** `out = src * a + bg * (1 - a)` per channel; output alpha is always 255. */
function compositeOver(image: RasterImage, br: number, bg: number, bb: number): RasterImage {
  const { width, height, data } = image
  const out = new Uint8ClampedArray(data.length)
  for (let p = 0; p < data.length; p += 4) {
    const a = data[p + 3]
    if (a === 255) {
      out[p] = data[p]
      out[p + 1] = data[p + 1]
      out[p + 2] = data[p + 2]
    } else {
      const ia = 255 - a
      out[p] = Math.round((data[p] * a + br * ia) / 255)
      out[p + 1] = Math.round((data[p + 1] * a + bg * ia) / 255)
      out[p + 2] = Math.round((data[p + 2] * a + bb * ia) / 255)
    }
    out[p + 3] = 255
  }
  return { width, height, data: out }
}

/**
 * Resolve the alpha channel ahead of vectorization.
 *
 * - `transparent`: composite RGB over white (removes fringe colors in
 *   semi-transparent edge pixels) and report `opaque` — the pixels that produce
 *   a shape: original alpha ≥ `alphaThreshold`, or, for an image dominated by
 *   flat translucent content, alpha ≥ `TRANSLUCENT_MIN_ALPHA` (see below).
 * - `custom`: composite over `backgroundColor`; `opaque` is `null`.
 * - `auto`: behaves as `transparent` when any pixel has alpha < 250, else as
 *   fully opaque (composited over white — a no-op except for alpha in
 *   [250, 255) — with `opaque` `null`).
 */
export function flattenImage(
  image: RasterImage,
  settings: Pick<VectorizeSettings, 'background' | 'backgroundColor' | 'alphaThreshold'>,
): FlattenResult {
  const { width, height, data } = image
  const n = width * height

  let mode: 'transparent' | 'custom' | 'opaque'
  if (settings.background === 'custom') {
    mode = 'custom'
  } else if (settings.background === 'transparent') {
    mode = 'transparent'
  } else {
    mode = 'opaque'
    for (let p = 3; p < data.length; p += 4) {
      if (data[p] < 250) {
        mode = 'transparent'
        break
      }
    }
  }

  if (mode === 'custom') {
    const rgb = hexToRgb(settings.backgroundColor) ?? [255, 255, 255]
    return { image: compositeOver(image, rgb[0], rgb[1], rgb[2]), opaque: null, alpha: null }
  }

  const flat = compositeOver(image, 255, 255, 255)
  if (mode === 'opaque') return { image: flat, opaque: null, alpha: null }

  const opaque = createMask(width, height)
  const alpha = new Uint8Array(n)
  const threshold = settings.alphaThreshold
  for (let i = 0, p = 3; i < n; i++, p += 4) alpha[i] = data[p]
  // The cut level that decides which pixels produce a shape. The half-coverage
  // cut (`alphaThreshold` 128) is the true outline of an anti-aliased opaque
  // edge. An image carrying broad see-through content (a shadow, glass, steam)
  // instead lowers its cut to `TRANSLUCENT_MIN_ALPHA`, so that whole soft field
  // is kept and emitted as translucent faces rather than half of it dropping at
  // the opaque cut; its opaque shapes are still pulled to their true outline by
  // the coverage field at the tracer. The image counts as see-through only when
  // flat-translucent pixels — a partial-alpha plateau, not a steep rim — cover at
  // least `TRANSLUCENT_AREA_GATE` of it, so an opaque icon whose soft edges match
  // a stray rim pixel keeps its tight cut.
  let marked = 0
  {
    const md = markFlatTranslucent(alpha, width, height)
    for (let i = 0; i < n; i++) marked += md[i]
  }
  const cut = marked >= n * TRANSLUCENT_AREA_GATE ? TRANSLUCENT_MIN_ALPHA : threshold
  for (let i = 0; i < n; i++) opaque.data[i] = alpha[i] >= cut ? 1 : 0
  return { image: flat, opaque, alpha }
}

/** Alpha below which a pixel is treated as fully clear (produces no shape). */
export const TRANSLUCENT_MIN_ALPHA = 8
/** Alpha at or above which a pixel is fully solid, so it is not translucent content. */
export const TRANSLUCENT_MAX_ALPHA = 250
/**
 * Largest alpha step between two neighbors still counted as one flat translucent
 * level. A see-through region's coverage is nearly constant (steps of a few
 * levels); an anti-aliased rim climbs by ~one-over-its-width of full scale per
 * pixel, far more, so this separates a translucent plateau from an opaque edge.
 */
const TRANSLUCENT_FLAT_DELTA = 24
/**
 * Fraction of the image that must read as flat-translucent before the sub-cut
 * expansion applies. A genuine see-through region (a steamy emoji is ~20%)
 * clears it by a wide margin; a soft-edged opaque icon marks only a rim's worth
 * of stray pixels (a few percent at most), so it stays cut cleanly at the
 * threshold with no edge dilation.
 */
const TRANSLUCENT_AREA_GATE = 0.05

/**
 * Mark each flat-translucent pixel (1): partly transparent
 * (`TRANSLUCENT_MIN_ALPHA` ≤ α < `TRANSLUCENT_MAX_ALPHA`) with at least one
 * in-bounds 4-neighbor also partly transparent and within `TRANSLUCENT_FLAT_DELTA`
 * of its own alpha. That is the plateau of a see-through region (a shadow, glass,
 * steam) — captured at any thickness, down to a one-pixel wisp, since the match
 * can run along the region. An anti-aliased rim of an opaque shape has no such
 * neighbor (its coverage climbs steeply from clear to solid), so it is never
 * marked and stays cut at the threshold. Fixed scan order: deterministic.
 */
function markFlatTranslucent(alpha: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(alpha.length)
  const flatWith = (a: number, b: number): boolean =>
    b >= TRANSLUCENT_MIN_ALPHA &&
    b < TRANSLUCENT_MAX_ALPHA &&
    Math.abs(a - b) <= TRANSLUCENT_FLAT_DELTA
  for (let y = 0; y < height; y++) {
    const row = y * width
    for (let x = 0; x < width; x++) {
      const i = row + x
      const a = alpha[i]
      if (a < TRANSLUCENT_MIN_ALPHA || a >= TRANSLUCENT_MAX_ALPHA) continue
      if (
        (x > 0 && flatWith(a, alpha[i - 1])) ||
        (x < width - 1 && flatWith(a, alpha[i + 1])) ||
        (y > 0 && flatWith(a, alpha[i - width])) ||
        (y < height - 1 && flatWith(a, alpha[i + width]))
      ) {
        out[i] = 1
      }
    }
  }
  return out
}

/**
 * Signed coverage field of the transparency cut, in [-0.5, 0.5]: positive where
 * the source alpha reaches `alphaThreshold` (the pixel produces a shape),
 * negative below it, zero at the level. Each side is normalized by its own
 * distance to the extreme — `signedThresholdField`'s construction — so a solid
 * pixel reads +0.5, a clear one −0.5 and an anti-aliased rim pixel its partial
 * coverage. The tracer refines a region's exterior boundary onto the zero
 * contour: at half coverage (`alphaThreshold` 128) that is the true outline of
 * an anti-aliased edge, since a rasterizer writes each rim pixel's coverage
 * into alpha and keeps the ink color under it.
 */
export function alphaCoverageField(
  alpha: Uint8Array,
  width: number,
  height: number,
  alphaThreshold: number,
): GrayImage {
  const t = Math.min(255, Math.max(0, alphaThreshold)) / 255
  const inScale = 0.5 / Math.max(1 - t, 1e-6)
  const outScale = 0.5 / Math.max(t, 1e-6)
  const out = new Float32Array(alpha.length)
  for (let i = 0; i < alpha.length; i++) {
    const d = alpha[i] / 255 - t
    out[i] = d * (d > 0 ? inScale : outScale)
  }
  return { width, height, data: out }
}

/**
 * Most common RGB color among the 1px border frame (used for omitBackground
 * detection). Ties resolve to the color first encountered in scan order
 * (top row, bottom row, then left/right columns).
 */
export function borderDominantColor(image: RasterImage): [number, number, number] {
  const { width: w, height: h, data } = image
  if (w <= 0 || h <= 0) return [255, 255, 255]
  const counts = new Map<number, number>()
  const tally = (i: number): void => {
    const p = i * 4
    const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  for (let x = 0; x < w; x++) tally(x)
  if (h > 1) for (let x = 0; x < w; x++) tally((h - 1) * w + x)
  for (let y = 1; y < h - 1; y++) {
    tally(y * w)
    if (w > 1) tally(y * w + w - 1)
  }
  let bestKey = 0
  let bestCount = -1
  for (const [key, count] of counts) {
    if (count > bestCount) {
      bestCount = count
      bestKey = key
    }
  }
  return [(bestKey >> 16) & 0xff, (bestKey >> 8) & 0xff, bestKey & 0xff]
}
