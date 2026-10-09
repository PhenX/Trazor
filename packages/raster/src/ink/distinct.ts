/**
 * The image as its distinct colors: each pixel's color id, where each color's sampled pixels
 * sit, and the palette's spatial tests evaluated through them.
 *
 * Every per-pixel quantity the palette reads (OKLab, sRGB, linear light, the distance to a
 * candidate or to the nearest accepted ink) is a function of the pixel's color bits, and
 * vector art repeats a few colors many times. So each quantity is computed once per distinct
 * color and read back through the pixel's id. This is the unique-color reduction of Celebi's
 * weighted k-means color quantizer (M. E. Celebi, "Improving the Performance of K-Means for
 * Color Quantization", Image and Vision Computing 29(4):260–271, 2011), with the weights the
 * counts of *sampled* pixels (the statistical passes visit every `stride`-th pixel).
 *
 * The spatial tests (interior, straddle) need pixel positions as well as colors, so each color
 * keeps the list of its sampled pixels and a per-color decision is mapped back onto the pixels
 * through the id image: histogram backprojection (M. J. Swain, D. H. Ballard, "Color
 * Indexing", IJCV 7(1):11–32, 1991).
 *
 * A candidate *claims* the colors strictly nearer to it than to every ink accepted so far: the
 * bichromatic reverse-nearest-neighbor set of the candidate against the accepted inks, weighted
 * by pixel count (F. Korn, S. Muthukrishnan, "Influence Sets Based on Reverse Nearest Neighbor
 * Queries", SIGMOD 2000). It does not change until a candidate is accepted, so {@link Claim}
 * holds it once for the claim count, the spread, the interior test, every straddle pair and the
 * representation votes. Each claimed pixel's 3×3 neighborhood is gathered once per candidate
 * as color ids ({@link Neighborhoods}).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/color/distinct.rs` (`ColourIds`,
 * `DistinctImage`, `Claim`, `weighted_lower_median`, `Neighbourhoods`, `side_of`) and
 * `inkvec-trace/src/color.rs` (`STAT_PIXELS`, `gcd`, `stat_stride`).
 */

/**
 * Pixels visited by the palette's statistical passes (claim, spread, interior, straddle,
 * representation): at or below this many pixels the stride is one and every pixel is visited.
 */
export const STAT_PIXELS = 1 << 16

/**
 * Most pixels the spread's median is taken over: pixel `i` votes when `i` is a multiple of
 * `max(⌊n / SPREAD_SAMPLES⌋, 1)`.
 */
export const SPREAD_SAMPLES = 8192

/** Greatest common divisor by Euclid's algorithm; `gcd(a, 0) = a`. */
export function gcd(a: number, b: number): number {
  while (b !== 0) {
    const t = a % b
    a = b
    b = t
  }
  return a
}

/**
 * Stride for the statistical passes over an image of `n` pixels and `width` columns: 1 up to
 * {@link STAT_PIXELS} pixels (and for a zero width); above it the smallest `s ≥ ⌈n / STAT_PIXELS⌉`
 * coprime with `width`, so visiting pixels `0, s, 2s, …` walks diagonally through the columns
 * instead of revisiting the same few.
 */
export function statStride(n: number, width: number): number {
  if (n <= STAT_PIXELS || width === 0) return 1
  let s = Math.ceil(n / STAT_PIXELS)
  while (s > 1 && gcd(s, width) !== 1) s++
  return s
}

/** Each pixel's color id, and one pixel carrying each color. */
export interface ColorIds {
  /** Pixel `i`'s color id; ids are numbered in order of first occurrence. */
  readonly cid: Int32Array
  /** The first pixel carrying each id, in id order. */
  readonly reps: Int32Array
  /** Number of distinct colors. */
  readonly count: number
}

/** Multiplicative hash of three 32-bit words into `mask + 1` slots. */
function hash3(k0: number, k1: number, k2: number, mask: number): number {
  let h = Math.imul(k0 ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15) ^ k1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 13) ^ k2, 0x27d4eb2f)
  h ^= h >>> 16
  return h & mask
}

/**
 * Number the pixels of `rgb` (three floats per pixel) by their colors' exact bits, in order of
 * first occurrence: the same numbering on every run. Two colors whose bits differ (a signed
 * zero, say) are two ids.
 */
export function colorIdsOfRgb(rgb: Float32Array): ColorIds {
  const n = Math.floor(rgb.length / 3)
  const bits = new Uint32Array(rgb.buffer, rgb.byteOffset, n * 3)
  const cid = new Int32Array(n)
  let cap = 1024
  let mask = cap - 1
  let table = new Int32Array(cap).fill(-1)
  let keys = new Uint32Array(cap * 3)
  let reps = new Int32Array(cap)
  let count = 0
  let prev = -1
  for (let i = 0; i < n; i++) {
    const k0 = bits[i * 3]
    const k1 = bits[i * 3 + 1]
    const k2 = bits[i * 3 + 2]
    // A pixel equal to its left neighbor (most of a flat image) skips the table.
    if (
      prev >= 0 &&
      keys[prev * 3] === k0 &&
      keys[prev * 3 + 1] === k1 &&
      keys[prev * 3 + 2] === k2
    ) {
      cid[i] = prev
      continue
    }
    let slot = hash3(k0, k1, k2, mask)
    let id = table[slot]
    while (id >= 0 && (keys[id * 3] !== k0 || keys[id * 3 + 1] !== k1 || keys[id * 3 + 2] !== k2)) {
      slot = (slot + 1) & mask
      id = table[slot]
    }
    if (id < 0) {
      id = count++
      if (id >= reps.length) {
        const grownKeys = new Uint32Array(keys.length * 2)
        grownKeys.set(keys)
        keys = grownKeys
        const grownReps = new Int32Array(reps.length * 2)
        grownReps.set(reps)
        reps = grownReps
      }
      keys[id * 3] = k0
      keys[id * 3 + 1] = k1
      keys[id * 3 + 2] = k2
      reps[id] = i
      table[slot] = id
      if (count * 2 > cap) {
        cap *= 2
        mask = cap - 1
        table = new Int32Array(cap).fill(-1)
        for (let d = 0; d < count; d++) {
          let s = hash3(keys[d * 3], keys[d * 3 + 1], keys[d * 3 + 2], mask)
          while (table[s] >= 0) s = (s + 1) & mask
          table[s] = d
        }
      }
    }
    cid[i] = id
    prev = id
  }
  return { cid, reps: reps.slice(0, count), count }
}

/** The colors a candidate claims, and each color's distance from it. */
export interface Claim {
  /** Per color: 1 when strictly nearer to the candidate than to every accepted ink. */
  readonly claimed: Uint8Array
  /** Per color: OKLab distance to the candidate (read only where claimed). */
  readonly dist: Float64Array
}

/** Room for `colors` distinct colors. */
export function newClaim(colors: number): Claim {
  return { claimed: new Uint8Array(colors), dist: new Float64Array(colors) }
}

/**
 * The element at index `⌊total / 2⌋` of the multiset of `values[k]` taken `mult[k]` times, in
 * ascending order: the lower median of the pixels' values, taken per distinct value. 0 for an
 * empty multiset.
 */
export function weightedLowerMedian(values: ArrayLike<number>, mult: ArrayLike<number>): number {
  let total = 0
  for (let k = 0; k < mult.length; k++) total += mult[k]
  if (total === 0) return 0
  const order = Array.from({ length: values.length }, (_, k) => k)
  order.sort((a, b) => values[a] - values[b])
  const target = Math.floor(total / 2)
  let seen = 0
  for (const k of order) {
    seen += mult[k]
    if (seen > target) return values[k]
  }
  return values[order[order.length - 1]]
}

/**
 * Where a color sits along a blend axis, as the straddle test classifies it: bit 0 when
 * `t < lo`, bit 1 when `t > hi` (NaN sets neither).
 */
export function sideOf(t: number, lo: number, hi: number): number {
  return (t < lo ? 1 : 0) | (t > hi ? 2 : 0)
}

/**
 * The straddle test's pixels: each claimed visited pixel's nine neighborhood ids, row by row
 * (an out-of-image neighbor is the id `outside`, whose side is always 0), and every color that
 * occurs among them.
 */
export class Neighborhoods {
  constructor(
    /** Nine ids per claimed pixel. */
    readonly ids: Int32Array,
    /** Every color that occurs in `ids`, `outside` excluded, in order of first occurrence. */
    readonly colors: Int32Array,
    /** The id standing for "outside the image": the number of distinct colors. */
    readonly outside: number,
    /** Whether the image had a full grid to read. */
    readonly geometry: boolean,
  ) {}

  /**
   * The straddle fraction along one blend axis. `side(d)` says where color `d` sits on it
   * ({@link sideOf}); a pixel straddles when its neighborhood holds a color with each bit.
   * `scratch` has one entry per distinct color plus one; only the colors that occur here are
   * written and read. `straddling / claimed`, and 1 when nothing is claimed.
   */
  straddle(side: (d: number) => number, scratch: Uint8Array): number {
    const total = this.ids.length / 9
    if (total === 0) return 1
    for (let k = 0; k < this.colors.length; k++) scratch[this.colors[k]] = side(this.colors[k])
    scratch[this.outside] = 0
    const ids = this.ids
    let straddling = 0
    for (let p = 0; p < ids.length; p += 9) {
      let acc = 0
      for (let k = 0; k < 9; k++) acc |= scratch[ids[p + k]]
      if (acc === 3) straddling++
    }
    return straddling / total
  }
}

/**
 * The image's geometry and its sampled pixels, grouped by color. The statistical passes visit
 * pixels `0, s, 2s, …` (`s = stride`, {@link statStride}); here the visited pixels are stored
 * per color (a compressed row per id), so a pass over "the visited pixels a candidate claims"
 * touches exactly those.
 */
export class DistinctImage {
  /** Pixel `i`'s color id. */
  readonly cid: Int32Array
  /** Row width. */
  readonly width: number
  /** Row count. */
  readonly height: number
  /** Number of pixels the claim visits (`0..n`; the spatial tests stop at `width · height`). */
  readonly n: number
  /** Stride of the statistical passes. */
  readonly stride: number
  /** Visited pixels per color. */
  readonly count: Int32Array
  /** Color `d`'s visited pixels are `px[off[d] .. off[d + 1]]`, ascending. */
  readonly off: Int32Array
  readonly px: Int32Array
  /** Per color, the visited pixels that also fall on the spread's sub-sample. */
  readonly spreadCount: Int32Array

  /**
   * Index `ids` (over `n = ids.cid.length` pixels) for a `width × height` image, visiting every
   * `stride`-th pixel ({@link statStride} when omitted; at least 1).
   */
  constructor(ids: ColorIds, width: number, height: number, stride?: number) {
    const n = ids.cid.length
    const s = Math.max(1, stride ?? statStride(n, width))
    const d = ids.count
    const spreadStride = Math.max(1, Math.floor(n / SPREAD_SAMPLES))
    const count = new Int32Array(d)
    const spreadCount = new Int32Array(d)
    for (let i = 0; i < n; i += s) {
      const id = ids.cid[i]
      count[id]++
      if (i % spreadStride === 0) spreadCount[id]++
    }
    const off = new Int32Array(d + 1)
    for (let k = 0; k < d; k++) off[k + 1] = off[k] + count[k]
    const fill = off.slice(0, d)
    const px = new Int32Array(off[d])
    for (let i = 0; i < n; i += s) px[fill[ids.cid[i]]++] = i
    this.cid = ids.cid
    this.width = width
    this.height = height
    this.n = n
    this.stride = s
    this.count = count
    this.off = off
    this.px = px
    this.spreadCount = spreadCount
  }

  /** Number of distinct colors. */
  get colors(): number {
    return this.count.length
  }

  /** Whether the spatial tests have a full `width × height` grid to read. */
  hasGeometry(): boolean {
    return this.width !== 0 && this.height !== 0 && this.n >= this.width * this.height
  }

  /**
   * Mark the colors a candidate at OKLab `(l, a, b)` claims: those strictly nearer to it
   * (`lab`, three per color) than to the nearest accepted ink (`nearest`). Returns the claim in
   * pixels: the claimed visited pixels scaled back up by the stride.
   */
  claim(
    claim: Claim,
    nearest: Float64Array,
    lab: Float64Array,
    l: number,
    a: number,
    b: number,
  ): number {
    let visited = 0
    for (let d = 0; d < this.count.length; d++) {
      const dl = lab[d * 3] - l
      const da = lab[d * 3 + 1] - a
      const db = lab[d * 3 + 2] - b
      const dd = Math.sqrt(dl * dl + da * da + db * db)
      claim.dist[d] = dd
      const c = dd < nearest[d]
      claim.claimed[d] = c ? 1 : 0
      if (c) visited += this.count[d]
    }
    return visited * this.stride
  }

  /**
   * The lower median distance from the candidate of its claimed *members*: claimed visited
   * pixels within `tol` of it, on the spread sub-sample. 0 when there are none. Members, not
   * territory: territory is whatever has no closer ink yet, the whole image for the first
   * candidate. The median, not the mean: an anti-aliased edge puts a ramp of blend pixels
   * inside `tol`, and a mean is pulled up by them.
   */
  spread(claim: Claim, tol: number): number {
    const values: number[] = []
    const mult: number[] = []
    for (let d = 0; d < this.count.length; d++) {
      if (claim.claimed[d] && claim.dist[d] < tol && this.spreadCount[d] > 0) {
        values.push(claim.dist[d])
        mult.push(this.spreadCount[d])
      }
    }
    return weightedLowerMedian(values, mult)
  }

  /**
   * The claimed visited pixels on the `width × height` grid, color by color (ascending id), each
   * color's pixels in raster order. Empty without a full grid.
   */
  claimedPixels(claim: Claim): Int32Array {
    if (!this.hasGeometry()) return new Int32Array(0)
    const grid = this.width * this.height
    let total = 0
    for (let d = 0; d < this.count.length; d++) if (claim.claimed[d]) total += this.count[d]
    const out = new Int32Array(total)
    let at = 0
    for (let d = 0; d < this.count.length; d++) {
      if (!claim.claimed[d]) continue
      for (let k = this.off[d]; k < this.off[d + 1]; k++) {
        const i = this.px[k]
        if (i >= grid) break
        out[at++] = i
      }
    }
    return at === total ? out : out.subarray(0, at)
  }

  /**
   * One step of 4-neighbor erosion of the claimed set, as a fraction of the claimed visited
   * pixels: `|{i claimed : its in-image 4-neighbors are claimed}| / |claimed|`. A neighbor
   * outside the image counts as claimed, so a region touching the edge is not penalized. 1
   * without a full grid, 0 when nothing is claimed.
   *
   * The set is the candidate's claim (the pixels it would take from the palette as it stands),
   * not a ball around it: an anti-aliased color sits close to one end of its ramp, and a ball
   * around it swallows the solid region as well as the band.
   */
  interior(claim: Claim, pixels: Int32Array): number {
    if (!this.hasGeometry()) return 1
    const w = this.width
    const h = this.height
    const cid = this.cid
    const cl = claim.claimed
    let inner = 0
    for (let k = 0; k < pixels.length; k++) {
      const i = pixels[k]
      const y = (i / w) | 0
      const x = i - y * w
      if (
        (x === 0 || cl[cid[i - 1]]) &&
        (x + 1 === w || cl[cid[i + 1]]) &&
        (y === 0 || cl[cid[i - w]]) &&
        (y + 1 === h || cl[cid[i + w]])
      ) {
        inner++
      }
    }
    return pixels.length === 0 ? 0 : inner / pixels.length
  }

  /** Every claimed visited pixel's 3×3 neighborhood as color ids, for all of a candidate's blend pairs. */
  neighborhoods(pixels: Int32Array): Neighborhoods {
    const outside = this.count.length
    if (!this.hasGeometry())
      return new Neighborhoods(new Int32Array(0), new Int32Array(0), outside, false)
    const w = this.width
    const h = this.height
    const ids = new Int32Array(pixels.length * 9)
    const seen = new Uint8Array(outside + 1)
    seen[outside] = 1
    const colors: number[] = []
    let at = 0
    for (let k = 0; k < pixels.length; k++) {
      const i = pixels[k]
      const y = (i / w) | 0
      const x = i - y * w
      for (let ny = y - 1; ny <= y + 1; ny++) {
        for (let nx = x - 1; nx <= x + 1; nx++) {
          const id = nx >= 0 && ny >= 0 && nx < w && ny < h ? this.cid[ny * w + nx] : outside
          if (!seen[id]) {
            seen[id] = 1
            colors.push(id)
          }
          ids[at++] = id
        }
      }
    }
    return new Neighborhoods(ids, Int32Array.from(colors), outside, true)
  }
}
