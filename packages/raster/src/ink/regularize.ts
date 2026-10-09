/**
 * How far the pixels sit from their inks once labeled, and a spatial relabeling that trades
 * that color residual against boundary length.
 *
 * {@link residualSigma} measures the noise against the labels (interior pixels against
 * their own ink, boundary pixels against the segment to a neighboring ink, so the
 * anti-aliasing ramp does not count); {@link residualIncoherence} measures how much of the
 * residual is incoherent from pixel to pixel (damage rather than a smooth ramp);
 * {@link regularizeLabels} is a deterministic four-neighbor Potts descent for explicitly
 * lossy input, where a strong one-pixel feature can pay for its boundary and survive while a
 * weak island cannot. Colors are encoded sRGB in [0, 1]; labels index `inkRgb` (three values
 * per ink) and must all have a color.
 *
 * Method from: the Potts model energy minimized by iterated conditional modes, J. Besag,
 * "On the statistical analysis of dirty pictures", JRSS B 48(3):259–302, 1986.
 * After inkvec (Apache-2.0): `inkvec-trace/src/regularize.rs` (`residual_sigma`,
 * `residual_incoherence`, `labels`, `pixel_descent`, `merge_components`,
 * `flood_component`).
 */
import { NOISE_FLOOR } from '@trazor/core'

/** Largest noise {@link residualSigma} reports, in encoded sRGB: eight display levels. */
export const RESIDUAL_SIGMA_CAP = 8 / 255

/** Fewest samples a population needs before its median is read instead of the floor. */
const MIN_SIGMA_SAMPLES = 32

/** Sweeps of single-pixel descent at most. */
const PIXEL_SWEEPS = 12

/** Passes of whole-component moves at most. */
const MERGE_PASSES = 4

/**
 * Parameters a component costs to describe (a closed three-point path and an RGB fill),
 * each priced at the boundary penalty.
 */
const REGION_PARAMS = 9

/** The element at the median index `⌊n/2⌋` of `v` sorted ascending. */
function median(v: number[]): number {
  const sorted = Float64Array.from(v).toSorted()
  return sorted[sorted.length >> 1]
}

/**
 * Active-region residual noise against the labels, excluding label boundaries' ramps and
 * exact flats. Two populations over pixels one in from the border:
 *
 * - interior pixels (all four neighbors share the label): the RMS-over-channels residual
 *   `sqrt(|I − c|² / 3)` against their own ink, counting only pixels off it by more than
 *   half a level (`|I − c|²/3 > (0.5/255)²`), so exactly flat areas do not vote;
 * - boundary pixels: the distance to the segment between the own ink and a neighboring
 *   ink (the best such neighbor, ignoring inks closer than `1e-8` squared), as
 *   `sqrt(|residual⊥|² / 2)` — the component along the segment is what anti-aliasing
 *   explains, leaving two degrees of freedom.
 *
 * Each population reads its median when it has at least 32 samples, else
 * {@link NOISE_FLOOR}; the result is the larger, clamped to `[NOISE_FLOOR, 8/255]` (the
 * residual includes palette bias, so its influence is limited to eight levels). Images
 * under 3×3 read the floor.
 */
export function residualSigma(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  inkRgb: Float64Array,
): number {
  if (w < 3 || h < 3) return NOISE_FLOOR
  const errors: number[] = []
  const edgeErrors: number[] = []
  const flat = (0.5 / 255) * (0.5 / 255)
  const nbr = new Int32Array(4)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      const l = labels[i]
      const r = rgb[i * 3] - inkRgb[l * 3]
      const g = rgb[i * 3 + 1] - inkRgb[l * 3 + 1]
      const b = rgb[i * 3 + 2] - inkRgb[l * 3 + 2]
      nbr[0] = i - 1
      nbr[1] = i + 1
      nbr[2] = i - w
      nbr[3] = i + w
      if (
        labels[i - 1] === l &&
        labels[i + 1] === l &&
        labels[i - w] === l &&
        labels[i + w] === l
      ) {
        const e = (r * r + g * g + b * b) / 3
        if (e > flat) errors.push(Math.sqrt(e))
        continue
      }
      // Coverage explains any point on the two-ink segment: only the orthogonal residual
      // is evidence of damage. The best neighboring ink.
      let best = Infinity
      for (let k = 0; k < 4; k++) {
        const o = labels[nbr[k]]
        if (o === l) continue
        const dr = inkRgb[o * 3] - inkRgb[l * 3]
        const dg = inkRgb[o * 3 + 1] - inkRgb[l * 3 + 1]
        const db = inkRgb[o * 3 + 2] - inkRgb[l * 3 + 2]
        const norm = dr * dr + dg * dg + db * db
        if (norm < 1e-8) continue
        const t = Math.min(1, Math.max(0, (r * dr + g * dg + b * db) / norm))
        const er = r - t * dr
        const eg = g - t * dg
        const eb = b - t * db
        best = Math.min(best, Math.sqrt((er * er + eg * eg + eb * eb) / 2))
      }
      if (Number.isFinite(best)) edgeErrors.push(best)
    }
  }
  const interior = errors.length >= MIN_SIGMA_SAMPLES ? median(errors) : NOISE_FLOOR
  const edge = edgeErrors.length >= MIN_SIGMA_SAMPLES ? median(edgeErrors) : NOISE_FLOOR
  return Math.min(Math.max(interior, edge, NOISE_FLOOR), RESIDUAL_SIGMA_CAP)
}

/**
 * How much of the color residual is incoherent, in display levels (0–255): a codec-free
 * damage signal. With `r_i = sqrt(|I_i − c(L_i)|² / 3)` each pixel's residual against its
 * own ink and `L` the 4-neighbor Laplacian of `r`,
 *
 * ```text
 *     incoherence = 255 · sqrt(mean(L_i²) / 20)
 * ```
 *
 * over pixels at least two in from the border whose four neighbors share their label (a
 * one-pixel anti-aliasing ramp is incoherent by construction and stays out). A smooth ramp
 * annihilates under the Laplacian; compression, latent-decoder and resampling error do
 * not. The mean square is divided by the kernel's variance gain `4² + 4·1² = 20`, and it is
 * an RMS rather than a median because clean artwork's residual is zero over most of its
 * area. Zero for images under 5×5, short buffers, or fewer than 256 such pixels.
 */
export function residualIncoherence(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  inkRgb: Float64Array,
): number {
  const gain = 20
  const minSamples = 256
  if (w < 5 || h < 5 || rgb.length < w * h * 3 || labels.length < w * h) return 0
  const res = new Float64Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const l = labels[i]
    let e = 0
    for (let c = 0; c < 3; c++) {
      const d = rgb[i * 3 + c] - inkRgb[l * 3 + c]
      e += d * d
    }
    res[i] = Math.sqrt(e / 3)
  }
  let acc = 0
  let n = 0
  for (let y = 2; y < h - 2; y++) {
    for (let x = 2; x < w - 2; x++) {
      const i = y * w + x
      const l = labels[i]
      if (labels[i - 1] !== l || labels[i + 1] !== l || labels[i - w] !== l || labels[i + w] !== l)
        continue
      const lap = 4 * res[i] - res[i - 1] - res[i + 1] - res[i - w] - res[i + w]
      acc += lap * lap
      n++
    }
  }
  if (n < minSamples) return 0
  return Math.sqrt(acc / n / gain) * 255
}

/** Squared encoded-sRGB distance from pixel `i` of `rgb` to ink `l`. */
function inkDist2(rgb: Float32Array, i: number, inkRgb: Float64Array, l: number): number {
  const r = rgb[i * 3] - inkRgb[l * 3]
  const g = rgb[i * 3 + 1] - inkRgb[l * 3 + 1]
  const b = rgb[i * 3 + 2] - inkRgb[l * 3 + 2]
  return r * r + g * g + b * b
}

/**
 * Relabel `labels` in place by a deterministic four-neighbor Potts descent, every change
 * strictly lowering
 *
 * ```text
 *     E(L) = Σ_i |I_i − c(L_i)|²  +  β · #{4-neighbor pairs i~j : L_i ≠ L_j}
 *     β    = 2σ² · ln(max(N, 3)),   N = w·h
 * ```
 *
 * (squared encoded-sRGB distance summed over channels; `β` prices one unit of boundary in
 * noise units at any noise level, growing slowly with the image). Two greedy stages:
 * single-pixel moves (iterated conditional modes), then whole 4-connected components
 * relabeled at once, which removes a weak island whose pixels all agree with each other.
 * Returns the number of pixel label changes.
 */
export function regularizeLabels(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  inkRgb: Float64Array,
  sigma: number,
): number {
  if (w === 0 || h === 0) return 0
  const penalty = 2 * sigma * sigma * Math.log(Math.max(w * h, 3))
  return (
    pixelDescent(rgb, labels, w, h, inkRgb, penalty) +
    mergeComponents(rgb, labels, w, h, inkRgb, penalty)
  )
}

/**
 * Single-pixel moves: each pixel takes whichever of its own and its 4-neighbors' labels
 * minimizes `|I_i − c(l)|² + β·#{neighbors j : L_j ≠ l}`, switching only on a decrease of
 * more than `1e-9` (ties keep the current label, then the earlier neighbor in the order
 * left, right, up, down). Every boundary pair touching the pixel is in that local sum, so a
 * switch lowers the global energy by the same amount. Two checkerboard half-sweeps per
 * sweep (red–black order), at most 12 sweeps, stopping on a sweep with no change. Returns
 * the number of changes.
 */
function pixelDescent(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  inkRgb: Float64Array,
  penalty: number,
): number {
  const nbr = new Int32Array(4)
  let changes = 0
  for (let sweep = 0; sweep < PIXEL_SWEEPS; sweep++) {
    let moved = 0
    for (let parity = 0; parity < 2; parity++) {
      for (let y = 0; y < h; y++) {
        for (let x = (y + parity) & 1; x < w; x += 2) {
          const i = y * w + x
          let nn = 0
          if (x > 0) nbr[nn++] = i - 1
          if (x + 1 < w) nbr[nn++] = i + 1
          if (y > 0) nbr[nn++] = i - w
          if (y + 1 < h) nbr[nn++] = i + w
          let best = labels[i]
          let cost = localEnergy(rgb, labels, inkRgb, i, best, nbr, nn, penalty)
          for (let k = 0; k < nn; k++) {
            const l = labels[nbr[k]]
            const e = localEnergy(rgb, labels, inkRgb, i, l, nbr, nn, penalty)
            if (e + 1e-9 < cost) {
              cost = e
              best = l
            }
          }
          if (best !== labels[i]) {
            labels[i] = best
            moved++
          }
        }
      }
    }
    changes += moved
    if (moved === 0) break
  }
  return changes
}

/** Pixel `i`'s share of the energy under label `l`: its color term plus its boundary pairs. */
function localEnergy(
  rgb: Float32Array,
  labels: Int32Array,
  inkRgb: Float64Array,
  i: number,
  l: number,
  nbr: Int32Array,
  nn: number,
  penalty: number,
): number {
  let differ = 0
  for (let k = 0; k < nn; k++) if (labels[nbr[k]] !== l) differ++
  return inkDist2(rgb, i, inkRgb, l) + penalty * differ
}

/**
 * Whole-component moves: each 4-connected component `C` of label `a` is tested against
 * every label `b` it touches,
 *
 * ```text
 *     ΔE = Σ_{i∈C} (|I_i − c(b)|² − |I_i − c(a)|²) − β·shared(C, b) − 9β
 * ```
 *
 * where `shared` counts the pixel sides between `C` and `b` (no longer boundary) and `9β`
 * is the component's own description saved (a closed three-point path and an RGB fill).
 * The most negative `ΔE`, if any, is applied (ties to the lower label). Components are
 * flooded breadth-first from each unseen pixel in raster order, so later components see
 * earlier merges; at most 4 passes, stopping on a pass with no merge. Returns the number of
 * pixels relabeled.
 */
function mergeComponents(
  rgb: Float32Array,
  labels: Int32Array,
  w: number,
  h: number,
  inkRgb: Float64Array,
  penalty: number,
): number {
  const n = w * h
  const regionCost = REGION_PARAMS * penalty
  const pixels = new Int32Array(n)
  const shared = new Int32Array(labelCount(labels))
  const touched = new Int32Array(shared.length)
  let changes = 0
  for (let pass = 0; pass < MERGE_PASSES; pass++) {
    const seen = new Uint8Array(n)
    let merged = 0
    for (let seed = 0; seed < n; seed++) {
      if (seen[seed]) continue
      const current = labels[seed]
      // Breadth-first flood of the component, counting the sides it shares with each label.
      let size = 1
      let nTouched = 0
      pixels[0] = seed
      seen[seed] = 1
      for (let head = 0; head < size; head++) {
        const i = pixels[head]
        const y = (i / w) | 0
        const x = i - y * w
        for (let d = 0; d < 4; d++) {
          let j: number
          if (d === 0) j = x > 0 ? i - 1 : -1
          else if (d === 1) j = x + 1 < w ? i + 1 : -1
          else if (d === 2) j = y > 0 ? i - w : -1
          else j = y + 1 < h ? i + w : -1
          if (j < 0) continue
          const l = labels[j]
          if (l !== current) {
            if (shared[l]++ === 0) touched[nTouched++] = l
          } else if (!seen[j]) {
            seen[j] = 1
            pixels[size++] = j
          }
        }
      }
      // Targets in label order.
      touched.subarray(0, nTouched).sort()
      let best = current
      let gain = 0
      for (let t = 0; t < nTouched; t++) {
        const target = touched[t]
        let delta = 0
        for (let k = 0; k < size; k++) {
          const i = pixels[k]
          delta += inkDist2(rgb, i, inkRgb, target) - inkDist2(rgb, i, inkRgb, current)
        }
        delta -= penalty * shared[target] + regionCost
        if (delta < gain) {
          gain = delta
          best = target
        }
      }
      for (let t = 0; t < nTouched; t++) shared[touched[t]] = 0
      if (best !== current) {
        for (let k = 0; k < size; k++) labels[pixels[k]] = best
        changes += size
        merged++
      }
    }
    if (merged === 0) break
  }
  return changes
}

/** One more than the largest label, at least 1. */
function labelCount(labels: Int32Array): number {
  let max = 0
  for (let i = 0; i < labels.length; i++) if (labels[i] > max) max = labels[i]
  return max + 1
}
