/**
 * Color quantization. Three paths:
 *
 * - fixed palette: caller-provided colors; clustering is skipped and pixels
 *   are labeled with the nearest palette entry (palette order preserved).
 * - exact: at most `k` distinct colors in the image → the palette is exactly
 *   those colors with direct label assignment (pixel-art fidelity).
 * - k-means++ (Arthur & Vassilvitskii 2007) seeded by mulberry32 on a
 *   deterministic pixel sample, Lloyd iterations scaled by `quality`.
 *
 * Everything is deterministic for a given input and seed.
 */
import { clampInt, hexToRgb, mulberry32, rgbToHex, rgbToOklab } from '@vectorizer/core'
import type { BinaryMask, LabelMap, RasterImage } from '@vectorizer/core'
import { toOklabBuffer } from './convert'

export interface QuantizeOptions {
  /** Target palette size, 2..64. Ignored when `fixedPalette` is used. */
  k: number
  colorSpace: 'oklab' | 'rgb'
  /** 1..10; scales the k-means sample size and iteration count. */
  quality: number
  seed: number
  /** `null`/absent ⇒ all pixels participate; 0-mask pixels get label -1. */
  mask?: BinaryMask | null
  /**
   * Restricts which in-mask pixels seed and refine the k-means centroids
   * (1 = eligible). Every in-mask pixel is still labeled; only the training
   * sample is filtered, so anti-aliased boundary pixels can be excluded from
   * clustering without dropping them from the output. Ignored on the exact and
   * fixed-palette paths. When too few pixels remain eligible the filter is
   * dropped (falls back to sampling all in-mask pixels). Absent ⇒ no effect
   * (byte-identical to sampling all in-mask pixels).
   */
  sampleMask?: BinaryMask | null
  /** Merge near-duplicate centroids (Oklab distance < 0.03) after k-means. */
  autoK?: boolean
  /**
   * Non-empty ⇒ skip clustering: the palette is exactly these '#rrggbb'
   * colors in the given order (invalid entries dropped; if none are valid the
   * normal clustering path runs). Zero-count entries keep their label slot.
   */
  fixedPalette?: string[] | null
}

export interface QuantizeResult {
  /** -1 for masked-out pixels; `count` = final palette size. */
  labels: LabelMap
  paletteHex: string[]
  /** count * 3 bytes. */
  paletteRgb: Uint8Array
  /** Pixels per label, length count. */
  counts: Uint32Array
}

/** Oklab distance below which `autoK` merges two centroids. */
const MERGE_DIST = 0.03

/**
 * Label every in-mask pixel with its nearest centroid; returns per-label pixel
 * counts. When `rgbSums` is given (length m*3) it accumulates the summed RGB
 * bytes of each label's pixels, so callers can derive exact mean palette
 * colors without a lossy feature-space → sRGB back-projection.
 */
function assignNearest(
  labelData: Int32Array,
  cent: Float32Array,
  m: number,
  data: Uint8ClampedArray,
  feat: Float32Array | null,
  mask: Uint8Array | null,
  n: number,
  rgbSums: Float64Array | null,
): Uint32Array {
  const counts = new Uint32Array(m)
  // Memoize the nearest centroid per distinct RGB color: the label a color maps
  // to is deterministic, so the full-image pass costs one k-way search per
  // distinct color instead of per pixel (counts/sums are still accumulated per
  // pixel). Identical output; far fewer distance evaluations when colors repeat.
  const memo = new Map<number, number>()
  if (feat !== null) {
    for (let i = 0, o = 0, p = 0; i < n; i++, o += 3, p += 4) {
      if (mask !== null && mask[i] === 0) {
        labelData[i] = -1
        continue
      }
      const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
      let best = memo.get(key)
      if (best === undefined) {
        const x = feat[o]
        const y = feat[o + 1]
        const z = feat[o + 2]
        best = 0
        let bestD = Infinity
        for (let c = 0, cc = 0; c < m; c++, cc += 3) {
          const dx = x - cent[cc]
          const dy = y - cent[cc + 1]
          const dz = z - cent[cc + 2]
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < bestD) {
            bestD = d2
            best = c
          }
        }
        memo.set(key, best)
      }
      labelData[i] = best
      counts[best]++
      if (rgbSums !== null) {
        const b3 = best * 3
        rgbSums[b3] += data[p]
        rgbSums[b3 + 1] += data[p + 1]
        rgbSums[b3 + 2] += data[p + 2]
      }
    }
  } else {
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (mask !== null && mask[i] === 0) {
        labelData[i] = -1
        continue
      }
      const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
      let best = memo.get(key)
      if (best === undefined) {
        const x = data[p] / 255
        const y = data[p + 1] / 255
        const z = data[p + 2] / 255
        best = 0
        let bestD = Infinity
        for (let c = 0, cc = 0; c < m; c++, cc += 3) {
          const dx = x - cent[cc]
          const dy = y - cent[cc + 1]
          const dz = z - cent[cc + 2]
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < bestD) {
            bestD = d2
            best = c
          }
        }
        memo.set(key, best)
      }
      labelData[i] = best
      counts[best]++
      if (rgbSums !== null) {
        const b3 = best * 3
        rgbSums[b3] += data[p]
        rgbSums[b3 + 1] += data[p + 1]
        rgbSums[b3 + 2] += data[p + 2]
      }
    }
  }
  return counts
}

/** Sort positions [0, len) by count descending, ties by original index ascending. */
function orderByCountDesc(counts: ArrayLike<number>, len: number): number[] {
  const order: number[] = new Array(len)
  for (let i = 0; i < len; i++) order[i] = i
  order.sort((a, b) => counts[b] - counts[a] || a - b)
  return order
}

export function quantize(image: RasterImage, opts: QuantizeOptions): QuantizeResult {
  const { width, height, data } = image
  const n = width * height
  const k = clampInt(opts.k, 2, 64)
  const quality = clampInt(opts.quality, 1, 10)
  const mask = opts.mask ? opts.mask.data : null
  const useOklab = opts.colorSpace === 'oklab'
  const labelData = new Int32Array(n)

  // ---- fixed-palette path: no clustering, nearest-color labeling only ----
  const fixed = opts.fixedPalette
  if (fixed != null && fixed.length > 0) {
    const valid: Array<[number, number, number]> = []
    for (const hex of fixed) {
      const rgb = hexToRgb(hex)
      if (rgb !== null) valid.push(rgb)
    }
    if (valid.length > 0) {
      const m = valid.length
      const cent = new Float32Array(m * 3)
      const paletteRgb = new Uint8Array(m * 3)
      const paletteHex: string[] = []
      for (let c = 0; c < m; c++) {
        const [r, g, b] = valid[c]
        paletteRgb[c * 3] = r
        paletteRgb[c * 3 + 1] = g
        paletteRgb[c * 3 + 2] = b
        paletteHex.push(rgbToHex(r, g, b))
        if (useOklab) {
          const [L, A, B] = rgbToOklab(r / 255, g / 255, b / 255)
          cent[c * 3] = L
          cent[c * 3 + 1] = A
          cent[c * 3 + 2] = B
        } else {
          cent[c * 3] = r / 255
          cent[c * 3 + 1] = g / 255
          cent[c * 3 + 2] = b / 255
        }
      }
      const feat = useOklab ? toOklabBuffer(image) : null
      const counts = assignNearest(labelData, cent, m, data, feat, mask, n, null)
      return {
        labels: { width, height, data: labelData, count: m },
        paletteHex,
        paletteRgb,
        counts,
      }
    }
    // No valid entries — fall through to normal clustering.
  }

  // ---- distinct-color scan (exact path for images with few colors) ----
  // The spec caps this scan at 1 << 16 distinct colors; since k ≤ 64 the
  // outcome is decided as soon as the count exceeds k, so we stop there.
  const distinct = new Map<number, number>()
  let inMask = 0
  let overflow = false
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    if (mask !== null) {
      if (mask[i] === 0) continue
      inMask++
    }
    if (overflow) continue
    const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
    const seen = distinct.get(key)
    if (seen === undefined) {
      if (distinct.size === k) {
        overflow = true
        distinct.clear()
        if (mask === null) break
        continue
      }
      distinct.set(key, 1)
    } else {
      distinct.set(key, seen + 1)
    }
  }
  if (mask === null) inMask = n

  if (inMask === 0) {
    labelData.fill(-1)
    return {
      labels: { width, height, data: labelData, count: 0 },
      paletteHex: [],
      paletteRgb: new Uint8Array(0),
      counts: new Uint32Array(0),
    }
  }

  if (!overflow) {
    // ---- exact path: palette is exactly the distinct colors ----
    const m = distinct.size
    const keys = new Int32Array(m)
    const rawCounts = new Uint32Array(m)
    const indexOf = new Map<number, number>()
    let j = 0
    for (const [key, cnt] of distinct) {
      keys[j] = key
      rawCounts[j] = cnt
      indexOf.set(key, j)
      j++
    }
    const order = orderByCountDesc(rawCounts, m)
    const rank = new Int32Array(m)
    const paletteRgb = new Uint8Array(m * 3)
    const paletteHex: string[] = []
    const counts = new Uint32Array(m)
    for (let pos = 0; pos < m; pos++) {
      const src = order[pos]
      rank[src] = pos
      const key = keys[src]
      const r = (key >> 16) & 0xff
      const g = (key >> 8) & 0xff
      const b = key & 0xff
      paletteRgb[pos * 3] = r
      paletteRgb[pos * 3 + 1] = g
      paletteRgb[pos * 3 + 2] = b
      paletteHex.push(rgbToHex(r, g, b))
      counts[pos] = rawCounts[src]
    }
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      if (mask !== null && mask[i] === 0) {
        labelData[i] = -1
        continue
      }
      const key = (data[p] << 16) | (data[p + 1] << 8) | data[p + 2]
      labelData[i] = rank[indexOf.get(key) as number]
    }
    return { labels: { width, height, data: labelData, count: m }, paletteHex, paletteRgb, counts }
  }

  // ---- k-means path ----
  const feat = useOklab ? toOklabBuffer(image) : null
  const rng = mulberry32(opts.seed)

  // Optional edge-aware pool: pixels eligible to train the centroids. Built
  // only when a sampleMask is supplied and it leaves enough pixels; otherwise
  // the classical all-in-mask sampling runs unchanged (byte-identical).
  const smask = opts.sampleMask ? opts.sampleMask.data : null
  let poolIdx: Int32Array | null = null
  let poolCount = inMask
  if (smask !== null) {
    let count = 0
    for (let i = 0; i < n; i++) {
      if ((mask === null || mask[i] !== 0) && smask[i] !== 0) count++
    }
    // Keep the filter only when it leaves a representative sample.
    if (count >= Math.max(k, 256)) {
      const pool = new Int32Array(count)
      let j = 0
      for (let i = 0; i < n; i++) {
        if ((mask === null || mask[i] !== 0) && smask[i] !== 0) pool[j++] = i
      }
      poolIdx = pool
      poolCount = count
    }
  }

  // Deterministic pixel sample.
  const sampleN = Math.min(poolCount, 20000 + quality * 20000)
  const samplePix = new Int32Array(sampleN)
  if (poolIdx !== null) {
    if (poolCount <= sampleN) {
      for (let s = 0; s < poolCount; s++) samplePix[s] = poolIdx[s]
    } else {
      for (let s = 0; s < sampleN; s++) samplePix[s] = poolIdx[(rng() * poolCount) | 0]
    }
  } else if (inMask <= sampleN) {
    let s = 0
    for (let i = 0; i < n; i++) {
      if (mask === null || mask[i] !== 0) samplePix[s++] = i
    }
  } else if (mask === null) {
    for (let s = 0; s < sampleN; s++) samplePix[s] = (rng() * n) | 0
  } else {
    const inIdx = new Int32Array(inMask)
    let j2 = 0
    for (let i = 0; i < n; i++) {
      if (mask[i] !== 0) inIdx[j2++] = i
    }
    for (let s = 0; s < sampleN; s++) samplePix[s] = inIdx[(rng() * inMask) | 0]
  }

  const sf = new Float32Array(sampleN * 3)
  if (feat !== null) {
    for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
      const f = samplePix[s] * 3
      sf[o] = feat[f]
      sf[o + 1] = feat[f + 1]
      sf[o + 2] = feat[f + 2]
    }
  } else {
    for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
      const p = samplePix[s] * 4
      sf[o] = data[p] / 255
      sf[o + 1] = data[p + 1] / 255
      sf[o + 2] = data[p + 2] / 255
    }
  }

  // k-means++ seeding (D² weighting).
  const cent = new Float32Array(k * 3)
  const minD2 = new Float64Array(sampleN).fill(Infinity)
  const first = ((rng() * sampleN) | 0) * 3
  cent[0] = sf[first]
  cent[1] = sf[first + 1]
  cent[2] = sf[first + 2]
  for (let c = 1; c < k; c++) {
    const px = cent[(c - 1) * 3]
    const py = cent[(c - 1) * 3 + 1]
    const pz = cent[(c - 1) * 3 + 2]
    let total = 0
    for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
      const dx = sf[o] - px
      const dy = sf[o + 1] - py
      const dz = sf[o + 2] - pz
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < minD2[s]) minD2[s] = d2
      total += minD2[s]
    }
    let pick = sampleN - 1
    if (total > 0) {
      const target = rng() * total
      let acc = 0
      for (let s = 0; s < sampleN; s++) {
        acc += minD2[s]
        if (acc >= target) {
          pick = s
          break
        }
      }
    } else {
      pick = (rng() * sampleN) | 0
    }
    cent[c * 3] = sf[pick * 3]
    cent[c * 3 + 1] = sf[pick * 3 + 1]
    cent[c * 3 + 2] = sf[pick * 3 + 2]
  }

  // Lloyd iterations, early exit on convergence.
  const iters = 8 + 3 * quality
  const sums = new Float64Array(k * 3)
  const cnt = new Uint32Array(k)
  for (let it = 0; it < iters; it++) {
    sums.fill(0)
    cnt.fill(0)
    for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
      const x = sf[o]
      const y = sf[o + 1]
      const z = sf[o + 2]
      let best = 0
      let bestD = Infinity
      for (let c = 0, cc = 0; c < k; c++, cc += 3) {
        const dx = x - cent[cc]
        const dy = y - cent[cc + 1]
        const dz = z - cent[cc + 2]
        const d2 = dx * dx + dy * dy + dz * dz
        if (d2 < bestD) {
          bestD = d2
          best = c
        }
      }
      const b3 = best * 3
      sums[b3] += x
      sums[b3 + 1] += y
      sums[b3 + 2] += z
      cnt[best]++
    }
    let maxMove = 0
    for (let c = 0, cc = 0; c < k; c++, cc += 3) {
      if (cnt[c] === 0) continue // empty cluster keeps its position
      const inv = 1 / cnt[c]
      const nx = sums[cc] * inv
      const ny = sums[cc + 1] * inv
      const nz = sums[cc + 2] * inv
      const dx = nx - cent[cc]
      const dy = ny - cent[cc + 1]
      const dz = nz - cent[cc + 2]
      const move = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (move > maxMove) maxMove = move
      cent[cc] = nx
      cent[cc + 1] = ny
      cent[cc + 2] = nz
    }
    if (maxMove < 1e-4) break
  }

  // Final pass: label every in-mask pixel by nearest centroid, accumulating
  // exact per-cluster RGB sums for the output palette.
  const rgbSums = new Float64Array(k * 3)
  let fullCounts = assignNearest(labelData, cent, k, data, feat, mask, n, rgbSums)

  // Drop centroids that won zero pixels so the palette only contains used colors.
  let m = 0
  const compact = new Int32Array(k)
  for (let c = 0; c < k; c++) {
    if (fullCounts[c] === 0) {
      compact[c] = -1
      continue
    }
    compact[c] = m
    cent[m * 3] = cent[c * 3]
    cent[m * 3 + 1] = cent[c * 3 + 1]
    cent[m * 3 + 2] = cent[c * 3 + 2]
    rgbSums[m * 3] = rgbSums[c * 3]
    rgbSums[m * 3 + 1] = rgbSums[c * 3 + 1]
    rgbSums[m * 3 + 2] = rgbSums[c * 3 + 2]
    fullCounts[m] = fullCounts[c]
    m++
  }
  if (m < k) {
    for (let i = 0; i < n; i++) {
      if (labelData[i] >= 0) labelData[i] = compact[labelData[i]]
    }
    fullCounts = fullCounts.slice(0, m)
  }

  // autoK: greedily merge centroid pairs closer than MERGE_DIST in Oklab.
  if (opts.autoK === true && m > 1) {
    const lab = new Float64Array(m * 3)
    for (let c = 0; c < m; c++) {
      if (useOklab) {
        lab[c * 3] = cent[c * 3]
        lab[c * 3 + 1] = cent[c * 3 + 1]
        lab[c * 3 + 2] = cent[c * 3 + 2]
      } else {
        const [L, A, B] = rgbToOklab(cent[c * 3], cent[c * 3 + 1], cent[c * 3 + 2])
        lab[c * 3] = L
        lab[c * 3 + 1] = A
        lab[c * 3 + 2] = B
      }
    }
    const alive = new Uint8Array(m).fill(1)
    const parent = new Int32Array(m)
    for (let c = 0; c < m; c++) parent[c] = c
    const limit = MERGE_DIST * MERGE_DIST
    for (;;) {
      let bi = -1
      let bj = -1
      let bestD = Infinity
      for (let i = 0; i < m; i++) {
        if (alive[i] === 0) continue
        for (let j = i + 1; j < m; j++) {
          if (alive[j] === 0) continue
          const dx = lab[i * 3] - lab[j * 3]
          const dy = lab[i * 3 + 1] - lab[j * 3 + 1]
          const dz = lab[i * 3 + 2] - lab[j * 3 + 2]
          const d2 = dx * dx + dy * dy + dz * dz
          if (d2 < bestD) {
            bestD = d2
            bi = i
            bj = j
          }
        }
      }
      if (bi < 0 || bestD >= limit) break
      // Merge bj into bi: count-weighted average in the working color space.
      const wi = fullCounts[bi]
      const wj = fullCounts[bj]
      const wt = wi + wj
      cent[bi * 3] = (cent[bi * 3] * wi + cent[bj * 3] * wj) / wt
      cent[bi * 3 + 1] = (cent[bi * 3 + 1] * wi + cent[bj * 3 + 1] * wj) / wt
      cent[bi * 3 + 2] = (cent[bi * 3 + 2] * wi + cent[bj * 3 + 2] * wj) / wt
      rgbSums[bi * 3] += rgbSums[bj * 3]
      rgbSums[bi * 3 + 1] += rgbSums[bj * 3 + 1]
      rgbSums[bi * 3 + 2] += rgbSums[bj * 3 + 2]
      fullCounts[bi] = wt
      alive[bj] = 0
      parent[bj] = bi
      if (useOklab) {
        lab[bi * 3] = cent[bi * 3]
        lab[bi * 3 + 1] = cent[bi * 3 + 1]
        lab[bi * 3 + 2] = cent[bi * 3 + 2]
      } else {
        const [L, A, B] = rgbToOklab(cent[bi * 3], cent[bi * 3 + 1], cent[bi * 3 + 2])
        lab[bi * 3] = L
        lab[bi * 3 + 1] = A
        lab[bi * 3 + 2] = B
      }
    }
    // Compact survivors and remap labels (chasing merge chains to their root).
    const toCompact = new Int32Array(m)
    let m2 = 0
    for (let c = 0; c < m; c++) {
      if (alive[c] === 0) continue
      toCompact[c] = m2
      cent[m2 * 3] = cent[c * 3]
      cent[m2 * 3 + 1] = cent[c * 3 + 1]
      cent[m2 * 3 + 2] = cent[c * 3 + 2]
      rgbSums[m2 * 3] = rgbSums[c * 3]
      rgbSums[m2 * 3 + 1] = rgbSums[c * 3 + 1]
      rgbSums[m2 * 3 + 2] = rgbSums[c * 3 + 2]
      fullCounts[m2] = fullCounts[c]
      m2++
    }
    if (m2 < m) {
      const remap = new Int32Array(m)
      for (let c = 0; c < m; c++) {
        let root = c
        while (parent[root] !== root) root = parent[root]
        remap[c] = toCompact[root]
      }
      for (let i = 0; i < n; i++) {
        if (labelData[i] >= 0) labelData[i] = remap[labelData[i]]
      }
      fullCounts = fullCounts.slice(0, m2)
      m = m2
    }
  }

  // Palette ordered by pixel count descending.
  const order = orderByCountDesc(fullCounts, m)
  const rank = new Int32Array(m)
  const paletteRgb = new Uint8Array(m * 3)
  const paletteHex: string[] = []
  const counts = new Uint32Array(m)
  for (let pos = 0; pos < m; pos++) {
    const src = order[pos]
    rank[src] = pos
    // Palette color = exact mean RGB of the cluster's pixels (works for both
    // color spaces and never leaves the sRGB gamut).
    const inv = 1 / fullCounts[src]
    const r = Math.round(rgbSums[src * 3] * inv)
    const g = Math.round(rgbSums[src * 3 + 1] * inv)
    const b = Math.round(rgbSums[src * 3 + 2] * inv)
    paletteRgb[pos * 3] = r
    paletteRgb[pos * 3 + 1] = g
    paletteRgb[pos * 3 + 2] = b
    paletteHex.push(rgbToHex(r, g, b))
    counts[pos] = fullCounts[src]
  }
  for (let i = 0; i < n; i++) {
    if (labelData[i] >= 0) labelData[i] = rank[labelData[i]]
  }
  const labels: LabelMap = { width, height, data: labelData, count: m }
  return { labels, paletteHex, paletteRgb, counts }
}
