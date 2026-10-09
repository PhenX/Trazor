/**
 * A face's rings — its outer boundary and its holes as closed walks over the planar map's
 * shared edges — and how the faces nest.
 *
 * **Rings.** A face takes an edge forwards when it is the edge's `left` face and reversed when it
 * is its `right`, so every ring keeps its face on its left (screen view): an outer ring runs
 * anticlockwise on screen, a negative shoelace sum in the y-down frame, and a hole clockwise, a
 * positive one. A closed edge is a ring by itself. Otherwise a ring is chained edge by edge: at
 * the node an edge arrives at, the walk leaves by the edge end next clockwise from the one it
 * came in on, which bounds the same face's corner of the node (the face is on the walk's left
 * and lies clockwise of the arriving end). The ring closes when that leads back to its first
 * edge. Every edge side is used once, and nothing is copied: both faces of a boundary name the
 * same edge, so the two sides cannot drift apart. The walk reads only `start`, `end`, `left`,
 * `right` and the nodes' `ends`, so it gives the same rings however far a later stage has moved
 * the points.
 *
 * **Which ring is the outline.** The top side of a face's first pixel in raster order lies on
 * its outer boundary (nothing of the face is above it), and the face `q` above that pixel lies
 * outside the face; every edge between the face and `q` is on the outer ring, which is the ring
 * holding one. `q` is {@link OUTSIDE} for a face starting on the first row.
 *
 * **Nesting.** The parent of face `f` is the smallest face containing it: the owner of the
 * innermost hole ring around it. With `q` as above and `R` the ring of `q` holding an edge
 * between the two: if `R` is a hole of `q`, `f` lies in that hole and `q` is its parent; if `R`
 * is `q`'s outline, `f` lies beside `q` and shares its parent — the border-hierarchy rule of
 * Suzuki & Abe 1985 ("Topological structural analysis of digitized binary images by border
 * following", CVGIP 30(1), Table 1), read off the map. A face touching the frame has none.
 * `q`'s first pixel precedes `f`'s, so one raster scan settles every face. A ring's depth
 * is `2·depth(face)` for the outline and `2·depth(face) + 1` for a hole — the number of rings
 * of the face and its ancestors around it — and as walked every even-depth ring runs
 * anticlockwise and every odd-depth ring clockwise, the winding that makes the `nonzero` fill
 * rule paint what `evenodd` paints (SVG 1.1 §11.3).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/planar.rs` (`face_edge_order`),
 * `inkvec-cli/src/rings.rs` (`nesting`, `containment`, `ring_area`, `point_in_ring`) and
 * `inkvec-cli/src/emit/winding.rs` (rings wound by nesting depth).
 */
import { OUTSIDE } from './types'
import type { FaceRing, PlanarMap } from './types'

/**
 * Each face's edge sides in edge order. A side is `2·edge` for the face on an edge's left (the
 * edge walked forwards) and `2·edge + 1` for the face on its right (walked reversed); face `f`'s
 * sides are `sides[start[f] .. start[f + 1]]`.
 */
function sidesByFace(map: PlanarMap): { start: Int32Array; sides: Int32Array } {
  const count = map.faces.count
  const start = new Int32Array(count + 1)
  const edges = map.edges
  for (const e of edges) {
    if (e.left >= 0 && e.left < count) start[e.left + 1]++
    if (e.right >= 0 && e.right < count) start[e.right + 1]++
  }
  for (let f = 0; f < count; f++) start[f + 1] += start[f]
  const fill = start.slice(0, count)
  const sides = new Int32Array(start[count])
  for (let k = 0; k < edges.length; k++) {
    const e = edges[k]
    if (e.left >= 0 && e.left < count) sides[fill[e.left]++] = 2 * k
    if (e.right >= 0 && e.right < count) sides[fill[e.right]++] = 2 * k + 1
  }
  return { start, sides }
}

/** The face across a side: the edge's right face when walked forwards, its left when reversed. */
function across(map: PlanarMap, side: number): number {
  const e = map.edges[side >> 1]
  return side & 1 ? e.left : e.right
}

/**
 * The side by which face `f`'s ring leaves the node it arrives at on `side`: the edge end next
 * clockwise from the arriving one, which bounds the same corner of the node. The ring's first
 * side `first` counts as available, so the walk can close on it. Where the node's `ends` do not
 * give a side of `f` (a malformed map), the face's first unused side leaving the node in edge
 * order (`sides[s0 .. s1]`), or `first` when the walk is back where it began; -1 when there is
 * none.
 */
function nextSide(
  map: PlanarMap,
  f: number,
  side: number,
  first: number,
  sides: Int32Array,
  s0: number,
  s1: number,
  consumed: Uint8Array,
): number {
  const { edges, nodes } = map
  const e = edges[side >> 1]
  const v = side & 1 ? e.start : e.end
  // The walk arrives on the other end of the same edge, and an edge end shares its code with
  // the side that leaves a node by it (`2·edge` its start, `2·edge + 1` its end).
  const ends = nodes[v].ends
  const p = ends.indexOf(side ^ 1)
  if (p >= 0) {
    const y = ends[(p + ends.length - 1) % ends.length]
    const ey = edges[y >> 1]
    if ((y & 1 ? ey.right : ey.left) === f && (y === first || !consumed[y])) return y
  }
  for (let u = s0; u < s1; u++) {
    const t = sides[u]
    const et = edges[t >> 1]
    if (!et.closed && (t & 1 ? et.end : et.start) === v && !consumed[t]) return t
  }
  const ef = edges[first >> 1]
  return (first & 1 ? ef.end : ef.start) === v ? first : -1
}

/** Index of the first ring of `rings` holding a side whose face across is `q`, or -1. */
function ringAgainst(map: PlanarMap, rings: FaceRing[], q: number): number {
  for (let r = 0; r < rings.length; r++) {
    const ring = rings[r]
    for (let t = 0; t < ring.edges.length; t++) {
      if (across(map, 2 * ring.edges[t] + (ring.reversed[t] ? 1 : 0)) === q) return r
    }
  }
  return -1
}

/**
 * The rings of every face (indexed by face id), each a closed walk over the map's edges with the
 * face on its left: the outer ring first, then the holes in the order they were assembled (each
 * from the face's lowest-numbered edge not yet used). A face of a well-formed map has exactly one
 * outer ring.
 */
export function faceRings(map: PlanarMap): FaceRing[][] {
  const { faces, edges } = map
  const count = faces.count
  const { start, sides } = sidesByFace(map)
  const consumed = new Uint8Array(2 * edges.length)
  const out: FaceRing[][] = []

  for (let f = 0; f < count; f++) {
    const rings: FaceRing[] = []
    const s0 = start[f]
    const s1 = start[f + 1]

    for (let u = s0; u < s1; u++) {
      const first = sides[u]
      if (consumed[first]) continue
      const ring: FaceRing = { edges: [], reversed: [], outer: false }
      let side = first
      // A guard on the walk's length, so a malformed map yields a short ring and not a hang.
      for (let guard = s1 - s0 + 4; guard > 0; guard--) {
        consumed[side] = 1
        ring.edges.push(side >> 1)
        ring.reversed.push((side & 1) === 1)
        if (edges[side >> 1].closed) break
        const nxt = nextSide(map, f, side, first, sides, s0, s1, consumed)
        if (nxt === first || nxt < 0) break
        side = nxt
      }
      rings.push(ring)
    }
    out.push(rings)
  }

  // The outline: the ring holding an edge to the face above the first pixel.
  const { width: w, ids } = faces
  const seen = new Uint8Array(count)
  for (let p = 0; p < ids.length; p++) {
    const f = ids[p]
    if (seen[f]) continue
    seen[f] = 1
    const q = p >= w ? ids[p - w] : OUTSIDE
    const rings = out[f]
    let outer = ringAgainst(map, rings, q)
    if (outer < 0) {
      // Not a well-formed map: take the ring enclosing the most area anticlockwise.
      let best = 0
      for (let r = 0; r < rings.length; r++) {
        const a = polygonArea(ringPolygon(map, rings[r]))
        if (a < best) {
          best = a
          outer = r
        }
      }
    }
    if (outer < 0) continue
    rings[outer].outer = true
    if (outer > 0) rings.unshift(...rings.splice(outer, 1))
  }
  return out
}

/** How the faces nest; see the module comment. */
export interface FaceNesting {
  /** Per face, the smallest face containing it (the owner of the innermost hole around it), or -1. */
  parent: Int32Array
  /** Per face, its number of ancestors (0 for a face no other face contains). */
  depth: Int32Array
  /**
   * Per face and ring, in {@link faceRings} order: `2·depth` for the outer ring, `2·depth + 1`
   * for a hole. As walked, an even-depth ring runs anticlockwise on screen and an odd-depth one
   * clockwise.
   */
  ringDepth: Int32Array[]
}

/** The nesting of the faces of `map`, whose rings are `rings` ({@link faceRings}). */
export function faceNesting(map: PlanarMap, rings: FaceRing[][]): FaceNesting {
  const { faces, edges } = map
  const { count, width: w, ids } = faces
  // Which ring of its face each edge side lies on.
  const ringOfSide = new Int32Array(2 * edges.length).fill(-1)
  for (let f = 0; f < count; f++) {
    const fr = rings[f]
    for (let r = 0; r < fr.length; r++) {
      const ring = fr[r]
      for (let t = 0; t < ring.edges.length; t++) {
        ringOfSide[2 * ring.edges[t] + (ring.reversed[t] ? 1 : 0)] = r
      }
    }
  }

  const parent = new Int32Array(count).fill(-1)
  const depth = new Int32Array(count)
  const seen = new Uint8Array(count)
  for (let p = 0; p < ids.length; p++) {
    const f = ids[p]
    if (seen[f]) continue
    seen[f] = 1
    const q = p >= w ? ids[p - w] : OUTSIDE
    if (q === OUTSIDE) continue
    // A side of `f` against `q` (all on its outline in a well-formed map), and `q`'s side of it.
    const fr = rings[f]
    const r = ringAgainst(map, fr, q)
    if (r < 0) continue
    let qSide = -1
    for (let t = 0; t < fr[r].edges.length && qSide < 0; t++) {
      const side = 2 * fr[r].edges[t] + (fr[r].reversed[t] ? 1 : 0)
      if (across(map, side) === q) qSide = side ^ 1
    }
    const rq = ringOfSide[qSide]
    const hole = rq >= 0 && !rings[q][rq].outer
    parent[f] = hole ? q : parent[q]
    depth[f] = parent[f] < 0 ? 0 : depth[parent[f]] + 1
  }

  const ringDepth = rings.map((fr, f) =>
    Int32Array.from(fr, (r) => 2 * depth[f] + (r.outer ? 0 : 1)),
  )
  return { parent, depth, ringDepth }
}

/**
 * The polygon a ring walks, as flat `x0, y0, x1, y1, …` from the edges' current points, in walk
 * order: each edge from its first point to the point before its last (the next edge's first),
 * so no point repeats and the polygon closes implicitly. A closed edge contributes all of its
 * points, from its first.
 */
export function ringPolygon(map: PlanarMap, ring: FaceRing): Float64Array {
  let total = 0
  for (const k of ring.edges) {
    const e = map.edges[k]
    total += e.points.length / 2 - (e.closed ? 0 : 1)
  }
  const out = new Float64Array(2 * total)
  let o = 0
  for (let t = 0; t < ring.edges.length; t++) {
    const e = map.edges[ring.edges[t]]
    const pts = e.points
    const len = pts.length / 2
    const count = e.closed ? len : len - 1
    for (let s = 0; s < count; s++) {
      // Forwards from the first point; reversed from the last, or for a closed edge from its
      // first point back round through the last.
      const p = !ring.reversed[t] ? s : e.closed ? (len - s) % len : len - 1 - s
      out[o++] = pts[2 * p]
      out[o++] = pts[2 * p + 1]
    }
  }
  return out
}

/**
 * Signed area of a closed polygon (flat `x, y` pairs, the last point not repeated) by the
 * shoelace formula `½·Σ (x_k·y_(k+1) − x_(k+1)·y_k)`: in the y-down frame negative for an
 * anticlockwise polygon on screen, positive for a clockwise one.
 */
export function polygonArea(poly: Float64Array): number {
  const n = poly.length >> 1
  if (n < 3) return 0
  let twice = 0
  let px = poly[2 * n - 2]
  let py = poly[2 * n - 1]
  for (let k = 0; k < n; k++) {
    const x = poly[2 * k]
    const y = poly[2 * k + 1]
    twice += px * y - x * py
    px = x
    py = y
  }
  return 0.5 * twice
}

/**
 * Even-odd test of point `(x, y)` against a closed polygon (flat `x, y` pairs): cast a ray towards
 * +x and count the polygon edges it crosses. An edge counts when its ends lie on either side of
 * the point's height, one strictly beyond it (which counts a vertex on the ray once and ignores
 * horizontal edges), and it crosses to the right of the point. A point exactly on the boundary may go either way.
 */
export function pointInPolygon(x: number, y: number, poly: Float64Array): boolean {
  const n = poly.length >> 1
  if (n < 3) return false
  let inside = false
  let bx = poly[2 * n - 2]
  let by = poly[2 * n - 1]
  for (let k = 0; k < n; k++) {
    const ax = poly[2 * k]
    const ay = poly[2 * k + 1]
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside
    bx = ax
    by = ay
  }
  return inside
}
