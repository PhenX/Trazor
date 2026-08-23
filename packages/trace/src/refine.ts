import type { GrayImage } from '@vectorizer/core'
import type { FlatPoints } from './paths'

/**
 * A signed scalar field over the pixel grid, in [-0.5, 0.5]: positive on one
 * side of a boundary, negative on the other, zero at the true edge; magnitude
 * 0.5 is a fully saturated (non-anti-aliased) pixel. A `GrayImage` produced by
 * `signedThresholdField` is one such field; a color-boundary field
 * (`pairwiseField`) is another. `at(x, y)` reads the value at integer pixel
 * (x, y); callers clamp the coordinates.
 */
export interface SignedField {
  width: number
  height: number
  at(x: number, y: number): number
}

/**
 * Signed color-boundary field between two region colors, in [-0.5, 0.5]:
 * negative deep in `left`, positive deep in `right`, zero where the pixel color
 * is the perceptual 50% mix — the true anti-aliased edge between two flat
 * regions. Built from a per-pixel Oklab buffer (interleaved [L, a, b]): an
 * anti-aliased rim pixel reads an intermediate value, a fully saturated
 * interior pixel reads ±0.5, so a hard color edge (no intermediate sample) is
 * left on the lattice exactly like a hard threshold edge is.
 */
export function pairwiseField(
  oklab: Float32Array,
  width: number,
  height: number,
  left: readonly [number, number, number],
  right: readonly [number, number, number],
): SignedField {
  const lL = left[0]
  const la = left[1]
  const lb = left[2]
  const rL = right[0]
  const ra = right[1]
  const rb = right[2]
  const dx = lL - rL
  const dy = la - ra
  const dz = lb - rb
  const dLR = Math.sqrt(dx * dx + dy * dy + dz * dz)
  const inv = dLR > 1e-6 ? 0.5 / dLR : 0
  return {
    width,
    height,
    at(x: number, y: number): number {
      const o = (y * width + x) * 3
      const L = oklab[o]
      const a = oklab[o + 1]
      const b = oklab[o + 2]
      const dll = L - lL
      const dla = a - la
      const dlb = b - lb
      const drl = L - rL
      const dra = a - ra
      const drb = b - rb
      const dl = Math.sqrt(dll * dll + dla * dla + dlb * dlb)
      const dr = Math.sqrt(drl * drl + dra * dra + drb * drb)
      const v = (dl - dr) * inv
      return v < -0.5 ? -0.5 : v > 0.5 ? 0.5 : v
    },
  }
}

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
export function refineRingToField(ring: FlatPoints, field: GrayImage | SignedField): FlatPoints {
  const w = field.width
  const h = field.height
  const data = 'data' in field ? field.data : null
  const sample = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    return data !== null ? data[cy * w + cx] : (field as SignedField).at(cx, cy)
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
