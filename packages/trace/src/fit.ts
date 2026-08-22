import type { PathCommand } from '@vectorizer/core'
import { cubicAt } from './paths'

/**
 * Cubic Bézier fitting for open polylines: Schneider's algorithm (Graphics
 * Gems, 1990) — least-squares fit with prescribed end tangents, Newton-Raphson
 * reparameterization, recursive splitting at the max-error point.
 */

export interface Cubic {
  p0x: number
  p0y: number
  c1x: number
  c1y: number
  c2x: number
  c2y: number
  p3x: number
  p3y: number
}

function b0(u: number): number {
  const t = 1 - u
  return t * t * t
}
function b1(u: number): number {
  const t = 1 - u
  return 3 * u * t * t
}
function b2(u: number): number {
  return 3 * u * u * (1 - u)
}
function b3(u: number): number {
  return u * u * u
}

/**
 * Least-squares cubic through the run [first..last] of `pts` (flat xy), with
 * unit tangents t0 (leaving the start) and t1 (leaving the end, pointing back
 * along the curve), parameter values `u` (same index range as pts).
 */
export function fitCubicSegment(
  pts: ArrayLike<number>,
  first: number,
  last: number,
  u: ArrayLike<number>,
  t0x: number,
  t0y: number,
  t1x: number,
  t1y: number,
): Cubic {
  const p0x = pts[first * 2]
  const p0y = pts[first * 2 + 1]
  const p3x = pts[last * 2]
  const p3y = pts[last * 2 + 1]

  let c00 = 0
  let c01 = 0
  let c11 = 0
  let x0 = 0
  let x1 = 0
  for (let i = first; i <= last; i++) {
    const ui = u[i - first]
    const a0x = t0x * b1(ui)
    const a0y = t0y * b1(ui)
    const a1x = t1x * b2(ui)
    const a1y = t1y * b2(ui)
    c00 += a0x * a0x + a0y * a0y
    c01 += a0x * a1x + a0y * a1y
    c11 += a1x * a1x + a1y * a1y
    const tmpx = pts[i * 2] - (b0(ui) + b1(ui)) * p0x - (b2(ui) + b3(ui)) * p3x
    const tmpy = pts[i * 2 + 1] - (b0(ui) + b1(ui)) * p0y - (b2(ui) + b3(ui)) * p3y
    x0 += a0x * tmpx + a0y * tmpy
    x1 += a1x * tmpx + a1y * tmpy
  }

  const det = c00 * c11 - c01 * c01
  let alphaL = 0
  let alphaR = 0
  if (Math.abs(det) > 1e-12) {
    alphaL = (x0 * c11 - x1 * c01) / det
    alphaR = (c00 * x1 - c01 * x0) / det
  }
  const segLen = Math.hypot(p3x - p0x, p3y - p0y)
  const eps = 1e-6 * segLen
  if (alphaL < eps || alphaR < eps) {
    // Wu/Barsky heuristic fallback.
    alphaL = alphaR = segLen / 3
  }
  return {
    p0x,
    p0y,
    c1x: p0x + alphaL * t0x,
    c1y: p0y + alphaL * t0y,
    c2x: p3x + alphaR * t1x,
    c2y: p3y + alphaR * t1y,
    p3x,
    p3y,
  }
}

function cubicDeriv1(c: Cubic, t: number): [number, number] {
  const u = 1 - t
  const ax = 3 * (c.c1x - c.p0x)
  const ay = 3 * (c.c1y - c.p0y)
  const bx = 3 * (c.c2x - c.c1x)
  const by = 3 * (c.c2y - c.c1y)
  const cx = 3 * (c.p3x - c.c2x)
  const cy = 3 * (c.p3y - c.c2y)
  return [u * u * ax + 2 * u * t * bx + t * t * cx, u * u * ay + 2 * u * t * by + t * t * cy]
}

function cubicDeriv2(c: Cubic, t: number): [number, number] {
  const ax = 6 * (c.c2x - 2 * c.c1x + c.p0x)
  const ay = 6 * (c.c2y - 2 * c.c1y + c.p0y)
  const bx = 6 * (c.p3x - 2 * c.c2x + c.c1x)
  const by = 6 * (c.p3y - 2 * c.c2y + c.c1y)
  return [(1 - t) * ax + t * bx, (1 - t) * ay + t * by]
}

function evalCubic(c: Cubic, t: number): [number, number] {
  return cubicAt(c.p0x, c.p0y, c.c1x, c.c1y, c.c2x, c.c2y, c.p3x, c.p3y, t)
}

/** One Newton-Raphson step of the parameter for point (px, py). */
function refineParam(c: Cubic, px: number, py: number, t: number): number {
  const [qx, qy] = evalCubic(c, t)
  const [d1x, d1y] = cubicDeriv1(c, t)
  const [d2x, d2y] = cubicDeriv2(c, t)
  const dx = qx - px
  const dy = qy - py
  const numer = dx * d1x + dy * d1y
  const denom = d1x * d1x + d1y * d1y + dx * d2x + dy * d2y
  if (Math.abs(denom) < 1e-12) return t
  const nt = t - numer / denom
  return nt < 0 ? 0 : nt > 1 ? 1 : nt
}

/** Approximate distance from a point to a cubic (coarse scan + Newton). */
export function distanceToCubic(c: Cubic, px: number, py: number): number {
  let bestT = 0
  let bestD = Infinity
  for (let i = 0; i <= 16; i++) {
    const t = i / 16
    const [qx, qy] = evalCubic(c, t)
    const d = (qx - px) * (qx - px) + (qy - py) * (qy - py)
    if (d < bestD) {
      bestD = d
      bestT = t
    }
  }
  let t = bestT
  for (let i = 0; i < 3; i++) t = refineParam(c, px, py, t)
  const [qx, qy] = evalCubic(c, t)
  return Math.min(Math.sqrt(bestD), Math.hypot(qx - px, qy - py))
}

/**
 * Fit an open polyline (flat xy) with cubics within `tolerance` px, splitting
 * at the given corner indices (sorted, exclusive of 0 and n-1). Emits commands
 * WITHOUT the leading M (the caller anchors the subpath).
 */
export function fitOpenPolyline(
  pts: number[],
  tolerance: number,
  corners: number[],
): PathCommand[] {
  const n = pts.length >> 1
  const out: PathCommand[] = []
  const breaks = [0, ...corners.filter((c) => c > 0 && c < n - 1), n - 1]
  for (let s = 0; s + 1 < breaks.length; s++) {
    fitRun(pts, breaks[s], breaks[s + 1], tolerance, out)
  }
  return out
}

function leftTangent(pts: number[], i: number): [number, number] {
  const dx = pts[(i + 1) * 2] - pts[i * 2]
  const dy = pts[(i + 1) * 2 + 1] - pts[i * 2 + 1]
  const l = Math.hypot(dx, dy) || 1
  return [dx / l, dy / l]
}

function rightTangent(pts: number[], i: number): [number, number] {
  const dx = pts[(i - 1) * 2] - pts[i * 2]
  const dy = pts[(i - 1) * 2 + 1] - pts[i * 2 + 1]
  const l = Math.hypot(dx, dy) || 1
  return [dx / l, dy / l]
}

function centerTangent(pts: number[], i: number): [number, number] {
  const dx = pts[(i - 1) * 2] - pts[(i + 1) * 2]
  const dy = pts[(i - 1) * 2 + 1] - pts[(i + 1) * 2 + 1]
  const l = Math.hypot(dx, dy)
  if (l < 1e-12) {
    const [tx, ty] = rightTangent(pts, i)
    return [tx, ty]
  }
  return [dx / l, dy / l]
}

function fitRun(pts: number[], first: number, last: number, tol: number, out: PathCommand[]): void {
  const [t0x, t0y] = leftTangent(pts, first)
  const [t1x, t1y] = rightTangent(pts, last)
  fitRecursive(pts, first, last, t0x, t0y, t1x, t1y, tol, out, 0)
}

function fitRecursive(
  pts: number[],
  first: number,
  last: number,
  t0x: number,
  t0y: number,
  t1x: number,
  t1y: number,
  tol: number,
  out: PathCommand[],
  depth: number,
): void {
  if (last - first === 1) {
    out.push({ type: 'L', x: pts[last * 2], y: pts[last * 2 + 1] })
    return
  }

  // Chord-length parameterization.
  const count = last - first + 1
  const u = new Float64Array(count)
  for (let i = 1; i < count; i++) {
    const a = first + i
    u[i] =
      u[i - 1] + Math.hypot(pts[a * 2] - pts[(a - 1) * 2], pts[a * 2 + 1] - pts[(a - 1) * 2 + 1])
  }
  const total = u[count - 1] || 1
  for (let i = 0; i < count; i++) u[i] /= total

  let cubic = fitCubicSegment(pts, first, last, u, t0x, t0y, t1x, t1y)
  let { maxErr, splitAt } = maxError(pts, first, last, cubic, u)
  if (maxErr <= tol) {
    out.push(cubicCmd(cubic))
    return
  }

  // Reparameterize a few times if we're at least in the neighborhood.
  if (maxErr <= tol * tol * 16 || maxErr <= tol * 4) {
    for (let iter = 0; iter < 4; iter++) {
      for (let i = 0; i < count; i++) {
        u[i] = refineParam(cubic, pts[(first + i) * 2], pts[(first + i) * 2 + 1], u[i])
      }
      // Parameters must stay monotone for a meaningful fit.
      let monotone = true
      for (let i = 1; i < count; i++) {
        if (u[i] <= u[i - 1]) {
          monotone = false
          break
        }
      }
      if (!monotone) break
      cubic = fitCubicSegment(pts, first, last, u, t0x, t0y, t1x, t1y)
      const r = maxError(pts, first, last, cubic, u)
      maxErr = r.maxErr
      splitAt = r.splitAt
      if (maxErr <= tol) {
        out.push(cubicCmd(cubic))
        return
      }
    }
  }

  if (depth > 24) {
    // Safety net: emit as polyline rather than recurse forever.
    for (let i = first + 1; i <= last; i++) {
      out.push({ type: 'L', x: pts[i * 2], y: pts[i * 2 + 1] })
    }
    return
  }

  const [tcx, tcy] = centerTangent(pts, splitAt)
  fitRecursive(pts, first, splitAt, t0x, t0y, tcx, tcy, tol, out, depth + 1)
  fitRecursive(pts, splitAt, last, -tcx, -tcy, t1x, t1y, tol, out, depth + 1)
}

function maxError(
  pts: number[],
  first: number,
  last: number,
  cubic: Cubic,
  u: ArrayLike<number>,
): { maxErr: number; splitAt: number } {
  let maxErr = 0
  let splitAt = (first + last) >> 1
  for (let i = first + 1; i < last; i++) {
    const [qx, qy] = evalCubic(cubic, u[i - first])
    const err = Math.hypot(qx - pts[i * 2], qy - pts[i * 2 + 1])
    if (err > maxErr) {
      maxErr = err
      splitAt = i
    }
  }
  return { maxErr, splitAt }
}

function cubicCmd(c: Cubic): PathCommand {
  return { type: 'C', x1: c.c1x, y1: c.c1y, x2: c.c2x, y2: c.c2y, x: c.p3x, y: c.p3y }
}
