/**
 * Rounded-rectangle geometry, orthogonal-distance fitting and path form. The
 * whole-ring primitive search (`primitives.ts`) asks for a free corner radius
 * and a radius pinned to zero (a plain rectangle) and lets the objective
 * choose; each is fitted axis-aligned and, when the samples' minimum-area
 * bounding rectangle is tilted, also in a rotated frame with the rotation as a
 * free parameter. The outline is written as straight sides and quarter arcs.
 *
 * Points are interleaved `x0, y0, x1, y1, …` in px; angles in radians. Every
 * formula is translation-invariant, so the pixel origin convention does not
 * enter.
 *
 * After inkvec (Apache-2.0): `crates/inkvec-fit/src/primitives/round_rect.rs`, and the
 * outline pieces of `crates/inkvec-fit/src/primitives.rs`.
 */
import type { PathCommand } from '@trazor/core'
import type { EdgePrimitive } from '../planar/types'
import { levenbergMarquardt, weightAt, weights } from './lm'

/** A (rounded) rectangle primitive. */
type Rect = Extract<EdgePrimitive, { kind: 'rect' }>

/** A fitted rounded rectangle with its weighted orthogonal-distance χ². */
export interface RoundRectFit {
  cx: number
  cy: number
  /** Half-width, along the rectangle's own x-axis. */
  hw: number
  /** Half-height, along the rectangle's own y-axis. */
  hh: number
  /** Corner radius, equal on both axes, in `[0, min(hw, hh)]`. */
  r: number
  /** Rotation of the rectangle's x-axis, radians in `(−π/4, π/4]`; 0 when axis-aligned. */
  rotation: number
  /** `Σ w·d²` over the samples, `w = 1/σ²`. */
  chi2: number
}

/**
 * Signed orthogonal distance (positive outside) from `(px, py)` to the rounded
 * rectangle centred at `(cx, cy)` with half-extents `hw`, `hh`, corner radius
 * `r`, rotated by the angle whose cosine and sine are `cos`, `sin`.
 *
 * The rounded rectangle is the Minkowski sum of the inner rectangle
 * (half-extents `hw − r`, `hh − r`) with a disc of radius `r`, so its distance
 * field is the inner rectangle's minus `r` — exact, whether the contact point
 * is on a side or a corner arc, which makes "equal quarter arcs and straight
 * sides" one least-squares problem instead of a case analysis.
 */
export function roundRectDistance(
  px: number,
  py: number,
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  r: number,
  cos = 1,
  sin = 0,
): number {
  const dx = px - cx
  const dy = py - cy
  const qx = Math.abs(cos * dx + sin * dy) - (hw - r)
  const qy = Math.abs(cos * dy - sin * dx) - (hh - r)
  const ox = qx > 0 ? qx : 0
  const oy = qy > 0 ? qy : 0
  const outside = Math.sqrt(ox * ox + oy * oy)
  const inside = Math.min(Math.max(qx, qy), 0)
  return outside + inside - r
}

/** `Σ w_k·d_k²` from the samples to the rounded rectangle `rr`. */
export function roundRectChi2(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  rr: Omit<RoundRectFit, 'chi2'>,
): number {
  const n = pts.length >> 1
  const cos = Math.cos(rr.rotation)
  const sin = Math.sin(rr.rotation)
  let chi2 = 0
  for (let k = 0; k < n; k++) {
    const d = roundRectDistance(
      pts[2 * k],
      pts[2 * k + 1],
      rr.cx,
      rr.cy,
      rr.hw,
      rr.hh,
      rr.r,
      cos,
      sin,
    )
    chi2 += weightAt(sigma, k) * d * d
  }
  return chi2
}

/**
 * Starting corner radii for {@link fitRoundRect}'s Levenberg–Marquardt runs, in
 * the frame whose coordinates are `u`, `v` (`bounds = [u0, u1, v0, v1]`).
 *
 * With `fixedR` there is one, the pinned radius clamped to `[0, rmax]`.
 * Otherwise six fractions of `rmax` (0, 0.1, 0.25, 0.5, 0.8, 1) plus one read
 * off the data: a straight side stops one radius short of the box's corner, so
 * for each side the samples within `3·max(σ_max, 0.05)` px of it are gathered,
 * how far each end of their extent falls short of the box is an estimate, and
 * the (upper) median of those estimates is added.
 */
function cornerRadiusGuesses(
  u: Float64Array,
  v: Float64Array,
  sigma: ArrayLike<number>,
  bounds: readonly [number, number, number, number],
  rmax: number,
  fixedR: number | null,
): number[] {
  if (fixedR !== null) return [Math.min(Math.max(fixedR, 0), rmax)]
  const [u0, u1, v0, v1] = bounds
  let sigmaMax = 0
  for (let k = 0; k < sigma.length; k++) if (sigma[k] > sigmaMax) sigmaMax = sigma[k]
  const tol = 3 * Math.max(sigmaMax, 0.05)
  const guesses = [0, 0.1 * rmax, 0.25 * rmax, 0.5 * rmax, 0.8 * rmax, rmax]
  const estimates: number[] = []
  // Samples near the side `across = at`, their extent along `along` against `[lo, hi]`.
  const side = (across: Float64Array, at: number, along: Float64Array, lo: number, hi: number) => {
    let count = 0
    let a = Infinity
    let b = -Infinity
    for (let k = 0; k < across.length; k++) {
      if (Math.abs(across[k] - at) > tol) continue
      count++
      if (along[k] < a) a = along[k]
      if (along[k] > b) b = along[k]
    }
    if (count >= 2) estimates.push(a - lo, hi - b)
  }
  side(v, v0, u, u0, u1)
  side(v, v1, u, u0, u1)
  side(u, u0, v, v0, v1)
  side(u, u1, v, v0, v1)
  if (estimates.length > 0) {
    estimates.sort((x, y) => x - y)
    guesses.push(Math.min(Math.max(estimates[estimates.length >> 1], 0), rmax))
  }
  return guesses
}

/**
 * Orthogonal-distance rounded-rectangle fit in the frame rotated by `rotation`.
 * `fixedR` pins the corner radius (to zero, for a plain rectangle) so the
 * alternative is costed on its own terms; `freeRotation` makes the rotation a
 * parameter too, started at `rotation`.
 *
 * Levenberg–Marquardt over `(cx, cy, hw, hh[, r][, rotation])` on the exact
 * signed distance {@link roundRectDistance}, weighted by `1/σ²`, started from
 * the samples' bounding box in that frame and each radius of
 * `cornerRadiusGuesses`; the lowest χ² wins (ties to the earlier start). The
 * distance field has creases where the contact moves from a side to an arc, so
 * the Jacobian is taken by central differences (step `1e-6·max(rmax, 1)` px for
 * lengths, 1e-6 rad for the rotation). After each step the half-extents are
 * kept at least 1e-3 px and the radius within `[0, min(hw, hh)]`; each run is
 * capped at 100 iterations. A free rotation comes back in `(−π/4, π/4]`, with
 * the half-extents swapped where a quarter turn brings it there.
 *
 * Null for fewer than eight samples, a box thinner than 2e-6 px, or when every
 * run fails. With `rotation = 0` and a fixed rotation this is inkvec's
 * axis-aligned fit.
 */
export function fitRoundRect(
  pts: Float64Array,
  sigma: ArrayLike<number>,
  fixedR: number | null,
  rotation = 0,
  freeRotation = false,
): RoundRectFit | null {
  const n = pts.length >> 1
  if (n < 8) return null
  const w = weights(sigma, n)
  const cos0 = Math.cos(rotation)
  const sin0 = Math.sin(rotation)
  // Sample coordinates in the rectangle's frame.
  const u = new Float64Array(n)
  const v = new Float64Array(n)
  let u0 = Infinity
  let u1 = -Infinity
  let v0 = Infinity
  let v1 = -Infinity
  for (let k = 0; k < n; k++) {
    const x = pts[2 * k]
    const y = pts[2 * k + 1]
    u[k] = cos0 * x + sin0 * y
    v[k] = cos0 * y - sin0 * x
    u0 = Math.min(u0, u[k])
    u1 = Math.max(u1, u[k])
    v0 = Math.min(v0, v[k])
    v1 = Math.max(v1, v[k])
  }
  const hw = 0.5 * (u1 - u0)
  const hh = 0.5 * (v1 - v0)
  if (!(hw >= 1e-6 && hh >= 1e-6)) return null
  const cu = 0.5 * (u0 + u1)
  const cv = 0.5 * (v0 + v1)
  const cx = cos0 * cu - sin0 * cv
  const cy = sin0 * cu + cos0 * cv
  const rmax = Math.min(hw, hh)
  const guesses = cornerRadiusGuesses(u, v, sigma, [u0, u1, v0, v1], rmax, fixedR)

  // Parameter layout: cx, cy, hw, hh, then r when free, then rotation when free.
  const freeR = fixedR === null
  const iR = freeR ? 4 : -1
  const iRot = freeRotation ? (freeR ? 5 : 4) : -1
  const k = 4 + (freeR ? 1 : 0) + (freeRotation ? 1 : 0)
  const h = 1e-6 * Math.max(rmax, 1)
  // Rows of (cx, cy, hw, hh, r, cos, sin): the base point, then +step and −step per parameter.
  const sets = new Float64Array(7 * (2 * k + 1))
  const steps = new Float64Array(k)
  const jac = new Float64Array(k)
  const fill = (row: number, p: Float64Array): void => {
    const o = 7 * row
    sets[o] = p[0]
    sets[o + 1] = p[1]
    sets[o + 2] = p[2]
    sets[o + 3] = p[3]
    sets[o + 4] = freeR ? p[iR] : (fixedR as number)
    const angle = freeRotation ? p[iRot] : rotation
    sets[o + 5] = Math.cos(angle)
    sets[o + 6] = Math.sin(angle)
  }
  const shifted = new Float64Array(k)
  const evaluate = (p: Float64Array, jtj: Float64Array, jtr: Float64Array): number => {
    fill(0, p)
    for (let a = 0; a < k; a++) {
      steps[a] = a === iRot ? 1e-6 : h
      shifted.set(p)
      shifted[a] = p[a] + steps[a]
      fill(1 + 2 * a, shifted)
      shifted[a] = p[a] - steps[a]
      fill(2 + 2 * a, shifted)
    }
    jtj.fill(0)
    jtr.fill(0)
    let chi2 = 0
    for (let s = 0; s < n; s++) {
      const x = pts[2 * s]
      const y = pts[2 * s + 1]
      const d = roundRectDistance(x, y, p[0], p[1], p[2], p[3], sets[4], sets[5], sets[6])
      for (let a = 0; a < k; a++) {
        const o1 = 7 * (1 + 2 * a)
        const o2 = o1 + 7
        const dp = roundRectDistance(
          x,
          y,
          sets[o1],
          sets[o1 + 1],
          sets[o1 + 2],
          sets[o1 + 3],
          sets[o1 + 4],
          sets[o1 + 5],
          sets[o1 + 6],
        )
        const dm = roundRectDistance(
          x,
          y,
          sets[o2],
          sets[o2 + 1],
          sets[o2 + 2],
          sets[o2 + 3],
          sets[o2 + 4],
          sets[o2 + 5],
          sets[o2 + 6],
        )
        jac[a] = (dp - dm) / (2 * steps[a])
      }
      const wk = w[s]
      chi2 += wk * d * d
      for (let a = 0; a < k; a++) {
        jtr[a] += wk * jac[a] * d
        for (let b = 0; b < k; b++) jtj[a * k + b] += wk * jac[a] * jac[b]
      }
    }
    return chi2
  }
  const project = (p: Float64Array): void => {
    p[2] = Math.max(Math.abs(p[2]), 1e-3)
    p[3] = Math.max(Math.abs(p[3]), 1e-3)
    if (freeR) p[iR] = Math.min(Math.max(p[iR], 0), Math.min(p[2], p[3]))
  }

  let best: { p: Float64Array; chi2: number } | null = null
  for (const g of guesses) {
    const p0 = [cx, cy, hw, hh]
    if (freeR) p0.push(g)
    if (freeRotation) p0.push(rotation)
    const out = levenbergMarquardt(p0, 100, evaluate, project)
    if (out !== null && (best === null || out.chi2 < best.chi2)) best = out
  }
  if (best === null) return null
  const p = best.p
  const fit = {
    cx: p[0],
    cy: p[1],
    hw: p[2],
    hh: p[3],
    r: freeR ? p[iR] : (fixedR as number),
    rotation: freeRotation ? p[iRot] : rotation,
  }
  if (freeRotation) {
    // A quarter turn swaps the half-extents and draws the same outline.
    while (fit.rotation > Math.PI / 4) {
      fit.rotation -= Math.PI / 2
      ;[fit.hw, fit.hh] = [fit.hh, fit.hw]
    }
    while (fit.rotation <= -Math.PI / 4) {
      fit.rotation += Math.PI / 2
      ;[fit.hw, fit.hh] = [fit.hh, fit.hw]
    }
  }
  return { ...fit, chi2: roundRectChi2(pts, sigma, fit) }
}

/** One piece of a rounded rectangle's outline, in increasing-angle order. */
type Piece =
  | { line: true; ax: number; ay: number; bx: number; by: number }
  /** A quarter turn of increasing angle from `a` about `(cx, cy)`. */
  | { line: false; cx: number; cy: number; r: number; a: number }

/** The outline's eight pieces in increasing-angle order, zero-length ones dropped. */
function rectPieces(rect: Rect): Piece[] {
  const c = Math.cos(rect.rotation)
  const s = Math.sin(rect.rotation)
  const { r } = rect
  const x0 = -rect.w / 2
  const x1 = rect.w / 2
  const y0 = -rect.h / 2
  const y1 = rect.h / 2
  const wx = (u: number, v: number) => rect.cx + c * u - s * v
  const wy = (u: number, v: number) => rect.cy + s * u + c * v
  const line = (ua: number, va: number, ub: number, vb: number): Piece => ({
    line: true,
    ax: wx(ua, va),
    ay: wy(ua, va),
    bx: wx(ub, vb),
    by: wy(ub, vb),
  })
  const arc = (u: number, v: number, a: number): Piece => ({
    line: false,
    cx: wx(u, v),
    cy: wy(u, v),
    r,
    a: a + rect.rotation,
  })
  const pieces = [
    line(x1, y0 + r, x1, y1 - r),
    arc(x1 - r, y1 - r, 0),
    line(x1 - r, y1, x0 + r, y1),
    arc(x0 + r, y1 - r, Math.PI / 2),
    line(x0, y1 - r, x0, y0 + r),
    arc(x0 + r, y0 + r, Math.PI),
    line(x0 + r, y0, x1 - r, y0),
    arc(x1 - r, y0 + r, (3 * Math.PI) / 2),
  ]
  return pieces.filter((p) =>
    p.line ? Math.hypot(p.bx - p.ax, p.by - p.ay) > 1e-9 : (p.r * Math.PI) / 2 > 1e-9,
  )
}

/** The point at parameter `u ∈ [0, 1]` of a piece, written to `out`. */
function pieceAt(p: Piece, u: number, out: Float64Array): void {
  if (p.line) {
    out[0] = p.ax + (p.bx - p.ax) * u
    out[1] = p.ay + (p.by - p.ay) * u
  } else {
    const a = p.a + (u * Math.PI) / 2
    out[0] = p.cx + p.r * Math.cos(a)
    out[1] = p.cy + p.r * Math.sin(a)
  }
}

/**
 * Parameter in `[0, 1]` of the point of `p` nearest `(x, y)`; on an arc, a
 * point beyond the quarter turn takes the nearer endpoint.
 */
function pieceNearest(p: Piece, x: number, y: number): number {
  if (p.line) {
    const dx = p.bx - p.ax
    const dy = p.by - p.ay
    const l2 = dx * dx + dy * dy
    return l2 > 0 ? Math.min(Math.max(((x - p.ax) * dx + (y - p.ay) * dy) / l2, 0), 1) : 0
  }
  let rel = Math.atan2(y - p.cy, x - p.cx) - p.a
  while (rel < 0) rel += 2 * Math.PI
  while (rel >= 2 * Math.PI) rel -= 2 * Math.PI
  if (rel <= Math.PI / 2) return rel / (Math.PI / 2)
  return rel < Math.PI / 2 + (3 * Math.PI) / 4 ? 1 : 0
}

/** The sub-piece from `u0` to `u1` (`u1 < u0` runs backwards), ending at `(x, y)`. */
function pieceCommand(p: Piece, u0: number, u1: number, x: number, y: number): PathCommand {
  if (p.line) return { type: 'L', x, y }
  return { type: 'A', rx: p.r, ry: p.r, rotation: 0, largeArc: false, sweep: u1 > u0, x, y }
}

/** `cmd` with its endpoint moved to `(x, y)`. */
function withEnd(cmd: PathCommand, x: number, y: number): PathCommand {
  return cmd.type === 'Z' ? cmd : { ...cmd, x, y }
}

/** Index and parameter of the outline point nearest `(x, y)` (ties to the earlier piece). */
function nearestPiece(pieces: readonly Piece[], x: number, y: number): [number, number] {
  const at = new Float64Array(2)
  let best = Infinity
  let k0 = 0
  let u0 = 0
  for (let k = 0; k < pieces.length; k++) {
    const u = pieceNearest(pieces[k], x, y)
    pieceAt(pieces[k], u, at)
    const d = Math.hypot(x - at[0], y - at[1])
    if (d < best) {
      best = d
      k0 = k
      u0 = u
    }
  }
  return [k0, u0]
}

/**
 * A (rounded) rectangle's outline as `L` sides and quarter-arc `A` corners from
 * the caller's current point `(x0, y0)`: from the nearest point of the nearest
 * piece to that piece's end, through every other piece in turn toward
 * increasing angle when `increasing` (decreasing otherwise), and back along the
 * first piece to exactly `(x0, y0)`; a closing segment of zero length is folded
 * into the one before. Empty for a rectangle with no pieces.
 */
export function rectCommands(
  rect: Rect,
  x0: number,
  y0: number,
  increasing: boolean,
): PathCommand[] {
  const pieces = rectPieces(rect)
  const m = pieces.length
  if (m === 0) return []
  const [k0, u0] = nearestPiece(pieces, x0, y0)
  const at = new Float64Array(2)
  const out: PathCommand[] = []
  const firstTo = increasing ? 1 : 0
  const lastFrom = increasing ? 0 : 1
  if (Math.abs(u0 - firstTo) > 1e-9) {
    pieceAt(pieces[k0], firstTo, at)
    out.push(pieceCommand(pieces[k0], u0, firstTo, at[0], at[1]))
  }
  for (let i = 1; i < m; i++) {
    const k = increasing ? (k0 + i) % m : (k0 + m - i) % m
    pieceAt(pieces[k], increasing ? 1 : 0, at)
    out.push(pieceCommand(pieces[k], increasing ? 0 : 1, increasing ? 1 : 0, at[0], at[1]))
  }
  out.push(pieceCommand(pieces[k0], lastFrom, u0, x0, y0))
  if (Math.abs(u0 - lastFrom) <= 1e-9 && out.length > 1) {
    out.pop()
    out[out.length - 1] = withEnd(out[out.length - 1], x0, y0)
  }
  return out
}

/** The point of the (rounded) rectangle's outline nearest `(x, y)`. */
export function nearestOnRect(rect: Rect, x: number, y: number): [number, number] {
  const pieces = rectPieces(rect)
  if (pieces.length === 0) return [rect.cx, rect.cy]
  const [k, u] = nearestPiece(pieces, x, y)
  const at = new Float64Array(2)
  pieceAt(pieces[k], u, at)
  return [at[0], at[1]]
}

/**
 * Orientation of the samples' minimum-area bounding rectangle, in
 * `(−π/4, π/4]`: the start of the rotated rectangle fit. One side of the
 * minimum-area rectangle lies on an edge of the convex hull (Freeman & Shapira
 * 1975), so each hull edge's direction is tried, the box's extremes found by
 * rotating calipers (Toussaint 1983) in O(h) over the hull, and the smallest
 * box kept (ties to the earlier edge). Exactly 0 when that edge is
 * axis-aligned, and 0 for fewer than three hull vertices.
 */
export function minAreaRectAngle(pts: Float64Array): number {
  const hull = convexHull(pts)
  const m = hull.length >> 1
  if (m < 3) return 0
  const along = (k: number, ux: number, uy: number): number =>
    hull[2 * (k % m)] * ux + hull[2 * (k % m) + 1] * uy
  // Extremes for the first edge by a scan, then advanced with the edge: the
  // farthest along the edge (`hi`), against it (`lo`), and across it (`top`).
  let hi = 0
  let lo = 0
  let top = 0
  let bestArea = Infinity
  let best = 0
  for (let i = 0; i < m; i++) {
    const ex = hull[2 * ((i + 1) % m)] - hull[2 * i]
    const ey = hull[2 * ((i + 1) % m) + 1] - hull[2 * i + 1]
    const len = Math.hypot(ex, ey)
    const c = ex / len
    const s = ey / len
    if (i === 0) {
      for (let k = 1; k < m; k++) {
        if (along(k, c, s) > along(hi, c, s)) hi = k
        if (along(k, c, s) < along(lo, c, s)) lo = k
        if (along(k, -s, c) > along(top, -s, c)) top = k
      }
    } else {
      for (let n = 0; n < m && along(hi + 1, c, s) > along(hi, c, s); n++) hi++
      for (let n = 0; n < m && along(lo + 1, c, s) < along(lo, c, s); n++) lo++
      for (let n = 0; n < m && along(top + 1, -s, c) > along(top, -s, c); n++) top++
    }
    // The hull lies to the left of each edge, so the edge is the box's near side.
    const area = (along(hi, c, s) - along(lo, c, s)) * (along(top, -s, c) - along(i, -s, c))
    if (area < bestArea) {
      bestArea = area
      best = Math.atan2(ey, ex)
    }
  }
  while (best > Math.PI / 4) best -= Math.PI / 2
  while (best <= -Math.PI / 4) best += Math.PI / 2
  return best
}

/**
 * Convex hull of the points by Andrew's monotone chain, counter-clockwise in a
 * y-up frame (each edge has the hull on its left), collinear and repeated
 * points dropped; interleaved like the input.
 */
export function convexHull(pts: Float64Array): Float64Array {
  const n = pts.length >> 1
  const order = Array.from({ length: n }, (_, k) => k)
  order.sort((a, b) => pts[2 * a] - pts[2 * b] || pts[2 * a + 1] - pts[2 * b + 1])
  const stack = new Int32Array(2 * n + 1)
  let top = 0
  const cross = (o: number, a: number, b: number): number =>
    (pts[2 * a] - pts[2 * o]) * (pts[2 * b + 1] - pts[2 * o + 1]) -
    (pts[2 * a + 1] - pts[2 * o + 1]) * (pts[2 * b] - pts[2 * o])
  for (let i = 0; i < n; i++) {
    while (top >= 2 && cross(stack[top - 2], stack[top - 1], order[i]) <= 0) top--
    stack[top++] = order[i]
  }
  const lower = top + 1
  for (let i = n - 2; i >= 0; i--) {
    while (top >= lower && cross(stack[top - 2], stack[top - 1], order[i]) <= 0) top--
    stack[top++] = order[i]
  }
  const m = Math.max(top - 1, 0)
  const out = new Float64Array(2 * m)
  for (let i = 0; i < m; i++) {
    out[2 * i] = pts[2 * stack[i]]
    out[2 * i + 1] = pts[2 * stack[i] + 1]
  }
  return out
}
