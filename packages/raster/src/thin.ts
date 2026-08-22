/**
 * Skeletonization (Zhang & Suen 1984) and the 3-4 chamfer distance transform
 * (Borgefors 1986), plus stroke-width estimation over a skeleton.
 */
import type { BinaryMask } from '@vectorizer/core'

/**
 * Classic two-subiteration Zhang-Suen thinning on a copy of the mask,
 * iterated until stable. Neighbors are P2..P9 = N, NE, E, SE, S, SW, W, NW;
 * pixels outside the image count as 0.
 */
export function zhangSuenThin(mask: BinaryMask): BinaryMask {
  const { width: w, height: h } = mask
  const n = w * h
  const img = new Uint8Array(n)
  for (let i = 0; i < n; i++) img[i] = mask.data[i] !== 0 ? 1 : 0
  const del = new Int32Array(n)

  let changed = true
  while (changed) {
    changed = false
    for (let pass = 0; pass < 2; pass++) {
      let cnt = 0
      for (let y = 0; y < h; y++) {
        const up = y > 0
        const dn = y < h - 1
        for (let x = 0; x < w; x++) {
          const i = y * w + x
          if (img[i] === 0) continue
          const lf = x > 0
          const rt = x < w - 1
          const p2 = up ? img[i - w] : 0
          const p3 = up && rt ? img[i - w + 1] : 0
          const p4 = rt ? img[i + 1] : 0
          const p5 = dn && rt ? img[i + w + 1] : 0
          const p6 = dn ? img[i + w] : 0
          const p7 = dn && lf ? img[i + w - 1] : 0
          const p8 = lf ? img[i - 1] : 0
          const p9 = up && lf ? img[i - w - 1] : 0
          const b = p2 + p3 + p4 + p5 + p6 + p7 + p8 + p9
          if (b < 2 || b > 6) continue
          let a = 0
          if (p2 === 0 && p3 === 1) a++
          if (p3 === 0 && p4 === 1) a++
          if (p4 === 0 && p5 === 1) a++
          if (p5 === 0 && p6 === 1) a++
          if (p6 === 0 && p7 === 1) a++
          if (p7 === 0 && p8 === 1) a++
          if (p8 === 0 && p9 === 1) a++
          if (p9 === 0 && p2 === 1) a++
          if (a !== 1) continue
          if (pass === 0) {
            if (p2 * p4 * p6 !== 0 || p4 * p6 * p8 !== 0) continue
          } else if (p2 * p4 * p8 !== 0 || p2 * p6 * p8 !== 0) {
            continue
          }
          del[cnt++] = i
        }
      }
      if (cnt > 0) {
        changed = true
        for (let d = 0; d < cnt; d++) img[del[d]] = 0
      }
    }
  }
  return { width: w, height: h, data: img }
}

/**
 * 3-4 chamfer distance transform (Borgefors 1986), two passes, final
 * distances divided by 3 so values approximate pixels. Background pixels are
 * 0; foreground pixels hold the distance to the nearest background pixel.
 */
export function chamferDistance(mask: BinaryMask): Float32Array {
  const { width: w, height: h, data } = mask
  const n = w * h
  const INF = 1e9
  const d = new Float32Array(n)
  for (let i = 0; i < n; i++) d[i] = data[i] !== 0 ? INF : 0

  // Forward pass (top-left → bottom-right).
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      let v = d[i]
      if (v === 0) continue
      if (x > 0 && d[i - 1] + 3 < v) v = d[i - 1] + 3
      if (y > 0) {
        if (d[i - w] + 3 < v) v = d[i - w] + 3
        if (x > 0 && d[i - w - 1] + 4 < v) v = d[i - w - 1] + 4
        if (x < w - 1 && d[i - w + 1] + 4 < v) v = d[i - w + 1] + 4
      }
      d[i] = v
    }
  }
  // Backward pass (bottom-right → top-left).
  for (let y = h - 1; y >= 0; y--) {
    for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x
      let v = d[i]
      if (v === 0) continue
      if (x < w - 1 && d[i + 1] + 3 < v) v = d[i + 1] + 3
      if (y < h - 1) {
        if (d[i + w] + 3 < v) v = d[i + w] + 3
        if (x < w - 1 && d[i + w + 1] + 4 < v) v = d[i + w + 1] + 4
        if (x > 0 && d[i + w - 1] + 4 < v) v = d[i + w - 1] + 4
      }
      d[i] = v
    }
  }
  for (let i = 0; i < n; i++) d[i] /= 3
  return d
}

/**
 * Median of `2 × chamferDistance(mask)` over the skeleton pixels — a robust
 * estimate of the ink stroke width in pixels. Returns 1 when the skeleton is
 * empty.
 */
export function estimateStrokeWidth(mask: BinaryMask, skeleton: BinaryMask): number {
  const dist = chamferDistance(mask)
  const sk = skeleton.data
  const vals = new Float32Array(dist.length)
  let cnt = 0
  for (let i = 0; i < sk.length; i++) {
    if (sk[i] !== 0) vals[cnt++] = 2 * dist[i]
  }
  if (cnt === 0) return 1
  const view = vals.subarray(0, cnt)
  view.sort()
  const mid = cnt >> 1
  return cnt % 2 === 1 ? view[mid] : (view[mid - 1] + view[mid]) / 2
}
