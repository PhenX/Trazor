/**
 * Blend absorption with transparency carried natively: the two blend passes of
 * `regions.ts` in four channels, each pixel and ink as `[W, a]` — its color over white
 * (encoded sRGB in [0, 1]) and its alpha. That pair is an invertible transform of
 * premultiplied RGBA (`W = P + (1 − a)`), so an anti-aliased pixel between two inks, between
 * an ink and the clear ground, or at a junction of both is still a straight-line blend of
 * them in all four channels; the residual is a Euclidean distance over color and alpha. The
 * clear ground {@link CLEAR} takes the white backdrop's place as the pseudo-ink a
 * translucent pixel is partly made of.
 *
 * The tests, tolerance, rounds and tie-breaks are those of `absorbBlendSlivers` and
 * `reassignBlendPixels`; what differs is the four channels, {@link CLEAR} for the backdrop,
 * and that it joins the candidates when a pixel is translucent and no candidate is already
 * clear (`a < 0.005`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/native.rs` (`CLEAR`, `rgba_w`,
 * `ink_rgba_w`, `mixture`, `absorb_blend_slivers`, `absorb_sliver`,
 * `reassign_blend_pixels`).
 */
import {
  ABSORB_ROUNDS,
  ContactTally,
  REASSIGN_ROUNDS,
  TRANSLUCENT_ALPHA,
  blendCandidates,
  blendTolerance,
  labelBound,
  mixture,
  relabelRounds,
  sliverRound,
  tallyContacts,
} from './regions'
import type { Mixture } from './regions'

/** Single-precision rounding: the blend passes compute in inkvec's `f32`. */
const F = Math.fround

/** The clear ground as `[W, a]`: white over white, at zero opacity. */
export const CLEAR: readonly [number, number, number, number] = [1, 1, 1, 0]

/** Alpha below which a candidate ink is already the clear ground (compared as `f32`). */
export const CLEAR_CANDIDATE_ALPHA = 0.005

/**
 * Each pixel as `[W, a]`: its color over white from `rgb` (three per pixel) and its alpha
 * clamped to [0, 1] (1 everywhere when `alpha` is null).
 */
export function rgbaW(rgb: Float32Array, alpha: Float32Array | null, n: number): Float32Array {
  const px = new Float32Array(n * 4)
  for (let p = 0; p < n; p++) {
    px[p * 4] = rgb[p * 3]
    px[p * 4 + 1] = rgb[p * 3 + 1]
    px[p * 4 + 2] = rgb[p * 3 + 2]
    px[p * 4 + 3] = alpha === null ? 1 : Math.min(1, Math.max(0, alpha[p]))
  }
  return px
}

/**
 * Each palette entry as `[W, a]`: its color over white (`inkRgb`, three per ink) and its
 * opacity (`inkAlpha`, 1 when null or past its end).
 */
export function inkRgbaW(inkRgb: Float64Array, inkAlpha: ArrayLike<number> | null): Float64Array {
  const k = Math.floor(inkRgb.length / 3)
  const inks = new Float64Array(k * 4)
  for (let i = 0; i < k; i++) {
    inks[i * 4] = inkRgb[i * 3]
    inks[i * 4 + 1] = inkRgb[i * 3 + 1]
    inks[i * 4 + 2] = inkRgb[i * 3 + 2]
    inks[i * 4 + 3] = inkAlpha !== null && i < inkAlpha.length ? inkAlpha[i] : 1
  }
  return inks
}

/** Copy ink `l` of `inks` (`[W, a]`) into slot `k` of `cols`. */
function putInk(cols: Float64Array, k: number, inks: ArrayLike<number>, l: number): void {
  for (let m = 0; m < 4; m++) cols[k * 4 + m] = F(inks[l * 4 + m])
}

/**
 * Four-channel `absorbBlendSlivers`: dissolve thin components that are blends of their
 * dominant neighbors, with `px` and `inks` as `[W, a]` ({@link rgbaW}, {@link inkRgbaW}).
 * Same thin / few-inks / blend tests, tolerance and two rounds; {@link CLEAR} joins the
 * candidates when a pixel of the sliver is translucent (`a < 0.99`) and no candidate is
 * already clear. On success each pixel moves to the dominant ink of its nearest mixture;
 * where the clear ink dominates, to the dominant real ink (or the most-touched neighbor
 * when the real inks have no mixture). Returns the number of components absorbed.
 */
export function absorbBlendSliversNative(
  labels: Int32Array,
  px: Float32Array,
  w: number,
  h: number,
  inks: Float64Array,
  sigmaNoise: number,
): number {
  const inkCount = Math.floor(inks.length / 4)
  const tol = blendTolerance(sigmaNoise)
  const top = new Int32Array(3)
  const cols = new Float64Array(4 * 4)
  const dest = new Int32Array(w * h)
  const mix: Mixture = { r: 0, who: -1 }
  let absorbed = 0
  for (let round = 0; round < ABSORB_ROUNDS; round++) {
    const { comps, thin } = sliverRound(labels, w, h)
    const tally = new ContactTally(labelBound(labels, inkCount))
    let changed = 0
    for (let id = 0; id < comps.count; id++) {
      const from = thin.offset[id]
      const to = thin.offset[id + 1]
      if (from === to) continue
      const pixels = thin.pixels
      const area = to - from
      const { interior, foreign } = tallyContacts(
        pixels,
        from,
        to,
        id,
        comps.comp,
        labels,
        w,
        h,
        tally,
      )
      if (interior * 5 >= area || foreign === 0) continue
      const nTop = tally.top(3, top)
      let covered = 0
      for (let k = 0; k < nTop; k++) covered += tally.count[top[k]]
      if (covered * 5 < foreign * 4) continue
      let colored = nTop >= 2
      for (let k = 0; k < nTop; k++) if (top[k] >= inkCount) colored = false
      if (!colored) continue
      let hasClear = false
      for (let k = 0; k < nTop; k++) {
        putInk(cols, k, inks, top[k])
        if (cols[k * 4 + 3] < F(CLEAR_CANDIDATE_ALPHA)) hasClear = true
      }
      let k = nTop
      let clear = -1
      if (!hasClear) {
        let translucent = false
        for (let m = from; m < to; m++) {
          if (px[pixels[m] * 4 + 3] < TRANSLUCENT_ALPHA) {
            translucent = true
            break
          }
        }
        if (translucent) {
          putInk(cols, k, CLEAR, 0)
          clear = k++
        }
      }
      let pass = 0
      for (let m = from; m < to; m++) {
        const p = pixels[m]
        if (!mixture(px, p * 4, cols, k, 4, mix)) {
          dest[m - from] = labels[p]
          continue
        }
        if (mix.r <= tol) pass++
        if (mix.who !== clear) dest[m - from] = top[mix.who]
        else dest[m - from] = mixture(px, p * 4, cols, k - 1, 4, mix) ? top[mix.who] : top[0]
      }
      if (pass * 5 < area * 4) continue
      for (let m = from; m < to; m++) labels[pixels[m]] = dest[m - from]
      changed++
    }
    absorbed += changed
    if (changed === 0) break
  }
  return absorbed
}

/**
 * Four-channel `reassignBlendPixels`: move a pixel to the dominant ink of its nearest
 * mixture of its own and up to three neighboring inks when the residual is within the blend
 * tolerance and under half its distance to its own ink, with `[W, a]` pixels and inks and
 * {@link CLEAR} as the backdrop pseudo-ink (joining when the pixel is translucent and no
 * candidate is already clear). Up to four snapshot rounds. Returns the number of moves.
 */
export function reassignBlendPixelsNative(
  labels: Int32Array,
  px: Float32Array,
  w: number,
  h: number,
  inks: Float64Array,
  sigmaNoise: number,
): number {
  const inkCount = Math.floor(inks.length / 4)
  const tol = blendTolerance(sigmaNoise)
  const labs = new Int32Array(4)
  const keep = new Int32Array(5)
  const cols = new Float64Array(5 * 4)
  const mix: Mixture = { r: 0, who: -1 }
  const decide = (snap: Int32Array, p: number): number => {
    const own = snap[p]
    const nl = blendCandidates(snap, p, w, h, labs)
    if (nl < 2 || own >= inkCount) return -1
    const at = p * 4
    let own2 = 0
    for (let m = 0; m < 4; m++) {
      const e = F(px[at + m] - F(inks[own * 4 + m]))
      own2 = F(own2 + F(e * e))
    }
    const residOwn = F(Math.sqrt(own2))
    let k = 0
    let hasClear = false
    for (let s = 0; s < nl; s++) {
      const l = labs[s]
      if (l >= inkCount) continue
      putInk(cols, k, inks, l)
      if (cols[k * 4 + 3] < F(CLEAR_CANDIDATE_ALPHA)) hasClear = true
      keep[k++] = l
    }
    if (px[at + 3] < TRANSLUCENT_ALPHA && !hasClear) {
      putInk(cols, k, CLEAR, 0)
      keep[k++] = -1
    }
    if (!mixture(px, at, cols, k, 4, mix)) return -1
    const r = mix.r
    let target = keep[mix.who]
    if (target < 0) {
      if (!mixture(px, at, cols, k - 1, 4, mix)) return -1
      target = keep[mix.who]
    }
    return target !== own && r <= tol && r < 0.5 * residOwn ? target : -1
  }
  return relabelRounds(labels, w, h, REASSIGN_ROUNDS, decide)
}
