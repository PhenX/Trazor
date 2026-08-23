// Ground-truth derivation. The edge target is a soft boundary map: the maximum
// Sobel (1968) gradient magnitude across the shape's R, G, B and A channels, so
// both color boundaries between regions and the silhouette (via the alpha
// gradient) become edges — exactly the region boundaries crack decomposition
// consumes. Derived from the clean, pre-degradation shape so labels are exact.

export function edgeMap(shape) {
  const { width: w, height: h, data } = shape
  const out = new Uint8ClampedArray(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let maxMag = 0
      for (let c = 0; c < 4; c++) {
        const gx = sobelX(data, w, h, x, y, c)
        const gy = sobelY(data, w, h, x, y, c)
        const mag = Math.sqrt(gx * gx + gy * gy)
        if (mag > maxMag) maxMag = mag
      }
      // Sobel magnitude peaks near 4*255; scale so a strong edge saturates.
      out[y * w + x] = (maxMag * 255) / 1020
    }
  }
  return out
}

function sobelX(d, w, h, x, y, c) {
  return (
    -sample(d, w, h, x - 1, y - 1, c) +
    sample(d, w, h, x + 1, y - 1, c) -
    2 * sample(d, w, h, x - 1, y, c) +
    2 * sample(d, w, h, x + 1, y, c) -
    sample(d, w, h, x - 1, y + 1, c) +
    sample(d, w, h, x + 1, y + 1, c)
  )
}

function sobelY(d, w, h, x, y, c) {
  return (
    -sample(d, w, h, x - 1, y - 1, c) -
    2 * sample(d, w, h, x, y - 1, c) -
    sample(d, w, h, x + 1, y - 1, c) +
    sample(d, w, h, x - 1, y + 1, c) +
    2 * sample(d, w, h, x, y + 1, c) +
    sample(d, w, h, x + 1, y + 1, c)
  )
}

function sample(d, w, h, x, y, c) {
  const xx = x < 0 ? 0 : x >= w ? w - 1 : x
  const yy = y < 0 ? 0 : y >= h ? h - 1 : y
  return d[(yy * w + xx) * 4 + c]
}

// The signed-coverage field target (docs/SIGNED_FIELD_PREPASS.md): the clean
// scene's ink "insideness" as coverage in [0,1] — 1 = inside (dark), 0 = outside
// (light), 0.5 = boundary. The bw tracer maps it back to a signed field
// (coverage − 0.5) and snaps ring vertices onto its zero iso-line, so a model
// predicting this clean field from a degraded input denoises sub-pixel boundary
// placement. Coverage = 1 − Oklab L (matching @trazor/raster toGrayscale) at a
// mid (0.5) threshold; its anti-aliased edge values carry the sub-pixel boundary.
export function fieldMap(image) {
  const { width: w, height: h, data } = image
  const out = new Uint8ClampedArray(w * h)
  for (let i = 0, p = 0; i < w * h; i++, p += 4) {
    out[i] = (1 - oklabL(data[p], data[p + 1], data[p + 2])) * 255
  }
  return out
}

// Oklab lightness of an 8-bit sRGB triple, matching @trazor/raster's toGrayscale.
function oklabL(r, g, b) {
  const lr = srgbToLinear(r)
  const lg = srgbToLinear(g)
  const lb = srgbToLinear(b)
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb)
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb)
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb)
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  return L < 0 ? 0 : L > 1 ? 1 : L
}

function srgbToLinear(c) {
  const x = c / 255
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)
}
