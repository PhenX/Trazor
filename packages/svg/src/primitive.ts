/**
 * Recognize a closed path that is really a basic shape and emit the
 * corresponding SVG element. Rectangles are matched exactly on the output grid,
 * so `<rect>` renders bit-for-bit like the four-line path in every mode.
 * Circles and ellipses match within a sub-pixel tolerance and are therefore
 * only offered when `round` is set — the engine leaves it off for cutout mode,
 * where a neighbor still traces the Bézier boundary and must not diverge.
 */

import type { PathCommand } from '@vectorizer/core'
import { clampPrecision } from './pathdata'

export type Primitive =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'rrect'; x: number; y: number; width: number; height: number; r: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number }

interface Pt {
  x: number
  y: number
}

/** One closed subpath as its ordered edge list, or null if the shape is not a single closed loop. */
function singleClosedLoop(
  commands: readonly PathCommand[],
): { start: Pt; ops: PathCommand[] } | null {
  if (commands.length < 2 || commands[0].type !== 'M') return null
  const start: Pt = { x: commands[0].x, y: commands[0].y }
  const ops: PathCommand[] = []
  let closed = false
  for (let i = 1; i < commands.length; i++) {
    const c = commands[i]
    if (c.type === 'M') return null // more than one subpath (compound/holes)
    if (c.type === 'Z') {
      closed = true
      if (i !== commands.length - 1) return null
      break
    }
    ops.push(c)
  }
  return closed ? { start, ops } : null
}

/** Anchor points of the loop, with the closing anchor (equal to start) dropped. */
function anchors(start: Pt, ops: PathCommand[], scale: number): Pt[] {
  const pts: Pt[] = [start]
  for (const op of ops) if (op.type !== 'Z') pts.push({ x: op.x, y: op.y })
  const first = pts[0]
  const last = pts[pts.length - 1]
  if (
    pts.length > 1 &&
    Math.round(first.x * scale) === Math.round(last.x * scale) &&
    Math.round(first.y * scale) === Math.round(last.y * scale)
  ) {
    pts.pop()
  }
  return pts
}

function detectRect(start: Pt, ops: PathCommand[], scale: number): Primitive | null {
  if (!ops.every((o) => o.type === 'L')) return null
  const pts = anchors(start, ops, scale)
  if (pts.length !== 4) return null
  const gx = pts.map((p) => Math.round(p.x * scale))
  const gy = pts.map((p) => Math.round(p.y * scale))
  const minX = Math.min(...gx)
  const maxX = Math.max(...gx)
  const minY = Math.min(...gy)
  const maxY = Math.max(...gy)
  if (maxX === minX || maxY === minY) return null
  // Every corner must sit on the box, each edge axis-aligned.
  for (let i = 0; i < 4; i++) {
    const onCorner = (gx[i] === minX || gx[i] === maxX) && (gy[i] === minY || gy[i] === maxY)
    if (!onCorner) return null
    const j = (i + 1) % 4
    if (gx[i] !== gx[j] && gy[i] !== gy[j]) return null // edge not H or V
  }
  // Reject a degenerate ring that only touches two corners.
  if (new Set(gx.map((x, i) => `${x},${gy[i]}`)).size !== 4) return null
  return {
    kind: 'rect',
    x: minX / scale,
    y: minY / scale,
    width: (maxX - minX) / scale,
    height: (maxY - minY) / scale,
  }
}

function cubicMid(p0: Pt, c: Extract<PathCommand, { type: 'C' }>): Pt {
  return {
    x: 0.125 * p0.x + 0.375 * c.x1 + 0.375 * c.x2 + 0.125 * c.x,
    y: 0.125 * p0.y + 0.375 * c.y1 + 0.375 * c.y2 + 0.125 * c.y,
  }
}

function detectRound(start: Pt, ops: PathCommand[], precision: number): Primitive | null {
  if (ops.length < 3 || !ops.every((o) => o.type === 'C')) return null
  const ends = anchors(start, ops, 10 ** precision)
  if (ends.length < 3) return null

  // Dense sample set: anchors plus each arc midpoint.
  const samples: Pt[] = [...ends]
  let prev = start
  for (const op of ops) {
    if (op.type === 'C') samples.push(cubicMid(prev, op))
    prev = { x: op.x, y: op.y }
  }

  const cx = ends.reduce((s, p) => s + p.x, 0) / ends.length
  const cy = ends.reduce((s, p) => s + p.y, 0) / ends.length
  const r = samples.reduce((s, p) => s + Math.hypot(p.x - cx, p.y - cy), 0) / samples.length
  if (r <= 0) return null
  const tol = Math.max(0.6, r * 0.02)

  if (samples.every((p) => Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) <= tol)) {
    return round({ kind: 'circle', cx, cy, r }, precision)
  }

  // Axis-aligned ellipse from the sample bounds.
  const minX = Math.min(...samples.map((p) => p.x))
  const maxX = Math.max(...samples.map((p) => p.x))
  const minY = Math.min(...samples.map((p) => p.y))
  const maxY = Math.max(...samples.map((p) => p.y))
  const ecx = (minX + maxX) / 2
  const ecy = (minY + maxY) / 2
  const rx = (maxX - minX) / 2
  const ry = (maxY - minY) / 2
  if (rx <= 0 || ry <= 0) return null
  const etol = tol / Math.min(rx, ry)
  if (
    samples.every((p) => {
      const nx = (p.x - ecx) / rx
      const ny = (p.y - ecy) / ry
      return Math.abs(Math.hypot(nx, ny) - 1) <= etol
    })
  ) {
    return round({ kind: 'ellipse', cx: ecx, cy: ecy, rx, ry }, precision)
  }
  return null
}

/** Signed distance from a point to an axis-aligned rounded rectangle (circular corners). */
function roundedRectSdf(
  px: number,
  py: number,
  cx: number,
  cy: number,
  hx: number,
  hy: number,
  r: number,
): number {
  const qx = Math.abs(px - cx) - (hx - r)
  const qy = Math.abs(py - cy) - (hy - r)
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * Recognize an axis-aligned rounded rectangle (straight edges + circular corner
 * arcs) and emit `<rect rx>`. Structure-agnostic: it fits one corner radius by a
 * scan and accepts only if every densely sampled boundary point lies on that
 * rounded rect within tolerance, so a shape that is not really one is rejected.
 */
function detectRoundedRect(start: Pt, ops: PathCommand[], precision: number): Primitive | null {
  if (ops.length < 4 || !ops.every((o) => o.type === 'L' || o.type === 'C')) return null
  if (!ops.some((o) => o.type === 'C')) return null // corners must be arcs

  // Dense samples: anchors plus each segment's midpoint (a non-axis-aligned edge
  // or a wrong corner then fails the fit).
  const samples: Pt[] = [start]
  let prev = start
  for (const op of ops) {
    if (op.type === 'C') samples.push(cubicMid(prev, op))
    else samples.push({ x: (prev.x + op.x) / 2, y: (prev.y + op.y) / 2 })
    samples.push({ x: op.x, y: op.y })
    prev = { x: op.x, y: op.y }
  }

  const xs = samples.map((p) => p.x)
  const ys = samples.map((p) => p.y)
  const minX = Math.min(...xs)
  const maxX = Math.max(...xs)
  const minY = Math.min(...ys)
  const maxY = Math.max(...ys)
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const hx = (maxX - minX) / 2
  const hy = (maxY - minY) / 2
  if (hx <= 0 || hy <= 0) return null

  const maxR = Math.min(hx, hy)
  const tol = Math.max(0.75, maxR * 0.03)
  // Fit the corner radius by scanning for the smallest max-error.
  let bestR = 0
  let bestErr = Infinity
  const steps = 64
  for (let i = 1; i <= steps; i++) {
    const r = (maxR * i) / steps
    let err = 0
    for (const p of samples) {
      const d = Math.abs(roundedRectSdf(p.x, p.y, cx, cy, hx, hy, r))
      if (d > err) err = d
    }
    if (err < bestErr) {
      bestErr = err
      bestR = r
    }
  }
  if (bestErr > tol) return null
  if (bestR < tol) return null // square corners — a plain rect (handled elsewhere)
  return round(
    { kind: 'rrect', x: cx - hx, y: cy - hy, width: 2 * hx, height: 2 * hy, r: bestR },
    precision,
  )
}

function round(prim: Primitive, precision: number): Primitive {
  const p = clampPrecision(precision)
  const q = (v: number): number => Number(v.toFixed(p))
  if (prim.kind === 'rect') {
    return {
      kind: 'rect',
      x: q(prim.x),
      y: q(prim.y),
      width: q(prim.width),
      height: q(prim.height),
    }
  }
  if (prim.kind === 'rrect') {
    return {
      kind: 'rrect',
      x: q(prim.x),
      y: q(prim.y),
      width: q(prim.width),
      height: q(prim.height),
      r: q(prim.r),
    }
  }
  if (prim.kind === 'circle')
    return { kind: 'circle', cx: q(prim.cx), cy: q(prim.cy), r: q(prim.r) }
  return { kind: 'ellipse', cx: q(prim.cx), cy: q(prim.cy), rx: q(prim.rx), ry: q(prim.ry) }
}

/**
 * Detect the primitive a single closed subpath represents, or null. `round`
 * enables the sub-pixel circle/ellipse matches; rectangles are always exact.
 */
export function detectPrimitive(
  commands: readonly PathCommand[],
  precision: number,
  allowRound: boolean,
): Primitive | null {
  const loop = singleClosedLoop(commands)
  if (!loop) return null
  const scale = 10 ** clampPrecision(precision)
  const rect = detectRect(loop.start, loop.ops, scale)
  if (rect) return rect
  if (!allowRound) return null
  // Circle/ellipse first so a true circle stays `<circle>`, not a pill `<rect rx>`.
  return (
    detectRound(loop.start, loop.ops, precision) ??
    detectRoundedRect(loop.start, loop.ops, precision)
  )
}
