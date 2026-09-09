/**
 * Fill `cut` with one stacked layer's mask: seed from the layer's own pixels
 * (`bucket[start … end)`) and flood 4-connected through `union` — every pixel
 * that still paints at this layer or above. With `reachPx < 0` the flood is
 * unlimited: the whole union component the color reaches, so the base is a full
 * silhouette and every layer extends under all above it (`solid-base`). With
 * `reachPx >= 0` it stops after that many pixel rings of underlay beyond the
 * layer's own region, so a lower color reaches under the sheets above it by a
 * bounded margin only and bulk caps at two sheets at a seam (`tuck`).
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
    // Unlimited underlay: 4-connected flood over the reachable union component.
    while (sp > 0) {
      const p = flood[--sp]
      const x = p - ((p / width) | 0) * width
      if (x > 0 && union[p - 1] === 1 && cut[p - 1] === 0) {
        cut[p - 1] = 1
        flood[sp++] = p - 1
      }
      if (x < width - 1 && union[p + 1] === 1 && cut[p + 1] === 0) {
        cut[p + 1] = 1
        flood[sp++] = p + 1
      }
      if (p >= width && union[p - width] === 1 && cut[p - width] === 0) {
        cut[p - width] = 1
        flood[sp++] = p - width
      }
      if (p < nPix - width && union[p + width] === 1 && cut[p + width] === 0) {
        cut[p + width] = 1
        flood[sp++] = p + width
      }
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
