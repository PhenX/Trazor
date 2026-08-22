/** Synthetic-image builders shared by the raster tests. */
import type { BinaryMask, GrayImage, RasterImage } from '@vectorizer/core'

export type Rgba = [number, number, number, number]

/** Build a RasterImage from a per-pixel callback. */
export function rasterOf(
  width: number,
  height: number,
  px: (x: number, y: number) => Rgba,
): RasterImage {
  const data = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = px(x, y)
      const p = (y * width + x) * 4
      data[p] = r
      data[p + 1] = g
      data[p + 2] = b
      data[p + 3] = a
    }
  }
  return { width, height, data }
}

/** Build a GrayImage from a per-pixel callback. */
export function grayOf(
  width: number,
  height: number,
  px: (x: number, y: number) => number,
): GrayImage {
  const data = new Float32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = px(x, y)
  }
  return { width, height, data }
}

/** Build a BinaryMask from a per-pixel callback. */
export function maskOf(
  width: number,
  height: number,
  on: (x: number, y: number) => boolean,
): BinaryMask {
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = on(x, y) ? 1 : 0
  }
  return { width, height, data }
}

/** Per-channel means of an RGBA image, in byte units. */
export function channelMeans(image: RasterImage): [number, number, number, number] {
  const { data } = image
  const n = data.length / 4
  let r = 0
  let g = 0
  let b = 0
  let a = 0
  for (let p = 0; p < data.length; p += 4) {
    r += data[p]
    g += data[p + 1]
    b += data[p + 2]
    a += data[p + 3]
  }
  return [r / n, g / n, b / n, a / n]
}

/** True when the mask's foreground is a single 8-connected component. */
export function isConnected8(mask: BinaryMask): boolean {
  const { width: w, height: h, data } = mask
  const n = w * h
  let start = -1
  let total = 0
  for (let i = 0; i < n; i++) {
    if (data[i] !== 0) {
      if (start < 0) start = i
      total++
    }
  }
  if (total === 0) return true
  const seen = new Uint8Array(n)
  const stack = [start]
  seen[start] = 1
  let reached = 0
  while (stack.length > 0) {
    const p = stack.pop() as number
    reached++
    const x = p % w
    const y = (p / w) | 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        const nx = x + dx
        const ny = y + dy
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
        const q = ny * w + nx
        if (data[q] !== 0 && seen[q] === 0) {
          seen[q] = 1
          stack.push(q)
        }
      }
    }
  }
  return reached === total
}

/** True when the mask contains a fully-foreground 2×2 block (i.e. is thicker than 1px). */
export function hasSolid2x2(mask: BinaryMask): boolean {
  const { width: w, height: h, data } = mask
  for (let y = 0; y + 1 < h; y++) {
    for (let x = 0; x + 1 < w; x++) {
      const i = y * w + x
      if (data[i] !== 0 && data[i + 1] !== 0 && data[i + w] !== 0 && data[i + w + 1] !== 0) {
        return true
      }
    }
  }
  return false
}
