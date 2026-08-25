/**
 * Gradient detection: find posterized color ramps and describe them as single
 * linear gradients. After quantization has split a smooth ramp into several
 * adjacent flat bands, this merges the bands that lie on one linear Oklab ramp
 * into a single region and returns a `<linearGradient>` paint for it. Geometry
 * is untouched (mesh-free) — only the fill changes — so the tracer, the cutout
 * seam-free partition and the stacked layer build are unaffected.
 *
 * The fit is closed-form and deterministic: per-label moment sums make every
 * candidate union's linear fit O(1), the ramp direction is the leading
 * eigenvector of the position→color cross-covariance, and the stops are the
 * fitted colors at the region's projected extremes. Reference: Du et al., "Image
 * Vectorization and Editing via Linear Gradient Layer Decomposition", ACM TOG
 * (SIGGRAPH) 42(4), 2023 (the linear case).
 */

import { deltaEOk, oklabToHex } from '@trazor/core'
import type { GradientPaint, LabelMap, RasterImage } from '@trazor/core'
import { toOklabBuffer } from './convert'

export interface GradientOptions {
  /** Minimum pixel area of a merged ramp for it to become a gradient. Default 0. */
  minArea?: number
  /** Interleaved Oklab buffer for `image` (length w*h*3); computed if absent. */
  oklab?: Float32Array
}

export interface GradientResult {
  /**
   * Per-label paint, indexed by the (rewritten) label: a `GradientPaint` for a
   * label that now covers a detected ramp, else `null` (keep the flat fill).
   * Length is `labels.count`.
   */
  gradients: (GradientPaint | null)[]
}

/** Mean per-pixel Oklab distance to the ramp above which a fit is rejected. */
const MAX_RESIDUAL = 0.03
/** Fraction of position→color energy on the principal axis required (1-D ramp). */
const MIN_DIRECTIONALITY = 0.88
/** Total Oklab distance across the ramp below which the region is treated as flat. */
const MIN_COLOR_SPAN = 0.06
/** A ramp must merge at least this many quantized bands. */
const MIN_MEMBERS = 2

// Moment layout per label (Σ over the label's pixels; positions are pixel centers).
// 0:n 1:Σx 2:Σy 3:Σxx 4:Σxy 5:Σyy 6:ΣL 7:Σa 8:Σb 9:ΣLL 10:Σaa 11:Σbb
// 12:ΣLx 13:ΣLy 14:Σax 15:Σay 16:Σbx 17:Σby
const NM = 18

/** A linear ramp fitted from a moment vector: direction, per-channel line, error. */
interface RampFit {
  dx: number
  dy: number
  g0: [number, number, number]
  g1: [number, number, number]
  /** Mean Oklab distance of the pixels to the fitted ramp. */
  residual: number
  /** λ1 / (λ1 + λ2) of the position→color cross-covariance; 1 = perfectly 1-D. */
  directionality: number
}

/**
 * Fit `color ≈ g0 + g1·(p·d)` over the pixels summarized by the moment vector at
 * `off`, choosing the position direction `d` that explains the most color
 * variation. Returns null when the region is too small or the fit is degenerate.
 */
function fitRamp(m: Float64Array, off: number): RampFit | null {
  const n = m[off]
  if (n < 3) return null
  const inv = 1 / n
  const mx = m[off + 1] * inv
  const my = m[off + 2] * inv
  const mL = m[off + 6] * inv
  const ma = m[off + 7] * inv
  const mb = m[off + 8] * inv

  // Centered position→color cross-covariance C (2×3), then C·Cᵀ (2×2 symmetric).
  const covXL = m[off + 12] * inv - mx * mL
  const covYL = m[off + 13] * inv - my * mL
  const covXa = m[off + 14] * inv - mx * ma
  const covYa = m[off + 15] * inv - my * ma
  const covXb = m[off + 16] * inv - mx * mb
  const covYb = m[off + 17] * inv - my * mb
  const a00 = covXL * covXL + covXa * covXa + covXb * covXb
  const a01 = covXL * covYL + covXa * covYa + covXb * covYb
  const a11 = covYL * covYL + covYa * covYa + covYb * covYb
  const tr = a00 + a11
  if (tr <= 1e-12) return null
  const det = a00 * a11 - a01 * a01
  const disc = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + disc
  const l2 = tr / 2 - disc
  const directionality = l1 / (l1 + l2)

  // Leading eigenvector of the 2×2 symmetric matrix: (λ1 − a11, a01), with an
  // axis-aligned fallback when the off-diagonal vanishes.
  let dx: number
  let dy: number
  if (Math.abs(a01) > 1e-12) {
    dx = l1 - a11
    dy = a01
  } else if (a00 >= a11) {
    dx = 1
    dy = 0
  } else {
    dx = 0
    dy = 1
  }
  const dn = Math.hypot(dx, dy)
  if (dn < 1e-12) return null
  dx /= dn
  dy /= dn

  // 1-D regression of each channel on the scalar s = d·p (moments only).
  const Ss = dx * m[off + 1] + dy * m[off + 2]
  const Sss = dx * dx * m[off + 3] + 2 * dx * dy * m[off + 4] + dy * dy * m[off + 5]
  const det2 = n * Sss - Ss * Ss
  if (Math.abs(det2) < 1e-9) return null
  const idet = 1 / det2

  const g0: [number, number, number] = [0, 0, 0]
  const g1: [number, number, number] = [0, 0, 0]
  let rss = 0
  // Channel c: Σc at m[off+6+c], Σc·x at m[off+12+2c], Σc·y at m[off+13+2c], Σc² at m[off+9+c].
  for (let c = 0; c < 3; c++) {
    const Sc = m[off + 6 + c]
    const Scs = dx * m[off + 12 + 2 * c] + dy * m[off + 13 + 2 * c]
    const b0 = (Sss * Sc - Ss * Scs) * idet
    const b1 = (n * Scs - Ss * Sc) * idet
    g0[c] = b0
    g1[c] = b1
    rss += Math.max(0, m[off + 9 + c] - (b0 * Sc + b1 * Scs))
  }
  return { dx, dy, g0, g1, residual: Math.sqrt(rss * inv), directionality }
}

/** True when a fit is a usable ramp (accurate enough and directional enough). */
function isRamp(fit: RampFit | null): fit is RampFit {
  return fit !== null && fit.residual <= MAX_RESIDUAL && fit.directionality >= MIN_DIRECTIONALITY
}

/**
 * Detect linear color ramps in a cleaned label map. Adjacent quantized bands
 * that lie on one Oklab ramp are relabeled into a single representative label
 * (mutating `labels`), and the returned `gradients[rep]` holds that region's
 * `<linearGradient>`. Bands that do not form a ramp are left untouched, so a run
 * with no detectable ramp returns all-`null` and leaves `labels` unchanged.
 */
export function fitRegionGradients(
  image: RasterImage,
  labels: LabelMap,
  opts?: GradientOptions,
): GradientResult {
  const { width, height, count } = labels
  const data = labels.data
  const gradients: (GradientPaint | null)[] = new Array(count).fill(null)
  if (count < MIN_MEMBERS) return { gradients }

  const minArea = opts?.minArea ?? 0
  const ok = opts?.oklab ?? toOklabBuffer(image)

  // ---- per-label moment sums (one pass) ----
  const m = new Float64Array(count * NM)
  const counts = new Uint32Array(count)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const l = data[p]
      if (l < 0) continue
      counts[l]++
      const cx = x + 0.5
      const cy = y + 0.5
      const base = p * 3
      const L = ok[base]
      const A = ok[base + 1]
      const B = ok[base + 2]
      const o = l * NM
      m[o] += 1
      m[o + 1] += cx
      m[o + 2] += cy
      m[o + 3] += cx * cx
      m[o + 4] += cx * cy
      m[o + 5] += cy * cy
      m[o + 6] += L
      m[o + 7] += A
      m[o + 8] += B
      m[o + 9] += L * L
      m[o + 10] += A * A
      m[o + 11] += B * B
      m[o + 12] += L * cx
      m[o + 13] += L * cy
      m[o + 14] += A * cx
      m[o + 15] += A * cy
      m[o + 16] += B * cx
      m[o + 17] += B * cy
    }
  }

  // ---- label adjacency (4-connected), as sorted neighbor lists ----
  const adjSets: Set<number>[] = Array.from({ length: count }, () => new Set<number>())
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x
      const l = data[p]
      if (l < 0) continue
      if (x + 1 < width) {
        const r = data[p + 1]
        if (r >= 0 && r !== l) {
          adjSets[l].add(r)
          adjSets[r].add(l)
        }
      }
      if (y + 1 < height) {
        const d = data[p + width]
        if (d >= 0 && d !== l) {
          adjSets[l].add(d)
          adjSets[d].add(l)
        }
      }
    }
  }
  const adj: number[][] = adjSets.map((s) => [...s].toSorted((a, b) => a - b))

  // ---- greedy ramp growth: largest band first, add the adjacent band that
  // keeps the union the tightest ramp (moment-only O(1) trials) ----
  const seeds: number[] = []
  for (let l = 0; l < count; l++) if (counts[l] > 0) seeds.push(l)
  seeds.sort((a, b) => counts[b] - counts[a] || a - b)

  const taken = new Int32Array(count).fill(-1)
  const supers: { members: number[]; rep: number; fit: RampFit }[] = []
  const acc = new Float64Array(NM)
  const trial = new Float64Array(NM)

  for (const seed of seeds) {
    if (taken[seed] >= 0) continue
    for (let j = 0; j < NM; j++) acc[j] = m[seed * NM + j]
    const members = [seed]
    taken[seed] = 1

    for (;;) {
      let best = -1
      let bestResidual = Infinity
      const seen = new Set<number>()
      for (const mem of members) {
        for (const nb of adj[mem]) {
          if (taken[nb] >= 0 || seen.has(nb)) continue
          seen.add(nb)
          for (let j = 0; j < NM; j++) trial[j] = acc[j] + m[nb * NM + j]
          const f = fitRamp(trial, 0)
          if (isRamp(f) && f.residual < bestResidual) {
            bestResidual = f.residual
            best = nb
          }
        }
      }
      if (best < 0) break
      for (let j = 0; j < NM; j++) acc[j] += m[best * NM + j]
      members.push(best)
      taken[best] = 1
    }

    if (members.length < MIN_MEMBERS) continue
    if (acc[0] < minArea) continue
    const fit = fitRamp(acc, 0)
    if (!isRamp(fit)) continue
    let rep = members[0]
    for (const mem of members) if (mem < rep) rep = mem
    supers.push({ members: members.slice(), rep, fit })
  }

  if (supers.length === 0) return { gradients }

  // ---- projected extent per candidate ramp (one pass, no relabel yet) ----
  const repOf = new Int32Array(count).fill(-1)
  const meta = new Map<number, { fit: RampFit; smin: number; smax: number }>()
  for (const s of supers) {
    for (const mem of s.members) repOf[mem] = s.rep
    meta.set(s.rep, { fit: s.fit, smin: Infinity, smax: -Infinity })
  }
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const rep = repOf[data[y * width + x]]
      if (rep < 0) continue
      const info = meta.get(rep) as { fit: RampFit; smin: number; smax: number }
      const s = info.fit.dx * (x + 0.5) + info.fit.dy * (y + 0.5)
      if (s < info.smin) info.smin = s
      if (s > info.smax) info.smax = s
    }
  }

  // ---- accept ramps with a real color span; build paints; relabel accepted ----
  const finalRep = new Int32Array(count).fill(-1)
  for (const s of supers) {
    const info = meta.get(s.rep) as { fit: RampFit; smin: number; smax: number }
    const span = info.smax - info.smin
    if (!(span > 1e-6)) continue
    const { g0, g1, dx, dy } = info.fit
    const cLo: [number, number, number] = [
      g0[0] + g1[0] * info.smin,
      g0[1] + g1[1] * info.smin,
      g0[2] + g1[2] * info.smin,
    ]
    const cHi: [number, number, number] = [
      g0[0] + g1[0] * info.smax,
      g0[1] + g1[1] * info.smax,
      g0[2] + g1[2] * info.smax,
    ]
    if (deltaEOk(cLo[0], cLo[1], cLo[2], cHi[0], cHi[1], cHi[2]) < MIN_COLOR_SPAN) continue

    // Centroid of the ramp, from the members' moments (`acc` was reused by later
    // seeds and no longer holds this super's sums).
    let sn = 0
    let sx = 0
    let sy = 0
    for (const mem of s.members) {
      sn += m[mem * NM]
      sx += m[mem * NM + 1]
      sy += m[mem * NM + 2]
    }
    const cx = sx / sn
    const cy = sy / sn
    const sc = dx * cx + dy * cy
    const x1 = cx + (info.smin - sc) * dx
    const y1 = cy + (info.smin - sc) * dy
    const x2 = cx + (info.smax - sc) * dx
    const y2 = cy + (info.smax - sc) * dy
    gradients[s.rep] = {
      kind: 'linear',
      x1,
      y1,
      x2,
      y2,
      stops: [
        { offset: 0, color: oklabToHex(cLo[0], cLo[1], cLo[2]) },
        { offset: 1, color: oklabToHex(cHi[0], cHi[1], cHi[2]) },
      ],
    }
    for (const mem of s.members) finalRep[mem] = s.rep
  }

  // Relabel merged bands to their representative so the tracer sees one region.
  let any = false
  for (let l = 0; l < count; l++) if (finalRep[l] >= 0) any = true
  if (any) {
    for (let p = 0; p < data.length; p++) {
      const l = data[p]
      if (l >= 0 && finalRep[l] >= 0) data[p] = finalRep[l]
    }
  }

  return { gradients }
}
