/**
 * Resolution-independent path model. Coordinates are in source-image pixel
 * space (the SVG serializer applies units and precision at the end).
 */

export type PathCommand =
  | { readonly type: 'M'; readonly x: number; readonly y: number }
  | { readonly type: 'L'; readonly x: number; readonly y: number }
  | {
      readonly type: 'Q'
      readonly x1: number
      readonly y1: number
      readonly x: number
      readonly y: number
    }
  | {
      readonly type: 'C'
      readonly x1: number
      readonly y1: number
      readonly x2: number
      readonly y2: number
      readonly x: number
      readonly y: number
    }
  | {
      // Elliptical arc, SVG endpoint parameterization: an arc of the ellipse with
      // radii (rx, ry) rotated `rotation` degrees, from the current point to (x, y).
      // `largeArc` picks the >180° arc; `sweep` picks the positive-angle direction.
      readonly type: 'A'
      readonly rx: number
      readonly ry: number
      readonly rotation: number
      readonly largeArc: boolean
      readonly sweep: boolean
      readonly x: number
      readonly y: number
    }
  | { readonly type: 'Z' }

/** Number of anchor points (M/L/Q/C/A count one each; Z counts zero). */
export function countPathNodes(commands: readonly PathCommand[]): number {
  let nodes = 0
  for (const cmd of commands) {
    if (cmd.type !== 'Z') nodes++
  }
  return nodes
}

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/**
 * Bounding box over anchor and control points (a conservative cover of the
 * true curve bounds — control points always enclose a Bézier segment). An `A`
 * arc has no control points, so its exact extrema are computed instead.
 */
export function pathBounds(commands: readonly PathCommand[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let curX = 0
  let curY = 0
  const grow = (x: number, y: number) => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const cmd of commands) {
    switch (cmd.type) {
      case 'M':
      case 'L':
        grow(cmd.x, cmd.y)
        curX = cmd.x
        curY = cmd.y
        break
      case 'Q':
        grow(cmd.x1, cmd.y1)
        grow(cmd.x, cmd.y)
        curX = cmd.x
        curY = cmd.y
        break
      case 'C':
        grow(cmd.x1, cmd.y1)
        grow(cmd.x2, cmd.y2)
        grow(cmd.x, cmd.y)
        curX = cmd.x
        curY = cmd.y
        break
      case 'A':
        for (const [x, y] of arcExtrema(curX, curY, cmd)) grow(x, y)
        curX = cmd.x
        curY = cmd.y
        break
      case 'Z':
        break
    }
  }
  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}

/**
 * Extreme points of an elliptical arc (both endpoints plus every axis-aligned
 * tangent that falls within the swept angle range), so a bounding box over them
 * exactly covers the arc. Uses the SVG endpoint→center conversion (F.6.5).
 */
function arcExtrema(
  x1: number,
  y1: number,
  a: Extract<PathCommand, { type: 'A' }>,
): [number, number][] {
  const pts: [number, number][] = [
    [x1, y1],
    [a.x, a.y],
  ]
  const c = arcToCenter(x1, y1, a)
  if (c === null) return pts
  const { cx, cy, rx, ry, phi, theta1, dTheta } = c
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const TWO_PI = 2 * Math.PI
  const inSweep = (t: number): boolean => {
    // Is angle `t` inside the span from theta1 sweeping by dTheta (signed)?
    let d = t - theta1
    if (dTheta >= 0) {
      d = ((d % TWO_PI) + TWO_PI) % TWO_PI // [0, 2π)
      return d <= dTheta + 1e-9
    }
    d = -(((-d % TWO_PI) + TWO_PI) % TWO_PI) // (−2π, 0]
    return d >= dTheta - 1e-9
  }
  const at = (t: number): [number, number] => [
    cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
    cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
  ]
  // X extrema: d/dt of X(t) = 0 ⇒ tan t = -(ry sinφ)/(rx cosφ).
  const tx = Math.atan2(-ry * sin, rx * cos)
  // Y extrema: d/dt of Y(t) = 0 ⇒ tan t = (ry cosφ)/(rx sinφ).
  const ty = Math.atan2(ry * cos, rx * sin)
  for (const base of [tx, ty]) {
    for (const t of [base, base + Math.PI]) {
      if (inSweep(t)) pts.push(at(t))
    }
  }
  return pts
}

/** Signed angle from vector (ux, uy) to (vx, vy), in (−π, π]. */
function vectorAngle(ux: number, uy: number, vx: number, vy: number): number {
  const dot = ux * vx + uy * vy
  const len = Math.hypot(ux, uy) * Math.hypot(vx, vy)
  let ang = Math.acos(Math.min(1, Math.max(-1, len === 0 ? 1 : dot / len)))
  if (ux * vy - uy * vx < 0) ang = -ang
  return ang
}

/** Center-parameterization of an elliptical arc: center, (possibly enlarged) radii, rotation (rad), start angle and signed sweep. */
export interface ArcCenter {
  cx: number
  cy: number
  rx: number
  ry: number
  phi: number
  theta1: number
  dTheta: number
}

/**
 * SVG arc endpoint→center parameterization (W3C SVG 1.1 F.6.5); null if
 * degenerate (a zero radius). `(x1, y1)` is the arc's start (the current point);
 * `a` carries the endpoint form. Shared by {@link pathBounds} and the SVG
 * serializer's arc handling.
 */
export function arcToCenter(
  x1: number,
  y1: number,
  a: Extract<PathCommand, { type: 'A' }>,
): ArcCenter | null {
  let rx = Math.abs(a.rx)
  let ry = Math.abs(a.ry)
  if (rx === 0 || ry === 0) return null
  const phi = (a.rotation * Math.PI) / 180
  const cos = Math.cos(phi)
  const sin = Math.sin(phi)
  const dx = (x1 - a.x) / 2
  const dy = (y1 - a.y) / 2
  const x1p = cos * dx + sin * dy
  const y1p = -sin * dx + cos * dy
  // Scale up radii that are too small to span the endpoints.
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry)
  if (lambda > 1) {
    const s = Math.sqrt(lambda)
    rx *= s
    ry *= s
  }
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p
  let coef = den <= 0 ? 0 : Math.sqrt(Math.max(0, num) / den)
  if (a.largeArc === a.sweep) coef = -coef
  const cxp = (coef * (rx * y1p)) / ry
  const cyp = (-coef * (ry * x1p)) / rx
  const cx = cos * cxp - sin * cyp + (x1 + a.x) / 2
  const cy = sin * cxp + cos * cyp + (y1 + a.y) / 2
  const theta1 = vectorAngle(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry)
  let dTheta =
    vectorAngle((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry) %
    (2 * Math.PI)
  if (!a.sweep && dTheta > 0) dTheta -= 2 * Math.PI
  if (a.sweep && dTheta < 0) dTheta += 2 * Math.PI
  return { cx, cy, rx, ry, phi, theta1, dTheta }
}
