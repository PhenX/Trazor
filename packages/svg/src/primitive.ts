/**
 * Recognize a closed path that is really a basic shape and emit the
 * corresponding SVG element. Rectangles are matched exactly on the output grid,
 * so `<rect>` renders bit-for-bit like the four-line path in every mode.
 * Circles and ellipses match within a sub-pixel tolerance and are therefore
 * only offered when `round` is set — the engine leaves it off for cutout mode,
 * where a neighbor still traces the Bézier boundary and must not diverge.
 *
 * Every detector states the loop structure it can match; {@link detectPrimitive}
 * checks those preconditions up front, so a loop that cannot be a given shape
 * never reaches that shape's fit.
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

type LineOp = Extract<PathCommand, { type: 'L' }>
type CurveOp = Extract<PathCommand, { type: 'C' }>

const isLine = (op: PathCommand): op is LineOp => op.type === 'L'
const isCurve = (op: PathCommand): op is CurveOp => op.type === 'C'
const isEdge = (op: PathCommand): op is LineOp | CurveOp => op.type === 'L' || op.type === 'C'

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
function anchors(start: Pt, ops: readonly LineOp[], scale: number): Pt[] {
  const pts: Pt[] = [start]
  for (const op of ops) pts.push({ x: op.x, y: op.y })
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

/** Match an all-straight-edge loop against its own bounding box. */
function detectRect(start: Pt, ops: readonly LineOp[], scale: number): Primitive | null {
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
 * all-cubic loop of at least three segments. Parameters come from least-squares
 * fits (`fit.ts`) — a Kåsa circle fit and a direct conic ellipse fit — so uneven
 * anchor spacing does not bias the recovered center/radii. Each candidate is
 * accepted only if every boundary sample lies on it within tolerance, so a
 * non-round shape is rejected.
 */
function detectRound(start: Pt, ops: readonly CurveOp[], precision: number): Primitive | null {
  // Dense boundary samples: each anchor plus three interior points per cubic.
  const samples: Pt[] = [start]
  let prev = start
  for (const op of ops) {
    samples.push(cubicPoint(prev, op, 0.25), cubicPoint(prev, op, 0.5), cubicPoint(prev, op, 0.75))
    samples.push({ x: op.x, y: op.y })
    prev = { x: op.x, y: op.y }
  }

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
function cubicPoint(p0: Pt, c: CurveOp, t: number): Pt {
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
  const ax = Math.max(qx, 0)
  const ay = Math.max(qy, 0)
  // Distance out to the corner arc's center, `hypot(ax, ay)`; alongside a
  // straight edge one term is zero and the other is that distance already.
  const outside = ay === 0 ? ax : ax === 0 ? ay : Math.hypot(ax, ay)
  return outside + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * How far inside its bounding box a rounded rect's boundary reaches, per unit of
 * corner radius: the corner arc's midpoint, `1 − 1/√2` of the radius from each of
 * its two sides. Rounded up, so the reject below never fires on a shape the SDF
 * test would accept.
 */
const CORNER_INSET_RATIO = 0.3

/**
 * Recognize an axis-aligned rounded rectangle (straight edges + circular corner
 * arcs) and emit `<rect rx>`. Structure-agnostic: it fits one corner radius by a
 * coarse scan refined with a golden-section search (sub-pixel), and accepts only
 * if every densely sampled boundary point lies on that rounded rect within
 * tolerance, so a shape that is not really one is rejected. `ops` are the loop's
 * four or more straight and curved edges, at least one of them a corner arc.
 */
function detectRoundedRect(
  start: Pt,
  ops: readonly (LineOp | CurveOp)[],
  precision: number,
): Primitive | null {
  // Dense samples: anchors plus each segment's midpoint (a non-axis-aligned edge
  // or a wrong corner then fails the fit).
  const count = 1 + 2 * ops.length
  const sx = new Float64Array(count)
  const sy = new Float64Array(count)
  sx[0] = start.x
  sy[0] = start.y
  let prevX = start.x
  let prevY = start.y
  let k = 1
  for (const op of ops) {
    if (op.type === 'C') {
      sx[k] = 0.125 * prevX + 0.375 * op.x1 + 0.375 * op.x2 + 0.125 * op.x
      sy[k] = 0.125 * prevY + 0.375 * op.y1 + 0.375 * op.y2 + 0.125 * op.y
    } else {
      sx[k] = (prevX + op.x) / 2
      sy[k] = (prevY + op.y) / 2
    }
    sx[k + 1] = op.x
    sy[k + 1] = op.y
    k += 2
    prevX = op.x
    prevY = op.y
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, sx[i])
    maxX = Math.max(maxX, sx[i])
    minY = Math.min(minY, sy[i])
    maxY = Math.max(maxY, sy[i])
  }
  const cx = (minX + maxX) / 2
  const cy = (minY + maxY) / 2
  const hx = (maxX - minX) / 2
  const hy = (maxY - minY) / 2
  if (hx <= 0 || hy <= 0) return null

  const maxR = Math.min(hx, hy)
  const tol = Math.max(0.75, maxR * 0.03)

  // Every point of a rounded rect with corner radius r lies within
  // `(1 − 1/√2)·r + tol` of its bounding box, and the radius search cannot
  // return more than `maxR`: a sample deeper inside than that fails the SDF
  // test at every candidate radius, so there is nothing to search for.
  const band = CORNER_INSET_RATIO * maxR + tol
  for (let i = 0; i < count; i++) {
    const inset = Math.min(hx - Math.abs(sx[i] - cx), hy - Math.abs(sy[i] - cy))
    if (inset > band) return null
  }

  // Largest |SDF| over all samples for a candidate corner radius — minimized at
  // the true radius (V-shaped: too small clips the corners, too large bulges).
  // A candidate already past `cutoff` cannot win, so it stops there.
  const maxErr = (r: number, cutoff: number): number => {
    let err = 0
    for (let i = 0; i < count; i++) {
      const d = Math.abs(roundedRectSdf(sx[i], sy[i], cx, cy, hx, hy, r))
      if (d > err) {
        err = d
        if (err >= cutoff) return err
      }
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
    const err = maxErr(step * i, bestErr)
    if (err < bestErr) {
      bestErr = err
      bestR = step * i
    }
  }
  // The SDF moves by at most `dr` when the radius moves by `dr`, so `maxErr` is
  // 1-Lipschitz and no radius in the bracket below can beat the scan's best by
  // more than one step: once that best is a step past tolerance, refining it
  // cannot bring it back under.
  if (bestErr - step > tol) return null
  bestR = goldenMin(
    (r) => maxErr(r, Infinity),
    Math.max(0, bestR - step),
    Math.min(maxR, bestR + step),
  )
  bestErr = maxErr(bestR, Infinity)
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

/**
 * Dense point samples along the outline (curves sampled too), one loop, in
 * order, appended to `px`/`py` as parallel coordinate lists.
 */
function denseOutline(start: Pt, ops: readonly PathCommand[], px: number[], py: number[]): void {
  let prevX = start.x
  let prevY = start.y
  for (const op of ops) {
    if (op.type === 'C') {
      // Bernstein form, eight samples per segment.
      for (let s = 0; s < 8; s++) {
        const t = s / 8
        const u = 1 - t
        const a = u * u * u
        const b = 3 * u * u * t
        const c = 3 * u * t * t
        const d = t * t * t
        px.push(a * prevX + b * op.x1 + c * op.x2 + d * op.x)
        py.push(a * prevY + b * op.y1 + c * op.y2 + d * op.y)
      }
      prevX = op.x
      prevY = op.y
    } else if (op.type === 'Q') {
      for (let s = 0; s < 8; s++) {
        const t = s / 8
        const u = 1 - t
        px.push(u * u * prevX + 2 * u * t * op.x1 + t * t * op.x)
        py.push(u * u * prevY + 2 * u * t * op.y1 + t * t * op.y)
      }
      prevX = op.x
      prevY = op.y
    } else if (op.type === 'L') {
      const steps = Math.max(1, Math.round(Math.hypot(op.x - prevX, op.y - prevY) / 2))
      for (let s = 0; s < steps; s++) {
        px.push(prevX + ((op.x - prevX) * s) / steps)
        py.push(prevY + ((op.y - prevY) * s) / steps)
      }
      prevX = op.x
      prevY = op.y
    }
  }
  // Close the loop: sample the implicit edge back to start when Z did the closing.
  if (Math.hypot(prevX - start.x, prevY - start.y) > 1e-6) {
    const steps = Math.max(1, Math.round(Math.hypot(start.x - prevX, start.y - prevY) / 2))
    for (let s = 0; s < steps; s++) {
      px.push(prevX + ((start.x - prevX) * s) / steps)
      py.push(prevY + ((start.y - prevY) * s) / steps)
    }
  }
}

/** Distance from (px,py) to the segment (ax,ay)–(bx,by). */
function pointSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax
  const dy = by - ay
  const len2 = dx * dx + dy * dy
  let t = len2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/** Side counts scanned for a regular polygon or star. */
const MIN_SIDES = 3
const MAX_SIDES = 12
/** Rows of the per-side-count radius tables: side count `n` owns `n` slots at {@link sideBase}. */
const SIDE_SLOTS = ((MAX_SIDES + MIN_SIDES) * (MAX_SIDES - MIN_SIDES + 1)) / 2
/**
 * Half-width of a corner or edge-midpoint window, measured in steps: `hw` is a
 * fifth of a step, rounded up past any error in the step count so a sample near
 * a window's edge still reaches the exact angle test that decides it.
 */
const WINDOW_STEPS = 0.2 + 1e-9
const sideBase = (n: number): number => ((n * (n - 1)) >> 1) - ((MIN_SIDES * (MIN_SIDES - 1)) >> 1)

/**
 * A regular polygon or regular star, fit to the dense outline so it survives the
 * tracer's curved edges and rounded corners (a direct all-lines match does not).
 * The centroid anchors polar coordinates; corners are radius maxima. For each
 * candidate side count the ideal figure is built and accepted only if every
 * outline sample lies on it within tolerance — so a circle or blob is rejected.
 * Runs after the circle/ellipse fits, which claim genuine curves first. `ops`
 * are the loop's three or more edges, of any kind.
 */
function detectRegularPolygon(
  start: Pt,
  ops: readonly PathCommand[],
  precision: number,
): Primitive | null {
  const px: number[] = []
  const py: number[] = []
  denseOutline(start, ops, px, py)
  const m = px.length
  if (m < 24) return null

  let sumX = 0
  let sumY = 0
  for (let i = 0; i < m; i++) {
    sumX += px[i]
    sumY += py[i]
  }
  const cx = sumX / m
  const cy = sumY / m

  // Polar coordinates about the centroid, plus the outline's own bounding box.
  const rad = new Float64Array(m)
  const ang = new Float64Array(m)
  let rMax = -Infinity
  let bx0 = Infinity
  let bx1 = -Infinity
  let by0 = Infinity
  let by1 = -Infinity
  for (let i = 0; i < m; i++) {
    rad[i] = Math.hypot(px[i] - cx, py[i] - cy)
    ang[i] = Math.atan2(py[i] - cy, px[i] - cx)
    rMax = Math.max(rMax, rad[i])
    bx0 = Math.min(bx0, px[i])
    bx1 = Math.max(bx1, px[i])
    by0 = Math.min(by0, py[i])
    by1 = Math.max(by1, py[i])
  }
  if (rMax < 3) return null
  const tol = Math.min(4, Math.max(0.8, rMax * 0.045))

  // A genuine regular figure spans the same bounding box as the outline it was
  // fit to. Reject a candidate whose extent diverges — the polar corner search
  // can otherwise fold a thin, elongated shape into a self-intersecting star
  // (a "bowtie") that still threads the edge-distance test.
  const bboxMatches = (polyX: Float64Array, polyY: Float64Array, sides: number): boolean => {
    let x0 = Infinity
    let x1 = -Infinity
    let y0 = Infinity
    let y1 = -Infinity
    for (let i = 0; i < sides; i++) {
      if (polyX[i] < x0) x0 = polyX[i]
      if (polyX[i] > x1) x1 = polyX[i]
      if (polyY[i] < y0) y0 = polyY[i]
      if (polyY[i] > y1) y1 = polyY[i]
    }
    const margin = 2 * tol
    return (
      Math.abs(x0 - bx0) <= margin &&
      Math.abs(x1 - bx1) <= margin &&
      Math.abs(y0 - by0) <= margin &&
      Math.abs(y1 - by1) <= margin
    )
  }

  /**
   * True when every outline sample lies within `tol` of the candidate polygon's
   * edges, excluding samples within `skipArc` (about the centroid) of a vertex.
   * The tracer rounds real corners, so only the straight edge spans are checked —
   * that is where a genuine regular figure matches and an irregular one does not.
   */
  const outlineFitsEdges = (
    polyX: Float64Array,
    polyY: Float64Array,
    vertexAngles: Float64Array,
    sides: number,
    skipArc: number,
  ): boolean => {
    let checked = 0
    for (let j = 0; j < m; j++) {
      const pa = ang[j]
      let atVertex = false
      for (let v = 0; v < sides; v++) {
        if (Math.abs(angleDiff(pa, vertexAngles[v])) < skipArc) {
          atVertex = true
          break
        }
      }
      if (atVertex) continue
      let best = Infinity
      for (let i = 0; i < sides && best > tol; i++) {
        const j2 = (i + 1) % sides
        const d = pointSegDist(px[j], py[j], polyX[i], polyY[i], polyX[j2], polyY[j2])
        if (d < best) best = d
      }
      if (best > tol) return false
      checked++
    }
    // Guard against a skipArc so wide nothing is actually verified.
    return checked >= sides
  }

  // Phase from the farthest sample (a corner).
  let iMax = 0
  for (let i = 1; i < m; i++) if (rad[i] > rad[iMax]) iMax = i
  const phase = ang[iMax]

  // Per side count: the extreme sample radius near each corner direction (a
  // maximum) and each edge-midpoint direction (a minimum), over the samples
  // within a fifth of a step of it. One pass over the samples fills a whole
  // row, and the star pass reads the rows the polygon pass filled.
  const cornerR = new Float64Array(SIDE_SLOTS)
  const midR = new Float64Array(SIDE_SLOTS)
  const cornerFound = new Uint8Array(SIDE_SLOTS)
  const midFound = new Uint8Array(SIDE_SLOTS)
  const scanned = new Uint8Array(MAX_SIDES + 1)
  const scanSides = (n: number): void => {
    if (scanned[n] === 1) return
    scanned[n] = 1
    const base = sideBase(n)
    const step = (2 * Math.PI) / n
    const hw = step / 5
    for (let i = 0; i < n; i++) {
      cornerR[base + i] = -Infinity
      midR[base + i] = Infinity
    }
    for (let j = 0; j < m; j++) {
      const a = ang[j]
      // Steps from the phase, split into whole steps and the fraction into the
      // current one: the windows sit at fraction 0 (a corner) and 0.5 (an edge
      // midpoint), each `WINDOW_STEPS` wide, so a sample can only lie in the
      // nearest window of each kind — and in only one of the two.
      const q = (a - phase) / step
      const whole = Math.floor(q)
      const frac = q - whole
      if (frac < WINDOW_STEPS || frac > 1 - WINDOW_STEPS) {
        let i = ((frac < 0.5 ? whole : whole + 1) | 0) % n
        if (i < 0) i += n
        if (Math.abs(angleDiff(a, phase + i * step)) <= hw) {
          cornerFound[base + i] = 1
          if (rad[j] > cornerR[base + i]) cornerR[base + i] = rad[j]
        }
      } else if (frac > 0.5 - WINDOW_STEPS && frac < 0.5 + WINDOW_STEPS) {
        let k = (whole | 0) % n
        if (k < 0) k += n
        if (Math.abs(angleDiff(a, phase + (k + 0.5) * step)) <= hw) {
          midFound[base + k] = 1
          if (rad[j] < midR[base + k]) midR[base + k] = rad[j]
        }
      }
    }
  }
  /** True when every corner and every edge-midpoint direction of `n` holds a sample. */
  const sidesCovered = (n: number): boolean => {
    const base = sideBase(n)
    for (let i = 0; i < n; i++) {
      if (cornerFound[base + i] === 0 || midFound[base + i] === 0) return false
    }
    return true
  }

  const polyX = new Float64Array(2 * MAX_SIDES)
  const polyY = new Float64Array(2 * MAX_SIDES)
  const vertexAngles = new Float64Array(2 * MAX_SIDES)
  const toPoints = (sides: number): Pt[] => {
    const points: Pt[] = []
    for (let i = 0; i < sides; i++) points.push({ x: polyX[i], y: polyY[i] })
    return points
  }

  // Polygon: n corners, equal spacing. The corner radius is derived from the
  // edge-midpoint radius (R = r_mid / cos(π/n)), which the tracer preserves —
  // sizing from the rounded corner tips would shrink the whole figure.
  for (let n = MIN_SIDES; n <= MAX_SIDES; n++) {
    scanSides(n)
    if (!sidesCovered(n)) continue
    const base = sideBase(n)
    const step = (2 * Math.PI) / n
    let mids = 0
    for (let i = 0; i < n; i++) mids += midR[base + i]
    const R = mids / n / Math.cos(Math.PI / n)
    for (let i = 0; i < n; i++) {
      const a = phase + i * step
      vertexAngles[i] = a
      polyX[i] = cx + R * Math.cos(a)
      polyY[i] = cy + R * Math.sin(a)
    }
    // An axis-aligned square is a <rect>, not a <polygon>; only keep a rotated
    // one (a diamond). Edges near horizontal/vertical ⇒ axis-aligned ⇒ skip.
    if (n === 4) {
      const edgeAng = Math.atan2(Math.abs(polyY[1] - polyY[0]), Math.abs(polyX[1] - polyX[0]))
      if (edgeAng < Math.PI / 12 || edgeAng > Math.PI / 2 - Math.PI / 12) continue
    }
    if (
      bboxMatches(polyX, polyY, n) &&
      outlineFitsEdges(polyX, polyY, vertexAngles, n, step * 0.18)
    ) {
      return round({ kind: 'polygon', points: toPoints(n) }, precision)
    }
  }

  // Star: n outer + n inner vertices, alternating radii, with inner clearly deeper
  // than a polygon's edge dip (else it is just a polygon, handled above).
  for (let n = MIN_SIDES; n <= MAX_SIDES; n++) {
    scanSides(n)
    if (!sidesCovered(n)) continue
    const base = sideBase(n)
    const step = (2 * Math.PI) / n
    let outer = 0
    let inner = 0
    for (let i = 0; i < n; i++) {
      outer += cornerR[base + i]
      inner += midR[base + i]
    }
    const Ro = outer / n
    const Ri = inner / n
    if (Ri >= Ro * Math.cos(Math.PI / n) - tol) continue // not deep enough to be a star
    for (let i = 0; i < 2 * n; i++) {
      const a = phase + (i * step) / 2
      vertexAngles[i] = a
      const r = i % 2 === 0 ? Ro : Ri
      polyX[i] = cx + r * Math.cos(a)
      polyY[i] = cy + r * Math.sin(a)
    }
    if (
      bboxMatches(polyX, polyY, 2 * n) &&
      outlineFitsEdges(polyX, polyY, vertexAngles, 2 * n, step * 0.09)
    ) {
      return round({ kind: 'polygon', points: toPoints(2 * n) }, precision)
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
 * Each detector runs only on the loop structure it can match at all: a rectangle
 * on straight edges, a circle/ellipse on an all-curve loop, a rounded rect on
 * straight and curved edges with at least one corner arc.
 */
export function detectPrimitive(
  commands: readonly PathCommand[],
  precision: number,
  allowRound: boolean,
): Primitive | null {
  const loop = singleClosedLoop(commands)
  if (!loop) return null
  const ops = loop.ops
  if (ops.every(isLine)) {
    const rect = detectRect(loop.start, ops, 10 ** clampPrecision(precision))
    if (rect) return rect
  }
  if (!allowRound) return null
  // Circle/ellipse first so a true circle stays `<circle>`, not a pill `<rect rx>`;
  // the regular-polygon fit runs last so a curve is never mistaken for an n-gon.
  if (ops.length >= 3 && ops.every(isCurve)) {
    const prim = detectRound(loop.start, ops, precision)
    if (prim) return prim
  }
  if (ops.length >= 4 && ops.some(isCurve) && ops.every(isEdge)) {
    const prim = detectRoundedRect(loop.start, ops, precision)
    if (prim) return prim
  }
  if (ops.length < 3) return null
  return detectRegularPolygon(loop.start, ops, precision)
}
