/**
 * Perceptual and geometric image metrics for scoring a vectorized render
 * against its source: windowed SSIM (Wang et al. 2004) on luminance, and
 * boundary Hausdorff distance / boundary IoU over the L1-RGB-gradient edge
 * masks the rest of the package already computes. Pure, deterministic — no
 * ML, no wall-clock — so the same functions score in Node (the eval
 * harnesses) and in the app's fidelity worker.
 */
import type { RasterImage } from '@trazor/core'
import { detectEdges } from './edges'
import { dilate } from './morphology'
import { chamferDistance } from './thin'

/** 1-D Gaussian, σ = 1.5 over radius 5 — Wang et al. 2004's 11×11 window. */
const SSIM_R = 5
const SSIM_SIGMA = 1.5
const SSIM_KERNEL: readonly number[] = (() => {
  const k = new Array<number>(2 * SSIM_R + 1)
  let sum = 0
  for (let i = -SSIM_R; i <= SSIM_R; i++) {
    const v = Math.exp(-(i * i) / (2 * SSIM_SIGMA * SSIM_SIGMA))
    k[i + SSIM_R] = v
    sum += v
  }
  for (let i = 0; i < k.length; i++) k[i] /= sum
  return k
})()

/** BT.601 luminance of one RGBA pixel, 0..1 (alpha ignored). */
function luma(data: Uint8ClampedArray, i: number): number {
  return (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
}

/** Mirror-repeating index for the separable blur's padding. */
function mirror(v: number, size: number): number {
  if (v < 0) v = -v
  if (v >= size) v = 2 * size - 2 - v
  return v < 0 ? 0 : v // only a 1-px-wide image can land here
}

/** Separable Gaussian blur of `src` (w×h) into `out`, mirror padding. */
function gaussBlur(src: Float32Array, w: number, h: number, out: Float32Array): void {
  const n = w * h
  const tmp = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -SSIM_R; i <= SSIM_R; i++) {
        acc += src[row + mirror(x + i, w)] * SSIM_KERNEL[i + SSIM_R]
      }
      tmp[row + x] = acc
    }
  }
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let acc = 0
      for (let i = -SSIM_R; i <= SSIM_R; i++) {
        acc += tmp[mirror(y + i, h) * w + x] * SSIM_KERNEL[i + SSIM_R]
      }
      out[row + x] = acc
    }
  }
}

/**
 * Mean windowed SSIM (Wang et al. 2004) between two equally-sized RGBA
 * rasters, on the BT.601 luminance, Gaussian 11×11 window (σ = 1.5), with
 * the standard stability constants C1 = (0.01·L)², C2 = (0.03·L)² at L = 1.
 * 1 = identical structure; callers composite over a background first (alpha
 * is ignored).
 */
export function ssim(a: RasterImage, b: RasterImage): number {
  const w = a.width
  const h = a.height
  const n = w * h
  const x = new Float32Array(n)
  const y = new Float32Array(n)
  for (let p = 0, i = 0; p < n; p++, i += 4) {
    x[p] = luma(a.data, i)
    y[p] = luma(b.data, i)
  }
  const xx = new Float32Array(n)
  const yy = new Float32Array(n)
  const xy = new Float32Array(n)
  for (let p = 0; p < n; p++) {
    xx[p] = x[p] * x[p]
    yy[p] = y[p] * y[p]
    xy[p] = x[p] * y[p]
  }
  const mx = new Float32Array(n)
  const my = new Float32Array(n)
  const mxx = new Float32Array(n)
  const myy = new Float32Array(n)
  const mxy = new Float32Array(n)
  gaussBlur(x, w, h, mx)
  gaussBlur(y, w, h, my)
  gaussBlur(xx, w, h, mxx)
  gaussBlur(yy, w, h, myy)
  gaussBlur(xy, w, h, mxy)

  const C1 = 0.01 * 0.01
  const C2 = 0.03 * 0.03
  let sum = 0
  for (let p = 0; p < n; p++) {
    const ux = mx[p]
    const uy = my[p]
    const sx = mxx[p] - ux * ux
    const sy = myy[p] - uy * uy
    const sxy = mxy[p] - ux * uy
    sum += ((2 * ux * uy + C1) * (2 * sxy + C2)) / ((ux * ux + uy * uy + C1) * (sx + sy + C2))
  }
  return n > 0 ? sum / n : 1
}

/** Distance from every pixel to the nearest set pixel of `edge` (chamfer, ≈ px). */
function distanceToEdges(edge: Uint8Array, width: number, height: number): Float32Array {
  const n = width * height
  const inv = new Uint8Array(n)
  for (let i = 0; i < n; i++) inv[i] = edge[i] !== 0 ? 0 : 1
  return chamferDistance({ width, height, data: inv })
}

/** Directed Hausdorff: max over set pixels of `edge` of the distance field. */
function directed(edge: Uint8Array, dist: Float32Array): number {
  let max = 0
  for (let i = 0; i < edge.length; i++) {
    if (edge[i] !== 0 && dist[i] > max) max = dist[i]
  }
  return max
}

/**
 * Symmetric Hausdorff distance (pixels) between the boundary pixels of two
 * equally-sized rasters, where a boundary pixel has an L1 RGB gradient ≥
 * `edgeThreshold` (the `detectEdges` criterion). Distances come from the 3-4
 * chamfer transform, so they approximate pixels (Borgefors 1986). Infinity
 * when exactly one image has edges; 0 when neither does.
 */
export function hausdorff(a: RasterImage, b: RasterImage, edgeThreshold = 48): number {
  const ea = detectEdges(a, edgeThreshold).data
  const eb = detectEdges(b, edgeThreshold).data
  const da = distanceToEdges(ea, a.width, a.height)
  const db = distanceToEdges(eb, b.width, b.height)
  // The chamfer transform caps distance at ~3.3e8 (its INF marker / 3); that
  // only happens when one image has no edge pixels at all.
  const out = Math.max(directed(ea, db), directed(eb, da))
  return out > 1e6 ? Infinity : out
}

/**
 * IoU of the two rasters' boundary bands: each edge mask (same criterion as
 * {@link hausdorff}) dilated by `tolerance` pixels, intersection over union.
 * 1 = boundaries coincide within the tolerance; 0 = no overlap. A tolerance
 * keeps the score meaningful when two traces are both close but a pixel off.
 */
export function boundaryIoU(
  a: RasterImage,
  b: RasterImage,
  edgeThreshold = 48,
  tolerance = 2,
): number {
  const da = dilate(detectEdges(a, edgeThreshold), tolerance).data
  const db = dilate(detectEdges(b, edgeThreshold), tolerance).data
  let inter = 0
  let union = 0
  for (let i = 0; i < da.length; i++) {
    if (da[i] !== 0 && db[i] !== 0) inter++
    if (da[i] !== 0 || db[i] !== 0) union++
  }
  return union > 0 ? inter / union : 1
}
