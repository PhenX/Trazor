/**
 * Where a stacked base layer's edge runs under a sheet painted above it.
 *
 * A base layer's mask is the union of its own color and every sheet stacked
 * above it, so wherever one of those sheets reaches the union's outline, the
 * base and the sheet trace the same edge. Drawn that way the two anti-aliased
 * edges composite over each other as independent coverages (Porter & Duff), and
 * a thin seam of the base's color shows along the sheet's edge — a light rim
 * around a dark shape, a dark one around a light shape — while two fits of one
 * edge never quite agree either, leaving slivers where the base pokes out. The
 * base's paint along such an edge is hidden anyway, so it is set back beneath
 * the sheet: the refined edge moves `SETBACK_PX` inward, clear of the pixels
 * the sheet's own anti-aliased edge covers.
 */

/** How far a hidden edge sits beneath the sheet's edge (px). */
const SETBACK_PX = 1
/** Points over which a set-back grows from nothing at each end of a hidden stretch. */
const SETBACK_RAMP = 3
/**
 * Shortest run of boundary steps the hidden / visible reading keeps: a shorter
 * visible gap inside a hidden stretch is a stray own-color pixel on the rim,
 * and a shorter hidden stretch a speck, neither worth a jog in the outline.
 */
const SETBACK_MIN_RUN = 4

/**
 * Signed set-back per ring point for `refineRingToField` (positive towards the
 * pixel on the right of the walk, y down), or undefined when no edge of the
 * ring runs under a sheet above.
 *
 * A boundary step is hidden when its inside pixel belongs to a label painted
 * above the layer (`position` above `layer`) and that sheet is at least two
 * pixels deep there — the next pixel inward is the same label — so a sheet one
 * pixel wide (an anti-aliased rim labeled as its own color) never has the base
 * pulled out from under its hard edges. A step on the image border is never
 * hidden. The per-step reading is cleaned as a circular signal (short visible
 * gaps closed, short hidden runs dropped), and each point's set-back ramps up
 * over `SETBACK_RAMP` points from either end of its stretch so the outline
 * bends into it smoothly.
 *
 * @param points the ring's lattice points (flat, not closed by a repeat)
 * @param mask the layer's mask the ring was cut from (1 inside)
 * @param labels the stacked label per pixel (−1 unlabeled)
 * @param position each label's paint position among the base layers (−1 none)
 * @param layer this layer's paint position
 * @param scale working pixels per source pixel (supersampling): the depth, the
 *   ramp and the shortest run are source pixels, so they scale with it
 */
export function sheetSetback(
  points: readonly number[],
  mask: Uint8Array,
  labels: Int32Array,
  position: Int32Array,
  layer: number,
  width: number,
  height: number,
  scale = 1,
): Float64Array | undefined {
  const n = points.length >> 1
  const depthPx = SETBACK_PX * scale
  const ramp = Math.max(1, Math.round(SETBACK_RAMP * scale))
  const minRun = Math.max(1, Math.round(SETBACK_MIN_RUN * scale))
  // The sheet must reach two source pixels in: the pixel that far past the inside one.
  const reach = Math.max(1, Math.round(2 * scale) - 1)
  const hidden = new Uint8Array(n)
  const side = new Int8Array(n)
  let any = false
  const inBounds = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < width && y < height
  for (let i = 0; i < n; i++) {
    const j = i + 1 < n ? i + 1 : 0
    const x0 = points[i * 2]
    const y0 = points[i * 2 + 1]
    const dx = points[j * 2] - x0
    const dy = points[j * 2 + 1] - y0
    // The pixels on the right (a) and the left (b) of the unit step.
    let ax: number
    let ay: number
    let bx: number
    let by: number
    if (dx > 0) {
      ax = x0
      ay = y0
      bx = x0
      by = y0 - 1
    } else if (dx < 0) {
      ax = x0 - 1
      ay = y0 - 1
      bx = x0 - 1
      by = y0
    } else if (dy > 0) {
      ax = x0 - 1
      ay = y0
      bx = x0
      by = y0
    } else {
      ax = x0
      ay = y0 - 1
      bx = x0 - 1
      by = y0 - 1
    }
    if (!inBounds(ax, ay) || !inBounds(bx, by)) continue
    const pa = ay * width + ax
    const pb = by * width + bx
    const aIn = mask[pa] !== 0
    if (aIn === (mask[pb] !== 0)) continue
    side[i] = aIn ? 1 : -1
    const l = labels[aIn ? pa : pb]
    if (l < 0 || position[l] <= layer) continue
    // Two source pixels deep: the pixel `reach` past the inside one, away from the outside one.
    const deepX = aIn ? ax + reach * (ax - bx) : bx + reach * (bx - ax)
    const deepY = aIn ? ay + reach * (ay - by) : by + reach * (by - ay)
    if (!inBounds(deepX, deepY) || labels[deepY * width + deepX] !== l) continue
    hidden[i] = 1
    any = true
  }
  if (!any) return undefined
  settleRuns(hidden, 0, minRun)
  settleRuns(hidden, 1, minRun)
  const out = new Float64Array(n)
  any = false
  for (let i = 0; i < n; i++) {
    // Point i joins step i − 1 to step i; its depth is the hidden steps on both sides.
    let depth = 0
    while (
      depth < ramp &&
      hidden[(i - 1 - depth + n * ramp) % n] === 1 &&
      hidden[(i + depth) % n] === 1
    ) {
      depth++
    }
    if (depth === 0 || side[i] === 0) continue
    out[i] = (side[i] * depthPx * depth) / ramp
    any = true
  }
  return any ? out : undefined
}

/**
 * Flip every circular run of `value` shorter than `minRun` that is bounded by
 * the other value (a signal that is `value` throughout is left alone).
 */
function settleRuns(flags: Uint8Array, value: number, minRun: number): void {
  const n = flags.length
  let start = -1
  for (let i = 0; i < n; i++) {
    if (flags[i] !== value) {
      start = i
      break
    }
  }
  if (start < 0) return
  const flip = value === 1 ? 0 : 1
  let i = 0
  while (i < n) {
    const k = (start + i) % n
    if (flags[k] !== value) {
      i++
      continue
    }
    let len = 0
    while (len < n && flags[(k + len) % n] === value) len++
    if (len < minRun) for (let m = 0; m < len; m++) flags[(k + m) % n] = flip
    i += len
  }
}
