/**
 * Least-squares fits for primitive recognition (primitive.ts). A centroid +
 * mean-radius estimate is biased when the traced boundary samples a shape
 * unevenly (adaptive Bézier fitting rarely spaces anchors uniformly); an
 * algebraic least-squares fit is unbiased, so the recovered circle/ellipse
 * tracks the original points as closely as the samples allow.
 *
 * - circle: Kåsa algebraic fit (a 3×3 linear solve).
 * - ellipse: direct conic fit — the smallest-eigenvector of the design scatter
 *   matrix (Fitzgibbon-class), with the points normalized first for conditioning.
 */

export interface Pt {
  x: number
  y: number
}

/** Solve a small dense linear system `A·x = b` by Gaussian elimination with partial pivoting; null if singular. */
export function solveLinear(A: number[][], b: number[]): number[] | null {
  const n = b.length
  // Augmented matrix (copied so the caller's arrays are untouched).
  const m = A.map((row, i) => [...row, b[i]])
  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) if (Math.abs(m[r][col]) > Math.abs(m[pivot][col])) pivot = r
    if (Math.abs(m[pivot][col]) < 1e-12) return null
    ;[m[col], m[pivot]] = [m[pivot], m[col]]
    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = m[r][col] / m[col][col]
      for (let c = col; c <= n; c++) m[r][c] -= f * m[col][c]
    }
  }
  return m.map((row, i) => row[n] / row[i])
}

/**
 * Kåsa algebraic least-squares circle fit: minimizes Σ(x²+y²+Dx+Ey+F)² over the
 * points, giving center (−D/2, −E/2) and radius √(cx²+cy²−F). Null if degenerate.
 */
export function fitCircle(pts: readonly Pt[]): { cx: number; cy: number; r: number } | null {
  const n = pts.length
  if (n < 3) return null
  let sxx = 0
  let sxy = 0
  let syy = 0
  let sx = 0
  let sy = 0
  let sxz = 0
  let syz = 0
  let sz = 0
  for (const p of pts) {
    const z = p.x * p.x + p.y * p.y
    sxx += p.x * p.x
    sxy += p.x * p.y
    syy += p.y * p.y
    sx += p.x
    sy += p.y
    sxz += p.x * z
    syz += p.y * z
    sz += z
  }
  const sol = solveLinear(
    [
      [sxx, sxy, sx],
      [sxy, syy, sy],
      [sx, sy, n],
    ],
    [-sxz, -syz, -sz],
  )
  if (!sol) return null
  const [d, e, f] = sol
  const cx = -d / 2
  const cy = -e / 2
  const rr = cx * cx + cy * cy - f
  if (rr <= 0) return null
  return { cx, cy, r: Math.sqrt(rr) }
}

/** Eigenpairs of a symmetric n×n matrix via cyclic Jacobi rotations. Vectors are columns of `vectors`. */
function jacobiEigenSymmetric(
  input: number[][],
  n: number,
): { values: number[]; vectors: number[][] } {
  const a = input.map((row) => [...row])
  const v: number[][] = Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  )
  for (let sweep = 0; sweep < 100; sweep++) {
    let off = 0
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q]
    if (off < 1e-20) break
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        if (Math.abs(a[p][q]) < 1e-18) continue
        const theta = (a[q][q] - a[p][p]) / (2 * a[p][q])
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1))
        const c = 1 / Math.sqrt(t * t + 1)
        const s = t * c
        for (let i = 0; i < n; i++) {
          const aip = a[i][p]
          const aiq = a[i][q]
          a[i][p] = c * aip - s * aiq
          a[i][q] = s * aip + c * aiq
        }
        for (let i = 0; i < n; i++) {
          const api = a[p][i]
          const aqi = a[q][i]
          a[p][i] = c * api - s * aqi
          a[q][i] = s * api + c * aqi
        }
        for (let i = 0; i < n; i++) {
          const vip = v[i][p]
          const viq = v[i][q]
          v[i][p] = c * vip - s * viq
          v[i][q] = s * vip + c * viq
        }
      }
    }
  }
  return { values: a.map((row, i) => row[i]), vectors: v }
}

/**
 * Direct algebraic ellipse fit. Fits the conic `A x² + B xy + C y² + D x + E y + F = 0`
 * by the smallest-eigenvector of the (normalized) design scatter matrix, then
 * recovers the geometric parameters from the quadratic form. Returns null when the
 * best conic is not an ellipse (`B² − 4AC ≥ 0`) — the caller then rejects the shape.
 * `angle` is the radians of the `rx` axis, in (−π/2, π/2].
 */
export function fitEllipse(
  pts: readonly Pt[],
): { cx: number; cy: number; rx: number; ry: number; angle: number } | null {
  const n = pts.length
  if (n < 6) return null
  // Normalize (centroid + RMS scale) so the x⁴-scale entries don't wreck conditioning.
  let mx = 0
  let my = 0
  for (const p of pts) {
    mx += p.x
    my += p.y
  }
  mx /= n
  my /= n
  let s = 0
  for (const p of pts) s += (p.x - mx) ** 2 + (p.y - my) ** 2
  const scale = Math.sqrt(s / n) || 1

  // Scatter matrix S = MᵀM of design rows [u², uv, v², u, v, 1].
  const S: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0))
  for (const p of pts) {
    const u = (p.x - mx) / scale
    const v = (p.y - my) / scale
    const row = [u * u, u * v, v * v, u, v, 1]
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) S[i][j] += row[i] * row[j]
  }

  const { values, vectors } = jacobiEigenSymmetric(S, 6)
  let best = 0
  for (let i = 1; i < 6; i++) if (values[i] < values[best]) best = i
  const coef = vectors.map((row) => row[best]) // [A, B, C, D, E, F] in normalized coords
  const [A, B, C, D, E, F] = coef

  const disc = B * B - 4 * A * C
  if (disc >= 0) return null // not an ellipse

  // Center of the conic: [2A B; B 2C]·[cu;cv] = [−D;−E].
  const center = solveLinear(
    [
      [2 * A, B],
      [B, 2 * C],
    ],
    [-D, -E],
  )
  if (!center) return null
  const [cu, cv] = center

  // Constant of the centered conic, then principal axes from the 2×2 quadratic form.
  const fc = A * cu * cu + B * cu * cv + C * cv * cv + D * cu + E * cv + F
  // Eigenvalues of [[A, B/2],[B/2, C]] (symmetric 2×2, closed form).
  const tr = A + C
  const det = A * C - (B * B) / 4
  const gap = Math.sqrt(Math.max(0, (tr * tr) / 4 - det))
  const l1 = tr / 2 + gap
  const l2 = tr / 2 - gap
  if (l1 === 0 || l2 === 0) return null
  const a1sq = -fc / l1
  const a2sq = -fc / l2
  if (a1sq <= 0 || a2sq <= 0) return null
  const axis1 = Math.sqrt(a1sq) // semi-axis for eigenvalue l1
  const axis2 = Math.sqrt(a2sq)
  // Eigenvector angle for l1: [[A,B/2],[B/2,C]]·e = l1·e ⇒ direction (B/2, l1−A).
  const angle1 = Math.abs(B) < 1e-12 && Math.abs(A - l1) < 1e-12 ? 0 : Math.atan2(l1 - A, B / 2)

  // Report the larger axis as rx with its own angle, normalized to (−π/2, π/2].
  let rx: number
  let ry: number
  let ang: number
  if (axis1 >= axis2) {
    rx = axis1
    ry = axis2
    ang = angle1
  } else {
    rx = axis2
    ry = axis1
    ang = angle1 + Math.PI / 2
  }
  while (ang > Math.PI / 2) ang -= Math.PI
  while (ang <= -Math.PI / 2) ang += Math.PI

  return {
    cx: mx + cu * scale,
    cy: my + cv * scale,
    rx: rx * scale,
    ry: ry * scale,
    angle: ang,
  }
}
