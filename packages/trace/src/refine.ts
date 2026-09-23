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

/**
 * A field sample this close to ±0.5 is a fully inside/outside pixel: `layerField`
 * treats the exterior rim as covered only where the alpha coverage is not yet
 * saturated.
 */
const SATURATED = 0.4999
/** Clamp for a single point's sub-pixel displacement along the normal (px). */
const MAX_SHIFT = 1.0
/**
 * A coverage this close to 0 or 1 is a fully outside/inside pixel that carries no
 * sub-pixel information: a hard edge shows only these, and moving a point off the
 * lattice with no anti-aliased evidence would only bend the straight runs that
 * meet it. A point moves only when it has at least one partial (anti-aliased)
 * pixel to read the crossing from.
 */
const PARTIAL_LO = 0.03
const PARTIAL_HI = 0.97

/**
 * Cosine of the turn (45°) past which an optimal-polygon vertex is a corner for
 * the tangent estimate: each of its edges keeps its own direction up to it.
 */
const SMOOTH_TURN_COS = Math.cos(Math.PI / 4)

/** Nudge (px) that breaks a probe's tie on a pixel boundary away from the probed point. */
const TIE_NUDGE = 1e-6

/**
 * Move each lattice boundary point onto the coverage = ½ level set of a signed
 * field, by searching along the local boundary normal for the position where the
 * coverage the image reads crosses one half — the true anti-aliased edge (inkvec
 * stage 07 `refine_subpixel`, `crates/inkvec-trace/src/planar.rs`; see
 * docs/REFERENCES.md). The field is centered coverage in [-0.5, 0.5]: positive
 * inside a region, negative outside, ±0.5 a fully saturated pixel, intermediate
 * an anti-aliased one; `a = value + ½` is the observed coverage.
 *
 * With the optimal polygon's `vertices` (ascending indices into `ring`), a
 * point's tangent is the direction of the polygon edge it lies on, turning
 * towards each end's vertex direction (the bisector of a vertex's two edges, or
 * the edge's own direction next to a corner); without them it is estimated from
 * the point's two neighbours (cyclic on a closed ring, clamped on an open chain).
 * The normal is perpendicular to the tangent.
 * Coverage is probed at the pixel centres nearest ±1, ±½, 0 pixels along the
 * normal; the two probes that bracket the ½ crossing locate the edge. Where the
 * profile is a clean step (saturates on both sides, monotone) a single partial
 * pixel inverts through the exact half-plane coverage of a unit square
 * ({@link edgeOffset}), which — unlike a bilinear root-find between pixel centres
 * — carries no bias towards the ½ grid; otherwise the crossing is found by a
 * root-find along the normal. A point is left in place on the image border, where
 * no probe is partial (a hard edge), or where the profile never crosses ½.
 *
 * This de-staircases an anti-aliased edge before the polygon, vertex-adjustment
 * and run-fitting stages read it: on a straight run every point shifts by the
 * same sub-pixel offset (the edge slides to its true position). Omitting the
 * field leaves the exact lattice geometry (the caller passes none).
 */
export function refineRingToField(
  ring: FlatPoints,
  field: GrayImage | SignedField,
  vertices?: readonly number[],
): FlatPoints {
  const w = field.width
  const h = field.height
  const data = 'data' in field ? field.data : null
  /** Centered field value at integer pixel (x, y), coordinates clamped to grid. */
  const at = (x: number, y: number): number => {
    const cx = x < 0 ? 0 : x >= w ? w - 1 : x
    const cy = y < 0 ? 0 : y >= h ? h - 1 : y
    return data !== null ? data[cy * w + cx] : (field as SignedField).at(cx, cy)
  }
  /** Observed coverage in [0, 1] bilinearly sampled at corner-space position (X, Y). */
  const coverageAt = (px: number, py: number): number => {
    // Field samples sit at pixel centres, one corner-space unit apart, offset ½.
    const fx = px - 0.5
    const fy = py - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const v =
      at(x0, y0) * (1 - tx) * (1 - ty) +
      at(x0 + 1, y0) * tx * (1 - ty) +
      at(x0, y0 + 1) * (1 - tx) * ty +
      at(x0 + 1, y0 + 1) * tx * ty
    const a = v + 0.5
    return a < 0 ? 0 : a > 1 ? 1 : a
  }

  const n = ring.length >> 1
  // A closed ring repeats its first point as its last; its neighbours wrap.
  const closed = n > 2 && ring[0] === ring[(n - 1) * 2] && ring[1] === ring[(n - 1) * 2 + 1]
  const period = closed ? n - 1 : n
  const neighbor = (i: number): number =>
    closed ? ((i % period) + period) % period : i < 0 ? 0 : i >= n ? n - 1 : i

  // On a pixel staircase the two lattice neighbours only ever point along an
  // axis or a diagonal, so a normal read from them searches across a slanted
  // edge at the wrong angle and inverts its coverage through the wrong
  // unit-square profile (0.2 px off on a 68° edge). The optimal polygon's edge
  // through the point has the edge's own direction.
  const edgeOf: Int32Array | null = vertices && vertices.length >= 2 ? new Int32Array(n) : null
  const edgeDir: number[] = []
  if (edgeOf !== null && vertices) {
    const last = vertices.length - 1
    for (let k = 0; k < last; k++) {
      const a = vertices[k]
      const b = vertices[k + 1]
      const dx = ring[b * 2] - ring[a * 2]
      const dy = ring[b * 2 + 1] - ring[a * 2 + 1]
      const l = Math.hypot(dx, dy) || 1
      edgeDir.push(dx / l, dy / l)
      for (let i = a; i < b && i < n; i++) edgeOf[i] = k
    }
    for (let i = vertices[last]; i < n; i++) edgeOf[i] = last - 1
  }
  const edges = edgeDir.length >> 1
  /** Direction at polygon vertex `k`: its two edges' bisector when it turns gently, else null. */
  const vertexDir = (k: number): [number, number] | null => {
    const kin = k === 0 ? (closed ? edges - 1 : -1) : k - 1
    const kout = k === edges ? (closed ? 0 : -1) : k
    if (kin < 0 || kout < 0) return null
    const ax = edgeDir[kin * 2]
    const ay = edgeDir[kin * 2 + 1]
    const bx = edgeDir[kout * 2]
    const by = edgeDir[kout * 2 + 1]
    if (ax * bx + ay * by < SMOOTH_TURN_COS) return null
    const x = ax + bx
    const y = ay + by
    const l = Math.hypot(x, y)
    return l < 1e-12 ? null : [x / l, y / l]
  }
  /**
   * Tangent at sample `i` of polygon edge k. Along the edge the true tangent
   * turns from one vertex's direction to the next — on an arc the chord is the
   * tangent only at its middle, up to half the turn off at its ends — so the
   * angle is interpolated between the two vertex directions.
   */
  const edgeTangent = (
    i: number,
    polygon: readonly number[],
    edgeIndex: Int32Array,
  ): [number, number] => {
    const k = edgeIndex[i]
    const ex = edgeDir[k * 2]
    const ey = edgeDir[k * 2 + 1]
    if (edges < 2) return [ex, ey]
    const a = polygon[k]
    const b = polygon[k + 1]
    const t = b > a ? (i - a) / (b - a) : 0
    const d0 = vertexDir(k) ?? [ex, ey]
    const d1 = vertexDir(k + 1) ?? [ex, ey]
    const a0 = Math.atan2(d0[1], d0[0])
    let da = Math.atan2(d1[1], d1[0]) - a0
    while (da > Math.PI) da -= 2 * Math.PI
    while (da < -Math.PI) da += 2 * Math.PI
    const ang = a0 + da * t
    return [Math.cos(ang), Math.sin(ang)]
  }

  const out: FlatPoints = new Array(ring.length)
  for (let i = 0; i < n; i++) {
    const px = ring[i * 2]
    const py = ring[i * 2 + 1]
    out[i * 2] = px
    out[i * 2 + 1] = py
    // Pin the image border so a clipped straight edge is not pulled inward.
    if (px <= 0 || py <= 0 || px >= w || py >= h) continue

    let tanx: number
    let tany: number
    if (edgeOf !== null && vertices) {
      ;[tanx, tany] = edgeTangent(i, vertices, edgeOf)
    } else {
      const ia = neighbor(i - 1)
      const ib = neighbor(i + 1)
      tanx = ring[ib * 2] - ring[ia * 2]
      tany = ring[ib * 2 + 1] - ring[ia * 2 + 1]
    }
    const tl = Math.hypot(tanx, tany)
    if (tl < 1e-9) continue
    const nx = -tany / tl
    const ny = tanx / tl
    const shift = solveNormal(coverageAt, px, py, nx, ny, w, h)
    if (shift === null) continue
    out[i * 2] = px + nx * shift
    out[i * 2 + 1] = py + ny * shift
  }
  return out
}

/**
 * Distance from the centre of a pixel with coverage `a` to a straight edge cut
 * through it, signed towards the side where coverage falls — the exact inverse of
 * a unit square's half-plane coverage, with `(na, nb)` the sorted magnitudes of
 * the (unit) edge normal (inkvec `edge_offset`, `planar.rs`). Exact for an
 * axis-aligned edge and, through the quadratic branch, for a slanted one, where a
 * linear chord rule reads a 90%-covered pixel's edge ~0.18 px too far out.
 */
function edgeOffset(a: number, na: number, nb: number): number {
  const hi = a >= 0.5 ? a : 1 - a
  const s = a >= 0.5 ? 1 : -1
  const d1 = 0.5 * (na - nb)
  const d2 = 0.5 * (na + nb)
  const d =
    hi - 0.5 <= d1 / na ? (hi - 0.5) * na : d2 - Math.sqrt(Math.max(0, 2 * na * nb * (1 - hi)))
  return s * d
}

/**
 * Search along the normal (nx, ny) from point (px, py) for the coverage = ½
 * crossing, returning the signed offset along the normal in [-1, 1] px, or `null`
 * to leave the point where it is. inkvec `refine_subpixel`'s per-point search
 * (`planar.rs`): probe coverage at the pixel centres nearest ±1, ±½, 0 px along
 * the normal, bracket the ½ crossing, and invert a clean step exactly.
 */
function solveNormal(
  coverageAt: (px: number, py: number) => number,
  px: number,
  py: number,
  nx: number,
  ny: number,
  w: number,
  h: number,
): number | null {
  const ax = Math.abs(nx)
  const ay = Math.abs(ny)
  const na = ax >= ay ? ax : ay
  const nb = ax >= ay ? ay : ax
  // Probe coverage at the pixel centre containing each offset along the normal.
  const us: number[] = []
  const as: number[] = []
  for (const u of [-1, -0.5, 0, 0.5, 1]) {
    // A lattice point ±1 px along an axis-aligned normal lands on a pixel
    // boundary; the tie breaks away from the point, onto the pixel beyond the
    // offset, so an edge facing −x or −y is probed like one facing +x or +y and
    // both reach the saturated pixel outside them that the clean-step inversion
    // needs.
    const ix = Math.round(px + nx * u + TIE_NUDGE * nx * Math.sign(u) - 0.5)
    const iy = Math.round(py + ny * u + TIE_NUDGE * ny * Math.sign(u) - 0.5)
    if (ix < 0 || iy < 0 || ix >= w || iy >= h) continue
    const cx = ix + 0.5
    const cy = iy + 0.5
    const uc = (cx - px) * nx + (cy - py) * ny
    let dup = false
    for (let k = 0; k < us.length; k++) if (Math.abs(us[k] - uc) < 1e-9) dup = true
    if (dup) continue
    us.push(uc)
    as.push(coverageAt(cx, cy))
  }
  // Sort by signed offset along the normal.
  const order = us.map((_, k) => k).toSorted((p, q) => us[p] - us[q])
  const u = order.map((k) => us[k])
  const a = order.map((k) => as[k])
  const m = u.length
  if (m < 2) return null
  // A point moves only with anti-aliased evidence: at least one partial pixel.
  let anyPartial = false
  for (const av of a) if (av > PARTIAL_LO && av < PARTIAL_HI) anyPartial = true
  if (!anyPartial) return null

  // Direction coverage grows along the normal.
  let dir = 0
  if (u[m - 1] > u[0] && Math.abs(a[m - 1] - a[0]) > 0.05) dir = Math.sign(a[m - 1] - a[0])

  const partial = (v: number): boolean => v > PARTIAL_LO && v < PARTIAL_HI
  let hit: number | null = null
  if (dir !== 0) {
    for (let k = 0; k < m - 1; k++) {
      const a0 = a[k]
      const a1 = a[k + 1]
      if ((a0 - 0.5) * (a1 - 0.5) <= 0 && Math.abs(a1 - a0) > 1e-9) {
        if (partial(a0) && partial(a1)) hit = u[k] + ((u[k + 1] - u[k]) * (0.5 - a0)) / (a1 - a0)
        else if (partial(a0)) hit = u[k] - dir * edgeOffset(a0, na, nb)
        else if (partial(a1)) hit = u[k + 1] - dir * edgeOffset(a1, na, nb)
        else hit = 0.5 * (u[k] + u[k + 1])
        break
      }
    }
  }

  // The exact step inversion is trusted only for a clean step: saturating on both
  // sides within the probe span and monotone (a thin ridge saturates at both ends
  // like a step but reading it as one throws the point out). Otherwise root-find
  // the ½ crossing along the normal.
  let inc = true
  let dec = true
  for (let k = 1; k < m; k++) {
    if (a[k] < a[k - 1] - 0.05) inc = false
    if (a[k] > a[k - 1] + 0.05) dec = false
  }
  let min = 1
  let max = 0
  for (const av of a) {
    if (av < min) min = av
    if (av > max) max = av
  }
  const stepLike = m >= 3 && (inc || dec) && min < 0.12 && max > 0.88
  if (!stepLike) {
    hit = null
    const STEPS = 9
    let prevU = 0
    let prevA = 0
    let havePrev = false
    for (let s = 0; s <= STEPS; s++) {
      const uu = -1 + (2 * s) / STEPS
      const cov = coverageAt(px + nx * uu, py + ny * uu)
      if (havePrev && (prevA - 0.5) * (cov - 0.5) <= 0 && Math.abs(cov - prevA) > 1e-9) {
        hit = prevU + ((uu - prevU) * (0.5 - prevA)) / (cov - prevA)
        break
      }
      prevU = uu
      prevA = cov
      havePrev = true
    }
  }
  if (hit === null) return null
  return hit > MAX_SHIFT ? MAX_SHIFT : hit < -MAX_SHIFT ? -MAX_SHIFT : hit
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
