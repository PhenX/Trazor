/**
 * Global (Otsu 1979) and adaptive (integral-image local mean, Crow 1984
 * summed-area tables) thresholding of grayscale images.
 */
import type { BinaryMask, GrayImage } from '@vectorizer/core'

/** Histogram bin for a gray value in [0, 1] with 256 uniform bins. */
function binOf(v: number): number {
  if (v <= 0) return 0
  if (v >= 1) return 255
  return (v * 256) | 0
}

/**
 * Otsu's threshold over the in-mask pixels: the 256-bin split maximizing the
 * between-class variance. Ties (flat plateaus between two separated modes)
 * resolve to the middle of the tied range. Returns 0.5 when degenerate
 * (single mode / empty mask).
 */
export function otsuThreshold(gray: GrayImage, mask?: BinaryMask | null): number {
  const { data } = gray
  const md = mask ? mask.data : null
  const hist = new Float64Array(256)
  let total = 0
  for (let i = 0; i < data.length; i++) {
    if (md !== null && md[i] === 0) continue
    hist[binOf(data[i])]++
    total++
  }
  if (total === 0) return 0.5

  let sum = 0
  for (let t = 0; t < 256; t++) sum += t * hist[t]

  let wB = 0
  let sumB = 0
  let bestVar = 0
  let bestLo = -1
  let bestHi = -1
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = total - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const d = sumB / wB - (sum - sumB) / wF
    const v = wB * wF * d * d
    if (v > bestVar) {
      bestVar = v
      bestLo = t
      bestHi = t
    } else if (v === bestVar && bestLo >= 0) {
      bestHi = t
    }
  }
  if (bestLo < 0 || bestVar === 0) return 0.5
  // Bins 0..t are the dark class; (t + 1) / 256 is the exact bin boundary.
  return ((bestLo + bestHi) / 2 + 1) / 256
}

/**
 * Ink = 1 where `gray < threshold01` (dark on light), XOR `invert`.
 * Out-of-mask pixels are 0 regardless of `invert`.
 */
export function binarize(
  gray: GrayImage,
  threshold01: number,
  invert: boolean,
  mask?: BinaryMask | null,
): BinaryMask {
  const { width, height, data } = gray
  const md = mask ? mask.data : null
  const out = new Uint8Array(width * height)
  const inv = invert ? 1 : 0
  for (let i = 0; i < out.length; i++) {
    if (md !== null && md[i] === 0) continue
    out[i] = (data[i] < threshold01 ? 1 : 0) ^ inv
  }
  return { width, height, data: out }
}

/**
 * Adaptive thresholding: ink = 1 where `gray < localMean - bias01`, XOR
 * `invert`. The local mean is taken over a `(2r+1)²` window clamped to the
 * image, computed with an integral image. Out-of-mask pixels are 0.
 */
export function adaptiveBinarize(
  gray: GrayImage,
  radius: number,
  bias01: number,
  invert: boolean,
  mask?: BinaryMask | null,
): BinaryMask {
  const { width: w, height: h, data } = gray
  const md = mask ? mask.data : null
  const r = Math.max(1, Math.round(radius))
  const inv = invert ? 1 : 0

  // Integral image with a zero top row / left column: integ[(y+1)*(w+1)+(x+1)]
  // = sum of gray over [0..x] × [0..y].
  const iw = w + 1
  const integ = new Float64Array(iw * (h + 1))
  for (let y = 0; y < h; y++) {
    let rowSum = 0
    const src = y * w
    const prev = y * iw
    const cur = (y + 1) * iw
    for (let x = 0; x < w; x++) {
      rowSum += data[src + x]
      integ[cur + x + 1] = integ[prev + x + 1] + rowSum
    }
  }

  const out = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r
    const y1 = y + r >= h ? h - 1 : y + r
    const rowTop = y0 * iw
    const rowBot = (y1 + 1) * iw
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (md !== null && md[i] === 0) continue
      const x0 = x - r < 0 ? 0 : x - r
      const x1 = x + r >= w ? w - 1 : x + r
      const area = (x1 - x0 + 1) * (y1 - y0 + 1)
      const s =
        integ[rowBot + x1 + 1] - integ[rowTop + x1 + 1] - integ[rowBot + x0] + integ[rowTop + x0]
      out[i] = (data[i] < s / area - bias01 ? 1 : 0) ^ inv
    }
  }
  return { width: w, height: h, data: out }
}
