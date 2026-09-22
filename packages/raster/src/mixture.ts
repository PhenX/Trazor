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
