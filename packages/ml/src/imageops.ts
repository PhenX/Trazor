/**
 * Pure, typed-array image math for the ML preprocessing/postprocessing paths.
 * No DOM, no ONNX — everything here runs in Node and carries the unit tests.
 */

import type { BinaryMask, GrayImage, RasterImage } from '@vectorizer/core'

/** ImageNet mean/std on [0,1] channel values (u2net / rembg preprocessing). */
export const IMAGENET_MEAN: readonly [number, number, number] = [0.485, 0.456, 0.406]
export const IMAGENET_STD: readonly [number, number, number] = [0.229, 0.224, 0.225]

/** SAM pixel mean/std, applied to raw 0..255 channel values. */
export const SAM_MEAN: readonly [number, number, number] = [123.675, 116.28, 103.53]
export const SAM_STD: readonly [number, number, number] = [58.395, 57.12, 57.375]

interface BilinearAxis {
  lo: Int32Array
  hi: Int32Array
  frac: Float32Array
}

/** Precomputed source taps for one axis of a center-aligned, edge-clamped bilinear resize. */
function bilinearAxis(srcSize: number, dstSize: number): BilinearAxis {
  const lo = new Int32Array(dstSize)
  const hi = new Int32Array(dstSize)
  const frac = new Float32Array(dstSize)
  const ratio = srcSize / dstSize
  const last = srcSize - 1
  for (let d = 0; d < dstSize; d++) {
    // Pixel centers sit at +0.5 in both spaces.
    let s = (d + 0.5) * ratio - 0.5
    if (s < 0) s = 0
    if (s > last) s = last
    const i = Math.floor(s)
    lo[d] = i
    hi[d] = i < last ? i + 1 : last
    frac[d] = s - i
  }
  return { lo, hi, frac }
}

/** Bilinear resize of an interleaved RGBA image. Always returns a fresh image. */
export function bilinearResizeRgba(image: RasterImage, width: number, height: number): RasterImage {
  if (width <= 0 || height <= 0) throw new RangeError('resize target must be positive')
  if (width === image.width && height === image.height) {
    return { width, height, data: new Uint8ClampedArray(image.data) }
  }
  const src = image.data
  const dst = new Uint8ClampedArray(width * height * 4)
  const ax = bilinearAxis(image.width, width)
  const ay = bilinearAxis(image.height, height)
  const srcRow = image.width * 4
  let di = 0
  for (let y = 0; y < height; y++) {
    const r0 = ay.lo[y] * srcRow
    const r1 = ay.hi[y] * srcRow
    const fy = ay.frac[y]
    for (let x = 0; x < width; x++) {
      const c00 = r0 + ax.lo[x] * 4
      const c01 = r0 + ax.hi[x] * 4
      const c10 = r1 + ax.lo[x] * 4
      const c11 = r1 + ax.hi[x] * 4
      const fx = ax.frac[x]
      for (let c = 0; c < 4; c++) {
        const top = src[c00 + c] + (src[c01 + c] - src[c00 + c]) * fx
        const bottom = src[c10 + c] + (src[c11 + c] - src[c10 + c]) * fx
        dst[di++] = top + (bottom - top) * fy // Uint8ClampedArray rounds on store
      }
    }
  }
  return { width, height, data: dst }
}

/** Bilinear resize of a single-channel float plane (row-major, length ≥ srcWidth*srcHeight). */
export function bilinearResizePlane(
  src: Float32Array,
  srcWidth: number,
  srcHeight: number,
  dstWidth: number,
  dstHeight: number,
): Float32Array {
  if (srcWidth <= 0 || srcHeight <= 0 || dstWidth <= 0 || dstHeight <= 0) {
    throw new RangeError('plane dimensions must be positive')
  }
  if (src.length < srcWidth * srcHeight) throw new RangeError('plane shorter than its dimensions')
  const dst = new Float32Array(dstWidth * dstHeight)
  if (srcWidth === dstWidth && srcHeight === dstHeight) {
    dst.set(src.subarray(0, dst.length))
    return dst
  }
  const ax = bilinearAxis(srcWidth, dstWidth)
  const ay = bilinearAxis(srcHeight, dstHeight)
  let di = 0
  for (let y = 0; y < dstHeight; y++) {
    const r0 = ay.lo[y] * srcWidth
    const r1 = ay.hi[y] * srcWidth
    const fy = ay.frac[y]
    for (let x = 0; x < dstWidth; x++) {
      const x0 = ax.lo[x]
      const x1 = ax.hi[x]
      const fx = ax.frac[x]
      const top = src[r0 + x0] + (src[r0 + x1] - src[r0 + x0]) * fx
      const bottom = src[r1 + x0] + (src[r1 + x1] - src[r1 + x0]) * fx
      dst[di++] = top + (bottom - top) * fy
    }
  }
  return dst
}

export interface PackNchwOptions {
  /** Multiplier applied to raw byte values before any normalization (e.g. 1/255). Default 1. */
  scale?: number
  /**
   * rembg/u2net quirk: after scaling, divide every value by the global max over
   * all RGB samples of the image (not the padding), so the brightest channel
   * value becomes exactly 1 before mean/std.
   */
  divideByMax?: boolean
  /** Tensor plane width ≥ image.width; the right margin stays zero (SAM letterbox pad). */
  targetWidth?: number
  /** Tensor plane height ≥ image.height; the bottom margin stays zero. */
  targetHeight?: number
}

/**
 * Pack RGB (alpha ignored) into a `[3, targetHeight, targetWidth]` channel-major
 * Float32 tensor: `out = (byte*scale/maxValue − mean[c]) / std[c]`. Padding
 * outside the image region is left at 0 — i.e. zeros in normalized space,
 * matching the SAM processors that pad after normalization.
 */
export function packNchw(
  image: RasterImage,
  mean: readonly [number, number, number],
  std: readonly [number, number, number],
  opts: PackNchwOptions = {},
): Float32Array {
  const scale = opts.scale ?? 1
  const targetWidth = opts.targetWidth ?? image.width
  const targetHeight = opts.targetHeight ?? image.height
  if (targetWidth < image.width || targetHeight < image.height) {
    throw new RangeError('packNchw target must not be smaller than the image')
  }
  const { width, height, data } = image
  let maxValue = 1
  if (opts.divideByMax) {
    let max = 0
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > max) max = data[i]
      if (data[i + 1] > max) max = data[i + 1]
      if (data[i + 2] > max) max = data[i + 2]
    }
    maxValue = max > 0 ? max * scale : 1
  }
  const plane = targetWidth * targetHeight
  const out = new Float32Array(3 * plane)
  for (let c = 0; c < 3; c++) {
    const base = c * plane
    const m = mean[c]
    const invStd = 1 / std[c]
    for (let y = 0; y < height; y++) {
      let si = y * width * 4 + c
      let oi = base + y * targetWidth
      for (let x = 0; x < width; x++) {
        out[oi++] = ((data[si] * scale) / maxValue - m) * invStd
        si += 4
      }
    }
  }
  return out
}

/** Map a plane to [0,1] via min-max; a constant plane maps to all zeros. */
export function minMaxNormalize(plane: Float32Array): Float32Array {
  const out = new Float32Array(plane.length)
  if (plane.length === 0) return out
  let lo = Infinity
  let hi = -Infinity
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i]
    if (v < lo) lo = v
    if (v > hi) hi = v
  }
  const range = hi - lo
  if (range <= 0) return out
  const inv = 1 / range
  for (let i = 0; i < plane.length; i++) out[i] = (plane[i] - lo) * inv
  return out
}

/** Hermite smoothstep; degenerate edges (edge0 ≥ edge1) become a hard step at edge0. */
export function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 >= edge1) return x < edge0 ? 0 : 1
  let t = (x - edge0) / (edge1 - edge0)
  if (t < 0) t = 0
  if (t > 1) t = 1
  return t * t * (3 - 2 * t)
}

/**
 * Copy `image` with alpha replaced by
 * `round(smoothstep(threshold−feather, threshold+feather, matte) * srcAlpha)`.
 */
export function applyAlphaMatte(
  image: RasterImage,
  matte: GrayImage,
  threshold: number,
  feather: number,
): RasterImage {
  if (matte.width !== image.width || matte.height !== image.height) {
    throw new RangeError('matte dimensions must match the image')
  }
  const src = image.data
  const out = new Uint8ClampedArray(src)
  const m = matte.data
  const lo = threshold - feather
  const hi = threshold + feather
  for (let p = 0, i = 3; p < m.length; p++, i += 4) {
    out[i] = smoothstep(lo, hi, m[p]) * src[i]
  }
  return { width: image.width, height: image.height, data: out }
}

/** SAM-style letterbox: longest side scaled to `targetSize`, content at top-left. */
export interface Letterbox {
  /** Multiplier from source pixels to letterbox pixels. */
  scale: number
  /** Size of the resized content region inside the square (rest is zero padding). */
  resizedWidth: number
  resizedHeight: number
  /** Side of the square tensor (1024 for SAM). */
  targetSize: number
}

export function computeLetterbox(width: number, height: number, targetSize: number): Letterbox {
  if (width <= 0 || height <= 0 || targetSize <= 0) {
    throw new RangeError('letterbox dimensions must be positive')
  }
  const scale = targetSize / Math.max(width, height)
  const resizedWidth = Math.max(1, Math.min(targetSize, Math.round(width * scale)))
  const resizedHeight = Math.max(1, Math.min(targetSize, Math.round(height * scale)))
  return { scale, resizedWidth, resizedHeight, targetSize }
}

/** Map a source-space point into letterbox space (where prompts are expressed). */
export function mapPointToLetterbox(
  x: number,
  y: number,
  box: Letterbox,
): { x: number; y: number } {
  return { x: x * box.scale, y: y * box.scale }
}

/** Copy the `width`×`height` region at (x0, y0) out of a row-major plane. */
export function cropPlane(
  src: Float32Array,
  srcWidth: number,
  x0: number,
  y0: number,
  width: number,
  height: number,
): Float32Array {
  const out = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    const s = (y0 + y) * srcWidth + x0
    out.set(src.subarray(s, s + width), y * width)
  }
  return out
}

/** Index of the largest value (first on ties); -1 for an empty input. */
export function argmax(values: ArrayLike<number>): number {
  let best = -1
  let bestValue = -Infinity
  for (let i = 0; i < values.length; i++) {
    if (values[i] > bestValue) {
      bestValue = values[i]
      best = i
    }
  }
  return best
}

/** Threshold a float plane into a BinaryMask (strictly greater than `threshold`). */
export function planeToMask(
  plane: Float32Array,
  width: number,
  height: number,
  threshold = 0,
): BinaryMask {
  const data = new Uint8Array(width * height)
  for (let i = 0; i < data.length; i++) data[i] = plane[i] > threshold ? 1 : 0
  return { width, height, data }
}

/** Clamp a float plane into [0,1] in place-free fashion (fresh array). */
export function clampPlane01(plane: Float32Array): Float32Array {
  const out = new Float32Array(plane.length)
  for (let i = 0; i < plane.length; i++) {
    const v = plane[i]
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v
  }
  return out
}

/** Copy the `width`×`height` RGBA region at (x0, y0) out of an image (in-bounds). */
export function cropRgba(
  image: RasterImage,
  x0: number,
  y0: number,
  width: number,
  height: number,
): RasterImage {
  const src = image.data
  const out = new Uint8ClampedArray(width * height * 4)
  const srcRow = image.width * 4
  const dstRow = width * 4
  for (let y = 0; y < height; y++) {
    const s = (y0 + y) * srcRow + x0 * 4
    out.set(src.subarray(s, s + dstRow), y * dstRow)
  }
  return { width, height, data: out }
}

/** Top-left corner of one tile in a tiled sweep. */
export interface TilePlacement {
  x: number
  y: number
}

/** Start offsets that cover [0, size) with `tile`-wide windows stepping by `tile − overlap`, last window flush to the end. */
function axisStarts(size: number, tile: number, overlap: number): number[] {
  if (tile >= size) return [0]
  const step = Math.max(1, tile - overlap)
  const starts: number[] = []
  for (let s = 0; s < size - tile; s += step) starts.push(s)
  const last = size - tile
  if (starts[starts.length - 1] !== last) starts.push(last)
  return starts
}

/**
 * Cover a `width`×`height` image with overlapping `tileW`×`tileH` tiles (every
 * tile fully in-bounds; the trailing tiles are flush to the right/bottom edge).
 * A dimension smaller than its tile yields a single tile at 0.
 */
export function planTiles(
  width: number,
  height: number,
  tileW: number,
  tileH: number,
  overlap: number,
): TilePlacement[] {
  const xs = axisStarts(width, tileW, overlap)
  const ys = axisStarts(height, tileH, overlap)
  const out: TilePlacement[] = []
  for (const y of ys) for (const x of xs) out.push({ x, y })
  return out
}

/** Triangular window (peak at center, 1 at the edges) for seamless overlap blending. */
function triWindow(n: number): Float32Array {
  const w = new Float32Array(n)
  for (let i = 0; i < n; i++) w[i] = Math.min(i + 1, n - i)
  return w
}

/**
 * Blend per-tile planes back into one `width`×`height` plane by triangular-weighted
 * averaging over overlaps. `placements` and `planes` are parallel; each plane is
 * row-major `tileW`×`tileH`. Deterministic given the same inputs.
 */
export function stitchPlane(
  width: number,
  height: number,
  tileW: number,
  tileH: number,
  placements: readonly TilePlacement[],
  planes: readonly Float32Array[],
): Float32Array {
  const acc = new Float32Array(width * height)
  const wsum = new Float32Array(width * height)
  const wx = triWindow(tileW)
  const wy = triWindow(tileH)
  for (let t = 0; t < placements.length; t++) {
    const { x: px, y: py } = placements[t]
    const plane = planes[t]
    for (let ty = 0; ty < tileH; ty++) {
      const wyt = wy[ty]
      const accRow = (py + ty) * width
      const planeRow = ty * tileW
      for (let tx = 0; tx < tileW; tx++) {
        const w = wyt * wx[tx]
        const gi = accRow + px + tx
        acc[gi] += plane[planeRow + tx] * w
        wsum[gi] += w
      }
    }
  }
  const out = new Float32Array(width * height)
  for (let i = 0; i < out.length; i++) out[i] = wsum[i] > 0 ? acc[i] / wsum[i] : 0
  return out
}
