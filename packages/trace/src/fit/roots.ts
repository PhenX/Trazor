/**
 * The small exact solvers the curve fit is built on: real roots of quadratics,
 * cubics and quartics in closed form, bracketed roots of a low-degree polynomial
 * on an interval, and a 3x3 linear solve.
 *
 * - {@link solveQuadratic} and {@link solveCubic} follow Blinn, "How to Solve a
 *   Cubic Equation" (JCGT 2006–2007), as kurbo states them.
 * - {@link factorQuarticInner} is Orellana & De Michele (2020), "Algorithm 1010:
 *   Boosting Efficiency in Solving Quartic Equations with No Compromise in
 *   Accuracy", ACM TOMS 46(2): the quartic split into two real quadratics, with
 *   its dominant depressed-cubic root (§2.2) and Newton polish of the factors.
 * - {@link rootsBetween} is Yuksel (2022), "High-Performance Polynomial Root
 *   Finding for Graphics", HPG: roots bracketed by the critical points, each
 *   found by Newton steps safeguarded by bisection.
 *
 * `mul_add` in kurbo's cubic is a fused multiply-add; here it is an ordinary
 * multiply and add, which can differ in the last bit.
 *
 * Ported from kurbo 0.13 (Apache-2.0 OR MIT): `common.rs` (`solve_quadratic`,
 * `solve_cubic`, `factor_quartic_inner`, `depressed_cubic_dominant`), and
 * polycool 0.4 (Apache-2.0 OR MIT): `poly.rs`, `cubic.rs`, `quadratic.rs`,
 * `yuksel.rs`.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/tangents.rs` (`solve3`), and the
 * solvers `inkvec-fit/src/candidates.rs` and `multimodel.rs` call through kurbo.
 */

/** `|mag|` carrying the sign bit of `sign` (Rust's `copysign`). */
export function copysign(mag: number, sign: number): number {
  return sign < 0 || Object.is(sign, -0) ? -Math.abs(mag) : Math.abs(mag)
}

/** Rust's `f64::signum`: 1 for +0 and positives, −1 for −0 and negatives, NaN for NaN. */
export function signum(x: number): number {
  if (Number.isNaN(x)) return NaN
  return x < 0 || Object.is(x, -0) ? -1 : 1
}

/** Rust's `f64::max`: the larger of two numbers, ignoring a NaN operand. */
export function fmax(a: number, b: number): number {
  if (Number.isNaN(a)) return b
  if (Number.isNaN(b)) return a
  return a >= b ? a : b
}

/** Rust's `f64::min`: the smaller of two numbers, ignoring a NaN operand. */
export function fmin(a: number, b: number): number {
  if (Number.isNaN(a)) return b
  if (Number.isNaN(b)) return a
  return a <= b ? a : b
}

/**
 * Real roots of `c0 + c1·x + c2·x² = 0`, ascending. Nearly linear equations give
 * the root of the linear part only; all-zero coefficients give a single `0`.
 */
export function solveQuadratic(c0: number, c1: number, c2: number): number[] {
  const sc0 = c0 * (1 / c2)
  const sc1 = c1 * (1 / c2)
  if (!Number.isFinite(sc0) || !Number.isFinite(sc1)) {
    // c2 is zero or very small: a linear equation.
    const root = -c0 / c1
    if (Number.isFinite(root)) return [root]
    if (c0 === 0 && c1 === 0) return [0]
    return []
  }
  const arg = sc1 * sc1 - 4 * sc0
  let root1: number
  if (!Number.isFinite(arg)) {
    // sc1² overflowed: one root from sc1·x + x² = 0, the other as sc0 / root1.
    root1 = -sc1
  } else {
    if (arg < 0) return []
    if (arg === 0) return [-0.5 * sc1]
    root1 = -0.5 * (sc1 + copysign(Math.sqrt(arg), sc1))
  }
  const root2 = sc0 / root1
  if (!Number.isFinite(root2)) return [root1]
  return root2 > root1 ? [root1, root2] : [root2, root1]
}

/** Real roots of `c0 + c1·x + c2·x² + c3·x³ = 0`; a vanishing `c3` solves the quadratic. */
export function solveCubic(c0: number, c1: number, c2: number, c3: number): number[] {
  const c3Recip = 1 / c3
  const oneThird = 1 / 3
  const sc2 = c2 * (oneThird * c3Recip)
  const sc1 = c1 * (oneThird * c3Recip)
  const sc0 = c0 * c3Recip
  if (!(Number.isFinite(sc0) && Number.isFinite(sc1) && Number.isFinite(sc2))) {
    return solveQuadratic(c0, c1, c2)
  }
  // Blinn's Delta, discriminant and depressed form.
  const d0 = -sc2 * sc2 + sc1
  const d1 = -sc1 * sc2 + sc0
  const d2 = sc2 * sc0 - sc1 * sc1
  const d = 4 * d0 * d2 - d1 * d1
  const de = -2 * sc2 * d0 + d1
  if (d < 0) {
    const sq = Math.sqrt(-0.25 * d)
    const r = -0.5 * de
    const t1 = Math.cbrt(r + sq) + Math.cbrt(r - sq)
    return [t1 - sc2]
  }
  if (d === 0) {
    const t1 = copysign(Math.sqrt(-d0), de)
    return [t1 - sc2, -2 * t1 - sc2]
  }
  const th = Math.atan2(Math.sqrt(d), -de) * oneThird
  const thSin = Math.sin(th)
  const thCos = Math.cos(th)
  const ss3 = thSin * Math.sqrt(3)
  const r1 = 0.5 * (-thCos + ss3)
  const r2 = 0.5 * (-thCos - ss3)
  const t = 2 * Math.sqrt(-d0)
  return [t * thCos - sc2, t * r1 - sc2, t * r2 - sc2]
}

/** Relative error of `raw` against the coefficient `a` (Orellana & De Michele). */
function epsRel(raw: number, a: number): number {
  return a === 0 ? Math.abs(raw) : Math.abs((raw - a) / a)
}

/**
 * Dominant root of the depressed cubic `x³ + g·x + h = 0`, refined by Newton
 * (Orellana & De Michele 2020, §2.2).
 */
function depressedCubicDominant(g: number, h: number): number {
  const q = (-1 / 3) * g
  const r = 0.5 * h
  let k: number | null
  if (Math.abs(q) < 1e102 && Math.abs(r) < 1e154) k = null
  else if (Math.abs(q) < Math.abs(r)) k = 1 - q * ((q / r) * (q / r))
  else k = signum(q) * (((r / q) * (r / q)) / q - 1)
  let phi0: number
  if (k !== null && r === 0) {
    phi0 = g > 0 ? 0 : Math.sqrt(-g)
  } else if (k !== null ? k < 0 : r * r < q * q * q) {
    const t = k !== null ? r / q / Math.sqrt(q) : r / Math.sqrt(q * q * q)
    phi0 = -2 * Math.sqrt(q) * copysign(Math.cos(Math.acos(Math.abs(t)) * (1 / 3)), t)
  } else {
    let base: number
    if (k !== null) {
      base =
        Math.abs(q) < Math.abs(r)
          ? -r * (1 + Math.sqrt(k))
          : -r - copysign(Math.sqrt(Math.abs(q)) * q * Math.sqrt(k), r)
    } else {
      base = -r - copysign(Math.sqrt(r * r - q * q * q), r)
    }
    const a = Math.cbrt(base)
    const b = a === 0 ? 0 : q / a
    phi0 = a + b
  }
  let x = phi0
  let f = (x * x + g) * x + h
  const epsM = 2.22045e-16
  if (Math.abs(f) < epsM * fmax(fmax(x * x * x, g * x), h)) return x
  for (let it = 0; it < 8; it++) {
    const deltF = 3 * x * x + g
    if (deltF === 0) break
    const newX = x - f / deltF
    const newF = (newX * newX + g) * newX + h
    if (newF === 0) return newX
    if (Math.abs(newF) >= Math.abs(f)) break
    x = newX
    f = newF
  }
  return x
}

/**
 * Factor the monic quartic `x⁴ + a·x³ + b·x² + c·x + d` into two real quadratics
 * `x² + αᵢ·x + βᵢ`, returned as `[α1, β1, α2, β2]`. `null` on overflow (when
 * `rescale` might succeed) or when the factors would be complex.
 */
export function factorQuarticInner(
  a: number,
  b: number,
  c: number,
  d: number,
  rescale: boolean,
): [number, number, number, number] | null {
  const calcEpsQ = (a1: number, b1: number, a2: number, b2: number) =>
    epsRel(a1 + a2, a) + epsRel(b1 + a1 * a2 + b2, b) + epsRel(b1 * a2 + a1 * b2, c)
  const calcEpsT = (a1: number, b1: number, a2: number, b2: number) =>
    calcEpsQ(a1, b1, a2, b2) + epsRel(b1 * b2, d)
  const disc = 9 * a * a - 24 * b
  const s = disc >= 0 ? (-2 * b) / (3 * a + copysign(Math.sqrt(disc), a)) : -0.25 * a
  const aPrime = a + 4 * s
  const bPrime = b + 3 * s * (a + 2 * s)
  const cPrime = c + s * (2 * b + s * (3 * a + 4 * s))
  const dPrime = d + s * (c + s * (b + s * (a + s)))
  let gPrime: number
  let hPrime: number
  const kC = 3.49e102
  if (rescale) {
    const aS = aPrime / kC
    const bS = bPrime / kC
    const cS = cPrime / kC
    const dS = dPrime / kC
    gPrime = aS * cS - (4 / kC) * dS - (1 / 3) * (bS * bS)
    hPrime =
      (aS * cS + (8 / kC) * dS - (2 / 9) * (bS * bS)) * (1 / 3) * bS - cS * (cS / kC) - aS * aS * dS
  } else {
    gPrime = aPrime * cPrime - 4 * dPrime - (1 / 3) * (bPrime * bPrime)
    hPrime =
      (aPrime * cPrime + 8 * dPrime - (2 / 9) * (bPrime * bPrime)) * (1 / 3) * bPrime -
      cPrime * cPrime -
      aPrime * aPrime * dPrime
  }
  if (!(Number.isFinite(gPrime) && Number.isFinite(hPrime))) return null
  let phi = depressedCubicDominant(gPrime, hPrime)
  if (rescale) phi *= kC
  const l1 = a * 0.5
  const l3 = (1 / 6) * b + 0.5 * phi
  const delt2 = c - a * l3
  const d2Cand1 = (2 / 3) * b - phi - l1 * l1
  const l2Cand1 = (0.5 * delt2) / d2Cand1
  const l2Cand2 = (2 * (d - l3 * l3)) / delt2
  const d2Cand2 = (0.5 * delt2) / l2Cand2
  const cands: [number, number][] = [
    [d2Cand1, l2Cand1],
    [d2Cand2, l2Cand2],
    [d2Cand1, l2Cand2],
  ]
  let d2 = 0
  let l2 = 0
  let epsLBest = 0
  for (let i = 0; i < 3; i++) {
    const [dc, lc] = cands[i]
    const eps0 = epsRel(dc + l1 * l1 + 2 * l3, b)
    const eps1 = epsRel(2 * (dc * lc + l1 * l3), c)
    const eps2 = epsRel(dc * lc * lc + l3 * l3, d)
    const epsL = eps0 + eps1 + eps2
    if (i === 0 || epsL < epsLBest) {
      d2 = dc
      l2 = lc
      epsLBest = epsL
    }
  }
  let alpha1: number
  let beta1: number
  let alpha2: number
  let beta2: number
  if (d2 < 0) {
    const sq = Math.sqrt(-d2)
    alpha1 = l1 + sq
    beta1 = l3 + sq * l2
    alpha2 = l1 - sq
    beta2 = l3 - sq * l2
    if (Math.abs(beta2) < Math.abs(beta1)) beta2 = d / beta1
    else if (Math.abs(beta2) > Math.abs(beta1)) beta1 = d / beta2
    if (Math.abs(alpha1) !== Math.abs(alpha2)) {
      let pairs: [number, number][]
      if (Math.abs(alpha1) < Math.abs(alpha2)) {
        // The first candidate cannot fail, which keeps the selection simple.
        pairs = [
          [a - alpha2, alpha2],
          [(c - beta1 * alpha2) / beta2, alpha2],
          [(b - beta2 - beta1) / alpha2, alpha2],
        ]
      } else {
        pairs = [
          [alpha1, a - alpha1],
          [alpha1, (c - alpha1 * beta2) / beta1],
          [alpha1, (b - beta2 - beta1) / alpha1],
        ]
      }
      let epsQBest = 0
      for (let i = 0; i < 3; i++) {
        const [a1, a2] = pairs[i]
        if (Number.isFinite(a1) && Number.isFinite(a2)) {
          const epsQ = calcEpsQ(a1, beta1, a2, beta2)
          if (i === 0 || epsQ < epsQBest) {
            alpha1 = a1
            alpha2 = a2
            epsQBest = epsQ
          }
        }
      }
    }
  } else if (d2 === 0) {
    const d3 = d - l3 * l3
    alpha1 = l1
    beta1 = l3 + Math.sqrt(-d3)
    alpha2 = l1
    beta2 = l3 - Math.sqrt(-d3)
    if (Math.abs(beta1) > Math.abs(beta2)) beta2 = d / beta1
    else if (Math.abs(beta2) > Math.abs(beta1)) beta1 = d / beta2
  } else {
    // No real factorization.
    return null
  }
  // Newton–Raphson on the factors' coefficients.
  let epsT = calcEpsT(alpha1, beta1, alpha2, beta2)
  for (let it = 0; it < 8; it++) {
    if (epsT === 0) break
    const f0 = beta1 * beta2 - d
    const f1 = beta1 * alpha2 + alpha1 * beta2 - c
    const f2 = beta1 + alpha1 * alpha2 + beta2 - b
    const f3 = alpha1 + alpha2 - a
    const c1 = alpha1 - alpha2
    const detJ = beta1 * beta1 - beta1 * (alpha2 * c1 + 2 * beta2) + beta2 * (alpha1 * c1 + beta2)
    if (detJ === 0) break
    const inv = 1 / detJ
    const c2 = beta2 - beta1
    const c3 = beta1 * alpha2 - alpha1 * beta2
    const dz0 = c1 * f0 + c2 * f1 + c3 * f2 - (beta1 * c2 + alpha1 * c3) * f3
    const dz1 = (alpha1 * c1 + c2) * f0 - beta1 * c1 * f1 - beta1 * c2 * f2 - beta1 * c3 * f3
    const dz2 = -c1 * f0 - c2 * f1 - c3 * f2 + (alpha2 * c3 + beta2 * c2) * f3
    const dz3 = -(alpha2 * c1 + c2) * f0 + beta2 * c1 * f1 + beta2 * c2 * f2 + beta2 * c3 * f3
    const a1 = alpha1 - inv * dz0
    const b1 = beta1 - inv * dz1
    const a2 = alpha2 - inv * dz2
    const b2 = beta2 - inv * dz3
    const newEpsT = calcEpsT(a1, b1, a2, b2)
    if (!(newEpsT < epsT)) break
    alpha1 = a1
    beta1 = b1
    alpha2 = a2
    beta2 = b2
    epsT = newEpsT
  }
  return [alpha1, beta1, alpha2, beta2]
}

/** Polynomial with coefficients `c` (constant first) at `x`, by Horner's rule. */
export function evalPoly(c: ArrayLike<number>, x: number): number {
  let acc = 0
  for (let k = c.length - 1; k >= 0; k--) acc = acc * x + c[k]
  return acc
}

/** Whether `x` and `y` lie on different sides of zero (−0 counts as non-negative). */
function differentSigns(x: number, y: number): boolean {
  return x < 0 !== y < 0
}

/**
 * Yuksel's safeguarded Newton iteration for the root bracketed by
 * `[lower, upper]`, whose values have different signs, to `xError`.
 */
function findRoot(
  f: (x: number) => number,
  df: (x: number) => number,
  lower: number,
  upper: number,
  valLower: number,
  valUpper: number,
  xError: number,
): number {
  if (!Number.isFinite(valLower) || !Number.isFinite(valUpper)) return NaN
  let x = lower + (upper - lower) / 2
  let step = (upper - lower) / 2
  if (Math.abs(step) <= xError) return x
  while (Math.abs(step) > xError && Number.isFinite(x)) {
    const derivX = df(x)
    const valX = f(x)
    if (valX === 0) return x
    if (differentSigns(valLower, valX)) upper = x
    else lower = x
    step = -valX / derivX
    let newX = x + step
    if (newX <= lower || newX >= upper) {
      newX = lower + (upper - lower) / 2
      if (newX === upper || newX === lower) return newX
    }
    step = newX - x
    x = newX
  }
  return x
}

/** Coefficients of the derivative of the polynomial `c` (constant first). */
function derivative(c: ArrayLike<number>): number[] {
  const out = new Array<number>(c.length - 1)
  for (let i = 0; i + 1 < c.length; i++) out[i] = (i + 1) * c[i + 1]
  return out
}

function allFinite(c: ArrayLike<number>): boolean {
  for (let i = 0; i < c.length; i++) if (!Number.isFinite(c[i])) return false
  return true
}

/** The two distinct roots of `c0 + c1·x + c2·x²`, ascending, when its discriminant is positive. */
function positiveDiscriminantRoots(c0: number, c1: number, c2: number): [number, number] | null {
  const disc = c1 * c1 - 4 * c2 * c0
  if (!Number.isFinite(disc)) {
    const finite = Number.isFinite(c0) && Number.isFinite(c1) && Number.isFinite(c2)
    if (!finite) return null
    const scale = 2 ** -515
    return positiveDiscriminantRoots(c0 * scale, c1 * scale, c2 * scale)
  }
  if (!(disc > 0)) return null
  const q = -0.5 * (c1 + copysign(Math.sqrt(disc), c1))
  const r0 = q / c2
  const r1 = c0 / q
  return [Math.min(r0, r1), Math.max(r0, r1)]
}

/** Critical points of the cubic `c`, ascending, when its derivative has two distinct roots. */
function cubicCriticalPoints(c: ArrayLike<number>): [number, number] | null {
  const a = 3 * c[3]
  const b2 = c[2]
  const cc = c[1]
  const disc4 = b2 * b2 - a * cc
  if (!Number.isFinite(disc4)) {
    if (!allFinite(c)) return null
    const scale = 2 ** -515
    return cubicCriticalPoints([c[0] * scale, c[1] * scale, c[2] * scale, c[3] * scale])
  }
  if (!(disc4 > 0)) return null
  const q = -(b2 + copysign(Math.sqrt(disc4), b2))
  const r0 = q / a
  const r1 = cc / q
  return [Math.min(r0, r1), Math.max(r0, r1)]
}

/** The cubic's root bracketed by `[lower, upper]`, by {@link findRoot}. */
function cubicOneRoot(
  c: ArrayLike<number>,
  lower: number,
  upper: number,
  lowerVal: number,
  upperVal: number,
  xError: number,
): number {
  const d0 = c[1]
  const d1 = 2 * c[2]
  const d2 = 3 * c[3]
  if (!(Number.isFinite(d0) && Number.isFinite(d1) && Number.isFinite(d2))) return NaN
  return findRoot(
    (x) => {
      const xx = x * x
      return c[0] + c[1] * x + c[2] * xx + c[3] * (xx * x)
    },
    (x) => d0 + d1 * x + d2 * x * x,
    lower,
    upper,
    lowerVal,
    upperVal,
    xError,
  )
}

/** The cubic's smallest root in `[lower, upper]` that a sign change brackets. */
function cubicFirstRoot(c: ArrayLike<number>, lower: number, upper: number, xError: number) {
  const crit = cubicCriticalPoints(c)
  if (crit) {
    let last = lower
    let lastVal = evalPoly(c, last)
    for (const x of [crit[0], crit[1], upper]) {
      if (x > last && x <= upper) {
        const val = evalPoly(c, x)
        if (differentSigns(lastVal, val)) return cubicOneRoot(c, last, x, lastVal, val, xError)
        last = x
        lastVal = val
      }
    }
    return null
  }
  const lowerVal = evalPoly(c, lower)
  const upperVal = evalPoly(c, upper)
  if (differentSigns(lowerVal, upperVal)) {
    return cubicOneRoot(c, lower, upper, lowerVal, upperVal, xError)
  }
  return null
}

/** Cubic roots in `[lower, upper]`: the first bracketed one, then the deflated quadratic's. */
function cubicRootsBetween(
  c: ArrayLike<number>,
  lower: number,
  upper: number,
  xError: number,
): number[] {
  const out: number[] = []
  const r = cubicFirstRoot(c, lower, upper, xError)
  if (r === null) return out
  out.push(r)
  // Deflate by (x − r): the quotient's coefficients by synthetic division.
  const q2 = c[3]
  const q1 = q2 * r + c[2]
  const q0 = q1 * r + c[1]
  const roots = positiveDiscriminantRoots(q0, q1, q2)
  if (roots) {
    const [x0, x1] = roots
    if (lower <= x0 && x0 <= upper) out.push(x0)
    if (lower <= x1 && x1 <= upper) out.push(x1)
    // The first root can miss a near-double root below it: restore the order.
    if (lower <= x0 && x0 < r && out.length > 1 && out[0] > out[1]) {
      ;[out[0], out[1]] = [out[1], out[0]]
      if (out.length > 2 && out[1] > out[2]) [out[1], out[2]] = [out[2], out[1]]
    }
  }
  return out
}

/**
 * Roots of the polynomial `c` (constant first, degree 3 to 5) in
 * `[lower, upper]`, to `xError`, ascending. Roots without a sign change (double
 * roots) may be missed, which is harmless for finding extrema. Yuksel (2022).
 */
export function rootsBetween(
  c: ArrayLike<number>,
  lower: number,
  upper: number,
  xError: number,
): number[] {
  if (c.length === 4) return cubicRootsBetween(c, lower, upper, xError)
  const deriv = derivative(c)
  if (!allFinite(deriv)) return []
  const ends = rootsBetween(deriv, lower, upper, xError)
  ends.push(upper)
  const out: number[] = []
  let last = lower
  let lastVal = evalPoly(c, last)
  for (const x of ends) {
    const val = evalPoly(c, x)
    if (differentSigns(lastVal, val)) {
      out.push(
        findRoot(
          (t) => evalPoly(c, t),
          (t) => evalPoly(deriv, t),
          last,
          x,
          lastVal,
          val,
          xError,
        ),
      )
    }
    last = x
    lastVal = val
  }
  return out
}

/** Determinant of the 3x3 matrix with rows `(a00, a01, a02)`, `(a10, a11, a12)`, `(a20, a21, a22)`. */
function det3(
  a00: number,
  a01: number,
  a02: number,
  a10: number,
  a11: number,
  a12: number,
  a20: number,
  a21: number,
  a22: number,
): number {
  return (
    a00 * (a11 * a22 - a12 * a21) - a01 * (a10 * a22 - a12 * a20) + a02 * (a10 * a21 - a11 * a20)
  )
}

/**
 * Solve the 3x3 system `m·x = r` (`m` row-major) by Cramer's rule into `out`.
 * False when `|det m| < 1e-18`, i.e. (numerically) singular; the threshold is
 * absolute, so callers pass systems whose entries are of order one or larger.
 */
export function solve3(m: ArrayLike<number>, r: ArrayLike<number>, out: Float64Array): boolean {
  const d = det3(m[0], m[1], m[2], m[3], m[4], m[5], m[6], m[7], m[8])
  if (Math.abs(d) < 1e-18) return false
  out[0] = det3(r[0], m[1], m[2], r[1], m[4], m[5], r[2], m[7], m[8]) / d
  out[1] = det3(m[0], r[0], m[2], m[3], r[1], m[5], m[6], r[2], m[8]) / d
  out[2] = det3(m[0], m[1], r[0], m[3], m[4], r[1], m[6], m[7], r[2]) / d
  return true
}

/** Scale applied to arguments outside the range where {@link hypotKernel} is exact enough. */
const HYPOT_SCALE = 2 ** -600
/** Above this the squares could overflow: arguments are scaled down. */
const HYPOT_LARGE = 2 ** 511
/** Below this the squares could underflow: arguments are scaled up. */
const HYPOT_TINY = 2 ** -511
/** A smaller argument below this fraction of the larger cannot change the sum. */
const HYPOT_EPS = 2 ** -54

/**
 * `√(ax² + ay²)` for `ax ≥ ay ≥ 0` whose squares neither overflow nor underflow:
 * the rounded square root corrected by one Newton step whose residual is
 * computed from exact products (Borges 2019, "An improved algorithm for
 * hypot(a,b)", arXiv:1904.09481, the corrected algorithm without a fused
 * multiply-add).
 */
function hypotKernel(ax: number, ay: number): number {
  let h = Math.sqrt(ax * ax + ay * ay)
  let t1: number
  let t2: number
  if (h <= 2 * ay) {
    const delta = h - ay
    t1 = ax * (2 * delta - ax)
    t2 = (delta - 2 * (ax - ay)) * delta
  } else {
    const delta = h - ax
    t1 = 2 * delta * (ax - 2 * ay)
    t2 = (4 * delta - ay) * ay + delta * delta
  }
  h -= (t1 + t2) / (2 * h)
  return h
}

/**
 * Rust's `f64::hypot` on glibc, bit for bit: `√(x² + y²)` without undue overflow
 * or underflow, by {@link hypotKernel} with the arguments scaled out of the
 * extreme ranges. Infinite when either argument is infinite, NaN for another NaN.
 */
export function hypot(x: number, y: number): number {
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    if (Math.abs(x) === Infinity || Math.abs(y) === Infinity) return Infinity
    return x + y
  }
  const fx = Math.abs(x)
  const fy = Math.abs(y)
  const ax = fx < fy ? fy : fx
  const ay = fx < fy ? fx : fy
  if (ax > HYPOT_LARGE) {
    if (ay <= ax * HYPOT_EPS) return ax + ay
    return hypotKernel(ax * HYPOT_SCALE, ay * HYPOT_SCALE) / HYPOT_SCALE
  }
  if (ay < HYPOT_TINY) {
    if (ax >= ay / HYPOT_EPS) return ax + ay
    return hypotKernel(ax / HYPOT_SCALE, ay / HYPOT_SCALE) * HYPOT_SCALE
  }
  if (ay <= ax * HYPOT_EPS) return ax + ay
  return hypotKernel(ax, ay)
}
