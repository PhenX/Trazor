/**
 * Ellipse geometry and fitting: Taubin's algebraic conic fit as the start, and
 * Levenberg–Marquardt on the true orthogonal distance to finish (Ahn, Rauh &
 * Warnecke 2001). Used by the whole-ring primitive search in `primitives.ts`.
 *
 * An ellipse is `c + R(angle)·(rx·cos t, ry·sin t)` for the parametric angle
 * `t`, `R` the rotation matrix; after fitting `rx ≥ ry` and
 * `angle ∈ (−π/2, π/2]`. Points are interleaved `x0, y0, x1, y1, …` in px,
 * angles in radians. Every formula is translation-invariant, so the pixel
 * origin convention does not enter.
 *
 * After inkvec (Apache-2.0): `crates/inkvec-fit/src/primitives/ellipse.rs`.
 */
import { genEigen5, levenbergMarquardt, weightAt, weights } from './lm'

/** A fitted ellipse with its weighted orthogonal-distance χ². */
export interface EllipseFit {
  cx: number
  cy: number
  /** Semi-axis along the ellipse's own x-axis. */
  rx: number
  /** Semi-axis along the ellipse's own y-axis. */
  ry: number
  /** Rotation of the `rx` axis, radians. */
  angle: number
  /** `Σ w·d²` over the samples, `w = 1/σ²`; infinite when not scored. */
  chi2: number
}

/** A circle as the ellipse search's near-circle starts read it. */
export interface CircleSeed {
  cx: number
  cy: number
  r: number
}

/** Point at parametric angle `t`, written to `out[0..1]`. */
export function ellipseAt(e: EllipseFit, t: number, out: Float64Array): void {
  const s = Math.sin(e.angle)
  const c = Math.cos(e.angle)
  const x = e.rx * Math.cos(t)
  const y = e.ry * Math.sin(t)
  out[0] = e.cx + c * x - s * y
  out[1] = e.cy + s * x + c * y
}

/**
 * Orthogonal contact of `(px, py)`: returns the signed distance (positive
 * outside) and writes `out = [d, t, nx, ny]`, `t` the foot's parametric angle
 * and `(nx, ny)` the unit outward normal in the ellipse's own frame.
 *
 * In that frame the point is `q` and the foot satisfies
 * `f(t) = −rx·qx·sin t + ry·qy·cos t + (rx² − ry²)·sin t·cos t = 0`, solved by
 * Newton from `t = atan2(rx·qy, ry·qx)` (exact on a circle) with steps clamped
 * to ±0.5 rad, at most 12 of them. The normal at `E(t)` is `(ry cos t, rx sin t)`
 * normalized. Near the centre of an eccentric ellipse `f` has several roots;
 * fitted samples never sit there.
 */
export function ellipseContact(e: EllipseFit, px: number, py: number, out: Float64Array): number {
  const s = Math.sin(e.angle)
  const c = Math.cos(e.angle)
  const dx = px - e.cx
  const dy = py - e.cy
  const qx = c * dx + s * dy
  const qy = -s * dx + c * dy
  const rx = e.rx
  const ry = e.ry
  let t = Math.atan2(rx * qy, ry * qx)
  const k = rx * rx - ry * ry
  for (let i = 0; i < 12; i++) {
    const st = Math.sin(t)
    const ct = Math.cos(t)
    const f = -rx * qx * st + ry * qy * ct + k * st * ct
    const df = -rx * qx * ct - ry * qy * st + k * (ct * ct - st * st)
    if (Math.abs(df) < 1e-300) break
    const step = Math.min(Math.max(f / df, -0.5), 0.5)
    t -= step
    if (Math.abs(step) < 1e-13) break
  }
  const st = Math.sin(t)
  const ct = Math.cos(t)
  let nx = ry * ct
  let ny = rx * st
  const nn = Math.hypot(nx, ny)
  if (nn < 1e-300) {
    nx = 1
    ny = 0
  } else {
    nx /= nn
    ny /= nn
  }
  const d = (qx - rx * ct) * nx + (qy - ry * st) * ny
  out[0] = d
  out[1] = t
  out[2] = nx
  out[3] = ny
  return d
}

/** `χ² = Σ w_k·d_k²` from the samples to the ellipse, `w_k = 1/σ_k²`; dimensionless. */
export function ellipseChi2(pts: Float64Array, sigma: ArrayLike<number>, e: EllipseFit): number {
  const n = pts.length >> 1
  const scratch = new Float64Array(4)
  let chi2 = 0
  for (let k = 0; k < n; k++) {
    const d = ellipseContact(e, pts[2 * k], pts[2 * k + 1], scratch)
    chi2 += weightAt(sigma, k) * d * d
  }
  return chi2
}

/**
 * Geometry of the conic `a x² + b xy + c y² + d x + e y + f = 0`, if it is a
 * real ellipse: centre where the gradient vanishes,
 * `x0 = (b·e − 2c·d)/(4ac − b²)`, `y0 = (b·d − 2a·e)/(4ac − b²)`, axes rotated by
 * `½·atan2(b, a − c)`, semi-axes `√(−f0/l1)` and `√(−f0/l2)` with
 * `f0 = f + ½(d·x0 + e·y0)` and `l1`, `l2` the quadratic form along the axes
 * (`r1` along `angle`, either may be the larger). Null unless `b² − 4ac < 0`,
 * `f0 ≠ 0` and both `−f0/l` are positive.
 */
export function conicToEllipse(
  k: ArrayLike<number>,
): { cx: number; cy: number; r1: number; r2: number; angle: number } | null {
  const [a, b, c, d, e, f] = [k[0], k[1], k[2], k[3], k[4], k[5]]
  if (!(b * b - 4 * a * c < 0)) return null
  const det = 4 * a * c - b * b
  const x0 = (b * e - 2 * c * d) / det
  const y0 = (b * d - 2 * a * e) / det
  const f0 = f + 0.5 * (d * x0 + e * y0)
  if (f0 === 0) return null
  const angle = 0.5 * Math.atan2(b, a - c)
  const s = Math.sin(angle)
  const cs = Math.cos(angle)
  const l1 = a * cs * cs + b * cs * s + c * s * s
  const l2 = a * s * s - b * cs * s + c * cs * cs
  const r1 = -f0 / l1
  const r2 = -f0 / l2
  if (!(r1 > 0 && r2 > 0)) return null
  return { cx: x0, cy: y0, r1: Math.sqrt(r1), r2: Math.sqrt(r2), angle }
}

/** An ellipse axis angle normalized into `(−π/2, π/2]`. */
export function canonicalAngle(angle: number): number {
  let a = angle
  while (a > Math.PI / 2) a -= Math.PI
  while (a <= -Math.PI / 2) a += Math.PI
  return a
}

/**
 * Taubin's algebraic conic fit, weighted by `1/σ²`, when it is an ellipse, with
 * its minimized residual in px² summed over the samples (`μ·s²·Σw`, which
 * approximates the Sampson χ² of the conic, Taubin 1991). `chi2` is left
 * infinite ("not scored").
 *
 * The samples are centred on their weighted centroid and scaled by their RMS
 * distance `s` from it; each gives the row `z = (u², uv, v², u, v)`, centred on
 * the weighted mean `z̄` to drop the constant term. The fit minimizes `θᵀCθ`,
 * `C = Σ w (z − z̄)(z − z̄)ᵀ`, subject to `θᵀNθ = 1`,
 * `N = Σ w (∂z/∂u ∂z/∂uᵀ + ∂z/∂v ∂z/∂vᵀ)` — the gradient normalization that makes
 * the residual approximate a squared distance (Kanatani & Rangarajan 2011, eqs.
 * 14–17, 23). Null for fewer than six samples, zero weight, coincident samples
 * or a conic that is not an ellipse.
 */
export function taubinEllipseWithResidual(
  pts: Float64Array,
  sigma: ArrayLike<number>,
): { fit: EllipseFit; residual: number } | null {
  const n = pts.length >> 1
  if (n < 6) return null
  const w = weights(sigma, n)
  let sw = 0
  let mx = 0
  let my = 0
  for (let k = 0; k < n; k++) {
    sw += w[k]
    mx += pts[2 * k] * w[k]
    my += pts[2 * k + 1] * w[k]
  }
  if (!(sw > 0)) return null
  mx /= sw
  my /= sw
  let variance = 0
  for (let k = 0; k < n; k++) {
    const dx = pts[2 * k] - mx
    const dy = pts[2 * k + 1] - my
    variance += w[k] * (dx * dx + dy * dy)
  }
  const scale = Math.sqrt(variance / sw)
  if (!(scale > 1e-12)) return null

  const rows = new Float64Array(5 * n)
  const mean = new Float64Array(5)
  for (let k = 0; k < n; k++) {
    const u = (pts[2 * k] - mx) / scale
    const v = (pts[2 * k + 1] - my) / scale
    const o = 5 * k
    rows[o] = u * u
    rows[o + 1] = u * v
    rows[o + 2] = v * v
    rows[o + 3] = u
    rows[o + 4] = v
    for (let a = 0; a < 5; a++) mean[a] += w[k] * rows[o + a]
  }
  for (let a = 0; a < 5; a++) mean[a] /= sw
  const cov = new Float64Array(25)
  const nrm = new Float64Array(25)
  const d = new Float64Array(5)
  const gx = new Float64Array(5)
  const gy = new Float64Array(5)
  for (let k = 0; k < n; k++) {
    const o = 5 * k
    const u = rows[o + 3]
    const v = rows[o + 4]
    gx[0] = 2 * u
    gx[1] = v
    gx[3] = 1
    gy[1] = u
    gy[2] = 2 * v
    gy[4] = 1
    for (let a = 0; a < 5; a++) d[a] = rows[o + a] - mean[a]
    const wk = w[k]
    for (let a = 0; a < 5; a++) {
      for (let b = 0; b < 5; b++) {
        cov[a * 5 + b] += wk * d[a] * d[b]
        nrm[a * 5 + b] += wk * (gx[a] * gx[b] + gy[a] * gy[b])
      }
    }
  }
  const eig = genEigen5(cov, nrm)
  if (eig === null) return null
  const th = eig.theta
  let dot = 0
  for (let a = 0; a < 5; a++) dot += mean[a] * th[a]
  const conic = conicToEllipse([th[0], th[1], th[2], th[3], th[4], -dot])
  if (conic === null) return null
  const swap = conic.r1 < conic.r2
  const fit: EllipseFit = {
    cx: mx + scale * conic.cx,
    cy: my + scale * conic.cy,
    rx: (swap ? conic.r2 : conic.r1) * scale,
    ry: (swap ? conic.r1 : conic.r2) * scale,
    angle: canonicalAngle(swap ? conic.angle + Math.PI / 2 : conic.angle),
    chi2: Infinity,
  }
  return { fit, residual: eig.mu * scale * scale * sw }
}

/** {@link taubinEllipseWithResidual}'s geometry alone (`chi2` infinite). */
export function taubinEllipse(pts: Float64Array, sigma: ArrayLike<number>): EllipseFit | null {
  return taubinEllipseWithResidual(pts, sigma)?.fit ?? null
}

/** Taubin's algebraic ellipse with its orthogonal χ²: the reference for what algebraic-only costs. */
export function fitEllipseAlgebraic(
  pts: Float64Array,
  sigma: ArrayLike<number>,
): EllipseFit | null {
  const e = taubinEllipse(pts, sigma)
  if (e === null) return null
  return { ...e, chi2: ellipseChi2(pts, sigma, e) }
}

/** Keep an ellipse's radii `(p[2], p[3])` positive, at least 1e-3 px. */
function keepRadii(p: Float64Array): void {
  p[2] = Math.max(Math.abs(p[2]), 1e-3)
  p[3] = Math.max(Math.abs(p[3]), 1e-3)
}

/**
 * Levenberg–Marquardt on the signed orthogonal distances of
 * {@link ellipseContact} over `(cx, cy, rx, ry, angle)`, weighted by `1/σ²`.
 *
 * The Jacobian holds the contact angle fixed (the envelope argument: the
 * contact parameter contributes nothing to first order), so with `n` the unit
 * normal in the ellipse frame, `n_w` the same normal in the world frame and
 * `(ex, ey) = (rx cos t, ry sin t)`:
 * `∂d/∂c = −n_w`, `∂d/∂rx = −n_x cos t`, `∂d/∂ry = −n_y sin t`,
 * `∂d/∂angle = n_x·ey − n_y·ex`. Radii are kept at least 1e-3 px, at most 200
 * iterations run, and the result is normalized to `rx ≥ ry`,
 * `angle ∈ (−π/2, π/2]`. Null if a distance turns non-finite or the solver fails.
 */
export function refineEllipse(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  init: EllipseFit,
): EllipseFit | null {
  const n = pts.length >> 1
  const w = weights(sigma, n)
  const scratch = new Float64Array(4)
  const j = new Float64Array(5)
  const e: EllipseFit = { cx: 0, cy: 0, rx: 0, ry: 0, angle: 0, chi2: 0 }
  const evaluate = (p: Float64Array, jtj: Float64Array, jtr: Float64Array): number | null => {
    e.cx = p[0]
    e.cy = p[1]
    e.rx = p[2]
    e.ry = p[3]
    e.angle = p[4]
    const s = Math.sin(e.angle)
    const c = Math.cos(e.angle)
    jtj.fill(0)
    jtr.fill(0)
    let chi2 = 0
    for (let k = 0; k < n; k++) {
      const d = ellipseContact(e, pts[2 * k], pts[2 * k + 1], scratch)
      if (!Number.isFinite(d)) return null
      const t = scratch[1]
      const nx = scratch[2]
      const ny = scratch[3]
      const st = Math.sin(t)
      const ct = Math.cos(t)
      const ex = e.rx * ct
      const ey = e.ry * st
      j[0] = -(c * nx - s * ny)
      j[1] = -(s * nx + c * ny)
      j[2] = -nx * ct
      j[3] = -ny * st
      j[4] = nx * ey - ny * ex
      const wk = w[k]
      chi2 += wk * d * d
      for (let a = 0; a < 5; a++) {
        jtr[a] += wk * j[a] * d
        for (let b = 0; b < 5; b++) jtj[a * 5 + b] += wk * j[a] * j[b]
      }
    }
    return chi2
  }
  const out = levenbergMarquardt(
    [init.cx, init.cy, init.rx, init.ry, init.angle],
    200,
    evaluate,
    keepRadii,
  )
  if (out === null) return null
  const [cx, cy, r1, r2, angle] = out.p
  const swap = r1 < r2
  return {
    cx,
    cy,
    rx: swap ? r2 : r1,
    ry: swap ? r1 : r2,
    angle: canonicalAngle(swap ? angle + Math.PI / 2 : angle),
    chi2: out.chi2,
  }
}

/**
 * Orthogonal ellipse fit from given starts: Levenberg–Marquardt from the
 * algebraic fit (when there is one), then from four near-circles about
 * `circle` (radii 1.02·r and 0.98·r at 0°, 45°, 90° and 135°), keeping the
 * lowest χ² (ties to the earlier start). Several starts because the orthogonal
 * objective has local minima, and the near-circles still give a start where
 * the algebraic fit returns nothing. Null for fewer than six samples or when
 * every start fails.
 */
export function fitEllipseSeeded(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  algebraic: EllipseFit | null,
  circle: CircleSeed | null,
): EllipseFit | null {
  if (pts.length >> 1 < 6) return null
  const starts: EllipseFit[] = []
  if (algebraic !== null) starts.push(algebraic)
  if (circle !== null) {
    for (let k = 0; k < 4; k++) {
      starts.push({
        cx: circle.cx,
        cy: circle.cy,
        rx: circle.r * 1.02,
        ry: circle.r * 0.98,
        angle: (k * Math.PI) / 4,
        chi2: Infinity,
      })
    }
  }
  let best: EllipseFit | null = null
  for (const s of starts) {
    const e = refineEllipse(pts, sigma, s)
    if (e !== null && (best === null || e.chi2 < best.chi2)) best = e
  }
  return best
}

/**
 * The five-start orthogonal fit ({@link fitEllipseSeeded}) with Taubin's
 * ellipse as the algebraic start and `circle` (the orthogonal circle fit of the
 * same samples) seeding the near-circles.
 */
export function fitEllipseFrom(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  circle: CircleSeed | null,
): EllipseFit | null {
  if (pts.length >> 1 < 6) return null
  return fitEllipseSeeded(pts, sigma, taubinEllipse(pts, sigma), circle)
}

/**
 * Taubin's residual as a share of the orthogonal χ² Levenberg–Marquardt reaches
 * from it never fell below 0.28 over inkvec's 1,131 closed screen-set rings and
 * a poster's 232, so a residual whose quarter already exceeds the χ² gate marks
 * an ellipse the gate would refuse.
 */
const SCREEN_SHARE = 0.25

/**
 * The orthogonal ellipse the whole-ring search offers, or null where the χ²
 * `gate` it must then pass would refuse it anyway: not run when
 * `SCREEN_SHARE·residual` of Taubin's fit exceeds `gate`, and started from the
 * algebraic fit alone (Halíř & Flusser 1998: "a fast and robust estimator of a
 * good initial solution"); the five-start {@link fitEllipseFrom} remains the
 * fallback when there is no algebraic ellipse or Levenberg–Marquardt fails
 * from it.
 */
export function fitEllipseScreened(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  circle: CircleSeed | null,
  gate: number,
): EllipseFit | null {
  if (pts.length >> 1 < 6) return null
  const alg = taubinEllipseWithResidual(pts, sigma)
  if (alg === null) return fitEllipseFrom(pts, sigma, circle)
  if (SCREEN_SHARE * alg.residual > gate) return null
  return refineEllipse(pts, sigma, alg.fit) ?? fitEllipseFrom(pts, sigma, circle)
}
