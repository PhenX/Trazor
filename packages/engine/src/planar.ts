/**
 * The planar-map geometry chain's engine side: the observed image and the
 * faces' paint in the core's forward-model space (premultiplied encoded sRGB in
 * [0, 1]), and the assembly of fitted edges into the shapes each layering
 * emits. The geometry itself — faces, the planar map, sub-pixel measurement,
 * the boundary solve, the fit and the crossing repair — lives in
 * `@trazor/trace`'s planar core; every layering reads the same fitted edges.
 */
import type { GradientPaint, LabelMap, PathCommand, RasterImage } from '@trazor/core'
import { hexToRgb } from '@trazor/core'
import { buildPlanarMap, faceNesting, faceRings, regionRings, splitFaces } from '@trazor/trace'
import type {
  FaceFill,
  FaceNesting,
  FaceRing,
  FaceShape,
  FittedEdge,
  PlanarEdge,
  PlanarMap,
  RegionShape,
} from '@trazor/trace'

/** An image in the core's forward-model space: premultiplied encoded sRGB RGBA in [0, 1]. */
export interface PremultipliedImage {
  width: number
  height: number
  data: Float32Array
}

/**
 * The observed image in the forward model's space, from the working image
 * composited over white and its source alpha: a pixel over white reads
 * `c·α + (1 − α)` per channel, so its premultiplied color is that minus
 * `1 − α`. Without alpha every pixel is opaque.
 */
export function premultipliedImage(
  image: RasterImage,
  alpha: Uint8Array | null,
): PremultipliedImage {
  const { width, height, data } = image
  const n = width * height
  const out = new Float32Array(n * 4)
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = alpha === null ? 1 : alpha[i] / 255
    const clear = 1 - a
    out[p] = Math.max(0, data[p] / 255 - clear)
    out[p + 1] = Math.max(0, data[p + 1] / 255 - clear)
    out[p + 2] = Math.max(0, data[p + 2] / 255 - clear)
    out[p + 3] = a
  }
  return { width, height, data: out }
}

/** Encoded sRGB in [0, 1] of a `#rrggbb` color; white when unreadable. */
function rgb01(hex: string): [number, number, number] {
  const c = hexToRgb(hex) ?? [255, 255, 255]
  return [c[0] / 255, c[1] / 255, c[2] / 255]
}

/**
 * A gradient's color and opacity at a point, interpolated between its stops in
 * encoded sRGB (the SVG default, `color-interpolation: sRGB`) and padded past
 * its ends; written premultiplied into `out[0..3]`.
 */
export function gradientAt(g: GradientPaint, x: number, y: number, out: Float64Array): void {
  let t: number
  if (g.kind === 'linear') {
    const dx = g.x2 - g.x1
    const dy = g.y2 - g.y1
    const len2 = dx * dx + dy * dy
    t = len2 > 0 ? ((x - g.x1) * dx + (y - g.y1) * dy) / len2 : 0
  } else {
    t = g.r > 0 ? Math.hypot(x - g.cx, y - g.cy) / g.r : 0
  }
  const stops = g.stops
  let a = stops[0]
  let b = stops[stops.length - 1]
  let u = 0
  if (t <= a.offset) b = a
  else if (t >= b.offset) a = b
  else {
    for (let k = 1; k < stops.length; k++) {
      if (t <= stops[k].offset) {
        a = stops[k - 1]
        b = stops[k]
        const span = b.offset - a.offset
        u = span > 0 ? (t - a.offset) / span : 0
        break
      }
    }
  }
  const ca = rgb01(a.color)
  const cb = rgb01(b.color)
  const oa = a.opacity ?? 1
  const ob = b.opacity ?? 1
  const o = oa + (ob - oa) * u
  out[0] = (ca[0] + (cb[0] - ca[0]) * u) * o
  out[1] = (ca[1] + (cb[1] - ca[1]) * u) * o
  out[2] = (ca[2] + (cb[2] - ca[2]) * u) * o
  out[3] = o
}

/** One label's paint, as the engine resolved it for emission. */
export interface LabelPaint {
  /** Flat color, `#rrggbb` (a gradient's stand-in when `gradient` is set). */
  hex: string
  gradient?: GradientPaint | null
  /** The flat paint a gradient overlay composites over, if any. */
  under?: string
  /** Fill opacity of a translucent label, painted with `ink`. */
  opacity?: number
  ink?: string
}

/**
 * Each face's paint in the forward model: a label's flat color (or its ink at
 * its opacity), a gradient evaluated per point (composited over its underlay's
 * flat color when it has one), and the zero color for a transparent face.
 */
export function faceFills(faceLabel: Int32Array, paints: readonly LabelPaint[]): FaceFill[] {
  const byLabel = paints.map((p): FaceFill => {
    if (p.gradient) {
      const g = p.gradient
      const under = p.under !== undefined ? rgb01(p.under) : null
      const at = (x: number, y: number, out: Float64Array): void => {
        gradientAt(g, x, y, out)
        if (under !== null) {
          const k = 1 - out[3]
          out[0] += under[0] * k
          out[1] += under[1] * k
          out[2] += under[2] * k
          out[3] = 1
        }
      }
      const [r, gg, b] = rgb01(p.hex)
      return { r, g: gg, b, a: 1, at }
    }
    if (p.opacity !== undefined && p.ink !== undefined) {
      const [r, g, b] = rgb01(p.ink)
      return { r: r * p.opacity, g: g * p.opacity, b: b * p.opacity, a: p.opacity }
    }
    const [r, g, b] = rgb01(p.hex)
    return { r, g, b, a: 1 }
  })
  const clear: FaceFill = { r: 0, g: 0, b: 0, a: 0 }
  const out: FaceFill[] = new Array(faceLabel.length)
  for (let f = 0; f < faceLabel.length; f++) {
    const l = faceLabel[f]
    out[f] = l >= 0 && l < byLabel.length ? byLabel[l] : clear
  }
  return out
}

/** The segments of a fitted edge run against its stored direction, ending at its start. */
function reversedSegments(fit: FittedEdge): PathCommand[] {
  const segs = fit.segments
  const out: PathCommand[] = []
  for (let i = segs.length - 1; i >= 0; i--) {
    const c = segs[i]
    const prev = i > 0 ? (segs[i - 1] as { x: number; y: number }) : { x: fit.x0, y: fit.y0 }
    switch (c.type) {
      case 'L':
        out.push({ type: 'L', x: prev.x, y: prev.y })
        break
      case 'Q':
        out.push({ type: 'Q', x1: c.x1, y1: c.y1, x: prev.x, y: prev.y })
        break
      case 'C':
        out.push({ type: 'C', x1: c.x2, y1: c.y2, x2: c.x1, y2: c.y1, x: prev.x, y: prev.y })
        break
      case 'A':
        out.push({
          type: 'A',
          rx: c.rx,
          ry: c.ry,
          rotation: c.rotation,
          largeArc: c.largeArc,
          sweep: !c.sweep,
          x: prev.x,
          y: prev.y,
        })
        break
      default:
        break
    }
  }
  return out
}

/**
 * One face ring as a closed subpath: its edges' fitted segments in walk order,
 * each reversed where the walk takes it backwards, from the first edge's start
 * point. Two faces walking one edge draw the same fitted curve.
 */
export function ringCommands(ring: FaceRing, fits: readonly FittedEdge[]): PathCommand[] {
  const out: PathCommand[] = []
  for (let k = 0; k < ring.edges.length; k++) {
    const fit = fits[ring.edges[k]]
    const rev = ring.reversed[k]
    if (k === 0) {
      if (rev) {
        const last = fit.segments[fit.segments.length - 1] as { x: number; y: number } | undefined
        out.push({ type: 'M', x: last?.x ?? fit.x0, y: last?.y ?? fit.y0 })
      } else out.push({ type: 'M', x: fit.x0, y: fit.y0 })
    }
    for (const c of rev ? reversedSegments(fit) : fit.segments) out.push(c)
  }
  out.push({ type: 'Z' })
  return out
}

/**
 * A polyline description of an edge through its points, for the stages that
 * run before the curve fit lands: absolute `L` commands from the first point,
 * a closed edge back to it.
 */
export function polylineFit(edge: PlanarEdge): FittedEdge {
  const p = edge.points
  const segments: PathCommand[] = []
  for (let i = 2; i < p.length; i += 2) segments.push({ type: 'L', x: p[i], y: p[i + 1] })
  if (edge.closed) segments.push({ type: 'L', x: p[0], y: p[1] })
  return { x0: p[0], y0: p[1], segments, closed: edge.closed, params: 2 * segments.length, chi2: 0 }
}

/** The planar map of a label map with its rings and nesting, ready for the geometry stages. */
export interface PlanarGeometry {
  map: PlanarMap
  rings: FaceRing[][]
  nesting: FaceNesting
}

/** Faces, planar map, rings and nesting of a label map. */
export function planarGeometry(labels: LabelMap): PlanarGeometry {
  const map = buildPlanarMap(splitFaces(labels))
  const rings = faceRings(map)
  return { map, rings, nesting: faceNesting(map, rings) }
}

/** Twice the signed area a ring's fitted outline encloses, from its segment end points. */
function ringArea(commands: readonly PathCommand[]): number {
  let a = 0
  let sx = 0
  let sy = 0
  let px = 0
  let py = 0
  for (const c of commands) {
    if (c.type === 'M') {
      sx = px = c.x
      sy = py = c.y
    } else if (c.type === 'Z') {
      a += px * sy - sx * py
      px = sx
      py = sy
    } else {
      a += px * c.y - c.x * py
      px = c.x
      py = c.y
    }
  }
  return a / 2
}

/**
 * The cutout partition: one compound path per label, every ring of every face
 * of that label (outer rings and holes, wound as walked), drawn over the
 * shared fitted edges, so two labels meet on the same curve. Transparent faces
 * paint nothing.
 */
export function cutoutRegions(geo: PlanarGeometry, fits: readonly FittedEdge[]): RegionShape[] {
  const { faces } = geo.map
  const byLabel = new Map<number, RegionShape>()
  for (let f = 0; f < faces.count; f++) {
    const label = faces.label[f]
    if (label < 0) continue
    let region = byLabel.get(label)
    if (region === undefined) {
      region = { label, commands: [], area: 0, holeCount: 0 }
      byLabel.set(label, region)
    }
    region.area += faces.area[f]
    for (const ring of geo.rings[f]) {
      for (const c of ringCommands(ring, fits)) region.commands.push(c)
      if (!ring.outer) region.holeCount++
    }
  }
  return [...byLabel.values()].toSorted((a, b) => a.label - b.label)
}

/** Whether a hole ring borders a transparent face (a cut the face must keep). */
function holeOntoClear(geo: PlanarGeometry, ring: FaceRing): boolean {
  const { edges, faces } = geo.map
  for (let k = 0; k < ring.edges.length; k++) {
    const e = edges[ring.edges[k]]
    const across = ring.reversed[k] ? e.left : e.right
    if (across >= 0 && faces.label[across] < 0) return true
  }
  return false
}

/**
 * The nested faces: one per painted face, its outer ring plus the holes it
 * keeps onto transparency (a hole a labeled face fills is repainted by that
 * face, drawn after it), each recording its nearest painted ancestor.
 */
export function nestedFaces(geo: PlanarGeometry, fits: readonly FittedEdge[]): FaceShape[] {
  const { faces } = geo.map
  const index = new Int32Array(faces.count).fill(-1)
  const out: FaceShape[] = []
  for (let f = 0; f < faces.count; f++) {
    const label = faces.label[f]
    if (label < 0) continue
    index[f] = out.length
    const commands: PathCommand[] = []
    let area = 0
    for (const ring of geo.rings[f]) {
      if (!ring.outer && !holeOntoClear(geo, ring)) continue
      const ringCmds = ringCommands(ring, fits)
      if (ring.outer) area = Math.abs(ringArea(ringCmds))
      for (const c of ringCmds) commands.push(c)
    }
    out.push({ label, commands, area, parent: -1 })
  }
  for (let f = 0; f < faces.count; f++) {
    if (index[f] < 0) continue
    let p = geo.nesting.parent[f]
    while (p >= 0 && index[p] < 0) p = geo.nesting.parent[p]
    out[index[f]].parent = p >= 0 ? index[p] : -1
  }
  return out
}

/** Whether (x, y) lies inside a flat polygon, by the even-odd crossing test. */
function insidePolygon(x: number, y: number, poly: readonly number[]): boolean {
  let odd = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const yi = poly[i + 1]
    const yj = poly[j + 1]
    if (yi > y !== yj > y && x < ((poly[j] - poly[i]) * (y - yi)) / (yj - yi) + poly[i]) odd = !odd
  }
  return odd
}

/**
 * Group a union's rings into shapes: each outer ring (anticlockwise on screen,
 * a negative signed area) with the holes inside it — the smallest outer ring
 * holding a hole's first point — so a lone round ring is a shape of its own a
 * serializer can recognize as a primitive.
 */
function groupRings(rings: readonly PathCommand[][]): PathCommand[][] {
  const areas = rings.map(ringArea)
  const outers: number[] = []
  for (let i = 0; i < rings.length; i++) if (areas[i] < 0) outers.push(i)
  const groups = new Map<number, PathCommand[]>()
  for (const o of outers) groups.set(o, [...rings[o]])
  const polys = rings.map((r) => {
    const pts: number[] = []
    for (const c of r) if (c.type !== 'Z') pts.push(c.x, c.y)
    return pts
  })
  for (let h = 0; h < rings.length; h++) {
    if (areas[h] < 0) continue
    const [x, y] = polys[h]
    let best = -1
    for (const o of outers) {
      if (!insidePolygon(x, y, polys[o])) continue
      if (best < 0 || -areas[o] < -areas[best]) best = o
    }
    if (best >= 0) for (const c of rings[h]) groups.get(best)?.push(c)
  }
  return outers.map((o) => groups.get(o) as PathCommand[])
}

/**
 * The stacked sheets: layer `k` (`order[k]`, base first) is the union of the
 * faces of its own label and the faces painted above it that its own faces
 * reach through faces painted at or above it, so each sheet extends beneath
 * the sheets over it and no edge can crack. Its outline is walked over the
 * shared fitted edges ({@link regionRings}). `paintLabel` is each face's label
 * as the base layers paint it (an island lifted onto its own top layer takes
 * its surround's label); `islands` are the faces painted on top, by layer.
 */
export function stackedLayers(
  geo: PlanarGeometry,
  fits: readonly FittedEdge[],
  paintLabel: Int32Array,
  order: readonly number[],
  islands: readonly { label: number; faces: number[] }[],
): { label: number; shapes: PathCommand[][] }[] {
  const { map } = geo
  const { faces, edges } = map
  const position = new Int32Array(Math.max(1, ...order.map((l) => l + 1))).fill(-1)
  order.forEach((l, i) => (position[l] = i))
  const posOf = (f: number): number => {
    const l = paintLabel[f]
    return l >= 0 && l < position.length ? position[l] : -1
  }
  // Face adjacency over the shared edges.
  const adjStart = new Int32Array(faces.count + 1)
  for (const e of edges) {
    if (e.left >= 0 && e.right >= 0) {
      adjStart[e.left + 1]++
      adjStart[e.right + 1]++
    }
  }
  for (let f = 0; f < faces.count; f++) adjStart[f + 1] += adjStart[f]
  const adj = new Int32Array(adjStart[faces.count])
  const fill = adjStart.slice(0, faces.count)
  for (const e of edges) {
    if (e.left >= 0 && e.right >= 0) {
      adj[fill[e.left]++] = e.right
      adj[fill[e.right]++] = e.left
    }
  }
  const out: { label: number; shapes: PathCommand[][] }[] = []
  const inRegion = new Uint8Array(faces.count)
  const stack: number[] = []
  for (let k = 0; k < order.length; k++) {
    inRegion.fill(0)
    for (let f = 0; f < faces.count; f++) {
      if (posOf(f) === k && inRegion[f] === 0) {
        inRegion[f] = 1
        stack.push(f)
      }
    }
    while (stack.length > 0) {
      const f = stack.pop() as number
      for (let a = adjStart[f]; a < adjStart[f + 1]; a++) {
        const g = adj[a]
        if (inRegion[g] === 0 && posOf(g) >= k) {
          inRegion[g] = 1
          stack.push(g)
        }
      }
    }
    const rings = regionRings(map, inRegion).map((r) => ringCommands(r, fits))
    out.push({ label: order[k], shapes: groupRings(rings) })
  }
  for (const island of islands) {
    inRegion.fill(0)
    for (const f of island.faces) inRegion[f] = 1
    const rings = regionRings(map, inRegion).map((r) => ringCommands(r, fits))
    out.push({ label: island.label, shapes: groupRings(rings) })
  }
  return out
}
