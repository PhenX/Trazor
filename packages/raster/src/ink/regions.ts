/**
 * Label-map clean-up between the per-pixel labeling and the planar map: despeckle, blend
 * absorption (whole slivers, then single pixels) and the split into 4-connected faces.
 *
 * In the pipeline, after the palette labels every pixel with its nearest ink:
 *
 * 1. {@link despeckle} folds components smaller than the minimum region into their
 *    commonest neighbor;
 * 2. {@link absorbBlendSlivers} dissolves thin components whose pixels are anti-aliasing
 *    blends of the inks around them;
 * 3. {@link reassignBlendPixels} does the same pixel by pixel along the remaining
 *    boundaries (and {@link despeckle} runs again when either moved anything);
 * 4. after the gradient stages, {@link splitComponents} turns the label map (one id per
 *    ink) into a face map (one id per 4-connected component).
 *
 * Labels are non-negative ink (or minted) indices, one per pixel, row-major; `rgb` is the
 * image composited over white, encoded sRGB in [0, 1], three values per pixel; `alpha` the
 * straight source alpha in [0, 1] (null when opaque); `inkRgb` the palette, three encoded
 * sRGB values per ink. A label at or past the palette's end has no color: the blend passes
 * leave it out of every mixture.
 *
 * Every color distance here is the Euclidean distance in encoded sRGB [0, 1]: rasterizers
 * blend the stored sRGB values, so an anti-aliased pixel lies on the straight sRGB segment
 * between its inks, and the residual to that segment is in the units of the pixel noise.
 * The four-channel counterparts for native transparency are in `native-regions.ts`.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/regions.rs` (`despeckle`,
 * `commonest_neighbour`, `absorb_blend_slivers`, `SliverRound`, `absorb_sliver`,
 * `sliver_destinations`, `tally_contacts`, `mixture`, `BACKDROP`, `reassign_blend_pixels`,
 * `relabel_rounds`, `split_components`, `split_within`, `cap_components`, `MAX_FACES`).
 */
import { MIXTURE_TOLERANCE } from '../represent'
import { componentMembers, componentShape, findComponents } from './components'
import type { Components, Members } from './components'

/**
 * Most faces {@link splitComponents} numbers, ids `0 ..= 65534`: inkvec's 16-bit face-id
 * range with the top value reserved for the outside of the image. A map with more
 * components holds more regions than an SVG can usefully carry, and gives up its smallest
 * specks first.
 */
export const MAX_FACES = 65535

/** Color of the backdrop the image was composited over (encoded sRGB). */
export const BACKDROP: readonly [number, number, number] = [1, 1, 1]

/** Alpha below which a pixel is translucent and the backdrop joins its candidate inks. */
export const TRANSLUCENT_ALPHA = 0.99

/** Single-precision rounding: the blend passes compute in inkvec's `f32`. */
const F = Math.fround

/** The degeneracy floor of {@link mixture}, as a single-precision value. */
const DEGENERATE = F(1e-12)

/** Rounds of whole-sliver absorption: dissolving one sliver can leave a neighbor thinner. */
export const ABSORB_ROUNDS = 2

/** Rounds of per-pixel blend reassignment. */
export const REASSIGN_ROUNDS = 4

/**
 * Largest mixture residual (encoded sRGB) at which a pixel still counts as a blend,
 * `max(3σ, 0.025)` (`MIXTURE_TOLERANCE`): three noise sigmas, floored so that clean
 * synthetic input, where σ is near zero, does not reject blends over float rounding in the
 * rasterizer. Single precision, as the residuals it is compared with.
 */
export function blendTolerance(sigmaNoise: number): number {
  return F(Math.max(3 * sigmaNoise, MIXTURE_TOLERANCE))
}

/** The nearest convex mixture of a color: residual distance and dominant ink. */
export interface Mixture {
  /** Distance from the color to the nearest mixture. */
  r: number
  /** Index (into the candidate colors) of the ink with the largest weight in it. */
  who: number
}

/**
 * Explain the color `c[at .. at + channels]` as a convex mixture of two or three of the
 * `k` colors in `cols` (`channels` values each): writes the distance to the nearest point
 * of any segment between two of them or any triangle spanned by three, and the index of the
 * color with the largest weight in that nearest mixture (the ink the pixel mostly is).
 * Returns false when there are fewer than two colors or every pair and triple is
 * degenerate.
 *
 * A pair `(a, b)`: `t = clamp(((c − a)·(b − a)) / |b − a|², 0, 1)`, nearest point
 * `a + t (b − a)`, dominant `a` when `t < 0.5`, else `b`. A triple `(a, b, e)` with
 * `u = b − a`, `v = e − a`, `w = c − a`: the normal equations of the plane projection,
 * `s = (|v|² w·u − (u·v) w·v) / det`, `t = (|u|² w·v − (u·v) w·u) / det`,
 * `det = |u|²|v|² − (u·v)²`, offered only inside the triangle (`s, t ≥ 0`, `s + t ≤ 1`),
 * dominant the largest of `(1 − s − t, s, t)`. Exhaustive (`O(k³)`); ties keep the first
 * candidate (pairs before triples, lower indices first).
 *
 * The arithmetic is single precision, each operation rounded in inkvec's order (the
 * triangle's nearest point summed as `(a + u s) + v t` in three channels and
 * `a + (u s + v t)` in four), so a near-tie between two candidates, or a weight at one
 * half, breaks as inkvec breaks it.
 */
export function mixture(
  c: ArrayLike<number>,
  at: number,
  cols: Float64Array,
  k: number,
  channels: number,
  out: Mixture,
): boolean {
  if (k < 2) return false
  let best = Infinity
  let who = -1
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = i * channels
      const b = j * channels
      let uu = 0
      let wu = 0
      for (let m = 0; m < channels; m++) {
        const am = F(cols[a + m])
        const u = F(F(cols[b + m]) - am)
        uu = F(uu + F(u * u))
        wu = F(wu + F(F(c[at + m] - am) * u))
      }
      if (uu < DEGENERATE) continue
      const t = Math.min(1, Math.max(0, F(wu / uu)))
      let d2 = 0
      for (let m = 0; m < channels; m++) {
        const am = F(cols[a + m])
        const u = F(F(cols[b + m]) - am)
        const e = F(c[at + m] - F(am + F(u * t)))
        d2 = F(d2 + F(e * e))
      }
      if (who < 0 || d2 < best) {
        best = d2
        who = t < 0.5 ? i : j
      }
    }
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      for (let e = j + 1; e < k; e++) {
        const a = i * channels
        const b = j * channels
        const f = e * channels
        let uu = 0
        let vv = 0
        let uv = 0
        let wu = 0
        let wv = 0
        for (let m = 0; m < channels; m++) {
          const am = F(cols[a + m])
          const u = F(F(cols[b + m]) - am)
          const v = F(F(cols[f + m]) - am)
          const w = F(c[at + m] - am)
          uu = F(uu + F(u * u))
          vv = F(vv + F(v * v))
          uv = F(uv + F(u * v))
          wu = F(wu + F(w * u))
          wv = F(wv + F(w * v))
        }
        const det = F(F(uu * vv) - F(uv * uv))
        if (Math.abs(det) < DEGENERATE) continue
        const s = F(F(F(vv * wu) - F(uv * wv)) / det)
        const t = F(F(F(uu * wv) - F(uv * wu)) / det)
        if (s < 0 || t < 0 || F(s + t) > 1) continue
        let d2 = 0
        for (let m = 0; m < channels; m++) {
          const am = F(cols[a + m])
          const us = F(F(F(cols[b + m]) - am) * s)
          const vt = F(F(F(cols[f + m]) - am) * t)
          const q = channels === 3 ? F(F(am + us) + vt) : F(am + F(us + vt))
          const d = F(c[at + m] - q)
          d2 = F(d2 + F(d * d))
        }
        if (who < 0 || d2 < best) {
          best = d2
          const wa = F(F(1 - s) - t)
          who = wa >= s && wa >= t ? i : s >= t ? j : e
        }
      }
    }
  }
  if (who < 0) return false
  out.r = F(Math.sqrt(best))
  out.who = who
  return true
}

/**
 * Pixel-edge contacts of one component with each label, counted sparsely: `count[l]` for
 * every label, and the labels touched so far, so clearing costs only what was counted.
 */
export class ContactTally {
  readonly count: Int32Array
  readonly touched: Int32Array
  size = 0

  constructor(labelCount: number) {
    this.count = new Int32Array(labelCount)
    this.touched = new Int32Array(labelCount)
  }

  add(l: number): void {
    if (this.count[l]++ === 0) this.touched[this.size++] = l
  }

  clear(): void {
    for (let k = 0; k < this.size; k++) this.count[this.touched[k]] = 0
    this.size = 0
  }

  /** The label with the most contacts, ties to the lower label; -1 when none. */
  commonest(): number {
    let best = -1
    for (let k = 0; k < this.size; k++) {
      const l = this.touched[k]
      const c = this.count[l]
      if (best < 0 || c > this.count[best] || (c === this.count[best] && l < best)) best = l
    }
    return best
  }

  /**
   * The `k` most-touched labels, most contacts first and ties to the lower label, written
   * to `out`; returns how many there are (at most `k`).
   */
  top(k: number, out: Int32Array): number {
    let m = 0
    for (let s = 0; s < this.size; s++) {
      const l = this.touched[s]
      const c = this.count[l]
      // Insertion into the sorted head, dropping whatever falls past `k`.
      let at = m < k ? m : k
      while (at > 0) {
        const prev = out[at - 1]
        const pc = this.count[prev]
        if (pc > c || (pc === c && prev < l)) break
        if (at < k) out[at] = prev
        at--
      }
      if (at < k) out[at] = l
      if (m < k) m++
    }
    return m
  }
}

/** One more than the largest label in `labels`, and at least `atLeast`. */
export function labelBound(labels: Int32Array, atLeast: number): number {
  let max = -1
  for (let p = 0; p < labels.length; p++) if (labels[p] > max) max = labels[p]
  return Math.max(max + 1, atLeast, 1)
}

/**
 * Count how component `id` (pixels `pixels[from .. to]`) touches the rest of the image:
 * `interior` is the number of its pixels whose in-image 4-neighbors all belong to it, and
 * `foreign` the number of pixel edges it shares with other components. `tally` is cleared
 * and then counts those edges by the label of the outside pixel, read from `labels` as it
 * is now, so a neighbor absorbed earlier in the same round counts under its new label.
 */
export function tallyContacts(
  pixels: Int32Array,
  from: number,
  to: number,
  id: number,
  comp: Int32Array,
  labels: Int32Array,
  w: number,
  h: number,
  tally: ContactTally,
): { interior: number; foreign: number } {
  tally.clear()
  let interior = 0
  let foreign = 0
  for (let k = from; k < to; k++) {
    const p = pixels[k]
    const y = (p / w) | 0
    const x = p - y * w
    let inside = true
    if (x > 0 && comp[p - 1] !== id) {
      inside = false
      tally.add(labels[p - 1])
      foreign++
    }
    if (x + 1 < w && comp[p + 1] !== id) {
      inside = false
      tally.add(labels[p + 1])
      foreign++
    }
    if (y > 0 && comp[p - w] !== id) {
      inside = false
      tally.add(labels[p - w])
      foreign++
    }
    if (y + 1 < h && comp[p + w] !== id) {
      inside = false
      tally.add(labels[p + w])
      foreign++
    }
    if (inside) interior++
  }
  return { interior, foreign }
}

/**
 * One round of sliver absorption's view of the label map: its components, and the member
 * lists of the thin ones only (`5·interior < area` and touching another component, the
 * counts that turn every other component down, which depend on the components alone).
 */
export function sliverRound(
  labels: Int32Array,
  w: number,
  h: number,
): { comps: Components; thin: Members } {
  const comps = findComponents(labels, w, h)
  const { interior, foreign } = componentShape(comps, w, h)
  const thin = componentMembers(comps, (id) => interior[id] * 5 < comps.size[id] && foreign[id] > 0)
  return { comps, thin }
}

/** The inputs every sliver of one absorption call shares. */
interface SliverScene {
  rgb: Float32Array
  alpha: Float32Array | null
  w: number
  h: number
  inkRgb: Float64Array
  inkCount: number
  tol: number
  tally: ContactTally
  /** The (up to three) neighboring labels, most-touched first. */
  top: Int32Array
  /** Candidate colors: the neighboring inks, then the backdrop. */
  cols: Float64Array
  /** Destination of each pixel of the sliver, in member order. */
  dest: Int32Array
  mix: Mixture
}

/**
 * Try to dissolve one component; returns whether it was absorbed. Three tests, in order,
 * each on counts rather than colors so that one noisy pixel cannot swing them:
 *
 * 1. thin: fewer than 20 % of its pixels are interior (`5·interior < area`), and it has a
 *    neighbor;
 * 2. between few inks: its three most-touched neighboring labels (ties to the lower label)
 *    hold at least 80 % of its boundary contacts, and all of them, at least two, have a
 *    palette color;
 * 3. a blend of those inks: at least 80 % of its pixels lie within the tolerance of a
 *    convex {@link mixture} of them, with the white backdrop as one more ink when a pixel is
 *    translucent and white is not already among them.
 *
 * On success each pixel moves to its own dominant ink, so a seam between A and B splits
 * down the middle; where the backdrop dominates, the pixel is a translucent edge fading to
 * nothing and goes to the dominant real ink (or the most-touched neighbor when the real inks
 * have no mixture). A pixel no mixture explains keeps its label.
 */
function absorbSliver(
  s: SliverScene,
  pixels: Int32Array,
  from: number,
  to: number,
  comp: Int32Array,
  labels: Int32Array,
): boolean {
  const area = to - from
  if (area === 0) return false
  const id = comp[pixels[from]]
  const { interior, foreign } = tallyContacts(pixels, from, to, id, comp, labels, s.w, s.h, s.tally)
  if (interior * 5 >= area || foreign === 0) return false
  const nTop = s.tally.top(3, s.top)
  let covered = 0
  for (let k = 0; k < nTop; k++) covered += s.tally.count[s.top[k]]
  if (covered * 5 < foreign * 4) return false
  for (let k = 0; k < nTop; k++) if (s.top[k] >= s.inkCount) return false
  if (nTop < 2) return false
  const { cols, inkRgb } = s
  let hasBackdrop = false
  for (let k = 0; k < nTop; k++) {
    const l = s.top[k]
    cols[k * 3] = F(inkRgb[l * 3])
    cols[k * 3 + 1] = F(inkRgb[l * 3 + 1])
    cols[k * 3 + 2] = F(inkRgb[l * 3 + 2])
    if (
      cols[k * 3] === BACKDROP[0] &&
      cols[k * 3 + 1] === BACKDROP[1] &&
      cols[k * 3 + 2] === BACKDROP[2]
    )
      hasBackdrop = true
  }
  let k = nTop
  let backdrop = -1
  if (!hasBackdrop && s.alpha !== null) {
    let translucent = false
    for (let m = from; m < to; m++) {
      if (s.alpha[pixels[m]] < TRANSLUCENT_ALPHA) {
        translucent = true
        break
      }
    }
    if (translucent) {
      cols[k * 3] = BACKDROP[0]
      cols[k * 3 + 1] = BACKDROP[1]
      cols[k * 3 + 2] = BACKDROP[2]
      backdrop = k++
    }
  }

  const { mix, dest, rgb } = s
  let pass = 0
  for (let m = from; m < to; m++) {
    const p = pixels[m]
    if (!mixture(rgb, p * 3, cols, k, 3, mix)) {
      dest[m - from] = labels[p]
      continue
    }
    if (mix.r <= s.tol) pass++
    if (mix.who !== backdrop) dest[m - from] = s.top[mix.who]
    else dest[m - from] = mixture(rgb, p * 3, cols, k - 1, 3, mix) ? s.top[mix.who] : s.top[0]
  }
  if (pass * 5 < area * 4) return false
  for (let m = from; m < to; m++) labels[pixels[m]] = dest[m - from]
  return true
}

/**
 * Dissolve thin components that are color blends of their dominant neighbors (the tests
 * are listed on `absorbSliver`), editing `labels` in place. Anti-aliased pixels between two
 * inks are blends of them, but nearest-ink labeling often gives them a third color; left
 * alone they form one- or two-pixel slivers along every boundary, each minting junctions.
 *
 * A pixel counts as a blend when its mixture residual is at most
 * {@link blendTolerance}`(sigmaNoise)`. At most {@link ABSORB_ROUNDS} rounds, stopping on a
 * round that absorbs nothing; each round finds the components once and visits them in
 * raster order, and each edit is visible to later components of the round. Returns the
 * number of components absorbed.
 */
export function absorbBlendSlivers(
  labels: Int32Array,
  rgb: Float32Array,
  alpha: Float32Array | null,
  w: number,
  h: number,
  inkRgb: Float64Array,
  sigmaNoise: number,
): number {
  const inkCount = Math.floor(inkRgb.length / 3)
  const n = w * h
  const scene: SliverScene = {
    rgb,
    alpha,
    w,
    h,
    inkRgb,
    inkCount,
    tol: blendTolerance(sigmaNoise),
    tally: new ContactTally(1),
    top: new Int32Array(3),
    cols: new Float64Array(4 * 3),
    dest: new Int32Array(n),
    mix: { r: 0, who: -1 },
  }
  let absorbed = 0
  for (let round = 0; round < ABSORB_ROUNDS; round++) {
    const { comps, thin } = sliverRound(labels, w, h)
    scene.tally = new ContactTally(labelBound(labels, inkCount))
    let changed = 0
    for (let id = 0; id < comps.count; id++) {
      const from = thin.offset[id]
      const to = thin.offset[id + 1]
      if (from === to) continue
      if (absorbSliver(scene, thin.pixels, from, to, comps.comp, labels)) changed++
    }
    absorbed += changed
    if (changed === 0) break
  }
  return absorbed
}

/**
 * Synchronous relabeling rounds: each round decides pixels from the labels as they stood
 * when it began, then applies every move; up to `rounds` rounds, stopping once nothing
 * moves. `decide(labels, p)` returns pixel `p`'s new label, or -1 to stay; it must read
 * only `p`'s 3×3 neighborhood of labels (and data that never changes). A pixel whose
 * neighborhood did not change then decides as it did, which was "stay", so the first round
 * decides every pixel and each later one only the 3×3 neighborhoods of the pixels that just
 * moved, with the same moves as deciding every pixel every round (a plain worklist).
 * Returns the number of moves.
 */
export function relabelRounds(
  labels: Int32Array,
  w: number,
  h: number,
  rounds: number,
  decide: (labels: Int32Array, p: number) => number,
): number {
  const n = w * h
  const moveAt = new Int32Array(n)
  const moveTo = new Int32Array(n)
  let active: Int32Array | null = null
  let activeLength = 0
  let stamp: Int32Array | null = null
  let total = 0
  for (let round = 0; round < rounds; round++) {
    let moves = 0
    const count = active === null ? n : activeLength
    for (let k = 0; k < count; k++) {
      const p = active === null ? k : active[k]
      const t = decide(labels, p)
      if (t < 0) continue
      moveAt[moves] = p
      moveTo[moves] = t
      moves++
    }
    if (moves === 0) break
    for (let k = 0; k < moves; k++) labels[moveAt[k]] = moveTo[k]
    total += moves
    if (round + 1 < rounds) {
      if (stamp === null) stamp = new Int32Array(n).fill(-1)
      if (active === null) active = new Int32Array(n)
      activeLength = 0
      for (let k = 0; k < moves; k++) {
        const p = moveAt[k]
        const y = (p / w) | 0
        const x = p - y * w
        for (let qy = Math.max(y - 1, 0); qy < Math.min(y + 2, h); qy++) {
          for (let qx = Math.max(x - 1, 0); qx < Math.min(x + 2, w); qx++) {
            const q = qy * w + qx
            if (stamp[q] !== round) {
              stamp[q] = round
              active[activeLength++] = q
            }
          }
        }
      }
    }
  }
  return total
}

/** The 8-neighborhood in the scan order NW, N, NE, W, E, SW, S, SE. */
const EIGHT_DX = [-1, 0, 1, -1, 1, -1, 0, 1]
const EIGHT_DY = [-1, -1, -1, 0, 0, 1, 1, 1]

/**
 * The labels a blend at pixel `p` is drawn from: its own label, then up to three other
 * distinct labels among its eight neighbors, first found in the scan order NW, N, NE, W,
 * E, SW, S, SE. Written to `labs` (four slots); returns how many.
 */
export function blendCandidates(
  snap: Int32Array,
  p: number,
  w: number,
  h: number,
  labs: Int32Array,
): number {
  const y = (p / w) | 0
  const x = p - y * w
  labs[0] = snap[p]
  let nl = 1
  for (let d = 0; d < 8; d++) {
    const qx = x + EIGHT_DX[d]
    const qy = y + EIGHT_DY[d]
    if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue
    const l = snap[qy * w + qx]
    let seen = false
    for (let s = 0; s < nl; s++) if (labs[s] === l) seen = true
    if (!seen && nl < 4) labs[nl++] = l
  }
  return nl
}

/**
 * Reassign single boundary pixels that a neighboring blend explains strictly better: the
 * per-pixel sequel to {@link absorbBlendSlivers}. A pixel's candidate inks are its own label
 * plus up to three other distinct labels among its eight neighbors (first found in the scan
 * order NW, N, NE, W, E, SW, S, SE), with the white {@link BACKDROP} added when the pixel is
 * translucent. The pixel moves to the dominant ink of its nearest convex {@link mixture} when
 * that ink differs from its own, the residual is at most {@link blendTolerance}, and the
 * residual is under half the pixel's distance to its own ink (a pixel that plausibly is its
 * own ink stays). Where the backdrop dominates, the dominant real ink is used instead. A
 * pixel whose own label has no palette color stays. Rounds as {@link relabelRounds}, up to
 * {@link REASSIGN_ROUNDS}. Returns the number of moves.
 */
export function reassignBlendPixels(
  labels: Int32Array,
  rgb: Float32Array,
  alpha: Float32Array | null,
  w: number,
  h: number,
  inkRgb: Float64Array,
  sigmaNoise: number,
): number {
  const inkCount = Math.floor(inkRgb.length / 3)
  const tol = blendTolerance(sigmaNoise)
  const labs = new Int32Array(4)
  const keep = new Int32Array(5)
  const cols = new Float64Array(5 * 3)
  const mix: Mixture = { r: 0, who: -1 }
  const decide = (snap: Int32Array, p: number): number => {
    const own = snap[p]
    const nl = blendCandidates(snap, p, w, h, labs)
    if (nl < 2 || own >= inkCount) return -1
    const at = p * 3
    const er = F(rgb[at] - F(inkRgb[own * 3]))
    const eg = F(rgb[at + 1] - F(inkRgb[own * 3 + 1]))
    const eb = F(rgb[at + 2] - F(inkRgb[own * 3 + 2]))
    const residOwn = F(Math.sqrt(F(F(F(er * er) + F(eg * eg)) + F(eb * eb))))

    let k = 0
    let hasBackdrop = false
    for (let s = 0; s < nl; s++) {
      const l = labs[s]
      if (l >= inkCount) continue
      cols[k * 3] = F(inkRgb[l * 3])
      cols[k * 3 + 1] = F(inkRgb[l * 3 + 1])
      cols[k * 3 + 2] = F(inkRgb[l * 3 + 2])
      if (
        cols[k * 3] === BACKDROP[0] &&
        cols[k * 3 + 1] === BACKDROP[1] &&
        cols[k * 3 + 2] === BACKDROP[2]
      )
        hasBackdrop = true
      keep[k++] = l
    }
    if (alpha !== null && alpha[p] < TRANSLUCENT_ALPHA && !hasBackdrop) {
      cols[k * 3] = BACKDROP[0]
      cols[k * 3 + 1] = BACKDROP[1]
      cols[k * 3 + 2] = BACKDROP[2]
      keep[k++] = -1
    }
    if (!mixture(rgb, at, cols, k, 3, mix)) return -1
    const r = mix.r
    let target = keep[mix.who]
    if (target < 0) {
      if (!mixture(rgb, at, cols, k - 1, 3, mix)) return -1
      target = keep[mix.who]
    }
    return target !== own && r <= tol && r < 0.5 * residOwn ? target : -1
  }
  return relabelRounds(labels, w, h, REASSIGN_ROUNDS, decide)
}

/**
 * Fold every 4-connected component smaller than `minSize` pixels, whole, into the
 * neighboring label sharing the most pixel edges with it (ties to the lower label), read
 * from the labels as they are at that moment, so a speckle absorbed earlier counts under
 * its new label. Components are found once, before any is absorbed, and visited in raster
 * order. A component with no neighbor (the whole image one label) stays; `minSize <= 1` is
 * a no-op.
 */
export function despeckle(labels: Int32Array, w: number, h: number, minSize: number): void {
  if (minSize <= 1) return
  const comps = findComponents(labels, w, h)
  const small = componentMembers(comps, (id) => comps.size[id] < minSize)
  const tally = new ContactTally(labelBound(labels, 0))
  for (let id = 0; id < comps.count; id++) {
    const from = small.offset[id]
    const to = small.offset[id + 1]
    if (from === to) continue
    const best = commonestNeighbor(small.pixels, from, to, id, comps.comp, labels, w, h, tally)
    if (best < 0) continue
    for (let k = from; k < to; k++) labels[small.pixels[k]] = best
  }
}

/**
 * The label sharing the most pixel edges with component `id` (pixels `pixels[from .. to]`),
 * read from `labels` as they are now; ties to the lower label. -1 when it touches nothing.
 */
function commonestNeighbor(
  pixels: Int32Array,
  from: number,
  to: number,
  id: number,
  comp: Int32Array,
  labels: Int32Array,
  w: number,
  h: number,
  tally: ContactTally,
): number {
  tallyContacts(pixels, from, to, id, comp, labels, w, h, tally)
  return tally.commonest()
}

/**
 * Relabel a label map by 4-connected component: `faces[p]` is the component id of pixel
 * `p`, numbered in raster order of each component's first pixel, and `faceLabel[f]` the
 * label component `f` is made of. Two same-label pixels that touch only at a corner are two
 * faces. A map with more than {@link MAX_FACES} components first has its smallest merged
 * into their neighbors ({@link capComponents}) until that many remain.
 */
export function splitComponents(
  labels: Int32Array,
  w: number,
  h: number,
): { faces: Int32Array; faceLabel: Int32Array; count: number } {
  let source = labels
  let comps = findComponents(source, w, h)
  if (comps.count > MAX_FACES) {
    source = labels.slice(0, w * h)
    capComponents(source, w, h, MAX_FACES)
    comps = findComponents(source, w, h)
  }
  const faceLabel = new Int32Array(comps.count)
  for (let k = 0; k < comps.runStart.length; k++)
    faceLabel[comps.runComp[k]] = source[comps.runStart[k]]
  return { faces: comps.comp, faceLabel, count: comps.count }
}

/**
 * Merge the smallest 4-connected components of `labels` into their neighbors until at
 * most `max(cap, 1)` remain; returns how many components were relabeled. In rounds:
 *
 * 1. find the components; stop when there are at most `cap`;
 * 2. take the `count − cap` smallest, ordered by size and then raster order of their first
 *    pixel;
 * 3. in that order, relabel each with its commonest neighboring label (most shared pixel
 *    edges, ties to the lower label), unless a neighbor was already relabeled this round
 *    or it was itself chosen as another's target; every component next to it carrying the
 *    chosen label becomes a target and keeps its label for the rest of the round.
 *
 * A relabeled component joins a target that keeps its label to the end of the round, and
 * no two relabeled components touch, so each relabeling removes one component, and the
 * first of every round always can be relabeled, so the rounds end.
 *
 * Method from: region merging on a region adjacency graph, smallest first, as in K. Haris,
 * S. N. Efstratiadis, N. Maglaveras, A. K. Katsaggelos, "Hybrid image segmentation using
 * watersheds and fast region merging", IEEE TIP 7(12):1684–1699, 1998. Adapted: the merge
 * order is size alone, "most similar" is the longest shared border, and the stop is a
 * component count.
 */
export function capComponents(labels: Int32Array, w: number, h: number, cap: number): number {
  const limit = Math.max(cap, 1)
  let relabeled = 0
  for (;;) {
    const comps = findComponents(labels, w, h)
    const n = comps.count
    if (n <= limit) return relabeled
    const size = comps.size
    const order = new Int32Array(n)
    for (let c = 0; c < n; c++) order[c] = c
    order.sort((a, b) => size[a] - size[b] || a - b)
    const excess = n - limit
    const chosen = new Uint8Array(n)
    for (let k = 0; k < excess; k++) chosen[order[k]] = 1
    const small = componentMembers(comps, (c) => chosen[c] === 1)
    const comp = comps.comp
    const tally = new ContactTally(labelBound(labels, 0))
    // Per component, this round: 0 untouched, 1 relabeled, 2 kept as a target.
    const state = new Uint8Array(n)
    let progress = 0
    for (let k = 0; k < excess; k++) {
      const c = order[k]
      if (state[c] !== 0) continue
      const from = small.offset[c]
      const to = small.offset[c + 1]
      tally.clear()
      let blocked = false
      for (let m = from; m < to && !blocked; m++) {
        const p = small.pixels[m]
        const y = (p / w) | 0
        const x = p - y * w
        for (let d = 0; d < 4; d++) {
          const q = neighbor4(p, x, y, w, h, d)
          if (q < 0) continue
          const e = comp[q]
          if (e === c) continue
          if (state[e] === 1) {
            blocked = true
            break
          }
          tally.add(labels[q])
        }
      }
      const best = tally.commonest()
      if (blocked || best < 0) continue
      for (let m = from; m < to; m++) labels[small.pixels[m]] = best
      state[c] = 1
      for (let m = from; m < to; m++) {
        const p = small.pixels[m]
        const y = (p / w) | 0
        const x = p - y * w
        for (let d = 0; d < 4; d++) {
          const q = neighbor4(p, x, y, w, h, d)
          if (q < 0) continue
          const e = comp[q]
          if (e !== c && labels[q] === best && state[e] === 0) state[e] = 2
        }
      }
      progress++
    }
    relabeled += progress
    // Unreachable by the argument above; a guard against looping forever.
    if (progress === 0) return relabeled
  }
}

/**
 * The `d`-th 4-neighbor of pixel `p = y·w + x` in the order left, right, up, down, or -1
 * when it is outside the image.
 */
function neighbor4(p: number, x: number, y: number, w: number, h: number, d: number): number {
  if (d === 0) return x > 0 ? p - 1 : -1
  if (d === 1) return x + 1 < w ? p + 1 : -1
  if (d === 2) return y > 0 ? p - w : -1
  return y + 1 < h ? p + w : -1
}
