/**
 * Fill `cut` with one stacked layer's mask: seed from the layer's own pixels
 * (`bucket[start … end)`), then add the underlay beneath the sheets above.
 *
 * With `reachPx < 0` (`solid-base`) the underlay is enclosure-limited: the layer
 * backs only what it *encloses* — its own pixels plus any higher-layer region
 * fully surrounded by them — so the base color, which wraps the whole design,
 * still floods to a full silhouette, but two laterally-adjacent siblings (two
 * colors that meet at a seam without the base between them) *butt* instead of
 * one stacking a full sheet under the other. Enclosed regions are found by
 * flooding the "outside" from the image border through every non-own pixel; a
 * higher-layer pixel the outside never reaches is a hole this layer backs.
 *
 * With `reachPx >= 0` (`tuck`) the underlay is that many pixel rings beyond the
 * layer's own region, so a lower color reaches under the sheets above it by a
 * bounded margin only and bulk caps at two sheets at a seam.
 *
 * `cut` must be zeroed by the caller; `flood` is scratch of length ≥ width·height.
 */
export function floodStackLayer(
  cut: Uint8Array,
  union: Uint8Array,
  flood: Int32Array,
  bucket: Int32Array,
  start: number,
  end: number,
  width: number,
  height: number,
  reachPx: number,
): void {
  const nPix = width * height
  let sp = 0
  for (let k = start; k < end; k++) {
    const p = bucket[k]
    if (cut[p] === 0) {
      cut[p] = 1
      flood[sp++] = p
    }
  }
  if (reachPx < 0) {
    // Enclosure-limited underlay: own pixels (cut=1) block; flood the outside
    // (cut=2) from the border through every other pixel; any higher-layer pixel
    // still 0 is enclosed by this layer and joins the underlay. `flood` is reused
    // as the outside queue.
    let q = 0
    for (let x = 0; x < width; x++) {
      const top = x
      const bot = (height - 1) * width + x
      if (cut[top] === 0) {
        cut[top] = 2
        flood[q++] = top
      }
      if (cut[bot] === 0) {
        cut[bot] = 2
        flood[q++] = bot
      }
    }
    for (let y = 0; y < height; y++) {
      const left = y * width
      const right = left + width - 1
      if (cut[left] === 0) {
        cut[left] = 2
        flood[q++] = left
      }
      if (cut[right] === 0) {
        cut[right] = 2
        flood[q++] = right
      }
    }
    while (q > 0) {
      const p = flood[--q]
      const x = p - ((p / width) | 0) * width
      if (x > 0 && cut[p - 1] === 0) {
        cut[p - 1] = 2
        flood[q++] = p - 1
      }
      if (x < width - 1 && cut[p + 1] === 0) {
        cut[p + 1] = 2
        flood[q++] = p + 1
      }
      if (p >= width && cut[p - width] === 0) {
        cut[p - width] = 2
        flood[q++] = p - width
      }
      if (p < nPix - width && cut[p + width] === 0) {
        cut[p + width] = 2
        flood[q++] = p + width
      }
    }
    // Keep own pixels and enclosed higher-layer holes; clear the outside. A
    // hole in non-union space (a lower region this layer wraps) is left out, so
    // the rendered pixels never change.
    for (let p = 0; p < nPix; p++) {
      cut[p] = cut[p] === 1 || (cut[p] === 0 && union[p] === 1) ? 1 : 0
    }
    return
  }
  // Bounded underlay (`tuck`): a breadth-first flood from every own pixel at
  // once, at most `reachPx` rings deep, so the skirt under the sheets above
  // stays a fixed margin instead of a full silhouette. `flood` doubles as the
  // BFS queue; the own pixels seeded above are level 0.
  const limit = Math.floor(reachPx)
  let levelStart = 0
  let levelEnd = sp
  for (let level = 0; level < limit && levelEnd > levelStart; level++) {
    let next = levelEnd
    for (let f = levelStart; f < levelEnd; f++) {
      const p = flood[f]
      const x = p - ((p / width) | 0) * width
      if (x > 0 && union[p - 1] === 1 && cut[p - 1] === 0) {
        cut[p - 1] = 1
        flood[next++] = p - 1
      }
      if (x < width - 1 && union[p + 1] === 1 && cut[p + 1] === 0) {
        cut[p + 1] = 1
        flood[next++] = p + 1
      }
      if (p >= width && union[p - width] === 1 && cut[p - width] === 0) {
        cut[p - width] = 1
        flood[next++] = p - width
      }
      if (p < nPix - width && union[p + width] === 1 && cut[p + width] === 0) {
        cut[p + width] = 1
        flood[next++] = p + width
      }
    }
    levelStart = levelEnd
    levelEnd = next
  }
}
