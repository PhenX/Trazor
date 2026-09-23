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
import {
  ciede2000,
  clampInt,
  hexToRgb,
  mulberry32,
  rgbToHex,
  rgbToLab,
  oklabToRgb,
  rgbToOklab,
} from '@trazor/core'
import type { BinaryMask, LabelMap, RasterImage } from '@trazor/core'
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
  /**
   * Merge near-duplicate centroids after k-means: pairs within 0.03 Oklab or
   * within CIEDE2000 1.5 (the perceptually even "same ink" floor) fold together.
   */
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
 * CIEDE2000 ΔE₀₀ below which `autoK` treats two centroids as the same ink
 * (inkvec's `SAME_INK_DE00`). Oklab distance is far stricter than a
 * just-noticeable difference near black — where a #000 outline and a #0a0a0a
 * fill sit ~0.15 apart in Oklab yet a fraction of a JND apart perceptually — and
 * looser in saturated hues, so the pure-Oklab floor leaves near-neutral
 * duplicates and dark rim rings as their own inks (invented seam hues). The
 * perceptually even ΔE₀₀ floor folds those together. A pair merges when it is
 * within this floor OR within {@link MERGE_DIST} in Oklab, so the classic
 * Oklab merge is never undone — only extended where Oklab is too strict.
 */
const MERGE_DE00 = 1.5

// ---- hue-flip guard (Oklab k-means labeling) ----
// A diverging ramp (red→white→blue) crosses through neutral, where k-means
// allocates one near-neutral cluster whose centroid keeps a small residual hue.
// Because every near-neutral color sits close together in Oklab, that one
// centroid becomes the nearest for near-neutral pixels of BOTH hues around the
// crossover — so bluish-white pixels get labeled with a pinkish-white centroid,
// painting an off-hue band across the opposite side. The guard re-labels such a
// pixel to the nearest centroid that is instead neutral or hue-aligned, when one
// is a comparably close match. It fires only for a pixel with a clear hue whose
// nearest centroid is chromatic and points >45° away, so flat art (each region
// near its own on-hue centroid) is untouched.
/** Min squared chroma for a pixel's hue to be trusted (below ⇒ effectively neutral, left alone). */
const HUE_GUARD_MIN_CHROMA2 = 0.018 * 0.018
/** A centroid below this squared chroma is neutral: never a mismatch, always an acceptable target. */
const HUE_GUARD_NEUTRAL_CHROMA2 = 0.012 * 0.012
/** cos²(45°): hue vectors within 45° count as aligned. */
const HUE_GUARD_MIN_COS2 = 0.5
/** Max squared Oklab distance (ΔE 0.09) an alternative centroid may lie at to be taken. */
const HUE_GUARD_MAX_D2 = 0.09 * 0.09

/**
 * If the nearest centroid mismatches a chromatic pixel's hue (>45°), return the
 * nearest neutral-or-hue-aligned centroid within {@link HUE_GUARD_MAX_D2}; else
 * return `best` unchanged. `cent` is the interleaved Oklab centroid buffer;
 * `(la, aa, ba)` is the pixel's Oklab. A pure function of the pixel color and
 * the centroids, so the per-color memo in {@link assignNearest} stays valid.
 */
function hueGuardLabel(
  la: number,
  aa: number,
  ba: number,
  best: number,
  cent: Float32Array,
  m: number,
): number {
  const pc2 = aa * aa + ba * ba
  if (pc2 < HUE_GUARD_MIN_CHROMA2) return best // pixel effectively neutral
  const bA = cent[best * 3 + 1]
  const bB = cent[best * 3 + 2]
  const bc2 = bA * bA + bB * bB
  if (bc2 < HUE_GUARD_NEUTRAL_CHROMA2) return best // nearest centroid is neutral: no hue clash
  const dotB = aa * bA + ba * bB
  // Hue-aligned (angle ≤ 45°) ⇒ keep it.
  if (dotB > 0 && dotB * dotB >= HUE_GUARD_MIN_COS2 * pc2 * bc2) return best
  // Mismatch: re-pick the nearest neutral-or-aligned centroid within the cap.
  let alt = -1
  let altD2 = HUE_GUARD_MAX_D2
  for (let c = 0, cc = 0; c < m; c++, cc += 3) {
    if (c === best) continue
    const cA = cent[cc + 1]
    const cB = cent[cc + 2]
    const cch2 = cA * cA + cB * cB
    let ok = cch2 < HUE_GUARD_NEUTRAL_CHROMA2
    if (!ok) {
      const dot = aa * cA + ba * cB
      ok = dot > 0 && dot * dot >= HUE_GUARD_MIN_COS2 * pc2 * cch2
    }
    if (!ok) continue
    const dL = la - cent[cc]
    const dA = aa - cA
    const dB = ba - cB
    const d2 = dL * dL + dA * dA + dB * dB
    if (d2 < altD2) {
      altD2 = d2
      alt = c
    }
  }
  return alt >= 0 ? alt : best
}

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
  hueGuard: boolean,
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
        if (hueGuard) best = hueGuardLabel(x, y, z, best, cent, m)
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

/** Distance (working space) beyond every centroid for an edge pixel to count as an unseen color. */
const RESCUE_FAR = 0.15
/** Distance (encoded RGB, 0–1) within which a pixel is a blend of two centroids — a rim, not a color. */
const RESCUE_MIX = 0.06
/** Two centroids nearer than this (working space) are one color: the later one may be reassigned. */
const RESCUE_DUPLICATE = 0.06
/** At most this many colors are rescued. */
const RESCUE_MAX = 4
/** Unseen pixels needed (share of the in-mask pixels, and a floor) before a color is rescued. */
const RESCUE_SHARE = 0.001
const RESCUE_MIN_PIXELS = 16

/**
 * Give a centroid to a color the edge-free training pool never saw. Every
 * pixel of a stroke one to three pixels wide is an edge pixel, so an
 * edge-aware pool (which keeps anti-aliased rims from claiming palette
 * entries) leaves out thin features entirely: a chart of hairlines on paper
 * trains every centroid on the paper. After training, the in-mask pixels
 * outside the pool that sit farther than RESCUE_FAR from every centroid, and
 * off every segment between two centroids (a rim is a blend of the two colors
 * it separates, a stroke is not; the pixels outside `mask` count as one more
 * color, the background a shape's outer rim blends into), are unseen color.
 * When enough of them exist,
 * the most extreme quarter of them — the stroke cores, not their partial rims —
 * becomes a centroid, taking the slot of an empty or duplicate one. With no
 * such slot the palette is left as trained. Deterministic: fixed scan order,
 * no sampling. Mutates `cent`.
 */
function rescueEdgeColors(
  cent: Float32Array,
  k: number,
  cnt: Uint32Array,
  data: Uint8ClampedArray,
  feat: Float32Array | null,
  mask: Uint8Array | null,
  smask: Uint8Array,
  n: number,
): void {
  let inMask = 0
  for (let i = 0; i < n; i++) if (mask === null || mask[i] !== 0) inMask++
  const need = Math.max(RESCUE_MIN_PIXELS, RESCUE_SHARE * inMask)
  const featAt = (i: number, out: Float64Array): void => {
    if (feat !== null) {
      out[0] = feat[i * 3]
      out[1] = feat[i * 3 + 1]
      out[2] = feat[i * 3 + 2]
    } else {
      out[0] = data[i * 4] / 255
      out[1] = data[i * 4 + 1] / 255
      out[2] = data[i * 4 + 2] / 255
    }
  }
  const f = new Float64Array(3)
  const used = new Uint8Array(k)
  for (let c = 0; c < k; c++) used[c] = cnt[c] > 0 ? 1 : 0
  // The background outside the mask, in encoded RGB (the working image carries
  // it composited): a shape's outer rim is a blend of its color and this one.
  let bgN = 0
  const bg = [0, 0, 0]
  if (mask !== null) {
    for (let i = 0; i < n; i++) {
      if (mask[i] !== 0) continue
      bg[0] += data[i * 4]
      bg[1] += data[i * 4 + 1]
      bg[2] += data[i * 4 + 2]
      bgN++
    }
  }
  for (let round = 0; round < RESCUE_MAX; round++) {
    // Centroid colors in encoded RGB for the blend test.
    const rgb = new Float64Array(k * 3)
    for (let c = 0; c < k; c++) {
      if (feat !== null) {
        const [r, g, b] = oklabToRgb(cent[c * 3], cent[c * 3 + 1], cent[c * 3 + 2])
        rgb[c * 3] = r
        rgb[c * 3 + 1] = g
        rgb[c * 3 + 2] = b
      } else {
        rgb[c * 3] = cent[c * 3]
        rgb[c * 3 + 1] = cent[c * 3 + 1]
        rgb[c * 3 + 2] = cent[c * 3 + 2]
      }
    }
    const live: number[] = []
    for (let c = 0; c < k; c++) if (used[c]) live.push(c)
    // Blend endpoints: every live centroid, and the background when there is one.
    const ends: number[] = []
    for (const c of live) ends.push(rgb[c * 3], rgb[c * 3 + 1], rgb[c * 3 + 2])
    if (bgN > 0) ends.push(bg[0] / bgN / 255, bg[1] / bgN / 255, bg[2] / bgN / 255)
    const m = ends.length / 3
    const unseen: number[] = []
    const far: number[] = []
    for (let i = 0; i < n; i++) {
      if (smask[i] !== 0 || (mask !== null && mask[i] === 0)) continue
      featAt(i, f)
      let d2 = Infinity
      for (const c of live) {
        const dx = f[0] - cent[c * 3]
        const dy = f[1] - cent[c * 3 + 1]
        const dz = f[2] - cent[c * 3 + 2]
        const v = dx * dx + dy * dy + dz * dz
        if (v < d2) d2 = v
      }
      if (d2 <= RESCUE_FAR * RESCUE_FAR) continue
      const pr = data[i * 4] / 255
      const pg = data[i * 4 + 1] / 255
      const pb = data[i * 4 + 2] / 255
      let blend = false
      for (let a = 0; a < m && !blend; a++) {
        for (let b = a + 1; b < m; b++) {
          const ex = ends[b * 3] - ends[a * 3]
          const ey = ends[b * 3 + 1] - ends[a * 3 + 1]
          const ez = ends[b * 3 + 2] - ends[a * 3 + 2]
          const e2 = ex * ex + ey * ey + ez * ez
          if (e2 < 1e-9) continue
          let t =
            ((pr - ends[a * 3]) * ex + (pg - ends[a * 3 + 1]) * ey + (pb - ends[a * 3 + 2]) * ez) /
            e2
          t = t < 0 ? 0 : t > 1 ? 1 : t
          const qx = pr - ends[a * 3] - t * ex
          const qy = pg - ends[a * 3 + 1] - t * ey
          const qz = pb - ends[a * 3 + 2] - t * ez
          if (qx * qx + qy * qy + qz * qz < RESCUE_MIX * RESCUE_MIX) {
            blend = true
            break
          }
        }
      }
      if (blend) continue
      unseen.push(i)
      far.push(d2)
    }
    if (unseen.length < need) return
    // A slot: an unused centroid, else the later of the nearest duplicate pair.
    let slot = -1
    for (let c = 0; c < k; c++) {
      if (!used[c]) {
        slot = c
        break
      }
    }
    if (slot < 0) {
      let best = RESCUE_DUPLICATE * RESCUE_DUPLICATE
      for (let a = 0; a < live.length; a++) {
        for (let b = a + 1; b < live.length; b++) {
          const ca = live[a]
          const cb = live[b]
          const dx = cent[ca * 3] - cent[cb * 3]
          const dy = cent[ca * 3 + 1] - cent[cb * 3 + 1]
          const dz = cent[ca * 3 + 2] - cent[cb * 3 + 2]
          const v = dx * dx + dy * dy + dz * dz
          if (v < best) {
            best = v
            slot = cnt[ca] < cnt[cb] ? ca : cb
          }
        }
      }
    }
    if (slot < 0) return
    // The most extreme quarter of the unseen pixels: the cores, not their rims.
    const order = unseen
      .map((_, j) => j)
      .toSorted((p, q) => far[q] - far[p] || unseen[p] - unseen[q])
    const take = Math.max(1, order.length >> 2)
    let sx = 0
    let sy = 0
    let sz = 0
    for (let j = 0; j < take; j++) {
      featAt(unseen[order[j]], f)
      sx += f[0]
      sy += f[1]
      sz += f[2]
    }
    cent[slot * 3] = sx / take
    cent[slot * 3 + 1] = sy / take
    cent[slot * 3 + 2] = sz / take
    used[slot] = 1
    cnt[slot] = take
  }
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
      // Fixed palette is an explicit, exact "nearest of these colors" contract —
      // no hue guard (it would silently override the user's chosen mapping).
      const counts = assignNearest(labelData, cent, m, data, feat, mask, n, null, false)
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

  // Colors that live only on edges — a hairline, a thin bar, a glyph stem a
  // pixel or two wide — never reach the edge-free pool, so no centroid learns
  // them and their pixels fall to the nearest fill. Give such a color a
  // centroid in place of a redundant one (see rescueEdgeColors).
  if (poolIdx !== null && smask !== null) {
    rescueEdgeColors(cent, k, cnt, data, feat, mask, smask, n)
  }

  // Final pass: label every in-mask pixel by nearest centroid, accumulating
  // exact per-cluster RGB sums for the output palette.
  const rgbSums = new Float64Array(k * 3)
  // Hue guard on for the clustering path (Oklab only; no-op when feat is null):
  // stops a hue-biased near-neutral centroid from claiming opposite-hue pixels
  // across a diverging ramp's crossover.
  let fullCounts = assignNearest(labelData, cent, k, data, feat, mask, n, rgbSums, useOklab)

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

  // autoK: greedily fold near-duplicate centroids together in two phases. The
  // first merges the closest pair within MERGE_DIST in Oklab (the classic pass,
  // unchanged). The second then folds any remaining pair within MERGE_DE00 in
  // CIEDE2000 — the perceptually even "same ink" floor that catches the
  // near-black and near-neutral duplicates Oklab holds apart (a #0a0a0a fill by
  // a #000 outline, a dark rim ring). The Oklab pass runs to completion first,
  // so an image the ΔE₀₀ floor finds nothing new in is byte-identical to the
  // pure-Oklab merge; the floor only ever adds merges, never reorders them.
  if (opts.autoK === true && m > 1) {
    const lab = new Float64Array(m * 3)
    // CIELAB of each centroid's exact mean RGB (its output color), for the ΔE₀₀
    // "same ink" test; kept in sync with rgbSums as centroids merge.
    const labD = new Float64Array(m * 3)
    const setOklab = (c: number): void => {
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
    const setCielab = (c: number): void => {
      const inv = 1 / fullCounts[c]
      const [L, A, B] = rgbToLab(
        (rgbSums[c * 3] * inv) / 255,
        (rgbSums[c * 3 + 1] * inv) / 255,
        (rgbSums[c * 3 + 2] * inv) / 255,
      )
      labD[c * 3] = L
      labD[c * 3 + 1] = A
      labD[c * 3 + 2] = B
    }
    for (let c = 0; c < m; c++) {
      setOklab(c)
      setCielab(c)
    }
    const alive = new Uint8Array(m).fill(1)
    const parent = new Int32Array(m)
    for (let c = 0; c < m; c++) parent[c] = c
    const limit = MERGE_DIST * MERGE_DIST
    const mergeInto = (bi: number, bj: number): void => {
      // Count-weighted average in the working color space.
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
      setOklab(bi)
      setCielab(bi)
    }
    // Phase 1: closest Oklab pair below the Oklab floor.
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
      mergeInto(bi, bj)
    }
    // Phase 2: closest ΔE₀₀ pair below the CIEDE2000 floor.
    for (;;) {
      let bi = -1
      let bj = -1
      let bestD = Infinity
      for (let i = 0; i < m; i++) {
        if (alive[i] === 0) continue
        for (let j = i + 1; j < m; j++) {
          if (alive[j] === 0) continue
          const de00 = ciede2000(
            labD[i * 3],
            labD[i * 3 + 1],
            labD[i * 3 + 2],
            labD[j * 3],
            labD[j * 3 + 1],
            labD[j * 3 + 2],
          )
          if (de00 < bestD) {
            bestD = de00
            bi = i
            bj = j
          }
        }
      }
      if (bi < 0 || bestD >= MERGE_DE00) break
      mergeInto(bi, bj)
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
