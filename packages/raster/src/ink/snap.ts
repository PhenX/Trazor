/**
 * One artist ink, one color: flat faces of one ink whose fitted colors differ by less than a
 * viewer could see are painted one color, the color of the ink's best-evidenced face.
 *
 * The palette decides the inks; the fills are fitted later, per face, from pixels, and a flat
 * face with an interior keeps the median of its own interior. That is right for a real plateau
 * and leaves two faces of one ink a level or two apart. So, after the fills exist and before
 * the boundary stages read them:
 * 1. **each ink's color** is the fill of its *representative face*: the flat face of that ink
 *    with the most strictly interior pixels (off the picture edge, all four neighbors in the
 *    face) whose fill is within {@link REP_DE00} of the palette entry, ties to the lower face
 *    index. Not the entry's own color: that is the mean of everything within the merge radius,
 *    anti-aliasing and resampling rim included. An ink with no such face is left alone;
 * 2. **snap**: a flat face whose fill is within {@link SNAP_DE00} of its ink's color is painted
 *    it. Gradient faces, faces the caller skips, faces whose ink is out of range and every face
 *    farther away keep their fills. Only the color changes; `chi2`, `params` and `cost` stay.
 *
 * Inspired by: J. Yang, N. Vining, S. Kheradmand, N. Carr, L. Sigal, A. Sheffer, "Subpixel
 * Deblurring of Anti-Aliased Raster Clip-Art", Computer Graphics Forum 42(2), 2023 (a
 * distinctiveness term that penalizes adjacent regions of similar but not identical colors;
 * palette colors from patches, never from edge pixels). Here it is a post-fit choice between
 * near-equal fitted colors, because the labels are already fixed.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/color/snap.rs` (`SNAP_DE00`, `REP_DE00`,
 * `interior_counts`, `snap_flat_fills`).
 */
import type { FillFit } from '../fill/model'
import { SAME_INK_DE00, de00 } from './palette'
import type { Palette } from './palette'

/** CIEDE2000 within which a face's flat fill is painted its ink's color. */
export const SNAP_DE00 = 0.5

/** CIEDE2000 within which a face counts as its palette entry's when the ink's color is chosen. */
export const REP_DE00 = SAME_INK_DE00

/**
 * How many strictly interior pixels each face owns: not on the picture edge and with all four
 * neighbors in the same face. `faces` is the face map, one id per pixel, row-major `w × h`; ids
 * outside `[0, faceCount)` are ignored. An image narrower or shorter than 3 px has no interior.
 */
export function interiorCounts(
  faces: Int32Array,
  w: number,
  h: number,
  faceCount: number,
): Int32Array {
  const count = new Int32Array(faceCount)
  if (w < 3 || h < 3 || faces.length < w * h) return count
  for (let y = 1; y < h - 1; y++) {
    const row = y * w
    for (let x = 1; x < w - 1; x++) {
      const p = row + x
      const f = faces[p]
      if (
        f >= 0 &&
        f < faceCount &&
        faces[p - 1] === f &&
        faces[p + 1] === f &&
        faces[p - w] === f &&
        faces[p + w] === f
      ) {
        count[f]++
      }
    }
  }
  return count
}

/**
 * Paint near-duplicate flat faces of one ink that ink's color (see the module header).
 *
 * - `faces`: the face map (`splitFaces` ids), row-major `w × h`;
 * - `fills`, `faceInk`: per face, its fitted fill (replaced in place by a flat fill of the new
 *   color when it snaps) and its palette index;
 * - `palette`: the palette, `inkRgb` over white as the fills are;
 * - `skip`: faces to leave alone (a skipped face is not a representative either).
 *
 * Returns how many faces were repainted (a face already at its ink's color is not counted).
 * Deterministic: every representative is chosen before any fill changes.
 */
export function snapFlatFills(
  faces: Int32Array,
  w: number,
  h: number,
  fills: FillFit[],
  faceInk: ArrayLike<number>,
  palette: Palette,
  skip: (face: number) => boolean = () => false,
): number {
  const n = Math.min(fills.length, faceInk.length)
  if (n === 0 || palette.count === 0) return 0
  const interior = interiorCounts(faces, w, h, n)
  const inkRgb = palette.inkRgb
  // Face `f`'s flat color, when it is a flat face of an ink in range that this pass may touch.
  const flatColor = (f: number): readonly [number, number, number] | null => {
    const model = fills[f].model
    const ink = faceInk[f]
    return model.kind === 'flat' && ink >= 0 && ink < palette.count && !skip(f) ? model.color : null
  }
  // Each ink's representative: its best-evidenced face's interior count and color.
  const repInterior = new Int32Array(palette.count).fill(-1)
  const repColor: (readonly [number, number, number] | null)[] = Array.from(
    { length: palette.count },
    () => null,
  )
  for (let f = 0; f < n; f++) {
    const c = flatColor(f)
    if (c === null) continue
    const ink = faceInk[f]
    if (interior[f] === 0) continue
    if (
      de00(c[0], c[1], c[2], inkRgb[ink * 3], inkRgb[ink * 3 + 1], inkRgb[ink * 3 + 2]) >= REP_DE00
    )
      continue
    if (repColor[ink] === null || interior[f] > repInterior[ink]) {
      repInterior[ink] = interior[f]
      repColor[ink] = c
    }
  }
  let snapped = 0
  for (let f = 0; f < n; f++) {
    const c = flatColor(f)
    if (c === null) continue
    const r = repColor[faceInk[f]]
    if (r === null) continue
    const same = c[0] === r[0] && c[1] === r[1] && c[2] === r[2]
    if (!same && de00(c[0], c[1], c[2], r[0], r[1], r[2]) < SNAP_DE00) {
      fills[f] = { ...fills[f], model: { kind: 'flat', color: r } }
      snapped++
    }
  }
  return snapped
}
