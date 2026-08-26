/**
 * Recognize a closed path that is really a basic shape and emit the
 * corresponding SVG element. Rectangles are matched exactly on the output grid,
 * so `<rect>` renders bit-for-bit like the four-line path in every mode.
 * Circles and ellipses match within a sub-pixel tolerance and are therefore
 * only offered when `round` is set — the engine leaves it off for cutout mode,
 * where a neighbor still traces the Bézier boundary and must not diverge.
 */

import type { PathCommand } from '@trazor/core'
import { fitCircle, fitEllipse } from './fit'
import { clampPrecision } from './pathdata'

export type Primitive =
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'rrect'; x: number; y: number; width: number; height: number; r: number }
  | { kind: 'circle'; cx: number; cy: number; r: number }
  // `angle` (deg, about the center) is present only for a rotated ellipse.
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; angle?: number }
  // A regularized regular polygon or star, emitted as <polygon points>.
  | { kind: 'polygon'; points: Pt[] }

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

/**
 * Round-primitive acceptance tolerance in pixels — how far a boundary sample may
 * lie off the fitted circle/ellipse. A fixed sub-pixel budget, NOT radius-
 * relative: it bounds how far the emitted `<circle>`/`<ellipse>` can render from
 * the traced boundary at every radius, so a large, only-roughly-round shape is
 * not accepted as an idealized element that renders visibly off (which a
 * radius-scaled tolerance allowed, non-deterministically across platforms).
 */
const ROUND_TOL_PX = 0.6

/**
 * Recognize a circle or ellipse (axis-aligned or rotated) from a densely sampled
 * all-cubic loop. Parameters come from least-squares fits (`fit.ts`) — a Kåsa
 * circle fit and a direct conic ellipse fit — so uneven anchor spacing does not
 * bias the recovered center/radii. Each candidate is accepted only if every
 * boundary sample lies on it within tolerance, so a non-round shape is rejected.
 */
function detectRound(start: Pt, ops: PathCommand[], precision: number): Primitive | null {
  if (ops.length < 3 || !ops.every((o) => o.type === 'C')) return null

  // Dense boundary samples: each anchor plus three interior points per cubic.
  const samples: Pt[] = [start]
  let prev = start
  for (const op of ops) {
    if (op.type !== 'C') return null
    samples.push(cubicPoint(prev, op, 0.25), cubicPoint(prev, op, 0.5), cubicPoint(prev, op, 0.75))
    samples.push({ x: op.x, y: op.y })
    prev = { x: op.x, y: op.y }
  }
  if (samples.length < 8) return null

  // Circle first, so a true circle stays a circle rather than a near-round ellipse.
  const circle = fitCircle(samples)
  if (circle && circle.r > 0) {
    const tol = ROUND_TOL_PX
    const onCircle = samples.every(
      (p) => Math.abs(Math.hypot(p.x - circle.cx, p.y - circle.cy) - circle.r) <= tol,
    )
    if (onCircle)
      return round({ kind: 'circle', cx: circle.cx, cy: circle.cy, r: circle.r }, precision)
  }

  // Ellipse: the direct conic fit recovers a rotation too.
  const e = fitEllipse(samples)
  if (e && e.rx > 0 && e.ry > 0) {
    const tol = ROUND_TOL_PX
    const co = Math.cos(e.angle)
    const si = Math.sin(e.angle)
    const onEllipse = samples.every((p) => {
      const dx = p.x - e.cx
      const dy = p.y - e.cy
      const nx = (dx * co + dy * si) / e.rx
      const ny = (-dx * si + dy * co) / e.ry
      return Math.abs(Math.hypot(nx, ny) - 1) * Math.min(e.rx, e.ry) <= tol
    })
    if (onEllipse) {
      // A sub-half-degree tilt is noise — emit an axis-aligned ellipse (no transform).
      const deg = (e.angle * 180) / Math.PI
      const angle = Math.abs(deg) < 0.5 ? undefined : deg
      return round(
        {
          kind: 'ellipse',
          cx: e.cx,
          cy: e.cy,
          rx: e.rx,
          ry: e.ry,
          ...(angle !== undefined ? { angle } : {}),
        },
        precision,
      )
    }
  }
  return null
}

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
 * coarse scan refined with a golden-section search (sub-pixel), and accepts only
 * if every densely sampled boundary point lies on that rounded rect within
 * tolerance, so a shape that is not really one is rejected.
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
  // Largest |SDF| over all samples for a candidate corner radius — minimized at
  // the true radius (V-shaped: too small clips the corners, too large bulges).
  const maxErr = (r: number): number => {
    let err = 0
    for (const p of samples) {
      const d = Math.abs(roundedRectSdf(p.x, p.y, cx, cy, hx, hy, r))
      if (d > err) err = d
    }
    return err
  }
  // Coarse scan to bracket the minimum, then a golden-section search refines the
  // radius to sub-pixel — the scan step (maxR/64) would otherwise cap accuracy.
  const steps = 64
  const step = maxR / steps
  let bestR = step
  let bestErr = Infinity
  for (let i = 1; i <= steps; i++) {
    const err = maxErr(step * i)
    if (err < bestErr) {
      bestErr = err
      bestR = step * i
    }
  }
  bestR = goldenMin(maxErr, Math.max(0, bestR - step), Math.min(maxR, bestR + step))
  bestErr = maxErr(bestR)
  if (bestErr > tol) return null
  if (bestR < tol) return null // square corners — a plain rect (handled elsewhere)
  return round(
    { kind: 'rrect', x: cx - hx, y: cy - hy, width: 2 * hx, height: 2 * hy, r: bestR },
    precision,
  )
}

/** Golden-section search: the minimizer of a unimodal `f` on `[a, b]`. */
function goldenMin(f: (x: number) => number, a: number, b: number): number {
  const gr = (Math.sqrt(5) - 1) / 2 // 0.618…
  let c = b - gr * (b - a)
  let d = a + gr * (b - a)
  let fc = f(c)
  let fd = f(d)
  for (let i = 0; i < 40; i++) {
    if (fc < fd) {
      b = d
      d = c
      fd = fc
      c = b - gr * (b - a)
      fc = f(c)
    } else {
      a = c
      c = d
      fc = fd
      d = a + gr * (b - a)
      fd = f(d)
    }
  }
  return (a + b) / 2
}

/** Signed smallest angle a − b in (−π, π]. */
function angleDiff(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= 2 * Math.PI
  while (d <= -Math.PI) d += 2 * Math.PI
  return d
}

/** Dense point samples along the outline (curves sampled too), one loop, in order. */
function denseOutline(start: Pt, ops: PathCommand[]): Pt[] {
  const pts: Pt[] = []
  let prev = start
  for (const op of ops) {
    if (op.type === 'C') {
      for (let s = 0; s < 8; s++) pts.push(cubicPoint(prev, op, s / 8))
      prev = { x: op.x, y: op.y }
    } else if (op.type === 'Q') {
      for (let s = 0; s < 8; s++) {
        const t = s / 8
        const u = 1 - t
        pts.push({
          x: u * u * prev.x + 2 * u * t * op.x1 + t * t * op.x,
          y: u * u * prev.y + 2 * u * t * op.y1 + t * t * op.y,
        })
      }
      prev = { x: op.x, y: op.y }
    } else if (op.type === 'L') {
      const steps = Math.max(1, Math.round(Math.hypot(op.x - prev.x, op.y - prev.y) / 2))
      for (let s = 0; s < steps; s++) {
        pts.push({
          x: prev.x + ((op.x - prev.x) * s) / steps,
          y: prev.y + ((op.y - prev.y) * s) / steps,
        })
      }
      prev = { x: op.x, y: op.y }
    }
  }
  // Close the loop: sample the implicit edge back to start when Z did the closing.
  if (Math.hypot(prev.x - start.x, prev.y - start.y) > 1e-6) {
    const steps = Math.max(1, Math.round(Math.hypot(start.x - prev.x, start.y - prev.y) / 2))
    for (let s = 0; s < steps; s++) {
      pts.push({
        x: prev.x + ((start.x - prev.x) * s) / steps,
        y: prev.y + ((start.y - prev.y) * s) / steps,
      })
    }
  }
  return pts
}

/** Distance from (px,py) to segment a–b. */
function pointSegDist(px: number, py: number, a: Pt, b: Pt): number {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - a.x) * dx + (py - a.y) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/**
 * True when every outline sample lies within `tol` of the candidate polygon's
 * edges, excluding samples within `skipArc` (about the centroid) of a vertex.
 * The tracer rounds real corners, so only the straight edge spans are checked —
 * that is where a genuine regular figure matches and an irregular one does not.
 */
function outlineFitsEdges(
  pts: Pt[],
  cx: number,
  cy: number,
  poly: Pt[],
  vertexAngles: number[],
  tol: number,
  skipArc: number,
): boolean {
  const m = poly.length
  let checked = 0
  for (const p of pts) {
    const pa = Math.atan2(p.y - cy, p.x - cx)
    if (vertexAngles.some((va) => Math.abs(angleDiff(pa, va)) < skipArc)) continue
    let best = Infinity
    for (let i = 0; i < m && best > tol; i++) {
      const d = pointSegDist(p.x, p.y, poly[i], poly[(i + 1) % m])
      if (d < best) best = d
    }
    if (best > tol) return false
    checked++
  }
  // Guard against a skipArc so wide nothing is actually verified.
  return checked >= m
}

/** Extreme (max or min) sample radius within `hw` radians of `target`, or null if none. */
function extremeRadiusNear(
  rad: number[],
  ang: number[],
  target: number,
  hw: number,
  wantMax: boolean,
): number | null {
  let best = wantMax ? -Infinity : Infinity
  let found = false
  for (let i = 0; i < ang.length; i++) {
    if (Math.abs(angleDiff(ang[i], target)) <= hw) {
      found = true
      if (wantMax ? rad[i] > best : rad[i] < best) best = rad[i]
    }
  }
  return found ? best : null
}

const mean = (a: number[]): number => a.reduce((s, v) => s + v, 0) / a.length

/**
 * A regular polygon or regular star, fit to the dense outline so it survives the
 * tracer's curved edges and rounded corners (a direct all-lines match does not).
 * The centroid anchors polar coordinates; corners are radius maxima. For each
 * candidate side count the ideal figure is built and accepted only if every
 * outline sample lies on it within tolerance — so a circle or blob is rejected.
 * Runs after the circle/ellipse fits, which claim genuine curves first.
 */
function detectRegularPolygon(start: Pt, ops: PathCommand[], precision: number): Primitive | null {
  if (ops.length < 3) return null
  const pts = denseOutline(start, ops)
  if (pts.length < 24) return null

  const cx = mean(pts.map((p) => p.x))
  const cy = mean(pts.map((p) => p.y))
  const rad = pts.map((p) => Math.hypot(p.x - cx, p.y - cy))
  const ang = pts.map((p) => Math.atan2(p.y - cy, p.x - cx))
  const rMax = Math.max(...rad)
  if (rMax < 3) return null
  const tol = Math.min(4, Math.max(0.8, rMax * 0.045))

  // A genuine regular figure spans the same bounding box as the outline it was
  // fit to. Reject a candidate whose extent diverges — the polar corner search
  // can otherwise fold a thin, elongated shape into a self-intersecting star
  // (a "bowtie") that still threads the edge-distance test.
  const bx0 = Math.min(...pts.map((p) => p.x))
  const bx1 = Math.max(...pts.map((p) => p.x))
  const by0 = Math.min(...pts.map((p) => p.y))
  const by1 = Math.max(...pts.map((p) => p.y))
  const bboxMatches = (poly: Pt[]): boolean => {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (const p of poly) {
      if (p.x < x0) x0 = p.x
      if (p.x > x1) x1 = p.x
      if (p.y < y0) y0 = p.y
      if (p.y > y1) y1 = p.y
    }
    const m = 2 * tol
    return (
      Math.abs(x0 - bx0) <= m &&
      Math.abs(x1 - bx1) <= m &&
      Math.abs(y0 - by0) <= m &&
      Math.abs(y1 - by1) <= m
    )
  }

  // Phase from the farthest sample (a corner).
  let iMax = 0
  for (let i = 1; i < rad.length; i++) if (rad[i] > rad[iMax]) iMax = i
  const phase = ang[iMax]

  // Polygon: n corners, equal spacing. The corner radius is derived from the
  // edge-midpoint radius (R = r_mid / cos(π/n)), which the tracer preserves —
  // sizing from the rounded corner tips would shrink the whole figure.
  for (let n = 3; n <= 12; n++) {
    const step = (2 * Math.PI) / n
    const hw = step / 5
    const mids: number[] = []
    let ok = true
    for (let i = 0; i < n; i++) {
      // Corner must exist (a local radius bump); edge midpoint sizes the figure.
      const corner = extremeRadiusNear(rad, ang, phase + i * step, hw, true)
      const mid = extremeRadiusNear(rad, ang, phase + (i + 0.5) * step, hw, false)
      if (corner === null || mid === null) {
        ok = false
        break
      }
      mids.push(mid)
    }
    if (!ok) continue
    const R = mean(mids) / Math.cos(Math.PI / n)
    const poly: Pt[] = []
    const vertexAngles: number[] = []
    for (let i = 0; i < n; i++) {
      const a = phase + i * step
      vertexAngles.push(a)
      poly.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) })
    }
    // An axis-aligned square is a <rect>, not a <polygon>; only keep a rotated
    // one (a diamond). Edges near horizontal/vertical ⇒ axis-aligned ⇒ skip.
    if (n === 4) {
      const edgeAng = Math.atan2(Math.abs(poly[1].y - poly[0].y), Math.abs(poly[1].x - poly[0].x))
      if (edgeAng < Math.PI / 12 || edgeAng > Math.PI / 2 - Math.PI / 12) continue
    }
    if (bboxMatches(poly) && outlineFitsEdges(pts, cx, cy, poly, vertexAngles, tol, step * 0.18)) {
      return round({ kind: 'polygon', points: poly }, precision)
    }
  }

  // Star: n outer + n inner vertices, alternating radii, with inner clearly deeper
  // than a polygon's edge dip (else it is just a polygon, handled above).
  for (let n = 3; n <= 12; n++) {
    const step = (2 * Math.PI) / n
    const hw = step / 5
    const outer: number[] = []
    const inner: number[] = []
    let ok = true
    for (let i = 0; i < n; i++) {
      const ro = extremeRadiusNear(rad, ang, phase + i * step, hw, true)
      const ri = extremeRadiusNear(rad, ang, phase + (i + 0.5) * step, hw, false)
      if (ro === null || ri === null) {
        ok = false
        break
      }
      outer.push(ro)
      inner.push(ri)
    }
    if (!ok) continue
    const Ro = mean(outer)
    const Ri = mean(inner)
    if (Ri >= Ro * Math.cos(Math.PI / n) - tol) continue // not deep enough to be a star
    const poly: Pt[] = []
    const vertexAngles: number[] = []
    for (let i = 0; i < 2 * n; i++) {
      const a = phase + (i * step) / 2
      vertexAngles.push(a)
      poly.push({
        x: cx + (i % 2 === 0 ? Ro : Ri) * Math.cos(a),
        y: cy + (i % 2 === 0 ? Ro : Ri) * Math.sin(a),
      })
    }
    if (bboxMatches(poly) && outlineFitsEdges(pts, cx, cy, poly, vertexAngles, tol, step * 0.09)) {
      return round({ kind: 'polygon', points: poly }, precision)
    }
  }

  return null
}

function round(prim: Primitive, precision: number): Primitive {
  const p = clampPrecision(precision)
  const q = (v: number): number => Number(v.toFixed(p))
  if (prim.kind === 'polygon') {
    return { kind: 'polygon', points: prim.points.map((pt) => ({ x: q(pt.x), y: q(pt.y) })) }
  }
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
  return {
    kind: 'ellipse',
    cx: q(prim.cx),
    cy: q(prim.cy),
    rx: q(prim.rx),
    ry: q(prim.ry),
    ...(prim.angle !== undefined ? { angle: q(prim.angle) } : {}),
  }
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
  // Circle/ellipse first so a true circle stays `<circle>`, not a pill `<rect rx>`;
  // the regular-polygon fit runs last so a curve is never mistaken for an n-gon.
  return (
    detectRound(loop.start, loop.ops, precision) ??
    detectRoundedRect(loop.start, loop.ops, precision) ??
    detectRegularPolygon(loop.start, loop.ops, precision)
  )
}
