/**
 * Exact area-averaged (box filter) downscale. Each destination pixel is the
 * mean of the source rectangle it covers; source pixels that are only
 * partially covered contribute proportionally to their coverage, so
 * non-integer scale factors are handled exactly. The two separable passes
 * multiply out to the exact 2D box filter.
 */
import type { RasterImage } from '@vectorizer/core'

interface BoxTaps {
  start: Int32Array
  count: Int32Array
  /** Normalized weights, `stride` slots per destination index. */
  weight: Float64Array
  stride: number
}

/** Per-destination-pixel source coverage weights along one axis. */
function buildBoxTaps(src: number, dst: number): BoxTaps {
  const scale = src / dst
  const stride = Math.ceil(scale) + 1
  const start = new Int32Array(dst)
  const count = new Int32Array(dst)
  const weight = new Float64Array(dst * stride)
  for (let d = 0; d < dst; d++) {
    const s0 = d * scale
    const s1 = (d + 1) * scale
    const i0 = Math.floor(s0)
    const i1 = Math.min(src, Math.ceil(s1))
    start[d] = i0
    let cnt = 0
    let sum = 0
    for (let i = i0; i < i1; i++) {
      const cover = Math.min(i + 1, s1) - Math.max(i, s0)
      const wgt = cover > 0 ? cover : 0
      weight[d * stride + cnt] = wgt
      sum += wgt
      cnt++
    }
    count[d] = cnt
    if (sum > 0) {
      const inv = 1 / sum
      for (let t = 0; t < cnt; t++) weight[d * stride + t] *= inv
    }
  }
  return { start, count, weight, stride }
}

/**
 * Downscale so the longest side is at most `maxDimension`, preserving aspect
 * ratio. Returns the input object unchanged when `maxDimension` is 0 (or
 * negative) or when the image already fits. Never upscales. All four channels,
 * alpha included, are averaged identically.
 */
export function resizeToFit(image: RasterImage, maxDimension: number): RasterImage {
  const { width: w, height: h, data } = image
  if (maxDimension <= 0 || Math.max(w, h) <= maxDimension) return image
  const scale = maxDimension / Math.max(w, h)
  const dw = Math.max(1, Math.round(w * scale))
  const dh = Math.max(1, Math.round(h * scale))

  // Horizontal pass: (w × h) → (dw × h) into a float intermediate.
  const xTaps = buildBoxTaps(w, dw)
  const xStart = xTaps.start
  const xCount = xTaps.count
  const xWeight = xTaps.weight
  const xStride = xTaps.stride
  const mid = new Float32Array(dw * h * 4)
  for (let y = 0; y < h; y++) {
    const rowIn = y * w * 4
    const rowOut = y * dw * 4
    for (let dx = 0; dx < dw; dx++) {
      const t0 = dx * xStride
      const cnt = xCount[dx]
      const base = rowIn + xStart[dx] * 4
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let t = 0; t < cnt; t++) {
        const wgt = xWeight[t0 + t]
        const p = base + t * 4
        r += data[p] * wgt
        g += data[p + 1] * wgt
        b += data[p + 2] * wgt
        a += data[p + 3] * wgt
      }
      const q = rowOut + dx * 4
      mid[q] = r
      mid[q + 1] = g
      mid[q + 2] = b
      mid[q + 3] = a
    }
  }

  // Vertical pass: (dw × h) → (dw × dh) into the output bytes.
  const yTaps = buildBoxTaps(h, dh)
  const yStart = yTaps.start
  const yCount = yTaps.count
  const yWeight = yTaps.weight
  const yStride = yTaps.stride
  const out = new Uint8ClampedArray(dw * dh * 4)
  for (let dy = 0; dy < dh; dy++) {
    const t0 = dy * yStride
    const cnt = yCount[dy]
    const rowOut = dy * dw * 4
    for (let dx = 0; dx < dw; dx++) {
      const col = dx * 4
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let t = 0; t < cnt; t++) {
        const wgt = yWeight[t0 + t]
        const p = (yStart[dy] + t) * dw * 4 + col
        r += mid[p] * wgt
        g += mid[p + 1] * wgt
        b += mid[p + 2] * wgt
        a += mid[p + 3] * wgt
      }
      const q = rowOut + col
      out[q] = Math.round(r)
      out[q + 1] = Math.round(g)
      out[q + 2] = Math.round(b)
      out[q + 3] = Math.round(a)
    }
  }
  return { width: dw, height: dh, data: out }
}
