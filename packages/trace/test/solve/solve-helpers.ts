/**
 * Fixtures for the boundary-solve tests: maps built from label grids or by
 * hand, and images rendered from exact box-filtered coverage (polygons clipped
 * to each pixel, disks integrated in closed form), so the geometry that made
 * an image is its zero-residual answer.
 */
import type { LabelMap } from '@trazor/core'
import { splitFaces } from '../../src/planar/faces'
import { buildPlanarMap } from '../../src/planar/map'
import type {
  FaceFill,
  Faces,
  PlanarEdge,
  PlanarMap,
  PlanarNode,
  PremultipliedImage,
} from '../../src/planar/types'

/** A premultiplied color `[r, g, b, a]` (r, g, b already multiplied by a). */
export type Rgba = readonly [number, number, number, number]

/** A flat fill of a straight (unpremultiplied) color at opacity `a`. */
export function flat(r: number, g: number, b: number, a = 1): FaceFill {
  return { r: r * a, g: g * a, b: b * a, a }
}

/** The premultiplied color of a flat fill. */
export function rgbaOf(f: FaceFill): Rgba {
  return [f.r, f.g, f.b, f.a]
}

/** A label map from a function of the pixel. */
export function labelsFrom(
  width: number,
  height: number,
  label: (x: number, y: number) => number,
): LabelMap {
  const data = new Int32Array(width * height)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const l = label(x, y)
      data[y * width + x] = l
      count = Math.max(count, l + 1)
    }
  }
  return { width, height, data, count }
}

/** The planar map of a label map, with its faces. */
export function mapOfLabels(labels: LabelMap): PlanarMap {
  return buildPlanarMap(splitFaces(labels))
}

/** Each face's fill from its label's fill. */
export function fillsByFace(faces: Faces, byLabel: readonly FaceFill[]): FaceFill[] {
  return Array.from(faces.label, (l) => byLabel[l])
}

/** One edge of a hand-built map: points flat `x, y`, faces, nodes (-1 for a closed edge). */
export interface HandEdge {
  points: number[]
  left: number
  right: number
  start?: number
  end?: number
  closed?: boolean
}

/**
 * A map built by hand: its edges as given, nodes at the given positions, and a
 * placeholder face map of `faceCount` faces (the solve reads only the edges,
 * the nodes and the size).
 */
export function handMap(
  width: number,
  height: number,
  edges: HandEdge[],
  nodes: [number, number][],
  faceCount = 2,
): PlanarMap {
  const faces: Faces = {
    width,
    height,
    ids: new Int32Array(width * height),
    count: faceCount,
    label: Int32Array.from({ length: faceCount }, (_, i) => i),
    area: new Uint32Array(faceCount),
  }
  const planarEdges: PlanarEdge[] = edges.map((e) => {
    const n = e.points.length / 2
    const closed = e.closed ?? false
    return {
      points: Float64Array.from(e.points),
      sigma: new Float64Array(n).fill(0.5),
      fixed: new Uint8Array(n),
      left: e.left,
      right: e.right,
      start: closed ? -1 : (e.start ?? -1),
      end: closed ? -1 : (e.end ?? -1),
      closed,
    }
  })
  const planarNodes: PlanarNode[] = nodes.map(([x, y]) => ({ x, y, ends: [] }))
  return { width, height, faces, edges: planarEdges, nodes: planarNodes }
}

/** A deep copy of a map's mutable geometry (edges' points and nodes). */
export function cloneMap(map: PlanarMap): PlanarMap {
  return {
    ...map,
    edges: map.edges.map((e) => ({ ...e, points: e.points.slice(), sigma: e.sigma.slice() })),
    nodes: map.nodes.map((v) => ({ ...v, ends: v.ends.slice() })),
  }
}

/** Every edge point of a map, flat, in edge order. */
export function allPoints(map: PlanarMap): number[] {
  const out: number[] = []
  for (const e of map.edges) out.push(...e.points)
  return out
}

/** Signed shoelace area of a flat polygon. */
function shoelace(poly: number[]): number {
  const n = poly.length / 2
  let twice = 0
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    twice += poly[2 * k] * poly[2 * j + 1] - poly[2 * j] * poly[2 * k + 1]
  }
  return 0.5 * twice
}

/** Sutherland–Hodgman clip of a flat polygon to the half-plane `s·(coord − c) ≥ 0`. */
function clipHalf(poly: number[], axis: 0 | 1, c: number, s: 1 | -1): number[] {
  const out: number[] = []
  const n = poly.length / 2
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    const ax = poly[2 * k]
    const ay = poly[2 * k + 1]
    const bx = poly[2 * j]
    const by = poly[2 * j + 1]
    const da = s * ((axis === 0 ? ax : ay) - c)
    const db = s * ((axis === 0 ? bx : by) - c)
    if (da >= 0) out.push(ax, ay)
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db)
      out.push(ax + (bx - ax) * t, ay + (by - ay) * t)
    }
  }
  return out
}

/** Exact area of a simple polygon inside pixel `(px, py)` (the square `[px, px+1] × [py, py+1]`). */
export function polygonPixelArea(poly: number[], px: number, py: number): number {
  let p = clipHalf(poly, 0, px, 1)
  p = clipHalf(p, 0, px + 1, -1)
  p = clipHalf(p, 1, py, 1)
  p = clipHalf(p, 1, py + 1, -1)
  return p.length >= 6 ? Math.abs(shoelace(p)) : 0
}

/** `∫ sqrt(r² − u²) du`. */
function chordPrimitive(u: number, r: number): number {
  const c = Math.max(-1, Math.min(1, u / r))
  return 0.5 * (u * Math.sqrt(Math.max(0, r * r - u * u)) + r * r * Math.asin(c))
}

/**
 * Exact area of the disk of centre `(cx, cy)` and radius `r` inside the
 * rectangle `[x0, x1] × [y0, y1]`: the integral over x of the disk's chord
 * clamped to the rectangle, split where the clamping changes so each piece is
 * a closed-form primitive.
 */
export function diskRectArea(
  cx: number,
  cy: number,
  r: number,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
): number {
  const ua = Math.max(x0 - cx, -r)
  const ub = Math.min(x1 - cx, r)
  if (!(ub > ua)) return 0
  const cuts = [ua, ub]
  for (const yb of [y0, y1]) {
    const d = yb - cy
    if (Math.abs(d) < r) {
      const s = Math.sqrt(r * r - d * d)
      for (const u of [-s, s]) if (u > ua && u < ub) cuts.push(u)
    }
  }
  cuts.sort((a, b) => a - b)
  let area = 0
  for (let k = 0; k + 1 < cuts.length; k++) {
    const p = cuts[k]
    const q = cuts[k + 1]
    if (!(q > p)) continue
    const m = 0.5 * (p + q)
    const hm = Math.sqrt(Math.max(0, r * r - m * m))
    const hInt = chordPrimitive(q, r) - chordPrimitive(p, r)
    // Upper end of the chord: cy + h clamped to [y0, y1]; lower end: cy − h.
    let upper: number
    if (cy + hm > y1) upper = y1 * (q - p)
    else if (cy + hm < y0) upper = y0 * (q - p)
    else upper = cy * (q - p) + hInt
    let lower: number
    if (cy - hm < y0) lower = y0 * (q - p)
    else if (cy - hm > y1) lower = y1 * (q - p)
    else lower = cy * (q - p) - hInt
    area += upper - lower
  }
  return area
}

/** A region of a test image: its coverage of a pixel, whether it holds a point, its color. */
export interface Region {
  coverage: (px: number, py: number) => number
  inside: (x: number, y: number) => boolean
  color: Rgba | ((x: number, y: number) => Rgba)
}

/** Even-odd point-in-polygon test. */
function pointInPolygon(x: number, y: number, poly: number[]): boolean {
  const n = poly.length / 2
  let inside = false
  for (let k = 0, j = n - 1; k < n; j = k++) {
    const ax = poly[2 * k]
    const ay = poly[2 * k + 1]
    const bx = poly[2 * j]
    const by = poly[2 * j + 1]
    if (ay > y !== by > y && x < ax + ((y - ay) * (bx - ax)) / (by - ay)) inside = !inside
  }
  return inside
}

/** A polygon region. */
export function polygonRegion(poly: number[], color: Region['color']): Region {
  return {
    coverage: (px, py) => polygonPixelArea(poly, px, py),
    inside: (x, y) => pointInPolygon(x, y, poly),
    color,
  }
}

/** A disk region. */
export function diskRegion(cx: number, cy: number, r: number, color: Region['color']): Region {
  return {
    coverage: (px, py) => diskRectArea(cx, cy, r, px, px + 1, py, py + 1),
    inside: (x, y) => Math.hypot(x - cx, y - cy) < r,
    color,
  }
}

/**
 * An image rendered from exact coverage: disjoint `regions` over a
 * `background`, each pixel `Σ cov·color` with the background taking the rest.
 * A color given as a function is read at the pixel centre, as the solve's
 * forward model reads a smooth fill.
 */
export function render(
  width: number,
  height: number,
  regions: Region[],
  background: Region['color'],
): PremultipliedImage {
  const data = new Float32Array(4 * width * height)
  const colorAt = (c: Region['color'], x: number, y: number): Rgba =>
    typeof c === 'function' ? c(x + 0.5, y + 0.5) : c
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let rest = 1
      const acc = [0, 0, 0, 0]
      for (const reg of regions) {
        const cov = reg.coverage(x, y)
        if (cov <= 0) continue
        rest -= cov
        const c = colorAt(reg.color, x, y)
        for (let k = 0; k < 4; k++) acc[k] += cov * c[k]
      }
      const bg = colorAt(background, x, y)
      for (let k = 0; k < 4; k++) data[4 * (y * width + x) + k] = acc[k] + rest * bg[k]
    }
  }
  return { width, height, data }
}

/** Per pixel, `k + 1` for the first region `k` holding the pixel centre, else 0 (the background). */
export function labelsOfRegions(width: number, height: number, regions: Region[]): LabelMap {
  return labelsFrom(width, height, (x, y) => {
    for (let k = 0; k < regions.length; k++) if (regions[k].inside(x + 0.5, y + 0.5)) return k + 1
    return 0
  })
}

/** Distance from `(px, py)` to the segment `a–b`. */
export function segmentDistance(
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
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0
  return Math.hypot(px - ax - t * dx, py - ay - t * dy)
}

/** Distance from `(px, py)` to the boundary of a flat polygon. */
export function polygonBoundaryDistance(px: number, py: number, poly: number[]): number {
  const n = poly.length / 2
  let best = Infinity
  for (let k = 0; k < n; k++) {
    const j = (k + 1) % n
    best = Math.min(
      best,
      segmentDistance(px, py, poly[2 * k], poly[2 * k + 1], poly[2 * j], poly[2 * j + 1]),
    )
  }
  return best
}
