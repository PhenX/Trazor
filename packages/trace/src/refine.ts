import type { GrayImage } from '@vectorizer/core'
import type { FlatPoints } from './paths'

/** Clamp for a single vertex's sub-pixel displacement (px). */
const MAX_SHIFT = 0.75
/**
 * A field sample this close to ±0.5 is a fully inside/outside pixel. A hard edge
 * shows only these, and its 2×2 around a real corner is indistinguishable from a
 * staircase step — so with no intermediate (anti-aliased) sample there is no
 * sub-pixel information and the lattice vertex is left exactly where it is.
 */
const SATURATED = 0.4999

/**
 * Move each lattice ring vertex onto the zero iso-contour of a signed coverage
 * field: centered coverage in [-0.5, 0.5], positive inside a region, negative
 * outside, zero at the true boundary (magnitude 0.5 = a fully inside/outside
 * pixel, intermediate = anti-aliased). At a pixel corner the field is bilinear
 * in the four surrounding pixels; one Newton step along its gradient lands the
 * corner on the zero level.
 *
 * This de-staircases an anti-aliased edge before the polygon and vertex-
 * adjustment stages read it: on a straight run every vertex shifts by the same
 * sub-pixel offset (the edge slides to its true position). A vertex is left in
 * place when it is on the image border, when the field does not cross zero
 * around it, or when the edge is hard (no anti-aliased sample nearby) — a hard
 * edge carries no sub-pixel truth, and moving its corners would only bend the
 * straight runs that meet there.
 */
export function refineRingToField(ring: FlatPoints, field: GrayImage): FlatPoints {
  const { width: w, height: h, data } = field
  const sample = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    return data[cy * w + cx]
  }

  const n = ring.length >> 1
  const out: FlatPoints = new Array(ring.length)
  for (let i = 0; i < n; i++) {
    const x = ring[i * 2]
    const y = ring[i * 2 + 1]
    out[i * 2] = x
    out[i * 2 + 1] = y
    // Pin the image border so a clipped straight edge is not pulled inward.
    if (x <= 0 || y <= 0 || x >= w || y >= h) continue

    const tl = sample(x - 1, y - 1)
    const tr = sample(x, y - 1)
    const bl = sample(x - 1, y)
    const br = sample(x, y)
    // Only refine where the field genuinely crosses zero around this corner.
    if ((tl > 0 && tr > 0 && bl > 0 && br > 0) || (tl < 0 && tr < 0 && bl < 0 && br < 0)) continue
    // A hard edge (all four samples saturated) has no sub-pixel truth — leave it.
    if (
      Math.abs(tl) >= SATURATED &&
      Math.abs(tr) >= SATURATED &&
      Math.abs(bl) >= SATURATED &&
      Math.abs(br) >= SATURATED
    ) {
      continue
    }

    const f = (tl + tr + bl + br) / 4
    const gx = (tr + br - tl - bl) / 2
    const gy = (bl + br - tl - tr) / 2
    const g2 = gx * gx + gy * gy
    if (g2 < 1e-12) continue

    const t = -f / g2
    let dx = t * gx
    let dy = t * gy
    dx = dx > MAX_SHIFT ? MAX_SHIFT : dx < -MAX_SHIFT ? -MAX_SHIFT : dx
    dy = dy > MAX_SHIFT ? MAX_SHIFT : dy < -MAX_SHIFT ? -MAX_SHIFT : dy
    out[i * 2] = x + dx
    out[i * 2 + 1] = y + dy
  }
  return out
}
