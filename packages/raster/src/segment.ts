/**
 * Region-growing color segmentation — an alternative front-end to global
 * quantization for flat art (illustrations, logos, cartoons).
 *
 * Global k-means maps every pixel to the nearest color in one palette, so an
 * anti-aliased pixel that is a mix of two flat colors (a black outline meeting
 * skin) can land on a *third* palette color and draw a hairline rim. This
 * segmenter never does that: it grows each region outward from its flat
 * interior, so a soft edge ramp is split between exactly the two regions that
 * border it — no third color can appear on a boundary.
 *
 * Pipeline (marker-controlled watershed, Meyer 1991; Vincent & Soille 1991):
 *   1. Oklab gradient magnitude per pixel.
 *   2. Flat interiors (gradient below `flatThreshold`) are the markers — one
 *      region per 4-connected component, seeded with its mean color.
 *   2b. A feature too thin to hold a flat interior (a hairline glyph like an "&")
 *      gets no marker in step 2 and would be swallowed by the flood; each such
 *      enclosed, contrasting blob is rescued as its own marker first (see
 *      {@link rescueMarkerlessFeatures}).
 *   3. A priority flood grows the markers over the remaining (edge/ramp) pixels,
 *      always claiming the cheapest pixel next (smallest Oklab distance to the
 *      claiming region's mean); the boundary settles on the ramp crest.
 *   4. A region-adjacency-graph merge folds near-duplicate neighbors and small
 *      regions together (agglomerative, closest pair first) down to the real
 *      colors, optionally capped at `maxRegions`.
 *
 * Deterministic: fixed scan and neighbor order throughout, priority-queue ties
 * broken by pixel index, merge candidates ordered by (ΔE, region ids). The
 * result mirrors {@link QuantizeResult} so the engine consumes it identically.
 */
import { createLabelMap, oklabToRgb, rgbToHex } from '@trazor/core'
import type { BinaryMask, LabelMap, RasterImage } from '@trazor/core'
import { toOklabBuffer } from './convert'

export interface SegmentOptions {
  /**
   * Oklab gradient magnitude below which a pixel is a flat-region interior (a
   * marker seed). Larger keeps only very flat cores as seeds.
   */
  flatThreshold?: number
  /** Merge adjacent regions whose mean Oklab ΔE is below this (perceptual distance, not squared). */
  mergeThreshold?: number
  /**
   * Size-aware merge strength, 0..1 (0 or absent ⇒ off, byte-identical to the
   * fixed `mergeThreshold`). Above 0, the merge tolerance shrinks as regions
   * grow (Statistical Region Merging, Nock & Nielsen 2004): two *small* regions
   * merge readily — an anti-alias sliver folds into its neighbor as before — but
   * two *large* regions merge only when their colors are near-identical, so
   * close-but-distinct dominant colors (a coral sun against a pink sky) are kept
   * apart instead of washing into one mean. One knob serves flat scenes and
   * clean cartoons where no single fixed threshold can.
   */
  mergeSizeBias?: number
  /** Regions smaller than this many pixels are merged into their most similar neighbor. */
  minRegionArea?: number
  /** Hard cap on the final region count: keep merging the closest adjacent pair until at most this many remain. 0 = no cap. */
  maxRegions?: number
  /** Only in-mask pixels (`data[i] !== 0`) are segmented; the rest get label -1. */
  mask?: BinaryMask | null
}

export interface SegmentResult {
  /** Compact labels 0..count-1; -1 for masked-out pixels. */
  labels: LabelMap
  paletteHex: string[]
  /** count * 3 bytes. */
  paletteRgb: Uint8Array
  /** Pixels per label, length count. */
  counts: Uint32Array
}

const DEFAULT_FLAT = 0.02
const DEFAULT_MERGE = 0.1
const DEFAULT_MIN_AREA = 16

/**
 * Oklab ΔE two *large* regions must be within to merge under size-aware merging
 * — the near-duplicate floor the per-region bound decays toward as |R| → ∞.
 * ~JND, matching the quantizer's `autoK` centroid-merge distance, so a genuine
 * dominant-color difference above it always survives.
 */
const SRM_FLOOR = 0.03

/**
 * Thin features (a hairline glyph like an "&", a dot, a thin serif) have no flat
 * interior, so step 2 gives them no marker and the flood dissolves them into the
 * regions around them. These knobs govern rescuing such a feature as its own
 * marker before the flood (see {@link rescueMarkerlessFeatures}), without
 * disturbing genuine anti-aliased edges — which sit *between two* colors and must
 * still split.
 */
// Oklab ΔE two neighboring unmarked pixels must be within to grow the same
// feature. Anti-aliasing/compression 4-connects every edge in the image into one
// web; growing only through near-equal colors carves the coherent glyph strokes
// (a near-uniform dark blob) back out of it, cut off at the ramp to the field.
const RESCUE_COHERENCE = 0.2
// Chebyshev radius the enclosing color is censused over. A feature carries a thin
// transition rim of its own, so its flat neighbor is a pixel or two out, not
// strictly 4-adjacent; this reaches past the rim without reaching other features.
const RESCUE_DILATE = 2
// Fraction of that surround that must be a single color for the blob to count as
// a starved feature rather than a two-sided ramp. A ramp borders its two colors
// in ~equal measure; an enclosed feature is surrounded almost entirely by one.
const RESCUE_ENCLOSURE = 0.85
// Oklab ΔE within which two markers count as the same color when measuring the
// surround (so a divider between two patches of one color still reads as enclosed,
// and near-duplicate markers do not split the dominant). ~JND, the near-duplicate floor.
const RESCUE_GROUP = SRM_FLOOR
// Oklab ΔE a feature's color must exceed its enclosing color by to be rescued.
// A soft edge assigns each pixel to its nearer side at an error up to about half
// the edge's ΔE (≈0.5 for the hardest black↔white edge), so a sliver of a ramp
// can sit this far from the one side it is enclosed by; the gate is set past that
// band. A real detail against its field (black glyph on white ≈ 0.9) clears it
// easily; only low-contrast thin features (which the flood renders acceptably)
// are left alone.
const RESCUE_MIN_CONTRAST = 0.5

/** Oklab distance between interleaved-buffer index `i` and a mean triple. */
function distToMean(ok: Float32Array, i: number, mL: number, mA: number, mB: number): number {
  const o = i * 3
  const dl = ok[o] - mL
  const da = ok[o + 1] - mA
  const db = ok[o + 2] - mB
  return Math.sqrt(dl * dl + da * da + db * db)
}

export function segmentRegions(image: RasterImage, opts: SegmentOptions = {}): SegmentResult {
  const { width: w, height: h } = image
  const n = w * h
  const flatThreshold = opts.flatThreshold ?? DEFAULT_FLAT
  const mergeThreshold = opts.mergeThreshold ?? DEFAULT_MERGE
  const sizeBias = Math.min(1, Math.max(0, opts.mergeSizeBias ?? 0))
  const minArea = Math.max(0, opts.minRegionArea ?? DEFAULT_MIN_AREA)
  const maxRegions = Math.max(0, opts.maxRegions ?? 0)
  const mask = opts.mask?.data ?? null

  const ok = toOklabBuffer(image)

  // ---- 1. Oklab gradient magnitude (max ΔE to any 4-neighbor) ----
  const grad = new Float32Array(n)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (x + 1 < w) {
        const d = distToMean(ok, i, ok[(i + 1) * 3], ok[(i + 1) * 3 + 1], ok[(i + 1) * 3 + 2])
        if (d > grad[i]) grad[i] = d
        if (d > grad[i + 1]) grad[i + 1] = d
      }
      if (y + 1 < h) {
        const j = i + w
        const d = distToMean(ok, i, ok[j * 3], ok[j * 3 + 1], ok[j * 3 + 2])
        if (d > grad[i]) grad[i] = d
        if (d > grad[j]) grad[j] = d
      }
    }
  }

  // ---- 2. Markers: 4-connected components of flat in-mask pixels ----
  const region = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  let regionCount = 0
  // Region mean color (Oklab) and pixel count, grown as regions form.
  let mL = new Float64Array(64)
  let mA = new Float64Array(64)
  let mB = new Float64Array(64)
  let size = new Float64Array(64)
  const grow = (id: number): void => {
    if (id < mL.length) return
    const cap = mL.length * 2
    const nl = new Float64Array(cap)
    nl.set(mL)
    mL = nl
    const na = new Float64Array(cap)
    na.set(mA)
    mA = na
    const nb = new Float64Array(cap)
    nb.set(mB)
    mB = nb
    const ns = new Float64Array(cap)
    ns.set(size)
    size = ns
  }
  for (let s = 0; s < n; s++) {
    if (region[s] !== -1 || (mask !== null && mask[s] === 0) || grad[s] >= flatThreshold) continue
    const id = regionCount++
    grow(id)
    let sp = 0
    stack[sp++] = s
    region[s] = id
    let sumL = 0
    let sumA = 0
    let sumB = 0
    let c = 0
    while (sp > 0) {
      const p = stack[--sp]
      sumL += ok[p * 3]
      sumA += ok[p * 3 + 1]
      sumB += ok[p * 3 + 2]
      c++
      const x = p - ((p / w) | 0) * w
      if (
        x > 0 &&
        region[p - 1] === -1 &&
        (mask === null || mask[p - 1] !== 0) &&
        grad[p - 1] < flatThreshold
      ) {
        region[p - 1] = id
        stack[sp++] = p - 1
      }
      if (
        x < w - 1 &&
        region[p + 1] === -1 &&
        (mask === null || mask[p + 1] !== 0) &&
        grad[p + 1] < flatThreshold
      ) {
        region[p + 1] = id
        stack[sp++] = p + 1
      }
      if (
        p >= w &&
        region[p - w] === -1 &&
        (mask === null || mask[p - w] !== 0) &&
        grad[p - w] < flatThreshold
      ) {
        region[p - w] = id
        stack[sp++] = p - w
      }
      if (
        p < n - w &&
        region[p + w] === -1 &&
        (mask === null || mask[p + w] !== 0) &&
        grad[p + w] < flatThreshold
      ) {
        region[p + w] = id
        stack[sp++] = p + w
      }
    }
    mL[id] = sumL / c
    mA[id] = sumA / c
    mB[id] = sumB / c
    size[id] = c
  }

  // Degenerate input (no flat cores at all): fall back to a single region so the
  // caller always gets a usable label map.
  if (regionCount === 0) {
    return singleRegion(image, mask, n)
  }

  // ---- 2b. Rescue marker-less features (thin glyphs, dots) as their own markers ----
  // A feature too thin to hold a flat core would otherwise be dissolved by the
  // flood into the field around it; give each such isolated component its own
  // marker, seeded with its own mean color, so the flood grows it as itself.
  const rescued = rescueMarkerlessFeatures(
    ok,
    region,
    w,
    h,
    n,
    mask,
    mL,
    mA,
    mB,
    regionCount,
    Math.max(1, minArea),
  )
  for (const f of rescued) {
    const id = regionCount++
    grow(id)
    mL[id] = f.mL
    mA[id] = f.mA
    mB[id] = f.mB
    size[id] = f.size
  }

  // ---- 3. Priority flood: grow markers over edge/ramp pixels ----
  floodRegions(ok, region, w, n, mask, mL, mA, mB)

  // Recompute means/sizes over the grown regions (ramp pixels shifted them).
  mL.fill(0, 0, regionCount)
  mA.fill(0, 0, regionCount)
  mB.fill(0, 0, regionCount)
  size.fill(0, 0, regionCount)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r < 0) continue
    mL[r] += ok[p * 3]
    mA[r] += ok[p * 3 + 1]
    mB[r] += ok[p * 3 + 2]
    size[r]++
  }
  for (let r = 0; r < regionCount; r++) {
    if (size[r] > 0) {
      mL[r] /= size[r]
      mA[r] /= size[r]
      mB[r] /= size[r]
    }
  }

  // ---- 4. Region-adjacency-graph merge ----
  const parent = mergeRegions(
    region,
    w,
    h,
    regionCount,
    mL,
    mA,
    mB,
    size,
    mergeThreshold,
    sizeBias,
    minArea,
    maxRegions,
  )

  // ---- Compact labels (first-appearance order) + palette ----
  const rootLabel = new Int32Array(regionCount).fill(-1)
  let count = 0
  const out = new Int32Array(n)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r < 0) {
      out[p] = -1
      continue
    }
    const root = parent[r]
    let lab = rootLabel[root]
    if (lab === -1) {
      lab = count++
      rootLabel[root] = lab
    }
    out[p] = lab
  }
  const labels: LabelMap = { width: w, height: h, data: out, count }

  const paletteRgb = new Uint8Array(count * 3)
  const paletteHex: string[] = new Array(count)
  const counts = new Uint32Array(count)
  for (let r = 0; r < regionCount; r++) {
    const lab = rootLabel[parent[r]]
    if (lab < 0 || paletteHex[lab] !== undefined) continue
    const [rr, gg, bb] = oklabToRgb(mL[parent[r]], mA[parent[r]], mB[parent[r]])
    const R = Math.round(rr * 255)
    const G = Math.round(gg * 255)
    const B = Math.round(bb * 255)
    paletteRgb[lab * 3] = R
    paletteRgb[lab * 3 + 1] = G
    paletteRgb[lab * 3 + 2] = B
    paletteHex[lab] = rgbToHex(R, G, B)
  }
  for (let p = 0; p < n; p++) {
    if (out[p] >= 0) counts[out[p]]++
  }

  return { labels, paletteHex, paletteRgb, counts }
}

/**
 * Marker-controlled priority flood (Meyer 1991). A binary min-heap keyed by
 * Oklab distance to the claiming region's (marker) mean, ties broken by pixel
 * index for determinism. Each unlabeled pixel is enqueued when a labeled
 * neighbor is popped; the first pop that assigns it wins, so the boundary
 * between two markers settles on the highest-cost crest between them.
 */
function floodRegions(
  ok: Float32Array,
  region: Int32Array,
  w: number,
  n: number,
  mask: Uint8Array | null,
  mL: Float64Array,
  mA: Float64Array,
  mB: Float64Array,
): void {
  // Heap columns: key (cost), pixel, region. Capacity grows by doubling; total
  // pushes are bounded by 4n (each pixel enqueued at most once per neighbor).
  let cap = Math.max(1024, n)
  let hk = new Float64Array(cap)
  let hp = new Int32Array(cap)
  let hr = new Int32Array(cap)
  let hs = 0
  const ensure = (): void => {
    if (hs < cap) return
    cap *= 2
    const nk = new Float64Array(cap)
    nk.set(hk)
    hk = nk
    const np = new Int32Array(cap)
    np.set(hp)
    hp = np
    const nr = new Int32Array(cap)
    nr.set(hr)
    hr = nr
  }
  const push = (key: number, p: number, r: number): void => {
    ensure()
    let i = hs++
    hk[i] = key
    hp[i] = p
    hr[i] = r
    while (i > 0) {
      const par = (i - 1) >> 1
      // Tie-break by pixel index (lower first) for determinism.
      if (hk[par] < hk[i] || (hk[par] === hk[i] && hp[par] <= hp[i])) break
      swap(i, par)
      i = par
    }
  }
  const swap = (i: number, j: number): void => {
    const tk = hk[i]
    hk[i] = hk[j]
    hk[j] = tk
    const tp = hp[i]
    hp[i] = hp[j]
    hp[j] = tp
    const tr = hr[i]
    hr[i] = hr[j]
    hr[j] = tr
  }
  const lower = (a: number, b: number): boolean =>
    hk[a] < hk[b] || (hk[a] === hk[b] && hp[a] < hp[b])
  const pop = (): void => {
    hs--
    if (hs > 0) {
      hk[0] = hk[hs]
      hp[0] = hp[hs]
      hr[0] = hr[hs]
      let i = 0
      for (;;) {
        const l = 2 * i + 1
        const r = 2 * i + 2
        let m = i
        if (l < hs && lower(l, m)) m = l
        if (r < hs && lower(r, m)) m = r
        if (m === i) break
        swap(i, m)
        i = m
      }
    }
  }

  const enqueueNeighbors = (p: number, r: number): void => {
    const x = p - ((p / w) | 0) * w
    if (x > 0) tryPush(p - 1, r)
    if (x < w - 1) tryPush(p + 1, r)
    if (p >= w) tryPush(p - w, r)
    if (p < n - w) tryPush(p + w, r)
  }
  const tryPush = (q: number, r: number): void => {
    if (region[q] !== -1 || (mask !== null && mask[q] === 0)) return
    push(distToMean(ok, q, mL[r], mA[r], mB[r]), q, r)
  }

  // Seed from every labeled (marker) pixel's unlabeled neighbors.
  for (let p = 0; p < n; p++) {
    if (region[p] >= 0) enqueueNeighbors(p, region[p])
  }
  // `hs` (heap size) is mutated by pop()/push() below; the linter cannot see
  // through those closures.
  // eslint-disable-next-line no-unmodified-loop-condition
  while (hs > 0) {
    const p = hp[0]
    const r = hr[0]
    pop()
    if (region[p] !== -1) continue
    region[p] = r
    enqueueNeighbors(p, r)
  }
  // Any pixel unreachable from a marker (isolated in-mask island with no flat
  // core) stays -1; assign it to region 0 so the map has no in-mask holes.
  for (let p = 0; p < n; p++) {
    if (region[p] === -1 && (mask === null || mask[p] !== 0)) region[p] = 0
  }
}

/** A rescued feature: the mean color to seed its new marker with, and its pixel count. */
interface RescuedFeature {
  mL: number
  mA: number
  mB: number
  size: number
}

/**
 * Rescue marker-less features as their own markers, before the flood.
 *
 * Step 2 only seeds a marker inside a *flat* interior, so a feature too thin to
 * hold one — a hairline glyph like an ampersand, a dot, a thin serif — gets no
 * marker at all. The priority flood then has nothing to grow it as and hands its
 * pixels to the regions around it: the feature dissolves.
 *
 * Finding those features is not just a matter of connected components: on an
 * anti-aliased or compressed image every edge in the picture is 4-connected into
 * one unmarked web, so the "&" is not an island. Growing only through *near-equal*
 * colors (`RESCUE_COHERENCE`) carves each coherent feature — a glyph's near-uniform
 * strokes — back out of that web, stopping where the color ramps toward the field.
 *
 * A blob is rescued as its own marker (seeded with its mean color) when it spans
 * at least `minArea` pixels; a single color fills at least `RESCUE_ENCLOSURE` of
 * the markers around it (censused over a `RESCUE_DILATE` window, since a feature
 * carries its own thin rim — same color on both sides of a divider counts as one
 * enclosure, so a bar splitting a field is rescued too); and its color differs
 * from that enclosing color by at least `RESCUE_MIN_CONTRAST`. A genuine edge ramp
 * fails the enclosure test (it borders its two colors in ~equal measure) and is
 * left for the flood to split — the no-third-color guarantee holds.
 *
 * Blobs are rescued most-contrasting first and each promotion is written into
 * `region`, so a feature's own rim — evaluated later, now bordered by the just-
 * promoted glyph as well as the field — no longer reads as enclosed and is left
 * to the flood. Deterministic: blobs are discovered in row-major order and ties
 * in contrast break by that order.
 */
function rescueMarkerlessFeatures(
  ok: Float32Array,
  region: Int32Array,
  w: number,
  h: number,
  n: number,
  mask: Uint8Array | null,
  mL: Float64Array,
  mA: Float64Array,
  mB: Float64Array,
  regionCount: number,
  minArea: number,
): RescuedFeature[] {
  const coh2 = RESCUE_COHERENCE * RESCUE_COHERENCE
  const contrast2 = RESCUE_MIN_CONTRAST * RESCUE_MIN_CONTRAST
  const group2 = RESCUE_GROUP * RESCUE_GROUP
  const R = RESCUE_DILATE

  // ---- 1. Carve color-coherent blobs out of the unmarked web ----
  // `order` holds each blob's pixels contiguously in [start, start+len).
  const blobId = new Int32Array(n).fill(-1)
  const order = new Int32Array(n)
  const stack = new Int32Array(n)
  let cap = 64
  let blobStart = new Int32Array(cap)
  let blobLen = new Int32Array(cap)
  let blobs = 0
  let pos = 0
  for (let s = 0; s < n; s++) {
    if (blobId[s] !== -1 || region[s] !== -1 || (mask !== null && mask[s] === 0)) continue
    if (blobs === cap) {
      cap *= 2
      const ns = new Int32Array(cap)
      ns.set(blobStart)
      blobStart = ns
      const nl = new Int32Array(cap)
      nl.set(blobLen)
      blobLen = nl
    }
    const id = blobs++
    const start = pos
    let sp = 0
    stack[sp++] = s
    blobId[s] = id
    while (sp > 0) {
      const p = stack[--sp]
      order[pos++] = p
      const pL = ok[p * 3]
      const pA = ok[p * 3 + 1]
      const pB = ok[p * 3 + 2]
      const x = p - ((p / w) | 0) * w
      // Grow to an unmarked in-mask neighbor within RESCUE_COHERENCE of this pixel.
      if (x > 0) {
        const q = p - 1
        if (blobId[q] === -1 && region[q] === -1 && (mask === null || mask[q] !== 0)) {
          const dl = ok[q * 3] - pL
          const da = ok[q * 3 + 1] - pA
          const db = ok[q * 3 + 2] - pB
          if (dl * dl + da * da + db * db < coh2) {
            blobId[q] = id
            stack[sp++] = q
          }
        }
      }
      if (x < w - 1) {
        const q = p + 1
        if (blobId[q] === -1 && region[q] === -1 && (mask === null || mask[q] !== 0)) {
          const dl = ok[q * 3] - pL
          const da = ok[q * 3 + 1] - pA
          const db = ok[q * 3 + 2] - pB
          if (dl * dl + da * da + db * db < coh2) {
            blobId[q] = id
            stack[sp++] = q
          }
        }
      }
      if (p >= w) {
        const q = p - w
        if (blobId[q] === -1 && region[q] === -1 && (mask === null || mask[q] !== 0)) {
          const dl = ok[q * 3] - pL
          const da = ok[q * 3 + 1] - pA
          const db = ok[q * 3 + 2] - pB
          if (dl * dl + da * da + db * db < coh2) {
            blobId[q] = id
            stack[sp++] = q
          }
        }
      }
      if (p < n - w) {
        const q = p + w
        if (blobId[q] === -1 && region[q] === -1 && (mask === null || mask[q] !== 0)) {
          const dl = ok[q * 3] - pL
          const da = ok[q * 3 + 1] - pA
          const db = ok[q * 3 + 2] - pB
          if (dl * dl + da * da + db * db < coh2) {
            blobId[q] = id
            stack[sp++] = q
          }
        }
      }
    }
    blobStart[id] = start
    blobLen[id] = pos - start
  }

  // ---- 2. Candidate blobs (big enough to matter), ordered most-contrasting first ----
  const cand: number[] = []
  for (let id = 0; id < blobs; id++) if (blobLen[id] >= minArea) cand.push(id)
  if (cand.length === 0) return []

  // Blob mean colors (candidates only).
  const cmL = new Float64Array(blobs)
  const cmA = new Float64Array(blobs)
  const cmB = new Float64Array(blobs)
  for (const id of cand) {
    const start = blobStart[id]
    const end = start + blobLen[id]
    let sL = 0
    let sA = 0
    let sB = 0
    for (let k = start; k < end; k++) {
      const o = order[k] * 3
      sL += ok[o]
      sA += ok[o + 1]
      sB += ok[o + 2]
    }
    cmL[id] = sL / blobLen[id]
    cmA[id] = sA / blobLen[id]
    cmB[id] = sB / blobLen[id]
  }

  // Marker means, extended as blobs are promoted (ids `regionCount + k`).
  const markerColor = (r: number, c: Float64Array, base: Float64Array): number =>
    r < regionCount ? base[r] : c[r - regionCount]
  const promL = new Float64Array(cand.length)
  const promA = new Float64Array(cand.length)
  const promB = new Float64Array(cand.length)
  const total = regionCount + cand.length
  const census = new Int32Array(total)
  const seenList = new Int32Array(total)

  /**
   * Census the markers in a `RESCUE_DILATE` window around blob `id` over the
   * current `region`, then return the mass fraction held by the dominant color
   * (same-color markers summed) and that color's ΔE² to the blob's mean.
   */
  const surround = (id: number): { enclosure: number; contrast2: number; dom: number } => {
    const start = blobStart[id]
    const end = start + blobLen[id]
    let seen = 0
    let mass = 0
    for (let k = start; k < end; k++) {
      const p = order[k]
      const px = p - ((p / w) | 0) * w
      const py = (p / w) | 0
      for (let dy = -R; dy <= R; dy++) {
        const yy = py + dy
        if (yy < 0 || yy >= h) continue
        for (let dx = -R; dx <= R; dx++) {
          const xx = px + dx
          if (xx < 0 || xx >= w) continue
          const r = region[yy * w + xx]
          if (r < 0) continue
          mass++
          if (census[r]++ === 0) seenList[seen++] = r
        }
      }
    }
    if (mass === 0) {
      for (let t = 0; t < seen; t++) census[seenList[t]] = 0
      return { enclosure: 0, contrast2: 0, dom: -1 }
    }
    let dom = -1
    let domCnt = 0
    for (let t = 0; t < seen; t++) {
      const r = seenList[t]
      if (census[r] > domCnt) {
        domCnt = census[r]
        dom = r
      }
    }
    const dL = markerColor(dom, promL, mL)
    const dA = markerColor(dom, promA, mA)
    const dB = markerColor(dom, promB, mB)
    let sameColor = 0
    for (let t = 0; t < seen; t++) {
      const r = seenList[t]
      const c = census[r]
      census[r] = 0
      const el = markerColor(r, promL, mL) - dL
      const ea = markerColor(r, promA, mA) - dA
      const eb = markerColor(r, promB, mB) - dB
      if (el * el + ea * ea + eb * eb < group2) sameColor += c
    }
    const bl = cmL[id] - dL
    const ba = cmA[id] - dA
    const bb = cmB[id] - dB
    return { enclosure: sameColor / mass, contrast2: bl * bl + ba * ba + bb * bb, dom }
  }

  // Extremeness for ordering: contrast to the surround over the original markers.
  const ext = new Float64Array(blobs)
  for (const id of cand) ext[id] = surround(id).contrast2
  cand.sort((x, y) => ext[y] - ext[x] || x - y)

  // ---- 3. Promote each qualifying blob, writing it into `region` as it goes ----
  const out: RescuedFeature[] = []
  for (const id of cand) {
    const s = surround(id)
    if (s.dom < 0 || s.enclosure < RESCUE_ENCLOSURE || s.contrast2 < contrast2) continue
    const newId = regionCount + out.length
    const start = blobStart[id]
    const end = start + blobLen[id]
    for (let k = start; k < end; k++) region[order[k]] = newId
    promL[out.length] = cmL[id]
    promA[out.length] = cmA[id]
    promB[out.length] = cmB[id]
    out.push({ mL: cmL[id], mA: cmA[id], mB: cmB[id], size: blobLen[id] })
  }
  return out
}

/**
 * Agglomerative region-adjacency-graph merge. Union-find over regions; each
 * round folds every adjacent pair whose mean-color ΔE is under `mergeThreshold`
 * or where either side is below `minArea`, closest pair first, updating the
 * surviving mean as a size-weighted average. A final pass enforces `maxRegions`
 * by merging the globally closest adjacent pair until the cap is met. Returns
 * the parent array (each region's representative root).
 */
function mergeRegions(
  region: Int32Array,
  w: number,
  h: number,
  regionCount: number,
  mL: Float64Array,
  mA: Float64Array,
  mB: Float64Array,
  size: Float64Array,
  mergeThreshold: number,
  sizeBias: number,
  minArea: number,
  maxRegions: number,
): Int32Array {
  const parent = new Int32Array(regionCount)
  for (let i = 0; i < regionCount; i++) parent[i] = i
  const find = (x: number): number => {
    let r = x
    while (parent[r] !== r) r = parent[r]
    while (parent[x] !== r) {
      const next = parent[x]
      parent[x] = r
      x = next
    }
    return r
  }
  const meanDelta = (a: number, b: number): number => {
    const dl = mL[a] - mL[b]
    const da = mA[a] - mA[b]
    const db = mB[a] - mB[b]
    return Math.sqrt(dl * dl + da * da + db * db)
  }
  // Size-aware merge tolerance (Nock & Nielsen 2004). Off (`sizeBias === 0`) it
  // is the flat `mergeThreshold` — byte-identical. On, the per-region bound
  // b(|R|) = SRM_SCALE / sqrt(|R|) decays with area, so the pair limit floors at
  // `SRM_FLOOR` for two large regions (near-identical to merge) and rises for
  // small ones (a sliver folds freely). Root sizes, so it tracks each round.
  const SRM_SCALE = 0.5
  const mergeLimit = (a: number, b: number): number =>
    sizeBias <= 0
      ? mergeThreshold
      : SRM_FLOOR + sizeBias * SRM_SCALE * (1 / Math.sqrt(size[a]) + 1 / Math.sqrt(size[b]))
  const union = (a: number, b: number): void => {
    // Fold the smaller into the larger (keep the dominant color id stable).
    const keep = size[a] >= size[b] ? a : b
    const drop = keep === a ? b : a
    const nn = size[a] + size[b]
    if (nn > 0) {
      mL[keep] = (mL[a] * size[a] + mL[b] * size[b]) / nn
      mA[keep] = (mA[a] * size[a] + mA[b] * size[b]) / nn
      mB[keep] = (mB[a] * size[a] + mB[b] * size[b]) / nn
    }
    size[keep] = nn
    parent[drop] = keep
  }

  // Directed adjacency edges (unique unordered root pairs collected per round).
  const collectEdges = (): Array<[number, number]> => {
    const seen = new Set<number>()
    const edges: Array<[number, number]> = []
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x
        const a = region[i]
        if (a < 0) continue
        const ra = find(a)
        if (x + 1 < w) {
          const b = region[i + 1]
          if (b >= 0) {
            const rb = find(b)
            if (ra !== rb) {
              const key = ra < rb ? ra * regionCount + rb : rb * regionCount + ra
              if (!seen.has(key)) {
                seen.add(key)
                edges.push(ra < rb ? [ra, rb] : [rb, ra])
              }
            }
          }
        }
        if (y + 1 < h) {
          const b = region[i + w]
          if (b >= 0) {
            const rb = find(b)
            if (ra !== rb) {
              const key = ra < rb ? ra * regionCount + rb : rb * regionCount + ra
              if (!seen.has(key)) {
                seen.add(key)
                edges.push(ra < rb ? [ra, rb] : [rb, ra])
              }
            }
          }
        }
      }
    }
    return edges
  }

  let activeRegions = regionCount
  for (let round = 0; round < 64; round++) {
    const edges = collectEdges()
    // Candidates ordered by ΔE, then region ids, for a deterministic sequence.
    const cand = edges
      .map(([a, b]): [number, number, number] => [a, b, meanDelta(a, b)])
      .toSorted((p, q) => p[2] - q[2] || p[0] - q[0] || p[1] - q[1])
    let merged = false
    for (const [a, b, d] of cand) {
      const ra = find(a)
      const rb = find(b)
      if (ra === rb) continue
      if (d < mergeLimit(ra, rb) || size[ra] < minArea || size[rb] < minArea) {
        union(ra, rb)
        activeRegions--
        merged = true
      }
    }
    if (!merged) break
  }

  // Global near-duplicate consolidation: fold together regions whose mean colors
  // are within the consolidation distance even when they do not touch — two
  // separate black outlines become one palette color. Greedy by descending size,
  // so the largest region of a color is the representative. Perceptual-distance
  // gated, so it can never merge genuinely different colors (a blue strap into a
  // black outline). Under size-aware merging it uses the near-duplicate `SRM_FLOOR`
  // so it consolidates true duplicates without re-merging the close-but-distinct
  // dominant colors the adjacency pass deliberately kept apart.
  const consolidateDist = sizeBias > 0 ? SRM_FLOOR : mergeThreshold
  const roots: number[] = []
  for (let i = 0; i < regionCount; i++) if (find(i) === i) roots.push(i)
  roots.sort((a, b) => size[b] - size[a] || a - b)
  const reps: number[] = []
  for (const r of roots) {
    let repFor = -1
    for (const rep of reps) {
      if (meanDelta(r, rep) < consolidateDist) {
        repFor = rep
        break
      }
    }
    if (repFor === -1) reps.push(r)
    else {
      union(r, repFor)
      activeRegions--
    }
  }

  // Soft cap: if still above `maxRegions`, fold the closest remaining pair of
  // representatives, but only while they stay within a perceptual ceiling — a
  // budget lowers the color count without flattening distinct hues together.
  if (maxRegions > 0 && activeRegions > maxRegions) {
    const CAP_CEILING = mergeThreshold * 2
    for (let guard = 0; guard < regionCount && activeRegions > maxRegions; guard++) {
      const cur: number[] = []
      for (let i = 0; i < regionCount; i++) if (find(i) === i) cur.push(i)
      let best: [number, number, number] | null = null
      for (let a = 0; a < cur.length; a++) {
        for (let b = a + 1; b < cur.length; b++) {
          const d = meanDelta(cur[a], cur[b])
          if (best === null || d < best[2]) best = [cur[a], cur[b], d]
        }
      }
      if (best === null || best[2] > CAP_CEILING) break
      union(best[0], best[1])
      activeRegions--
    }
  }

  for (let i = 0; i < regionCount; i++) parent[i] = find(i)
  return parent
}

/** Whole (in-mask) image as one region — fallback when no flat cores exist. */
function singleRegion(image: RasterImage, mask: Uint8Array | null, n: number): SegmentResult {
  const { data } = image
  let sr = 0
  let sg = 0
  let sb = 0
  let c = 0
  const labels = createLabelMap(image.width, image.height, 1)
  for (let p = 0; p < n; p++) {
    if (mask !== null && mask[p] === 0) {
      labels.data[p] = -1
      continue
    }
    labels.data[p] = 0
    sr += data[p * 4]
    sg += data[p * 4 + 1]
    sb += data[p * 4 + 2]
    c++
  }
  const R = c > 0 ? Math.round(sr / c) : 0
  const G = c > 0 ? Math.round(sg / c) : 0
  const B = c > 0 ? Math.round(sb / c) : 0
  return {
    labels,
    paletteHex: [rgbToHex(R, G, B)],
    paletteRgb: new Uint8Array([R, G, B]),
    counts: new Uint32Array([c]),
  }
}
