/**
 * Which pixels testify about a region's fill, and which are blends towards a
 * neighbor's ink. After blend absorption every anti-aliased pixel carries the
 * label of the ink it is mostly made of, so the label map cannot say which
 * pixels are pure; fitted as evidence, a wedge tip of blends buys a radial
 * gradient on a solid black shape.
 *
 * A pixel is a blend when its color lies on the segment from its own ink `a` to
 * the ink `b` of another label within two pixels of it (the 5×5 window), within
 * the noise: with `d = c − a`, `e = b − a`, `t = (d·e)/|e|²`, the pixel blends
 * towards `b` when `0 < t < 1` and `|d − t·e| ≤ tol`, `tol = max(3·σ·√3, 2/255)`
 * (`σ·√3` is the per-channel noise's Euclidean size over three channels). A
 * pixel within `tol` of its own ink is pure without looking further. All in
 * encoded sRGB, in single precision as inkvec computes it.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/gradient/evidence.rs`
 * (`fill_evidence`, `blend_partners`, `PURE`, `FOREIGN`, `PARTNERS`) and
 * `gradient/regions.rs` (`all_inside`).
 */

/** {@link blendPartners}' mark for a pixel that is evidence for its own fill, and for an unused slot. */
export const PURE = 0xffffffff
/** {@link blendPartners}' mark for a pixel with more blend partners than it records. */
export const FOREIGN = 0xfffffffe
/** Most blend partners recorded per pixel. */
export const PARTNERS = 3

const fr = Math.fround
const F_LEN2_FLOOR = fr(1e-9)

/** Squared length of a single-precision 3-vector, summed in single precision. */
function norm2(x: number, y: number, z: number): number {
  return fr(fr(fr(x * x) + fr(y * y)) + fr(z * z))
}

/**
 * For each pixel (three slots per pixel): `PURE` in every slot when it is
 * evidence for its own fill, otherwise the indices of the neighboring pixels
 * (one per neighboring label) whose label's ink it lies on the segment to —
 * only the first unless `all` — and `FOREIGN` in every slot when there are more
 * than {@link PARTNERS}.
 *
 * `rgb` is the image over white (encoded sRGB, three per pixel), `labels` one ink
 * index per pixel, `inkRgb` three per ink. Each other label is tried at the
 * first pixel of it met in raster order within the window (the first eight
 * distinct labels are remembered, so a ninth may be tried again); a label
 * without an ink (negative or past `inkRgb`) and an ink equal to `a` are
 * skipped, and a pixel whose own label has no ink stays pure.
 */
export function blendPartners(
  rgb: Float32Array,
  w: number,
  h: number,
  labels: ArrayLike<number>,
  inkRgb: ArrayLike<number>,
  sigmaNoise: number,
  all: boolean,
): Uint32Array {
  const n = w * h
  const nInk = Math.floor(inkRgb.length / 3)
  const ink = Float32Array.from(inkRgb)
  const tol = fr(Math.max(3 * sigmaNoise * Math.sqrt(3), 2 / 255))
  const tol2 = fr(tol * tol)
  const out = new Uint32Array(3 * n).fill(PURE)
  const seen = new Int32Array(8)
  const blend = new Uint32Array(PARTNERS)
  for (let p = 0; p < n; p++) {
    const l = labels[p]
    if (l < 0 || l >= nInk) continue
    const a0 = ink[3 * l]
    const a1 = ink[3 * l + 1]
    const a2 = ink[3 * l + 2]
    const da0 = fr(rgb[3 * p] - a0)
    const da1 = fr(rgb[3 * p + 1] - a1)
    const da2 = fr(rgb[3 * p + 2] - a2)
    if (norm2(da0, da1, da2) <= tol2) continue
    const x = p % w
    const y = (p - x) / w
    const x0 = Math.max(x - 2, 0)
    const x1 = Math.min(x + 2, w - 1)
    const y0 = Math.max(y - 2, 0)
    const y1 = Math.min(y + 2, h - 1)
    let nSeen = 0
    blend.fill(PURE)
    let k = 0
    scan: for (let yy = y0; yy <= y1; yy++) {
      for (let xx = x0; xx <= x1; xx++) {
        const m = labels[yy * w + xx]
        if (m === l || m < 0 || m >= nInk) continue
        let known = false
        for (let i = 0; i < nSeen; i++) {
          if (seen[i] === m) {
            known = true
            break
          }
        }
        if (known) continue
        if (nSeen < seen.length) seen[nSeen++] = m
        const ab0 = fr(ink[3 * m] - a0)
        const ab1 = fr(ink[3 * m + 1] - a1)
        const ab2 = fr(ink[3 * m + 2] - a2)
        const len2 = norm2(ab0, ab1, ab2)
        if (len2 <= F_LEN2_FLOOR) continue
        const t = fr(fr(fr(fr(da0 * ab0) + fr(da1 * ab1)) + fr(da2 * ab2)) / len2)
        if (t <= 0 || t >= 1) continue
        const perp2 = norm2(fr(da0 - fr(t * ab0)), fr(da1 - fr(t * ab1)), fr(da2 - fr(t * ab2)))
        if (perp2 <= tol2) {
          if (k === PARTNERS) {
            blend.fill(FOREIGN)
            break scan
          }
          blend[k++] = yy * w + xx
          if (!all) break scan
        }
      }
    }
    out[3 * p] = blend[0]
    out[3 * p + 1] = blend[1]
    out[3 * p + 2] = blend[2]
  }
  return out
}

/** Per pixel, 1 when it is evidence for its own fill ({@link blendPartners} finds no partner), else 0. */
export function fillEvidence(
  rgb: Float32Array,
  w: number,
  h: number,
  labels: ArrayLike<number>,
  inkRgb: ArrayLike<number>,
  sigmaNoise: number,
): Uint8Array {
  const partners = blendPartners(rgb, w, h, labels, inkRgb, sigmaNoise, false)
  const out = new Uint8Array(w * h)
  for (let p = 0; p < out.length; p++) out[p] = partners[3 * p] === PURE ? 1 : 0
  return out
}

/**
 * Whether every recorded blend partner of pixel `p` satisfies `inside`: a blend
 * testifies for a fit only when nothing outside the fit could have made it. A
 * pixel with more partners than recorded ({@link FOREIGN}) never does; a pure
 * pixel trivially does.
 */
export function partnersInside(
  partners: Uint32Array,
  p: number,
  inside: (q: number) => boolean,
): boolean {
  if (partners[3 * p] === FOREIGN) return false
  for (let i = 0; i < PARTNERS; i++) {
    const q = partners[3 * p + i]
    if (q === PURE) break
    if (!inside(q)) return false
  }
  return true
}
