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
