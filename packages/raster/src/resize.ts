/**
 * Exact area-averaged (box filter) downscale. Each destination pixel is the
 * mean of the source rectangle it covers; source pixels that are only
 * partially covered contribute proportionally to their coverage, so
 * non-integer scale factors are handled exactly. The two separable passes
 * multiply out to the exact 2D box filter.
 */
import type { GrayImage, RasterImage } from '@trazor/core'

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

/**
 * Bilinear resample of a single-channel float image to an exact size, center-
 * aligned and edge-clamped. Used to bring an edge hint to the working image
 * resolution before it is discretized. Returns a fresh image (a copy at identity).
 */
export function resizeGray(image: GrayImage, width: number, height: number): GrayImage {
  const { width: w, height: h, data } = image
  if (width <= 0 || height <= 0) throw new RangeError('resize target must be positive')
  if (width === w && height === h) return { width, height, data: new Float32Array(data) }
  const out = new Float32Array(width * height)
  const sx = w / width
  const sy = h / height
  const last = (v: number, hi: number): number => (v < 0 ? 0 : v > hi ? hi : v)
  for (let y = 0; y < height; y++) {
    const fy = last((y + 0.5) * sy - 0.5, h - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(h - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = last((x + 0.5) * sx - 0.5, w - 1)
      const x0 = Math.floor(fx)
      const x1 = Math.min(w - 1, x0 + 1)
      const wx = fx - x0
      const top = data[y0 * w + x0] + (data[y0 * w + x1] - data[y0 * w + x0]) * wx
      const bot = data[y1 * w + x0] + (data[y1 * w + x1] - data[y1 * w + x0]) * wx
      out[y * width + x] = top + (bot - top) * wy
    }
  }
  return { width, height, data: out }
}
