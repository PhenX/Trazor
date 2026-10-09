/**
 * Band merging: adjacent palette regions that one gradient describes more cheaply
 * than separate fills are merged into one region with one gradient fill.
 *
 * The palette labels every pixel with its nearest ink, so a smooth gradient comes
 * out as a stack of bands, one per ink the ramp crosses. This undoes that by
 * greedy agglomerative clustering of 4-connected components under the MDL cost
 * `0.5·chi² + λ·params`, cheapest merge first (the merge order of Haris et al. 1998,
 * here the merge that saves the most description length):
 *
 * 1. Split the label map into 4-connected components (raster order of their first
 *    pixel) and count, for every pair that touches, the 4-neighbor pixel pairs
 *    across their seam, how many of those step smoothly and how many step across a
 *    discontinuity (`recovery.ts`). Components rather than labels, because a band's
 *    ink can also color an unrelated flat region elsewhere in the image.
 * 2. Mark the pixels that may testify about a fill ({@link blendPartners} over the
 *    inks as they stand) and fit every component on its own.
 * 3. Each round: fit every candidate union not yet fitted (a wave), pick the pair
 *    with the largest positive gain whose union is a gradient, merge it, and drop
 *    the cached unions it invalidates; until no pair gains or the work cap is
 *    reached.
 * 4. Write back: every gradient component, and every flat component with an
 *    interior of its own, gets a fresh label past the palette and its own fill; a
 *    thin flat component keeps its palette label, whose fill is refitted flat over
 *    every flat component of that label.
 *
 * A pair is a candidate when both are alive, share at least
 * {@link MIN_SHARED_BOUNDARY} pixel pairs, are not separated by an edge (both at
 * least `MIN_GRADIENT_PIXELS` pixels and the seam mostly discontinuity), and are
 * worth a union: one of them is already a gradient, or (region recovery) the seam
 * is smooth and their inks are one ramp step apart. Two individually flat regions
 * are otherwise never unioned just because a ramp interpolates between them. The
 * gain is `cost(a) + cost(b) − cost(a ∪ b)`, each cost on its fit's own samples, or
 * for a smooth pair (region recovery) {@link commonPixelGain}, both alternatives
 * priced on the union's own interior evidence pixels. Exact ties go to the lowest
 * `(a, b)`.
 *
 * The loop is bounded by a deterministic work cap ({@link MergeBudget}): a wave is
 * charged before it is fitted, the sum of {@link unionWork} over its unions, and so
 * are a stale refit and the common-pixel gains a pick prices for the first time
 * ({@link gainWork}); a charge that would pass the cap stops the loop, and every
 * merge accepted so far stands. The charges are functions of the region sizes
 * alone, so where the loop stops does not depend on the machine.
 *
 * `rgb` is the image composited over white (encoded sRGB, three per pixel),
 * `labels` one non-negative ink index per pixel (rewritten in place), `inkRgb` the
 * palette (three encoded sRGB values per ink; a label past it has a black ink).
 * Fill models are in Trazor's pixel frame (`select.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/bands.rs`
 * (`MIN_SHARED_BOUNDARY`, `MERGE_WORK_PER_PIXEL`, `MERGE_WORK_FLOOR`, `MODEL_WORK_PER_SAMPLE`,
 * `union_work`, `gain_work`, `MergeBudget`, `merge_gradient_bands_with_ink`,
 * `merge_gradient_bands_guarded`, `merge_bands_with`, `merge_bands_budgeted`,
 * `label_components`, `component_adjacency`, `UnionFitter`, `Agglomeration`: `smooth_pair`,
 * `ramp_step`, `worth_a_union`, `across_edge`, `run`, `missing_unions`, `fit_wave`,
 * `pick_merge`, `pending_gain_work`, `best_gain`, `pair_gain`, `apply_merge`, `write_back`).
 */

import { MAX_FACES } from '../ink/regions'
import { blendPartners, PURE } from './evidence'
import { flatOnly, isGradient, MIN_GRADIENT_PIXELS } from './model'
import type { FillFit } from './model'
import {
  absorbCounts,
  allInside,
  de00,
  edgeStep,
  isEdge,
  isSmooth,
  RAMP_STEP_DE00,
  smoothStep,
} from './recovery'
import type { SeamCounts } from './recovery'
import { FIT_PIXELS_CAP, interiorCount, MAX_FIT_SAMPLES } from './samples'
import type { PixelTest } from './samples'
import { commonPixelGain, fitPixels, fitUnion } from './select'

/** Two components must touch along at least this many pixel pairs to be merge candidates. */
export const MIN_SHARED_BOUNDARY = 3

/**
 * Work units per image pixel of the merge's work cap,
 * `max(MERGE_WORK_FLOOR, MERGE_WORK_PER_PIXEL · w · h)`: 2²⁸ units up to about
 * 2900 × 2900 px, 32 a pixel beyond.
 *
 * Not from the literature: a resource bound on the greedy loop, which nothing else
 * bounds on an image whose background is a smooth non-flat field. Inspired by the
 * budgeted (anytime) form of agglomerative region merging, where the merge sequence
 * is cut off once a resource is spent and the partition reached is the answer:
 * K. Haris, S. N. Efstratiadis, N. Maglaveras, A. K. Katsaggelos (1998), Hybrid
 * image segmentation using watersheds and fast region merging, IEEE TIP 7(12),
 * pp. 1684–1699, doi:10.1109/83.730380; there the stop is a region count, here the
 * work spent.
 */
export const MERGE_WORK_PER_PIXEL = 32

/** The least work cap any image gets, so a small icon with many bands is not starved. */
export const MERGE_WORK_FLOOR = 2 ** 28

/**
 * Gathered pixels one scored sample of a union fit is worth: the split of a union
 * fit's time between gathering pixels and model selection, as inkvec measured it.
 */
export const MODEL_WORK_PER_SAMPLE = 13

/**
 * What one union fit of `n` pixels is charged, in units of one gathered pixel:
 * `g + MODEL_WORK_PER_SAMPLE · min(g, MAX_FIT_SAMPLES)` for the `g` pixels the fit
 * gathers (all `n` up to `FIT_PIXELS_CAP`, else `⌈n / ⌊n / FIT_PIXELS_CAP⌋⌉`).
 */
export function unionWork(n: number): number {
  let gathered = n
  if (n > FIT_PIXELS_CAP) {
    const stride = Math.floor(n / FIT_PIXELS_CAP)
    const rest = n % stride
    gathered = (n - rest) / stride + (rest > 0 ? 1 : 0)
  }
  return gathered + MODEL_WORK_PER_SAMPLE * Math.min(gathered, MAX_FIT_SAMPLES)
}

/**
 * What pricing one pair of `n` pixels on common pixels is charged, in the units of
 * {@link unionWork}: `n + min(n, MAX_FIT_SAMPLES)` (every pixel of the union is
 * gathered, at most `MAX_FIT_SAMPLES` are scored).
 */
export function gainWork(n: number): number {
  return n + Math.min(n, MAX_FIT_SAMPLES)
}

/**
 * The merge's deterministic work cap: what the union fits and common-pixel gains
 * may spend in total, and what they spent. A charge that would pass the cap spends
 * nothing and records the stop.
 */
export class MergeBudget {
  /** Most work the merge may spend. */
  cap: number
  /** Spent so far. */
  spent = 0
  /** True once a refused charge has stopped the loop. */
  stopped = false

  /** The budget of a `w × h` image, or an explicit `cap`. */
  constructor(w: number, h: number, cap?: number) {
    this.cap = cap ?? Math.max(MERGE_WORK_FLOOR, MERGE_WORK_PER_PIXEL * w * h)
  }

  /** Charge `work` if it fits under the cap; otherwise charge nothing, record the stop and return false. */
  charge(work: number): boolean {
    const after = this.spent + work
    if (after > this.cap) {
      this.stopped = true
      return false
    }
    this.spent = after
    return true
  }
}

/** Options of {@link mergeGradientBands}. */
export interface MergeOptions {
  /**
   * Region recovery (default on): smooth seams let blends across them testify for
   * the union, price the pair on common pixels, and admit flat pairs one ramp step
   * apart.
   */
  regionRecovery?: boolean
  /**
   * A veto on which inks may share a fill: two components whose labels it rejects
   * are never adjacent for merging (the native-alpha path passes "same opacity").
   */
  sameClass?: ((a: number, b: number) => boolean) | null
  /** The work cap; by default `new MergeBudget(w, h)`. Left as the loop leaves it. */
  budget?: MergeBudget
  /**
   * Whether a region may take a gradient (default on). Without, every component
   * is fitted flat on its own evidence and nothing merges (no union can be a
   * gradient); the write-back still gives each region with an interior of its
   * own its own color.
   */
  gradients?: boolean
}

/** What {@link mergeGradientBands} returns. */
export interface BandMerge {
  /**
   * One fill per label id of the rewritten map: the palette labels first, each
   * flat (refitted over the label's flat components where a thin one kept the
   * label, else the palette color; black past the palette), then the minted labels
   * in component order.
   */
  fills: FillFit[]
  /** Per label id, the palette entry it came from (a merged gradient: its first band's). */
  ink: number[]
  /** The work cap as the loop left it. */
  budget: MergeBudget
}

/**
 * Merge adjacent bands that one gradient describes more cheaply, rewriting
 * `labels` in place: each gradient region and each flat region with an interior of
 * its own gets a fresh label past the palette. See the module comment for the
 * steps. `sigmaNoise` is the per-channel sRGB noise, `lambda` the price of one
 * editable number (`bicLambda` of the image's pixel count).
 */
export function mergeGradientBands(
  labels: Int32Array,
  rgb: Float32Array,
  w: number,
  h: number,
  inkRgb: ArrayLike<number>,
  sigmaNoise: number,
  lambda: number,
  options: MergeOptions = {},
): BandMerge {
  const innerBlends = options.regionRecovery ?? true
  const sameClass = options.sameClass ?? null
  const gradients = options.gradients ?? true
  const budget = options.budget ?? new MergeBudget(w, h)
  const nInk = Math.floor(inkRgb.length / 3)
  let nPal = nInk
  for (let p = 0; p < labels.length; p++) if (labels[p] + 1 > nPal) nPal = labels[p] + 1

  // 1. Connected components, and their seams.
  const { comp, members, compLabel } = labelComponents(labels, w, h)
  const { adj, smooth, sharp } = componentAdjacency(
    comp,
    compLabel,
    rgb,
    w,
    h,
    sameClass,
    innerBlends,
  )

  // The ink of every label (black past the palette), and which pixels may testify
  // about a fill, computed on the labels as they stand before any merge.
  const ink = new Float32Array(3 * nPal)
  for (let i = 0; i < 3 * nInk; i++) ink[i] = inkRgb[i]
  const partner = blendPartners(rgb, w, h, labels, ink, sigmaNoise, innerBlends)
  const pure = new Uint8Array(w * h)
  for (let p = 0; p < pure.length; p++) pure[p] = partner[3 * p] === PURE ? 1 : 0

  // 2. Per-component fits; 3. the greedy agglomeration; 4. the write-back.
  const merge = new Agglomeration(
    { rgb, w, h, sigmaNoise, lambda, pure, partner, gradients },
    comp,
    members,
    compLabel,
    ink,
    adj,
    smooth,
    sharp,
    innerBlends,
    budget,
  )
  if (gradients) merge.run()
  const { fills, inks } = merge.writeBack(labels, nInk, nPal)
  return { fills, ink: inks, budget }
}

/**
 * The 4-connected components of the label map, numbered in raster order of their
 * first pixel: per pixel its component (`comp`), per component its pixels in
 * depth-first flood order (`members`, the order the strided union fit reads them)
 * and its label (`compLabel`).
 */
function labelComponents(
  labels: Int32Array,
  w: number,
  h: number,
): { comp: Int32Array; members: Int32Array[]; compLabel: number[] } {
  const n = w * h
  const comp = new Int32Array(n).fill(-1)
  const stack = new Int32Array(n)
  const group = new Int32Array(n)
  const members: Int32Array[] = []
  const compLabel: number[] = []
  for (let start = 0; start < n; start++) {
    if (comp[start] !== -1) continue
    const id = members.length
    const lab = labels[start]
    let top = 0
    let len = 0
    stack[top++] = start
    comp[start] = id
    while (top > 0) {
      const p = stack[--top]
      group[len++] = p
      const x = p % w
      if (x > 0 && comp[p - 1] === -1 && labels[p - 1] === lab) {
        comp[p - 1] = id
        stack[top++] = p - 1
      }
      if (x + 1 < w && comp[p + 1] === -1 && labels[p + 1] === lab) {
        comp[p + 1] = id
        stack[top++] = p + 1
      }
      if (p >= w && comp[p - w] === -1 && labels[p - w] === lab) {
        comp[p - w] = id
        stack[top++] = p - w
      }
      if (p + w < n && comp[p + w] === -1 && labels[p + w] === lab) {
        comp[p + w] = id
        stack[top++] = p + w
      }
    }
    members.push(group.slice(0, len))
    compLabel.push(lab)
  }
  return { comp, members, compLabel }
}

/**
 * Which components touch, in one pass over the image: `adj[a].get(b)` counts the
 * 4-neighbor pixel pairs across the seam (symmetric), `smooth` those that step
 * smoothly (only with region recovery) and `sharp` those that step across a
 * discontinuity. Pairs whose labels `sameClass` rejects are left out of all three.
 */
function componentAdjacency(
  comp: Int32Array,
  compLabel: readonly number[],
  rgb: Float32Array,
  w: number,
  h: number,
  sameClass: ((a: number, b: number) => boolean) | null,
  innerBlends: boolean,
): { adj: SeamCounts; smooth: SeamCounts; sharp: SeamCounts } {
  const nComp = compLabel.length
  const adj: SeamCounts = []
  const smooth: SeamCounts = []
  const sharp: SeamCounts = []
  for (let c = 0; c < nComp; c++) {
    adj.push(new Map())
    smooth.push(new Map())
    sharp.push(new Map())
  }
  const seam = (p: number, q: number): void => {
    const a = comp[p]
    const b = comp[q]
    if (a === b || (sameClass !== null && !sameClass(compLabel[a], compLabel[b]))) return
    bump(adj, a, b)
    if (innerBlends && smoothStep(rgb, p, q)) bump(smooth, a, b)
    if (edgeStep(rgb, p, q)) bump(sharp, a, b)
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const p = y * w + x
      if (x + 1 < w && comp[p] !== comp[p + 1]) seam(p, p + 1)
      if (y + 1 < h && comp[p] !== comp[p + w]) seam(p, p + w)
    }
  }
  return { adj, smooth, sharp }
}

/** Count one more pixel pair across the seam between `a` and `b`. */
function bump(counts: SeamCounts, a: number, b: number): void {
  counts[a].set(b, (counts[a].get(b) ?? 0) + 1)
  counts[b].set(a, (counts[b].get(a) ?? 0) + 1)
}

/** The fixed inputs of every component and union fit: the image, the pricing and the evidence computed before any merge. */
interface UnionFitter {
  readonly rgb: Float32Array
  readonly w: number
  readonly h: number
  readonly sigmaNoise: number
  readonly lambda: number
  /** Per pixel, 1 when it is evidence for its own fill. */
  readonly pure: Uint8Array
  /** Per pixel, three slots: the pixels whose inks it is a blend towards ({@link blendPartners}). */
  readonly partner: Uint32Array
  /** Whether a fill may be a gradient. */
  readonly gradients: boolean
}

/** One cached union fit of the pair `a < b`. */
interface CachedUnion {
  readonly a: number
  readonly b: number
  fit: FillFit
  /** Set once a member has absorbed something since the fit. */
  stale: boolean
}

/** One merge candidate and its gain. */
interface Pick {
  gain: number
  a: number
  b: number
}

const NO_PIXELS = new Int32Array(0)

/**
 * The state of the greedy agglomeration over connected components. Component ids
 * never change: merging `b` into `a` moves `b`'s pixels, seams and fit onto `a`
 * and marks `b` dead.
 */
class Agglomeration {
  private readonly nComp: number
  /** Pixels of each component, the first `size[c]` entries of `buf[c]`. */
  private readonly buf: Int32Array[]
  private readonly size: Int32Array
  private readonly fits: FillFit[]
  private readonly alive: Uint8Array
  /** Cached union fits, keyed `a · nComp + b` with `a < b`. */
  private readonly cache = new Map<number, CachedUnion>()
  /** The common-pixel gain of each cached union, once priced. */
  private readonly gains = new Map<number, number>()
  /** Whether the inks of two labels are one ramp step apart, keyed `la · nLabels + lb`, once measured. */
  private readonly rampSteps = new Map<number, boolean>()

  constructor(
    private readonly fitter: UnionFitter,
    /** Current component of each pixel. */
    private readonly group: Int32Array,
    members: Int32Array[],
    /** Palette label each component started from. */
    private readonly compLabel: readonly number[],
    /** Encoded sRGB ink of each label, three per label. */
    private readonly ink: Float32Array,
    private readonly adj: SeamCounts,
    private readonly smooth: SeamCounts,
    private readonly sharp: SeamCounts,
    private readonly innerBlends: boolean,
    private readonly budget: MergeBudget,
  ) {
    this.nComp = members.length
    this.buf = members
    this.size = Int32Array.from(members, (m) => m.length)
    this.alive = new Uint8Array(this.nComp).fill(1)
    this.fits = []
    for (let c = 0; c < this.nComp; c++) {
      this.fits.push(this.fit(this.members(c), NO_PIXELS, c, c, innerBlends))
    }
  }

  /** The pixels of component `c`, a view. */
  private members(c: number): Int32Array {
    return this.buf[c].subarray(0, this.size[c])
  }

  /**
   * The selected fill of components `a` and `b` (`a === b` for one), gathered from
   * `pa` then `pb` ({@link fitUnion}). With `inner`, a blend whose partners all lie
   * in the union testifies too.
   */
  private fit(pa: Int32Array, pb: Int32Array, a: number, b: number, inner: boolean): FillFit {
    const { rgb, w, h, sigmaNoise, lambda, pure, partner, gradients } = this.fitter
    const group = this.group
    const member: PixelTest = (p) => group[p] === a || group[p] === b
    const evidence: PixelTest = (p) => pure[p] === 1 || (inner && allInside(partner, p, member))
    return fitUnion(rgb, w, h, pa, pb, member, evidence, sigmaNoise, lambda, gradients)
  }

  private key(a: number, b: number): number {
    return a * this.nComp + b
  }

  /** A pair whose seam is smooth is judged as one region (region recovery only). */
  private smoothPair(a: number, b: number): boolean {
    return this.innerBlends && isSmooth(this.adj, this.smooth, a, b)
  }

  /** A smooth pair whose inks are one ramp step apart (CIEDE2000 below {@link RAMP_STEP_DE00}). */
  private rampStep(a: number, b: number): boolean {
    if (!this.smoothPair(a, b)) return false
    const la = this.compLabel[a]
    const lb = this.compLabel[b]
    const key = la * (this.ink.length / 3) + lb
    let step = this.rampSteps.get(key)
    if (step === undefined) {
      const k = this.ink
      const i = 3 * la
      const j = 3 * lb
      step = de00(k[i], k[i + 1], k[i + 2], k[j], k[j + 1], k[j + 2]) < RAMP_STEP_DE00
      this.rampSteps.set(key, step)
    }
    return step
  }

  /**
   * Whether the pair is worth a union fit: one side a gradient, or a ramp step;
   * and not across an edge.
   */
  private worthAUnion(a: number, b: number): boolean {
    return (
      (isGradient(this.fits[a].model) || isGradient(this.fits[b].model) || this.rampStep(a, b)) &&
      !this.acrossEdge(a, b)
    )
  }

  /**
   * Whether the seam is an edge two regions meet at: both components hold at least
   * `MIN_GRADIENT_PIXELS` pixels and more than half the seam steps across a
   * discontinuity (Chakraborty et al. 2025 §3.2). Anti-aliasing flecks, all edge,
   * stay absorbable.
   */
  private acrossEdge(a: number, b: number): boolean {
    return (
      this.size[a] >= MIN_GRADIENT_PIXELS &&
      this.size[b] >= MIN_GRADIENT_PIXELS &&
      isEdge(this.adj, this.sharp, a, b)
    )
  }

  /**
   * The greedy loop: each round fits the unions it has not fitted yet, picks the
   * pair with the largest positive gain and merges it, until no pair gains or the
   * work cap stops it.
   */
  run(): void {
    for (;;) {
      const missing = this.missingUnions()
      if (missing.length > 0) {
        let work = 0
        for (const k of missing) {
          const a = Math.floor(k / this.nComp)
          work += unionWork(this.size[a] + this.size[k - a * this.nComp])
        }
        if (!this.budget.charge(work)) break
        this.fitWave(missing)
      }
      const best = this.pickMerge()
      if (best === null) break
      this.applyMerge(best.a, best.b)
    }
  }

  /**
   * Candidate pairs `a < b` not yet cached (keys, ascending): both alive, sharing at
   * least {@link MIN_SHARED_BOUNDARY} pixel pairs and worth a union.
   */
  private missingUnions(): number[] {
    const missing: number[] = []
    for (let a = 0; a < this.nComp; a++) {
      if (this.alive[a] === 0) continue
      for (const [b, shared] of this.adj[a]) {
        if (b <= a || shared < MIN_SHARED_BOUNDARY) continue
        if (!this.worthAUnion(a, b)) continue
        const k = this.key(a, b)
        if (!this.cache.has(k)) missing.push(k)
      }
    }
    return missing.toSorted((x, y) => x - y)
  }

  /** Fit the unions `missing` (keys, ascending) and cache them fresh, dropping any gain priced on an earlier fit. */
  private fitWave(missing: readonly number[]): void {
    for (const k of missing) {
      const a = Math.floor(k / this.nComp)
      const b = k - a * this.nComp
      const fit = this.fit(this.members(a), this.members(b), a, b, this.smoothPair(a, b))
      this.gains.delete(k)
      this.cache.set(k, { a, b, fit, stale: false })
    }
  }

  /**
   * The merge of this round: the pair with the largest positive gain, judged on a
   * fresh fit. A winner whose cached union is stale is refitted and the choice
   * made again. Null when no pair gains or the work cap refuses a charge.
   */
  private pickMerge(): Pick | null {
    for (;;) {
      if (!this.budget.charge(this.pendingGainWork())) return null
      const best = this.bestGain()
      if (best === null) return null
      const { a, b } = best
      const k = this.key(a, b)
      const entry = this.cache.get(k)!
      if (!entry.stale) return best
      if (!this.budget.charge(unionWork(this.size[a] + this.size[b]))) return null
      const fit = this.fit(this.members(a), this.members(b), a, b, this.smoothPair(a, b))
      this.cache.set(k, { a, b, fit, stale: false })
      this.gains.delete(k)
    }
  }

  /**
   * The {@link gainWork} of every common-pixel gain the next {@link bestGain} will
   * price for the first time: the same filters as `bestGain`, summed.
   */
  private pendingGainWork(): number {
    let work = 0
    for (let a = 0; a < this.nComp; a++) {
      if (this.alive[a] === 0) continue
      for (const [b, shared] of this.adj[a]) {
        if (b <= a || shared < MIN_SHARED_BOUNDARY) continue
        const k = this.key(a, b)
        if (!this.worthAUnion(a, b) || this.gains.has(k)) continue
        const entry = this.cache.get(k)
        if (entry !== undefined && isGradient(entry.fit.model) && this.smoothPair(a, b)) {
          work += gainWork(this.size[a] + this.size[b])
        }
      }
    }
    return work
  }

  /** The best `(gain, a, b)` over every cached candidate pair, fresh or stale; exact ties to the lowest `(a, b)`. */
  private bestGain(): Pick | null {
    let best: Pick | null = null
    for (let a = 0; a < this.nComp; a++) {
      if (this.alive[a] === 0) continue
      for (const [b, shared] of this.adj[a]) {
        if (b <= a || shared < MIN_SHARED_BOUNDARY) continue
        if (!this.worthAUnion(a, b)) continue
        const gain = this.pairGain(a, b)
        if (gain === null) continue
        const better =
          best === null
            ? gain > 0
            : gain > best.gain ||
              (gain === best.gain && (a < best.a || (a === best.a && b < best.b)))
        if (better) best = { gain, a, b }
      }
    }
    return best
  }

  /**
   * What merging `a` and `b` saves, from the cached union: null when the union is
   * not cached or is flat. A smooth pair is priced by {@link commonPixelGain} (once
   * per union fit, negative infinity without evidence pixels); any other pair by
   * `cost(a) + cost(b) − cost(a ∪ b)`.
   */
  private pairGain(a: number, b: number): number | null {
    const k = this.key(a, b)
    const entry = this.cache.get(k)
    if (entry === undefined) return null
    const union = entry.fit
    if (!isGradient(union.model)) return null
    if (!this.smoothPair(a, b)) return this.fits[a].cost + this.fits[b].cost - union.cost
    const priced = this.gains.get(k)
    if (priced !== undefined) return priced
    const { rgb, w, h, sigmaNoise, lambda, pure, partner } = this.fitter
    const group = this.group
    const pa = this.members(a)
    const pixels = new Int32Array(pa.length + this.size[b])
    pixels.set(pa, 0)
    pixels.set(this.members(b), pa.length)
    const member: PixelTest = (p) => group[p] === a || group[p] === b
    const gain =
      commonPixelGain(
        rgb,
        w,
        h,
        pixels,
        member,
        (p) => group[p] === a,
        (p) => pure[p] === 1 || allInside(partner, p, member),
        this.fits[a],
        this.fits[b],
        union,
        sigmaNoise,
        lambda,
      ) ?? -Infinity
    this.gains.set(k, gain)
    return gain
  }

  /**
   * Merge component `b` into `a`: carry the union's fit forward, move `b`'s pixels
   * and seams onto `a`, and update the caches. Cached unions involving `b` are
   * dropped; those involving `a` are dropped too when flat or with region recovery
   * (common-pixel gains have no stale bound), and otherwise kept stale: the stale
   * cost, fitted without the absorbed pixels, underestimates the union's cost, so a
   * stale entry that could win is always refitted before it does. Every gain
   * touching either is dropped.
   */
  private applyMerge(a: number, b: number): void {
    const k = this.key(a, b)
    this.fits[a] = this.cache.get(k)!.fit
    this.cache.delete(k)
    const taken = this.members(b)
    for (let i = 0; i < taken.length; i++) this.group[taken[i]] = a
    this.append(a, taken)
    this.buf[b] = NO_PIXELS
    this.size[b] = 0
    this.alive[b] = 0
    absorbCounts(this.adj, a, b)
    absorbCounts(this.smooth, a, b)
    absorbCounts(this.sharp, a, b)
    for (const key of this.gains.keys()) {
      const x = Math.floor(key / this.nComp)
      const y = key - x * this.nComp
      if (x === a || y === a || x === b || y === b) this.gains.delete(key)
    }
    for (const [key, entry] of this.cache) {
      const { a: x, b: y } = entry
      const touchesA = x === a || y === a
      const keep =
        x !== b &&
        y !== b &&
        (isGradient(entry.fit.model) || !touchesA) &&
        (!this.innerBlends || !touchesA)
      if (!keep) this.cache.delete(key)
      else if (touchesA) entry.stale = true
    }
  }

  /** Append `pixels` to component `c`'s members, growing its buffer geometrically. */
  private append(c: number, pixels: Int32Array): void {
    const need = this.size[c] + pixels.length
    if (need > this.buf[c].length) {
      const grown = new Int32Array(Math.max(need, 2 * this.buf[c].length))
      grown.set(this.members(c), 0)
      this.buf[c] = grown
    }
    this.buf[c].set(pixels, this.size[c])
    this.size[c] = need
  }

  /**
   * Write the result back into `labels` and build one fill per label id: the
   * palette labels first, then a fresh label for every live component that is a
   * gradient or flat with at least `MIN_GRADIENT_PIXELS` interior pixels of its own
   * (two disconnected regions of one ink are two objects). A thin flat component
   * keeps its palette label, whose fill is refitted flat over every flat component
   * of that label (evidence pixels only), the wide ones included. Past
   * `MAX_FACES` labels a component of either kind keeps its palette label and joins
   * that pooled flat fill.
   */
  writeBack(labels: Int32Array, nInk: number, nPal: number): { fills: FillFit[]; inks: number[] } {
    const { rgb, w, h, sigmaNoise, lambda, pure } = this.fitter
    const group = this.group
    const fills: FillFit[] = []
    const inks: number[] = []
    for (let i = 0; i < nPal; i++) {
      const c = 3 * i
      const color: [number, number, number] =
        i < nInk ? [this.ink[c], this.ink[c + 1], this.ink[c + 2]] : [0, 0, 0]
      fills.push(flatOnly(color, lambda))
      inks.push(i)
    }
    // The flat components each palette label pools, and whether any thin one was left on it.
    const flatComps: number[][] = Array.from({ length: nPal }, () => [])
    const pooled = new Uint8Array(nPal)
    for (let c = 0; c < this.nComp; c++) {
      if (this.alive[c] === 0) continue
      const members = this.members(c)
      const gradient = isGradient(this.fits[c].model)
      const canMint = fills.length < MAX_FACES
      const ownColor =
        !gradient &&
        canMint &&
        interiorCount(members, w, h, (p) => group[p] === c) >= MIN_GRADIENT_PIXELS
      const minted = canMint && (gradient || ownColor)
      if (minted) {
        const id = fills.length
        for (let i = 0; i < members.length; i++) labels[members[i]] = id
        fills.push(this.fits[c])
        inks.push(this.compLabel[c])
      } else {
        pooled[this.compLabel[c]] = 1
      }
      if (!gradient || !minted) flatComps[this.compLabel[c]].push(c)
    }
    const flatOf = new Int32Array(w * h).fill(-1)
    for (let l = 0; l < nPal; l++) {
      if (pooled[l] === 0) continue
      let n = 0
      for (const c of flatComps[l]) n += this.size[c]
      const pixels = new Int32Array(n)
      n = 0
      for (const c of flatComps[l]) {
        const members = this.members(c)
        for (let i = 0; i < members.length; i++) flatOf[members[i]] = l
        pixels.set(members, n)
        n += members.length
      }
      fills[l] = fitPixels(
        rgb,
        w,
        h,
        pixels,
        (p) => flatOf[p] === l,
        (p) => pure[p] === 1,
        sigmaNoise,
        lambda,
      )[0]
    }
    return { fills, inks }
  }
}
