/**
 * Pixel noise from an image's Laplacian: the per-channel standard deviation, in
 * encoded sRGB units, that the measurement stages divide by. The 4-neighbor
 * Laplacian cancels a flat area and a linear ramp, so its magnitude over the
 * quiet part of an image is noise; a low quantile of it reads that part even on
 * edge-dense art, where a median reads edges.
 *
 * Method from: J. Immerkær, "Fast noise variance estimation", CVIU 64(2), 1996
 * (the Laplacian as a structure-suppressing noise probe); the quantile by
 * selection, C. A. R. Hoare, "Algorithm 65: Find", CACM 4(7), 1961.
 * After inkvec (Apache-2.0): `inkvec-trace/src/coverage.rs` (`estimate_noise`,
 * `NOISE_FLOOR`).
 */

/** Smallest noise {@link estimateNoise} reports: half an 8-bit quantization step. */
export const NOISE_FLOOR = 0.5 / 255

/** The 4-neighbor Laplacian's coefficients: the center against its four neighbors. */
const LAPLACIAN_KERNEL = [4, -1, -1, -1, -1]

/** The quantile of `|Laplacian|` read as the noise level. */
const NOISE_QUANTILE = 0.1

/** The 10% point of the unit half-normal, `Φ⁻¹(0.55)`. */
const Z10 = 0.12566

/**
 * Pixel noise of one gray channel (row-major `w × h`, values in `[0, 1]`): the 10th percentile
 * of the absolute 4-neighbor Laplacian over interior pixels, divided by the same quantile of
 * a unit half-normal and by the kernel's noise gain `sqrt(Σ k²) = sqrt(20)`, floored at
 * {@link NOISE_FLOOR}:
 *
 * ```text
 *     σ = max(Q₀.₁(|L|) / z₀.₁ / sqrt(Σ k²), NOISE_FLOOR)
 * ```
 *
 * A low quantile stays a noise reading while a tenth of the image is flat, where a median
 * reads edges on edge-dense art. An image under 3×3, or a buffer shorter than `w·h`, reads
 * `1/255`.
 */
export function estimateNoise(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3 || gray.length < w * h) return 1 / 255
  const lap = new Float32Array((w - 2) * (h - 2))
  let at = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x
      lap[at++] = Math.abs(4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w])
    }
  }
  const q = kthSmallest(lap, Math.floor(lap.length * NOISE_QUANTILE))
  let gain = 0
  for (const c of LAPLACIAN_KERNEL) gain += c * c
  return Math.max(q / Z10 / Math.sqrt(gain), NOISE_FLOOR)
}

/**
 * The value at index `k` of `v` sorted ascending, by Hoare's selection with a median-of-three
 * pivot (Hoare 1961, "Algorithm 65: Find", CACM 4(7)); `v` is reordered.
 */
function kthSmallest(v: Float32Array, k: number): number {
  let lo = 0
  let hi = v.length - 1
  while (lo < hi) {
    const a = v[lo]
    const b = v[(lo + hi) >>> 1]
    const c = v[hi]
    const pivot = a < b ? (b < c ? b : a < c ? c : a) : a < c ? a : b < c ? c : b
    let i = lo
    let j = hi
    while (i <= j) {
      while (v[i] < pivot) i++
      while (v[j] > pivot) j--
      if (i <= j) {
        const t = v[i]
        v[i] = v[j]
        v[j] = t
        i++
        j--
      }
    }
    if (k <= j) hi = j
    else if (k >= i) lo = i
    else return v[k]
  }
  return v[k]
}
