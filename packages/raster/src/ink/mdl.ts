/**
 * The MDL palette walk: candidates are the frequency modes of the image in OKLab, taken in
 * descending pixel count, and each survives as an ink only when keeping it apart pays for
 * itself, then every ink is refit to the mean of the pixels that chose it. Labeling assigns
 * every pixel its nearest ink.
 *
 * Per candidate, in this order (stopping once `maxColors` inks are accepted):
 * 1. **claim**: the pixels strictly nearer to the candidate than to every accepted ink; under
 *    {@link MIN_INK_WEIGHT} of the image the candidate is *rare* (never the first ink);
 * 2. **perceptual floor**: CIEDE2000 to the OKLab-nearest accepted ink under `sameInkDe00`
 *    folds it in;
 * 3. **separation**: within `max(mergeDistance, reach)` of an accepted ink
 *    (`reach = noiseSigmas · spread`) it is folded in unless the MDL escape pays,
 *    `0.5 · claim · (d / σ)² > λ · PARAMS_PER_INK`, with `d` above {@link JND_FLOOR} and `reach`
 *    (the same `cost = ½χ² + λ·params` the curve fits and gradient choice price against);
 * 4. **representation** (rare only): at least `max(8, n · 8/16384)` of its claimed pixels are
 *    colors no convex mixture of the inks around them, and no resampling overshoot of them,
 *    explains within `max(3σ, 0.025)` (encoded sRGB);
 * 5. **not coverage**: a blend of two accepted inks (in linear light or encoded sRGB) that is
 *    thin (interior under {@link BLEND_INTERIOR_FRACTION}) and straddles them (at least
 *    {@link BLEND_STRADDLE_FRACTION}) is anti-aliasing;
 * 6. **escape interior**: a non-blend admitted only by the escape must have an interior.
 *
 * Every per-pixel quantity is a function of the pixel's color and is computed once per
 * distinct color (`distinct.ts`); the candidate means and the refit means are summed over the
 * pixels in raster order. Pixel colors are converted to OKLab in single precision and the means
 * stored in single precision, as inkvec keeps them: the candidate grid and every tie between two
 * inks then fall where inkvec's do.
 *
 * Method from: Y. Aksoy, T. O. Aydın, A. Smolić, M. Pollefeys, "Unmixing-Based Soft Color
 * Segmentation for Image Manipulation", ACM TOG 36(2), 2017, §5 (the representation vote: only
 * pixels the current model does not explain vote for a new color). Inspired by: L. Yang,
 * P. V. Sander, J. Lawrence, H. Hoppe, "Antialiasing Recovery", ACM TOG 30(3), 2011 (an edge
 * pixel as a mixture of its neighborhood's extremes); J. Yang et al., "Subpixel Deblurring of
 * Anti-Aliased Raster Clip-Art", CGF 42(2), 2023 (the escape interior). See also: A. Delong,
 * A. Osokin, H. N. Isack, Y. Boykov, "Fast Approximate Energy Minimization with Label Costs",
 * IJCV 96(1), 2012 (the joint palette-and-labels objective this greedy walk approximates).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/color/mdl.rs` (`ClassicView`, `extract`, `Walk`,
 * `BlendEvidence`, `straddle`, `frequency_modes`, `member_of`, `refine_to_members`, `label`),
 * `inkvec-trace/src/color/represent.rs` (`mixture_tolerance`, `represented`, `unexplained`) and
 * `inkvec-trace/src/color.rs` (`extract_palette`, `extract_palette_mdl`, `label_image`).
 */
import {
  MIX_INKS,
  MIN_VOTES,
  MIXTURE_TOLERANCE,
  VOTE_SHARE,
  mixtureResidual,
  overshootResidual,
} from '../represent'
import { DistinctImage, colorIdsOfRgb, newClaim, sideOf } from './distinct'
import type { Claim, ColorIds, Neighborhoods } from './distinct'
import {
  BLEND_CHORD_TOLERANCE,
  BLEND_INTERIOR_FRACTION,
  BLEND_STRADDLE_FRACTION,
  BLEND_TMIN,
  DEFAULT_MAX_COLORS,
  DEFAULT_MERGE_DISTANCE,
  InkAxes,
  JND_FLOOR,
  MIN_INK_WEIGHT,
  NO_EVIDENCE,
  PARAMS_PER_INK,
  STRADDLE_STEP,
  blendPairs,
  dist3,
  escapeNeedsInterior,
  nearestInk,
  oklabToRgbF32,
  rgbToOklabF32,
  sameInkAsAccepted,
  srgbToLinearF32,
} from './palette'
import type { BlendPair, Palette, PaletteEvidence } from './palette'

/** Bins per OKLab axis of the candidate grid. */
export const BINS = 24

/**
 * Every distinct color of an image in the three spaces the palette's tests read, converted
 * once: OKLab from the pixel, encoded sRGB from the OKLab value, linear light from that sRGB.
 */
export class ColorView {
  /** The ids, their visited pixels and the geometry. */
  readonly img: DistinctImage
  /** Each color in OKLab, three per color. */
  readonly lab: Float64Array
  /** Each color back in encoded sRGB, from `lab`. */
  readonly srgb: Float64Array
  /** Each color in linear light, from `srgb`. */
  readonly lin: Float64Array

  /**
   * Convert the distinct colors of `rgb` (encoded sRGB, three per pixel, numbered by `ids`), in
   * single precision as inkvec converts them ({@link rgbToOklabF32}, {@link oklabToRgbF32}).
   */
  constructor(rgb: Float32Array, ids: ColorIds, width: number, height: number) {
    const d = ids.count
    this.lab = new Float64Array(d * 3)
    this.srgb = new Float64Array(d * 3)
    this.lin = new Float64Array(d * 3)
    for (let k = 0; k < d; k++) {
      const p = ids.reps[k] * 3
      const lab = rgbToOklabF32(rgb[p], rgb[p + 1], rgb[p + 2])
      const s = oklabToRgbF32(lab[0], lab[1], lab[2])
      for (let c = 0; c < 3; c++) {
        this.lab[k * 3 + c] = lab[c]
        this.srgb[k * 3 + c] = s[c]
        this.lin[k * 3 + c] = srgbToLinearF32(s[c])
      }
    }
    this.img = new DistinctImage(ids, width, height)
  }
}

/** The palette candidates, sorted by pixel count descending then cell key ascending. */
export interface FrequencyModes {
  /** Number of occupied cells. */
  count: number
  /** Pixel count of each mode. */
  n: Int32Array
  /** Cell key of each mode: `li · 24² + ai · 24 + bi`. */
  key: Int32Array
  /** Mean OKLab color of each mode's pixels, three per mode. */
  lab: Float64Array
}

const fr = Math.fround
const F_0_4 = fr(0.4)
const F_0_8 = fr(0.8)

/**
 * The grid cell of one OKLab coordinate: `round(clamp(x, 0, 1) · 23)` for `L` (`offset` 0) and
 * `round(clamp((x + 0.4) / 0.8, 0, 1) · 23)` for `a` and `b`, in single precision as the
 * coordinates are: a neutral color's `a` is rounding noise at a cell boundary, and in single
 * precision a noise smaller than half a unit of 0.4 rounds away when added to it.
 */
function binOf(x: number, offset: number): number {
  const u = offset === 0 ? x : fr(fr(x + offset) / F_0_8)
  return Math.min(Math.round(fr(clamp01(u) * (BINS - 1))), BINS - 1)
}

/**
 * The palette candidates: occupied cells of a 24³ grid over OKLab (`L` over `[0, 1]`, `a` and
 * `b` over `[−0.4, 0.4]`, clamped; cell `round(x · 23)` per axis), each with its pixel count and
 * the mean color of its pixels (summed in raster order, stored in single precision), sorted by
 * count descending, then cell key ascending (the tie-break keeps equal-frequency colors in a
 * fixed order). The grid only decides what is counted together; the candidate is the mean, not
 * the cell center.
 */
export function frequencyModes(view: ColorView): FrequencyModes {
  const cells = BINS * BINS * BINS
  const d = view.img.colors
  const lab = view.lab
  const keyOf = new Int32Array(d)
  for (let k = 0; k < d; k++) {
    keyOf[k] =
      binOf(lab[k * 3], 0) * BINS * BINS +
      binOf(lab[k * 3 + 1], F_0_4) * BINS +
      binOf(lab[k * 3 + 2], F_0_4)
  }
  const cnt = new Int32Array(cells)
  const sum = new Float64Array(cells * 3)
  const cid = view.img.cid
  for (let i = 0; i < cid.length; i++) {
    const id = cid[i]
    const key = keyOf[id]
    cnt[key]++
    sum[key * 3] += lab[id * 3]
    sum[key * 3 + 1] += lab[id * 3 + 1]
    sum[key * 3 + 2] += lab[id * 3 + 2]
  }
  const keys: number[] = []
  for (let key = 0; key < cells; key++) if (cnt[key] > 0) keys.push(key)
  keys.sort((x, y) => cnt[y] - cnt[x] || x - y)
  const count = keys.length
  const n = new Int32Array(count)
  const key = new Int32Array(count)
  const mean = new Float64Array(count * 3)
  for (let m = 0; m < count; m++) {
    const k = keys[m]
    n[m] = cnt[k]
    key[m] = k
    mean[m * 3] = fr(sum[k * 3] / cnt[k])
    mean[m * 3 + 1] = fr(sum[k * 3 + 1] / cnt[k])
    mean[m * 3 + 2] = fr(sum[k * 3 + 2] / cnt[k])
  }
  return { count, n, key, lab: mean }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * The residual, in encoded sRGB units, above which a pixel is not explained by the inks around
 * it: `max(3σ, 0.025)`, the tolerance of the blend-absorption stages, so a pixel they would
 * hand back as anti-aliasing does not vote. `sigmaNoise` is per-channel sRGB noise.
 */
export function mixtureTolerance(sigmaNoise: number): number {
  return Math.max(3 * sigmaNoise, MIXTURE_TOLERANCE)
}

/**
 * Whether `votes` (in pixels) make a rare candidate represented in an image of `totalPx`
 * pixels: `votes ≥ max(MIN_VOTES, VOTE_SHARE · totalPx)`, 8 px at 128², 128 px at 512².
 */
export function represented(votes: number, totalPx: number): boolean {
  return votes >= Math.max(MIN_VOTES, VOTE_SHARE * totalPx)
}

/** The eight neighbors of a pixel, row by row, as `(dx, dy)` pairs. */
const RING8 = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1]

/**
 * The claimed pixels no mixture of the inks around them explains, in pixels (the voting
 * visited pixels times the stride). For each claimed pixel (`pixels`), the inks around it are
 * the accepted inks nearest (`nearestInk`, per color, −1 for none) to each of its in-image
 * neighbors the candidate does not claim, the {@link MIX_INKS} most frequent (ties to the lower
 * ink). Its residual is the distance from its color (`value`, encoded sRGB, three per color) to
 * the nearest convex mixture of two or three of them, to the single ink when only one is
 * around, or infinite when none is (a pixel surrounded by the candidate). It votes when that
 * residual and its residual as resampling overshoot of those inks both exceed `tol`.
 */
export function unexplained(
  img: DistinctImage,
  claim: Claim,
  pixels: Int32Array,
  nearestInkOf: Int32Array,
  value: Float64Array,
  inks: ArrayLike<number>,
  inkCount: number,
  tol: number,
): number {
  const w = img.width
  const h = img.height
  const cid = img.cid
  const aroundInk = new Int32Array(8)
  const aroundN = new Int32Array(8)
  const cols = new Float64Array(MIX_INKS * 3)
  const v = new Float64Array(3)
  let votes = 0
  for (let q = 0; q < pixels.length; q++) {
    const i = pixels[q]
    const y = (i / w) | 0
    const x = i - y * w
    let k = 0
    for (let e = 0; e < 16; e += 2) {
      const nx = x + RING8[e]
      const ny = y + RING8[e + 1]
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const d = cid[ny * w + nx]
      if (claim.claimed[d]) continue
      const ink = nearestInkOf[d]
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
      const ink = aroundInk[s]
      cols[s * 3] = inks[ink * 3]
      cols[s * 3 + 1] = inks[ink * 3 + 1]
      cols[s * 3 + 2] = inks[ink * 3 + 2]
    }
    const d = cid[i]
    v[0] = value[d * 3]
    v[1] = value[d * 3 + 1]
    v[2] = value[d * 3 + 2]
    let r: number
    if (m === 0) r = Infinity
    else if (m === 1) r = dist3(v[0], v[1], v[2], cols[0], cols[1], cols[2])
    else r = mixtureResidual(v, cols, m)
    if (r > tol && overshootResidual(v, cols, m) > tol) votes++
  }
  return votes * img.stride
}

/**
 * What fraction of the claimed pixels (`hoods`) sit between a pixel nearer ink `pair.i` and one
 * nearer ink `pair.j` of `axes` along their axis, in linear light or encoded sRGB as the pair
 * was found: `t(p) = ((p − A)·(B − A)) / |B − A|²`, and a pixel straddles when its 3×3
 * neighborhood has a color with `t < t_c − stepLo` and one with `t > t_c + stepHi`,
 * `stepLo = max(min(STRADDLE_STEP, t_c / 2), 0.02)` and `stepHi` likewise on the other side (a
 * candidate near one end has that ink within less than a full step). 0 without a full grid or
 * for a degenerate axis (`|B − A|² < 1e-9`); 1 when the candidate claims nothing. `scratch`
 * has one byte per distinct color plus one.
 */
export function straddleFraction(
  view: ColorView,
  hoods: Neighborhoods,
  l: number,
  a: number,
  b: number,
  axes: InkAxes,
  pair: BlendPair,
  scratch: Uint8Array,
): number {
  if (!hoods.geometry) return 0
  const inks = pair.linear ? axes.lin : axes.srgb
  const a0 = inks[pair.i * 3]
  const a1 = inks[pair.i * 3 + 1]
  const a2 = inks[pair.i * 3 + 2]
  const d0 = inks[pair.j * 3] - a0
  const d1 = inks[pair.j * 3 + 1] - a1
  const d2 = inks[pair.j * 3 + 2] - a2
  const dd = d0 * d0 + d1 * d1 + d2 * d2
  if (dd < 1e-9) return 0
  const pc = oklabToRgbF32(l, a, b)
  if (pair.linear) {
    pc[0] = srgbToLinearF32(pc[0])
    pc[1] = srgbToLinearF32(pc[1])
    pc[2] = srgbToLinearF32(pc[2])
  }
  const tc = ((pc[0] - a0) * d0 + (pc[1] - a1) * d1 + (pc[2] - a2) * d2) / dd
  const stepLo = Math.max(Math.min(STRADDLE_STEP, 0.5 * tc), 0.02)
  const stepHi = Math.max(Math.min(STRADDLE_STEP, 0.5 * (1 - tc)), 0.02)
  const lo = tc - stepLo
  const hi = tc + stepHi
  const px = pair.linear ? view.lin : view.srgb
  const side = (k: number): number =>
    sideOf(
      ((px[k * 3] - a0) * d0 + (px[k * 3 + 1] - a1) * d1 + (px[k * 3 + 2] - a2) * d2) / dd,
      lo,
      hi,
    )
  return hoods.straddle(side, scratch)
}

/**
 * Whether a candidate is anti-aliasing rather than an ink, from the measurements the walk
 * takes of it; each is taken only when the one before it leaves the verdict open.
 */
interface BlendEvidence {
  /** A blend of two accepted inks. */
  blend: boolean
  /** Inside the merge radius of an accepted ink, kept so far only by the MDL escape. */
  escaped: boolean
  /** Share of the claimed pixels that are interior; 1 (not measured) unless a blend or escaped. */
  interior: number
  /** Largest straddle fraction over the matching pairs; 0 unless a thin blend. */
  straddle: number
}

/** The walk's state between candidates. */
class Walk {
  /** Accepted inks in OKLab, three per ink, in acceptance order. */
  readonly inks: number[] = []
  /** The same inks in the blend spaces. */
  readonly axes = new InkAxes()
  /** Per color, the OKLab distance to the nearest accepted ink. */
  readonly nearest: Float64Array
  /** Per color, the index of that ink (−1 before any is accepted). */
  readonly nearestInk: Int32Array
  /** The current candidate's claimed colors. */
  readonly claim: Claim
  /** One byte per color (plus the outside) for the straddle test. */
  readonly scratch: Uint8Array
  readonly totalPx: number

  constructor(
    readonly view: ColorView,
    readonly ev: PaletteEvidence,
    readonly mergeDistance: number,
  ) {
    const colors = view.img.colors
    this.nearest = new Float64Array(colors).fill(Infinity)
    this.nearestInk = new Int32Array(colors).fill(-1)
    this.claim = newClaim(colors)
    this.scratch = new Uint8Array(colors + 1)
    this.totalPx = Math.max(view.img.n, 1)
  }

  get count(): number {
    return this.inks.length / 3
  }

  /** Whether candidate `(l, a, b)` passes every gate. */
  accepts(l: number, a: number, b: number): boolean {
    const { sigmaNoise, lambda, noiseSigmas, sameInkDe00 } = this.ev
    const view = this.view
    const claim = view.img.claim(this.claim, this.nearest, view.lab, l, a, b)
    // The spread only matters through `noiseSigmas · spread`; with the guard off it is not measured.
    const spread = noiseSigmas === 0 ? 0 : view.img.spread(this.claim, this.mergeDistance)
    const rare = claim / this.totalPx < MIN_INK_WEIGHT && this.count > 0
    let nearest = Infinity
    for (let k = 0; k < this.count; k++) {
      const d = dist3(this.inks[k * 3], this.inks[k * 3 + 1], this.inks[k * 3 + 2], l, a, b)
      if (d < nearest) nearest = d
    }
    const reach = noiseSigmas * spread
    if (sameInkAsAccepted(l, a, b, this.inks, this.count, sameInkDe00)) return false
    const merged = nearest <= Math.max(this.mergeDistance, reach)
    if (merged) {
      const worthIt =
        sigmaNoise > 0 &&
        nearest > JND_FLOOR &&
        nearest > reach &&
        0.5 * claim * (nearest / sigmaNoise) ** 2 > lambda * PARAMS_PER_INK
      if (!worthIt) return false
    }
    let pixels: Int32Array | null = null
    const claimed = (): Int32Array => (pixels ??= view.img.claimedPixels(this.claim))
    if (rare) {
      const votes = unexplained(
        view.img,
        this.claim,
        claimed(),
        this.nearestInk,
        view.srgb,
        this.axes.srgb,
        this.count,
        mixtureTolerance(sigmaNoise),
      )
      if (!represented(votes, this.totalPx)) return false
    }
    // From here on `merged` means "inside the merge radius and kept only by the escape".
    const shape = this.measure(l, a, b, merged, claimed)
    const coverage =
      shape.blend &&
      shape.interior < BLEND_INTERIOR_FRACTION &&
      shape.straddle >= BLEND_STRADDLE_FRACTION
    return !escapeNeedsInterior(shape.escaped, shape.blend, shape.interior) && !coverage
  }

  /**
   * Measure candidate `(l, a, b)` against the accepted inks and its current claim (`claimed`,
   * its claimed visited pixels): a blend is measured for interior, then for straddle when thin;
   * an escaped candidate for interior.
   */
  measure(
    l: number,
    a: number,
    b: number,
    escaped: boolean,
    claimed: () => Int32Array,
  ): BlendEvidence {
    const pairs = blendPairs(
      l,
      a,
      b,
      this.axes,
      this.mergeDistance * BLEND_CHORD_TOLERANCE,
      BLEND_TMIN,
    )
    const blend = pairs.length > 0
    const img = this.view.img
    const interior = blend || escaped ? img.interior(this.claim, claimed()) : 1
    let straddle = 0
    if (blend && interior < BLEND_INTERIOR_FRACTION) {
      const hoods = img.neighborhoods(claimed())
      for (const pair of pairs) {
        straddle = Math.max(
          straddle,
          straddleFraction(this.view, hoods, l, a, b, this.axes, pair, this.scratch),
        )
      }
    }
    return { blend, escaped, interior, straddle }
  }

  /**
   * Accept `(l, a, b)`: lower every color's nearest-ink distance where the new ink is strictly
   * nearer (a tie keeps the earlier ink, as labeling does), note which ink it now is, and
   * record the ink.
   */
  accept(l: number, a: number, b: number): void {
    const lab = this.view.lab
    const k = this.count
    for (let d = 0; d < this.nearest.length; d++) {
      const dd = dist3(lab[d * 3], lab[d * 3 + 1], lab[d * 3 + 2], l, a, b)
      if (dd < this.nearest[d]) {
        this.nearest[d] = dd
        this.nearestInk[d] = k
      }
    }
    this.axes.push(l, a, b)
    this.inks.push(l, a, b)
  }
}

/**
 * Move each ink (`inks`, OKLab, three per ink, edited in place) to the mean of the pixels that
 * chose it — a pixel chooses its nearest ink (ties to the lower index) only when that ink is
 * within `mergeDistance`, so anti-aliased pixels far from every ink do not pull the means — and
 * return each ink's share of the image. The choice is made per color; the means are summed
 * over the pixels in raster order and stored in single precision. An ink nobody chose keeps its
 * color and weighs 0.
 */
export function refineToMembers(
  view: ColorView,
  inks: Float64Array,
  count: number,
  mergeDistance: number,
  totalPx: number,
): Float64Array {
  const d = view.img.colors
  const lab = view.lab
  const chosen = new Int32Array(d)
  for (let k = 0; k < d; k++) {
    let best = 0
    let bestD = Infinity
    for (let i = 0; i < count; i++) {
      const dist = dist3(
        lab[k * 3],
        lab[k * 3 + 1],
        lab[k * 3 + 2],
        inks[i * 3],
        inks[i * 3 + 1],
        inks[i * 3 + 2],
      )
      if (dist < bestD) {
        best = i
        bestD = dist
      }
    }
    chosen[k] = bestD <= mergeDistance ? best : -1
  }
  const sum = new Float64Array(count * 3)
  const members = new Float64Array(count)
  const cid = view.img.cid
  for (let i = 0; i < cid.length; i++) {
    const id = cid[i]
    const k = chosen[id]
    if (k < 0) continue
    sum[k * 3] += lab[id * 3]
    sum[k * 3 + 1] += lab[id * 3 + 1]
    sum[k * 3 + 2] += lab[id * 3 + 2]
    members[k]++
  }
  const weight = new Float64Array(count)
  for (let k = 0; k < count; k++) {
    if (members[k] > 0) {
      inks[k * 3] = fr(sum[k * 3] / members[k])
      inks[k * 3 + 1] = fr(sum[k * 3 + 1] / members[k])
      inks[k * 3 + 2] = fr(sum[k * 3 + 2] / members[k])
    }
    weight[k] = members[k] / totalPx
  }
  return weight
}

/**
 * Recover the palette of `rgb` (the image composited over white, encoded sRGB in `[0, 1]`,
 * three per pixel, row-major `width × height`) by the MDL walk (see the module header), with
 * `ev` deciding whether two nearby candidates are one ink measured twice or two inks.
 * `mergeDistance`, the distances, the spread and the reach are OKLab distances; `ev.sigmaNoise`
 * is encoded sRGB, so the escape's `d / σ` reads an OKLab distance in standard deviations of
 * the measurement (both scales run over about `[0, 1]`). `ids` are the image's color ids when
 * the caller shares them with {@link labelImage}.
 *
 * The result always has at least one ink: with nothing accepted (or `maxColors` 0) it is the
 * most frequent mode, and an empty image gives white with weight 0. Palette order is acceptance
 * order; every ink's alpha is 1.
 */
export function extractPaletteMdl(
  rgb: Float32Array,
  width: number,
  height: number,
  mergeDistance: number = DEFAULT_MERGE_DISTANCE,
  maxColors: number = DEFAULT_MAX_COLORS,
  ev: PaletteEvidence = NO_EVIDENCE,
  ids: ColorIds = colorIdsOfRgb(rgb),
): Palette {
  const view = new ColorView(rgb, ids, width, height)
  const modes = frequencyModes(view)
  const walk = new Walk(view, ev, mergeDistance)
  for (let m = 0; m < modes.count; m++) {
    if (walk.count >= maxColors) break
    const l = modes.lab[m * 3]
    const a = modes.lab[m * 3 + 1]
    const b = modes.lab[m * 3 + 2]
    if (walk.accepts(l, a, b)) walk.accept(l, a, b)
  }
  let inks = walk.inks
  if (inks.length === 0)
    inks = modes.count > 0 ? [modes.lab[0], modes.lab[1], modes.lab[2]] : [1, 0, 0]
  const count = inks.length / 3
  const inkLab = Float64Array.from(inks)
  const weight = refineToMembers(view, inkLab, count, mergeDistance, walk.totalPx)
  const inkRgb = new Float64Array(count * 3)
  for (let k = 0; k < count; k++) {
    const r = oklabToRgbF32(inkLab[k * 3], inkLab[k * 3 + 1], inkLab[k * 3 + 2])
    inkRgb[k * 3] = r[0]
    inkRgb[k * 3 + 1] = r[1]
    inkRgb[k * 3 + 2] = r[2]
  }
  return { count, inkLab, inkRgb, weight, alpha: new Float64Array(count).fill(1) }
}

/**
 * {@link extractPaletteMdl} with the fixed merge distance alone: no noise estimate, so no MDL
 * escape, no noise guard and no perceptual floor.
 */
export function extractPalette(
  rgb: Float32Array,
  width: number,
  height: number,
  mergeDistance: number = DEFAULT_MERGE_DISTANCE,
  maxColors: number = DEFAULT_MAX_COLORS,
): Palette {
  return extractPaletteMdl(rgb, width, height, mergeDistance, maxColors, NO_EVIDENCE)
}

/**
 * Assign every pixel of `rgb` its nearest palette entry in OKLab (ties to the lower index), one
 * label per pixel. Hard labeling: an anti-aliased pixel gets whichever ink is closest, often a
 * third color, which the blend-absorption stage repairs. The nearest entry is found once per
 * distinct color and read back through each pixel's id (`ids`, shared with the extraction).
 */
export function labelImage(
  rgb: Float32Array,
  palette: Palette,
  ids: ColorIds = colorIdsOfRgb(rgb),
): Int32Array {
  const perColor = new Int32Array(ids.count)
  for (let k = 0; k < ids.count; k++) {
    const p = ids.reps[k] * 3
    const lab = rgbToOklabF32(rgb[p], rgb[p + 1], rgb[p + 2])
    perColor[k] = nearestInk(palette, lab[0], lab[1], lab[2])[0]
  }
  const labels = new Int32Array(ids.cid.length)
  for (let i = 0; i < labels.length; i++) labels[i] = perColor[ids.cid[i]]
  return labels
}
