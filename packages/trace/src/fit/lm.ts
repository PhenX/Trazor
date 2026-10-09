/**
 * The primitive fitters' numerical kit: the per-sample weight, Gaussian
 * elimination, Cholesky, the cyclic-Jacobi symmetric eigensolver, the 5×5
 * generalized eigenproblem behind Taubin's conic fit, and Levenberg–Marquardt
 * on normal equations a caller supplies. Systems are at most 6×6 (a rotated
 * rounded rectangle), so matrices are flat row-major `Float64Array`s and the
 * algorithms are the textbook ones.
 *
 * After inkvec (Apache-2.0): `crates/inkvec-fit/src/primitives/solver.rs` and the
 * weights of `crates/inkvec-fit/src/primitives.rs`.
 */

/**
 * Inverse-variance weight `1/σ²` of sample `k` (px⁻²): a missing sigma is taken
 * as 0.5 px and every sigma is floored at 1e-3 px (a NaN sigma takes the floor).
 */
export function weightAt(sigma: ArrayLike<number>, k: number): number {
  const raw = k < sigma.length ? sigma[k] : 0.5
  const s = raw > 1e-3 ? raw : 1e-3
  return 1 / (s * s)
}

/** {@link weightAt} for the first `n` samples. */
export function weights(sigma: ArrayLike<number>, n: number): Float64Array {
  const w = new Float64Array(n)
  for (let k = 0; k < n; k++) w[k] = weightAt(sigma, k)
  return w
}

/**
 * Solve `a·x = b` (`a` is `n×n` row-major) by Gaussian elimination with partial
 * pivoting, writing `x`. `a` and `b` are overwritten. False when singular: a
 * pivot below 1e-300 in magnitude (an absolute test, so callers pass reasonably
 * scaled systems) or a non-finite solution.
 */
export function solveLinear(a: Float64Array, b: Float64Array, n: number, x: Float64Array): boolean {
  for (let col = 0; col < n; col++) {
    // The last of equal maxima, as Rust's `max_by` picks it.
    let piv = col
    let big = Math.abs(a[col * n + col])
    for (let i = col + 1; i < n; i++) {
      const v = Math.abs(a[i * n + col])
      if (v >= big) {
        big = v
        piv = i
      }
    }
    if (big < 1e-300) return false
    if (piv !== col) {
      for (let k = 0; k < n; k++) {
        const t = a[col * n + k]
        a[col * n + k] = a[piv * n + k]
        a[piv * n + k] = t
      }
      const t = b[col]
      b[col] = b[piv]
      b[piv] = t
    }
    const pivot = a[col * n + col]
    for (let row = col + 1; row < n; row++) {
      const f = a[row * n + col] / pivot
      if (f === 0) continue
      for (let k = col; k < n; k++) a[row * n + k] -= f * a[col * n + k]
      b[row] -= f * b[col]
    }
  }
  for (let row = n - 1; row >= 0; row--) {
    let s = b[row]
    for (let k = row + 1; k < n; k++) s -= a[row * n + k] * x[k]
    x[row] = s / a[row * n + row]
    if (!Number.isFinite(x[row])) return false
  }
  return true
}

/**
 * Lower Cholesky factor `L` of a symmetric positive-definite `n×n` matrix
 * (`L·Lᵀ = a`), or null when a diagonal pivot is not positive.
 */
export function cholesky(a: Float64Array, n: number): Float64Array | null {
  const l = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let dot = 0
      for (let k = 0; k < j; k++) dot += l[i * n + k] * l[j * n + k]
      const s = a[i * n + j] - dot
      if (i === j) {
        if (!(s > 0)) return null
        l[i * n + j] = Math.sqrt(s)
      } else {
        l[i * n + j] = s / l[j * n + j]
      }
    }
  }
  return l
}

/** `x = L⁻¹·b` by forward substitution on the lower-triangular `l`. */
export function forwardSub(l: Float64Array, b: ArrayLike<number>, n: number): Float64Array {
  const x = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let k = 0; k < i; k++) s -= l[i * n + k] * x[k]
    x[i] = s / l[i * n + i]
  }
  return x
}

/** `x = L⁻ᵀ·b` by back substitution on the transpose of the lower-triangular `l`. */
export function backSubT(l: Float64Array, b: ArrayLike<number>, n: number): Float64Array {
  const x = new Float64Array(n)
  for (let i = n - 1; i >= 0; i--) {
    let s = b[i]
    for (let k = i + 1; k < n; k++) s -= l[k * n + i] * x[k]
    x[i] = s / l[i * n + i]
  }
  return x
}

/**
 * Eigen-decomposition of a small symmetric `n×n` matrix by cyclic Jacobi
 * rotations: unsorted eigenvalues and orthonormal eigenvectors as the columns
 * of `vectors`. Each rotation zeroes one off-diagonal entry `a[p][q]`, with
 * `t = tan θ` the smaller root of `t² + 2t·cot 2θ − 1 = 0`; sweeps repeat until
 * the squared upper off-diagonal sum falls below 1e-30, or 100 sweeps.
 */
export function symEigen(
  matrix: ArrayLike<number>,
  n: number,
): { values: Float64Array; vectors: Float64Array } {
  const a = Float64Array.from(matrix)
  const v = new Float64Array(n * n)
  for (let i = 0; i < n; i++) v[i * n + i] = 1
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i * n + j] * a[i * n + j]
    if (off < 1e-30) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q]
        if (Math.abs(apq) < 1e-300) continue
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq)
        const t =
          theta === 0 ? 1 : (theta > 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p]
          const akq = a[k * n + q]
          a[k * n + p] = c * akp - s * akq
          a[k * n + q] = s * akp + c * akq
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k]
          const aqk = a[q * n + k]
          a[p * n + k] = c * apk - s * aqk
          a[q * n + k] = s * apk + c * aqk
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p]
          const vkq = v[k * n + q]
          v[k * n + p] = c * vkp - s * vkq
          v[k * n + q] = s * vkp + c * vkq
        }
      }
    }
  }
  const values = new Float64Array(n)
  for (let i = 0; i < n; i++) values[i] = a[i * n + i]
  return { values, vectors: v }
}

/**
 * The 5×5 generalized symmetric eigenproblem: the `θ` minimizing `θᵀ·cov·θ`
 * subject to `θᵀ·nrm·θ = 1`, and that minimum `μ`. With `nrm = L·Lᵀ` and
 * `y = Lᵀθ` it is the ordinary problem for `A = L⁻¹·cov·L⁻ᵀ` (symmetrized
 * against rounding): `y` is `A`'s eigenvector of the smallest eigenvalue and
 * `θ = L⁻ᵀy`, normalized in the `nrm` metric. Null if `nrm` is not positive
 * definite.
 */
export function genEigen5(
  cov: Float64Array,
  nrm: Float64Array,
): { theta: Float64Array; mu: number } | null {
  const n = 5
  const l = cholesky(nrm, n)
  if (l === null) return null
  const tmp = new Float64Array(n * n)
  const col = new Float64Array(n)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) col[i] = cov[i * n + j]
    const x = forwardSub(l, col, n)
    for (let i = 0; i < n; i++) tmp[i * n + j] = x[i]
  }
  const a = new Float64Array(n * n)
  for (let i = 0; i < n; i++) a.set(forwardSub(l, tmp.subarray(i * n, i * n + n), n), i * n)
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const m = 0.5 * (a[i * n + j] + a[j * n + i])
      a[i * n + j] = m
      a[j * n + i] = m
    }
  }
  const { values, vectors } = symEigen(a, n)
  let best = 0
  for (let i = 1; i < n; i++) if (values[i] < values[best]) best = i
  const y = new Float64Array(n)
  for (let i = 0; i < n; i++) y[i] = vectors[i * n + best]
  return { theta: backSubT(l, y, n), mu: values[best] }
}

/**
 * Normal equations of a weighted least-squares problem at `p`: fill `jtj`
 * (`JᵀWJ`, row-major) and `jtr` (`JᵀWr`) and return `χ²`, or null when the
 * residuals cannot be evaluated there.
 */
export type NormalEquations = (
  p: Float64Array,
  jtj: Float64Array,
  jtr: Float64Array,
) => number | null

/**
 * Levenberg–Marquardt from `p0`. Each iteration solves
 * `(JᵀWJ + μ·diag(max(|JᵀWJ|, 1e-12)))·δ = −JᵀWr` and tries `p + δ`, projected
 * back into the feasible set by `project`. A step that does not raise χ² is
 * taken and `μ` divided by 3 (floor 1e-15), stopping once it gains less than a
 * relative 1e-10; a rejected step multiplies `μ` by 4 and a singular system by
 * 10, and past `μ = 1e12` the search returns the best point so far. At most
 * `maxIter` iterations, `μ` starting at 1e-3. Null only if `evaluate` fails at
 * the projected start.
 */
export function levenbergMarquardt(
  p0: ArrayLike<number>,
  maxIter: number,
  evaluate: NormalEquations,
  project: (p: Float64Array) => void,
): { p: Float64Array; chi2: number } | null {
  const n = p0.length
  let p = Float64Array.from(p0)
  project(p)
  let jtj = new Float64Array(n * n)
  let jtr = new Float64Array(n)
  let jtjTrial = new Float64Array(n * n)
  let jtrTrial = new Float64Array(n)
  const start = evaluate(p, jtj, jtr)
  if (start === null) return null
  let chi2 = start
  let mu = 1e-3
  const a = new Float64Array(n * n)
  const rhs = new Float64Array(n)
  const delta = new Float64Array(n)
  let q = new Float64Array(n)
  for (let iter = 0; iter < maxIter; iter++) {
    a.set(jtj)
    for (let k = 0; k < n; k++) {
      const d = Math.abs(jtj[k * n + k])
      a[k * n + k] += mu * (d > 1e-12 ? d : 1e-12)
      rhs[k] = -jtr[k]
    }
    if (!solveLinear(a, rhs, n, delta)) {
      mu *= 10
      if (mu > 1e12) break
      continue
    }
    for (let k = 0; k < n; k++) q[k] = p[k] + delta[k]
    project(q)
    const trial = evaluate(q, jtjTrial, jtrTrial)
    if (trial !== null && trial <= chi2 && Number.isFinite(trial)) {
      const improvement = chi2 - trial
      ;[p, q] = [q, p]
      ;[jtj, jtjTrial] = [jtjTrial, jtj]
      ;[jtr, jtrTrial] = [jtrTrial, jtr]
      chi2 = trial
      mu = Math.max(mu / 3, 1e-15)
      if (improvement <= 1e-10 * Math.max(chi2, 1e-12)) break
    } else {
      mu *= 4
      if (mu > 1e12) break
    }
  }
  return { p, chi2 }
}
