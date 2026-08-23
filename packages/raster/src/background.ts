/**
 * Alpha flattening and background-color probing.
 */
import { createMask, hexToRgb } from '@trazor/core'
import type { BinaryMask, RasterImage, VectorizeSettings } from '@trazor/core'

export interface FlattenResult {
  /** RGB composited over white (`transparent`) or `backgroundColor` (`custom`), alpha 255. */
  image: RasterImage
  /** `null` under fully-opaque handling; else 1 where original alpha ≥ `alphaThreshold`. */
  opaque: BinaryMask | null
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
 *   semi-transparent edge pixels) and report `opaque` = original alpha ≥
 *   `alphaThreshold`.
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
    return { image: compositeOver(image, rgb[0], rgb[1], rgb[2]), opaque: null }
  }

  const flat = compositeOver(image, 255, 255, 255)
  if (mode === 'opaque') return { image: flat, opaque: null }

  const opaque = createMask(width, height)
  const threshold = settings.alphaThreshold
  for (let i = 0, p = 3; i < n; i++, p += 4) {
    opaque.data[i] = data[p] >= threshold ? 1 : 0
  }
  return { image: flat, opaque }
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
