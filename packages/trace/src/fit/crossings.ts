/**
 * Where fitted geometry crosses itself: the test the repair stage runs on every
 * face ring before it refits the edges that make one cross.
 *
 * Each fitted edge is flattened once ({@link flattenEdge}): a line to its end
 * point, a cubic to {@link FLATTEN} pieces evenly in its parameter, an arc to
 * {@link FLATTEN} pieces per quarter turn (never fewer than {@link FLATTEN}). A
 * path — one edge, two edges, or a face ring walked over its edges — is invalid
 * exactly where two pieces of different segments meet, other than the two
 * pieces that meet where those segments join: the renderer's criterion,
 * decided by geometry (end points within {@link EPS}) rather than by topology,
 * so a closed edge, a node two edges share, and a pinch where a ring passes a
 * node twice are all exempt where they only touch, and caught where they cross
 * a piece further on. A cubic is also tested against itself, in closed form.
 *
 * Every decision is an exact predicate: Shewchuk's adaptive `orient2d`
 * (J. R. Shewchuk, "Adaptive Precision Floating-Point Arithmetic and Fast
 * Robust Geometric Predicates", Discrete & Computational Geometry 18(3):305–363,
 * 1997; `predicates.c`, public domain). A uniform grid over the segments' boxes
 * ({@link boxPairs}) keeps a ring of thousands of segments near linear; blocks
 * of 16 pieces with a box each do the same inside a pair. Each crossing reports
 * the two segments, the edge and the index each has in that edge's own fit,
 * and where they meet, which is where a repair pins a vertex.
 *
 * Every test here is translation invariant, so inkvec's pixel-centre lattice
 * and Trazor's pixel-corner lattice give the same answers without a shift.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/simple.rs`,
 * `inkvec-core/src/predicates.rs`, `inkvec-fit/src/curves.rs`
 * (`cubic_self_intersects`, `eval_cubic`, `arc_ellipse_center`) and
 * `inkvec-cli/src/rings.rs` (`ring_as_located_path`, `located_crossings`).
 */
import { arcToCenter } from '@trazor/core'
import type { PathCommand } from '@trazor/core'
import type { FaceRing, FittedEdge } from '../planar/types'

/**
 * Pieces per curved segment when flattening, and per quarter turn of an arc.
 * The test reads the flattened path, so this sets how shallow a crossing it can
 * see; a crossing shallower than the flattening error is invisible in the
 * render too.
 */
export const FLATTEN = 16

/** Crossing pairs one ring reports at most (inkvec's repair reads 32). */
export const CROSSING_LIMIT = 32

/** Two end points closer than this on both axes (px) are the same point. */
export const EPS = 1e-6

/** Pieces per block of the in-pair prune. */
const BLK = 16

/** Below this many boxes, {@link boxPairs} tests every pair directly. */
const SMALL = 24

// ---------------------------------------------------------------------------
// Exact orientation (Shewchuk 1997, §6: orient2d with its adaptive stages)
// ---------------------------------------------------------------------------

/** Half an ulp of 1: the machine epsilon of `predicates.c`'s `exactinit`. */
const EPSILON = 2 ** -53
/** `2^⌈53/2⌉ + 1`, which splits a double into two 26-bit halves. */
const SPLITTER = 2 ** 27 + 1
const RESULT_ERR_BOUND = (3 + 8 * EPSILON) * EPSILON
const CCW_ERR_BOUND_A = (3 + 16 * EPSILON) * EPSILON
const CCW_ERR_BOUND_B = (2 + 12 * EPSILON) * EPSILON
const CCW_ERR_BOUND_C = (9 + 64 * EPSILON) * EPSILON * EPSILON

const B = new Float64Array(4)
const U = new Float64Array(4)
const C1 = new Float64Array(8)
const C2 = new Float64Array(12)
const D = new Float64Array(16)

/** `Two_Sum_Tail`: the rounding error of `x = fl(a + b)`. */
function twoSumTail(a: number, b: number, x: number): number {
  const bvirt = x - a
  const avirt = x - bvirt
  const bround = b - bvirt
  const around = a - avirt
  return around + bround
}

/** `Two_Diff_Tail`: the rounding error of `x = fl(a − b)`. */
function twoDiffTail(a: number, b: number, x: number): number {
  const bvirt = a - x
  const avirt = x + bvirt
  const bround = bvirt - b
  const around = a - avirt
  return around + bround
}

/** `Two_Product_Tail`: the rounding error of `x = fl(a · b)`, by Dekker's split. */
function twoProductTail(a: number, b: number, x: number): number {
  let c = SPLITTER * a
  let big = c - a
  const ahi = c - big
  const alo = a - ahi
  c = SPLITTER * b
  big = c - b
  const bhi = c - big
  const blo = b - bhi
  const err1 = x - ahi * bhi
  const err2 = err1 - alo * bhi
  const err3 = err2 - ahi * blo
  return alo * blo - err3
}

/** `Two_Two_Diff`: the expansion `(a1 + a0) − (b1 + b0)` into `out[0..3]`, least significant first. */
function twoTwoDiff(a1: number, a0: number, b1: number, b0: number, out: Float64Array): void {
  let i = a0 - b0
  out[0] = twoDiffTail(a0, b0, i)
  const j = a1 + i
  const z = twoSumTail(a1, i, j)
  i = z - b1
  out[1] = twoDiffTail(z, b1, i)
  const x3 = j + i
  out[2] = twoSumTail(j, i, x3)
  out[3] = x3
}

/**
 * `fast_expansion_sum_zeroelim`: `h = e + f` for two nonoverlapping expansions
 * sorted by increasing magnitude, zero components dropped; returns `h`'s length.
 */
function expansionSum(
  elen: number,
  e: Float64Array,
  flen: number,
  f: Float64Array,
  h: Float64Array,
): number {
  let enow = e[0]
  let fnow = f[0]
  let ei = 0
  let fi = 0
  let q: number
  let qnew: number
  let hh: number
  if (fnow > enow === fnow > -enow) {
    q = enow
    enow = ++ei < elen ? e[ei] : 0
  } else {
    q = fnow
    fnow = ++fi < flen ? f[fi] : 0
  }
  let hi = 0
  if (ei < elen && fi < flen) {
    if (fnow > enow === fnow > -enow) {
      qnew = enow + q
      hh = q - (qnew - enow)
      enow = ++ei < elen ? e[ei] : 0
    } else {
      qnew = fnow + q
      hh = q - (qnew - fnow)
      fnow = ++fi < flen ? f[fi] : 0
    }
    q = qnew
    if (hh !== 0) h[hi++] = hh
    while (ei < elen && fi < flen) {
      if (fnow > enow === fnow > -enow) {
        qnew = q + enow
        hh = twoSumTail(q, enow, qnew)
        enow = ++ei < elen ? e[ei] : 0
      } else {
        qnew = q + fnow
        hh = twoSumTail(q, fnow, qnew)
        fnow = ++fi < flen ? f[fi] : 0
      }
      q = qnew
      if (hh !== 0) h[hi++] = hh
    }
  }
  while (ei < elen) {
    qnew = q + enow
    hh = twoSumTail(q, enow, qnew)
    enow = ++ei < elen ? e[ei] : 0
    q = qnew
    if (hh !== 0) h[hi++] = hh
  }
  while (fi < flen) {
    qnew = q + fnow
    hh = twoSumTail(q, fnow, qnew)
    fnow = ++fi < flen ? f[fi] : 0
    q = qnew
    if (hh !== 0) h[hi++] = hh
  }
  if (q !== 0 || hi === 0) h[hi++] = q
  return hi
}

/** `orient2dadapt`: the stages after the fast filter, exact in the last. */
function orient2dAdapt(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  detsum: number,
): number {
  const acx = ax - cx
  const bcx = bx - cx
  const acy = ay - cy
  const bcy = by - cy

  let s1 = acx * bcy
  let s0 = twoProductTail(acx, bcy, s1)
  let t1 = acy * bcx
  let t0 = twoProductTail(acy, bcx, t1)
  twoTwoDiff(s1, s0, t1, t0, B)
  let det = B[0] + B[1] + B[2] + B[3]
  let errbound = CCW_ERR_BOUND_B * detsum
  if (det >= errbound || -det >= errbound) return det

  const acxtail = twoDiffTail(ax, cx, acx)
  const bcxtail = twoDiffTail(bx, cx, bcx)
  const acytail = twoDiffTail(ay, cy, acy)
  const bcytail = twoDiffTail(by, cy, bcy)
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) return det

  errbound = CCW_ERR_BOUND_C * detsum + RESULT_ERR_BOUND * Math.abs(det)
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail)
  if (det >= errbound || -det >= errbound) return det

  s1 = acxtail * bcy
  s0 = twoProductTail(acxtail, bcy, s1)
  t1 = acytail * bcx
  t0 = twoProductTail(acytail, bcx, t1)
  twoTwoDiff(s1, s0, t1, t0, U)
  const c1 = expansionSum(4, B, 4, U, C1)

  s1 = acx * bcytail
  s0 = twoProductTail(acx, bcytail, s1)
  t1 = acy * bcxtail
  t0 = twoProductTail(acy, bcxtail, t1)
  twoTwoDiff(s1, s0, t1, t0, U)
  const c2 = expansionSum(c1, C1, 4, U, C2)

  s1 = acxtail * bcytail
  s0 = twoProductTail(acxtail, bcytail, s1)
  t1 = acytail * bcxtail
  t0 = twoProductTail(acytail, bcxtail, t1)
  twoTwoDiff(s1, s0, t1, t0, U)
  const d = expansionSum(c2, C2, 4, U, D)
  return D[d - 1]
}

/**
 * Sign of the orientation determinant `(b − a) × (c − a)`, twice the signed
 * area of the triangle: `> 0` when `a, b, c` turn counter-clockwise in a y-up
 * frame (clockwise on a y-down screen), `< 0` the other way, and exactly `0`
 * when they are collinear. The sign is exact; the magnitude is approximate.
 */
export function orient2d(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const detleft = (ax - cx) * (by - cy)
  const detright = (ay - cy) * (bx - cx)
  const det = detleft - detright
  let detsum: number
  if (detleft > 0) {
    if (detright <= 0) return det
    detsum = detleft + detright
  } else if (detleft < 0) {
    if (detright >= 0) return det
    detsum = -detleft - detright
  } else {
    return det
  }
  const errbound = CCW_ERR_BOUND_A * detsum
  if (det >= errbound || -det >= errbound) return det
  return orient2dAdapt(ax, ay, bx, by, cx, cy, detsum)
}

/** Whether `p`, already known collinear with `a–b`, lies within the segment's box. */
function onSegment(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  px: number,
  py: number,
): boolean {
  return (
    px >= Math.min(ax, bx) &&
    px <= Math.max(ax, bx) &&
    py >= Math.min(ay, by) &&
    py <= Math.max(ay, by)
  )
}

/**
 * Whether the closed segments `p1–p2` and `q1–q2` meet, exactly: a proper
 * crossing (each straddles the other's line), or an end point lying on the
 * other segment — a shared end point, a collinear overlap, a touch. A
 * zero-length segment is a point tested for lying on the other.
 */
export function segmentsIntersect(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number,
): boolean {
  const d1 = orient2d(q1x, q1y, q2x, q2y, p1x, p1y)
  const d2 = orient2d(q1x, q1y, q2x, q2y, p2x, p2y)
  const d3 = orient2d(p1x, p1y, p2x, p2y, q1x, q1y)
  const d4 = orient2d(p1x, p1y, p2x, p2y, q2x, q2y)
  if ((d1 > 0 !== d2 > 0 || d1 < 0 !== d2 < 0) && (d3 > 0 !== d4 > 0 || d3 < 0 !== d4 < 0)) {
    return true
  }
  return (
    (d1 === 0 && onSegment(q1x, q1y, q2x, q2y, p1x, p1y)) ||
    (d2 === 0 && onSegment(q1x, q1y, q2x, q2y, p2x, p2y)) ||
    (d3 === 0 && onSegment(p1x, p1y, p2x, p2y, q1x, q1y)) ||
    (d4 === 0 && onSegment(p1x, p1y, p2x, p2y, q2x, q2y))
  )
}

// ---------------------------------------------------------------------------
// One cubic against itself
// ---------------------------------------------------------------------------

/**
 * Whether the cubic `p0 p1 p2 p3` crosses itself strictly inside its span, in
 * closed form. In the power basis `B(t) = a t³ + b t² + c t + d`,
 * `B(t) − B(s) = (t − s)·[a(t² + ts + s²) + b(t + s) + c]`; with `u = t + s`,
 * `v = ts` and `w = u² − v` the bracket is linear in `(w, u)`, so one 2×2 solve
 * gives both, and `t`, `s` are the roots of `z² − u z + v`. A singular system
 * (`|det| < 1e-12`) is a cubic degenerated toward a conic or a line, which
 * cannot loop. Both roots must lie in `(1e-9, 1 − 1e-9)` and differ by more
 * than `1e-9`: a cubic whose ends coincide is a closed teardrop, not a loop.
 */
export function cubicSelfIntersects(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): boolean {
  const ax = -x0 + 3 * x1 - 3 * x2 + x3
  const ay = -y0 + 3 * y1 - 3 * y2 + y3
  const bx = 3 * (x0 - 2 * x1 + x2)
  const by = 3 * (y0 - 2 * y1 + y2)
  const cx = 3 * (x1 - x0)
  const cy = 3 * (y1 - y0)
  const det = ax * by - ay * bx
  if (Math.abs(det) < 1e-12) return false
  const w = (-cx * by + cy * bx) / det
  const u = (ax * -cy - ay * -cx) / det
  const v = u * u - w
  const disc = u * u - 4 * v
  if (disc <= 0) return false
  const r = Math.sqrt(disc)
  const t = 0.5 * (u - r)
  const s = 0.5 * (u + r)
  const eps = 1e-9
  return t > eps && t < 1 - eps && s > eps && s < 1 - eps && Math.abs(s - t) > eps
}

// ---------------------------------------------------------------------------
// Flattening
// ---------------------------------------------------------------------------

/**
 * A path flattened for the crossing test. Segment `k`'s run, from its start to
 * its end, is the points `offsets[k] … offsets[k + 1] − 1` of `xy` (interleaved
 * `x, y`); a segment of `m` pieces has `m + 1` points, and the end point of one
 * segment is repeated as the start of the next.
 */
export interface FlatPath {
  /** Number of segments. */
  readonly count: number
  readonly xy: Float64Array
  /** `count + 1` point indices into `xy`. */
  readonly offsets: Int32Array
  /** Per segment, the box of its run: `x0, y0, x1, y1`. */
  readonly boxes: Float64Array
  /** Per segment, 1 for a cubic that crosses itself ({@link cubicSelfIntersects}). */
  readonly loops: Uint8Array
  /** Per segment, where its loop is reported: the cubic's midpoint `B(½)`; 0 without a loop. */
  readonly loopAt: Float64Array
}

/**
 * A face ring flattened in its walk order ({@link ringPath}), each segment
 * named by the edge it belongs to and its index in that edge's own fit.
 */
export interface RingPath extends FlatPath {
  /** Per segment, the edge it belongs to. */
  readonly edge: Int32Array
  /**
   * Per segment, its index in the edge's own fit, counted in the edge's stored
   * direction even where the ring walks it reversed.
   */
  readonly segment: Int32Array
}

/** Push `B(k/FLATTEN)` for `k = 1 … FLATTEN`; the last is the end point itself. */
function flattenCubic(
  xy: number[],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
): void {
  for (let k = 1; k < FLATTEN; k++) {
    const t = k / FLATTEN
    const u = 1 - t
    const b0 = u * u * u
    const b1 = 3 * u * u * t
    const b2 = 3 * u * t * t
    const b3 = t * t * t
    xy.push(b0 * x0 + b1 * x1 + b2 * x2 + b3 * x3, b0 * y0 + b1 * y1 + b2 * y2 + b3 * y3)
  }
  xy.push(x3, y3)
}

/**
 * Push an arc's points after its start: `n = max(FLATTEN, ⌈FLATTEN·|Δθ|/(π/2)⌉)`
 * pieces evenly in angle on its centre parametrization (SVG 1.1 F.6.5,
 * `arcToCenter`; `rotation` in degrees), the last landing exactly on the
 * stored end point. A zero radius draws a straight line (F.6.2) and coincident
 * end points draw nothing (F.6.2), both one piece here.
 */
function flattenArc(
  xy: number[],
  x0: number,
  y0: number,
  arc: Extract<PathCommand, { type: 'A' }>,
): void {
  const f = arcToCenter(x0, y0, arc)
  if (f !== null && f.dTheta !== 0) {
    const n = Math.max(FLATTEN, Math.ceil((FLATTEN * Math.abs(f.dTheta)) / (Math.PI / 2)))
    const cos = Math.cos(f.phi)
    const sin = Math.sin(f.phi)
    for (let k = 1; k < n; k++) {
      const t = f.theta1 + (f.dTheta * k) / n
      const ex = f.rx * Math.cos(t)
      const ey = f.ry * Math.sin(t)
      xy.push(f.cx + cos * ex - sin * ey, f.cy + sin * ex + cos * ey)
    }
  }
  xy.push(arc.x, arc.y)
}

/**
 * Flatten one fitted edge in its stored direction: per segment, its start and
 * then a line's end, {@link FLATTEN} points of a cubic evenly in its parameter
 * (a quadratic is raised to its cubic), or an arc's points ({@link flattenArc}).
 * An edge is flattened once and every ring that walks it reads the same
 * points, in either direction.
 */
export function flattenEdge(fit: FittedEdge): FlatPath {
  const xy: number[] = []
  const offsets: number[] = []
  const loops: number[] = []
  const loopAt: number[] = []
  let x = fit.x0
  let y = fit.y0
  for (const s of fit.segments) {
    offsets.push(xy.length / 2)
    xy.push(x, y)
    let loop = 0
    let lx = 0
    let ly = 0
    switch (s.type) {
      case 'L':
        xy.push(s.x, s.y)
        break
      case 'Q':
      case 'C': {
        const x1 = s.type === 'C' ? s.x1 : x + (2 / 3) * (s.x1 - x)
        const y1 = s.type === 'C' ? s.y1 : y + (2 / 3) * (s.y1 - y)
        const x2 = s.type === 'C' ? s.x2 : s.x + (2 / 3) * (s.x1 - s.x)
        const y2 = s.type === 'C' ? s.y2 : s.y + (2 / 3) * (s.y1 - s.y)
        flattenCubic(xy, x, y, x1, y1, x2, y2, s.x, s.y)
        if (cubicSelfIntersects(x, y, x1, y1, x2, y2, s.x, s.y)) {
          loop = 1
          lx = 0.125 * x + 0.375 * x1 + 0.375 * x2 + 0.125 * s.x
          ly = 0.125 * y + 0.375 * y1 + 0.375 * y2 + 0.125 * s.y
        }
        break
      }
      case 'A':
        flattenArc(xy, x, y, s)
        break
      case 'M':
      case 'Z':
        throw new Error(`a fitted edge holds L, C and A commands, not ${s.type}`)
    }
    loops.push(loop)
    loopAt.push(lx, ly)
    x = s.x
    y = s.y
  }
  offsets.push(xy.length / 2)
  const count = fit.segments.length
  const flat = Float64Array.from(xy)
  const off = Int32Array.from(offsets)
  const boxes = new Float64Array(4 * count)
  for (let k = 0; k < count; k++) runBox(flat, off[k], off[k + 1] - 1, boxes, 4 * k)
  return {
    count,
    xy: flat,
    offsets: off,
    boxes,
    loops: Uint8Array.from(loops),
    loopAt: Float64Array.from(loopAt),
  }
}

/** The box of points `from … to` (inclusive) of `xy`, into `out[at … at + 3]`. */
function runBox(xy: Float64Array, from: number, to: number, out: Float64Array, at: number): void {
  let x0 = Infinity
  let y0 = Infinity
  let x1 = -Infinity
  let y1 = -Infinity
  for (let p = from; p <= to; p++) {
    const x = xy[2 * p]
    const y = xy[2 * p + 1]
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (y < y0) y0 = y
    if (y > y1) y1 = y
  }
  out[at] = x0
  out[at + 1] = y0
  out[at + 2] = x1
  out[at + 3] = y1
}

/**
 * A face ring as one flattened path in its walk order: each edge's segments in
 * turn, a reversed edge's in reverse with each run read backwards. Each
 * segment keeps the edge it came from and its index in that edge's own fit
 * (segment `r` of a reversed walk over `m` segments is the fit's `m − 1 − r`).
 * `flats[k]` is {@link flattenEdge} of edge `k`'s fit.
 */
export function ringPath(ring: FaceRing, flats: readonly FlatPath[]): RingPath {
  let count = 0
  let points = 0
  for (const k of ring.edges) {
    const f = flats[k]
    count += f.count
    points += f.offsets[f.count]
  }
  const xy = new Float64Array(2 * points)
  const offsets = new Int32Array(count + 1)
  const boxes = new Float64Array(4 * count)
  const loops = new Uint8Array(count)
  const loopAt = new Float64Array(2 * count)
  const edge = new Int32Array(count)
  const segment = new Int32Array(count)
  let s = 0
  let p = 0
  for (let r = 0; r < ring.edges.length; r++) {
    const k = ring.edges[r]
    const f = flats[k]
    const rev = ring.reversed[r]
    const m = f.count
    for (let q = 0; q < m; q++) {
      const g = rev ? m - 1 - q : q
      const from = f.offsets[g]
      const to = f.offsets[g + 1]
      offsets[s] = p
      if (rev) {
        for (let t = to - 1; t >= from; t--) {
          xy[2 * p] = f.xy[2 * t]
          xy[2 * p + 1] = f.xy[2 * t + 1]
          p++
        }
      } else {
        xy.set(f.xy.subarray(2 * from, 2 * to), 2 * p)
        p += to - from
      }
      boxes.set(f.boxes.subarray(4 * g, 4 * g + 4), 4 * s)
      loops[s] = f.loops[g]
      loopAt[2 * s] = f.loopAt[2 * g]
      loopAt[2 * s + 1] = f.loopAt[2 * g + 1]
      edge[s] = k
      segment[s] = g
      s++
    }
  }
  offsets[count] = p
  return { count, xy, offsets, boxes, loops, loopAt, edge, segment }
}

// ---------------------------------------------------------------------------
// Broad phase
// ---------------------------------------------------------------------------

/** Whether boxes `i` and `j` of `boxes` overlap or touch. */
function boxesOverlap(boxes: Float64Array, i: number, j: number): boolean {
  const a = 4 * i
  const b = 4 * j
  return (
    boxes[a] <= boxes[b + 2] &&
    boxes[b] <= boxes[a + 2] &&
    boxes[a + 1] <= boxes[b + 3] &&
    boxes[b + 1] <= boxes[a + 3]
  )
}

/**
 * Every pair `i < j` of the `count` boxes (`x0, y0, x1, y1` each) that overlap
 * or touch, as interleaved `i, j` sorted by `i`, then `j` — the pairs an
 * all-pairs scan would find, in its order.
 *
 * A uniform grid finds them in near-linear time: the cell is the larger of the
 * mean box extent and `√(area / count)` (doubled until the grid has at most
 * `4·count + 64` cells), every box is listed in each cell it covers, and a
 * pair found in a cell is kept only in the cell holding the lower corner of
 * the two boxes' overlap, so each is reported once. Small inputs, and inputs
 * that are not finite, are scanned pair by pair.
 */
export function boxPairs(boxes: Float64Array, count: number): Int32Array {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  let extent = 0
  for (let k = 0; k < count; k++) {
    const x0 = boxes[4 * k]
    const y0 = boxes[4 * k + 1]
    const x1 = boxes[4 * k + 2]
    const y1 = boxes[4 * k + 3]
    if (x0 < minX) minX = x0
    if (y0 < minY) minY = y0
    if (x1 > maxX) maxX = x1
    if (y1 > maxY) maxY = y1
    extent += Math.max(x1 - x0, y1 - y0)
  }
  const w = maxX - minX
  const h = maxY - minY
  if (count <= SMALL || !Number.isFinite(w) || !Number.isFinite(h) || !Number.isFinite(extent)) {
    const out: number[] = []
    for (let i = 0; i < count; i++) {
      for (let j = i + 1; j < count; j++) if (boxesOverlap(boxes, i, j)) out.push(i, j)
    }
    return Int32Array.from(out)
  }

  let cell = Math.max(extent / count, Math.sqrt((w * h) / count))
  if (!(cell > 0)) cell = Math.max(w, h, 1)
  let cols = Math.floor(w / cell) + 1
  let rows = Math.floor(h / cell) + 1
  while (cols * rows > 4 * count + 64) {
    cell *= 2
    cols = Math.floor(w / cell) + 1
    rows = Math.floor(h / cell) + 1
  }
  const col = (x: number): number => Math.min(cols - 1, Math.floor((x - minX) / cell))
  const row = (y: number): number => Math.min(rows - 1, Math.floor((y - minY) / cell))

  // Each cell's boxes, in increasing index (compressed rows).
  const start = new Int32Array(cols * rows + 1)
  for (let k = 0; k < count; k++) {
    const c0 = col(boxes[4 * k])
    const c1 = col(boxes[4 * k + 2])
    const r1 = row(boxes[4 * k + 3])
    for (let r = row(boxes[4 * k + 1]); r <= r1; r++) {
      for (let c = c0; c <= c1; c++) start[r * cols + c + 1]++
    }
  }
  for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c]
  const members = new Int32Array(start[cols * rows])
  const fill = start.slice(0, cols * rows)
  for (let k = 0; k < count; k++) {
    const c0 = col(boxes[4 * k])
    const c1 = col(boxes[4 * k + 2])
    const r1 = row(boxes[4 * k + 3])
    for (let r = row(boxes[4 * k + 1]); r <= r1; r++) {
      for (let c = c0; c <= c1; c++) members[fill[r * cols + c]++] = k
    }
  }

  const keys: number[] = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const from = start[r * cols + c]
      const to = start[r * cols + c + 1]
      for (let a = from; a < to; a++) {
        const i = members[a]
        for (let b = a + 1; b < to; b++) {
          const j = members[b]
          if (!boxesOverlap(boxes, i, j)) continue
          const ox = Math.max(boxes[4 * i], boxes[4 * j])
          const oy = Math.max(boxes[4 * i + 1], boxes[4 * j + 1])
          if (col(ox) === c && row(oy) === r) keys.push(i * count + j)
        }
      }
    }
  }
  const sorted = Float64Array.from(keys).toSorted()
  const out = new Int32Array(2 * sorted.length)
  for (let p = 0; p < sorted.length; p++) {
    const i = Math.floor(sorted[p] / count)
    out[2 * p] = i
    out[2 * p + 1] = sorted[p] - i * count
  }
  return out
}

// ---------------------------------------------------------------------------
// Narrow phase
// ---------------------------------------------------------------------------

/** Exempt piece pairs of the segment pair under test (up to four), and their count. */
const exempt = new Int32Array(8)
let exemptCount = 0
/** The pieces {@link outlinesCross} found meeting. */
let hitA = 0
let hitB = 0
/** Block boxes of the second run, grown as needed. */
let blocks = new Float64Array(16)
const blockA = new Float64Array(4)

function touch(ax: number, ay: number, bx: number, by: number): boolean {
  return Math.abs(ax - bx) < EPS && Math.abs(ay - by) < EPS
}

function addExempt(a: number, b: number): void {
  exempt[2 * exemptCount] = a
  exempt[2 * exemptCount + 1] = b
  exemptCount++
}

function isExempt(a: number, b: number): boolean {
  for (let e = 0; e < exemptCount; e++) {
    if (exempt[2 * e] === a && exempt[2 * e + 1] === b) return true
  }
  return false
}

/**
 * Whether two runs meet: the `ni` pieces from point `pi` and the `nj` pieces
 * from point `pj` of `xy`, skipping the exempt piece pairs. Pieces are taken
 * in blocks of {@link BLK} with a box each, in order, and the first pair found
 * is left in `hitA`, `hitB`.
 */
function outlinesCross(xy: Float64Array, pi: number, ni: number, pj: number, nj: number): boolean {
  const nb = Math.ceil(nj / BLK)
  if (blocks.length < 4 * nb) blocks = new Float64Array(4 * nb)
  for (let b = 0; b < nb; b++)
    runBox(xy, pj + b * BLK, pj + Math.min(b * BLK + BLK, nj), blocks, 4 * b)
  for (let a0 = 0; a0 < ni; a0 += BLK) {
    const a1 = Math.min(a0 + BLK, ni)
    runBox(xy, pi + a0, pi + a1, blockA, 0)
    for (let blk = 0; blk < nb; blk++) {
      if (
        blockA[0] > blocks[4 * blk + 2] ||
        blocks[4 * blk] > blockA[2] ||
        blockA[1] > blocks[4 * blk + 3] ||
        blocks[4 * blk + 1] > blockA[3]
      ) {
        continue
      }
      const b0 = blk * BLK
      const b1 = Math.min(b0 + BLK, nj)
      for (let a = a0; a < a1; a++) {
        const p = 2 * (pi + a)
        const p1x = xy[p]
        const p1y = xy[p + 1]
        const p2x = xy[p + 2]
        const p2y = xy[p + 3]
        for (let b = b0; b < b1; b++) {
          if (exemptCount > 0 && isExempt(a, b)) continue
          const q = 2 * (pj + b)
          const q1x = xy[q]
          const q1y = xy[q + 1]
          const q2x = xy[q + 2]
          const q2y = xy[q + 3]
          // Pieces whose boxes are apart cannot meet.
          if (
            Math.max(p1x, p2x) < Math.min(q1x, q2x) ||
            Math.max(q1x, q2x) < Math.min(p1x, p2x) ||
            Math.max(p1y, p2y) < Math.min(q1y, q2y) ||
            Math.max(q1y, q2y) < Math.min(p1y, p2y)
          ) {
            continue
          }
          if (segmentsIntersect(p1x, p1y, p2x, p2y, q1x, q1y, q2x, q2y)) {
            hitA = a
            hitB = b
            return true
          }
        }
      }
    }
  }
  return false
}

/**
 * Where the pieces `a–b` and `c–d`, known to meet, meet: their lines'
 * intersection `a + t·(b − a)`, `t = ((c − a) × (d − c)) / ((b − a) × (d − c))`
 * clamped to `[0, 1]`; or, when they are parallel (`|(b − a) × (d − c)| ≤ 1e-18`),
 * the midpoint of the middle two of the four end points along `b − a`, which
 * lies on the stretch they share.
 */
function meet(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): [number, number] {
  const rx = bx - ax
  const ry = by - ay
  const sx = dx - cx
  const sy = dy - cy
  const den = rx * sy - ry * sx
  if (Math.abs(den) > 1e-18) {
    const t = Math.min(1, Math.max(0, ((cx - ax) * sy - (cy - ay) * sx) / den))
    return [ax + t * rx, ay + t * ry]
  }
  const xs = [ax, bx, cx, dx]
  const ys = [ay, by, cy, dy]
  const along = xs.map((x, k) => x * rx + ys[k] * ry)
  const order = [0, 1, 2, 3].toSorted((p, q) =>
    along[p] < along[q] ? -1 : along[p] > along[q] ? 1 : 0,
  )
  return [0.5 * (xs[order[1]] + xs[order[2]]), 0.5 * (ys[order[1]] + ys[order[2]])]
}

/** A pair of segments of one flattened path that cross (`i ≤ j`), and where. */
export interface PathCrossing {
  i: number
  j: number
  x: number
  y: number
}

/**
 * Every pair of segments of `path` that cross, up to `limit` pairs, each with
 * where it crosses: `(i, j)`, `i ≤ j`, in order of `i`, then `j`.
 *
 * A cubic that loops on itself is the pair `(i, i)` at its midpoint `B(½)`.
 * Two different segments cross when a piece of one meets a piece of the other
 * ({@link segmentsIntersect}), except the pieces that meet where the two
 * segments join: for each pairing of their end points that coincide (within
 * {@link EPS} on both axes), the two pieces at that point. Where they cross is
 * where the first two pieces found to meet do. `accept`, when given, limits
 * the test to the pairs it accepts (`(i, i)` for a loop).
 *
 * On an edge's own flattening this is the edge's self-crossings, its end
 * points meeting where a closed edge or a loop at one node closes; on a
 * {@link ringPath} it is the ring's.
 */
export function selfCrossings(
  path: FlatPath,
  limit = CROSSING_LIMIT,
  accept?: (i: number, j: number) => boolean,
): PathCrossing[] {
  const found: PathCrossing[] = []
  const n = path.count
  if (n === 0 || limit <= 0) return found
  const { xy, offsets } = path
  const pairs = boxPairs(path.boxes, n)
  let p = 0
  for (let i = 0; i < n; i++) {
    if (path.loops[i] === 1 && (accept === undefined || accept(i, i))) {
      found.push({ i, j: i, x: path.loopAt[2 * i], y: path.loopAt[2 * i + 1] })
      if (found.length >= limit) return found
    }
    for (; p < pairs.length && pairs[p] === i; p += 2) {
      const j = pairs[p + 1]
      if (accept !== undefined && !accept(i, j)) continue
      const pi = offsets[i]
      const ni = offsets[i + 1] - pi - 1
      const pj = offsets[j]
      const nj = offsets[j + 1] - pj - 1
      const si = 2 * pi
      const ei = 2 * (pi + ni)
      const sj = 2 * pj
      const ej = 2 * (pj + nj)
      exemptCount = 0
      if (touch(xy[ei], xy[ei + 1], xy[sj], xy[sj + 1])) addExempt(ni - 1, 0)
      if (touch(xy[ej], xy[ej + 1], xy[si], xy[si + 1])) addExempt(0, nj - 1)
      if (touch(xy[si], xy[si + 1], xy[sj], xy[sj + 1])) addExempt(0, 0)
      if (touch(xy[ei], xy[ei + 1], xy[ej], xy[ej + 1])) addExempt(ni - 1, nj - 1)
      const hit = outlinesCross(xy, pi, ni, pj, nj)
      exemptCount = 0
      if (!hit) continue
      const a = 2 * (pi + hitA)
      const b = 2 * (pj + hitB)
      const [x, y] = meet(
        xy[a],
        xy[a + 1],
        xy[a + 2],
        xy[a + 3],
        xy[b],
        xy[b + 1],
        xy[b + 2],
        xy[b + 3],
      )
      found.push({ i, j, x, y })
      if (found.length >= limit) return found
    }
  }
  return found
}

/** A crossing between segment `a` of one edge and segment `b` of another, and where. */
export interface EdgeCrossing {
  a: number
  b: number
  x: number
  y: number
}

/**
 * Where two different edges' fits cross, up to `limit` pairs: the
 * {@link selfCrossings} of the two as one path, keeping only pairs with one
 * segment from each, so a node they share is exempt where they merely meet
 * there and caught where a piece further on crosses back. `a` and `b` are
 * {@link flattenEdge} results, in their stored directions.
 */
export function edgeCrossings(a: FlatPath, b: FlatPath, limit = CROSSING_LIMIT): EdgeCrossing[] {
  const both = ringPath({ edges: [0, 1], reversed: [false, false], outer: true }, [a, b])
  return selfCrossings(both, limit, (i, j) => both.edge[i] !== both.edge[j]).map((c) => ({
    a: c.i,
    b: c.j - a.count,
    x: c.x,
    y: c.y,
  }))
}

/** A crossing in a face ring, with the edge and own-fit segment index of both sides. */
export interface RingCrossing extends PathCrossing {
  edgeI: number
  segmentI: number
  edgeJ: number
  segmentJ: number
}

/** Options of {@link ringCrossings} and {@link locatedCrossings}. */
export interface CrossingOptions {
  /** Pairs reported per ring at most; {@link CROSSING_LIMIT} by default. */
  limit?: number
  /** Test only pairs with a segment of this edge (a ring made simple, then this edge swapped in). */
  touching?: number
}

/**
 * The crossings of one face ring walked over its edges ({@link ringPath},
 * {@link selfCrossings}), each named by both segments' edges and their indices
 * in those edges' own fits.
 */
export function ringCrossings(
  ring: FaceRing,
  flats: readonly FlatPath[],
  options: CrossingOptions = {},
): RingCrossing[] {
  const path = ringPath(ring, flats)
  const k = options.touching
  const accept =
    k === undefined ? undefined : (i: number, j: number) => path.edge[i] === k || path.edge[j] === k
  return selfCrossings(path, options.limit ?? CROSSING_LIMIT, accept).map((c) => ({
    i: c.i,
    j: c.j,
    x: c.x,
    y: c.y,
    edgeI: path.edge[c.i],
    segmentI: path.segment[c.i],
    edgeJ: path.edge[c.j],
    segmentJ: path.segment[c.j],
  }))
}

/** One side of a crossing: an edge, the segment of its own fit that crosses, and where. */
export interface CrossingHit {
  edge: number
  segment: number
  x: number
  y: number
}

/**
 * Each side of every crossing in `rings`, sorted by edge, then segment, then
 * `x` (ties in ring order): what a repair reads to decide which edges are
 * guilty and where to pin each. With `changed`, only rings walking one of
 * those edges are tested — after a round of refits no other ring can have
 * changed. A loop is listed twice, once per side.
 */
export function locatedCrossings(
  rings: readonly FaceRing[],
  flats: readonly FlatPath[],
  options: CrossingOptions & { changed?: ReadonlySet<number> } = {},
): CrossingHit[] {
  const { changed } = options
  const hits: CrossingHit[] = []
  for (const ring of rings) {
    if (changed !== undefined && !ring.edges.some((k) => changed.has(k))) continue
    for (const c of ringCrossings(ring, flats, options)) {
      hits.push({ edge: c.edgeI, segment: c.segmentI, x: c.x, y: c.y })
      hits.push({ edge: c.edgeJ, segment: c.segmentJ, x: c.x, y: c.y })
    }
  }
  return hits.toSorted((a, b) => a.edge - b.edge || a.segment - b.segment || a.x - b.x)
}
