/**
 * Circular-arc fitting: collapse a run of consecutive cubic Béziers that all
 * lie on one circle into a single elliptical-arc `A` command. The tracer and
 * Schneider fitter emit only cubics, so a rounded-rect corner, a pill end, a pie
 * slice, or any partial ring becomes several cubics; a true `A` reproduces the
 * same boundary with one node and — because it is an exact arc rather than a
 * Bézier approximation of one — tracks the original circular edge more closely.
 *
 * A collapse is emitted only when a least-squares circle fits every boundary
 * sample within tolerance, the run is a simple (non-reversing) sub-360° arc, and
 * the reconstructed arc's center and swept angle match the samples — so a
 * non-arc run is always left as cubics. Only circular arcs are fitted (the
 * common case); genuine elliptical-arc runs stay cubic. `A` radii and endpoint
 * are snapped to the output precision grid, matching primitive detection, so the
 * result stays on the serializer grid.
 */

import { arcToCenter, type PathCommand } from '@trazor/core'
import { fitCircle, type Pt } from './fit'
import { clampPrecision } from './pathdata'

/** Point on a cubic at parameter t (Bernstein form). */
function cubicPoint(p0: Pt, c: Extract<PathCommand, { type: 'C' }>, t: number): Pt {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const cc = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * p0.x + b * c.x1 + cc * c.x2 + d * c.x,
    y: a * p0.y + b * c.y1 + cc * c.y2 + d * c.y,
  }
}

/** Signed smallest angle a − b in (−π, π]. */
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/**
 * Try to collapse a run of ≥2 consecutive cubics (starting at `start`) into one
 * circular `A`, or null when the run is not a clean circular arc.
 */
function collapseToArc(
  start: Pt,
  cubics: Extract<PathCommand, { type: 'C' }>[],
  precision: number,
): PathCommand | null {
  // Dense boundary samples: each anchor plus three interior points per cubic.
  const samples: Pt[] = [start]
  let prev = start
  for (const c of cubics) {
    samples.push(cubicPoint(prev, c, 0.25), cubicPoint(prev, c, 0.5), cubicPoint(prev, c, 0.75), {
      x: c.x,
      y: c.y,
    })
    prev = { x: c.x, y: c.y }
  }
  const end = prev

  const fit = fitCircle(samples)
  if (fit === null || fit.r <= 0) return null
  const { cx, cy, r } = fit
  const tol = Math.max(0.6, r * 0.02)
  for (const p of samples) {
    if (Math.abs(Math.hypot(p.x - cx, p.y - cy) - r) > tol) return null
  }

  // Total signed sweep, rejecting any direction reversal (an S-shaped run that
  // merely happens to sample near a circle is not a single arc).
  const ang = samples.map((p) => Math.atan2(p.y - cy, p.x - cx))
  let sweep = 0
  let dir = 0
  for (let i = 1; i < ang.length; i++) {
    const d = angleDiff(ang[i], ang[i - 1])
    if (Math.abs(d) > 1e-4) {
      const s = Math.sign(d)
      if (dir !== 0 && s !== dir) return null
      dir = s
    }
    sweep += d
  }
  const absSweep = Math.abs(sweep)
  // Too flat to be an arc, or so near a full turn it belongs to circle detection.
  if (absSweep < 0.5 || absSweep > 2 * Math.PI - 0.2) return null

  // Snap radius and endpoint to the output grid (the discretization boundary).
  const p = clampPrecision(precision)
  const grid = (v: number): number => Number(v.toFixed(p))
  const rr = grid(r)
  const ex = grid(end.x)
  const ey = grid(end.y)
  if (rr <= 0) return null

  // Pick (large-arc, sweep) flags by reconstruction: the correct pair reproduces
  // the fitted circle's center and the measured sweep (magnitude and direction).
  for (const largeArc of [false, true]) {
    for (const sweepFlag of [false, true]) {
      const arc = {
        type: 'A' as const,
        rx: rr,
        ry: rr,
        rotation: 0,
        largeArc,
        sweep: sweepFlag,
        x: ex,
        y: ey,
      }
      const c = arcToCenter(start.x, start.y, arc)
      if (c === null) continue
      if (Math.hypot(c.cx - cx, c.cy - cy) > tol) continue // wrong circle of the two
      if (Math.sign(c.dTheta) !== dir) continue // wrong direction
      if (Math.abs(Math.abs(c.dTheta) - absSweep) > 0.2) continue // wrong minor/major
      return arc
    }
  }
  return null
}

/**
 * Replace every maximal run of ≥2 consecutive cubics that forms a single
 * circular arc with one `A` command. Non-cubic commands (and short/soft runs)
 * pass through untouched, so the command list is semantically unchanged except
 * that arc runs become exact arcs. Runs never cross an `M`/`Z`/`L`/`Q`/`A`
 * boundary, so subpaths stay intact.
 */
export function fitArcs(commands: readonly PathCommand[], precision: number): PathCommand[] {
  const out: PathCommand[] = []
  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0
  let run: { start: Pt; cubics: Extract<PathCommand, { type: 'C' }>[] } | null = null

  const flush = (): void => {
    if (run === null) return
    if (run.cubics.length >= 2) {
      const arc = collapseToArc(run.start, run.cubics, precision)
      if (arc !== null) {
        out.push(arc)
        run = null
        return
      }
    }
    for (const c of run.cubics) out.push(c)
    run = null
  }

  for (const cmd of commands) {
    if (cmd.type === 'C') {
      if (run === null) run = { start: { x: curX, y: curY }, cubics: [] }
      run.cubics.push(cmd)
      curX = cmd.x
      curY = cmd.y
      continue
    }
    flush()
    out.push(cmd)
    switch (cmd.type) {
      case 'M':
        curX = cmd.x
        curY = cmd.y
        startX = cmd.x
        startY = cmd.y
        break
      case 'L':
      case 'Q':
      case 'A':
        curX = cmd.x
        curY = cmd.y
        break
      case 'Z':
        curX = startX
        curY = startY
        break
    }
  }
  flush()
  return out
}

/**
 * Approximate an `A` arc (starting at `x1, y1`) as a chain of cubic Béziers,
 * ≤90° each — the standard arc→Bézier construction. Used by the geometry
 * extractor so an overlay can draw an emitted arc as a smooth curve. A
 * degenerate arc (zero radius) becomes a straight line to the endpoint.
 */
export function arcToCubics(
  x1: number,
  y1: number,
  a: Extract<PathCommand, { type: 'A' }>,
): PathCommand[] {
  const c = arcToCenter(x1, y1, a)
  if (c === null) return [{ type: 'L', x: a.x, y: a.y }]
  const { cx, cy, rx, ry, phi, theta1, dTheta } = c
  const segs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)))
  const delta = dTheta / segs
  const k = (4 / 3) * Math.tan(delta / 4) // control-handle length factor
  const cosPhi = Math.cos(phi)
  const sinPhi = Math.sin(phi)
  const point = (theta: number): Pt => {
    const px = rx * Math.cos(theta)
    const py = ry * Math.sin(theta)
    return { x: cx + px * cosPhi - py * sinPhi, y: cy + px * sinPhi + py * cosPhi }
  }
  const deriv = (theta: number): Pt => {
    const px = -rx * Math.sin(theta)
    const py = ry * Math.cos(theta)
    return { x: px * cosPhi - py * sinPhi, y: px * sinPhi + py * cosPhi }
  }
  const out: PathCommand[] = []
  let th0 = theta1
  let p0 = point(th0)
  for (let i = 0; i < segs; i++) {
    const th1 = th0 + delta
    const p1 = point(th1)
    const d0 = deriv(th0)
    const d1 = deriv(th1)
    // The final segment lands on the exact endpoint, avoiding trig drift.
    const endX = i === segs - 1 ? a.x : p1.x
    const endY = i === segs - 1 ? a.y : p1.y
    out.push({
      type: 'C',
      x1: p0.x + k * d0.x,
      y1: p0.y + k * d0.y,
      x2: p1.x - k * d1.x,
      y2: p1.y - k * d1.y,
      x: endX,
      y: endY,
    })
    th0 = th1
    p0 = p1
  }
  return out
}
