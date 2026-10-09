/**
 * Rare-ink evidence for the region merge: a small region is an ink of its own
 * when enough of its pixels are colors no mixture of the regions around them
 * explains.
 *
 * The size term of the region merge (Nock & Nielsen 2004) lets a small region
 * fold into a neighbor whose color is far from its own, which is right for an
 * anti-aliased sliver (a blend of the two regions it sits between) and wrong
 * for a pupil, a red mouth or a yellow star a few pixels across. A pixel votes
 * for its region only when the regions already around it cannot explain it,
 * which is Aksoy et al.'s rule for growing a color model; the local model is
 * the two-color edge mixture of Yang et al. widened to three. A region whose
 * votes reach the floor is represented, and the merge keeps it apart from a
 * neighbor it is visibly different from.
 *
 * Method from: Y. Aksoy, T. O. Aydın, A. Smolić, M. Pollefeys, "Unmixing-Based
 * Soft Color Segmentation for Image Manipulation", ACM TOG 36(2), 2017, §5.
 * Inspired by: L. Yang, P. V. Sander, J. Lawrence, H. Hoppe, "Antialiasing
 * Recovery", ACM TOG 30(3), 2011.
 * After inkvec (Apache-2.0): `crates/inkvec-trace/src/color/represent.rs`
 * (`unexplained`, `overshoot_residual`, `represented`) and
 * `crates/inkvec-trace/src/native.rs` (`mixture`).
 */

/** Most regions around a pixel that its mixture is drawn from. */
export const MIX_INKS = 4

/** Fewest votes, in source pixels, that make a region represented at any image size. */
export const MIN_VOTES = 8

/** Votes as a share of the image that make a region represented: MIN_VOTES at 128². */
export const VOTE_SHARE = MIN_VOTES / 16384

/**
 * Residual, in encoded sRGB units, above which a pixel is not explained by the
 * colors around it (inkvec's `max(3σ, 0.025)` at its noise floor).
 */
export const MIXTURE_TOLERANCE = 0.025

/**
 * Distance, in encoded sRGB units, within which a pixel of a region is its ink
 * (inkvec counts only the pixels of the colors a candidate claims): twice the
 * mixture tolerance, room for a compressed flat's noise.
 */
export const CLAIM_TOLERANCE = 0.05

/** How far, as a share of the step, resampling overshoots an edge. */
export const OVERSHOOT = 0.15

/**
 * Distance from `c` to the nearest convex mixture of two or three of the
 * colors in `cols` (`k` of them, three channels each, packed): segments by
 * clamped projection, triangles by the 2×2 normal equations with only interior
 * solutions offered. Infinite with fewer than two colors or when every pair
 * and triple is degenerate.
 */
export function mixtureResidual(c: ArrayLike<number>, cols: Float64Array, k: number): number {
  let best = Infinity
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let uu = 0
      let wu = 0
      for (let m = 0; m < 3; m++) {
        const u = cols[j * 3 + m] - cols[i * 3 + m]
        uu += u * u
        wu += (c[m] - cols[i * 3 + m]) * u
      }
      if (uu < 1e-12) continue
      const t = Math.min(1, Math.max(0, wu / uu))
      let d2 = 0
      for (let m = 0; m < 3; m++) {
        const q = cols[i * 3 + m] + (cols[j * 3 + m] - cols[i * 3 + m]) * t
        d2 += (c[m] - q) * (c[m] - q)
      }
      if (d2 < best) best = d2
    }
  }
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      for (let e = j + 1; e < k; e++) {
        let uu = 0
        let vv = 0
        let uv = 0
        let wu = 0
        let wv = 0
        for (let m = 0; m < 3; m++) {
          const a = cols[i * 3 + m]
          const u = cols[j * 3 + m] - a
          const v = cols[e * 3 + m] - a
          const w = c[m] - a
          uu += u * u
          vv += v * v
          uv += u * v
          wu += w * u
          wv += w * v
        }
        const det = uu * vv - uv * uv
        if (Math.abs(det) < 1e-12) continue
        const s = (vv * wu - uv * wv) / det
        const t = (uu * wv - uv * wu) / det
        if (s < 0 || t < 0 || s + t > 1) continue
        let d2 = 0
        for (let m = 0; m < 3; m++) {
          const a = cols[i * 3 + m]
          const q = a + (cols[j * 3 + m] - a) * s + (cols[e * 3 + m] - a) * t
          d2 += (c[m] - q) * (c[m] - q)
        }
        if (d2 < best) best = d2
      }
    }
  }
  return Math.sqrt(best)
}

/**
 * The residual of `c` as resampling overshoot of the colors around it: the
 * distance to a chord between two of them extended by up to {@link OVERSHOOT}
 * of its length past either end (ringing at an edge between two opaque inks),
 * or to one of them scaled by up to `1 + OVERSHOOT` (an opaque rim resized
 * premultiplied over a clear ground). Infinite with no colors.
 */
export function overshootResidual(c: ArrayLike<number>, cols: Float64Array, k: number): number {
  let best = Infinity
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      let uu = 0
      let wu = 0
      for (let m = 0; m < 3; m++) {
        const u = cols[j * 3 + m] - cols[i * 3 + m]
        uu += u * u
        wu += (c[m] - cols[i * 3 + m]) * u
      }
      if (uu < 1e-12) continue
      const t = Math.min(1 + OVERSHOOT, Math.max(-OVERSHOOT, wu / uu))
      let d2 = 0
      for (let m = 0; m < 3; m++) {
        const q = cols[i * 3 + m] + (cols[j * 3 + m] - cols[i * 3 + m]) * t
        d2 += (c[m] - q) * (c[m] - q)
      }
      if (d2 < best) best = d2
    }
  }
  for (let i = 0; i < k; i++) {
    let ss = 0
    let vs = 0
    for (let m = 0; m < 3; m++) {
      ss += cols[i * 3 + m] * cols[i * 3 + m]
      vs += c[m] * cols[i * 3 + m]
    }
    if (ss < 1e-12) continue
    const kk = Math.min(1 + OVERSHOOT, Math.max(1, vs / ss))
    let d2 = 0
    for (let m = 0; m < 3; m++) {
      const q = cols[i * 3 + m] * kk
      d2 += (c[m] - q) * (c[m] - q)
    }
    if (d2 < best) best = d2
  }
  return Math.sqrt(best)
}

/**
 * The neighborhood a pixel's surrounding colors are read from: every pixel
 * within two of it (5 × 5), row by row. Two pixels reach across an
 * anti-aliased rim a region of its own has claimed, so each rim pixel sees
 * both colors it blends.
 */
const NEIGHBORS: readonly (readonly [number, number])[] = (() => {
  const out: [number, number][] = []
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx || dy) out.push([dx, dy])
  return out
})()

/**
 * Which regions are represented: for every region a candidate (`candidate[r]`
 * set), each pixel it claims — within {@link CLAIM_TOLERANCE} of the region's
 * own color, its ink; the rim the region grew over holds blends, which are no
 * evidence — votes when its color (of the image composited over
 * white, `rgba`, read as encoded sRGB in [0, 1]) is explained neither by
 * the nearest mixture of the colors of the {@link MIX_INKS} regions most
 * frequent within two pixels of it (ties to the lower region; white joins them
 * when a neighbor is outside the mask, the ground a transparent pixel blends
 * with) nor as their overshoot, by more than {@link MIXTURE_TOLERANCE}; a pixel
 * with no neighbor of another region compares against nothing and votes. The
 * region is represented when its votes reach `max(MIN_VOTES·scale², VOTE_SHARE·n)`
 * — the same evidence at any resolution, counted in source pixels for a
 * supersampled image. `regionRgb` holds each region's color, three per region.
 * The result also carries each represented region's evidence: the mean color of
 * its voting pixels (encoded sRGB in [0, 1], three per region), the ink its
 * votes are for — a region that also holds blends of its rim has a mean color
 * between its ink and its neighbors'. Fixed scan order: deterministic.
 */
export function representedRegions(
  rgba: Uint8ClampedArray,
  region: Int32Array,
  w: number,
  h: number,
  regionRgb: Float64Array,
  candidate: Uint8Array,
  scale: number,
): { represented: Uint8Array; evidence: Float64Array } {
  const n = w * h
  const regionCount = candidate.length
  const votes = new Float64Array(regionCount)
  const evidence = new Float64Array(regionCount * 3)
  const ids = new Int32Array(NEIGHBORS.length)
  const counts = new Int32Array(NEIGHBORS.length)
  const cols = new Float64Array((MIX_INKS + 1) * 3)
  const px = new Float64Array(3)
  for (let p = 0; p < n; p++) {
    const r = region[p]
    if (r < 0 || candidate[r] === 0) continue
    const cr = rgba[p * 4] / 255 - regionRgb[r * 3]
    const cg = rgba[p * 4 + 1] / 255 - regionRgb[r * 3 + 1]
    const cb = rgba[p * 4 + 2] / 255 - regionRgb[r * 3 + 2]
    if (cr * cr + cg * cg + cb * cb > CLAIM_TOLERANCE * CLAIM_TOLERANCE) continue
    const y = (p / w) | 0
    const x = p - y * w
    let k = 0
    let outside = false
    for (const [dx, dy] of NEIGHBORS) {
      const nx = x + dx
      const ny = y + dy
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue
      const q = region[ny * w + nx]
      if (q === r) continue
      if (q < 0) {
        outside = true
        continue
      }
      let found = false
      for (let s = 0; s < k; s++) {
        if (ids[s] === q) {
          counts[s]++
          found = true
          break
        }
      }
      if (!found) {
        ids[k] = q
        counts[k] = 1
        k++
      }
    }
    // Most frequent first, ties to the lower region id.
    for (let a = 1; a < k; a++) {
      const id = ids[a]
      const c = counts[a]
      let b = a - 1
      while (b >= 0 && (counts[b] < c || (counts[b] === c && ids[b] > id))) {
        ids[b + 1] = ids[b]
        counts[b + 1] = counts[b]
        b--
      }
      ids[b + 1] = id
      counts[b + 1] = c
    }
    const take = Math.min(k, MIX_INKS)
    for (let s = 0; s < take; s++) {
      cols[s * 3] = regionRgb[ids[s] * 3]
      cols[s * 3 + 1] = regionRgb[ids[s] * 3 + 1]
      cols[s * 3 + 2] = regionRgb[ids[s] * 3 + 2]
    }
    let m = take
    if (outside) {
      cols[m * 3] = 1
      cols[m * 3 + 1] = 1
      cols[m * 3 + 2] = 1
      m++
    }
    px[0] = rgba[p * 4] / 255
    px[1] = rgba[p * 4 + 1] / 255
    px[2] = rgba[p * 4 + 2] / 255
    let resid: number
    if (m === 0) resid = Infinity
    else if (m === 1) resid = Math.hypot(px[0] - cols[0], px[1] - cols[1], px[2] - cols[2])
    else resid = mixtureResidual(px, cols, m)
    if (resid > MIXTURE_TOLERANCE && overshootResidual(px, cols, m) > MIXTURE_TOLERANCE) {
      votes[r]++
      evidence[r * 3] += px[0]
      evidence[r * 3 + 1] += px[1]
      evidence[r * 3 + 2] += px[2]
    }
  }
  const area = scale * scale
  const floor = Math.max(MIN_VOTES, (VOTE_SHARE * n) / area)
  const represented = new Uint8Array(regionCount)
  for (let r = 0; r < regionCount; r++) {
    if (votes[r] > 0) {
      evidence[r * 3] /= votes[r]
      evidence[r * 3 + 1] /= votes[r]
      evidence[r * 3 + 2] /= votes[r]
    }
    if (votes[r] / area >= floor) represented[r] = 1
  }
  return { represented, evidence }
}
