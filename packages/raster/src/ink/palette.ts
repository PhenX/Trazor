/**
 * The palette's decisions and their constants: how many inks a raster holds and what color each
 * is, decided by minimum description length rather than a fixed distance threshold, then the
 * hard nearest-ink labeling and the split of an ink by the opacity the source drew it at.
 *
 * Three color spaces, each for one question:
 * - **OKLab** (Ottosson 2020) for "is this the same color?": Euclidean distance there is
 *   roughly perceptual, so one merge radius means the same thing everywhere.
 * - **linear light and encoded sRGB** for "is this a blend?": light mixes linearly in linear
 *   light, and many renderers mix the encoded values instead, so a blend is looked for in both
 *   and its residual judged back in OKLab.
 * - **CIELAB with CIEDE2000** (Sharma, Wu, Dalal 2005) for "could anybody tell them apart?":
 *   OKLab's cube-root lightness makes the first levels above black look far apart when nobody
 *   can see them.
 *
 * The walk itself (frequency modes, the gauntlet, the refit, the labeling) is `mdl.ts`; the
 * per-color index it runs on is `distinct.ts`.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/color.rs` (the constants, `PaletteEvidence`,
 * `Palette`, `escape_needs_interior`, `blend_pairs_cached`, `same_ink_as_accepted`, `de00`,
 * `split_alpha_inks`), `inkvec-trace/src/color/mdl.rs` (`InkAxes`) and the soft-intake gate of
 * `inkvec-trace/src/lib.rs` (`trace_color_full_with_alpha`).
 */
import { ciede2000, rgbToLab } from '@trazor/core'
import { bicLambda } from '../fill/select'

/**
 * OKLab distance below which two colors are treated as the same ink, unless the description
 * length says otherwise: tight enough to keep distinguishable colors apart, loose enough that
 * ringing and dithering inside one flat region do not fracture it.
 */
export const DEFAULT_MERGE_DISTANCE = 0.035

/** Most inks a palette holds. */
export const DEFAULT_MAX_COLORS = 64

/**
 * Share of the image under which a candidate is *rare* and has to be represented (enough of
 * its pixels unexplained by the inks around them) rather than being taken for an ink on its
 * count. Anti-aliased colors are individually rare; flat regions are not.
 */
export const MIN_INK_WEIGHT = 0.004

/**
 * Below this share of its claimed pixels being *interior* (one step of 4-neighbor erosion
 * keeps it), a color that tests as a blend is anti-aliasing rather than ink: anti-aliasing is
 * a band one pixel wide, an ink covers area. A three-pixel ring keeps about a third.
 */
export const BLEND_INTERIOR_FRACTION = 0.25

/**
 * A thin blend-colored candidate is discarded as coverage only when at least this fraction of
 * its pixels *straddle* the two inks it blends: anti-aliasing is a ramp, so each of its pixels
 * has a neighbor nearer each ink, while a band of ink two pixels wide has pixels touching one
 * ink and pixels touching the other and none touching both.
 */
export const BLEND_STRADDLE_FRACTION = 0.5

/** How much further along the A–B axis a neighbor must sit, as a fraction of it, to count as the far side. */
export const STRADDLE_STEP = 0.12

/** Numbers needed to state one ink: one per OKLab channel. */
export const PARAMS_PER_INK = 3

/**
 * CIEDE2000 below which two candidate inks are one ink, whatever the pixel count says. Applied
 * before the description-length escape: no count can rescue an ink nobody can distinguish.
 */
export const SAME_INK_DE00 = 1.5

/** {@link SAME_INK_DE00} on a soft intake, where the ramp between two inks is a family of colors that are not inks. */
export const SOFT_SAME_INK_DE00 = 5.0

/** Edge width, in pixels, above which an intake has been resampled, blurred or upscaled. */
export const SOFT_INTAKE_EDGE = 1.75

/** The noise guard's strength on a soft intake ({@link NOISE_SIGMAS} is the clean value). */
export const SOFT_NOISE_SIGMAS = 3.0

/**
 * The clean-intake noise guard: off. How many times its own spread a candidate must stand clear
 * of the nearest accepted ink; the caller switches to {@link SOFT_NOISE_SIGMAS} on positive
 * evidence that the intake is not clean.
 */
export const NOISE_SIGMAS = 0.0

/** Ringing score above which an intake counts as compressed. */
export const SOFT_RINGING = 0.12

/** {@link SOFT_RINGING} for an image whose smaller side is at least {@link RINGING_MIN_DIM}. */
export const SOFT_RINGING_LARGE = 0.05

/** The smallest side at which {@link SOFT_RINGING_LARGE} applies. */
export const RINGING_MIN_DIM = 256

/** How much of the residual noise measured against the labels to believe on a soft intake. */
export const MEASURED_SIGMA_SCALE = 1.0

/** Ceiling, in display levels, on the residual noise measured against the labels. */
export const MEASURED_SIGMA_CAP = 8.0

/** How far inside a chord, as a fraction of it, a blend must lie. */
export const BLEND_TMIN = 0.04

/** How far, in OKLab and as a multiple of the merge distance, a blend may sit from its chord. */
export const BLEND_CHORD_TOLERANCE = 1.6

/** Smallest OKLab separation ever treated as two inks: no evidence splits colors closer than this. */
export const JND_FLOOR = 0.012

/**
 * What the palette needs to know about the measurement, as opposed to the pixels. Named so two
 * plausible numbers cannot be swapped.
 */
export interface PaletteEvidence {
  /** Per-channel pixel noise in encoded sRGB units (`estimateNoise`); 0 disables the MDL escape. */
  sigmaNoise: number
  /** Nats charged per parameter; an ink costs `lambda · PARAMS_PER_INK` before it explains anything. */
  lambda: number
  /** How many measured spreads two inks must lie apart before they count as two. */
  noiseSigmas: number
  /** CIEDE2000 below which two candidate inks are one ink. */
  sameInkDe00: number
}

/** No measurement: the fixed merge radius alone decides (every field zero). */
export const NO_EVIDENCE: Readonly<PaletteEvidence> = Object.freeze({
  sigmaNoise: 0,
  lambda: 0,
  noiseSigmas: 0,
  sameInkDe00: 0,
})

/**
 * Whether the intake is soft (resampled, blurred, upscaled or compressed): an edge wider than
 * {@link SOFT_INTAKE_EDGE}, a lossy container, or ringing above {@link SOFT_RINGING}
 * ({@link SOFT_RINGING_LARGE} when both sides are at least {@link RINGING_MIN_DIM}).
 */
export function isSoftIntake(
  edgeWidth: number,
  ringing: number,
  lossy: boolean,
  width: number,
  height: number,
): boolean {
  const gate = Math.min(width, height) >= RINGING_MIN_DIM ? SOFT_RINGING_LARGE : SOFT_RINGING
  return edgeWidth > SOFT_INTAKE_EDGE || lossy || ringing > gate
}

/**
 * The evidence the pipeline hands the palette: `sigmaNoise` as measured before the palette,
 * `lambda = bicLambda(pixels)` (`½·ln(max(n, 2))`, the BIC price of one number), and the clean
 * or soft guard and same-ink floor.
 */
export function paletteEvidence(
  sigmaNoise: number,
  pixels: number,
  soft: boolean,
): PaletteEvidence {
  return {
    sigmaNoise,
    lambda: bicLambda(pixels),
    noiseSigmas: soft ? SOFT_NOISE_SIGMAS : NOISE_SIGMAS,
    sameInkDe00: soft ? SOFT_SAME_INK_DE00 : SAME_INK_DE00,
  }
}

/** A recovered palette. */
export interface Palette {
  /** Number of entries (at least one from extraction). */
  count: number
  /** Entries in OKLab, three per ink, in acceptance order. */
  inkLab: Float64Array
  /** The same entries in encoded sRGB `[0, 1]`, converted from `inkLab`. */
  inkRgb: Float64Array
  /** Each entry's share of the image: the pixels whose nearest ink it is within the merge distance. */
  weight: Float64Array
  /** Each entry's opacity: 1 from extraction, set by {@link splitAlphaInks}. */
  alpha: Float64Array
}

const fr = Math.fround
const F_KNEE = fr(0.04045)
const F_LIN_KNEE = fr(0.0031308)
const F_12_92 = fr(12.92)
const F_0_055 = fr(0.055)
const F_1_055 = fr(1.055)
const F_GAMMA = fr(2.4)
const F_INV_GAMMA = fr(1 / F_GAMMA)
/** Ottosson's `M1` (linear sRGB to cone response) and `M2` (cube roots to `L, a, b`), single precision. */
const F_M1 = [
  0.41222147, 0.53633255, 0.051445995, 0.2119035, 0.6806995, 0.10739696, 0.08830246, 0.28171885,
  0.6299787,
].map(fr)
const F_M2 = [
  0.21045426, 0.7936178, -0.004072047, 1.9779985, -2.4285922, 0.4505937, 0.025904037, 0.78277177,
  -0.80867577,
].map(fr)
/** Ottosson's inverse matrices: `L, a, b` to cube roots (the `a` and `b` columns), and cones to linear sRGB. */
const F_M2_INV = [0.39633778, 0.21580376, -0.105561346, -0.06385417, -0.08948418, -1.2914855].map(
  fr,
)
const F_M1_INV = [
  4.0767417, -3.3077116, 0.23096994, -1.268438, 2.6097574, -0.34131938, -0.004196086, -0.7034186,
  1.7076147,
].map(fr)

/** The sRGB decoding curve (IEC 61966-2-1) in single precision. */
export function srgbToLinearF32(c: number): number {
  return c <= F_KNEE ? fr(c / F_12_92) : fr(Math.pow(fr(fr(c + F_0_055) / F_1_055), F_GAMMA))
}

/** The sRGB encoding curve in single precision, not clamped. */
export function linearToSrgbF32(c: number): number {
  return c <= F_LIN_KNEE
    ? fr(c * F_12_92)
    : fr(fr(F_1_055 * fr(Math.pow(c, F_INV_GAMMA))) - F_0_055)
}

/** Row `o` of a single-precision 3×3 matrix times `(x, y, z)`, summed left to right. */
function rowF32(m: number[], o: number, x: number, y: number, z: number): number {
  return fr(fr(fr(m[o] * x) + fr(m[o + 1] * y)) + fr(m[o + 2] * z))
}

/**
 * Encoded sRGB to OKLab (Ottosson 2020) in single precision, every operation rounded to `f32`
 * as inkvec computes it; the palette reads pixel colors through this. A neutral color's `a` and
 * `b` are rounding noise around zero, which sits exactly on a boundary of the candidate grid
 * (`(0 + 0.4) / 0.8 · 23 = 11.5`), so the sign of that noise decides which cell a gray is
 * counted in, and the cells (hence the candidates) are inkvec's only when the noise is.
 */
export function rgbToOklabF32(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinearF32(fr(r))
  const lg = srgbToLinearF32(fr(g))
  const lb = srgbToLinearF32(fr(b))
  const l = fr(Math.cbrt(rowF32(F_M1, 0, lr, lg, lb)))
  const m = fr(Math.cbrt(rowF32(F_M1, 3, lr, lg, lb)))
  const s = fr(Math.cbrt(rowF32(F_M1, 6, lr, lg, lb)))
  return [rowF32(F_M2, 0, l, m, s), rowF32(F_M2, 3, l, m, s), rowF32(F_M2, 6, l, m, s)]
}

/**
 * OKLab to encoded sRGB in single precision, the inverse of {@link rgbToOklabF32} with
 * Ottosson's inverse matrices, clamped to `[0, 1]` per channel after encoding. The palette's
 * sRGB and linear-light views, its blend axes and its entries' `inkRgb` are converted with this.
 */
export function oklabToRgbF32(l: number, a: number, b: number): [number, number, number] {
  const L = fr(l)
  const A = fr(a)
  const B = fr(b)
  const l3 = fr(fr(L + fr(F_M2_INV[0] * A)) + fr(F_M2_INV[1] * B))
  const m3 = fr(fr(L - fr(-F_M2_INV[2] * A)) - fr(-F_M2_INV[3] * B))
  const s3 = fr(fr(L - fr(-F_M2_INV[4] * A)) - fr(-F_M2_INV[5] * B))
  const cl = fr(fr(l3 * l3) * l3)
  const cm = fr(fr(m3 * m3) * m3)
  const cs = fr(fr(s3 * s3) * s3)
  return [
    clamp01(linearToSrgbF32(rowF32(F_M1_INV, 0, cl, cm, cs))),
    clamp01(linearToSrgbF32(rowF32(F_M1_INV, 3, cl, cm, cs))),
    clamp01(linearToSrgbF32(rowF32(F_M1_INV, 6, cl, cm, cs))),
  ]
}

/** Euclidean distance between two triples (OKLab or sRGB): `√(Δ₀² + Δ₁² + Δ₂²)`. */
export function dist3(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): number {
  const d0 = x0 - x1
  const d1 = y0 - y1
  const d2 = z0 - z1
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2)
}

/**
 * {@link dist3} in single precision, every operation rounded to `f32` as inkvec measures OKLab
 * distances: two inks the same distance from a color in `f32` tie, and the tie goes where
 * inkvec sends it.
 */
export function dist3F32(
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
): number {
  const d0 = fr(x0 - x1)
  const d1 = fr(y0 - y1)
  const d2 = fr(z0 - z1)
  return fr(Math.sqrt(fr(fr(fr(d0 * d0) + fr(d1 * d1)) + fr(d2 * d2))))
}

/**
 * Index of the palette entry nearest to OKLab `(l, a, b)` and its single-precision distance
 * ({@link dist3F32}); ties go to the lower index. An empty palette gives `[0, Infinity]`.
 */
export function nearestInk(palette: Palette, l: number, a: number, b: number): [number, number] {
  const lab = palette.inkLab
  let best = 0
  let bestD = Infinity
  for (let k = 0; k < palette.count; k++) {
    const d = dist3F32(lab[k * 3], lab[k * 3 + 1], lab[k * 3 + 2], l, a, b)
    if (d < bestD) {
      best = k
      bestD = d
    }
  }
  return [best, bestD]
}

/**
 * CIEDE2000 between two encoded sRGB colors (CIELAB, D65). A radicand rounded below zero for
 * near-identical colors reads 0.
 */
export function de00(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const [l1, a1, bb1] = rgbToLab(r1, g1, b1)
  const [l2, a2, bb2] = rgbToLab(r2, g2, b2)
  const d = ciede2000(l1, a1, bb1, l2, a2, bb2)
  return Number.isNaN(d) ? 0 : d
}

/**
 * The escape rule: a candidate admitted *inside* the merge radius only by the
 * description-length escape (`escaped`), and not a blend of two accepted inks (`blend`), must
 * have an interior. Returns true, meaning "reject", when
 * `escaped && !blend && interior < BLEND_INTERIOR_FRACTION`. Blends are exempt because a thin
 * blend has its own shape test, the straddle.
 *
 * The case is a resampling rim: an opaque one-pixel rim of `1.067 ×` an ink, inside the merge
 * radius, with thousands of pixels, which the escape alone would admit.
 *
 * Inspired by: J. Yang, N. Vining, S. Kheradmand, N. Carr, L. Sigal, A. Sheffer, "Subpixel
 * Deblurring of Anti-Aliased Raster Clip-Art", Computer Graphics Forum 42(2), 2023 (palette
 * seeds only from same-color patches at least 2 px wide).
 */
export function escapeNeedsInterior(escaped: boolean, blend: boolean, interior: number): boolean {
  return escaped && !blend && interior < BLEND_INTERIOR_FRACTION
}

/** Linear light of an encoded sRGB triple, in single precision. */
function linear3(r: number, g: number, b: number): [number, number, number] {
  return [srgbToLinearF32(r), srgbToLinearF32(g), srgbToLinearF32(b)]
}

/**
 * Each accepted ink in the two blend spaces (linear light and encoded sRGB, three values per
 * ink, single precision), converted once when it is accepted.
 */
export class InkAxes {
  /** Linear light, three per ink. */
  readonly lin: number[] = []
  /** Encoded sRGB, three per ink, converted from OKLab. */
  readonly srgb: number[] = []

  /** Number of inks. */
  get count(): number {
    return this.srgb.length / 3
  }

  /** Convert and append the OKLab ink `(l, a, b)`. */
  push(l: number, a: number, b: number): void {
    const r = oklabToRgbF32(l, a, b)
    this.srgb.push(r[0], r[1], r[2])
    this.lin.push(...linear3(r[0], r[1], r[2]))
  }

  /** The OKLab inks `lab` (three per ink), converted. */
  static of(lab: ArrayLike<number>): InkAxes {
    const axes = new InkAxes()
    for (let k = 0; k + 2 < lab.length; k += 3) axes.push(lab[k], lab[k + 1], lab[k + 2])
    return axes
  }
}

/** One pair of accepted inks a candidate is a blend of. */
export interface BlendPair {
  /** The pair's inks, `i < j`. */
  i: number
  j: number
  /** Whether the blend was found in linear light (else in encoded sRGB). */
  linear: boolean
  /** OKLab distance from the candidate to the nearest point of the chord. */
  off: number
}

/**
 * Every pair of accepted inks the OKLab color `(l, a, b)` is a blend of. For each pair `(A, B)`
 * and each space (linear light first, then encoded sRGB), with `p` the candidate in that space:
 * `t = ((p − A)·(B − A)) / |B − A|²`, the chord point `q = A + t (B − A)`, and the residual
 * `off = |c − OKLab(clamp(q, 0, 1))|` measured back in OKLab. A pair qualifies when
 * `tmin ≤ t ≤ 1 − tmin` and `off ≤ tol`; pairs whose inks coincide in that space
 * (`|B − A|² < 1e-9`) are skipped; fewer than two inks give none. A pair can appear twice, once
 * per space. Every match is kept: a pale pink is within tolerance of the white–gray axis as
 * well as the white–red one, and only the pair its pixels lie between can say whether it
 * straddles them.
 */
export function blendPairs(
  l: number,
  a: number,
  b: number,
  axes: InkAxes,
  tol: number,
  tmin: number,
): BlendPair[] {
  const out: BlendPair[] = []
  const k = axes.count
  if (k < 2) return out
  const srgb = oklabToRgbF32(l, a, b)
  for (let space = 0; space < 2; space++) {
    const linear = space === 0
    const inks = linear ? axes.lin : axes.srgb
    const p = linear ? linear3(srgb[0], srgb[1], srgb[2]) : srgb
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const a0 = inks[i * 3]
        const a1 = inks[i * 3 + 1]
        const a2 = inks[i * 3 + 2]
        const d0 = inks[j * 3] - a0
        const d1 = inks[j * 3 + 1] - a1
        const d2 = inks[j * 3 + 2] - a2
        const dd = d0 * d0 + d1 * d1 + d2 * d2
        if (dd < 1e-9) continue
        const t = ((p[0] - a0) * d0 + (p[1] - a1) * d1 + (p[2] - a2) * d2) / dd
        // Only interior mixtures count: t outside the window is a different color.
        if (!(t >= tmin && t <= 1 - tmin)) continue
        const q0 = clamp01(a0 + d0 * t)
        const q1 = clamp01(a1 + d1 * t)
        const q2 = clamp01(a2 + d2 * t)
        const back = linear
          ? rgbToOklabF32(linearToSrgbF32(q0), linearToSrgbF32(q1), linearToSrgbF32(q2))
          : rgbToOklabF32(q0, q1, q2)
        const off = dist3(l, a, b, back[0], back[1], back[2])
        if (off <= tol) out.push({ i, j, linear, off })
      }
    }
  }
  return out
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

/**
 * The perceptual floor: is the OKLab color `(l, a, b)` within `sameInkDe00` (CIEDE2000) of the
 * accepted ink nearest to it in OKLab (`inks`, three per ink; ties to the earlier one)? False
 * when nothing is accepted.
 */
export function sameInkAsAccepted(
  l: number,
  a: number,
  b: number,
  inks: ArrayLike<number>,
  count: number,
  sameInkDe00: number,
): boolean {
  if (count === 0) return false
  let near = 0
  let nearD = Infinity
  for (let k = 0; k < count; k++) {
    const d = dist3(inks[k * 3], inks[k * 3 + 1], inks[k * 3 + 2], l, a, b)
    if (d < nearD) {
      near = k
      nearD = d
    }
  }
  const c = oklabToRgbF32(l, a, b)
  const p = oklabToRgbF32(inks[near * 3], inks[near * 3 + 1], inks[near * 3 + 2])
  return de00(c[0], c[1], c[2], p[0], p[1], p[2]) < sameInkDe00
}

/** Opacity below which the source drew nothing at all. */
const ALPHA_CLEAR = fr(0.05)
/** How far apart two opacity levels must be to count as two. */
const LEVEL_GAP = fr(0.15)
/** How tight one opacity level must be. */
const LEVEL_SPREAD = fr(0.06)
/** A level's share of its ink's pixels for an entry of its own. */
const LEVEL_MIN_SHARE = fr(0.02)
/** Fewest pixels an ink needs before its opacities are judged. */
const LEVEL_MIN_PIXELS = 16

/**
 * Split each ink by the opacity the source drew it at. Extraction works on the image matted
 * over white, which loses a distinction the source made: a panel at 25 % white and the clear
 * ground composite to the same color and label as one ink.
 *
 * For each ink with at least 16 pixels, its pixels' source alphas are sorted and cut wherever
 * two neighbors differ by more than 0.15. A group is a *level* when its range is at most 0.06
 * and it holds at least 2 % of the ink's pixels; its opacity is the group mean, snapped to 0
 * below 0.05 (the clear group is a level of its own). One level sets the ink's `alpha`. Two or
 * more: the most opaque keeps the original entry, each other level becomes a new entry (same
 * color, weight 0, appended in ink order then descending opacity), and every pixel of the ink
 * moves to the entry whose opacity is nearest its own (ties keep the earlier entry). Only flat
 * opacity is split: a glow, whose alpha varies across it, has no tight level and is left alone.
 *
 * `labels` (one ink index per pixel) and `palette` are edited in place (the palette's arrays
 * are replaced when entries are minted); `alpha` is the source's straight alpha in `[0, 1]`,
 * read in single precision, and the levels are measured in single precision as inkvec does.
 * A length mismatch or an empty palette changes nothing. Returns the number of entries minted.
 */
export function splitAlphaInks(
  labels: Int32Array,
  palette: Palette,
  alpha: ArrayLike<number>,
): number {
  if (labels.length !== alpha.length || palette.count === 0) return 0
  const nInks = palette.count
  const byInk: number[][] = Array.from({ length: nInks }, () => [])
  for (let p = 0; p < labels.length; p++) {
    const l = labels[p]
    if (l >= 0 && l < nInks) byInk[l].push(fr(alpha[p]))
  }
  const levels: number[][] = Array.from({ length: nInks }, () => [])
  for (let ink = 0; ink < nInks; ink++) {
    const alphas = byInk[ink]
    if (alphas.length < LEVEL_MIN_PIXELS) continue
    const sorted = Float32Array.from(alphas).toSorted()
    // Cut wherever consecutive values jump by more than the gap: a histogram split without a
    // histogram, exact on flat art.
    const keep: number[] = []
    let start = 0
    for (let k = 1; k <= sorted.length; k++) {
      if (k < sorted.length && !(fr(sorted[k] - sorted[k - 1]) > LEVEL_GAP)) continue
      const spread = fr(sorted[k - 1] - sorted[start])
      let sum = 0
      for (let q = start; q < k; q++) sum = fr(sum + sorted[q])
      const n = k - start
      const mean = fr(sum / n)
      if (spread <= LEVEL_SPREAD && fr(n / sorted.length) >= LEVEL_MIN_SHARE)
        keep.push(mean < ALPHA_CLEAR ? 0 : mean)
      start = k
    }
    if (keep.length > 1) levels[ink] = keep
    else if (keep.length === 1) palette.alpha[ink] = keep[0]
  }

  // The most opaque level keeps the original entry; the rest get new ones.
  const extraInk: number[] = []
  const extraLevel: number[] = []
  for (let ink = 0; ink < nInks; ink++) {
    if (levels[ink].length === 0) continue
    const ordered = levels[ink].toSorted((x, y) => y - x)
    palette.alpha[ink] = ordered[0]
    for (let k = 1; k < ordered.length; k++) {
      extraInk.push(ink)
      extraLevel.push(ordered[k])
    }
  }
  const minted = extraInk.length
  if (minted === 0) return 0
  const base = nInks
  const total = base + minted
  const inkLab = new Float64Array(total * 3)
  const inkRgb = new Float64Array(total * 3)
  const weight = new Float64Array(total)
  const alphaOut = new Float64Array(total)
  inkLab.set(palette.inkLab.subarray(0, base * 3))
  inkRgb.set(palette.inkRgb.subarray(0, base * 3))
  weight.set(palette.weight.subarray(0, base))
  alphaOut.set(palette.alpha.subarray(0, base))
  for (let k = 0; k < minted; k++) {
    const src = extraInk[k]
    for (let c = 0; c < 3; c++) {
      inkLab[(base + k) * 3 + c] = palette.inkLab[src * 3 + c]
      inkRgb[(base + k) * 3 + c] = palette.inkRgb[src * 3 + c]
    }
    alphaOut[base + k] = extraLevel[k]
  }
  for (let p = 0; p < labels.length; p++) {
    const ink = labels[p]
    if (ink < 0 || ink >= nInks || levels[ink].length === 0) continue
    const a = fr(alpha[p])
    // Nearest level, and the entry that carries it.
    let bestD = Math.abs(fr(a - alphaOut[ink]))
    let best = ink
    for (let k = 0; k < minted; k++) {
      if (extraInk[k] !== ink) continue
      const d = Math.abs(fr(a - extraLevel[k]))
      if (d < bestD) {
        bestD = d
        best = base + k
      }
    }
    labels[p] = best
  }
  palette.count = total
  palette.inkLab = inkLab
  palette.inkRgb = inkRgb
  palette.weight = weight
  palette.alpha = alphaOut
  return minted
}
