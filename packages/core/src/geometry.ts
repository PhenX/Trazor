/** Small geometry helpers over flat [x0, y0, x1, y1, ...] coordinate arrays. */

export interface Point {
  x: number
  y: number
}

/**
 * Signed area of a closed polygon given as a flat coordinate array.
 * Positive for counter-clockwise in a y-down raster coordinate system
 * when traversed clockwise on screen — callers should only rely on
 * sign consistency, not orientation naming.
 */
export function signedAreaFlat(coords: ArrayLike<number>): number {
  const n = coords.length
  if (n < 6) return 0
  let sum = 0
  let px = coords[n - 2]
  let py = coords[n - 1]
  for (let i = 0; i < n; i += 2) {
    const x = coords[i]
    const y = coords[i + 1]
    sum += px * y - x * py
    px = x
    py = y
  }
  return sum / 2
}

/** Length of an open polyline given as a flat coordinate array. */
export function polylineLengthFlat(coords: ArrayLike<number>): number {
  let len = 0
  for (let i = 2; i < coords.length; i += 2) {
    const dx = coords[i] - coords[i - 2]
    const dy = coords[i + 1] - coords[i - 1]
    len += Math.hypot(dx, dy)
  }
  return len
}

/** Z component of the cross product of (a - o) × (b - o). */
export function crossZ(
  ox: number,
  oy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  return (ax - ox) * (by - oy) - (ay - oy) * (bx - ox)
}

/** Distance from point (px, py) to the segment (ax, ay)-(bx, by). */
export function distToSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return Math.hypot(px - ax, py - ay)
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Interior angle at vertex b of the polyline a-b-c, in degrees, in [0, 180].
 * 180 means perfectly straight; small values are sharp spikes.
 */
export function interiorAngleDeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const ux = ax - bx
  const uy = ay - by
  const vx = cx - bx
  const vy = cy - by
  const lu = Math.hypot(ux, uy)
  const lv = Math.hypot(vx, vy)
  if (lu === 0 || lv === 0) return 180
  let cos = (ux * vx + uy * vy) / (lu * lv)
  cos = cos < -1 ? -1 : cos > 1 ? 1 : cos
  return (Math.acos(cos) * 180) / Math.PI
}
