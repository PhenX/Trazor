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

/**
 * The same path scaled by `s` about the origin: every coordinate and arc radius
 * multiplied (an arc's rotation and flags are unchanged by a uniform scale).
 */
export function scalePathCommands(commands: readonly PathCommand[], s: number): PathCommand[] {
  return commands.map((c): PathCommand => {
    switch (c.type) {
      case 'M':
      case 'L':
        return { type: c.type, x: c.x * s, y: c.y * s }
      case 'Q':
        return { type: 'Q', x1: c.x1 * s, y1: c.y1 * s, x: c.x * s, y: c.y * s }
      case 'C':
        return {
          type: 'C',
          x1: c.x1 * s,
          y1: c.y1 * s,
          x2: c.x2 * s,
          y2: c.y2 * s,
          x: c.x * s,
          y: c.y * s,
        }
      case 'A':
        return { ...c, rx: c.rx * s, ry: c.ry * s, x: c.x * s, y: c.y * s }
      case 'Z':
        return c
    }
  })
}

/**
 * The same path scaled by `s` about the origin, then moved by `(dx, dy)`: a
 * point `p` becomes `s·p + (dx, dy)`; arc radii scale, rotation and flags stay.
 */
export function placePathCommands(
  commands: readonly PathCommand[],
  s: number,
  dx: number,
  dy: number,
): PathCommand[] {
  return commands.map((c): PathCommand => {
    switch (c.type) {
      case 'M':
      case 'L':
        return { type: c.type, x: c.x * s + dx, y: c.y * s + dy }
      case 'Q':
        return { type: 'Q', x1: c.x1 * s + dx, y1: c.y1 * s + dy, x: c.x * s + dx, y: c.y * s + dy }
      case 'C':
        return {
          type: 'C',
          x1: c.x1 * s + dx,
          y1: c.y1 * s + dy,
          x2: c.x2 * s + dx,
          y2: c.y2 * s + dy,
          x: c.x * s + dx,
          y: c.y * s + dy,
        }
      case 'A':
        return { ...c, rx: c.rx * s, ry: c.ry * s, x: c.x * s + dx, y: c.y * s + dy }
      case 'Z':
        return c
    }
  })
}

/** Number of anchor points (M/L/Q/C/A count one each; Z counts zero). */
export function countPathNodes(commands: readonly PathCommand[]): number {
  let nodes = 0
  for (const cmd of commands) {
    if (cmd.type !== 'Z') nodes++
  }
  return nodes
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
