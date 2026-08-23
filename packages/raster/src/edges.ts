/**
 * Boundary-band detection: a cheap RGB gradient used to keep anti-aliased edge
 * pixels out of color clustering. An anti-aliased boundary pixel is a mixture
 * of the two region colors it lies between; if such pixels enter the k-means
 * training sample they pull centroids toward the mixture and waste palette
 * entries on rim colors that do not exist in the artwork. Marking a band around
 * every strong transition lets the caller sample only pure interiors.
 */
import type { BinaryMask, RasterImage } from '@trazor/core'

/**
 * 1 where the L1 RGB difference to any 4-neighbor is at least `threshold`
 * (0..765 over the summed channels). Both sides of an anti-aliased ramp exceed
 * the threshold, so the band brackets the true edge on both sides. Alpha is
 * ignored. Deterministic.
 */
export function detectEdges(image: RasterImage, threshold: number): BinaryMask {
  const { width: w, height: h, data } = image
  const n = w * h
  const out = new Uint8Array(n)
  const diff = (p: number, q: number): number =>
    Math.abs(data[p] - data[q]) +
    Math.abs(data[p + 1] - data[q + 1]) +
    Math.abs(data[p + 2] - data[q + 2])
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      const p = i * 4
      let edge = false
      if (x + 1 < w && diff(p, p + 4) >= threshold) edge = true
      else if (x > 0 && diff(p, p - 4) >= threshold) edge = true
      else if (y + 1 < h && diff(p, p + w * 4) >= threshold) edge = true
      else if (y > 0 && diff(p, p - w * 4) >= threshold) edge = true
      out[i] = edge ? 1 : 0
    }
  }
  return { width: w, height: h, data: out }
}
