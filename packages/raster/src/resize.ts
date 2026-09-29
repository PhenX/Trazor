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

/** Clamp `v` to the inclusive range [0, hi]. */
function clampTo(v: number, hi: number): number {
  return v < 0 ? 0 : v > hi ? hi : v
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
  for (let y = 0; y < height; y++) {
    const fy = clampTo((y + 0.5) * sy - 0.5, h - 1)
    const y0 = Math.floor(fy)
    const y1 = Math.min(h - 1, y0 + 1)
    const wy = fy - y0
    for (let x = 0; x < width; x++) {
      const fx = clampTo((x + 0.5) * sx - 0.5, w - 1)
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

/**
 * Catmull-Rom weights for the four taps around a sample `t` ∈ [0, 1) past the
 * second tap (Keys 1981, a = −½): the interpolating cubic, exact on a linear
 * ramp and passing through every source sample.
 */
function catmullRom(t: number): [number, number, number, number] {
  const t2 = t * t
  const t3 = t2 * t
  return [
    (-t3 + 2 * t2 - t) / 2,
    (3 * t3 - 5 * t2 + 2) / 2,
    (-3 * t3 + 4 * t2 + t) / 2,
    (t3 - t2) / 2,
  ]
}

/**
 * Enlarge by an integer `factor` with bicubic (Catmull-Rom) interpolation,
 * pixel-center aligned and edge-clamped — the smooth resampling Potrace's own
 * `mkbitmap -s` applies before a small image is traced, so an anti-aliased
 * edge becomes a finer ramp rather than a coarser staircase. `bounded` holds
 * each pass between the two samples it lies between: the cubic's overshoot at
 * a hard edge rings a darker band inside a fill and a lighter one outside,
 * colors the drawing never used, which a color segmentation would keep.
 * Unbounded, a threshold reads the smoother contour of the plain cubic, and
 * the overshoot only moves pixels further from its cut. Colors are
 * interpolated premultiplied by alpha, so a transparent pixel lends no color
 * to its opaque neighbors. Returns the input unchanged at factor 1.
 */
export function upscaleImage(image: RasterImage, factor: number, bounded = true): RasterImage {
  const k = Math.round(factor)
  if (k <= 1) return image
  const { width: w, height: h, data } = image
  const W = w * k
  const H = h * k
  // The tap weights repeat with period k along each axis.
  const phase: [number, number, number, number][] = []
  const offset: number[] = []
  for (let r = 0; r < k; r++) {
    const s = (r + 0.5) / k - 0.5
    const s0 = Math.floor(s)
    offset.push(s0)
    phase.push(catmullRom(s - s0))
  }
  const pre = new Float32Array(w * h * 4)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    const a = data[p + 3] / 255
    pre[p] = data[p] * a
    pre[p + 1] = data[p + 1] * a
    pre[p + 2] = data[p + 2] * a
    pre[p + 3] = data[p + 3]
  }
  const acc = new Float64Array(4)
  /** The four taps at `p0..p3` (channel offsets into `src`) weighted by `wt`, held between taps 1 and 2. */
  const tap = (
    src: Float32Array,
    p0: number,
    p1: number,
    p2: number,
    p3: number,
    wt: [number, number, number, number],
  ): void => {
    for (let c = 0; c < 4; c++) {
      const b = src[p1 + c]
      const d = src[p2 + c]
      const v = src[p0 + c] * wt[0] + b * wt[1] + d * wt[2] + src[p3 + c] * wt[3]
      if (!bounded) {
        acc[c] = v
        continue
      }
      const lo = b < d ? b : d
      const hi = b < d ? d : b
      acc[c] = v < lo ? lo : v > hi ? hi : v
    }
  }
  // Horizontal pass: w × h → W × h.
  const mid = new Float32Array(W * h * 4)
  const col = (xx: number): number => (xx < 0 ? 0 : xx >= w ? w - 1 : xx)
  for (let y = 0; y < h; y++) {
    const rowIn = y * w
    const rowOut = y * W
    for (let X = 0; X < W; X++) {
      const q = Math.floor(X / k)
      const r = X - q * k
      const x0 = q + offset[r] - 1
      tap(
        pre,
        (rowIn + col(x0)) * 4,
        (rowIn + col(x0 + 1)) * 4,
        (rowIn + col(x0 + 2)) * 4,
        (rowIn + col(x0 + 3)) * 4,
        phase[r],
      )
      const o = (rowOut + X) * 4
      mid[o] = acc[0]
      mid[o + 1] = acc[1]
      mid[o + 2] = acc[2]
      mid[o + 3] = acc[3]
    }
  }
  // Vertical pass: W × h → W × H, then un-premultiply.
  const out = new Uint8ClampedArray(W * H * 4)
  const row = (yy: number): number => (yy < 0 ? 0 : yy >= h ? h - 1 : yy) * W
  for (let Y = 0; Y < H; Y++) {
    const q = Math.floor(Y / k)
    const r = Y - q * k
    const y0 = q + offset[r] - 1
    const r0 = row(y0)
    const r1 = row(y0 + 1)
    const r2 = row(y0 + 2)
    const r3 = row(y0 + 3)
    for (let X = 0; X < W; X++) {
      tap(mid, (r0 + X) * 4, (r1 + X) * 4, (r2 + X) * 4, (r3 + X) * 4, phase[r])
      const o = (Y * W + X) * 4
      const ca = acc[3]
      out[o + 3] = Math.round(clampTo(ca, 255))
      if (ca <= 0) continue
      const inv = 255 / ca
      out[o] = Math.round(clampTo(acc[0] * inv, 255))
      out[o + 1] = Math.round(clampTo(acc[1] * inv, 255))
      out[o + 2] = Math.round(clampTo(acc[2] * inv, 255))
    }
  }
  return { width: W, height: H, data: out }
}
