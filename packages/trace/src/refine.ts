import type { GrayImage } from '@trazor/core'
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
 * negative deep in `left`, positive deep in `right`, zero where the pixel is the
 * 50% mix of the two — the true anti-aliased edge between two flat regions. The
 * mix is inverted in encoded sRGB with {@link coverageOf}, the space a
 * rasterizer blends an anti-aliased edge in (SVG's `color-interpolation: sRGB`,
 * canvas, Skia, Cairo), so the recovered edge is exact; a perceptual space would
 * bend the mixing line and shift it. An anti-aliased rim pixel reads an
 * intermediate value, a fully saturated interior pixel reads ±0.5, so a hard
 * color edge (no intermediate sample) is left on the lattice exactly like a hard
 * threshold edge is; two coincident colors carry no edge and read as all-zero
 * (no refinement). `pixels` is the working image's RGBA bytes; `palette` is the
 * per-label RGB (interleaved), indexed by the `left`/`right` labels.
 */
export function pairwiseField(
  pixels: Uint8ClampedArray,
  palette: Uint8Array,
  width: number,
  height: number,
  left: number,
  right: number,
): SignedField {
  const li = left * 3
  const ri = right * 3
  return {
    width,
    height,
    at(x: number, y: number): number {
      // Coverage of the right side against the left, centered: −0.5 deep in
      // `left`, +0.5 deep in `right`, 0 at the 50% mix. −1 (coincident colors)
      // reads 0, so the field is flat and refineRingToField leaves the edge.
      const c = coverageOf(pixels, (y * width + x) * 4, palette, ri, li)
      return c < 0 ? 0 : c - 0.5
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

/** What a stacked layer's boundary field is read from (`layerField`). */
export interface LayerFieldSource {
  width: number
  height: number
  /** 1 where the layer's mask covers the pixel. */
  mask: Uint8Array
  /** Label per pixel, −1 where the pixel is unlabeled (cut away as transparent). */
  labels: Int32Array
  /** The working image's RGBA bytes. */
  pixels: Uint8ClampedArray
  /** Per-label palette RGB (interleaved, indexed by label). */
  paletteRgb: Uint8Array
  /**
   * The color painted inside the mask: a lifted island's own label, or −1 for
   * a base layer, whose mask is a union under the sheets above it and whose
   * edge therefore meets each inside pixel's own label color.
   */
  label: number
  /**
   * Signed transparency coverage (`alphaCoverageField`), positive on the
   * labeled side: the exterior edge. Absent, the exterior is a hard edge.
   */
  alpha?: GrayImage
}

/**
 * Sub-pixel boundary field of one stacked layer, in [-0.5, 0.5]: positive
 * inside the layer's mask, negative outside, zero at the true edge. An edge of
 * the mask is a color edge with the label across it — the pixel's coverage
 * recovered by projecting its color onto the segment between the two palette
 * colors (`coverageOf`), the pair read per pixel from its first 4-neighbor on
 * the other side of the mask (left, right, up, down: a fixed order, so the
 * field is deterministic) — or, where the source is not solid, the exterior
 * edge against transparency, whose position the alpha coverage carries. A pixel
 * with no neighbor across the mask is deep inside or outside (±0.5); two
 * identical palette colors carry no edge information and read as a hard edge.
 */
export function layerField(src: LayerFieldSource): SignedField {
  const { width: w, height: h, mask, labels, pixels, paletteRgb, label, alpha } = src
  const alphaData = alpha?.data
  /** Pixel `p`'s coverage by `own` against `other`, centered: −0.5 at `other`, +0.5 at `own`. */
  const project = (p: number, own: number, other: number, hard: number): number => {
    const c = coverageOf(pixels, p * 4, paletteRgb, own * 3, other * 3)
    return c < 0 ? hard : c - 0.5
  }
  /** First 4-neighbor of `p` whose mask bit is `side`, else −1. */
  const across = (p: number, x: number, y: number, side: number): number => {
    if (x > 0 && mask[p - 1] === side) return p - 1
    if (x < w - 1 && mask[p + 1] === side) return p + 1
    if (y > 0 && mask[p - w] === side) return p - w
    if (y < h - 1 && mask[p + w] === side) return p + w
    return -1
  }
  return {
    width: w,
    height: h,
    at(x: number, y: number): number {
      const p = y * w + x
      if (alphaData !== undefined) {
        // Not solid: on the exterior rim or beyond it, where coverage is the edge.
        const a = alphaData[p]
        if (a < SATURATED) return a
      }
      const l = labels[p]
      if (mask[p] !== 0) {
        const q = across(p, x, y, 0)
        if (q < 0) return 0.5
        const other = labels[q]
        const own = label >= 0 ? label : l
        if (other < 0 || own < 0) return 0.5
        return project(p, own, other, 0.5)
      }
      if (l < 0) return -0.5
      const q = across(p, x, y, 1)
      if (q < 0) return -0.5
      const own = label >= 0 ? label : labels[q]
      if (own < 0) return -0.5
      return project(p, own, l, -0.5)
    },
  }
}

/**
 * Coverage of a pixel by color `a` against color `b`, in [0, 1]: the
 * least-squares mixing weight of `a` in the pixel's RGB, `(P − b)·(a − b) /
 * |a − b|²`, clamped. A rasterizer blends an anti-aliased edge in the encoded
 * sRGB values it writes (SVG's `color-interpolation: sRGB`, canvas, Skia,
 * Cairo), so the inversion is exact in those same values; a perceptual space
 * would bend the mixing line and shift every recovered edge. −1 when the two
 * colors coincide (no edge to read). `pi` and `ai`/`bi` are byte offsets into
 * the RGBA pixels and the RGB palette.
 */
export function coverageOf(
  pixels: Uint8ClampedArray,
  pi: number,
  palette: Uint8Array,
  ai: number,
  bi: number,
): number {
  const dr = palette[ai] - palette[bi]
  const dg = palette[ai + 1] - palette[bi + 1]
  const db = palette[ai + 2] - palette[bi + 2]
  const d2 = dr * dr + dg * dg + db * db
  if (d2 < 1) return -1
  const c =
    ((pixels[pi] - palette[bi]) * dr +
      (pixels[pi + 1] - palette[bi + 1]) * dg +
      (pixels[pi + 2] - palette[bi + 2]) * db) /
    d2
  return c < 0 ? 0 : c > 1 ? 1 : c
}

/** A gray field as a `SignedField`; a `SignedField` as itself. */
export function signedFieldOf(field: GrayImage | SignedField): SignedField {
  if (!('data' in field)) return field
  const { width, height, data } = field
  return { width, height, at: (x, y) => data[y * width + x] }
}

/** The field with its sign flipped: the same edge seen from the other side. */
export function negatedField(field: GrayImage | SignedField): SignedField {
  const inner = signedFieldOf(field)
  return { width: inner.width, height: inner.height, at: (x, y) => -inner.at(x, y) }
}
