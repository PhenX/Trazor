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
  | { readonly type: 'Z' }

/** Number of anchor points (M/L/Q/C count one each; Z counts zero). */
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
 * true curve bounds — control points always enclose a Bézier segment).
 */
export function pathBounds(commands: readonly PathCommand[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
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
        break
      case 'Q':
        grow(cmd.x1, cmd.y1)
        grow(cmd.x, cmd.y)
        break
      case 'C':
        grow(cmd.x1, cmd.y1)
        grow(cmd.x2, cmd.y2)
        grow(cmd.x, cmd.y)
        break
      case 'Z':
        break
    }
  }
  if (minX === Infinity) return null
  return { minX, minY, maxX, maxY }
}
