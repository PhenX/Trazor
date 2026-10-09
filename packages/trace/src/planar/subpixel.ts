/**
 * Sub-pixel boundary measurement: every boundary point of a planar map moved from its lattice
 * corner, along the local boundary normal, to where the anti-aliased image puts the boundary,
 * with the positional uncertainty that measurement carries. Topology is fixed already; a point
 * only slides along its normal, at most 1 px, so no face changes its neighbors.
 *
 * An anti-aliased pixel between faces `A` and `B` is a measurement of how much of it `A` covers:
 * `P = a·F + (1 − a)·B`, so `a = (P − B)·(F − B) / |F − B|²` — a least-squares projection over all
 * channels. Here the channels are premultiplied encoded sRGB RGBA, the space a rasterizer
 * composites in, so the same projection unmixes paint against transparency. The boundary is the
 * `a = ½` level of that field. Per point:
 *
 * 1. **Normal.** Perpendicular to the chord between the point's neighbors.
 * 2. **Unmixing axis.** The two faces' fills at the point (a gradient read where it is, or the
 *    faces' mean colors when those separate the faces better). Below a contrast of
 *    `max(3·σ_noise, 0.02)` the point stays on the lattice at σ ½.
 * 3. **Probes.** Coverage at the centers of the pixels the normal passes through.
 * 4. **Inversion.** A clean step between two flat fills is read off the partially covered pixels
 *    by inverting the exact half-plane coverage of a unit square ({@link edgeOffset}); anything
 *    else (a ramp, a ridge, a gradient face) by a root-find of the ½ level of the bilinearly
 *    interpolated coverage along the normal.
 * 5. **Uncertainty.** `σ = hypot(σ_noise / contrast / |∇a|, σ_model)`, clamped to `[0.02, 2]` px,
 *    optionally inflated on faint boundaries, then inflated where the moved boundary is locally
 *    non-linear in a way an arc is not ({@link inflateForCurvature}).
 *
 * The work is split as inkvec splits it: {@link measureSubpixel} reads the map and returns the
 * moved points, {@link applySubpixel} writes them. A point only reads the original points, so
 * the order points are measured in does not matter. Edges against the frame ({@link OUTSIDE})
 * and edges of a face without a fill are left as they are; fixed points (nodes) keep their
 * lattice position, for the junction stage to place.
 *
 * Coordinates: pixel `(i, j)` covers `[i, i+1] × [j, j+1]`, so its value sits at its center
 * `(i + ½, j + ½)`. inkvec puts pixel centers on integers; every sampling formula here reads
 * the image at `(x − ½, y − ½)` in inkvec's terms and rounds probe positions the way inkvec
 * does (half away from zero, in its frame).
 *
 * Noise: the 10th percentile of the absolute 4-neighbor Laplacian, converted to a Gaussian σ by
 * the half-normal quantile and the kernel's noise gain. The Laplacian as a structure-suppressing
 * noise probe is after Immerkær 1996 ("Fast noise variance estimation", CVIU 64(2)); the low
 * quantile is inkvec's.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/planar.rs` (`refine_subpixel_alpha`,
 * `measure_subpixel`, `Refined::apply`, `refine_edge`, `refine_vertex`, `probe_chord`,
 * `unmix_axis`, `UnmixAxis::coverage`, `Source`, `probe_pixel_centres`, `edge_offset`,
 * `invert_step`, `is_step_like`, `root_find_half`, `vertex_sigma`),
 * `inkvec-trace/src/coverage.rs` (`estimate_noise`, `CoverageField::position_sigma`,
 * `DEFAULT_SIGMA_MODEL`, the coverage inversion of `bilevel_coverage`),
 * `inkvec-trace/src/contour.rs` (`inflate_for_curvature`, `SIGMA_FLOOR`) and
 * `inkvec-trace/src/gradient.rs` (`unmix_pair`).
 */
import type { RasterImage } from '@trazor/core'
import { estimateNoise } from '@trazor/core'
import { OUTSIDE } from './types'
import type { FaceFill, PlanarEdge, PlanarMap, PremultipliedImage } from './types'

/** Smallest color separation a point is unmixed across. */
export const MIN_UNMIX_CONTRAST = 0.02

/** Positional uncertainty of a point left on the lattice, in px. */
export const GRID_SIGMA = 0.5

/**
 * Irreducible positional error of level-set extraction, in px, added in quadrature to the
 * noise term (inkvec `DEFAULT_SIGMA_MODEL`).
 */
export const SIGMA_MODEL = 0.05

/** Points each side of a point its normal's chord spans. */
const SUBPX_WIN = 1

/**
 * Cosine of the turn between a point's two chords above which a wider window falls back to
 * the immediate neighbors (60°). A staircase turns by at most 45° between chords two points
 * long. With {@link SUBPX_WIN} 1 the test never fires.
 */
const CORNER_COS = 0.5

/** Reference contrast below which `simplifyFaint` inflates σ. */
const CONTRAST_REF = 0.25

/** Largest faint-boundary inflation of σ. */
const MAX_INFLATION = 4

/** Smallest σ the per-point measurement reports before clamping (inkvec `SIGMA_FLOOR`). */
const SIGMA_FLOOR = 0

/** Clamp of the per-point σ before the curvature inflation, in px. */
const SIGMA_MIN = 0.02
const SIGMA_MAX = 2

/** Probe offsets along the normal, in px. */
const PROBE_OFFSETS = [-1, -0.5, 0, 0.5, 1]

/** Samples of the root-find along the normal, over `[−1, 1]` px: `ROOT_STEPS + 1`. */
const ROOT_STEPS = 9

/** Window radius, in points, over which local linearity is measured. */
const LINEARITY_WINDOW = 3

/** Scale from measured local non-linearity to positional uncertainty. */
const NONLINEARITY_GAIN = 0.35

/** Largest positional uncertainty local non-linearity may imply, in px (half a pixel diagonal). */
const MAX_CURVATURE_SIGMA = 0.354

/** Coverage returned for a sample with no tap inside the image. */
const NONE = -1

export interface SubpixelOptions {
  /**
   * Pixel noise, per channel, in encoded sRGB units. Defaults to {@link imageNoise} of the
   * image.
   */
  sigmaNoise?: number
  /**
   * Inflate σ below a contrast of 0.25 (up to 4×), so faint boundaries cost fewer
   * coordinates. Off by default.
   */
  simplifyFaint?: boolean
}

/** One edge's measured geometry: its points (interleaved) and their σ, the edge's length. */
export interface MeasuredEdge {
  points: Float64Array
  sigma: Float64Array
}

/**
 * Every edge's measured geometry, in edge order: `null` for an edge the measurement leaves as
 * it is (one side {@link OUTSIDE}, or a face without a fill).
 */
export interface SubpixelMeasurement {
  edges: (MeasuredEdge | null)[]
}

/**
 * The premultiplied float image of an 8-bit straight-alpha RGBA raster: each channel divided
 * by 255 and multiplied by the pixel's alpha.
 */
export function premultipliedFromRaster(image: RasterImage): PremultipliedImage {
  const { width, height, data } = image
  const n = width * height
  const out = new Float32Array(4 * n)
  for (let p = 0; p < 4 * n; p += 4) {
    const a = data[p + 3] / 255
    out[p] = (data[p] / 255) * a
    out[p + 1] = (data[p + 1] / 255) * a
    out[p + 2] = (data[p + 2] / 255) * a
    out[p + 3] = a
  }
  return { width, height, data: out }
}

/**
 * The coverage `a` of `fg` in a pixel `p = a·fg + (1 − a)·bg`, by least squares over the four
 * premultiplied channels: `a = (p − bg)·(fg − bg) / |fg − bg|²`, clamped to `[0, 1]`; 0 when
 * the two colors are equal.
 */
export function unmixCoverage(
  p: ArrayLike<number>,
  fg: ArrayLike<number>,
  bg: ArrayLike<number>,
): number {
  let num = 0
  let dd = 0
  for (let ch = 0; ch < 4; ch++) {
    const d = fg[ch] - bg[ch]
    num += (p[ch] - bg[ch]) * d
    dd += d * d
  }
  if (dd <= 0) return 0
  const a = num / dd
  return a < 0 ? 0 : a > 1 ? 1 : a
}

/**
 * Positional uncertainty, in px, of a level-set boundary point where the coverage has
 * uncertainty `sigmaAlpha` (pixel noise over contrast) and gradient magnitude `gradient` (per
 * px): `hypot(sigmaAlpha / gradient, sigmaModel)` clamped to `[0.001, 4]`, the noise term 4 px
 * on a plateau (`gradient ≤ 1e-6`) where the level set cannot be localized.
 */
export function positionSigma(
  sigmaAlpha: number,
  gradient: number,
  sigmaModel = SIGMA_MODEL,
): number {
  const noise = gradient <= 1e-6 ? 4 : sigmaAlpha / gradient
  return Math.min(Math.max(Math.hypot(noise, sigmaModel), 1e-3), 4)
}

/**
 * {@link estimateNoise} of an image's Rec. 709 luminance composited over white (a premultiplied
 * color over white is `c + 1 − α`).
 */
export function imageNoise(image: PremultipliedImage): number {
  const { width: w, height: h, data } = image
  const n = w * h
  const gray = new Float32Array(n)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const clear = 1 - data[p + 3]
    gray[i] =
      0.2126 * (data[p] + clear) + 0.7152 * (data[p + 1] + clear) + 0.0722 * (data[p + 2] + clear)
  }
  return estimateNoise(gray, w, h)
}

/**
 * Distance from the center of a pixel with coverage `a` to a straight edge crossing it, signed
 * towards the side where coverage falls, for an edge whose unit normal has components
 * `na ≥ nb ≥ 0` (the larger and smaller of `|nx|`, `|ny|`).
 *
 * Inverts the exact area of a unit square cut by a half-plane (box-filter coverage). With the
 * edge at distance `t` from the center the covered area is linear, `a = ½ + t/na`, while the
 * edge enters and leaves by two opposite sides (`|t| ≤ (na − nb)/2`), and quadratic once it
 * clips a corner: `1 − a = (d₂ − t)² / (2·na·nb)` with `d₂ = (na + nb)/2`. On an axis only the
 * linear branch applies, at 45° only the quadratic one.
 */
export function edgeOffset(a: number, na: number, nb: number): number {
  const fuller = a >= 0.5
  const hi = fuller ? a : 1 - a
  const d1 = 0.5 * (na - nb)
  const d2 = 0.5 * (na + nb)
  const d =
    hi - 0.5 <= d1 / na ? (hi - 0.5) * na : d2 - Math.sqrt(Math.max(2 * na * nb * (1 - hi), 0))
  return fuller ? d : -d
}

/** Index of point `k + d` of an `n`-point polyline: wrapped when `wrap`, clamped otherwise. */
function windowIndex(k: number, d: number, n: number, wrap: boolean): number {
  const i = k + d
  if (wrap) return ((i % n) + n) % n
  return i < 0 ? 0 : i >= n ? n - 1 : i
}

/**
 * A point's positional uncertainty `base` combined with the local non-linearity of the
 * boundary around it, which a level set on a pixel grid cannot represent (it bevels corners).
 *
 * Over the `2W + 1` points centered on `k` (`W = 3`; wrapping when `wrap`, clamped otherwise):
 *
 * ```text
 *     r           = distance of p_k from the window's total-least-squares line
 *     c_i         = (p_i − p_{i−1}) × (p_{i+1} − p_i)        (signed turn at each inner point)
 *     consistency = |Σ c_i| / Σ |c_i|                         (1 for an arc, 0 for a staircase)
 *     σ           = hypot(base, min(0.35 · r · (1 − consistency), 0.354))
 * ```
 *
 * so consistent turning (a real curve) is not read as uncertainty and a corner bevel is.
 * Returns `base` for a polyline of fewer than `2W + 3` points or a degenerate window.
 */
export function inflateForCurvature(
  pts: Float64Array,
  k: number,
  base: number,
  wrap: boolean,
): number {
  const n = pts.length >> 1
  const w = LINEARITY_WINDOW
  if (n < 2 * w + 3) return base
  const m = 2 * w + 1
  let mx = 0
  let my = 0
  for (let d = -w; d <= w; d++) {
    const i = windowIndex(k, d, n, wrap)
    mx += pts[2 * i]
    my += pts[2 * i + 1]
  }
  mx /= m
  my /= m
  let cxx = 0
  let cyy = 0
  let cxy = 0
  for (let d = -w; d <= w; d++) {
    const i = windowIndex(k, d, n, wrap)
    const dx = pts[2 * i] - mx
    const dy = pts[2 * i + 1] - my
    cxx += dx * dx
    cyy += dy * dy
    cxy += dx * dy
  }
  const tr = cxx + cyy
  const diff = cxx - cyy
  const disc = Math.sqrt(Math.max(diff * diff + 4 * cxy * cxy, 0))
  const major = 0.5 * (tr + disc)
  let ux: number
  let uy: number
  if (Math.abs(cxy) > 1e-12) {
    ux = major - cyy
    uy = cxy
  } else if (cxx >= cyy) {
    ux = 1
    uy = 0
  } else {
    ux = 0
    uy = 1
  }
  const nrm = Math.hypot(ux, uy)
  if (nrm <= 1e-12) return base
  ux /= nrm
  uy /= nrm
  const residual = Math.abs((pts[2 * k] - mx) * uy - (pts[2 * k + 1] - my) * ux)

  let turnSum = 0
  let turnAbs = 0
  for (let d = -(w - 1); d <= w - 1; d++) {
    const a = windowIndex(k, d - 1, n, wrap)
    const b = windowIndex(k, d, n, wrap)
    const c = windowIndex(k, d + 1, n, wrap)
    const bx = pts[2 * b]
    const by = pts[2 * b + 1]
    const cross =
      (bx - pts[2 * a]) * (pts[2 * c + 1] - by) - (by - pts[2 * a + 1]) * (pts[2 * c] - bx)
    turnSum += cross
    turnAbs += Math.abs(cross)
  }
  const consistency = turnAbs > 1e-12 ? Math.min(Math.max(Math.abs(turnSum) / turnAbs, 0), 1) : 0
  const wobble = residual * (1 - consistency)
  return Math.hypot(base, Math.min(NONLINEARITY_GAIN * wobble, MAX_CURVATURE_SIGMA))
}

/** Euclidean distance between two four-channel colors. */
function separation(p: Float64Array, q: Float64Array): number {
  const d0 = p[0] - q[0]
  const d1 = p[1] - q[1]
  const d2 = p[2] - q[2]
  const d3 = p[3] - q[3]
  return Math.sqrt(d0 * d0 + d1 * d1 + d2 * d2 + d3 * d3)
}

/** A fill's color at `(x, y)` into `out`: a gradient evaluated there, else its flat color. */
function fillAt(fill: FaceFill, x: number, y: number, out: Float64Array): void {
  if (fill.at !== undefined) {
    fill.at(x, y, out)
    return
  }
  flatOf(fill, out)
}

/** A fill's flat color (a gradient's mean) into `out`. */
function flatOf(fill: FaceFill, out: Float64Array): void {
  out[0] = fill.r
  out[1] = fill.g
  out[2] = fill.b
  out[3] = fill.a
}

/** Round half away from zero (Rust's `f64::round`). */
function roundHalfAway(v: number): number {
  return v < 0 ? -Math.round(-v) : Math.round(v)
}

/**
 * The per-point measurement over one image, with its scratch state: the unmixing axis of the
 * point being measured, its probes, and sample buffers, so measuring a point allocates nothing.
 */
class Refiner {
  readonly w: number
  readonly h: number
  readonly data: Float32Array
  readonly sigmaNoise: number
  readonly minContrast: number
  readonly simplifyFaint: boolean

  /** Left face's color at the point (coverage 1), premultiplied RGBA. */
  readonly ca = new Float64Array(4)
  /** Right face's color at the point (coverage 0). */
  readonly cb = new Float64Array(4)
  /** Scratch for the faces' mean colors. */
  readonly ra = new Float64Array(4)
  readonly rb = new Float64Array(4)
  /** `ca − cb`, `|ca − cb|²` and `|ca − cb|`. */
  readonly d = new Float64Array(4)
  dd = 0
  contrast = 0

  /** Probes along the normal, sorted by `s`: position `s` (px from the point) and coverage. */
  readonly probeS = new Float64Array(PROBE_OFFSETS.length)
  readonly probeA = new Float64Array(PROBE_OFFSETS.length)
  probeCount = 0

  /** The last measured point: moved position and σ before the curvature inflation. */
  outX = 0
  outY = 0
  outSigma = 0

  constructor(image: PremultipliedImage, sigmaNoise: number, simplifyFaint: boolean) {
    this.w = image.width
    this.h = image.height
    this.data = image.data
    this.sigmaNoise = sigmaNoise
    this.minContrast = Math.max(3 * sigmaNoise, MIN_UNMIX_CONTRAST)
    this.simplifyFaint = simplifyFaint
  }

  /**
   * The unmixing axis between fills `fa` (left) and `fb` (right) at `(x, y)`: what each fill
   * predicts there, or, when a face has a gradient and the faces' mean colors separate them
   * further, those (inkvec `unmix_pair`: a real edge wants the local prediction, a seam inside
   * one ramp the band representatives).
   */
  axisAt(fa: FaceFill, fb: FaceFill, x: number, y: number): void {
    const { ca, cb, d } = this
    fillAt(fa, x, y, ca)
    fillAt(fb, x, y, cb)
    let contrast = separation(ca, cb)
    if (fa.at !== undefined || fb.at !== undefined) {
      const { ra, rb } = this
      flatOf(fa, ra)
      flatOf(fb, rb)
      const rep = separation(ra, rb)
      if (rep > contrast) {
        ca.set(ra)
        cb.set(rb)
        contrast = rep
      }
    }
    d[0] = ca[0] - cb[0]
    d[1] = ca[1] - cb[1]
    d[2] = ca[2] - cb[2]
    d[3] = ca[3] - cb[3]
    this.dd = d[0] * d[0] + d[1] * d[1] + d[2] * d[2] + d[3] * d[3]
    this.contrast = contrast
  }

  /** Coverage of the left face given a color `(p0, p1, p2, p3)`, clamped to `[0, 1]`. */
  project(p0: number, p1: number, p2: number, p3: number): number {
    const { cb, d } = this
    const v =
      ((p0 - cb[0]) * d[0] + (p1 - cb[1]) * d[1] + (p2 - cb[2]) * d[2] + (p3 - cb[3]) * d[3]) /
      this.dd
    return v < 0 ? 0 : v > 1 ? 1 : v
  }

  /** Coverage of pixel `(i, j)` (inside the image). */
  pixelCoverage(i: number, j: number): number {
    const p = 4 * (j * this.w + i)
    const data = this.data
    return this.project(data[p], data[p + 1], data[p + 2], data[p + 3])
  }

  /**
   * Coverage of the bilinearly interpolated image at `(x, y)`. The taps are the four pixel
   * centers around the point — pixel `(i, j)` sits at `(i + ½, j + ½)` — and taps outside the
   * image are dropped with the remaining weights renormalized. {@link NONE} when no tap lands
   * inside.
   */
  coverageAt(x: number, y: number): number {
    const fx = x - 0.5
    const fy = y - 0.5
    const x0 = Math.floor(fx)
    const y0 = Math.floor(fy)
    const tx = fx - x0
    const ty = fy - y0
    const { w, h, data } = this
    let s0 = 0
    let s1 = 0
    let s2 = 0
    let s3 = 0
    let wsum = 0
    for (let tap = 0; tap < 4; tap++) {
      const dx = tap & 1
      const dy = tap >> 1
      const sx = x0 + dx
      const sy = y0 + dy
      if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue
      const wt = (dx === 1 ? tx : 1 - tx) * (dy === 1 ? ty : 1 - ty)
      const p = 4 * (sy * w + sx)
      s0 += data[p] * wt
      s1 += data[p + 1] * wt
      s2 += data[p + 2] * wt
      s3 += data[p + 3] * wt
      wsum += wt
    }
    if (wsum <= 1e-6) return NONE
    return this.project(s0 / wsum, s1 / wsum, s2 / wsum, s3 / wsum)
  }

  /**
   * Coverage at the centers of the pixels the normal through `(px, py)` passes through: probes
   * at `u = −1, −½, 0, ½, 1` px along the unit normal, each in the pixel it lands in (rounded as
   * inkvec rounds, half away from zero in its pixel-center frame); one entry per distinct signed
   * position `s` of a pixel center along the normal, sorted by `s`. Pixels outside the image
   * are skipped.
   */
  probe(px: number, py: number, nx: number, ny: number): void {
    const { probeS, probeA, w, h } = this
    let m = 0
    for (const u of PROBE_OFFSETS) {
      const i = roundHalfAway(px + nx * u - 0.5)
      const j = roundHalfAway(py + ny * u - 0.5)
      if (i < 0 || j < 0 || i >= w || j >= h) continue
      const s = (i + 0.5 - px) * nx + (j + 0.5 - py) * ny
      let seen = false
      for (let q = 0; q < m; q++) {
        if (Math.abs(probeS[q] - s) < 1e-9) {
          seen = true
          break
        }
      }
      if (seen) continue
      const a = this.pixelCoverage(i, j)
      // Insert sorted by `s`, after any equal one (a stable sort).
      let at = m
      while (at > 0 && probeS[at - 1] > s) {
        probeS[at] = probeS[at - 1]
        probeA[at] = probeA[at - 1]
        at--
      }
      probeS[at] = s
      probeA[at] = a
      m++
    }
    this.probeCount = m
  }

  /**
   * The edge's offset along the normal read directly from the partially covered probes,
   * assuming a step profile; `NaN` when no probe is informative. `dir` is the sign of the
   * coverage slope along the normal (0 when there is none).
   *
   * Only the two probes that bracket the ½ crossing take part: both partial, the crossing is
   * interpolated between their centers (unbiased however wide a slanted edge spreads its ramp);
   * one partial, it is inverted exactly ({@link edgeOffset}); both saturated, the edge is between
   * them. A partial pixel further out may be partial because of another edge (a thin stroke), so
   * it is not averaged in. With no bracket, every partial probe votes, weighted by how close to
   * ½ it reads.
   */
  invertStep(dir: number, nx: number, ny: number): number {
    const ax = Math.abs(nx)
    const ay = Math.abs(ny)
    const na = ax >= ay ? ax : ay
    const nb = ax >= ay ? ay : ax
    const { probeS: s, probeA: a, probeCount: m } = this
    let bracket = -1
    if (dir !== 0) {
      for (let i = 0; i + 1 < m; i++) {
        if ((a[i] - 0.5) * (a[i + 1] - 0.5) <= 0 && Math.abs(a[i + 1] - a[i]) > 1e-9) {
          bracket = i
          break
        }
      }
    }
    let est = 0
    let wsum = 0
    if (bracket >= 0) {
      const u0 = s[bracket]
      const a0 = a[bracket]
      const u1 = s[bracket + 1]
      const a1 = a[bracket + 1]
      const p0 = a0 > 0.03 && a0 < 0.97
      const p1 = a1 > 0.03 && a1 < 0.97
      if (p0 && p1) est = u0 + ((u1 - u0) * (0.5 - a0)) / (a1 - a0)
      else if (p0) est = u0 - dir * edgeOffset(a0, na, nb)
      else if (p1) est = u1 - dir * edgeOffset(a1, na, nb)
      else est = 0.5 * (u0 + u1)
      wsum = 1
    } else if (dir !== 0) {
      for (let i = 0; i < m; i++) {
        const ai = a[i]
        if (ai > 0.03 && ai < 0.97) {
          const wgt = 1 - Math.abs(ai - 0.5) * 2
          est += wgt * (s[i] - dir * edgeOffset(ai, na, nb))
          wsum += wgt
        }
      }
    }
    return wsum > 1e-9 ? est / wsum : Number.NaN
  }

  /**
   * Whether the probes are a clean step the inversion can be trusted on: not a corner, at least
   * three probes, flat fills both sides, a monotone profile (within 0.05; a one-pixel ridge is
   * not), saturated at both ends (min below 0.12, max above 0.88; a ramp is not), and a contrast
   * of at least twice the unmixing threshold.
   */
  isStepLike(corner: boolean, bothFlat: boolean): boolean {
    const { probeA: a, probeCount: m } = this
    let inc = true
    let dec = true
    let lo = 1
    let hi = 0
    for (let i = 0; i < m; i++) {
      if (i > 0) {
        if (!(a[i] >= a[i - 1] - 0.05)) inc = false
        if (!(a[i] <= a[i - 1] + 0.05)) dec = false
      }
      lo = Math.min(lo, a[i])
      hi = Math.max(hi, a[i])
    }
    return (
      !corner &&
      m >= 3 &&
      bothFlat &&
      (inc || dec) &&
      lo < 0.12 &&
      hi > 0.88 &&
      this.contrast >= 2 * this.minContrast
    )
  }

  /**
   * The first ½ crossing of the interpolated coverage along the normal, linearly interpolated
   * between ten bilinear samples evenly spaced over `u ∈ [−1, 1]` px; `NaN` when coverage
   * never crosses ½ there.
   */
  rootFindHalf(px: number, py: number, nx: number, ny: number): number {
    let havePrev = false
    let pu = 0
    let pa = 0
    for (let s = 0; s <= ROOT_STEPS; s++) {
      const u = -1 + (2 * s) / ROOT_STEPS
      const a = this.coverageAt(px + nx * u, py + ny * u)
      if (a === NONE) continue
      if (havePrev && (pa - 0.5) * (a - 0.5) <= 0 && Math.abs(a - pa) > 1e-9) {
        return pu + ((u - pu) * (0.5 - pa)) / (a - pa)
      }
      pu = u
      pa = a
      havePrev = true
    }
    return Number.NaN
  }

  /**
   * Positional uncertainty of the point `(px, py)` with normal `(nx, ny)`, in px: noise over
   * contrast is coverage uncertainty, over the coverage change across one pixel along the
   * normal it is position, combined in quadrature with {@link SIGMA_MODEL}:
   *
   * ```text
   *     g = max(|a(p + n/2) − a(p − n/2)|, 0.001)
   *     σ = clamp(max(hypot(σ_noise / contrast / g, σ_model) · v, 0), 0.02, 2)
   * ```
   *
   * with `v` the faint-boundary inflation `clamp(0.25 / contrast, 1, 4)` when `simplifyFaint`,
   * else 1. A sample outside the image reads 0 on the near side and 1 on the far side.
   */
  vertexSigma(px: number, py: number, nx: number, ny: number): number {
    let a0 = this.coverageAt(px - nx * 0.5, py - ny * 0.5)
    if (a0 === NONE) a0 = 0
    let a1 = this.coverageAt(px + nx * 0.5, py + ny * 0.5)
    if (a1 === NONE) a1 = 1
    const g = Math.max(Math.abs(a1 - a0), 1e-3)
    const contrast = this.contrast
    const s = this.sigmaNoise / contrast / g
    const visibility = this.simplifyFaint
      ? Math.min(Math.max(CONTRAST_REF / Math.max(contrast, 1e-6), 1), MAX_INFLATION)
      : 1
    let sigma = Math.hypot(s, SIGMA_MODEL) * visibility
    if (!(sigma >= SIGMA_FLOOR)) sigma = SIGMA_FLOOR
    return Math.min(Math.max(sigma, SIGMA_MIN), SIGMA_MAX)
  }

  /**
   * Measure point `k` of an `n`-point edge between `fa` (left) and `fb` (right) into
   * `outX`, `outY`, `outSigma`: the normal from the chord between its neighbors, the unmixing
   * axis at the point, the probes; a clean step between flat fills inverted, anything else
   * root-found; the shift along the normal clamped to ±1 px. A point with no usable normal or
   * no contrast stays where it is at σ {@link GRID_SIGMA}.
   */
  measurePoint(pts: Float64Array, n: number, k: number, fa: FaceFill, fb: FaceFill): void {
    const px = pts[2 * k]
    const py = pts[2 * k + 1]
    let ia = Math.max(k - SUBPX_WIN, 0)
    let ib = Math.min(k + SUBPX_WIN, n - 1)
    let corner = false
    if (SUBPX_WIN > 1) {
      const c0x = px - pts[2 * ia]
      const c0y = py - pts[2 * ia + 1]
      const c1x = pts[2 * ib] - px
      const c1y = pts[2 * ib + 1] - py
      const l0 = Math.hypot(c0x, c0y)
      const l1 = Math.hypot(c1x, c1y)
      corner = l0 > 1e-9 && l1 > 1e-9 && (c0x * c1x + c0y * c1y) / (l0 * l1) < CORNER_COS
      if (corner) {
        ia = Math.max(k - 1, 0)
        ib = Math.min(k + 1, n - 1)
      }
    }
    const tx = pts[2 * ib] - pts[2 * ia]
    const ty = pts[2 * ib + 1] - pts[2 * ia + 1]
    const tl = Math.hypot(tx, ty)
    this.axisAt(fa, fb, px, py)
    if (tl < 1e-9 || this.contrast < this.minContrast) {
      this.outX = px
      this.outY = py
      this.outSigma = GRID_SIGMA
      return
    }
    const nx = -ty / tl
    const ny = tx / tl

    this.probe(px, py, nx, ny)
    // Which way coverage grows along the normal.
    const m = this.probeCount
    let dir = 0
    if (m > 0) {
      const first = this.probeA[0]
      const last = this.probeA[m - 1]
      if (this.probeS[m - 1] > this.probeS[0] && Math.abs(last - first) > 0.05) {
        dir = last > first ? 1 : -1
      }
    }
    let hit = this.invertStep(dir, nx, ny)
    // The inversion needs two flat fills: against a gradient the unmixing colors are a local
    // prediction whose error moves coverage enough to misplace an inverted edge.
    const bothFlat = fa.at === undefined && fb.at === undefined
    if (!this.isStepLike(corner, bothFlat)) hit = this.rootFindHalf(px, py, nx, ny)

    const shift = Number.isNaN(hit) ? 0 : Math.min(Math.max(hit, -1), 1)
    this.outX = px + nx * shift
    this.outY = py + ny * shift
    this.outSigma = this.vertexSigma(px, py, nx, ny)
  }

  /**
   * Measure every point of edge `e` between `fa` (left) and `fb` (right), then inflate each σ
   * by the moved boundary's local non-linearity. A fixed point (a node) is measured too, for
   * its neighbors' inflation window, but keeps its position and σ.
   */
  measureEdge(e: PlanarEdge, fa: FaceFill, fb: FaceFill): MeasuredEdge {
    const pts = e.points
    const n = pts.length >> 1
    const moved = new Float64Array(2 * n)
    const base = new Float64Array(n)
    for (let k = 0; k < n; k++) {
      this.measurePoint(pts, n, k, fa, fb)
      moved[2 * k] = this.outX
      moved[2 * k + 1] = this.outY
      base[k] = this.outSigma
    }
    const sigma = new Float64Array(n)
    for (let k = 0; k < n; k++) sigma[k] = inflateForCurvature(moved, k, base[k], e.closed)
    for (let k = 0; k < n; k++) {
      if (e.fixed[k] === 0) continue
      moved[2 * k] = pts[2 * k]
      moved[2 * k + 1] = pts[2 * k + 1]
      sigma[k] = e.sigma[k]
    }
    return { points: moved, sigma }
  }
}

/**
 * Measure the sub-pixel position and σ of every boundary point of `map` against `image`
 * (premultiplied RGBA, the map's size), unmixing each edge's two faces by `fills[face]`,
 * without changing the map. Edges with {@link OUTSIDE} on a side, or a face without a fill,
 * come back `null`. Each moved point is at most 1 px from where it started; fixed points keep
 * their position and σ.
 */
export function measureSubpixel(
  map: PlanarMap,
  image: PremultipliedImage,
  fills: readonly FaceFill[],
  opts: SubpixelOptions = {},
): SubpixelMeasurement {
  if (image.width !== map.width || image.height !== map.height) {
    throw new Error('measureSubpixel: the image is not the size of the map')
  }
  const sigmaNoise = opts.sigmaNoise ?? imageNoise(image)
  const refiner = new Refiner(image, sigmaNoise, opts.simplifyFaint ?? false)
  const edges: (MeasuredEdge | null)[] = []
  for (const e of map.edges) {
    const fa = e.left === OUTSIDE ? undefined : fills[e.left]
    const fb = e.right === OUTSIDE ? undefined : fills[e.right]
    edges.push(fa === undefined || fb === undefined ? null : refiner.measureEdge(e, fa, fb))
  }
  return { edges }
}

/**
 * Write a measurement into the map it was measured on (same edges, same order): each measured
 * edge takes the measured points and σ; a `null` edge is left as it is.
 */
export function applySubpixel(map: PlanarMap, measured: SubpixelMeasurement): void {
  const { edges } = measured
  if (edges.length !== map.edges.length) {
    throw new Error('applySubpixel: the measurement is not of this map')
  }
  for (let k = 0; k < edges.length; k++) {
    const r = edges[k]
    if (r === null) continue
    const e = map.edges[k]
    e.points = r.points
    e.sigma = r.sigma
  }
}

/** {@link measureSubpixel} then {@link applySubpixel}. */
export function refineSubpixel(
  map: PlanarMap,
  image: PremultipliedImage,
  fills: readonly FaceFill[],
  opts: SubpixelOptions = {},
): void {
  applySubpixel(map, measureSubpixel(map, image, fills, opts))
}
