/**
 * Art that touches the image border, traced on a canvas a little larger.
 *
 * A transparent raster whose artwork reaches its outermost ring of pixels (a
 * tightly cropped logo, a sticker filling its canvas) meets the frame there:
 * its outline is cut by the canvas instead of closing round the art, and the
 * edges ending on the frame cannot be refined onto the anti-aliased edge the
 * frame clipped. Embedded in a transparent margin, the art ends inside the
 * canvas on a closed outline; the traced geometry is moved back by the margin,
 * an exact translation.
 *
 * After inkvec (Apache-2.0): `crates/inkvec-cli/src/border.rs` (`touches_border`,
 * `pad`).
 */
import type { RasterImage } from '@trazor/core'

/** Transparent pixels added on every side. */
export const BORDER_PAD = 2

/**
 * Whether `image` has art on its border that a transparent margin helps: some
 * pixel is not fully opaque (transparency is the raster's ground, which a
 * transparent margin continues) and some pixel of the outermost ring has alpha
 * above zero. An opaque raster is never padded: its ground is whatever fills
 * its border.
 */
export function touchesBorder(image: RasterImage): boolean {
  const { width: w, height: h, data } = image
  if (w === 0 || h === 0) return false
  let transparent = false
  for (let p = 3; p < data.length; p += 4) {
    if (data[p] < 255) {
      transparent = true
      break
    }
  }
  if (!transparent) return false
  for (let x = 0; x < w; x++) {
    if (data[x * 4 + 3] > 0 || data[((h - 1) * w + x) * 4 + 3] > 0) return true
  }
  for (let y = 0; y < h; y++) {
    if (data[y * w * 4 + 3] > 0 || data[(y * w + w - 1) * 4 + 3] > 0) return true
  }
  return false
}

/** `image` embedded at `(pad, pad)` in a canvas `pad` px larger on every side, the new pixels fully transparent. */
export function padImage(image: RasterImage, pad: number): RasterImage {
  const { width: w, height: h, data } = image
  const pw = w + 2 * pad
  const ph = h + 2 * pad
  const out = new Uint8ClampedArray(pw * ph * 4)
  for (let y = 0; y < h; y++) {
    out.set(data.subarray(y * w * 4, (y + 1) * w * 4), ((y + pad) * pw + pad) * 4)
  }
  return { width: pw, height: ph, data: out }
}
