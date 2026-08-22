/**
 * Denoising / smoothing filters. All return new images:
 * - gaussianBlur blurs all four channels (alpha included),
 * - medianFilter and bilateralFilter filter RGB and copy alpha unchanged.
 * Bilateral filtering follows Tomasi & Manduchi 1998.
 */
import { cloneRaster } from '@vectorizer/core'
import type { RasterImage } from '@vectorizer/core'

/**
 * Separable Gaussian blur with `sigma = radius / 2` and kernel half-width
 * `ceil(3 * sigma)`. Samples outside the image are edge-clamped.
 */
export function gaussianBlur(image: RasterImage, radius: number): RasterImage {
  const { width: w, height: h, data } = image
  if (radius <= 0) return cloneRaster(image)
  const sigma = radius / 2
  const half = Math.ceil(3 * sigma)
  const kernel = new Float64Array(2 * half + 1)
  let ksum = 0
  for (let i = -half; i <= half; i++) {
    const v = Math.exp(-(i * i) / (2 * sigma * sigma))
    kernel[i + half] = v
    ksum += v
  }
  for (let i = 0; i < kernel.length; i++) kernel[i] /= ksum

  // Horizontal pass into a float intermediate.
  const mid = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let t = -half; t <= half; t++) {
        let sx = x + t
        if (sx < 0) sx = 0
        else if (sx >= w) sx = w - 1
        const wgt = kernel[t + half]
        const p = (row + sx) * 4
        r += data[p] * wgt
        g += data[p + 1] * wgt
        b += data[p + 2] * wgt
        a += data[p + 3] * wgt
      }
      const q = (row + x) * 4
      mid[q] = r
      mid[q + 1] = g
      mid[q + 2] = b
      mid[q + 3] = a
    }
  }

  // Vertical pass into the output bytes.
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0
      let g = 0
      let b = 0
      let a = 0
      for (let t = -half; t <= half; t++) {
        let sy = y + t
        if (sy < 0) sy = 0
        else if (sy >= h) sy = h - 1
        const wgt = kernel[t + half]
        const p = (sy * w + x) * 4
        r += mid[p] * wgt
        g += mid[p + 1] * wgt
        b += mid[p + 2] * wgt
        a += mid[p + 3] * wgt
      }
      const q = (y * w + x) * 4
      out[q] = Math.round(r)
      out[q + 1] = Math.round(g)
      out[q + 2] = Math.round(b)
      out[q + 3] = Math.round(a)
    }
  }
  return { width: w, height: h, data: out }
}

function insertionSort(arr: Int32Array, len: number): void {
  for (let i = 1; i < len; i++) {
    const v = arr[i]
    let j = i - 1
    while (j >= 0 && arr[j] > v) {
      arr[j + 1] = arr[j]
      j--
    }
    arr[j + 1] = v
  }
}

/**
 * Per-channel RGB median over a square window (`radius` 1 ⇒ 3×3). Windows are
 * clamped at the edges (median of the in-bounds samples; the upper median is
 * taken for even sample counts). Alpha is copied unchanged.
 */
export function medianFilter(image: RasterImage, radius: number): RasterImage {
  const { width: w, height: h, data } = image
  if (radius <= 0) return cloneRaster(image)
  const r = Math.max(1, Math.round(radius))
  const side = 2 * r + 1
  const cap = side * side
  const sr = new Int32Array(cap)
  const sg = new Int32Array(cap)
  const sb = new Int32Array(cap)
  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    const y0 = y - r < 0 ? 0 : y - r
    const y1 = y + r >= h ? h - 1 : y + r
    for (let x = 0; x < w; x++) {
      const x0 = x - r < 0 ? 0 : x - r
      const x1 = x + r >= w ? w - 1 : x + r
      let nn = 0
      for (let sy = y0; sy <= y1; sy++) {
        const row = sy * w
        for (let sx = x0; sx <= x1; sx++) {
          const p = (row + sx) * 4
          sr[nn] = data[p]
          sg[nn] = data[p + 1]
          sb[nn] = data[p + 2]
          nn++
        }
      }
      insertionSort(sr, nn)
      insertionSort(sg, nn)
      insertionSort(sb, nn)
      const m = nn >> 1
      const q = (y * w + x) * 4
      out[q] = sr[m]
      out[q + 1] = sg[m]
      out[q + 2] = sb[m]
      out[q + 3] = data[q + 3]
    }
  }
  return { width: w, height: h, data: out }
}

/**
 * Edge-preserving bilateral filter (Tomasi & Manduchi 1998):
 * `weight = spatialGauss(dx, dy) * rangeGauss(|ΔRGB|)`. The spatial kernel is
 * precomputed for the window and the range Gaussian is a 256-entry LUT indexed
 * by the rounded Euclidean RGB distance clamped to 255. Out-of-bounds samples
 * are skipped. Alpha is copied unchanged.
 */
export function bilateralFilter(
  image: RasterImage,
  radius: number,
  sigmaSpace: number,
  sigmaRange: number,
): RasterImage {
  const { width: w, height: h, data } = image
  if (radius <= 0) return cloneRaster(image)
  const r = Math.max(1, Math.round(radius))
  const ss = sigmaSpace > 1e-3 ? sigmaSpace : 1e-3
  const sq = sigmaRange > 1e-3 ? sigmaRange : 1e-3
  const side = 2 * r + 1
  const spatial = new Float64Array(side * side)
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      spatial[(dy + r) * side + (dx + r)] = Math.exp(-(dx * dx + dy * dy) / (2 * ss * ss))
    }
  }
  const rangeLut = new Float64Array(256)
  for (let d = 0; d < 256; d++) rangeLut[d] = Math.exp(-(d * d) / (2 * sq * sq))

  const out = new Uint8ClampedArray(w * h * 4)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const q = (y * w + x) * 4
      const cr = data[q]
      const cg = data[q + 1]
      const cb = data[q + 2]
      let wsum = 0
      let ar = 0
      let ag = 0
      let ab = 0
      for (let dy = -r; dy <= r; dy++) {
        const sy = y + dy
        if (sy < 0 || sy >= h) continue
        const srow = sy * w
        const krow = (dy + r) * side
        for (let dx = -r; dx <= r; dx++) {
          const sx = x + dx
          if (sx < 0 || sx >= w) continue
          const p = (srow + sx) * 4
          const vr = data[p]
          const vg = data[p + 1]
          const vb = data[p + 2]
          const dr = vr - cr
          const dg = vg - cg
          const db = vb - cb
          let di = Math.round(Math.sqrt(dr * dr + dg * dg + db * db))
          if (di > 255) di = 255
          const wgt = spatial[krow + (dx + r)] * rangeLut[di]
          wsum += wgt
          ar += vr * wgt
          ag += vg * wgt
          ab += vb * wgt
        }
      }
      out[q] = Math.round(ar / wsum)
      out[q + 1] = Math.round(ag / wsum)
      out[q + 2] = Math.round(ab / wsum)
      out[q + 3] = data[q + 3]
    }
  }
  return { width: w, height: h, data: out }
}
