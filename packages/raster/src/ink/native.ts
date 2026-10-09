/**
 * Transparency carried natively: an ink is a color *and* an opacity, and the transparent
 * ground is an ink like any other.
 *
 * Every pixel is kept as its color over white `W` together with its alpha `a`, an invertible
 * transform of premultiplied RGBA (`W = P + (1 − a)`, `P = s·a`). Perceptual comparisons use
 * the color over two grounds: `W` over white and `K = W − (1 − a)(1 − g)` over a second, mid-gray
 * ground `g` ({@link SECOND_GROUND}), both in OKLab (Ottosson 2020). Two inks are one ink only if
 * they look the same over both, so white paint and the clear ground, identical over white, are
 * as far apart as white and mid-gray. For an opaque color `K = W` and the comparison is plain
 * OKLab distance.
 *
 * A two-ground point is six numbers, `[W_L, W_a, W_b, K_L, K_a, K_b]` ({@link INK2} per point,
 * packed in a `Float64Array` holding single-precision values): this module holds the point and
 * its measures (distance, CIEDE2000, the opacity the two grounds imply, the candidate grid
 * cell, the six blend coordinates), the opacity gate of the band merge, and the naming of carved
 * paint. The two-ground palette walk and the front end that runs it are `native-palette.ts`; the
 * four-channel blend passes are `native-regions.ts`; fades are `fade.ts`. Points, distances,
 * coordinates and opacities are computed in single precision, as inkvec computes them: a gray's
 * OKLab `a` and `b` are rounding noise at a cell boundary of the candidate grid, and the
 * distances' ties decide labels. CIEDE2000 is `palette.ts`'s, in double precision.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/native.rs` (`OPAQUE`, `Ink2` with `dist`,
 * `de00` and `alpha`, `SECOND_GROUND`, `second_ground`, `snap_alpha`, `over_black`,
 * `pixel_points`, `ink_points`, `bin`, `six`, `from_six`, `same_ink_as_accepted`,
 * `CLEAR_INK_ALPHA`, `same_opacity`, `CARVED_PAINT_ALPHA`, `name_carved_paint`, the dispatch
 * test of `trace_color_full_with_alpha` in `lib.rs`) and `native/palette.rs` (`point_of`), with
 * the color-id numbering of `color/distinct.rs` (`ColourIds::of_rgba`).
 */
import type { ColorIds } from './distinct'
import { de00, linearToSrgbF32, oklabToRgbF32, rgbToOklabF32, srgbToLinearF32 } from './palette'
import type { Palette } from './palette'

const fr = Math.fround

/** Alpha at or above which a pixel or an ink is opaque (compared in single precision). */
export const OPAQUE = 0.999

/**
 * The second ground colors are compared over, as a gray level. Black separates white paint
 * from the clear ground as well as anything can, but OKLab's lightness is a cube root and near
 * black it is stretched: a 2 % fringe over black sits three merge radii from black, and every
 * faint anti-aliased pixel would read as an ink of its own. Mid-gray still puts white paint and
 * the ground far apart, and a faint fringe next to the ground where it belongs.
 */
export const SECOND_GROUND = 0.5

/** Opacity at or below which an ink is the clear ground, not a color (for the color cap). */
export const CLEAR_INK_ALPHA = 0.02

/**
 * Mean opacity at or above which a feature the carve stage cut out is paint
 * ({@link nameCarvedPaint}): anti-aliasing residue left in the clear ground's interior reads
 * 0.14 to 0.36, paint 0.80 to 1.00 (inkvec's measurement on its screen and held-out icons at
 * 128 px); the half sits between the two groups.
 */
export const CARVED_PAINT_ALPHA = 0.5

/** Two palette entries may share a fill when their opacities differ by less than this. */
export const SAME_OPACITY_GAP = 0.05

/** Numbers per two-ground point: OKLab over white, then OKLab over the second ground. */
export const INK2 = 6

const F_OPAQUE = fr(OPAQUE)
const F_CLEAR_INK_ALPHA = fr(CLEAR_INK_ALPHA)
const F_CARVED_PAINT_ALPHA = fr(CARVED_PAINT_ALPHA)
const F_SAME_OPACITY_GAP = fr(SAME_OPACITY_GAP)
const F_SNAP_HIGH = fr(0.995)
const F_SNAP_LOW = fr(0.005)
/** `1 − g`: how much of the second ground an uncovered pixel shows, below white. */
const F_UNCOVERED = fr(1 - SECOND_GROUND)
const F_0_4 = fr(0.4)
const F_0_8 = fr(0.8)
/** Bins per OKLab axis of the candidate grid. */
const BINS = 24

/**
 * Opacity pinned to exactly 0 or 1 when it is within measurement of either: clamped to
 * `[0, 1]`, then above 0.995 is 1 and below 0.005 is 0, about one 8-bit level either side.
 */
export function snapAlpha(a: number): number {
  const c = a < 0 ? 0 : a > 1 ? 1 : a
  if (c > F_SNAP_HIGH) return 1
  if (c < F_SNAP_LOW) return 0
  return fr(c)
}

/**
 * The color over the second ground from the color over white `(r, g, b)` and the alpha `a`:
 * `W − (1 − a)(1 − g)` per channel, written to `out[o..o+3]`. A color `s` at opacity `a` shows
 * `s·a + (1 − a)·G` over a ground `G`, so over white `W = s·a + (1 − a)` and over gray `g` it
 * is `W − (1 − a)(1 − g)`. `a` is clamped to `[0, 1]`; each channel is floored at 0.
 */
export function overSecondGround(
  r: number,
  g: number,
  b: number,
  a: number,
  out: { [i: number]: number },
  o: number,
): void {
  const ac = a < 0 ? 0 : a > 1 ? 1 : a
  const m = fr(fr(1 - ac) * F_UNCOVERED)
  out[o] = Math.max(fr(r - m), 0)
  out[o + 1] = Math.max(fr(g - m), 0)
  out[o + 2] = Math.max(fr(b - m), 0)
}

/**
 * The two-ground point of a pixel whose color over white is `(r, g, b)` at alpha `a`, written
 * to `out[o..o+6]`. An opaque pixel (`a ≥ OPAQUE`) is the same point over either ground.
 */
export function pointOf(
  r: number,
  g: number,
  b: number,
  a: number,
  out: { [i: number]: number },
  o: number,
): void {
  const w = rgbToOklabF32(r, g, b)
  out[o] = w[0]
  out[o + 1] = w[1]
  out[o + 2] = w[2]
  if (a >= F_OPAQUE) {
    out[o + 3] = w[0]
    out[o + 4] = w[1]
    out[o + 5] = w[2]
    return
  }
  const k: [number, number, number] = [0, 0, 0]
  overSecondGround(r, g, b, a, k, 0)
  const kl = rgbToOklabF32(k[0], k[1], k[2])
  out[o + 3] = kl[0]
  out[o + 4] = kl[1]
  out[o + 5] = kl[2]
}

/**
 * Every pixel as a two-ground point ({@link INK2} numbers each): `rgb` is the image over
 * white (three per pixel), `alpha` its straight alpha (null: opaque).
 */
export function pixelPoints(rgb: Float32Array, alpha: Float32Array | null): Float64Array {
  const n = Math.floor(rgb.length / 3)
  const out = new Float64Array(n * INK2)
  for (let p = 0; p < n; p++) {
    const a = alpha === null ? 1 : alpha[p]
    pointOf(rgb[p * 3], rgb[p * 3 + 1], rgb[p * 3 + 2], a, out, p * INK2)
  }
  return out
}

/**
 * Every palette entry as a two-ground point: its OKLab color over white (`inkLab`) and, unless
 * it is opaque (an opacity of 1 when the palette has none for it), the color over the second
 * ground of its sRGB color over white (`inkRgb`) at its opacity.
 */
export function inkPoints(palette: Palette): Float64Array {
  const out = new Float64Array(palette.count * INK2)
  const k: [number, number, number] = [0, 0, 0]
  for (let i = 0; i < palette.count; i++) {
    const o = i * INK2
    const a = i < palette.alpha.length ? palette.alpha[i] : 1
    out[o] = palette.inkLab[i * 3]
    out[o + 1] = palette.inkLab[i * 3 + 1]
    out[o + 2] = palette.inkLab[i * 3 + 2]
    if (a >= F_OPAQUE) {
      out[o + 3] = out[o]
      out[o + 4] = out[o + 1]
      out[o + 5] = out[o + 2]
      continue
    }
    overSecondGround(
      palette.inkRgb[i * 3],
      palette.inkRgb[i * 3 + 1],
      palette.inkRgb[i * 3 + 2],
      a,
      k,
      0,
    )
    const kl = rgbToOklabF32(k[0], k[1], k[2])
    out[o + 3] = kl[0]
    out[o + 4] = kl[1]
    out[o + 5] = kl[2]
  }
  return out
}

/**
 * The larger of the two grounds' OKLab distances between point `p[i..]` and point `q[j..]`, in
 * single precision: plain OKLab distance when both are opaque. The maximum, because the
 * question is whether the two can be told apart over *some* ground.
 */
export function ink2Dist(p: ArrayLike<number>, i: number, q: ArrayLike<number>, j: number): number {
  const dw = groundDist(p, i, q, j)
  const dk = groundDist(p, i + 3, q, j + 3)
  return dk > dw ? dk : dw
}

/** OKLab distance over one ground, `p[i..i+3]` to `q[j..j+3]`, in single precision as inkvec measures it. */
function groundDist(p: ArrayLike<number>, i: number, q: ArrayLike<number>, j: number): number {
  const d0 = fr(p[i] - q[j])
  const d1 = fr(p[i + 1] - q[j + 1])
  const d2 = fr(p[i + 2] - q[j + 2])
  return fr(Math.sqrt(fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2))))
}

/** CIEDE2000 between two two-ground points over whichever ground tells them apart better. */
export function ink2De00(p: ArrayLike<number>, i: number, q: ArrayLike<number>, j: number): number {
  const pw = oklabToRgbF32(p[i], p[i + 1], p[i + 2])
  const qw = oklabToRgbF32(q[j], q[j + 1], q[j + 2])
  const pk = oklabToRgbF32(p[i + 3], p[i + 4], p[i + 5])
  const qk = oklabToRgbF32(q[j + 3], q[j + 4], q[j + 5])
  return Math.max(
    de00(pw[0], pw[1], pw[2], qw[0], qw[1], qw[2]),
    de00(pk[0], pk[1], pk[2], qk[0], qk[1], qk[2]),
  )
}

/**
 * The opacity a two-ground point implies: over white and over the second ground the color
 * differs by `(1 − a)(1 − g)`, so `a = 1 − mean_c(W_c − K_c) / (1 − g)` with both converted
 * back to encoded sRGB, then {@link snapAlpha}. Exact for a color built by
 * {@link overSecondGround} unless that floored a channel at 0.
 */
export function ink2Alpha(p: ArrayLike<number>, i: number): number {
  const w = oklabToRgbF32(p[i], p[i + 1], p[i + 2])
  const k = oklabToRgbF32(p[i + 3], p[i + 4], p[i + 5])
  const d = fr(fr(fr(fr(w[0] - k[0]) + fr(w[1] - k[1])) + fr(w[2] - k[2])) / 3)
  return snapAlpha(fr(1 - fr(d / F_UNCOVERED)))
}

/**
 * A color's cell of the candidate grid, `L_i · 24² + a_i · 24 + b_i`, each axis
 * `round(x · 23)` over `L ∈ [0, 1]` and `(a + 0.4) / 0.8`, `(b + 0.4) / 0.8`, clamped, in
 * single precision.
 */
export function bin(l: number, a: number, b: number): number {
  const li = Math.min(Math.round(fr(clamp01(l) * (BINS - 1))), BINS - 1)
  const ai = Math.round(fr(clamp01(fr(fr(a + F_0_4) / F_0_8)) * (BINS - 1)))
  const bi = Math.round(fr(clamp01(fr(fr(b + F_0_4) / F_0_8)) * (BINS - 1)))
  return li * BINS * BINS + ai * BINS + bi
}

/**
 * A point's six blend coordinates, written to `out[o..o+6]`: the color over white and over
 * the second ground in encoded sRGB, or in linear light. Both halves are affine in `(P, a)`,
 * so a coverage blend of two inks is a straight segment in these six numbers.
 */
export function six(
  p: ArrayLike<number>,
  i: number,
  linear: boolean,
  out: { [i: number]: number },
  o: number,
): void {
  const w = oklabToRgbF32(p[i], p[i + 1], p[i + 2])
  const k = oklabToRgbF32(p[i + 3], p[i + 4], p[i + 5])
  if (linear) {
    out[o] = srgbToLinearF32(w[0])
    out[o + 1] = srgbToLinearF32(w[1])
    out[o + 2] = srgbToLinearF32(w[2])
    out[o + 3] = srgbToLinearF32(k[0])
    out[o + 4] = srgbToLinearF32(k[1])
    out[o + 5] = srgbToLinearF32(k[2])
  } else {
    out[o] = w[0]
    out[o + 1] = w[1]
    out[o + 2] = w[2]
    out[o + 3] = k[0]
    out[o + 4] = k[1]
    out[o + 5] = k[2]
  }
}

/**
 * The inverse of {@link six}: each coordinate of `q[qo..qo+6]` clamped to `[0, 1]` (and encoded
 * when `linear`), both halves converted back to OKLab, written to `out[o..o+6]`.
 */
export function fromSix(
  q: ArrayLike<number>,
  qo: number,
  linear: boolean,
  out: { [i: number]: number },
  o: number,
): void {
  const v = (x: number): number => {
    const c = x < 0 ? 0 : x > 1 ? 1 : x
    return linear ? linearToSrgbF32(c) : c
  }
  const w = rgbToOklabF32(v(q[qo]), v(q[qo + 1]), v(q[qo + 2]))
  const k = rgbToOklabF32(v(q[qo + 3]), v(q[qo + 4]), v(q[qo + 5]))
  out[o] = w[0]
  out[o + 1] = w[1]
  out[o + 2] = w[2]
  out[o + 3] = k[0]
  out[o + 4] = k[1]
  out[o + 5] = k[2]
}

/**
 * The perceptual floor over two grounds: is point `c[ci..]` within `sameInkDe00`
 * ({@link ink2De00}) of the accepted ink nearest to it by {@link ink2Dist} (`inks`, six per
 * ink, `count` of them; ties to the earlier ink)? False when nothing is accepted.
 */
export function sameInkAsAccepted(
  c: ArrayLike<number>,
  ci: number,
  inks: ArrayLike<number>,
  count: number,
  sameInkDe00: number,
): boolean {
  if (count === 0) return false
  let near = 0
  let nearD = ink2Dist(inks, 0, c, ci)
  for (let k = 1; k < count; k++) {
    const d = ink2Dist(inks, k * INK2, c, ci)
    if (d < nearD) {
      near = k
      nearD = d
    }
  }
  return ink2De00(c, ci, inks, near * INK2) < sameInkDe00
}

/**
 * Whether pixel alpha calls for the transparent-image path: some pixel of `alpha` (one per
 * pixel, `n` pixels) is below {@link OPAQUE}. Opaque input never takes it, so the opaque path
 * is untouched by construction.
 */
export function needsNativeAlpha(alpha: Float32Array | null, n: number): boolean {
  if (alpha === null || alpha.length !== n) return false
  for (let p = 0; p < n; p++) if (alpha[p] < F_OPAQUE) return true
  return false
}

/**
 * The band merge's opacity gate: two palette entries may be merged into one gradient only
 * when drawn at the same opacity, `|α_a − α_b| < 0.05` (an entry without an opacity counts as
 * opaque). A fill is fitted over white, where the clear ground and white paint are the same
 * color, so without the gate a gradient could run from paint into the ground.
 */
export function sameOpacity(palette: Palette): (a: number, b: number) => boolean {
  const alpha = palette.alpha
  return (a: number, b: number): boolean => {
    const fa = a >= 0 && a < alpha.length ? alpha[a] : 1
    const fb = b >= 0 && b < alpha.length ? alpha[b] : 1
    return Math.abs(fr(fa - fb)) < F_SAME_OPACITY_GAP
  }
}

/** Multiplicative hash of four 32-bit words into `mask + 1` slots. */
function hash4(k0: number, k1: number, k2: number, k3: number, mask: number): number {
  let h = Math.imul(k0 ^ 0x9e3779b9, 0x85ebca6b)
  h = Math.imul(h ^ (h >>> 15) ^ k1, 0xc2b2ae35)
  h = Math.imul(h ^ (h >>> 13) ^ k2, 0x27d4eb2f)
  h = Math.imul(h ^ (h >>> 16) ^ k3, 0x165667b1)
  h ^= h >>> 15
  return h & mask
}

/**
 * Number the pixels by their (color over white, alpha) bits, in order of first occurrence: one
 * id per distinct two-ground point, the same numbering on every run. Covers
 * `min(rgb.length / 3, alpha.length)` pixels.
 */
export function colorIdsOfRgba(rgb: Float32Array, alpha: Float32Array): ColorIds {
  const n = Math.min(Math.floor(rgb.length / 3), alpha.length)
  const cbits = new Uint32Array(rgb.buffer, rgb.byteOffset, Math.floor(rgb.length / 3) * 3)
  const abits = new Uint32Array(alpha.buffer, alpha.byteOffset, alpha.length)
  const cid = new Int32Array(n)
  let cap = 1024
  let mask = cap - 1
  let table = new Int32Array(cap).fill(-1)
  let keys = new Uint32Array(cap * 4)
  let reps = new Int32Array(cap)
  let count = 0
  let prev = -1
  for (let i = 0; i < n; i++) {
    const k0 = cbits[i * 3]
    const k1 = cbits[i * 3 + 1]
    const k2 = cbits[i * 3 + 2]
    const k3 = abits[i]
    // A pixel equal to its left neighbor (most of a flat image) skips the table.
    if (
      prev >= 0 &&
      keys[prev * 4] === k0 &&
      keys[prev * 4 + 1] === k1 &&
      keys[prev * 4 + 2] === k2 &&
      keys[prev * 4 + 3] === k3
    ) {
      cid[i] = prev
      continue
    }
    let slot = hash4(k0, k1, k2, k3, mask)
    let id = table[slot]
    while (
      id >= 0 &&
      (keys[id * 4] !== k0 ||
        keys[id * 4 + 1] !== k1 ||
        keys[id * 4 + 2] !== k2 ||
        keys[id * 4 + 3] !== k3)
    ) {
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
      keys[id * 4] = k0
      keys[id * 4 + 1] = k1
      keys[id * 4 + 2] = k2
      keys[id * 4 + 3] = k3
      reps[id] = i
      table[slot] = id
      if (count * 2 > cap) {
        cap *= 2
        mask = cap - 1
        table = new Int32Array(cap).fill(-1)
        for (let d = 0; d < count; d++) {
          let s = hash4(keys[d * 4], keys[d * 4 + 1], keys[d * 4 + 2], keys[d * 4 + 3], mask)
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

/**
 * Name each feature the carve stage minted by an ink that draws something, when the carve
 * named it by the clear ground although its own pixels are paint.
 *
 * The carve names a minted feature by the palette entry nearest its median color over white,
 * and over white the clear ground *is* white: a light feature (pale yellow, white paint) is
 * named by the clear ink whenever no light paint ink is nearer, and would be drawn at opacity
 * 0. For each minted label `l` (`from ≤ l < labelInk.length`) whose ink is clear (opacity at
 * most {@link CLEAR_INK_ALPHA}, or without an opacity): its pixels' mean color over white `W̄` and
 * mean opacity `ā` (summed in double precision, kept in single); when `ā ≥`
 * {@link CARVED_PAINT_ALPHA} the label is renamed to the visible ink nearest the two-ground
 * point of `(W̄, ā)` by {@link ink2Dist}, ties to the lower index. A feature named by a visible
 * ink, or mostly see-through, keeps its name; its fill is not touched. `labelInk` is edited in
 * place; nothing happens without a visible ink or a clear-named minted label.
 *
 * Not from the literature: a naming rule for the carve stage on a transparent canvas, where
 * the carve's over-white comparison cannot tell white paint from the clear ground.
 */
export function nameCarvedPaint(
  labels: Int32Array,
  rgb: Float32Array,
  alpha: Float32Array,
  palette: Palette,
  labelInk: number[],
  from: number,
): void {
  const clear = (i: number): boolean =>
    i < 0 || i >= palette.alpha.length || palette.alpha[i] <= F_CLEAR_INK_ALPHA
  const renamed: number[] = []
  for (let l = from; l < labelInk.length; l++) if (clear(labelInk[l])) renamed.push(l)
  const visible: number[] = []
  for (let i = 0; i < palette.count; i++) if (!clear(i)) visible.push(i)
  if (renamed.length === 0 || visible.length === 0) return
  // Per renamed label: its row in the sums, or -1 when it is not being renamed.
  const slot = new Int32Array(labelInk.length - from).fill(-1)
  for (let k = 0; k < renamed.length; k++) slot[renamed[k] - from] = k
  const sumW = new Float64Array(renamed.length * 3)
  const sumA = new Float64Array(renamed.length)
  const count = new Float64Array(renamed.length)
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p]
    if (l < from || l >= labelInk.length) continue
    const k = slot[l - from]
    if (k < 0) continue
    sumW[k * 3] += rgb[p * 3]
    sumW[k * 3 + 1] += rgb[p * 3 + 1]
    sumW[k * 3 + 2] += rgb[p * 3 + 2]
    sumA[k] += alpha[p]
    count[k]++
  }
  const inks = inkPoints(palette)
  const point = new Float64Array(INK2)
  for (let k = 0; k < renamed.length; k++) {
    const n = count[k]
    if (n === 0) continue
    const aMean = fr(sumA[k] / n)
    if (aMean < F_CARVED_PAINT_ALPHA) continue
    pointOf(fr(sumW[k * 3] / n), fr(sumW[k * 3 + 1] / n), fr(sumW[k * 3 + 2] / n), aMean, point, 0)
    let best = visible[0]
    let bestD = ink2Dist(point, 0, inks, best * INK2)
    for (let v = 1; v < visible.length; v++) {
      const d = ink2Dist(point, 0, inks, visible[v] * INK2)
      if (d < bestD) {
        best = visible[v]
        bestD = d
      }
    }
    labelInk[renamed[k]] = best
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}
