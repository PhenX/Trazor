/**
 * Color quantization. Three paths:
 *
 * - fixed palette: caller-provided colors; clustering is skipped and pixels
 *   are labeled with the nearest palette entry (palette order preserved).
 * - exact: at most `k` distinct colors in the image → the palette is exactly
 *   those colors with direct label assignment (pixel-art fidelity).
 * - k-means in toe-Oklab (Oklab with the lightness toe, `lightnessToe`, so the
 *   compression noise inside a black outline is not a spread of colors): seeded
 *   from the colors of the image's flat regions (`regionSeeds`, salient first)
 *   and then by greedy k-means++ (Arthur & Vassilvitskii 2007; Celebi, Kingravi
 *   & Vela 2013) on a deterministic pixel sample drawn with mulberry32, Lloyd
 *   iterations scaled by `quality`, then near-duplicate (`autoK`) and
 *   thin-variant (`mergeThinVariants`) palette merges.
 *
 * Everything is deterministic for a given input and seed.
 */
import { clampInt, hexToRgb, lightnessToe, mulberry32, rgbToHex, rgbToOklab } from '@trazor/core'
import type { BinaryMask, LabelMap, RasterImage } from '@trazor/core'
import { toToeOklabBuffer } from './convert'
import { chamferDistance } from './thin'

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
   * Seed the centroids from the colors of the image's flat regions before
   * k-means++ draws the rest: every distinct color that owns a flat interior of
   * meaningful area gets a centroid of its own, most distinct and largest first,
   * so a small but distinct region (a bow tie, a highlight) is never outvoted by
   * a large region's shading or compression noise. Oklab only; a photograph with
   * no flat regions seeds exactly as without. Absent ⇒ pure k-means++ seeding.
   */
  regionSeeds?: boolean
  /**
   * After clustering, fold a palette color that exists only as thin slivers —
   * no interior of its own, the color a compressed outline bleeds into or an
   * anti-aliased rim mixes — into the color it lies against, when the two are
   * close. A palette entry spent on such a variant fragments the outline it
   * lives in into two colors. Absent ⇒ no merge.
   */
  mergeThinVariants?: boolean
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

/** Toe-Oklab gradient below which a pixel is a flat-region interior (`regionSeeds`). */
const SEED_FLAT_T = 0.02
/** Flat area a region color needs to seed a centroid: `max(SEED_MIN_AREA, SEED_MIN_AREA_FRAC · pixels)`. */
const SEED_MIN_AREA = 16
const SEED_MIN_AREA_FRAC = 1e-4
/** Flat components smaller than this are noise for seeding purposes. */
const SEED_COMP_MIN = 4
/** Most distinct flat-region colors tracked while grouping components. */
const SEED_MAX_MODES = 4096

/**
 * `mergeThinVariants`: a label none of whose pixels lies farther than this
 * from another label — strokes, rims and specks, never a solid region — folds
 * into the one close color (within `VARIANT_MAX_DIST`, toe-Oklab) it lies
 * against, provided no other label it borders substantially (at least
 * `VARIANT_NEIGHBOR_SHARE` of its boundary) is close as well: a band of a
 * posterized ramp sits between two close bands and is a step of the ramp, not
 * a variant. The radius scales with the image so an outline drawn a few pixels
 * wide at any size still reads as a stroke: `max(STROKE_MIN_RADIUS,
 * STROKE_RADIUS_FRAC · longest side)`.
 */
const STROKE_MIN_RADIUS = 3
const STROKE_RADIUS_FRAC = 0.004
const VARIANT_MAX_DIST = 0.12
const VARIANT_NEIGHBOR_SHARE = 0.2

/**
 * A palette color is the mean of its label's interior pixels (all four
 * neighbors the same label) when at least `CORE_MIN_PIXELS` and
 * `CORE_MIN_SHARE` of the label are interior; a rim the label gathered along
 * its edges is a mixture that would tint it toward its neighbors. A label that
 * is all rim keeps the mean over every pixel.
 */
const CORE_MIN_PIXELS = 16
const CORE_MIN_SHARE = 0.05

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
          cent[c * 3] = lightnessToe(L)
          cent[c * 3 + 1] = A
          cent[c * 3 + 2] = B
        } else {
          cent[c * 3] = r / 255
          cent[c * 3 + 1] = g / 255
          cent[c * 3 + 2] = b / 255
        }
      }
      const feat = useOklab ? toToeOklabBuffer(image) : null
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
  const feat = useOklab ? toToeOklabBuffer(image) : null
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

  // Seeds: the flat-region colors first, then greedy k-means++ for the rest.
  const cent = new Float32Array(k * 3)
  let seeded = 0
  if (feat !== null && opts.regionSeeds === true) {
    const seeds = flatRegionSeeds(feat, mask, width, height, k)
    cent.set(seeds)
    seeded = seeds.length / 3
  }
  if (seeded === 0) {
    const first = ((rng() * sampleN) | 0) * 3
    cent[0] = sf[first]
    cent[1] = sf[first + 1]
    cent[2] = sf[first + 2]
    seeded = 1
  }
  // Squared distance from each sample to its nearest seed so far.
  const minD2 = new Float64Array(sampleN).fill(Infinity)
  const lowerMinD2 = (c: number): void => {
    const px = cent[c * 3]
    const py = cent[c * 3 + 1]
    const pz = cent[c * 3 + 2]
    for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
      const dx = sf[o] - px
      const dy = sf[o + 1] - py
      const dz = sf[o + 2] - pz
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < minD2[s]) minD2[s] = d2
    }
  }
  for (let c = 0; c < seeded; c++) lowerMinD2(c)
  // Greedy k-means++: each further seed is the best of a few D²-weighted draws
  // — the one that lowers the total potential most — so one unlucky draw into
  // the noise of a region already covered cannot cost a distinct color its seed.
  const trials = 2 + Math.floor(Math.log(k))
  for (let c = seeded; c < k; c++) {
    let total = 0
    for (let s = 0; s < sampleN; s++) total += minD2[s]
    let pick = sampleN - 1
    if (total <= 0) {
      pick = (rng() * sampleN) | 0
    } else {
      let bestPotential = Infinity
      for (let t = 0; t < trials; t++) {
        const target = rng() * total
        let cand = sampleN - 1
        let acc = 0
        for (let s = 0; s < sampleN; s++) {
          acc += minD2[s]
          if (acc >= target) {
            cand = s
            break
          }
        }
        const px = sf[cand * 3]
        const py = sf[cand * 3 + 1]
        const pz = sf[cand * 3 + 2]
        let potential = 0
        for (let s = 0, o = 0; s < sampleN; s++, o += 3) {
          const dx = sf[o] - px
          const dy = sf[o + 1] - py
          const dz = sf[o + 2] - pz
          const d2 = dx * dx + dy * dy + dz * dz
          potential += d2 < minD2[s] ? d2 : minD2[s]
        }
        if (potential < bestPotential) {
          bestPotential = potential
          pick = cand
        }
      }
    }
    cent[c * 3] = sf[pick * 3]
    cent[c * 3 + 1] = sf[pick * 3 + 1]
    cent[c * 3 + 2] = sf[pick * 3 + 2]
    lowerMinD2(c)
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
        lab[c * 3] = lightnessToe(L)
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

  // Thin-variant merge: fold a sliver-only color into the color it lies against.
  if (opts.mergeThinVariants === true && m > 1) {
    const m2 = mergeThinVariants(labelData, width, height, m, cent, rgbSums, fullCounts)
    if (m2 < m) {
      fullCounts = fullCounts.slice(0, m2)
      m = m2
    }
  }

  // Palette color = exact mean RGB of the label's pixels (works for both color
  // spaces and never leaves the sRGB gamut) — over its interior when the
  // interior speaks for it (see `CORE_MIN_PIXELS`), so the rims a label
  // gathered along its edges never tint it toward its neighbors.
  const coreSums = new Float64Array(m * 3)
  const coreCounts = new Uint32Array(m)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x
      const a = labelData[i]
      if (a < 0) continue
      if (x > 0 && labelData[i - 1] !== a) continue
      if (x < width - 1 && labelData[i + 1] !== a) continue
      if (y > 0 && labelData[i - width] !== a) continue
      if (y < height - 1 && labelData[i + width] !== a) continue
      const p = i * 4
      coreSums[a * 3] += data[p]
      coreSums[a * 3 + 1] += data[p + 1]
      coreSums[a * 3 + 2] += data[p + 2]
      coreCounts[a]++
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
    const coreSpeaks =
      coreCounts[src] >= CORE_MIN_PIXELS && coreCounts[src] >= CORE_MIN_SHARE * fullCounts[src]
    const colorSums = coreSpeaks ? coreSums : rgbSums
    const inv = 1 / (coreSpeaks ? coreCounts[src] : fullCounts[src])
    const r = Math.round(colorSums[src * 3] * inv)
    const g = Math.round(colorSums[src * 3 + 1] * inv)
    const b = Math.round(colorSums[src * 3 + 2] * inv)
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

/**
 * Flat-region seeds for `regionSeeds`: up to `k` toe-Oklab colors, interleaved.
 * Flat pixels (gradient under `SEED_FLAT_T`) form 4-connected components; the
 * components are grouped into distinct colors (closer than `MERGE_DIST` is one
 * color) and a color qualifies with at least `max(SEED_MIN_AREA,
 * SEED_MIN_AREA_FRAC · n)` flat pixels. The largest color seeds first; each
 * further seed is the qualifying color maximizing (squared distance to the
 * nearest seed so far) × (flat area) — the deterministic counterpart of the
 * D²-weighted k-means++ draw, one seed per distinct region color.
 */
function flatRegionSeeds(
  feat: Float32Array,
  mask: Uint8Array | null,
  w: number,
  h: number,
  k: number,
): Float32Array {
  const n = w * h
  // Flat pixels: max toe-Oklab distance to the right/down neighbors, both ways.
  const flat = new Uint8Array(n)
  const limit2 = SEED_FLAT_T * SEED_FLAT_T
  for (let i = 0; i < n; i++) flat[i] = mask === null || mask[i] !== 0 ? 1 : 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const o = i * 3
      if (x + 1 < w) {
        const dl = feat[o] - feat[o + 3]
        const da = feat[o + 1] - feat[o + 4]
        const db = feat[o + 2] - feat[o + 5]
        if (dl * dl + da * da + db * db >= limit2) {
          flat[i] = 0
          flat[i + 1] = 0
        }
      }
      if (y + 1 < h) {
        const q = (i + w) * 3
        const dl = feat[o] - feat[q]
        const da = feat[o + 1] - feat[q + 1]
        const db = feat[o + 2] - feat[q + 2]
        if (dl * dl + da * da + db * db >= limit2) {
          flat[i] = 0
          flat[i + w] = 0
        }
      }
    }
  }
  // 4-connected flat components: mean color and area.
  const comp = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  const compL: number[] = []
  const compA: number[] = []
  const compB: number[] = []
  const compArea: number[] = []
  for (let s = 0; s < n; s++) {
    if (flat[s] === 0 || comp[s] !== -1) continue
    const id = compL.length
    let sp = 0
    stack[sp++] = s
    comp[s] = id
    let sumL = 0
    let sumA = 0
    let sumB = 0
    let c = 0
    while (sp > 0) {
      const p = stack[--sp]
      sumL += feat[p * 3]
      sumA += feat[p * 3 + 1]
      sumB += feat[p * 3 + 2]
      c++
      const x = p - ((p / w) | 0) * w
      if (x > 0 && flat[p - 1] !== 0 && comp[p - 1] === -1) {
        comp[p - 1] = id
        stack[sp++] = p - 1
      }
      if (x < w - 1 && flat[p + 1] !== 0 && comp[p + 1] === -1) {
        comp[p + 1] = id
        stack[sp++] = p + 1
      }
      if (p >= w && flat[p - w] !== 0 && comp[p - w] === -1) {
        comp[p - w] = id
        stack[sp++] = p - w
      }
      if (p < n - w && flat[p + w] !== 0 && comp[p + w] === -1) {
        comp[p + w] = id
        stack[sp++] = p + w
      }
    }
    compL.push(sumL / c)
    compA.push(sumA / c)
    compB.push(sumB / c)
    compArea.push(c)
  }
  // Group the components into distinct colors, largest component first.
  const order: number[] = []
  for (let i = 0; i < compL.length; i++) if (compArea[i] >= SEED_COMP_MIN) order.push(i)
  order.sort((a, b) => compArea[b] - compArea[a] || a - b)
  const modeL: number[] = []
  const modeA: number[] = []
  const modeB: number[] = []
  const modeArea: number[] = []
  const merge2 = MERGE_DIST * MERGE_DIST
  for (const c of order) {
    let hit = -1
    for (let m = 0; m < modeL.length; m++) {
      const dl = compL[c] - modeL[m]
      const da = compA[c] - modeA[m]
      const db = compB[c] - modeB[m]
      if (dl * dl + da * da + db * db < merge2) {
        hit = m
        break
      }
    }
    if (hit < 0) {
      if (modeL.length >= SEED_MAX_MODES) continue
      modeL.push(compL[c])
      modeA.push(compA[c])
      modeB.push(compB[c])
      modeArea.push(compArea[c])
      continue
    }
    const t = modeArea[hit] + compArea[c]
    modeL[hit] = (modeL[hit] * modeArea[hit] + compL[c] * compArea[c]) / t
    modeA[hit] = (modeA[hit] * modeArea[hit] + compA[c] * compArea[c]) / t
    modeB[hit] = (modeB[hit] * modeArea[hit] + compB[c] * compArea[c]) / t
    modeArea[hit] = t
  }
  const minArea = Math.max(SEED_MIN_AREA, SEED_MIN_AREA_FRAC * n)
  const eligible: number[] = []
  for (let m = 0; m < modeL.length; m++) if (modeArea[m] >= minArea) eligible.push(m)
  if (eligible.length === 0 || k <= 0) return new Float32Array(0)
  eligible.sort((a, b) => modeArea[b] - modeArea[a] || a - b)
  // Farthest-first with the flat area as weight, from the largest color.
  const chosen: number[] = [eligible[0]]
  const minD2 = new Float64Array(eligible.length).fill(Infinity)
  const taken = new Uint8Array(eligible.length)
  taken[0] = 1
  while (chosen.length < k) {
    const last = chosen[chosen.length - 1]
    let best = -1
    let bestScore = 0
    for (let e = 0; e < eligible.length; e++) {
      if (taken[e] !== 0) continue
      const m = eligible[e]
      const dl = modeL[m] - modeL[last]
      const da = modeA[m] - modeA[last]
      const db = modeB[m] - modeB[last]
      const d2 = dl * dl + da * da + db * db
      if (d2 < minD2[e]) minD2[e] = d2
      const score = minD2[e] * modeArea[m]
      if (score > bestScore) {
        bestScore = score
        best = e
      }
    }
    if (best < 0) break
    taken[best] = 1
    chosen.push(eligible[best])
  }
  const out = new Float32Array(chosen.length * 3)
  for (let i = 0; i < chosen.length; i++) {
    out[i * 3] = modeL[chosen[i]]
    out[i * 3 + 1] = modeA[chosen[i]]
    out[i * 3 + 2] = modeB[chosen[i]]
  }
  return out
}

/**
 * `mergeThinVariants`: fold each stroke-like label — one whose farthest pixel
 * from any other label is within the stroke radius, so it is all outline, rim
 * or speck — into the one close color (within `VARIANT_MAX_DIST` in toe-Oklab)
 * among the labels it borders substantially. A compressed image bleeds the color
 * next to a dark outline into the outline (chroma is stored at half
 * resolution), so one black ink comes back as a brownish black beside orange and
 * a bluish black beside blue, and the outline breaks into pieces where it
 * crosses from one to the other; each bleed is a stroke close to black and far
 * from the orange or blue on its other side, and folds back into black. A thin
 * feature of a genuinely different color (a dark line on a light field) is far
 * from everything it touches and is kept; a band of a posterized ramp is close
 * to the bands on both sides and is kept as a step of the ramp. Merges relabel
 * the map and pool the centroid, RGB sums and counts; labels are then
 * compacted. Returns the new label count. Deterministic: the narrowest label is
 * judged first, ties by id.
 */
function mergeThinVariants(
  labelData: Int32Array,
  w: number,
  h: number,
  m: number,
  cent: Float32Array,
  rgbSums: Float64Array,
  counts: Uint32Array,
): number {
  const n = w * h
  const strokeRadius = Math.max(STROKE_MIN_RADIUS, STROKE_RADIUS_FRAC * Math.max(w, h))
  const own: BinaryMask = { width: w, height: h, data: new Uint8Array(n) }
  const adj = new Float64Array(m * m)
  const reach = new Float64Array(m)
  const judged = new Uint8Array(m)
  const toe = (c: number): [number, number, number] => {
    const inv = 1 / counts[c]
    const [L, a, b] = rgbToOklab(
      (rgbSums[c * 3] * inv) / 255,
      (rgbSums[c * 3 + 1] * inv) / 255,
      (rgbSums[c * 3 + 2] * inv) / 255,
    )
    return [lightnessToe(L), a, b]
  }
  for (;;) {
    adj.fill(0)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const a = labelData[i]
        if (a < 0) continue
        const r = x < w - 1 ? labelData[i + 1] : a
        const d = y < h - 1 ? labelData[i + w] : a
        if (r >= 0 && r !== a) {
          adj[a * m + r]++
          adj[r * m + a]++
        }
        if (d >= 0 && d !== a) {
          adj[a * m + d]++
          adj[d * m + a]++
        }
      }
    }
    // Each unjudged label's reach: how far its farthest pixel lies from any
    // other label (masked-out pixels count as other).
    for (let c = 0; c < m; c++) {
      if (judged[c] !== 0 || counts[c] === 0) continue
      for (let i = 0; i < n; i++) own.data[i] = labelData[i] === c ? 1 : 0
      const dist = chamferDistance(own)
      let far = 0
      for (let i = 0; i < n; i++) if (dist[i] > far) far = dist[i]
      reach[c] = far
    }
    // The narrowest unjudged stroke-like label.
    let x = -1
    let xReach = strokeRadius
    for (let c = 0; c < m; c++) {
      if (judged[c] !== 0 || counts[c] === 0) continue
      if (reach[c] < xReach) {
        xReach = reach[c]
        x = c
      }
    }
    if (x < 0) break
    judged[x] = 1
    // The one close color among the labels it borders substantially.
    const [xl, xa, xb] = toe(x)
    let boundary = 0
    for (let c = 0; c < m; c++) boundary += adj[x * m + c]
    let y = -1
    let yAdj = 0
    let close = 0
    for (let c = 0; c < m; c++) {
      const shared = adj[x * m + c]
      if (c === x || counts[c] === 0 || shared < VARIANT_NEIGHBOR_SHARE * boundary) continue
      const [cl, ca, cb] = toe(c)
      const dl = xl - cl
      const da = xa - ca
      const db = xb - cb
      if (dl * dl + da * da + db * db >= VARIANT_MAX_DIST * VARIANT_MAX_DIST) continue
      close++
      if (shared > yAdj) {
        yAdj = shared
        y = c
      }
    }
    if (y < 0 || close > 1) continue
    // Merge x into y.
    for (let i = 0; i < n; i++) if (labelData[i] === x) labelData[i] = y
    const wx = counts[x]
    const wy = counts[y]
    const wt = wx + wy
    cent[y * 3] = (cent[y * 3] * wy + cent[x * 3] * wx) / wt
    cent[y * 3 + 1] = (cent[y * 3 + 1] * wy + cent[x * 3 + 1] * wx) / wt
    cent[y * 3 + 2] = (cent[y * 3 + 2] * wy + cent[x * 3 + 2] * wx) / wt
    rgbSums[y * 3] += rgbSums[x * 3]
    rgbSums[y * 3 + 1] += rgbSums[x * 3 + 1]
    rgbSums[y * 3 + 2] += rgbSums[x * 3 + 2]
    counts[y] = wt
    counts[x] = 0
    // A merged-into label changed shape; judge it afresh.
    judged[y] = 0
  }
  // Compact the surviving labels.
  const remap = new Int32Array(m).fill(-1)
  let m2 = 0
  for (let c = 0; c < m; c++) {
    if (counts[c] === 0) continue
    remap[c] = m2
    cent[m2 * 3] = cent[c * 3]
    cent[m2 * 3 + 1] = cent[c * 3 + 1]
    cent[m2 * 3 + 2] = cent[c * 3 + 2]
    rgbSums[m2 * 3] = rgbSums[c * 3]
    rgbSums[m2 * 3 + 1] = rgbSums[c * 3 + 1]
    rgbSums[m2 * 3 + 2] = rgbSums[c * 3 + 2]
    counts[m2] = counts[c]
    m2++
  }
  if (m2 < m) {
    for (let i = 0; i < n; i++) if (labelData[i] >= 0) labelData[i] = remap[labelData[i]]
  }
  return m2
}
