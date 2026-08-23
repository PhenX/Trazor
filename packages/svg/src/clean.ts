/**
 * Lossless geometry cleanup on a shape's command list, run before serialization
 * when path optimization is on. Currently: exact collinear-vertex removal.
 *
 * Everything here is bit-exact on the output grid (`10^precision` units): a
 * vertex is only dropped when it lies exactly on the straight line between its
 * neighbors and both incident edges are straight lines, so the rendered shape is
 * unchanged. Curve anchors (Q/C) are never touched.
 */

import type { PathCommand } from '@trazor/core'
import { clampPrecision } from './pathdata'

interface Subpath {
  start: { x: number; y: number }
  /** Edges after the initial move, in order. */
  ops: PathCommand[]
  closed: boolean
}

function splitSubpaths(commands: readonly PathCommand[]): Subpath[] {
  const subs: Subpath[] = []
  let cur: Subpath | null = null
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (cur) subs.push(cur)
      cur = { start: { x: cmd.x, y: cmd.y }, ops: [], closed: false }
    } else if (cmd.type === 'Z') {
      if (cur) cur.closed = true
    } else if (cur) {
      cur.ops.push(cmd)
    }
  }
  if (cur) subs.push(cur)
  return subs
}

/** Drop interior vertices where two straight edges meet exactly along a line. */
function dropCollinear(sub: Subpath, scale: number): Subpath {
  const gi = (v: number): number => Math.round(v * scale)
  // Kept anchors with the edge type leading INTO each (the first is the move).
  const anchors: {
    x: number
    y: number
    edge: PathCommand['type'] | 'M'
    op: PathCommand | null
  }[] = [{ x: sub.start.x, y: sub.start.y, edge: 'M', op: null }]
  for (const op of sub.ops) {
    anchors.push({ x: endX(op), y: endY(op), edge: op.type, op })
  }
  const kept = anchors.slice(0, 1)
  for (let i = 1; i < anchors.length; i++) {
    let cur = anchors[i]
    while (kept.length >= 2 && kept[kept.length - 1].edge === 'L' && cur.edge === 'L') {
      const a = kept[kept.length - 2]
      const b = kept[kept.length - 1]
      const ax = gi(a.x)
      const ay = gi(a.y)
      const bx = gi(b.x)
      const by = gi(b.y)
      const cx = gi(cur.x)
      const cy = gi(cur.y)
      const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)
      const dot = (bx - ax) * (cx - ax) + (by - ay) * (cy - ay)
      const len2 = (cx - ax) * (cx - ax) + (cy - ay) * (cy - ay)
      // b is exactly on segment a→c ⇒ redundant; re-point cur's line at a.
      if (cross === 0 && dot >= 0 && dot <= len2) {
        kept.pop()
        cur = { x: cur.x, y: cur.y, edge: 'L', op: { type: 'L', x: cur.x, y: cur.y } }
      } else break
    }
    kept.push(cur)
  }
  const ops: PathCommand[] = []
  for (let i = 1; i < kept.length; i++) ops.push(kept[i].op!)
  return { start: sub.start, ops, closed: sub.closed }
}

function endX(op: PathCommand): number {
  return op.type === 'Z' ? 0 : op.x
}
function endY(op: PathCommand): number {
  return op.type === 'Z' ? 0 : op.y
}

function toCommands(sub: Subpath): PathCommand[] {
  const out: PathCommand[] = [{ type: 'M', x: sub.start.x, y: sub.start.y }]
  for (const op of sub.ops) out.push(op)
  if (sub.closed) out.push({ type: 'Z' })
  return out
}

/** Remove exactly-redundant collinear vertices; geometry is preserved bit-for-bit. */
export function cleanCommands(commands: readonly PathCommand[], precision: number): PathCommand[] {
  const scale = 10 ** clampPrecision(precision)
  return splitSubpaths(commands).flatMap((sub) => toCommands(dropCollinear(sub, scale)))
}
