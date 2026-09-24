import type { GrayImage, PathCommand } from '@trazor/core'
import type { FlatPoints } from './paths'
import { signedFieldOf } from './refine'
import type { SignedField } from './refine'

/**
 * The observed coverage of the region a ring encloses, over a pixel window
 * around the ring: `data[(y − y0)·w + (x − x0)]` in [0, 1] for pixel (x, y) —
 * 1 fully inside, 0 fully outside, a fraction on the anti-aliased rim. Read
 * from the sub-pixel field the ring was refined against, so a candidate outline
 * can be judged by what it renders: the comparison a rendered-coverage fit
 * makes (inkvec stage 08). `weight` is 1 on the pixels near the edge the field
 * measured and 0 elsewhere: an edge left on the lattice is either hard, where
 * the samples already say all there is, or a stacked layer's cut under the
 * sheet above it, where nothing that is drawn shows.
 */
export interface CoveragePatch {
  x0: number
  y0: number
  w: number
  h: number
  data: Float32Array
  weight: Uint8Array
}

/**
 * Widest window (px) a ring's patch may span. A small ring's samples cannot
 * tell a round shape from a sharp one — the half-coverage contour of a
 * five-pixel triangle is a blob — while the pixels it covers can; a large
 * ring's samples can.
 */
const PATCH_MAX = 64
/** Pixels of margin around the ring's lattice box. */
const PATCH_MARGIN = 2
/** Distance (px) from a measured sample within which a pixel's coverage is compared. */
const PATCH_REACH = 1.5

/**
 * The coverage patch of a lattice ring (integer pixel corners, unit steps,
 * closed) against `field`, or undefined when the ring spans more than
 * {@link PATCH_MAX} px or the field measured none of it. `geom` is the ring
 * refined onto the field, parallel to `ring`: the samples it moved off the
 * lattice mark the measured edge. The field's sign is read off the ring
 * itself: the enclosed side is whichever side of its edges the field reads
 * higher, so a hole's patch is the coverage of the hole.
 */
export function coveragePatch(
  ring: FlatPoints,
  geom: FlatPoints,
  field: GrayImage | SignedField,
): CoveragePatch | undefined {
  const f = signedFieldOf(field)
  const n = ring.length >> 1
  if (n < 4) return undefined
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let area2 = 0
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2]
    const y = ring[i * 2 + 1]
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y)
    const j = (i + 1) % n
    area2 += x * ring[j * 2 + 1] - ring[j * 2] * y
  }
  const x0 = Math.max(0, minX - PATCH_MARGIN)
  const y0 = Math.max(0, minY - PATCH_MARGIN)
  const x1 = Math.min(f.width, maxX + PATCH_MARGIN)
  const y1 = Math.min(f.height, maxY + PATCH_MARGIN)
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 0 || h <= 0 || w > PATCH_MAX || h > PATCH_MAX) return undefined
  const at = (x: number, y: number): number =>
    f.at(x < 0 ? 0 : x >= f.width ? f.width - 1 : x, y < 0 ? 0 : y >= f.height ? f.height - 1 : y)
  // Every unit step of the ring separates a pixel on its right from one on its
  // left (y down); positive area puts the enclosed pixel on the right.
  const insideRight = area2 > 0
  let lean = 0
  for (let i = 0; i < n; i++) {
    const ax = ring[i * 2]
    const ay = ring[i * 2 + 1]
    const j = (i + 1) % n
    const dx = Math.sign(ring[j * 2] - ax)
    const dy = Math.sign(ring[j * 2 + 1] - ay)
    const steps = Math.abs(ring[j * 2] - ax) + Math.abs(ring[j * 2 + 1] - ay)
    for (let s = 0; s < steps; s++) {
      const x = ax + dx * s
      const y = ay + dy * s
      // Pixels right and left of the step from (x, y) to (x + dx, y + dy).
      let rx: number
      let ry: number
      let lx: number
      let ly: number
      if (dx > 0) [rx, ry, lx, ly] = [x, y, x, y - 1]
      else if (dx < 0) [rx, ry, lx, ly] = [x - 1, y - 1, x - 1, y]
      else if (dy > 0) [rx, ry, lx, ly] = [x - 1, y, x, y]
      else [rx, ry, lx, ly] = [x, y - 1, x - 1, y - 1]
      const d = at(rx, ry) - at(lx, ly)
      lean += insideRight ? d : -d
    }
  }
  const sign = lean < 0 ? -1 : 1
  const data = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const c = 0.5 + sign * at(x0 + x, y0 + y)
      data[y * w + x] = c < 0 ? 0 : c > 1 ? 1 : c
    }
  }
  const weight = new Uint8Array(w * h)
  let measured = false
  const m = Math.min(n, geom.length >> 1)
  for (let i = 0; i < m; i++) {
    const gx = geom[i * 2]
    const gy = geom[i * 2 + 1]
    if (gx === ring[i * 2] && gy === ring[i * 2 + 1]) continue
    measured = true
    const lx = Math.max(0, Math.ceil(gx - PATCH_REACH - 0.5) - x0)
    const hx = Math.min(w - 1, Math.floor(gx + PATCH_REACH - 0.5) - x0)
    const ly = Math.max(0, Math.ceil(gy - PATCH_REACH - 0.5) - y0)
    const hy = Math.min(h - 1, Math.floor(gy + PATCH_REACH - 0.5) - y0)
    for (let y = ly; y <= hy; y++) {
      for (let x = lx; x <= hx; x++) {
        if (Math.hypot(x0 + x + 0.5 - gx, y0 + y + 0.5 - gy) <= PATCH_REACH) weight[y * w + x] = 1
      }
    }
  }
  return measured ? { x0, y0, w, h, data, weight } : undefined
}

/** Sub-rows per pixel a path's coverage is integrated over (exact along each row). */
const COVERAGE_ROWS = 16
/** Line pieces a curve is flattened into for its coverage. */
const COVERAGE_CURVE_STEPS = 16

/**
 * Sum over the patch's weighted pixels of the squared difference between the
 * coverage a closed path renders (even-odd) and the observed coverage. The path
 * is flattened and each pixel's area integrated exactly along
 * {@link COVERAGE_ROWS} sub-rows.
 */
export function pathCoverageError(cmds: readonly PathCommand[], patch: CoveragePatch): number {
  const { x0, y0, w, h, data, weight } = patch
  // Edges (patch-relative), each subpath closed back on its start.
  const edges: number[] = []
  let cx = 0
  let cy = 0
  let sx = 0
  let sy = 0
  const lineTo = (x: number, y: number): void => {
    if (y !== cy) edges.push(cx - x0, cy - y0, x - x0, y - y0)
    cx = x
    cy = y
  }
  for (const c of cmds) {
    if (c.type === 'M') {
      lineTo(sx, sy)
      cx = sx = c.x
      cy = sy = c.y
    } else if (c.type === 'L' || c.type === 'A') {
      lineTo(c.x, c.y)
    } else if (c.type === 'C') {
      const px = cx
      const py = cy
      for (let k = 1; k <= COVERAGE_CURVE_STEPS; k++) {
        const t = k / COVERAGE_CURVE_STEPS
        const u = 1 - t
        const a = u * u * u
        const b = 3 * u * u * t
        const d = 3 * u * t * t
        const e = t * t * t
        lineTo(a * px + b * c.x1 + d * c.x2 + e * c.x, a * py + b * c.y1 + d * c.y2 + e * c.y)
      }
    } else if (c.type === 'Q') {
      const px = cx
      const py = cy
      for (let k = 1; k <= COVERAGE_CURVE_STEPS; k++) {
        const t = k / COVERAGE_CURVE_STEPS
        const u = 1 - t
        lineTo(
          u * u * px + 2 * u * t * c.x1 + t * t * c.x,
          u * u * py + 2 * u * t * c.y1 + t * t * c.y,
        )
      }
    } else {
      lineTo(sx, sy)
    }
  }
  lineTo(sx, sy)

  const cover = new Float64Array(w * h)
  const xs: number[] = []
  for (let r = 0; r < h * COVERAGE_ROWS; r++) {
    const y = (r + 0.5) / COVERAGE_ROWS
    xs.length = 0
    for (let k = 0; k < edges.length; k += 4) {
      const ay = edges[k + 1]
      const by = edges[k + 3]
      if (ay <= y !== by <= y) {
        const ax = edges[k]
        xs.push(ax + ((y - ay) * (edges[k + 2] - ax)) / (by - ay))
      }
    }
    if (xs.length < 2) continue
    xs.sort((p, q) => p - q)
    const row = Math.floor(y) * w
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.max(0, xs[k])
      const xb = Math.min(w, xs[k + 1])
      for (let px = Math.floor(xa); px < xb; px++) {
        const overlap = Math.min(xb, px + 1) - Math.max(xa, px)
        if (overlap > 0) cover[row + px] += overlap / COVERAGE_ROWS
      }
    }
  }
  let err = 0
  for (let i = 0; i < w * h; i++) {
    if (weight[i] === 0) continue
    const d = cover[i] - data[i]
    err += d * d
  }
  return err
}
