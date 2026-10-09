/**
 * The boundary solve's fold guard: no self-crossing the solve made survives it,
 * and only the boundaries taking part in one give up any of their
 * displacement.
 *
 * **The rule** ({@link foldGuard}). Each edge `k` carries a scale `s_k`,
 * starting at 1; an unknown `v` sits at `p⁰_v + σ_v·(p_v − p⁰_v)` with
 * `σ_v = min s_k` over the edges it belongs to, so a junction follows the most
 * cautious of its edges and an edge at scale 0 is exactly where it started,
 * ends included. While some pair of segments crosses that did not cross at the
 * start, the scale of every edge with a segment in such a pair is halved, from
 * ½ down to 1/16 and then to 0. A face ring whose signed area changed sign
 * counts as well, and every edge of it is halved: the two sides of a sliver
 * pulled through each other leave a simple ring of the opposite winding,
 * which crosses nothing (inkvec's guard counts crossings only). Every round
 * lowers at least one scale, and a pair whose two edges are both at 0 is the
 * start's own, as is a ring whose edges are, so the loop ends with no new
 * crossing and no ring turned inside out after at most six rounds per edge;
 * the solve is never discarded. Crossings already there at the start may stay. Inspired by
 * J. Smith, S. Schaefer 2015, "Bijective parameterization with free
 * boundaries", ACM TOG 34(4), and M. Li et al. 2020, "Incremental potential
 * contact", ACM TOG 39(4), which never let two boundary elements pass through
 * each other, deciding it per pair; here once, after the solve, since the
 * energy has no barrier (the two sides of a thin ribbon are meant to approach).
 *
 * **What counts** ({@link FoldCounter}). A segment is bucketed at a position
 * when its cell range spans `(x1 − x0)·(y1 − y0) ≤ 64`; two segments are
 * counted when both are bucketed, their cell ranges overlap on both axes, they
 * share no unknown, and {@link segmentsCross} holds (a proper crossing, or a
 * touch: an end on the other segment, a collinear overlap). The cell range of
 * a segment with ends `p`, `q` is `⌊min x⌋ − 1 … ⌈max x⌉`, likewise in y (the
 * pixel indices inkvec's half-integer frame gives, shifted to Trazor's).
 *
 * **The join.** After J. Dittrich, B. Seeger 2000, "Data redundancy and
 * duplicate detection in spatial join processing", ICDE: every segment is
 * entered in each cell of a coarse grid its range touches, the candidates of a
 * grid cell are compared pairwise, and a pair is reported only in the cell
 * holding the reference point of the two ranges' intersection (its low
 * corner), so each pair once. The ranges are swept over every position the
 * guard asks about (each point anywhere on the segment from its start to its
 * solution) and grown by one cell, so one candidate list serves every round,
 * and each round re-applies the exact per-position test.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt/folds.rs` and
 * `inkvec-trace/src/boundary_opt.rs` (`segments_cross`, `fold_guard_local`).
 */
import { orient2d } from '../fit/crossings'
import { faceRings } from '../planar/rings'
import type { FaceRing, PlanarMap } from '../planar/types'
import type { Unknowns } from './band'

/**
 * Side of the coarse join grid, in pixel cells: about the length of a swept
 * segment's range, so most ranges touch one to four coarse cells.
 */
export const COARSE = 4
/** A swept range over more coarse cells than this is paired with every segment directly. */
export const MAX_COARSE_CELLS = 64
/** Segments whose cell range spans more than this many cells are never counted. */
export const MAX_RANGE_AREA = 64

/**
 * Whether the segments `ab` and `cd` cross, other than by sharing an end: a
 * proper crossing (each separates the other's ends, by the exact `orient2d`),
 * or a touch, an end lying on the other segment (a T, coinciding ends, a
 * collinear overlap where the boundary folds back along itself).
 */
export function segmentsCross(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  dx: number,
  dy: number,
): boolean {
  const d1 = orient2d(ax, ay, bx, by, cx, cy)
  const d2 = orient2d(ax, ay, bx, by, dx, dy)
  const d3 = orient2d(cx, cy, dx, dy, ax, ay)
  const d4 = orient2d(cx, cy, dx, dy, bx, by)
  if (d1 > 0 !== d2 > 0 && d3 > 0 !== d4 > 0 && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0) {
    return true
  }
  return (
    (d1 === 0 && onSegment(ax, ay, bx, by, cx, cy)) ||
    (d2 === 0 && onSegment(ax, ay, bx, by, dx, dy)) ||
    (d3 === 0 && onSegment(cx, cy, dx, dy, ax, ay)) ||
    (d4 === 0 && onSegment(cx, cy, dx, dy, bx, by))
  )
}

/** Whether `r`, collinear with `p–q`, lies within the segment's box (10⁻¹² slack). */
function onSegment(
  px: number,
  py: number,
  qx: number,
  qy: number,
  rx: number,
  ry: number,
): boolean {
  return (
    rx >= Math.min(px, qx) - 1e-12 &&
    rx <= Math.max(px, qx) + 1e-12 &&
    ry >= Math.min(py, qy) - 1e-12 &&
    ry <= Math.max(py, qy) + 1e-12
  )
}

/** The boundary's segments as pairs of unknowns, in edge order, and the edge of each. */
export interface Segments {
  readonly count: number
  readonly a: Int32Array
  readonly b: Int32Array
  readonly edge: Int32Array
}

/** Every segment of every edge of `map` (closed edges wrap round), in edge order. */
export function boundarySegments(map: PlanarMap, u: Unknowns): Segments {
  let count = 0
  for (let k = 0; k < map.edges.length; k++) {
    const n = u.of[k].length
    if (n >= 2) count += map.edges[k].closed ? n : n - 1
  }
  const a = new Int32Array(count)
  const b = new Int32Array(count)
  const edge = new Int32Array(count)
  let s = 0
  for (let k = 0; k < map.edges.length; k++) {
    const ids = u.of[k]
    const n = ids.length
    if (n < 2) continue
    const last = map.edges[k].closed ? n : n - 1
    for (let i = 0; i < last; i++) {
      a[s] = ids[i]
      b[s] = i + 1 === n ? ids[0] : ids[i + 1]
      edge[s] = k
      s++
    }
  }
  return { count, a, b, edge }
}

/** The cell range `[x0, x1, y0, y1]` of segment `s` at `pos`, into `out[4s ..]`. */
function cellRange(segs: Segments, s: number, pos: Float64Array, out: Float64Array): void {
  const u = segs.a[s]
  const v = segs.b[s]
  const px = pos[2 * u]
  const py = pos[2 * u + 1]
  const qx = pos[2 * v]
  const qy = pos[2 * v + 1]
  out[4 * s] = Math.floor(Math.min(px, qx)) - 1
  out[4 * s + 1] = Math.ceil(Math.max(px, qx))
  out[4 * s + 2] = Math.floor(Math.min(py, qy)) - 1
  out[4 * s + 3] = Math.ceil(Math.max(py, qy))
}

/** Whether the ranges `r[4i ..]` and `q[4j ..]` share a cell. */
function overlap(r: Float64Array, i: number, q: Float64Array, j: number): boolean {
  return (
    r[4 * i] <= q[4 * j + 1] &&
    q[4 * j] <= r[4 * i + 1] &&
    r[4 * i + 2] <= q[4 * j + 3] &&
    q[4 * j + 2] <= r[4 * i + 3]
  )
}

/**
 * The pairs of segments that can cross anywhere between two sets of positions,
 * found once; {@link newCrossings} then finds the new crossings at any position
 * in between.
 */
export class FoldCounter {
  readonly segments: Segments
  /** Candidate pairs, flat `i, j` with `i < j`. */
  private readonly cand: Int32Array
  private readonly r0: Float64Array
  private readonly r1: Float64Array
  private readonly ok0: Uint8Array
  private readonly ok1: Uint8Array

  /**
   * Candidates for every position whose point `v` is `a_v + s_v·(b_v − a_v)`
   * for any `s_v ∈ [0, 1]`: such a point lies in the box of its two ends, so a
   * segment's cell range there lies inside the union of its ranges at `a` and
   * `b` grown by one cell (the rounding margin, many times over).
   */
  constructor(map: PlanarMap, u: Unknowns, a: Float64Array, b: Float64Array) {
    const segs = boundarySegments(map, u)
    this.segments = segs
    const n = segs.count
    const ra = new Float64Array(4 * n)
    const rb = new Float64Array(4 * n)
    const swept = new Float64Array(4 * n)
    for (let s = 0; s < n; s++) {
      cellRange(segs, s, a, ra)
      cellRange(segs, s, b, rb)
      swept[4 * s] = Math.min(ra[4 * s], rb[4 * s]) - 1
      swept[4 * s + 1] = Math.max(ra[4 * s + 1], rb[4 * s + 1]) + 1
      swept[4 * s + 2] = Math.min(ra[4 * s + 2], rb[4 * s + 2]) - 1
      swept[4 * s + 3] = Math.max(ra[4 * s + 3], rb[4 * s + 3]) + 1
    }
    this.cand = candidates(segs, swept)
    this.r0 = new Float64Array(4 * n)
    this.r1 = new Float64Array(4 * n)
    this.ok0 = new Uint8Array(n)
    this.ok1 = new Uint8Array(n)
  }

  /** The number of crossing pairs at `pos` (the module comment's rule). */
  count(pos: Float64Array): number {
    this.ranges(pos, this.r1, this.ok1)
    let total = 0
    const c = this.cand
    for (let k = 0; k < c.length; k += 2) {
      if (this.counted(this.r1, this.ok1, pos, c[k], c[k + 1])) total++
    }
    return total
  }

  /**
   * The pairs that count as a crossing at `pos` but did not at `start`: the
   * folds the solve made, each once, as flat segment indices `i, j`. `pos` must
   * lie on the path the counter was built for.
   */
  newCrossings(start: Float64Array, pos: Float64Array): Int32Array {
    this.ranges(start, this.r0, this.ok0)
    this.ranges(pos, this.r1, this.ok1)
    const c = this.cand
    const out: number[] = []
    for (let k = 0; k < c.length; k += 2) {
      const i = c[k]
      const j = c[k + 1]
      if (
        this.counted(this.r1, this.ok1, pos, i, j) &&
        !this.counted(this.r0, this.ok0, start, i, j)
      ) {
        out.push(i, j)
      }
    }
    return Int32Array.from(out)
  }

  /** Each segment's cell range at `pos`, and whether it is small enough to count. */
  private ranges(pos: Float64Array, r: Float64Array, ok: Uint8Array): void {
    for (let s = 0; s < this.segments.count; s++) {
      cellRange(this.segments, s, pos, r)
      const area = (r[4 * s + 1] - r[4 * s]) * (r[4 * s + 3] - r[4 * s + 2])
      ok[s] = area <= MAX_RANGE_AREA ? 1 : 0
    }
  }

  private counted(
    r: Float64Array,
    ok: Uint8Array,
    pos: Float64Array,
    i: number,
    j: number,
  ): boolean {
    if (!ok[i] || !ok[j] || !overlap(r, i, r, j)) return false
    const s = this.segments
    const p = s.a[i]
    const q = s.b[i]
    const t = s.a[j]
    const v = s.b[j]
    return segmentsCross(
      pos[2 * p],
      pos[2 * p + 1],
      pos[2 * q],
      pos[2 * q + 1],
      pos[2 * t],
      pos[2 * t + 1],
      pos[2 * v],
      pos[2 * v + 1],
    )
  }
}

/**
 * Pairs `i < j` whose ranges overlap and whose segments share no unknown, each
 * once, by a coarse-grid join with reference-point duplicate avoidance; the few
 * ranges too large for the grid are paired with everything directly.
 */
function candidates(segs: Segments, range: Float64Array): Int32Array {
  const n = segs.count
  const share = (i: number, j: number): boolean => {
    const a = segs.a[i]
    const b = segs.b[i]
    const c = segs.a[j]
    const d = segs.b[j]
    return a === c || a === d || b === c || b === d
  }
  const coarse = new Float64Array(4 * n)
  for (let k = 0; k < 4 * n; k++) coarse[k] = Math.floor(range[k] / COARSE)
  const big: number[] = []
  const small: number[] = []
  let gx0 = Infinity
  let gx1 = -Infinity
  let gy0 = Infinity
  let gy1 = -Infinity
  for (let i = 0; i < n; i++) {
    const cells =
      (coarse[4 * i + 1] - coarse[4 * i] + 1) * (coarse[4 * i + 3] - coarse[4 * i + 2] + 1)
    if (!(cells > 0 && cells <= MAX_COARSE_CELLS)) {
      big.push(i)
      continue
    }
    small.push(i)
    gx0 = Math.min(gx0, coarse[4 * i])
    gx1 = Math.max(gx1, coarse[4 * i + 1])
    gy0 = Math.min(gy0, coarse[4 * i + 2])
    gy1 = Math.max(gy1, coarse[4 * i + 3])
  }
  const out: number[] = []
  if (small.length > 0) {
    const gw = gx1 - gx0 + 1
    const gh = gy1 - gy0 + 1
    // Counting sort of (cell, segment) entries into a compressed row layout.
    const start = new Int32Array(gw * gh + 1)
    for (const i of small) {
      for (let y = coarse[4 * i + 2]; y <= coarse[4 * i + 3]; y++) {
        for (let x = coarse[4 * i]; x <= coarse[4 * i + 1]; x++)
          start[(y - gy0) * gw + (x - gx0) + 1]++
      }
    }
    for (let k = 0; k < gw * gh; k++) start[k + 1] += start[k]
    const fill = start.slice()
    const list = new Int32Array(start[gw * gh])
    for (const i of small) {
      for (let y = coarse[4 * i + 2]; y <= coarse[4 * i + 3]; y++) {
        for (let x = coarse[4 * i]; x <= coarse[4 * i + 1]; x++)
          list[fill[(y - gy0) * gw + (x - gx0)]++] = i
      }
    }
    for (let y = gy0; y <= gy1; y++) {
      for (let x = gx0; x <= gx1; x++) {
        const k = (y - gy0) * gw + (x - gx0)
        for (let ai = start[k]; ai < start[k + 1]; ai++) {
          const a = list[ai]
          for (let bi = ai + 1; bi < start[k + 1]; bi++) {
            const b = list[bi]
            // The reference point: the low corner of the two coarse ranges'
            // intersection. Only the cell holding it reports the pair.
            if (
              Math.max(coarse[4 * a], coarse[4 * b]) !== x ||
              Math.max(coarse[4 * a + 2], coarse[4 * b + 2]) !== y
            ) {
              continue
            }
            if (!overlap(range, a, range, b) || share(a, b)) continue
            out.push(Math.min(a, b), Math.max(a, b))
          }
        }
      }
    }
  }
  for (let bi = 0; bi < big.length; bi++) {
    const a = big[bi]
    for (const b of small) {
      if (overlap(range, a, range, b) && !share(a, b)) out.push(Math.min(a, b), Math.max(a, b))
    }
    for (let bj = bi + 1; bj < big.length; bj++) {
      const b = big[bj]
      if (overlap(range, a, range, b) && !share(a, b)) out.push(Math.min(a, b), Math.max(a, b))
    }
  }
  return Int32Array.from(out)
}

/**
 * Twice the signed area a face ring encloses with its points at `pos`
 * (unknown positions, interleaved), walked as the ring walks its edges. An
 * open edge's last point is the next edge's first (one node unknown), so the
 * walk closes on itself; a closed edge closes back to its own first point.
 */
function ringArea(
  map: PlanarMap,
  ring: FaceRing,
  of: readonly Int32Array[],
  pos: Float64Array,
): number {
  let a = 0
  for (let t = 0; t < ring.edges.length; t++) {
    const k = ring.edges[t]
    const ids = of[k]
    const m = ids.length
    const rev = ring.reversed[t]
    const steps = map.edges[k].closed ? m : m - 1
    for (let i = 0; i < steps; i++) {
      const p = ids[rev ? m - 1 - i : i]
      const q = ids[rev ? (2 * m - 2 - i) % m : (i + 1) % m]
      a += pos[2 * p] * pos[2 * q + 1] - pos[2 * q] * pos[2 * p + 1]
    }
  }
  return a
}

/** The fold guard's result: the positions it keeps and the share of the displacement kept. */
export interface FoldGuardResult {
  /** Every unknown's position, interleaved `x, y`. */
  pos: Float64Array
  /** `Σ_v σ_v·|p_v − p⁰_v| / Σ_v |p_v − p⁰_v|`, 1 when nothing was backed off. */
  scale: number
  /** Rounds of halving taken. */
  rounds: number
  /** Edges whose scale ended below 1. */
  backedOff: number
}

/**
 * Back off, by halves and at most to where they started, only the boundaries
 * that take part in a crossing the solve made (the module comment's rule);
 * every other boundary keeps its solution. `solved` is every unknown's solved
 * position, `u.start` the start.
 */
export function foldGuard(map: PlanarMap, u: Unknowns, solved: Float64Array): FoldGuardResult {
  const n = u.count
  const start = u.start
  const folds = new FoldCounter(map, u, start, solved)
  const segEdge = folds.segments.edge
  const ne = map.edges.length
  const scale = new Float64Array(ne).fill(1)
  const hit = new Uint8Array(ne)
  const sigma = new Float64Array(n)
  const cur = solved.slice()
  const rings = faceRings(map).flat()
  const area0 = rings.map((r) => ringArea(map, r, u.of, start))
  let rounds = 0
  for (;;) {
    const bad = folds.newCrossings(start, cur)
    hit.fill(0)
    for (let k = 0; k < bad.length; k++) hit[segEdge[bad[k]]] = 1
    let flipped = false
    for (let i = 0; i < rings.length; i++) {
      if (area0[i] === 0 || area0[i] * ringArea(map, rings[i], u.of, cur) > 0) continue
      flipped = true
      for (const k of rings[i].edges) hit[k] = 1
    }
    if (bad.length === 0 && !flipped) break
    rounds++
    for (let k = 0; k < ne; k++) if (hit[k]) scale[k] = scale[k] > 1 / 16 ? scale[k] * 0.5 : 0
    // σ_v = the smallest scale of the edges v belongs to.
    sigma.fill(1)
    for (let k = 0; k < ne; k++) {
      const ids = u.of[k]
      for (let i = 0; i < ids.length; i++) sigma[ids[i]] = Math.min(sigma[ids[i]], scale[k])
    }
    for (let v = 0; v < n; v++) {
      cur[2 * v] = start[2 * v] + (solved[2 * v] - start[2 * v]) * sigma[v]
      cur[2 * v + 1] = start[2 * v + 1] + (solved[2 * v + 1] - start[2 * v + 1]) * sigma[v]
    }
  }
  let kept = 0
  let total = 0
  for (let v = 0; v < n; v++) {
    total += Math.hypot(solved[2 * v] - start[2 * v], solved[2 * v + 1] - start[2 * v + 1])
    kept += Math.hypot(cur[2 * v] - start[2 * v], cur[2 * v + 1] - start[2 * v + 1])
  }
  let backedOff = 0
  for (let k = 0; k < ne; k++) if (scale[k] < 1) backedOff++
  return { pos: cur, scale: total > 0 ? kept / total : 1, rounds, backedOff }
}
