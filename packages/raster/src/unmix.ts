/**
 * The ink of a thin region, unmixed from its anti-aliased rim.
 *
 * A region whose flat core cannot speak for it (a line up to a few pixels
 * wide, a small counter) has no pixel the gradient test calls flat, so its
 * mean over every pixel is the only color the segmenter has for it — and that
 * mean blends the feature's ink with the field around it: a black glyph reads
 * dark grey, the white counter inside it light grey, a black outline on blue
 * navy. Every rim pixel of such a feature is a coverage-weighted blend of the
 * feature's ink and the region beside it,
 *
 *     c = α·ink + (1 − α)·field,   0 ≤ α ≤ 1,
 *
 * the two-color compositing model behind closed-form matting (Levin, Lischinski
 * & Weiss 2008) and the mixture tests of `mixture.ts`, read in encoded sRGB —
 * the values a rasterizer blends an anti-aliased edge in. A pixel's field is
 * the nearest region of another color (a neighbor within `UNMIX_FIELD_APART` is
 * another piece of the same feature). Read along each pixel's field→ink
 * direction, the pixels of highest coverage are the ink itself, so the ink is
 * the mean of the most covered share of the region (`UNMIX_TOP_SHARE`),
 * refined as the direction settles: the least extrapolation the data allows —
 * a line too thin to reach full coverage anywhere keeps its most covered color,
 * never a heavier one guessed past the pixels. The fields are read twice: from
 * the regions' colors, then from the inks the first reading unmixed, so a
 * counter inside a thin glyph is unmixed against the glyph's ink, not its rim.
 *
 * The unmixed ink replaces the mean only for a feature the model explains: a
 * thin region (mean width at most `UNMIX_MAX_WIDTH` source pixels) whose
 * pixels the two-color fit reproduces within `UNMIX_RESIDUAL_SHARE` of the
 * ink's contrast against its fields, whose ink is a color extreme between its
 * sides — no convex mixture of the regions around it, nor their resampling
 * overshoot, makes it (`mixtureResidual`, `overshootResidual`) — and which
 * stands apart from each side it runs along (`UNMIX_MIN_CONTRAST`, the
 * rescue's bar for a feature): an ink nearer a side than that is the side's
 * own rim, compression smearing the edge's chroma or ringing past it. Such a
 * rim, a shaded region (wider than a rim) and a web of several inks (a
 * residual no single ink explains) keep their mean. A region whose pixels are
 * blends of two sides of different colors, centered well inside the chord
 * between them and spread across it (`UNMIX_BAND_INTERIOR`,
 * `UNMIX_BAND_SPREAD`), is a band of that blend — a marker seeded inside an
 * anti-aliased ramp — and is reported as one.
 */
import { oklabToRgb, rgbToOklab } from '@trazor/core'
import { MIX_INKS, MIXTURE_TOLERANCE, mixtureResidual, overshootResidual } from './represent'

/** Widest mean width (twice the area over the perimeter), in source pixels, of a region whose ink is unmixed. */
export const UNMIX_MAX_WIDTH = 6

/** Share of a region's pixels, the most covered, whose mean is its ink. */
const UNMIX_TOP_SHARE = 0.25

/** Refinements of the field→ink direction the coverage is read along. */
const UNMIX_ROUNDS = 3

/**
 * Encoded-sRGB distance below which a neighboring region is another piece of
 * the same feature rather than the field its rim blends into: the pieces an
 * outline is cut into differ by their rims' tints, a field by a color.
 */
const UNMIX_FIELD_APART = 0.1

/**
 * Root-mean-square distance of a region's pixels from their two-color fit, as
 * a share of the ink's contrast against the fields, up to which the fit
 * explains the region: anti-aliasing is exact in the model, while resampling
 * ringing and block compression err in proportion to the edge they blur; a web
 * of several inks, or a region whose color runs along it, does not fit.
 */
export const UNMIX_RESIDUAL_SHARE = 0.1

/**
 * How far inside the chord between its two sides, as a share of its length, a
 * thin region's median coverage must lie for the region to be a band of their
 * blend: a marker seeded inside an anti-aliased ramp grows along it as a stripe
 * of the blend colors, centered well inside the chord, while a feature drawn
 * in one side's own color sits at its end.
 */
const UNMIX_BAND_INTERIOR = 0.1

/**
 * Least share of a band's fields the lesser of its two sides must hold: a band
 * runs between them, so both border it along its length.
 */
const UNMIX_BAND_SIDE_SHARE = 0.25

/** Share of a band's pixels that must lie on the chord between its two sides. */
const UNMIX_BAND_EXPLAINED = 0.7

/**
 * Farthest a band pixel may lie from the chord between its two sides, as a
 * share of the chord's length: compression smears an edge's chroma across it,
 * so a blend pixel of a saturated edge sits off the chord by up to a fifth of
 * the contrast (`mixture.ts`'s `BAND_RESID_SHARE`).
 */
const UNMIX_BAND_RESID = 0.2

/**
 * Least spread of a band's coverage (its 80th less its 20th percentile): a band
 * covers a stretch of the ramp between its sides (`mixture.ts`'s
 * `BAND_RAMP_SPREAD`).
 */
const UNMIX_BAND_SPREAD = 0.2

/**
 * Least Oklab distance between a thin feature's ink and each side it runs
 * between when the sides differ in color, and within one field: the rescue's
 * `RESCUE_MIN_CONTRAST` and `RESCUE_LINE_CONTRAST` (`segment.ts`) — a feature
 * drawn between two colors stands well apart from both, a crease within one
 * fill by half as much.
 */
const UNMIX_MIN_CONTRAST = 0.25
const UNMIX_LINE_CONTRAST = 0.125

/** Oklab distance within which the sides of a feature are one field (the rescue's `RESCUE_ONE_FIELD`). */
const UNMIX_ONE_FIELD = 0.1

/**
 * Least share of the leading side's fields a side must hold to be one the
 * feature runs between rather than one it touches at a tip.
 */
const UNMIX_SIDE_SHARE = 0.25

/** The eight directions a pixel looks along for its field, and their step lengths. */
const DIRS: readonly (readonly [number, number, number])[] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
]

/** Euclidean distance between two colors of one space. */
function distance(p: ArrayLike<number>, q: ArrayLike<number>): number {
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** Field id of a pixel outside the mask: the white ground a transparent pixel was composited over. */
const OUTSIDE = -2
/** Field id of a pixel with no field within reach. */
const NONE = -1

/** What {@link unmixThinInks} found for each region. */
export interface UnmixResult {
  /** The unmixed ink (Oklab, three per region), where `unmixed` is set. */
  ink: Float64Array
  /** 1 where the region is a feature whose ink replaces its mean. */
  unmixed: Uint8Array
  /** 1 where the region is a band of the blend of two sides. */
  band: Uint8Array
}

/**
 * Unmix the ink of every thin region whose core does not speak (`coreless[r]`
 * set). `rgba` is the image (encoded sRGB bytes, four per pixel), `region` the
 * label per pixel (-1 outside the mask), `size` each region's pixel count and
 * `mL`/`mA`/`mB` its current color (Oklab), from which the fields are read.
 * `scale` is the working pixels per source pixel. Deterministic: fixed scan
 * and direction order.
 */
export function unmixThinInks(
  rgba: Uint8ClampedArray,
  region: Int32Array,
  w: number,
  h: number,
  regionCount: number,
  coreless: Uint8Array,
  size: Float64Array,
  mL: Float64Array,
  mA: Float64Array,
  mB: Float64Array,
  scale: number,
): UnmixResult {
  const n = w * h
  const ink = new Float64Array(regionCount * 3)
  const unmixed = new Uint8Array(regionCount)
  const band = new Uint8Array(regionCount)

  // ---- Thin candidates: no speaking core, mean width within the bound ----
  const perimeter = new Float64Array(regionCount)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r < 0 || coreless[r] === 0) continue
    const x = p % w
    if (x === 0 || region[p - 1] !== r) perimeter[r]++
    if (x === w - 1 || region[p + 1] !== r) perimeter[r]++
    if (p < w || region[p - w] !== r) perimeter[r]++
    if (p >= n - w || region[p + w] !== r) perimeter[r]++
  }
  const thin = new Uint8Array(regionCount)
  let any = false
  for (let r = 0; r < regionCount; r++) {
    if (coreless[r] === 0 || size[r] === 0) continue
    if (2 * size[r] <= UNMIX_MAX_WIDTH * scale * perimeter[r]) {
      thin[r] = 1
      any = true
    }
  }
  if (!any) return { ink, unmixed, band }

  // Candidate pixels grouped by region (counting sort, scan order within each).
  const start = new Int32Array(regionCount + 1)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r >= 0 && thin[r] === 1) start[r + 1]++
  }
  for (let r = 0; r < regionCount; r++) start[r + 1] += start[r]
  const members = new Int32Array(start[regionCount])
  const fill = start.slice(0, regionCount)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r >= 0 && thin[r] === 1) members[fill[r]++] = p
  }

  // Region colors (encoded sRGB) the fields are read from: the regions' own
  // colors, then the first inks.
  const col = new Float64Array(regionCount * 3)
  for (let r = 0; r < regionCount; r++) {
    const [cr, cg, cb] = oklabToRgb(mL[r], mA[r], mB[r])
    col[r * 3] = cr
    col[r * 3 + 1] = cg
    col[r * 3 + 2] = cb
  }
  const fc = new Float64Array(3)
  const colorOf = (f: number, out: Float64Array): void => {
    out[0] = f === OUTSIDE ? 1 : col[f * 3]
    out[1] = f === OUTSIDE ? 1 : col[f * 3 + 1]
    out[2] = f === OUTSIDE ? 1 : col[f * 3 + 2]
  }
  // Whether regions `f` and `g` are two pieces of one color.
  const alike = (f: number, g: number): boolean => {
    const dr = col[f * 3] - col[g * 3]
    const dg = col[f * 3 + 1] - col[g * 3 + 1]
    const db = col[f * 3 + 2] - col[g * 3 + 2]
    return dr * dr + dg * dg + db * db < UNMIX_FIELD_APART * UNMIX_FIELD_APART
  }

  // Each candidate pixel's field: the nearest region of another color within
  // reach along the eight directions (OUTSIDE past the mask, NONE if none).
  const reach = Math.max(1, Math.round(UNMIX_MAX_WIDTH * scale))
  const field = new Int32Array(members.length)
  const findFields = (): void => {
    for (let r = 0; r < regionCount; r++) {
      if (thin[r] === 0) continue
      for (let k = start[r]; k < start[r + 1]; k++) {
        const p = members[k]
        const x = p % w
        const y = (p - x) / w
        let best = Infinity
        let at = NONE
        for (const [dx, dy, len] of DIRS) {
          for (let s = 1; s <= reach && s * len < best; s++) {
            const xx = x + dx * s
            const yy = y + dy * s
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) break
            const q = region[yy * w + xx]
            if (q === r || (q >= 0 && alike(q, r))) continue
            best = s * len
            at = q < 0 ? OUTSIDE : q
            break
          }
        }
        field[k] = at
      }
    }
  }

  // The ink of region r: the mean of its most covered pixels, the coverage read
  // along each pixel's field→ink direction, refined UNMIX_ROUNDS times from the
  // region's color. Writes `fit` (ink r, g, b, RMS residual, RMS contrast of
  // the ink against the fields); false when no pixel has a field.
  const alpha = new Float64Array(members.length)
  const order = new Float64Array(members.length)
  const fit = new Float64Array(5)
  const fitRegion = (r: number): boolean => {
    const s0 = start[r]
    const s1 = start[r + 1]
    let ir = col[r * 3]
    let ig = col[r * 3 + 1]
    let ib = col[r * 3 + 2]
    for (let round = 0; round < UNMIX_ROUNDS; round++) {
      let fitted = 0
      for (let k = s0; k < s1; k++) {
        alpha[k] = Number.NaN
        if (field[k] === NONE) continue
        colorOf(field[k], fc)
        const ur = ir - fc[0]
        const ug = ig - fc[1]
        const ub = ib - fc[2]
        const uu = ur * ur + ug * ug + ub * ub
        if (uu < 1e-9) continue
        const o = members[k] * 4
        alpha[k] =
          ((rgba[o] / 255 - fc[0]) * ur +
            (rgba[o + 1] / 255 - fc[1]) * ug +
            (rgba[o + 2] / 255 - fc[2]) * ub) /
          uu
        order[fitted++] = alpha[k]
      }
      if (fitted === 0) return false
      const sorted = order.subarray(0, fitted).toSorted()
      const cut = sorted[Math.min(fitted - 1, Math.floor((1 - UNMIX_TOP_SHARE) * fitted))]
      let sr = 0
      let sg = 0
      let sb = 0
      let c = 0
      for (let k = s0; k < s1; k++) {
        if (!(alpha[k] >= cut)) continue
        const o = members[k] * 4
        sr += rgba[o]
        sg += rgba[o + 1]
        sb += rgba[o + 2]
        c++
      }
      ir = sr / c / 255
      ig = sg / c / 255
      ib = sb / c / 255
    }
    // The two-color fit's residual: each pixel against the nearest blend of its
    // field and the ink.
    let res2 = 0
    let con2 = 0
    let resN = 0
    for (let k = s0; k < s1; k++) {
      if (field[k] === NONE) continue
      colorOf(field[k], fc)
      const ur = ir - fc[0]
      const ug = ig - fc[1]
      const ub = ib - fc[2]
      const uu = ur * ur + ug * ug + ub * ub
      con2 += uu
      const o = members[k] * 4
      const vr = rgba[o] / 255 - fc[0]
      const vg = rgba[o + 1] / 255 - fc[1]
      const vb = rgba[o + 2] / 255 - fc[2]
      const t = uu < 1e-9 ? 0 : Math.min(1, Math.max(0, (vr * ur + vg * ug + vb * ub) / uu))
      const er = vr - t * ur
      const eg = vg - t * ug
      const eb = vb - t * ub
      res2 += er * er + eg * eg + eb * eb
      resN++
    }
    fit[0] = ir
    fit[1] = ig
    fit[2] = ib
    fit[3] = Math.sqrt(res2 / resN)
    fit[4] = Math.sqrt(con2 / resN)
    return true
  }

  // First reading: fields from the regions' colors; each fitted region's ink
  // becomes its color for the second.
  findFields()
  const first = new Float64Array(regionCount * 3)
  const firstOk = new Uint8Array(regionCount)
  for (let r = 0; r < regionCount; r++) {
    if (thin[r] === 0 || !fitRegion(r)) continue
    first[r * 3] = fit[0]
    first[r * 3 + 1] = fit[1]
    first[r * 3 + 2] = fit[2]
    firstOk[r] = 1
  }
  for (let r = 0; r < regionCount; r++) {
    if (firstOk[r] === 0) continue
    col[r * 3] = first[r * 3]
    col[r * 3 + 1] = first[r * 3 + 1]
    col[r * 3 + 2] = first[r * 3 + 2]
  }
  findFields()

  // Whether region r is a band of the blend of its leading side and the most
  // frequent side of another color, each side counted with the sides of its
  // color (the pieces of one outline): the lesser holds at least
  // `UNMIX_BAND_SIDE_SHARE` of the two together, `UNMIX_BAND_EXPLAINED` of its
  // pixels lie on the chord between them (within `UNMIX_BAND_RESID` of its
  // length), and their coverage — the share of the way from one side to the
  // other — centers well inside it (`UNMIX_BAND_INTERIOR`) and spreads across
  // it as a ramp does (`UNMIX_BAND_SPREAD`), where a stroke drawn in a color of
  // the chord holds one level.
  const ts = new Float64Array(members.length)
  const isBand = (r: number, sides: number[], counts: number[]): boolean => {
    const a = sides[0]
    let j = 1
    while (j < sides.length && alike(sides[j], a)) j++
    if (j === sides.length) return false
    const b = sides[j]
    let na = 0
    let nb = 0
    for (let q = 0; q < sides.length; q++) {
      if (alike(sides[q], a)) na += counts[q]
      else if (alike(sides[q], b)) nb += counts[q]
    }
    if (Math.min(na, nb) < UNMIX_BAND_SIDE_SHARE * (na + nb)) return false
    const ar = col[a * 3]
    const ag = col[a * 3 + 1]
    const ab = col[a * 3 + 2]
    const ur = col[b * 3] - ar
    const ug = col[b * 3 + 1] - ag
    const ub = col[b * 3 + 2] - ab
    const uu = ur * ur + ug * ug + ub * ub
    const bar2 = UNMIX_BAND_RESID * UNMIX_BAND_RESID * uu
    const s0 = start[r]
    const s1 = start[r + 1]
    let explained = 0
    for (let k = s0; k < s1; k++) {
      const o = members[k] * 4
      const vr = rgba[o] / 255 - ar
      const vg = rgba[o + 1] / 255 - ag
      const vb = rgba[o + 2] / 255 - ab
      const t = (vr * ur + vg * ug + vb * ub) / uu
      ts[k - s0] = t
      const er = vr - t * ur
      const eg = vg - t * ug
      const eb = vb - t * ub
      if (t >= 0 && t <= 1 && er * er + eg * eg + eb * eb <= bar2) explained++
    }
    const len = s1 - s0
    if (explained < UNMIX_BAND_EXPLAINED * len) return false
    const sorted = ts.subarray(0, len).toSorted()
    const mid = sorted[Math.floor(0.5 * (len - 1))]
    const spread = sorted[Math.floor(0.8 * (len - 1))] - sorted[Math.floor(0.2 * (len - 1))]
    return (
      mid >= UNMIX_BAND_INTERIOR && mid <= 1 - UNMIX_BAND_INTERIOR && spread >= UNMIX_BAND_SPREAD
    )
  }

  // Whether an ink (encoded sRGB, `c`) stands apart from every side that
  // borders the region along a good part of it (`UNMIX_SIDE_SHARE` of the
  // leading side's fields): by `UNMIX_MIN_CONTRAST` (Oklab) when those sides
  // are of different colors, by `UNMIX_LINE_CONTRAST` when they are one field.
  // An ink nearer a side than that is that side's own rim — compression
  // smearing an edge's chroma, a ringing halo — not a feature drawn there.
  const standsApart = (
    c: Float64Array,
    sides: number[],
    counts: number[],
    outsideN: number,
  ): boolean => {
    const lead = Math.max(counts.length > 0 ? counts[0] : 0, outsideN)
    const near: [number, number, number][] = []
    for (let q = 0; q < Math.min(sides.length, MIX_INKS); q++) {
      if (counts[q] < UNMIX_SIDE_SHARE * lead) break
      const f = sides[q]
      near.push(rgbToOklab(col[f * 3], col[f * 3 + 1], col[f * 3 + 2]))
    }
    if (outsideN >= UNMIX_SIDE_SHARE * lead) near.push(rgbToOklab(1, 1, 1))
    if (near.length === 0) return true
    let oneField = true
    for (let i = 0; i < near.length && oneField; i++) {
      for (let j = i + 1; j < near.length; j++) {
        if (distance(near[i], near[j]) >= UNMIX_ONE_FIELD) {
          oneField = false
          break
        }
      }
    }
    const bar = oneField ? UNMIX_LINE_CONTRAST : UNMIX_MIN_CONTRAST
    const own = rgbToOklab(c[0], c[1], c[2])
    for (const q of near) if (distance(own, q) < bar) return false
    return true
  }

  // Second reading, then the tests: the fit explains the region and its ink is
  // a color extreme between its sides; otherwise the region may be a band.
  const sideN = new Int32Array(regionCount)
  const sideId = new Int32Array(regionCount)
  const cols = new Float64Array((MIX_INKS + 1) * 3)
  const px = new Float64Array(3)
  for (let r = 0; r < regionCount; r++) {
    if (thin[r] === 0) continue
    const fitted = fitRegion(r) && fit[3] <= UNMIX_RESIDUAL_SHARE * fit[4]
    // Sides: the fields by frequency, most first, ties to the lower region;
    // white joins them when the region borders the outside of the mask.
    let m = 0
    let outside = false
    let outsideN = 0
    for (let k = start[r]; k < start[r + 1]; k++) {
      const f = field[k]
      if (f === NONE) continue
      if (f === OUTSIDE) {
        outside = true
        outsideN++
        continue
      }
      if (sideN[f]++ === 0) sideId[m++] = f
    }
    const sides = Array.from(sideId.subarray(0, m)).toSorted((a, b) => sideN[b] - sideN[a] || a - b)
    const counts = sides.map((f) => sideN[f])
    for (let s = 0; s < m; s++) sideN[sideId[s]] = 0
    let extreme = false
    if (fitted) {
      let k = 0
      for (let s = 0; s < Math.min(m, MIX_INKS); s++) {
        cols[k * 3] = col[sides[s] * 3]
        cols[k * 3 + 1] = col[sides[s] * 3 + 1]
        cols[k * 3 + 2] = col[sides[s] * 3 + 2]
        k++
      }
      if (outside) {
        cols[k * 3] = 1
        cols[k * 3 + 1] = 1
        cols[k * 3 + 2] = 1
        k++
      }
      px[0] = fit[0]
      px[1] = fit[1]
      px[2] = fit[2]
      const resid =
        k === 0
          ? Infinity
          : k === 1
            ? Math.hypot(px[0] - cols[0], px[1] - cols[1], px[2] - cols[2])
            : mixtureResidual(px, cols, k)
      extreme = resid > MIXTURE_TOLERANCE && overshootResidual(px, cols, k) > MIXTURE_TOLERANCE
      if (extreme) extreme = standsApart(fit, sides, counts, outsideN)
    }
    if (extreme) {
      const [L, A, B] = rgbToOklab(fit[0], fit[1], fit[2])
      ink[r * 3] = L
      ink[r * 3 + 1] = A
      ink[r * 3 + 2] = B
      unmixed[r] = 1
    } else if (m >= 2 && isBand(r, sides, counts)) band[r] = 1
  }
  return { ink, unmixed, band }
}
