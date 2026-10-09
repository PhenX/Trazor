/**
 * The planar map of a face map: every boundary between two faces stored once, as an edge both
 * faces reference, and a node wherever three or more faces meet. Topology is read off the
 * integer face ids and is exact; the later stages move points without changing who is
 * adjacent to whom.
 *
 * 1. **Cracks from runs.** Each row is coded as its maximal runs of one face; every pixel side
 *    between two faces (a crack, the 1-cell between two pixels) is read off the runs as a unit
 *    segment between two lattice nodes, with the face on its left and on its right. Vertical
 *    cracks sit at run starts and the frame; horizontal ones where the runs of two consecutive
 *    rows overlap with different faces, and along the frame. Beyond the frame is
 *    {@link OUTSIDE}, so a face touching the border still closes.
 * 2. **Saddles.** Where four pixels meet at a corner and exactly one diagonal is a single face,
 *    the two faces on the other diagonal are cut apart there: one of them takes a copy of the
 *    corner, one whole lattice further on, for its two segments, so each passes through a point
 *    of its own instead of both being welded at one junction (the bowtie).
 * 3. **Incidence.** Both ends of every segment, stable-sorted by node id with a radix sort, so
 *    each node lists its segments in segment order and a walk steps from a segment to the list
 *    at its far node in O(1).
 * 4. **Walks.** From every junction (a node not passed through by exactly two segments), in
 *    increasing node id, each unused segment is followed through the pass-through nodes to the
 *    next junction: one open edge. Whatever is left are loops with no junction: closed edges.
 * 5. **Nodes.** Every junction that ends an edge becomes a {@link PlanarNode}, numbered in
 *    increasing lattice id, with its edge ends in counter-clockwise order.
 *
 * Coordinates: lattice node `(i, j)` is the top-left corner of pixel `(i, j)`, at `(i, j)`.
 * inkvec puts pixel centres on integers, so its node `(i, j)` sits at `(i − ½, j − ½)`; every
 * position here is inkvec's shifted by `+½`.
 *
 * Method from He, Chao & Suzuki 2008 ("A Run-Based Two-Scan Labeling Algorithm", IEEE TIP
 * 17(5)) for the rows as runs, Kovalevsky 1989 for cracks as 1-cells, and Knuth, TAOCP vol. 3
 * §5.2.5, for the least-significant-digit radix sort.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/planar.rs` (`build`, `split_saddle_corners`,
 * `walk_open_chains`, `walk_closed_loops`), `inkvec-trace/src/planar/cracks.rs`
 * (`dual_segments`, `Incidence`, `radix_sort_by_node`), `inkvec-trace/src/planar/runs.rs`
 * (`RowRuns`, `overlaps`) and `inkvec-trace/src/planar/junctions.rs` (`node_position`).
 */
import { OUTSIDE } from './types'
import type { Faces, PlanarEdge, PlanarMap, PlanarNode } from './types'

/** A growable `Int32Array`. */
class IntList {
  data: Int32Array
  length = 0

  constructor(capacity: number) {
    this.data = new Int32Array(Math.max(16, capacity))
  }

  push(v: number): void {
    if (this.length === this.data.length) this.grow()
    this.data[this.length++] = v
  }

  /** Append one crack: its nodes and the faces on its left and right. */
  pushSegment(a: number, b: number, left: number, right: number): void {
    if (this.length + 4 > this.data.length) this.grow()
    const d = this.data
    const at = this.length
    d[at] = a
    d[at + 1] = b
    d[at + 2] = left
    d[at + 3] = right
    this.length = at + 4
  }

  private grow(): void {
    const grown = new Int32Array(this.data.length * 2)
    grown.set(this.data)
    this.data = grown
  }
}

/**
 * Every row as its maximal runs of one face: run `r` covers pixels `x0[r] .. x1[r]` (exclusive)
 * of its row, all of face `face[r]`; row `y`'s runs are `start[y] .. start[y + 1]`, in increasing
 * `x`, and two consecutive runs of a row carry different faces.
 */
interface RowRuns {
  x0: Int32Array
  x1: Int32Array
  face: Int32Array
  start: Int32Array
  /** Per row, 1 when its faces equal the row above's exactly (0 for row 0). */
  sameAsAbove: Uint8Array
}

function rowRuns(ids: Int32Array, w: number, h: number): RowRuns {
  let count = 0
  if (w > 0) {
    for (let y = 0; y < h; y++) {
      const row = y * w
      count++
      for (let x = 1; x < w; x++) if (ids[row + x] !== ids[row + x - 1]) count++
    }
  }
  const x0 = new Int32Array(count)
  const x1 = new Int32Array(count)
  const face = new Int32Array(count)
  const start = new Int32Array(h + 1)
  const sameAsAbove = new Uint8Array(h)
  let r = 0
  for (let y = 0; y < h; y++) {
    const row = y * w
    start[y] = r
    let x = 0
    while (x < w) {
      const f = ids[row + x]
      const s = x
      x++
      while (x < w && ids[row + x] === f) x++
      x0[r] = s
      x1[r] = x
      face[r] = f
      r++
    }
    if (y > 0) {
      // Two rows carry the same faces exactly when their run lists are equal.
      const a = start[y - 1]
      const len = r - start[y]
      let same = len === start[y] - a
      for (let k = 0; same && k < len; k++) {
        same = x1[a + k] === x1[start[y] + k] && face[a + k] === face[start[y] + k]
      }
      sameAsAbove[y] = same ? 1 : 0
    }
  }
  start[h] = r
  return { x0, x1, face, start, sameAsAbove }
}

/** Lattice node id of corner `(i, j)`: `j·(w + 1) + i`. A saddle copy adds one whole lattice. */
function nodeId(i: number, j: number, w: number): number {
  return j * (w + 1) + i
}

/** Face of pixel `(x, y)`, {@link OUTSIDE} beyond the frame. */
function faceAt(ids: Int32Array, w: number, h: number, x: number, y: number): number {
  return x < 0 || y < 0 || x >= w || y >= h ? OUTSIDE : ids[y * w + x]
}

/**
 * Every crack, as a unit segment `[a, b, left, right]` (interleaved, four per segment): nodes
 * `a → b`, and the faces on the left and the right walking from `a` to `b` in the y-down frame
 * (screen view), {@link OUTSIDE} beyond the frame.
 *
 * Order: the vertical cracks row by row, then the horizontal ones node row by node row, each
 * left to right — the order a pixel scan of the sides visits them in, which fixes the order of
 * each node's segments and so the walks' output.
 *
 * - Vertical crack `(i, j) → (i, j + 1)` separates pixel `(i − 1, j)` from `(i, j)`; walking down,
 *   `(i, j)` is on the left. Row `j` has one at its left border, one at every run start
 *   `x0 > 0`, and one at its right border.
 * - Horizontal crack `(i, j) → (i + 1, j)` separates pixel `(i, j − 1)` from `(i, j)`; walking
 *   right, the pixel above is on the left. Node rows `0` and `h` have one under (over) every
 *   pixel of the first (last) row; an inner node row has one per pixel of every overlap of the
 *   two rows' runs whose faces differ, and none at all between two equal rows.
 */
function dualSegments(runs: RowRuns, w: number, h: number): { segs: Int32Array; count: number } {
  const out = new IntList(4 * (2 * runs.face.length + 2 * w + 2 * h))
  const { x0, x1, face, start, sameAsAbove } = runs
  if (w > 0 && h > 0) {
    for (let j = 0; j < h; j++) {
      const s = start[j]
      const e = start[j + 1]
      out.pushSegment(nodeId(0, j, w), nodeId(0, j + 1, w), face[s], OUTSIDE)
      for (let r = s + 1; r < e; r++) {
        out.pushSegment(nodeId(x0[r], j, w), nodeId(x0[r], j + 1, w), face[r], face[r - 1])
      }
      out.pushSegment(nodeId(w, j, w), nodeId(w, j + 1, w), OUTSIDE, face[e - 1])
    }

    for (let r = start[0]; r < start[1]; r++) {
      for (let i = x0[r]; i < x1[r]; i++) {
        out.pushSegment(nodeId(i, 0, w), nodeId(i + 1, 0, w), OUTSIDE, face[r])
      }
    }
    for (let j = 1; j < h; j++) {
      if (sameAsAbove[j]) continue
      // The maximal intervals over which both rows are constant, by two pointers; whichever
      // run ends first is left behind (the upper one on a tie).
      let a = start[j - 1]
      let b = start[j]
      const aEnd = start[j]
      const bEnd = start[j + 1]
      while (a < aEnd && b < bEnd) {
        const lo = Math.max(x0[a], x0[b])
        const hi = Math.min(x1[a], x1[b])
        if (hi > lo && face[a] !== face[b]) {
          for (let i = lo; i < hi; i++) {
            out.pushSegment(nodeId(i, j, w), nodeId(i + 1, j, w), face[a], face[b])
          }
        }
        if (x1[a] <= x1[b]) a++
        else b++
      }
    }
    for (let r = start[h - 1]; r < start[h]; r++) {
      for (let i = x0[r]; i < x1[r]; i++) {
        out.pushSegment(nodeId(i, h, w), nodeId(i + 1, h, w), face[r], OUTSIDE)
      }
    }
  }
  return { segs: out.data, count: out.length >> 2 }
}

/** Digit width of the incidence radix sort: 2,048 buckets. */
const DIGIT = 11
const MASK = (1 << DIGIT) - 1

/**
 * Stable sort of `(key, value)` pairs by key (non-negative): a least-significant-digit radix
 * sort in digits of {@link DIGIT} bits, passing only over the digits the largest key uses.
 * Each pass is a counting sort that visits the pairs in their current order, so equal keys
 * keep their input order. Returns the sorted arrays (the inputs or their scratch twins).
 */
function radixSortByKey(keys: Int32Array, values: Int32Array): [Int32Array, Int32Array] {
  const len = keys.length
  let max = 0
  for (let i = 0; i < len; i++) if (keys[i] > max) max = keys[i]
  const bits = 32 - Math.clz32(max)
  let srcK: Int32Array = keys
  let srcV: Int32Array = values
  let dstK: Int32Array = new Int32Array(len)
  let dstV: Int32Array = new Int32Array(len)
  const offset = new Int32Array(1 << DIGIT)
  for (let shift = 0; shift < bits; shift += DIGIT) {
    offset.fill(0)
    for (let i = 0; i < len; i++) offset[(srcK[i] >>> shift) & MASK]++
    let sum = 0
    for (let d = 0; d < offset.length; d++) {
      const c = offset[d]
      offset[d] = sum
      sum += c
    }
    for (let i = 0; i < len; i++) {
      const o = offset[(srcK[i] >>> shift) & MASK]++
      dstK[o] = srcK[i]
      dstV[o] = srcV[i]
    }
    ;[srcK, dstK] = [dstK, srcK]
    ;[srcV, dstV] = [dstV, srcV]
  }
  return [srcK, srcV]
}

/**
 * The segments at each node, in segment order: the nodes that have any, in increasing id
 * (`nodes[0 .. count]`), node `t`'s segments at `list[start[t] .. start[t + 1]]`, and per segment
 * end (`2k` for end `a` of segment `k`, `2k + 1` for end `b`) the index of its node.
 */
interface Incidence {
  count: number
  nodes: Int32Array
  start: Int32Array
  list: Int32Array
  nodeOf: Int32Array
}

/**
 * Index the segments by node. Both ends of every segment are listed in emission order (end
 * `a` of segment `k` as `2k`, end `b` as `2k + 1`) and stable-sorted by node id, which groups
 * them by node with each node's segments in increasing index.
 */
function incidence(segs: Int32Array, m: number): Incidence {
  const ends = 2 * m
  const keys = new Int32Array(ends)
  const values = new Int32Array(ends)
  for (let k = 0; k < m; k++) {
    keys[2 * k] = segs[4 * k]
    values[2 * k] = 2 * k
    keys[2 * k + 1] = segs[4 * k + 1]
    values[2 * k + 1] = 2 * k + 1
  }
  const [sk, sv] = radixSortByKey(keys, values)
  const nodes = new Int32Array(ends)
  const start = new Int32Array(ends + 1)
  const list = new Int32Array(ends)
  const nodeOf = new Int32Array(ends)
  let count = 0
  for (let t = 0; t < ends; t++) {
    if (count === 0 || nodes[count - 1] !== sk[t]) {
      nodes[count] = sk[t]
      start[count] = t
      count++
    }
    nodeOf[sv[t]] = count - 1
    list[t] = sv[t] >> 1
  }
  start[count] = ends
  return { count, nodes, start, list, nodeOf }
}

/**
 * Where four pixels meet at a corner and exactly one diagonal is a single face, give the two
 * segments of one face of the other diagonal a copy of the corner, `real + plane`.
 *
 * Each crack at the corner separates a known pair of the four pixels: `above` NW|NE, `left`
 * NW|SW, `right` NE|SE, `below` SW|SE. When NE and SW are one face, {above, left} are the whole
 * of NW's boundary at the corner and {right, below} the whole of SE's, so SE's pair takes the
 * copy (SW's pair, {left, below}, when NW and SE are one face). Each of the two shapes then
 * passes through a point of its own, and every chain still joins only segments separating the
 * same two faces. A corner whose diagonals are both one face, or neither, stays a junction.
 *
 * Nodes are visited in increasing id with their segment lists read before any copy is made;
 * a neighbour's far end may already be a copy, so it is folded back onto the lattice before
 * its direction is read.
 */
function splitSaddleCorners(
  segs: Int32Array,
  m: number,
  ids: Int32Array,
  w: number,
  h: number,
): void {
  const plane = (w + 1) * (h + 1)
  const inc = incidence(segs, m)
  for (let t = 0; t < inc.count; t++) {
    const s0 = inc.start[t]
    if (inc.start[t + 1] - s0 !== 4) continue
    const real = inc.nodes[t]
    const i = real % (w + 1)
    const j = (real - i) / (w + 1)
    const nw = faceAt(ids, w, h, i - 1, j - 1)
    const ne = faceAt(ids, w, h, i, j - 1)
    const sw = faceAt(ids, w, h, i - 1, j)
    const se = faceAt(ids, w, h, i, j)
    if ((nw === se) === (ne === sw)) continue
    // Name the four segments by where their far end lies.
    let left = -1
    let right = -1
    let below = -1
    for (let u = s0; u < s0 + 4; u++) {
      const k = inc.list[u]
      const a = segs[4 * k]
      const other = (a === real ? segs[4 * k + 1] : a) % plane
      const oi = other % (w + 1)
      const oj = (other - oi) / (w + 1)
      if (oj === j && oi > i) right = k
      else if (oj === j && oi < i) left = k
      else if (oi === i && oj > j) below = k
    }
    const p0 = ne === sw ? right : left
    if (p0 < 0 || below < 0) continue
    for (const k of [p0, below]) {
      if (segs[4 * k] === real) segs[4 * k] += plane
      else segs[4 * k + 1] += plane
    }
  }
}

/** A node is a junction unless exactly two segments pass through it. */
function isJunction(inc: Incidence, t: number): boolean {
  return inc.start[t + 1] - inc.start[t] !== 2
}

/**
 * The walked chains, flat: chain `c`'s node ids are `ids[offset[c] .. offset[c + 1]]`, its faces
 * `left[c]` and `right[c]`, and `from[c]`, `to[c]` the incidence indices of its start and end
 * nodes (-1 for a closed loop).
 */
class Chains {
  ids = new IntList(1024)
  offset = new IntList(64)
  left = new IntList(64)
  right = new IntList(64)
  from = new IntList(64)
  to = new IntList(64)

  constructor() {
    this.offset.push(0)
  }

  get count(): number {
    return this.left.length
  }

  /** End the chain whose node ids were pushed since the last one ended. */
  finish(left: number, right: number, from: number, to: number): void {
    this.offset.push(this.ids.length)
    this.left.push(left)
    this.right.push(right)
    this.from.push(from)
    this.to.push(to)
  }

  /** Drop the node ids pushed since the last chain ended. */
  discard(): void {
    this.ids.length = this.offset.data[this.offset.length - 1]
  }
}

/**
 * Walk every chain that starts at a junction, junctions in increasing node id and each one's
 * unused segments in segment order: from the junction, follow the pass-through nodes to the
 * next junction. The chain's `left` and `right` are its first segment's, swapped when that
 * segment points into the junction. A walk whose next node offers no unused segment stops
 * there.
 */
function walkOpenChains(segs: Int32Array, inc: Incidence, used: Uint8Array, out: Chains): void {
  for (let t = 0; t < inc.count; t++) {
    if (!isJunction(inc, t)) continue
    const startId = inc.nodes[t]
    for (let u = inc.start[t]; u < inc.start[t + 1]; u++) {
      const first = inc.list[u]
      if (used[first]) continue
      out.ids.push(startId)
      const forward = segs[4 * first] === startId
      const left = forward ? segs[4 * first + 2] : segs[4 * first + 3]
      const right = forward ? segs[4 * first + 3] : segs[4 * first + 2]
      let seg = first
      let node = startId
      let to = t
      for (;;) {
        used[seg] = 1
        const atB = segs[4 * seg] === node
        const next = atB ? segs[4 * seg + 1] : segs[4 * seg]
        out.ids.push(next)
        node = next
        to = inc.nodeOf[2 * seg + (atB ? 1 : 0)]
        if (isJunction(inc, to)) break
        let nxt = -1
        for (let v = inc.start[to]; v < inc.start[to + 1]; v++) {
          const k = inc.list[v]
          if (k !== seg && !used[k]) {
            nxt = k
            break
          }
        }
        if (nxt < 0) break
        seg = nxt
      }
      out.finish(left, right, t, to)
    }
  }
}

/**
 * Whatever {@link walkOpenChains} left are loops with no junction: follow each from its first
 * unused segment, in segment order, back to its start, with that segment's `left` and `right`.
 * A loop of fewer than three nodes cannot enclose anything and is dropped.
 */
function walkClosedLoops(
  segs: Int32Array,
  m: number,
  inc: Incidence,
  used: Uint8Array,
  out: Chains,
): void {
  for (let k0 = 0; k0 < m; k0++) {
    if (used[k0]) continue
    const a0 = segs[4 * k0]
    const begin = out.ids.length
    out.ids.push(a0)
    let seg = k0
    let node = a0
    for (;;) {
      used[seg] = 1
      const atB = segs[4 * seg] === node
      const next = atB ? segs[4 * seg + 1] : segs[4 * seg]
      if (next === a0) break
      out.ids.push(next)
      const t = inc.nodeOf[2 * seg + (atB ? 1 : 0)]
      let nxt = -1
      for (let v = inc.start[t]; v < inc.start[t + 1]; v++) {
        const k = inc.list[v]
        if (k !== seg && !used[k]) {
          nxt = k
          break
        }
      }
      if (nxt < 0) break
      seg = nxt
      node = next
    }
    if (out.ids.length - begin >= 3) out.finish(segs[4 * k0 + 2], segs[4 * k0 + 3], -1, -1)
    else out.discard()
  }
}

/**
 * Direction class of a unit lattice step, counter-clockwise on screen from +x: east 0,
 * north (−y) 1, west 2, south (+y) 3.
 */
function stepClass(dx: number, dy: number): number {
  if (dx > 0) return 0
  if (dy < 0) return 1
  if (dx < 0) return 2
  return 3
}

/**
 * Build the planar map of a face map.
 *
 * Edges are ordered as they are walked: the open edges by start junction (increasing lattice
 * id) and, at one junction, by the order of their first segment; then the closed loops by their
 * first segment. A closed loop starts at its first crack in that order, its topmost (then
 * leftmost) vertical crack, walked down.
 *
 * Per edge, at build time: `points` on lattice corners (a saddle copy at its corner's position),
 * `sigma` 0.5 everywhere, and `fixed` 1 on every point that lies on the image frame
 * (`x ∈ {0, w}` or `y ∈ {0, h}`, which covers every point of an edge against
 * {@link OUTSIDE}) and on the first and last point of every open edge (its nodes), 0
 * elsewhere. A closed edge has no node, so only its frame points are fixed (all of them for
 * the frame loop of a one-face image).
 *
 * Nodes are the junctions that end an open edge, numbered in increasing lattice id; each
 * node's `ends` lists its edge ends counter-clockwise on screen starting from +x.
 */
export function buildPlanarMap(faces: Faces): PlanarMap {
  const { width: w, height: h, ids } = faces
  const plane = (w + 1) * (h + 1)

  const runs = rowRuns(ids, w, h)
  const { segs, count: m } = dualSegments(runs, w, h)
  splitSaddleCorners(segs, m, ids, w, h)

  const inc = incidence(segs, m)
  const used = new Uint8Array(m)
  const chains = new Chains()
  walkOpenChains(segs, inc, used, chains)
  walkClosedLoops(segs, m, inc, used, chains)
  const { ids: chainIds, offset, left, right, from, to } = chains
  const nodeIds = chainIds.data
  const count = chains.count

  // Node index per incidence index, in increasing lattice id, for every node an edge ends at.
  const nodeIndex = new Int32Array(inc.count).fill(-1)
  for (let c = 0; c < count; c++) {
    if (from.data[c] < 0) continue
    nodeIndex[from.data[c]] = 0
    nodeIndex[to.data[c]] = 0
  }
  const nodes: PlanarNode[] = []
  for (let t = 0; t < inc.count; t++) {
    if (nodeIndex[t] < 0) continue
    nodeIndex[t] = nodes.length
    const id = inc.nodes[t] % plane
    const i = id % (w + 1)
    nodes.push({ x: i, y: (id - i) / (w + 1), ends: [] })
  }

  const edges: PlanarEdge[] = []
  // Per node, the edge end leaving it in each direction class (-1 when none).
  const slots = new Int32Array(4 * nodes.length).fill(-1)
  for (let e = 0; e < count; e++) {
    const o = offset.data[e]
    const len = offset.data[e + 1] - o
    const points = new Float64Array(2 * len)
    const fixed = new Uint8Array(len)
    for (let p = 0; p < len; p++) {
      const id = nodeIds[o + p] % plane
      const x = id % (w + 1)
      const y = (id - x) / (w + 1)
      points[2 * p] = x
      points[2 * p + 1] = y
      if (x === 0 || x === w || y === 0 || y === h) fixed[p] = 1
    }
    const closed = from.data[e] < 0
    let start = -1
    let end = -1
    if (!closed) {
      start = nodeIndex[from.data[e]]
      end = nodeIndex[to.data[e]]
      fixed[0] = 1
      fixed[len - 1] = 1
      const n = 2 * len
      slots[4 * start + stepClass(points[2] - points[0], points[3] - points[1])] = 2 * e
      slots[4 * end + stepClass(points[n - 4] - points[n - 2], points[n - 3] - points[n - 1])] =
        2 * e + 1
    }
    edges.push({
      points,
      sigma: new Float64Array(len).fill(0.5),
      fixed,
      left: left.data[e],
      right: right.data[e],
      start,
      end,
      closed,
    })
  }
  for (let v = 0; v < nodes.length; v++) {
    for (let d = 0; d < 4; d++) if (slots[4 * v + d] >= 0) nodes[v].ends.push(slots[4 * v + d])
  }

  return { width: w, height: h, faces, edges, nodes }
}
