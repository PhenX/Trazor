import type { FlatPoints } from '../paths'

/**
 * Prefix moments over a point sequence (Selinger 2003, §2.2.3). All inputs are
 * small integers, so Float64 sums stay exact. sums[k] covers points [0, k).
 */
export interface PathSums {
  x: Float64Array
  y: Float64Array
  x2: Float64Array
  xy: Float64Array
  y2: Float64Array
  /** Origin subtracted from every point (numerical conditioning). */
  ox: number
  oy: number
}

export function computeSums(points: FlatPoints): PathSums {
  const n = points.length >> 1
  const ox = points[0]
  const oy = points[1]
  const x = new Float64Array(n + 1)
  const y = new Float64Array(n + 1)
  const x2 = new Float64Array(n + 1)
  const xy = new Float64Array(n + 1)
  const y2 = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) {
    const px = points[i * 2] - ox
    const py = points[i * 2 + 1] - oy
    x[i + 1] = x[i] + px
    y[i + 1] = y[i] + py
    x2[i + 1] = x2[i] + px * px
    xy[i + 1] = xy[i] + px * py
    y2[i + 1] = y2[i] + py * py
  }
  return { x, y, x2, xy, y2, ox, oy }
}

/**
 * Penalty of approximating subpath [i..j] by the chord (p_i, p_j): the length-
 * weighted RMS distance of the points to the chord line (Selinger 2003,
 * §2.2.3), evaluated in O(1) from the prefix moments.
 */
export function chordPenalty(points: FlatPoints, sums: PathSums, i: number, j: number): number {
  const { x: sx, y: sy, x2: sx2, xy: sxy, y2: sy2, ox, oy } = sums
  const k = j + 1 - i
  const x = sx[j + 1] - sx[i]
  const y = sy[j + 1] - sy[i]
  const x2 = sx2[j + 1] - sx2[i]
  const xy = sxy[j + 1] - sxy[i]
  const y2 = sy2[j + 1] - sy2[i]

  const px = (points[i * 2] + points[j * 2]) / 2 - ox
  const py = (points[i * 2 + 1] + points[j * 2 + 1]) / 2 - oy
  const ex = points[j * 2] - points[i * 2]
  const ey = points[j * 2 + 1] - points[i * 2 + 1]

  const a = (x2 - 2 * x * px) / k + px * px
  const b = (xy - x * py - y * px) / k + px * py
  const c = (y2 - 2 * y * py) / k + py * py
  const s = ey * ey * a - 2 * ex * ey * b + ex * ex * c
  return Math.sqrt(Math.max(0, s))
}

/**
 * Best-fit line through subpath [i..j]: center of mass and unit direction (the
 * major eigenvector of the covariance), per Selinger 2003 §2.3.1.
 */
export function pointSlope(
  points: FlatPoints,
  sums: PathSums,
  i: number,
  j: number,
): { cx: number; cy: number; dx: number; dy: number } {
  const { x: sx, y: sy, x2: sx2, xy: sxy, y2: sy2, ox, oy } = sums
  const k = j + 1 - i
  const x = sx[j + 1] - sx[i]
  const y = sy[j + 1] - sy[i]
  const x2 = sx2[j + 1] - sx2[i]
  const xy = sxy[j + 1] - sxy[i]
  const y2 = sy2[j + 1] - sy2[i]

  const cx = x / k
  const cy = y / k
  const a = x2 / k - cx * cx
  const b = xy / k - cx * cy
  const c = y2 / k - cy * cy

  // Major eigenvector of [[a, b], [b, c]].
  const lambda = (a + c + Math.sqrt((a - c) * (a - c) + 4 * b * b)) / 2
  let dx = 0
  let dy = 0
  if (Math.abs(a - lambda) >= Math.abs(c - lambda)) {
    dx = -b
    dy = a - lambda
  } else {
    dx = c - lambda
    dy = -b
  }
  const len = Math.hypot(dx, dy)
  if (len < 1e-12) {
    // Degenerate cloud (single point) — fall back to the chord direction.
    dx = points[j * 2] - points[i * 2]
    dy = points[j * 2 + 1] - points[i * 2 + 1]
    const l2 = Math.hypot(dx, dy)
    if (l2 < 1e-12) return { cx: cx + ox, cy: cy + oy, dx: 1, dy: 0 }
    return { cx: cx + ox, cy: cy + oy, dx: dx / l2, dy: dy / l2 }
  }
  return { cx: cx + ox, cy: cy + oy, dx: dx / len, dy: dy / len }
}

/**
 * 3×3 quadratic form measuring squared distance to the line through (cx,cy)
 * with unit direction (dx,dy), for homogeneous points [x, y, 1].
 */
export type QuadForm = [number, number, number, number, number, number, number, number, number]

export function lineQuadForm(cx: number, cy: number, dx: number, dy: number): QuadForm {
  // Normal vector (a, b) with line equation a·x + b·y + c = 0.
  const a = dy
  const b = -dx
  const c = -(a * cx + b * cy)
  return [a * a, a * b, a * c, a * b, b * b, b * c, a * c, b * c, c * c]
}

export function addQuadForms(p: QuadForm, q: QuadForm): QuadForm {
  const out = new Array(9) as QuadForm
  for (let i = 0; i < 9; i++) out[i] = p[i] + q[i]
  return out
}

export function evalQuadForm(q: QuadForm, x: number, y: number): number {
  return (
    q[0] * x * x +
    (q[1] + q[3]) * x * y +
    q[4] * y * y +
    (q[2] + q[6]) * x +
    (q[5] + q[7]) * y +
    q[8]
  )
}
