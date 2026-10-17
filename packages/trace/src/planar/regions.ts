/**
 * The rings of a union of faces — a stacked layer, a color's whole region — as
 * closed walks over the planar map's shared edges, so the union draws exactly
 * the fitted curves its faces' neighbours draw.
 *
 * A side of an edge bounds the union when the face on its left is in it and
 * the face across is not; a ring keeps the union on its left (screen view). At
 * the node a ring arrives at, the walk turns clockwise from the arriving end
 * through the node's ends: the sector just clockwise of the arriving end is in
 * the union, and each end passed whose far sector is in the union too is an
 * edge inside it, so the walk leaves by the first end whose far sector is not.
 * This is the face walk of `rings.ts` with every edge inside the union
 * skipped. A closed edge on the union's boundary is a ring by itself.
 */
import type { FaceRing, PlanarMap } from './types'

/** Face on the left of a side (`2·edge` forwards, `2·edge + 1` reversed). */
function leftOf(map: PlanarMap, side: number): number {
  const e = map.edges[side >> 1]
  return side & 1 ? e.right : e.left
}

/** Face across a side: the edge's right when walked forwards, its left when reversed. */
function rightOf(map: PlanarMap, side: number): number {
  const e = map.edges[side >> 1]
  return side & 1 ? e.left : e.right
}

/**
 * The rings of the union of the faces with `inRegion[face] === 1`, each a
 * closed walk keeping the union on its left, in order of their lowest edge
 * side. `OUTSIDE` (beyond the frame) is never in the union.
 */
export function regionRings(map: PlanarMap, inRegion: Uint8Array): FaceRing[] {
  const { edges, nodes } = map
  const isIn = (f: number): boolean => f >= 0 && f < inRegion.length && inRegion[f] === 1
  const bounds = (side: number): boolean => isIn(leftOf(map, side)) && !isIn(rightOf(map, side))
  const consumed = new Uint8Array(2 * edges.length)
  const rings: FaceRing[] = []
  for (let first = 0; first < 2 * edges.length; first++) {
    if (consumed[first] || !bounds(first)) continue
    const ring: FaceRing = { edges: [], reversed: [], outer: false }
    let side = first
    for (let guard = 2 * edges.length + 4; guard > 0; guard--) {
      consumed[side] = 1
      ring.edges.push(side >> 1)
      ring.reversed.push((side & 1) === 1)
      const e = edges[side >> 1]
      if (e.closed) break
      const v = side & 1 ? e.start : e.end
      const ends = nodes[v].ends
      let p = ends.indexOf(side ^ 1)
      let next = -1
      for (let k = 0; k < ends.length && p >= 0; k++) {
        p = (p + ends.length - 1) % ends.length
        const y = ends[p]
        if (!isIn(leftOf(map, y))) break
        if (!isIn(rightOf(map, y))) {
          next = y
          break
        }
      }
      if (next < 0 || next === first || consumed[next]) break
      side = next
    }
    rings.push(ring)
  }
  return rings
}

/** The face on the union's side of each step of a {@link regionRings} ring. */
export function innerFaces(map: PlanarMap, ring: FaceRing): number[] {
  return ring.edges.map((k, t) => {
    const e = map.edges[k]
    return ring.reversed[t] ? e.right : e.left
  })
}
