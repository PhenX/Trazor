import { interiorAngleDeg } from '@trazor/core'

/**
 * Below this incident-edge length (px) a vertex is pixel-scale noise — a
 * staircase or aliasing jag — and is never treated as a corner. Only consulted
 * when a `cornerThreshold` engages the angle/scale-aware path.
 */
const MIN_CORNER_EDGE = 1.5

/**
 * Whether polygon vertex b (between neighbors a and c) is a corner, under the
 * α / cornerThreshold rule (Selinger 2003 §2.3.2). The smoothness α is derived
 * from how far b sticks out of the chord a–c; α ≥ alphamax keeps a corner.
 * Exposed so the multi-model run fitter partitions a ring at exactly the corners
 * Selinger's smoothing would keep, so `smoothing` (alphamax) and
 * `cornerThreshold` retain their meaning.
 */
export function cornerAt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  alphamax: number,
  cornerThreshold?: number,
): boolean {
  const denom = Math.abs(cx - ax) + Math.abs(cy - ay)
  let alpha: number
  if (denom !== 0) {
    const dpara = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay))
    const dd = dpara / denom
    alpha = dd > 1 ? 1 - 1 / dd : 0
    alpha = alpha / 0.75
  } else {
    alpha = 4 / 3
  }
  return isCorner(alpha, alphamax, ax, ay, bx, by, cx, cy, cornerThreshold)
}

/**
 * Decide whether vertex b is a corner. Without a `cornerThreshold` this is
 * Selinger's α test alone (α ≥ alphamax). With one, the decision is scale- and
 * angle-aware, in this order: a vertex whose shorter incident edge is below
 * `MIN_CORNER_EDGE` is pixel-scale noise and is never a corner (so staircase
 * jags, which inflate α through a tiny chord, stay smooth); a genuinely sharp
 * interior angle (< `cornerThreshold`) is always a corner (so small real
 * corners the α metric under-rates are not nicked); otherwise the shallow
 * middle band falls back to the α test.
 */
function isCorner(
  alpha: number,
  alphamax: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  cornerThreshold?: number,
): boolean {
  if (cornerThreshold === undefined) return alpha >= alphamax
  const shortEdge = Math.min(Math.hypot(ax - bx, ay - by), Math.hypot(cx - bx, cy - by))
  if (shortEdge < MIN_CORNER_EDGE) return false
  if (interiorAngleDeg(ax, ay, bx, by, cx, cy) < cornerThreshold) return true
  return alpha >= alphamax
}
