/**
 * Mixture-label absorption.
 *
 * K-means can hand a palette entry to the anti-aliased rim between two flat
 * fills: the blend colors along a black-on-red edge cluster into their own
 * centroid, and that centroid then paints a thin ring of an invented color
 * along every such edge (spurious hue). Such a color is not an ink — an
 * anti-aliased pixel is by definition a coverage-weighted blend of the two inks
 * it sits between, so it lies on the segment joining them (inkvec's ink-idea
 * test, `crates/inkvec-trace/src/color.rs`). This pass dissolves a label whose
 * pixels are blends of its two dominant neighbors, splitting each pixel back to
 * whichever neighbor its coverage favors, before the small-region merge.
 *
 * A color that merely happens to sit on a chord is protected: a designer-chosen
 * tint covers flat interior area, an anti-aliased ramp does not, so a label is a
 * candidate only when it has little flat interior, and it is dissolved only when
 * its pixels genuinely straddle the two neighbors (blend evidence on both sides
 * of the chord), never on the chord geometry alone. Deterministic: integer
 * census and a fixed pixel order.
 */
import type { LabelMap, RasterImage } from '@trazor/core'

/**
 * Below this fraction of interior pixels (all four 4-neighbors share the label)
 * a label is thin enough to be a rim rather than a filled region. A designer's
 * tint fills area and clears this bar, so it is never a candidate.
 */
const INTERIOR_MAX = 0.5

/** The two dominant neighbors must account for at least this share of a candidate's edge adjacencies. */
const NEIGHBOR_COVERAGE = 0.7

/** Max squared sRGB residual (byte distance²) of a pixel from the A–B segment to count it explained as a blend. */
const RESID_MAX2 = 12 * 12

/**
 * A pixel counts as a genuine interior blend only when its coverage weight sits
 * this far inside (0, 1): a pixel at the very ends is essentially one of the two
 * inks — a near-duplicate autoK's merge handles — not a mixture. Keeping the
 * band's evidence to real mid-chord blends is what separates an anti-aliased rim
 * from a chosen tint that merely lies near one ink (inkvec's chord caveat).
 */
const T_INTERIOR = 0.1

/** Fraction of a candidate's pixels that must be interior blends on the A–B segment for it to be a blend band. */
const EXPLAINED_MIN = 0.8

/** Fewest pixels a candidate needs before the blend statistics are trusted. */
const MIN_CANDIDATE_PIXELS = 8

/**
 * Weight of color `a` against `b` for pixel `(pr, pg, pb)` and the squared sRGB
 * residual from the segment: the least-squares mixing weight `t = (P−b)·(a−b) /
 * |a−b|²` clamped to [0, 1], and `|P − (b + t(a−b))|²`. A rasterizer blends an
 * anti-aliased edge in encoded sRGB (SVG `color-interpolation: sRGB`, canvas,
 * Skia, Cairo), so the projection is exact in those same values — the identical
 * derivation as `@trazor/trace`'s `coverageOf`, here also returning the residual
 * the blend test needs. `t < 0` (colors coincide) reports no edge.
 */
function project(
  pr: number,
  pg: number,
  pb: number,
  ar: number,
  ag: number,
  ab: number,
  br: number,
  bg: number,
  bb: number,
): { t: number; resid2: number } {
  const dr = ar - br
  const dg = ag - bg
  const db = ab - bb
  const d2 = dr * dr + dg * dg + db * db
  if (d2 < 1) return { t: -1, resid2: Infinity }
  let t = ((pr - br) * dr + (pg - bg) * dg + (pb - bb) * db) / d2
  if (t < 0) t = 0
  else if (t > 1) t = 1
  const qr = br + t * dr
  const qg = bg + t * dg
  const qb = bb + t * db
  const er = pr - qr
  const eg = pg - qg
  const eb = pb - qb
  return { t, resid2: er * er + eg * eg + eb * eb }
}

/**
 * Dissolve labels that are anti-aliased blends of their two dominant neighbors,
 * reassigning each of their pixels to whichever neighbor its coverage favors.
 * Mutates and returns `labels`; the palette keeps its length (a dissolved label
 * simply owns no pixels). `paletteRgb` is the RGB bytes per label
 * (`labels.count * 3`). A no-op when there are fewer than three labels.
 */
export function absorbMixtureLabels(
  image: RasterImage,
  labels: LabelMap,
  paletteRgb: Uint8Array,
): LabelMap {
  const { width: w, height: h, data } = labels
  const k = labels.count
  const n = w * h
  if (k < 3 || n === 0) return labels
  const px = image.data

  // ---- pass 1: pixel counts, interior counts, and the label-adjacency matrix ----
  const total = new Uint32Array(k)
  const interior = new Uint32Array(k)
  const adj = new Uint32Array(k * k) // adj[L*k + m] = boundary adjacencies of L to m
  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      const i = row + x
      const l = data[i]
      if (l < 0 || l >= k) continue
      total[l]++
      let isInterior = true
      const base = l * k
      // Left/right/up/down neighbors: census the differing labels, note interior.
      if (x > 0) {
        const m = data[i - 1]
        if (m !== l) {
          isInterior = false
          if (m >= 0 && m < k) adj[base + m]++
        }
      }
      if (x < w - 1) {
        const m = data[i + 1]
        if (m !== l) {
          isInterior = false
          if (m >= 0 && m < k) adj[base + m]++
        }
      }
      if (y > 0) {
        const m = data[i - w]
        if (m !== l) {
          isInterior = false
          if (m >= 0 && m < k) adj[base + m]++
        }
      }
      if (y < h - 1) {
        const m = data[i + w]
        if (m !== l) {
          isInterior = false
          if (m >= 0 && m < k) adj[base + m]++
        }
      }
      if (isInterior) interior[l]++
    }
  }

  // ---- decide each candidate's two dominant neighbors from the adjacency row ----
  // dom[L] = A (favored, weight-1 side), dom2[L] = B, or -1 when L is not a candidate.
  const domA = new Int32Array(k).fill(-1)
  const domB = new Int32Array(k).fill(-1)
  for (let l = 0; l < k; l++) {
    if (total[l] < MIN_CANDIDATE_PIXELS) continue
    if (interior[l] >= INTERIOR_MAX * total[l]) continue // fills area → a real ink
    const base = l * k
    let a = -1
    let b = -1
    let aC = 0
    let bC = 0
    let sum = 0
    for (let m = 0; m < k; m++) {
      const c = adj[base + m]
      if (c === 0) continue
      sum += c
      if (c > aC || (c === aC && m < a)) {
        b = a
        bC = aC
        a = m
        aC = c
      } else if (c > bC || (c === bC && m < b)) {
        b = m
        bC = c
      }
    }
    if (a < 0 || b < 0 || sum === 0) continue
    if (aC + bC < NEIGHBOR_COVERAGE * sum) continue // borders more than two regions
    domA[l] = a
    domB[l] = b
  }

  // ---- pass 2: per-pixel blend evidence for each candidate ----
  const explained = new Uint32Array(k)
  for (let i = 0; i < n; i++) {
    const l = data[i]
    if (l < 0 || l >= k || domA[l] < 0) continue
    const a = domA[l]
    const b = domB[l]
    const p = i * 4
    const { t, resid2 } = project(
      px[p],
      px[p + 1],
      px[p + 2],
      paletteRgb[a * 3],
      paletteRgb[a * 3 + 1],
      paletteRgb[a * 3 + 2],
      paletteRgb[b * 3],
      paletteRgb[b * 3 + 1],
      paletteRgb[b * 3 + 2],
    )
    if (t < 0) continue
    if (resid2 <= RESID_MAX2 && t >= T_INTERIOR && t <= 1 - T_INTERIOR) explained[l]++
  }

  // ---- which candidates pass: a low-interior band of genuine mid-chord blends ----
  const dissolve = new Uint8Array(k)
  let any = false
  for (let l = 0; l < k; l++) {
    if (domA[l] < 0) continue
    if (explained[l] < EXPLAINED_MIN * total[l]) continue
    dissolve[l] = 1
    any = true
  }
  if (!any) return labels

  // ---- pass 3: split each dissolved label's pixels to the favored neighbor ----
  for (let i = 0; i < n; i++) {
    const l = data[i]
    if (l < 0 || l >= k || dissolve[l] === 0) continue
    const a = domA[l]
    const b = domB[l]
    const p = i * 4
    const { t } = project(
      px[p],
      px[p + 1],
      px[p + 2],
      paletteRgb[a * 3],
      paletteRgb[a * 3 + 1],
      paletteRgb[a * 3 + 2],
      paletteRgb[b * 3],
      paletteRgb[b * 3 + 1],
      paletteRgb[b * 3 + 2],
    )
    data[i] = t >= 0.5 ? a : b
  }
  return labels
}

/**
 * Squared sRGB distance (byte²) a seam pixel must keep from its own label's
 * color: the A–B blend explains it at least three times as well as that label
 * does (`RESID_MAX2` is 12², this is 36²), so a real line drawn in the label's
 * color — whose pixels carry that color — is never taken for a seam.
 */
const SEAM_FAR2 = 36 * 36

/** Longest run of a third label across an edge (px) that can be its anti-aliased seam. */
const SEAM_MAX_RUN = 2

/**
 * Hand a captured seam back to the two regions it separates. A priority flood
 * (or a nearest-color assignment) can give the anti-aliased seam between two
 * contrasting fills to a third region that reaches it from one end — its color
 * sits nearer the blend than either side's does — and that region then runs
 * along the seam as a line of the wrong color a pixel wide (orange between a
 * black cape and a cream outline). A run of at most `SEAM_MAX_RUN` pixels of
 * label C, across which the labels on either side are A and B (different, and
 * neither is C), is that seam when C's own color is a third color — off the
 * A–B blend segment by `SEAM_FAR2`; a tone between the two is an intermediate
 * ink whose thin stretches may be real, and the mixture pass owns it — and every
 * pixel of the run lies on the segment (`RESID_MAX2`), well inside it
 * (`T_INTERIOR`), and far from C's own color (`SEAM_FAR2`): the run's pixels go
 * to the two sides by its summed coverage, as the blend test in
 * {@link absorbMixtureLabels} splits a dissolved label.
 *
 * Mutates `labels`; `paletteRgb` is the RGB bytes per label. Returns the number
 * of pixels moved. Deterministic: the runs are read from the labels as they
 * were — rows first, then columns, a pixel keeping its first decision — and
 * the moves are applied after the scan.
 */
export function returnSeamPixels(
  image: RasterImage,
  labels: LabelMap,
  paletteRgb: Uint8Array,
): number {
  const { width: w, height: h, data } = labels
  const k = labels.count
  const n = w * h
  if (k < 3 || n === 0) return 0
  const px = image.data
  const target = new Int32Array(n).fill(-1)
  const weight = new Float64Array(SEAM_MAX_RUN)
  /** Pixel `i`'s weight of `a` against `b` when it is a seam blend far from `c`, else −1. */
  const blendOf = (i: number, a: number, b: number, c: number): number => {
    const p = i * 4
    const { t, resid2 } = project(
      px[p],
      px[p + 1],
      px[p + 2],
      paletteRgb[a * 3],
      paletteRgb[a * 3 + 1],
      paletteRgb[a * 3 + 2],
      paletteRgb[b * 3],
      paletteRgb[b * 3 + 1],
      paletteRgb[b * 3 + 2],
    )
    if (t < T_INTERIOR || t > 1 - T_INTERIOR || resid2 > RESID_MAX2) return -1
    const dr = px[p] - paletteRgb[c * 3]
    const dg = px[p + 1] - paletteRgb[c * 3 + 1]
    const db = px[p + 2] - paletteRgb[c * 3 + 2]
    return dr * dr + dg * dg + db * db >= SEAM_FAR2 ? t : -1
  }
  /** Whether label `c`'s own color is a third color, off the A–B blend segment. */
  const third = (a: number, b: number, c: number): boolean =>
    project(
      paletteRgb[c * 3],
      paletteRgb[c * 3 + 1],
      paletteRgb[c * 3 + 2],
      paletteRgb[a * 3],
      paletteRgb[a * 3 + 1],
      paletteRgb[a * 3 + 2],
      paletteRgb[b * 3],
      paletteRgb[b * 3 + 1],
      paletteRgb[b * 3 + 2],
    ).resid2 >= SEAM_FAR2
  // Rows (step 1), then columns (step w): a run starts right after its A pixel.
  for (const [step, span, lanes] of [
    [1, w, h],
    [w, h, w],
  ] as const) {
    for (let lane = 0; lane < lanes; lane++) {
      const first = step === 1 ? lane * w : lane
      for (let s = 1; s + 1 < span; s++) {
        const i = first + s * step
        const c = data[i]
        const a = data[i - step]
        if (c < 0 || a < 0 || a === c) continue
        for (let len = 1; len <= SEAM_MAX_RUN && s + len < span; len++) {
          const last = i + (len - 1) * step
          if (data[last] !== c) break
          const b = data[last + step]
          if (b === c) continue
          if (b < 0 || b === a || !third(a, b, c)) break
          let seam = true
          for (let j = 0; j < len && seam; j++) {
            weight[j] = blendOf(i + j * step, a, b, c)
            seam = weight[j] >= 0
          }
          if (!seam) break
          // The run splits once: its summed coverage by A, rounded, is how many
          // of its pixels (from the A side) go to A; the rest go to B.
          let cover = 0
          for (let j = 0; j < len; j++) cover += weight[j]
          const toA = Math.round(cover)
          for (let j = 0; j < len; j++) {
            const q = i + j * step
            if (target[q] < 0) target[q] = j < toA ? a : b
          }
          break
        }
      }
    }
  }
  let moved = 0
  for (let i = 0; i < n; i++) {
    if (target[i] < 0) continue
    data[i] = target[i]
    moved++
  }
  return moved
}

/** Mean width (px) — twice the area over the perimeter — up to which a region can be a blend band. */
const BAND_MAX_WIDTH = 6

/**
 * Least share of a band's border the two regions it runs between must hold
 * together, and the least share of that the lesser of the two must hold: a band
 * runs *between* its two neighbors, so it borders both along its length — a
 * spur that meets the second one only at its tip is not one.
 */
const BAND_SIDE_SHARE = 0.25

/**
 * Loosest distance of a band pixel from the A–B blend segment, as a share of
 * the segment's length, that still reads as a blend. A compressed source keeps
 * its lightness edge sharp but smears the chroma across it (chroma subsampling),
 * so an anti-aliased pixel of a saturated edge sits off the segment by up to a
 * fifth of the contrast across it — the band's mean, where those errors cancel,
 * is held to `BAND_MEAN_RESID2` instead.
 */
const BAND_RESID_SHARE = 0.2

/**
 * Squared sRGB distance (byte²) of the band's mean color from the A–B blend
 * segment up to which the band is a blend of the two. A stroke drawn in a color
 * of its own (a neutral gray strap between a blue and a black) sits off the
 * segment by more, on every pixel alike.
 */
const BAND_MEAN_RESID2 = 20 * 20

/** Share of a band's pixels that must lie on the A–B blend segment (within `BAND_RESID_SHARE`). */
const BAND_EXPLAINED = 0.7

/**
 * Least spread of a band's coverage (its 80th less its 20th percentile) for a
 * band thicker than a hair to read as a ramp across it: a blend band covers a
 * stretch of the ramp between its neighbors, a stroke drawn in an intermediate
 * color holds one level.
 */
const BAND_RAMP_SPREAD = 0.2

/**
 * Largest share of flat pixels (the segmenter's markers) a band thicker than a
 * hair may hold: a flat core is a stroke painted in that color, while a blend
 * band has none, or the odd pixel of it where compression flattened the ramp.
 */
const BAND_FLAT_SHARE = 0.05

/**
 * Passes over the regions: a band's pixels can go to a neighbor that was a band
 * itself, left for the next pass to settle.
 */
const BAND_ROUNDS = 2

/**
 * Dissolve thin blend bands into the two regions they run between. A soft edge
 * between two contrasting fills — a blurred outline, a downscaled or compressed
 * one — spans several pixels, and a region seeded inside that ramp (a few of
 * its pixels flat enough to be a marker) grows along it as a band of the blend
 * color: a rosy line between an orange field and a blue outline, a salmon rim
 * around every orange shape on white. Such a band is no area of the drawing —
 * each of its pixels is a coverage-weighted blend of the two fills (inkvec's
 * ink-idea test) — so every pixel goes to the fill its coverage favors.
 *
 * A region component (4-connected) is such a band when it is thin (mean width
 * at most `BAND_MAX_WIDTH`), runs between two other regions A and B (together
 * holding `NEIGHBOR_COVERAGE` of its border, the lesser `BAND_SIDE_SHARE` of
 * that), its mean color lies well inside the A–B blend segment (`T_INTERIOR`,
 * `BAND_MEAN_RESID2`) and `BAND_EXPLAINED` of its pixels are blends too. A hair
 * — nowhere three pixels thick — goes on that alone; a thicker band must also
 * read as a ramp across it (`BAND_RAMP_SPREAD`) with no flat core
 * (`BAND_FLAT_SHARE`), so a stroke drawn in an intermediate color is kept. A
 * line within one field, or one whose color is off the segment (a dark outline
 * between two colors), is never touched.
 *
 * Mutates `labels`; `paletteRgb` is the RGB bytes per label, `gradient` the
 * segmenter's per-pixel gradient magnitude and `flatThreshold` its marker bound.
 * Returns the number of pixels moved. Deterministic: each pass decides every
 * component on the labels as they were and applies the moves after the scan.
 */
export function dissolveBlendBands(
  image: RasterImage,
  labels: LabelMap,
  paletteRgb: Uint8Array,
  gradient: Float32Array,
  flatThreshold: number,
): number {
  let moved = 0
  for (let round = 0; round < BAND_ROUNDS; round++) {
    const m = dissolveBandsOnce(image, labels, paletteRgb, gradient, flatThreshold)
    if (m === 0) break
    moved += m
  }
  return moved
}

/** One pass of {@link dissolveBlendBands}. */
function dissolveBandsOnce(
  image: RasterImage,
  labels: LabelMap,
  paletteRgb: Uint8Array,
  gradient: Float32Array,
  flatThreshold: number,
): number {
  const { width: w, height: h, data } = labels
  const k = labels.count
  const n = w * h
  if (k < 3 || n === 0) return 0
  const px = image.data
  const seen = new Uint8Array(n)
  const members = new Int32Array(n)
  const ts = new Float64Array(n)
  const target = new Int32Array(n).fill(-1)
  const sides = new Uint32Array(k)
  const touched = new Int32Array(k)
  const isBlock = (p: number, c: number): boolean => {
    const x = p % w
    const y = (p - x) / w
    for (let dy = -1; dy <= 1; dy++) {
      const yy = y + dy
      if (yy < 0 || yy >= h) continue
      for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx
        if (xx >= 0 && xx < w && data[yy * w + xx] !== c) return false
      }
    }
    return true
  }
  for (let s = 0; s < n; s++) {
    const c = data[s]
    if (c < 0 || seen[s] !== 0) continue
    // The component: its pixels, its border length, and the labels across that border.
    let len = 0
    let head = 0
    members[len++] = s
    seen[s] = 1
    let per = 0
    let touchedN = 0
    while (head < len) {
      const p = members[head++]
      const x = p % w
      for (let dir = 0; dir < 4; dir++) {
        let q: number
        if (dir === 0) q = x > 0 ? p - 1 : -1
        else if (dir === 1) q = x < w - 1 ? p + 1 : -1
        else if (dir === 2) q = p >= w ? p - w : -1
        else q = p < n - w ? p + w : -1
        if (q >= 0 && data[q] === c) {
          if (seen[q] === 0) {
            seen[q] = 1
            members[len++] = q
          }
          continue
        }
        per++
        const l = q >= 0 ? data[q] : -1
        if (l < 0) continue
        if (sides[l] === 0) touched[touchedN++] = l
        sides[l]++
      }
    }
    // The two regions it runs between (most border first, lower label on a tie).
    let a = -1
    let b = -1
    let total = 0
    for (let j = 0; j < touchedN; j++) {
      const l = touched[j]
      const v = sides[l]
      total += v
      if (a < 0 || v > sides[a] || (v === sides[a] && l < a)) {
        b = a
        a = l
      } else if (b < 0 || v > sides[b] || (v === sides[b] && l < b)) {
        b = l
      }
    }
    const sa = a >= 0 ? sides[a] : 0
    const sb = b >= 0 ? sides[b] : 0
    for (let j = 0; j < touchedN; j++) sides[touched[j]] = 0
    if (2 * len > BAND_MAX_WIDTH * per || b < 0) continue
    if (sa + sb < NEIGHBOR_COVERAGE * total || sb < BAND_SIDE_SHARE * (sa + sb)) continue
    const ar = paletteRgb[a * 3]
    const ag = paletteRgb[a * 3 + 1]
    const ab = paletteRgb[a * 3 + 2]
    const br = paletteRgb[b * 3]
    const bg = paletteRgb[b * 3 + 1]
    const bb = paletteRgb[b * 3 + 2]
    let sumR = 0
    let sumG = 0
    let sumB = 0
    for (let j = 0; j < len; j++) {
      const o = members[j] * 4
      sumR += px[o]
      sumG += px[o + 1]
      sumB += px[o + 2]
    }
    const mean = project(sumR / len, sumG / len, sumB / len, ar, ag, ab, br, bg, bb)
    if (mean.t < T_INTERIOR || mean.t > 1 - T_INTERIOR || mean.resid2 > BAND_MEAN_RESID2) continue
    const dr = ar - br
    const dg = ag - bg
    const db = ab - bb
    const bar2 = Math.max(
      RESID_MAX2,
      BAND_RESID_SHARE * BAND_RESID_SHARE * (dr * dr + dg * dg + db * db),
    )
    let explained = 0
    let flat = 0
    let hair = true
    for (let j = 0; j < len; j++) {
      const p = members[j]
      const o = p * 4
      const { t, resid2 } = project(px[o], px[o + 1], px[o + 2], ar, ag, ab, br, bg, bb)
      ts[j] = t
      if (resid2 <= bar2 && t >= T_INTERIOR && t <= 1 - T_INTERIOR) explained++
      if (gradient[p] < flatThreshold) flat++
      if (hair && isBlock(p, c)) hair = false
    }
    if (explained < BAND_EXPLAINED * len) continue
    if (!hair) {
      if (flat > BAND_FLAT_SHARE * len) continue
      const sorted = ts.subarray(0, len).toSorted()
      const spread = sorted[Math.floor(0.8 * (len - 1))] - sorted[Math.floor(0.2 * (len - 1))]
      if (spread < BAND_RAMP_SPREAD) continue
    }
    for (let j = 0; j < len; j++) target[members[j]] = ts[j] >= 0.5 ? a : b
  }
  let moved = 0
  for (let i = 0; i < n; i++) {
    if (target[i] < 0) continue
    data[i] = target[i]
    moved++
  }
  return moved
}
