import type { PathCommand } from '@trazor/core'

/** Flat lattice polyline/polygon: [x0, y0, x1, y1, ...]. */
export type FlatPoints = number[]

export function pointCount(points: FlatPoints): number {
  return points.length >> 1
}

/**
 * Reverse a command list produced by our tracers (single subpath starting with
 * M, optionally ending with Z). Curve control points swap roles.
 */
export function reverseCommands(commands: readonly PathCommand[]): PathCommand[] {
  const closed = commands.length > 0 && commands[commands.length - 1].type === 'Z'
  const body = closed ? commands.slice(0, -1) : commands.slice()
  if (body.length === 0) return []

  // Collect anchor positions to rebuild in reverse.
  const out: PathCommand[] = []
  const last = body[body.length - 1]
  if (last.type === 'Z' || body[0].type !== 'M')
    throw new Error('reverseCommands: malformed subpath')
  const endX = last.type === 'M' ? last.x : (last as { x: number }).x
  const endY = last.type === 'M' ? last.y : (last as { y: number }).y
  out.push({ type: 'M', x: endX, y: endY })

  for (let i = body.length - 1; i >= 1; i--) {
    const cmd = body[i]
    const prev = body[i - 1] as Extract<PathCommand, { x: number }>
    switch (cmd.type) {
      case 'L':
        out.push({ type: 'L', x: prev.x, y: prev.y })
        break
      case 'Q':
        out.push({ type: 'Q', x1: cmd.x1, y1: cmd.y1, x: prev.x, y: prev.y })
        break
      case 'C':
        out.push({
          type: 'C',
          x1: cmd.x2,
          y1: cmd.y2,
          x2: cmd.x1,
          y2: cmd.y1,
          x: prev.x,
          y: prev.y,
        })
        break
      case 'A':
        // Same ellipse traversed the other way: flip the sweep flag, keep the
        // large-arc choice, and land on the previous anchor.
        out.push({
          type: 'A',
          rx: cmd.rx,
          ry: cmd.ry,
          rotation: cmd.rotation,
          largeArc: cmd.largeArc,
          sweep: !cmd.sweep,
          x: prev.x,
          y: prev.y,
        })
        break
      case 'M':
        break
      case 'Z':
        break
    }
  }
  if (closed) out.push({ type: 'Z' })
  return out
}

/** Squared distance between two points. */
export function distSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx
  const dy = ay - by
  return dx * dx + dy * dy
}

/** Evaluate a cubic Bézier at t. */
export function cubicAt(
  p0x: number,
  p0y: number,
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  p3x: number,
  p3y: number,
  t: number,
): [number, number] {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return [a * p0x + b * p1x + c * p2x + d * p3x, a * p0y + b * p1y + c * p2y + d * p3y]
}
