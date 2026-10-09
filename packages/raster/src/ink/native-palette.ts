/**
 * The two-ground palette walk and the front end of the transparent-image path.
 *
 * The walk is the MDL walk of `mdl.ts` with every color a two-ground point (`native.ts`): the
 * same frequency-ranked candidates, perceptual same-ink floor, merge radius, description-length
 * escape and its interior rule, representation test for rare candidates and blend tests, asked
 * over white and over a mid-gray ground at once. The clear ground comes out as an ink of its own
 * (white over white, gray over gray, opacity 0) and a translucent wash as one ink with its own
 * opacity, with no alpha splitting after the fact. What differs from the opaque walk:
 *
 * - the clear ink (opacity at most `CLEAR_INK_ALPHA`) does not count against `maxColors`; once
 *   the cap is full the scan continues only to find it, and stops once it is found;
 * - nor does it use up the rarity exemption: the first ink that draws something is never rare,
 *   as the first ink is not ({@link rarityExempt});
 * - a translucent candidate that is not a blend must have an interior;
 * - the representation test measures in the six two-ground sRGB coordinates, with the clear
 *   ground always among the inks a pixel may be a mixture of;
 * - candidates are binned over both grounds (`cell(W) · 24³ + cell(K)`).
 *
 * Every per-pixel quantity is a function of the pixel's (color, alpha) bits and is computed
 * once per distinct pair (`distinct.ts`, after Celebi 2011's unique-color reduction, Swain and
 * Ballard 1991's backprojection, Korn and Muthukrishnan 2000's influence sets); the candidate
 * and refit means are summed in double precision over the pixels in raster order and kept in
 * single precision, as inkvec keeps every point, coordinate and distance.
 *
 * {@link nativeFrontEnd} runs the path's stages up to the gradient-band merge: palette, labels,
 * the measured noise on a soft intake, despeckle and the four-channel blend absorption.
 *
 * Method from: Y. Aksoy, T. O. Aydın, A. Smolić, M. Pollefeys, "Unmixing-Based Soft Color
 * Segmentation for Image Manipulation", ACM TOG 36(2), 2017, §5 (the representation vote).
 * See also: P. Heckbert, "Color Image Quantization for Frame Buffer Display", SIGGRAPH 1982
 * (the popularity rule whose rare-color weakness the rarity exemption answers). Not from the
 * literature: the clear ink's exemptions and the translucent-interior rule.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/native/palette.rs` (`NativeView`, `InkSix`,
 * `blend_pairs_cached`, `extract`, `rarity_exempt`, `Walk`, `BlendEvidence`, `straddle`,
 * `frequency_modes`, `mean_of`, `refine_to_members`, `label`), `inkvec-trace/src/native.rs`
 * (`extract_palette`, `extract_palette_ids`, `label_image`, the front half of `trace_color`),
 * and `inkvec-trace/src/color/represent.rs` (`unexplained` and `overshoot_residual` over six
 * coordinates with the clear ground).
 */
import { OVERSHOOT, MIX_INKS } from '../represent'
import { DistinctImage, newClaim } from './distinct'
import type { Claim, ColorIds, Neighborhoods } from './distinct'
import { represented } from './mdl'
import {
  inkRgbaW,
  rgbaW,
  absorbBlendSliversNative,
  reassignBlendPixelsNative,
} from './native-regions'
import {
  CLEAR_INK_ALPHA,
  INK2 as POINT,
  SECOND_GROUND,
  bin,
  colorIdsOfRgba,
  fromSix,
  ink2Alpha,
  ink2Dist,
  inkPoints,
  pointOf,
  sameInkAsAccepted,
  sameOpacity,
  six,
} from './native'
import {
  BLEND_CHORD_TOLERANCE,
  BLEND_INTERIOR_FRACTION,
  BLEND_STRADDLE_FRACTION,
  BLEND_TMIN,
  DEFAULT_MAX_COLORS,
  DEFAULT_MERGE_DISTANCE,
  JND_FLOOR,
  MEASURED_SIGMA_CAP,
  MEASURED_SIGMA_SCALE,
  MIN_INK_WEIGHT,
  NO_EVIDENCE,
  PARAMS_PER_INK,
  STRADDLE_STEP,
  escapeNeedsInterior,
  oklabToRgbF32,
  paletteEvidence,
} from './palette'
import type { BlendPair, Palette, PaletteEvidence } from './palette'
import { blendTolerance, despeckle, mixture } from './regions'
import type { Mixture } from './regions'
import { residualSigma } from './regularize'

const fr = Math.fround
/** Numbers per two-ground point. */
const INK2: number = POINT
const F_CLEAR_INK_ALPHA = fr(CLEAR_INK_ALPHA)
const F_MIN_INK_WEIGHT = fr(MIN_INK_WEIGHT)
const F_JND_FLOOR = fr(JND_FLOOR)
const F_CHORD = fr(BLEND_CHORD_TOLERANCE)
const F_TMIN = fr(BLEND_TMIN)
const F_STRADDLE_STEP = fr(STRADDLE_STEP)
const F_STEP_FLOOR = fr(0.02)
const F_DEGENERATE_AXIS = fr(1e-9)
const F_DEGENERATE = fr(1e-12)
const F_OVERSHOOT = fr(OVERSHOOT)
const F_ONE_PLUS_OVERSHOOT = fr(1 + F_OVERSHOOT)
/** The largest finite single-precision value: the starting distance of a nearest-ink search. */
const F32_MAX = 3.4028234663852886e38
/** The clear ground in the six sRGB coordinates: white over white, the second ground over it. */
const GROUND: readonly number[] = [1, 1, 1, SECOND_GROUND, SECOND_GROUND, SECOND_GROUND]

/**
 * Every distinct (color, alpha) point of an image as a two-ground point and as six blend
 * coordinates in both spaces, converted once.
 */
export class NativeView {
  /** The ids, their visited pixels and the geometry. */
  readonly img: DistinctImage
  /** Each point over both grounds, six per point. */
  readonly pts: Float64Array
  /** Each point's blend coordinates in encoded sRGB, six per point. */
  readonly sixSrgb: Float64Array
  /** The same in linear light. */
  readonly sixLin: Float64Array

  /** Convert the distinct points of `rgb` (over white, three per pixel) and `alpha`, numbered by `ids`. */
  constructor(
    rgb: Float32Array,
    alpha: Float32Array,
    ids: ColorIds,
    width: number,
    height: number,
  ) {
    const d = ids.count
    this.pts = new Float64Array(d * INK2)
    this.sixSrgb = new Float64Array(d * INK2)
    this.sixLin = new Float64Array(d * INK2)
    for (let k = 0; k < d; k++) {
      const p = ids.reps[k]
      const o = k * INK2
      pointOf(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], alpha[p], this.pts, o)
      six(this.pts, o, false, this.sixSrgb, o)
      six(this.pts, o, true, this.sixLin, o)
    }
    this.img = new DistinctImage(ids, width, height)
  }

  /** Number of distinct points. */
  get points(): number {
    return this.img.colors
  }
}

/** Each accepted ink's six blend coordinates in both spaces, converted once when accepted. */
export class InkSix {
  /** Encoded sRGB, six per ink. */
  readonly srgb: number[] = []
  /** Linear light, six per ink. */
  readonly lin: number[] = []
  private readonly scratch = new Float64Array(INK2)

  /** Number of inks. */
  get count(): number {
    return this.srgb.length / INK2
  }

  /** Convert and append the point `p[i..i+6]`. */
  push(p: ArrayLike<number>, i: number): void {
    const s = this.scratch
    six(p, i, false, s, 0)
    for (let k = 0; k < INK2; k++) this.srgb.push(s[k])
    six(p, i, true, s, 0)
    for (let k = 0; k < INK2; k++) this.lin.push(s[k])
  }

  /** The points `pts` (six per point), converted. */
  static of(pts: ArrayLike<number>): InkSix {
    const s = new InkSix()
    for (let i = 0; i + INK2 <= pts.length; i += INK2) s.push(pts, i)
    return s
  }
}

/**
 * Every pair of accepted inks the point `c[ci..]` is a blend of, over both grounds: for each
 * space (linear light first, then encoded sRGB) and pair `(A, B)` of `inks`' six coordinates,
 * with `p` the candidate's, `t = ((p − A)·(B − A)) / |B − A|²` kept for `tmin ≤ t ≤ 1 − tmin`,
 * and the residual `off = dist₂(c, fromSix(A + t (B − A)))` kept when `off ≤ tol`. Pairs whose
 * inks coincide (`|B − A|² < 1e-9`) are skipped; fewer than two inks give none. An anti-aliased
 * rim between paint and the clear ground is on such a chord: flat over white for a white ink,
 * a ramp to gray over gray.
 */
export function blendPairsCached(
  c: ArrayLike<number>,
  ci: number,
  inks: InkSix,
  tol: number,
  tmin: number,
): BlendPair[] {
  const out: BlendPair[] = []
  const k = inks.count
  if (k < 2) return out
  const p = new Float64Array(INK2)
  const q = new Float64Array(INK2)
  const back = new Float64Array(INK2)
  const tmax = fr(1 - tmin)
  for (let space = 0; space < 2; space++) {
    const linear = space === 0
    six(c, ci, linear, p, 0)
    const coords = linear ? inks.lin : inks.srgb
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const a = i * INK2
        const b = j * INK2
        let dd = 0
        let dot = 0
        for (let m = 0; m < INK2; m++) {
          const d = fr(coords[b + m] - coords[a + m])
          dd = fr(dd + fr(d * d))
          dot = fr(dot + fr(fr(p[m] - coords[a + m]) * d))
        }
        if (dd < F_DEGENERATE_AXIS) continue
        const t = fr(dot / dd)
        if (!(t >= tmin && t <= tmax)) continue
        for (let m = 0; m < INK2; m++) {
          q[m] = fr(coords[a + m] + fr(fr(coords[b + m] - coords[a + m]) * t))
        }
        fromSix(q, 0, linear, back, 0)
        const off = ink2Dist(c, ci, back, 0)
        if (off <= tol) out.push({ i, j, linear, off })
      }
    }
  }
  return out
}

/** Euclidean distance in six channels, single precision. */
function dist6(v: ArrayLike<number>, vo: number, q: ArrayLike<number>, qo: number): number {
  let s = 0
  for (let c = 0; c < INK2; c++) {
    const e = fr(v[vo + c] - q[qo + c])
    s = fr(s + fr(e * e))
  }
  return fr(Math.sqrt(s))
}

/**
 * The residual of `v[vo..]` as resampling overshoot of `k` six-coordinate colors `cols`, the
 * last of which is the clear ground: the distance to a chord between two of them extended by up
 * to `OVERSHOOT` past either end, or to one of the inks (not the ground) scaled by
 * `k ∈ [1, 1 + OVERSHOOT]`. Infinite with no colors. Single precision.
 */
function overshootResidual6(
  v: ArrayLike<number>,
  vo: number,
  cols: Float64Array,
  k: number,
  q: Float64Array,
): number {
  let best = Infinity
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      const a = i * INK2
      const b = j * INK2
      let uu = 0
      let wu = 0
      for (let c = 0; c < INK2; c++) {
        const u = fr(cols[b + c] - cols[a + c])
        uu = fr(uu + fr(u * u))
        wu = fr(wu + fr(fr(v[vo + c] - cols[a + c]) * u))
      }
      if (uu < F_DEGENERATE) continue
      const t = Math.min(F_ONE_PLUS_OVERSHOOT, Math.max(-F_OVERSHOOT, fr(wu / uu)))
      for (let c = 0; c < INK2; c++) {
        q[c] = fr(cols[a + c] + fr(fr(cols[b + c] - cols[a + c]) * t))
      }
      best = Math.min(best, dist6(v, vo, q, 0))
    }
  }
  // The ground is the last entry, and it is never scaled.
  for (let i = 0; i < k - 1; i++) {
    const s = i * INK2
    let ss = 0
    let vs = 0
    for (let c = 0; c < INK2; c++) {
      ss = fr(ss + fr(cols[s + c] * cols[s + c]))
      vs = fr(vs + fr(v[vo + c] * cols[s + c]))
    }
    if (ss < F_DEGENERATE) continue
    const kk = Math.min(F_ONE_PLUS_OVERSHOOT, Math.max(1, fr(vs / ss)))
    for (let c = 0; c < INK2; c++) q[c] = fr(cols[s + c] * kk)
    best = Math.min(best, dist6(v, vo, q, 0))
  }
  return best
}

/** The eight neighbors of a pixel, row by row, as `(dx, dy)` pairs. */
const RING8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1]

/**
 * The claimed pixels no mixture of the inks around them explains, in pixels (voting visited
 * pixels times the stride), measured in the six two-ground sRGB coordinates. For each claimed
 * pixel the inks around it are the accepted inks nearest to its in-image neighbors the
 * candidate does not claim, the `MIX_INKS` most frequent (ties to the lower ink), plus the
 * clear ground, always. Its residual is the distance to the nearest convex mixture of two or
 * three of them (to the ground alone when nothing else is around); it votes when that residual
 * and its residual as resampling overshoot both exceed `tol`.
 */
function unexplainedNative(
  view: NativeView,
  claim: Claim,
  pixels: Int32Array,
  nearestInk: Int32Array,
  inks: readonly number[],
  inkCount: number,
  tol: number,
): number {
  const img = view.img
  const w = img.width
  const h = img.height
  const cid = img.cid
  const aroundInk = new Int32Array(8)
  const aroundN = new Int32Array(8)
  const cols = new Float64Array((MIX_INKS + 1) * INK2)
  const q = new Float64Array(INK2)
  const mix: Mixture = { r: 0, who: -1 }
  const value = view.sixSrgb
  let votes = 0
  for (let n = 0; n < pixels.length; n++) {
    const i = pixels[n]
    const y = (i / w) | 0
    const x = i - y * w
    let k = 0
    for (let e = 0; e < 16; e += 2) {
      const nx = x + RING8[e]
      const ny = y + RING8[e + 1]
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const d = cid[ny * w + nx]
      if (claim.claimed[d]) continue
      const ink = nearestInk[d]
      if (ink < 0 || ink >= inkCount) continue
      let s = 0
      while (s < k && aroundInk[s] !== ink) s++
      if (s < k) aroundN[s]++
      else {
        aroundInk[k] = ink
        aroundN[k] = 1
        k++
      }
    }
    // Most frequent first, ties to the lower ink index.
    for (let a = 1; a < k; a++) {
      const ink = aroundInk[a]
      const c = aroundN[a]
      let b = a - 1
      while (b >= 0 && (aroundN[b] < c || (aroundN[b] === c && aroundInk[b] > ink))) {
        aroundInk[b + 1] = aroundInk[b]
        aroundN[b + 1] = aroundN[b]
        b--
      }
      aroundInk[b + 1] = ink
      aroundN[b + 1] = c
    }
    const m = Math.min(k, MIX_INKS)
    for (let s = 0; s < m; s++) {
      for (let c = 0; c < INK2; c++) cols[s * INK2 + c] = inks[aroundInk[s] * INK2 + c]
    }
    for (let c = 0; c < INK2; c++) cols[m * INK2 + c] = GROUND[c]
    const total = m + 1
    const vo = cid[i] * INK2
    let r: number
    if (total === 1) r = dist6(value, vo, cols, 0)
    else r = mixture(value, vo, cols, total, INK2, mix) ? mix.r : Infinity
    if (r > tol && overshootResidual6(value, vo, cols, total, q) > tol) votes++
  }
  return votes * img.stride
}

/** Position of six coordinates `p[o..]` along the axis from `a[ao..]` by `d` (`|d|² = dd`), single precision. */
function axisT(
  p: ArrayLike<number>,
  o: number,
  a: ArrayLike<number>,
  ao: number,
  d: Float64Array,
  dd: number,
): number {
  let s = 0
  for (let k = 0; k < INK2; k++) s = fr(s + fr(fr(p[o + k] - a[ao + k]) * d[k]))
  return fr(s / dd)
}

/**
 * Whether the candidate `c[ci..]` straddles accepted inks `i` and `j` along their six-coordinate
 * axis: at least {@link BLEND_STRADDLE_FRACTION} of the claimed pixels (`hoods`) have, in their
 * 3×3 neighborhood, a color further towards each ink than the candidate is, by
 * `max(min(STRADDLE_STEP, t_c / 2), 0.02)` on the low side and likewise on the high side. A
 * missing grid or a degenerate axis (`|B − A|² < 1e-9`) never straddles; an empty claim always
 * does. The count stops as soon as it decides the comparison.
 */
function straddles(
  view: NativeView,
  hoods: Neighborhoods,
  c: ArrayLike<number>,
  ci: number,
  i: number,
  j: number,
  inks: InkSix,
  linear: boolean,
  scratch: Uint8Array,
): boolean {
  if (!hoods.geometry) return false
  const coords = linear ? inks.lin : inks.srgb
  const pa = i * INK2
  const pb = j * INK2
  const d = new Float64Array(INK2)
  let dd = 0
  for (let k = 0; k < INK2; k++) {
    d[k] = fr(coords[pb + k] - coords[pa + k])
    dd = fr(dd + fr(d[k] * d[k]))
  }
  if (dd < F_DEGENERATE_AXIS) return false
  const pc = new Float64Array(INK2)
  six(c, ci, linear, pc, 0)
  const tc = axisT(pc, 0, coords, pa, d, dd)
  const stepLo = Math.max(Math.min(F_STRADDLE_STEP, fr(0.5 * tc)), F_STEP_FLOOR)
  const stepHi = Math.max(Math.min(F_STRADDLE_STEP, fr(0.5 * fr(1 - tc))), F_STEP_FLOOR)
  const lo = fr(tc - stepLo)
  const hi = fr(tc + stepHi)
  // Each color's side of the axis (`sideOf`): bit 0 below `lo`, bit 1 above `hi`.
  const px = linear ? view.sixLin : view.sixSrgb
  const colors = hoods.colors
  for (let m = 0; m < colors.length; m++) {
    const t = axisT(px, colors[m] * INK2, coords, pa, d, dd)
    scratch[colors[m]] = (t < lo ? 1 : 0) | (t > hi ? 2 : 0)
  }
  scratch[hoods.outside] = 0
  const ids = hoods.ids
  const total = ids.length / 9
  const need = BLEND_STRADDLE_FRACTION * total
  let straddling = 0
  for (let q = 0; q < ids.length; q += 9) {
    let acc = 0
    for (let k = 0; k < 9; k++) acc |= scratch[ids[q + k]]
    if (acc === 3) straddling++
    if (straddling >= need) return true
    if (straddling + (ids.length - q - 9) / 9 < need) return false
  }
  return straddling >= need
}

/** The palette candidates over both grounds, sorted by pixel count descending then cell key ascending. */
export interface NativeModes {
  /** Number of occupied cells. */
  count: number
  /** Pixel count of each mode. */
  n: Int32Array
  /** Cell key of each mode: `cell(W) · 24³ + cell(K)`. */
  key: Float64Array
  /** Mean two-ground point of each mode's pixels, six per mode. */
  pts: Float64Array
}

/**
 * The palette candidates: occupied cells of the two-ground grid (`cell(W) · 24³ + cell(K)`, the
 * cell found per distinct point), each with its pixel count and its pixels' mean over both
 * grounds (summed in double precision in raster order, stored in single), sorted by count
 * descending, then key ascending.
 */
export function nativeFrequencyModes(view: NativeView): NativeModes {
  const d = view.points
  const pts = view.pts
  const slotOf = new Map<number, number>()
  const keys: number[] = []
  const slot = new Int32Array(d)
  for (let k = 0; k < d; k++) {
    const o = k * INK2
    const key =
      bin(pts[o], pts[o + 1], pts[o + 2]) * 24 ** 3 + bin(pts[o + 3], pts[o + 4], pts[o + 5])
    let s = slotOf.get(key)
    if (s === undefined) {
      s = keys.length
      keys.push(key)
      slotOf.set(key, s)
    }
    slot[k] = s
  }
  const cnt = new Int32Array(keys.length)
  const sum = new Float64Array(keys.length * INK2)
  const cid = view.img.cid
  for (let i = 0; i < cid.length; i++) {
    const id = cid[i]
    const s = slot[id]
    cnt[s]++
    for (let c = 0; c < INK2; c++) sum[s * INK2 + c] += pts[id * INK2 + c]
  }
  const order = Array.from({ length: keys.length }, (_, s) => s).toSorted(
    (x, y) => cnt[y] - cnt[x] || keys[x] - keys[y],
  )
  const count = order.length
  const n = new Int32Array(count)
  const key = new Float64Array(count)
  const mean = new Float64Array(count * INK2)
  for (let m = 0; m < count; m++) {
    const s = order[m]
    n[m] = cnt[s]
    key[m] = keys[s]
    for (let c = 0; c < INK2; c++) mean[m * INK2 + c] = fr(sum[s * INK2 + c] / cnt[s])
  }
  return { count, n, key, pts: mean }
}

/**
 * Whether candidate `c[ci..]` skips the rarity gate: nothing is accepted yet, or it draws
 * something (opacity above `CLEAR_INK_ALPHA`) and every accepted ink is clear. On a
 * transparent canvas the walk's first ink is nearly always the clear ground, which draws
 * nothing; the exemption goes to the first ink that does, so a lone small shape on a clear
 * canvas is an ink without having to be represented. Every other gate still applies.
 */
export function rarityExempt(acceptedClear: readonly boolean[], candidateClear: boolean): boolean {
  if (acceptedClear.length === 0) return true
  if (candidateClear) return false
  for (const clear of acceptedClear) if (!clear) return false
  return true
}

/** Whether a candidate is anti-aliasing rather than an ink, from the walk's measurements. */
interface BlendEvidence {
  /** A blend of two accepted inks over both grounds. */
  blend: boolean
  /** Inside the merge radius of an accepted ink, kept so far only by the MDL escape. */
  escaped: boolean
  /** Share of the claimed pixels that are interior; 1 (not measured) unless blend, translucent or escaped. */
  interior: number
  /** A thin blend that straddles one of its pairs ({@link straddles}); false unless a thin blend. */
  straddles: boolean
}

/** The two-ground walk's state between candidates. */
class Walk {
  /** Accepted inks, six per ink, in acceptance order. */
  readonly inks: number[] = []
  /** Whether each accepted ink is the clear ground. */
  readonly clear: boolean[] = []
  /** The same inks' six coordinates. */
  readonly six = new InkSix()
  /** Per point, the distance to the nearest accepted ink. */
  readonly nearest: Float64Array
  /** Per point, the index of that ink (−1 before any is accepted). */
  readonly nearestInk: Int32Array
  /** The current candidate's claimed points. */
  readonly claim: Claim
  /** One byte per point (plus the outside) for the straddle test. */
  readonly scratch: Uint8Array
  readonly totalPx: number
  readonly merge: number

  constructor(
    readonly view: NativeView,
    readonly ev: PaletteEvidence,
    mergeDistance: number,
  ) {
    const points = view.points
    this.nearest = new Float64Array(points).fill(Infinity)
    this.nearestInk = new Int32Array(points).fill(-1)
    this.claim = newClaim(points)
    this.scratch = new Uint8Array(points + 1)
    this.totalPx = Math.max(view.img.n, 1)
    this.merge = fr(mergeDistance)
  }

  get count(): number {
    return this.clear.length
  }

  /** Visible (not clear) inks accepted so far. */
  visibleCount(): number {
    let v = 0
    for (const c of this.clear) if (!c) v++
    return v
  }

  /**
   * Mark the points the candidate claims, those strictly nearer to it than to the nearest
   * accepted ink, and return the claim in pixels (claimed visited pixels times the stride).
   */
  claimOf(c: ArrayLike<number>, ci: number): number {
    const img = this.view.img
    const pts = this.view.pts
    const claim = this.claim
    let visited = 0
    for (let d = 0; d < img.colors; d++) {
      const dd = ink2Dist(pts, d * INK2, c, ci)
      claim.dist[d] = dd
      const inside = dd < this.nearest[d]
      claim.claimed[d] = inside ? 1 : 0
      if (inside) visited += img.count[d]
    }
    return visited * img.stride
  }

  /** Whether candidate `c[ci..]` (whose clearness is `cClear`) passes every gate. */
  accepts(c: ArrayLike<number>, ci: number, cClear: boolean): boolean {
    const { sigmaNoise, lambda, noiseSigmas, sameInkDe00 } = this.ev
    const view = this.view
    const claim = this.claimOf(c, ci)
    // Read only through `noiseSigmas · spread`, which is zero with the guard off.
    const spread = noiseSigmas === 0 ? 0 : view.img.spread(this.claim, this.merge)
    // Rare, and not the first (visible) ink: it has to be represented, after the cheaper gates.
    const rare =
      fr(fr(claim) / fr(this.totalPx)) < F_MIN_INK_WEIGHT && !rarityExempt(this.clear, cClear)
    let nearest = Infinity
    for (let k = 0; k < this.count; k++) {
      const d = ink2Dist(this.inks, k * INK2, c, ci)
      if (d < nearest) nearest = d
    }
    const reach = fr(fr(noiseSigmas) * spread)
    if (sameInkAsAccepted(c, ci, this.inks, this.count, sameInkDe00)) return false
    // Inside the merge radius: kept only if the escape pays, and then only with an interior.
    const escaped = nearest <= Math.max(this.merge, reach)
    if (escaped) {
      const q = nearest / sigmaNoise
      const worthIt =
        sigmaNoise > 0 &&
        nearest > F_JND_FLOOR &&
        nearest > reach &&
        0.5 * claim * (q * q) > lambda * PARAMS_PER_INK
      if (!worthIt) return false
    }
    let pixels: Int32Array | null = null
    const claimed = (): Int32Array => (pixels ??= view.img.claimedPixels(this.claim))
    if (rare) {
      const votes = unexplainedNative(
        view,
        this.claim,
        claimed(),
        this.nearestInk,
        this.six.srgb,
        this.count,
        blendTolerance(sigmaNoise),
      )
      if (!represented(votes, this.totalPx)) return false
    }
    const shape = this.measure(c, ci, escaped, claimed)
    if (shape === null) return false
    const coverage = shape.blend && shape.interior < BLEND_INTERIOR_FRACTION && shape.straddles
    return !escapeNeedsInterior(shape.escaped, shape.blend, shape.interior) && !coverage
  }

  /**
   * Measure candidate `c[ci..]`, or null when it is rejected outright as a translucent band with
   * no interior. Partly transparent is what an anti-aliased silhouette pixel is, and the chord
   * test cannot always say so (a rim where shading meets the ground mixes the clear ink with a
   * shade the palette rejected as a blend itself): an ink covers area, anti-aliasing is a band,
   * so a translucent candidate that is not a blend is kept only with an interior. Blends keep
   * the straddle test instead; an escaped candidate is measured for its interior.
   */
  measure(
    c: ArrayLike<number>,
    ci: number,
    escaped: boolean,
    claimed: () => Int32Array,
  ): BlendEvidence | null {
    const pairs = blendPairsCached(c, ci, this.six, fr(this.merge * F_CHORD), F_TMIN)
    const blend = pairs.length > 0
    const a = ink2Alpha(c, ci)
    const translucent = a > 0 && a < 1
    const img = this.view.img
    const interior = blend || translucent || escaped ? img.interior(this.claim, claimed()) : 1
    if (translucent && !blend && interior < BLEND_INTERIOR_FRACTION) return null
    let straddle = false
    if (blend && interior < BLEND_INTERIOR_FRACTION) {
      const hoods = img.neighborhoods(claimed())
      for (const pair of pairs) {
        const { i, j, linear } = pair
        straddle = straddles(this.view, hoods, c, ci, i, j, this.six, linear, this.scratch)
        if (straddle) break
      }
    }
    return { blend, escaped, interior, straddles: straddle }
  }

  /**
   * Accept `c[ci..]`: lower every point's nearest-ink distance where the new ink is strictly
   * nearer (a tie keeps the earlier ink), note which ink is nearest, and record the ink.
   */
  accept(c: ArrayLike<number>, ci: number, cClear: boolean): void {
    const pts = this.view.pts
    const k = this.count
    for (let d = 0; d < this.nearest.length; d++) {
      const dd = ink2Dist(pts, d * INK2, c, ci)
      if (dd < this.nearest[d]) {
        this.nearest[d] = dd
        this.nearestInk[d] = k
      }
    }
    this.six.push(c, ci)
    for (let m = 0; m < INK2; m++) this.inks.push(c[ci + m])
    this.clear.push(cClear)
  }
}

/**
 * Move each ink (`inks`, six per ink, edited in place) to the mean over both grounds of the
 * pixels that chose it (nearest by `ink2Dist`, ties to the lower index, within
 * `mergeDistance`), and return each ink's share of the image (single precision). The choice is
 * made per point; the sums walk the pixels in raster order. An ink nobody chose keeps its
 * point and weighs 0.
 */
export function nativeRefineToMembers(
  view: NativeView,
  inks: Float64Array,
  count: number,
  mergeDistance: number,
): Float64Array {
  const d = view.points
  const pts = view.pts
  const merge = fr(mergeDistance)
  const chosen = new Int32Array(d)
  for (let k = 0; k < d; k++) {
    let best = 0
    let bestD = F32_MAX
    for (let i = 0; i < count; i++) {
      const dist = ink2Dist(pts, k * INK2, inks, i * INK2)
      if (dist < bestD) {
        best = i
        bestD = dist
      }
    }
    chosen[k] = bestD <= merge ? best : -1
  }
  const sum = new Float64Array(count * INK2)
  const members = new Float64Array(count)
  const cid = view.img.cid
  for (let i = 0; i < cid.length; i++) {
    const id = cid[i]
    const k = chosen[id]
    if (k < 0) continue
    for (let c = 0; c < INK2; c++) sum[k * INK2 + c] += pts[id * INK2 + c]
    members[k]++
  }
  const totalPx = fr(Math.max(view.img.n, 1))
  const weight = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    if (members[k] > 0) {
      for (let c = 0; c < INK2; c++) inks[k * INK2 + c] = fr(sum[k * INK2 + c] / members[k])
    }
    weight[k] = fr(fr(members[k]) / totalPx)
  }
  return weight
}

/**
 * Recover the palette of a transparent image by the two-ground walk (see the module header).
 * `rgb` is the image composited over white (encoded sRGB in `[0, 1]`, three per pixel), `alpha`
 * its straight alpha, both row-major `width × height`; `ids` its (color, alpha) ids when the
 * caller shares them with {@link labelImageNative}. `mergeDistance` and every distance are
 * two-ground OKLab distances; `ev.sigmaNoise` is per-channel encoded sRGB noise.
 *
 * The palette's `inkLab`/`inkRgb` hold each ink over white, `alpha` its opacity (the clear
 * ground at 0, a wash at its own), `weight` its share of the image. At least one ink is always
 * returned: the most frequent mode when nothing is accepted, white for an empty image.
 */
export function extractPaletteNative(
  rgb: Float32Array,
  alpha: Float32Array,
  width: number,
  height: number,
  mergeDistance: number = DEFAULT_MERGE_DISTANCE,
  maxColors: number = DEFAULT_MAX_COLORS,
  ev: PaletteEvidence = NO_EVIDENCE,
  ids: ColorIds = colorIdsOfRgba(rgb, alpha),
): Palette {
  const view = new NativeView(rgb, alpha, ids, width, height)
  const modes = nativeFrequencyModes(view)
  const walk = new Walk(view, ev, mergeDistance)
  let clearFound = false
  for (let m = 0; m < modes.count; m++) {
    const ci = m * INK2
    const cClear = ink2Alpha(modes.pts, ci) <= F_CLEAR_INK_ALPHA
    // The clear ground draws nothing, so it is found but not counted against the cap; once the
    // cap is full the scan goes on only to look for it.
    const full = walk.visibleCount() >= maxColors
    if (full && clearFound) break
    if (full && !cClear) continue
    if (walk.accepts(modes.pts, ci, cClear)) {
      walk.accept(modes.pts, ci, cClear)
      if (cClear) clearFound = true
    }
  }
  let inks = walk.inks
  if (inks.length === 0) {
    inks = modes.count > 0 ? Array.from(modes.pts.subarray(0, INK2)) : [1, 0, 0, 1, 0, 0]
  }
  const count = inks.length / INK2
  const pts = Float64Array.from(inks)
  const weight = nativeRefineToMembers(view, pts, count, mergeDistance)
  const inkLab = new Float64Array(count * 3)
  const inkRgb = new Float64Array(count * 3)
  const inkAlpha = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    const o = k * INK2
    inkLab[k * 3] = pts[o]
    inkLab[k * 3 + 1] = pts[o + 1]
    inkLab[k * 3 + 2] = pts[o + 2]
    const r = oklabToRgbF32(pts[o], pts[o + 1], pts[o + 2])
    inkRgb[k * 3] = r[0]
    inkRgb[k * 3 + 1] = r[1]
    inkRgb[k * 3 + 2] = r[2]
    inkAlpha[k] = ink2Alpha(pts, o)
  }
  return { count, inkLab, inkRgb, weight, alpha: inkAlpha }
}

/**
 * Every pixel to its nearest palette entry over both grounds (`ink2Dist`, ties to the lower
 * index; 0 for an empty palette), found once per distinct (color, alpha) point and read back
 * through each pixel's id.
 */
export function labelImageNative(
  rgb: Float32Array,
  alpha: Float32Array,
  palette: Palette,
  ids: ColorIds = colorIdsOfRgba(rgb, alpha),
): Int32Array {
  const inks = inkPoints(palette)
  const c = new Float64Array(INK2)
  const perPoint = new Int32Array(ids.count)
  for (let k = 0; k < ids.count; k++) {
    const p = ids.reps[k]
    pointOf(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], alpha[p], c, 0)
    let best = 0
    let bestD = F32_MAX
    for (let i = 0; i < palette.count; i++) {
      const d = ink2Dist(c, 0, inks, i * INK2)
      if (d < bestD) {
        best = i
        bestD = d
      }
    }
    perPoint[k] = best
  }
  const labels = new Int32Array(ids.cid.length)
  for (let i = 0; i < labels.length; i++) labels[i] = perPoint[ids.cid[i]]
  return labels
}

/** What the transparent-image front end needs from the intake measurements. */
export interface NativeIntake {
  /** Per-channel pixel noise in encoded sRGB, `estimateNoise` of the single-precision luma. */
  sigmaNoise: number
  /** Soft intake (a wide edge, a lossy container or ringing; `isSoftIntake`). */
  soft: boolean
}

/** Settings of {@link nativeFrontEnd}. */
export interface NativeFrontEndOptions {
  /** OKLab merge radius of the palette ({@link DEFAULT_MERGE_DISTANCE}). */
  mergeDistance?: number
  /** Most visible inks ({@link DEFAULT_MAX_COLORS}); the clear ground is not counted. */
  maxColors?: number
  /** The speckle floor: components smaller than this fold into a neighbor (default 2). */
  minRegion?: number
  /** Run the four-channel blend absorption (default true). */
  absorbBlends?: boolean
}

/** What {@link nativeFrontEnd} hands the band merge and the stages after it. */
export interface NativeFrontEnd {
  /** The two-ground palette: each ink over white with its opacity. */
  palette: Palette
  /** One palette index per pixel, despeckled and blend-absorbed. */
  labels: Int32Array
  /** The noise every later stage reads: the intake's, raised on a soft intake by the residual against the labels. */
  sigmaNoise: number
  /** Nats per parameter, `bicLambda(width · height)`. */
  lambda: number
  /** The band merge's opacity gate ({@link sameOpacity}), passed as its `sameClass`. */
  sameClass: (a: number, b: number) => boolean
  /** Thin components the four-channel absorption dissolved. */
  absorbed: number
  /** Pixels the four-channel reassignment moved. */
  moved: number
}

/**
 * The transparent-image path up to the gradient-band merge: the two-ground palette, the labels,
 * on a soft intake the noise raised by the residual against the labels (capped at
 * `MEASURED_SIGMA_CAP` levels), despeckle, and the four-channel blend absorption (sliver
 * absorption, then per-pixel reassignment, then despeckle again if either moved anything).
 *
 * `rgb` is the image composited over white, `alpha` its straight alpha (one per pixel), `intake`
 * the noise estimate and soft-intake verdict. The engine then runs the band merge over white
 * with `sameClass`, the carve followed by `nameCarvedPaint`, `mergeFades`, and the face split.
 */
export function nativeFrontEnd(
  rgb: Float32Array,
  alpha: Float32Array,
  width: number,
  height: number,
  intake: NativeIntake,
  options: NativeFrontEndOptions = {},
): NativeFrontEnd {
  const mergeDistance = options.mergeDistance ?? DEFAULT_MERGE_DISTANCE
  const maxColors = options.maxColors ?? DEFAULT_MAX_COLORS
  const minRegion = options.minRegion ?? 2
  const n = width * height
  const ev = paletteEvidence(intake.sigmaNoise, n, intake.soft)
  const ids = colorIdsOfRgba(rgb, alpha)
  const palette = extractPaletteNative(rgb, alpha, width, height, mergeDistance, maxColors, ev, ids)
  const labels = labelImageNative(rgb, alpha, palette, ids)
  let sigmaNoise = intake.sigmaNoise
  if (intake.soft) {
    const cap = MEASURED_SIGMA_CAP / 255
    const measured = Math.min(
      residualSigma(rgb, labels, width, height, palette.inkRgb) * MEASURED_SIGMA_SCALE,
      cap,
    )
    sigmaNoise = Math.max(sigmaNoise, measured)
  }
  despeckle(labels, width, height, minRegion)
  let absorbed = 0
  let moved = 0
  if (options.absorbBlends ?? true) {
    const px = rgbaW(rgb, alpha, n)
    const inks = inkRgbaW(palette.inkRgb, palette.alpha)
    absorbed = absorbBlendSliversNative(labels, px, width, height, inks, sigmaNoise)
    moved = reassignBlendPixelsNative(labels, px, width, height, inks, sigmaNoise)
    if (absorbed > 0 || moved > 0) despeckle(labels, width, height, minRegion)
  }
  return {
    palette,
    labels,
    sigmaNoise,
    lambda: ev.lambda,
    sameClass: sameOpacity(palette),
    absorbed,
    moved,
  }
}
