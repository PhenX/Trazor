/**
 * The planar-map geometry chain's engine side: the observed image and the
 * faces' paint in the core's forward-model space (premultiplied encoded sRGB in
 * [0, 1]), and the assembly of fitted edges into the shapes each layering
 * emits. The geometry itself — faces, the planar map, sub-pixel measurement,
 * the boundary solve, the fit and the crossing repair — lives in
 * `@trazor/trace`'s planar core; every layering reads the same fitted edges.
 */
import type { GradientPaint, LabelMap, PathCommand, RasterImage } from '@trazor/core'
import { arcToCenter, hexToRgb } from '@trazor/core'
import {
  buildPlanarMap,
  innerFaces,
  faceNesting,
  faceRingPolygon,
  faceRings,
  fitConfig,
  fitEdges,
  fitRun,
  refineJunctions,
  repairCrossings,
  refineSubpixel,
  regionRings,
  solveBoundaries,
  splitFaces,
  OUTSIDE,
} from '@trazor/trace'
import { annulusStroke } from '@trazor/svg'
import type { Primitive, StrokedPrimitive } from '@trazor/svg'
import type {
  BandKernel,
  EdgePrimitive,
  FaceFill,
  FaceNesting,
  FaceRing,
  FaceShape,
  FitConfig,
  FittedEdge,
  PlanarEdge,
  PlanarMap,
  PremultipliedImage,
  RegionShape,
} from '@trazor/trace'

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
 * its ends (an elliptical radial read in its own frame); written premultiplied
 * into `out[0..3]`.
 */
export function gradientAt(g: GradientPaint, x: number, y: number, out: Float64Array): void {
  let t: number
  if (g.kind === 'linear') {
    const dx = g.x2 - g.x1
    const dy = g.y2 - g.y1
    const len2 = dx * dx + dy * dy
    t = len2 > 0 ? ((x - g.x1) * dx + (y - g.y1) * dy) / len2 : 0
  } else if (g.r <= 0) {
    t = 0
  } else if (g.aspect === undefined || g.aspect === 1) {
    t = Math.hypot(x - g.cx, y - g.cy) / g.r
  } else {
    // The ellipse's frame: along `angle`, and across it stretched by the aspect.
    const c = Math.cos(g.angle ?? 0)
    const s = Math.sin(g.angle ?? 0)
    const dx = x - g.cx
    const dy = y - g.cy
    t = Math.hypot(dx * c + dy * s, (dy * c - dx * s) * g.aspect) / g.r
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

/**
 * A fitted whole-edge primitive as the element the serializer writes: a circle;
 * an ellipse (its rotation in degrees, absent when zero); a rectangle, with its
 * corner radius when rounded, only when its sides lie on the axes (a quarter
 * turn swaps them) — the serializer's `<rect>` has no rotation, so a tilted one
 * stays a path (null).
 */
export function svgPrimitive(p: EdgePrimitive): Primitive | null {
  switch (p.kind) {
    case 'circle':
      return { kind: 'circle', cx: p.cx, cy: p.cy, r: p.r }
    case 'ellipse': {
      const angle = (p.rotation * 180) / Math.PI
      return {
        kind: 'ellipse',
        cx: p.cx,
        cy: p.cy,
        rx: p.rx,
        ry: p.ry,
        ...(angle !== 0 ? { angle } : {}),
      }
    }
    case 'rect': {
      const quarters = p.rotation / (Math.PI / 2)
      const k = Math.round(quarters)
      if (Math.abs(quarters - k) > 1e-9) return null
      const [w, h] = k % 2 === 0 ? [p.w, p.h] : [p.h, p.w]
      const box = { x: p.cx - w / 2, y: p.cy - h / 2, width: w, height: h }
      return p.r > 0 ? { kind: 'rrect', ...box, r: p.r } : { kind: 'rect', ...box }
    }
  }
}

/** A primitive scaled by `s` about the origin, then moved by `d` on both axes (as `placePathCommands`). */
export function placePrimitive(p: Primitive, s: number, d: number): Primitive {
  switch (p.kind) {
    case 'circle':
      return { kind: 'circle', cx: p.cx * s + d, cy: p.cy * s + d, r: p.r * s }
    case 'ellipse':
      return { ...p, cx: p.cx * s + d, cy: p.cy * s + d, rx: p.rx * s, ry: p.ry * s }
    case 'rect':
      return {
        kind: 'rect',
        x: p.x * s + d,
        y: p.y * s + d,
        width: p.width * s,
        height: p.height * s,
      }
    case 'rrect':
      return {
        ...p,
        x: p.x * s + d,
        y: p.y * s + d,
        width: p.width * s,
        height: p.height * s,
        r: p.r * s,
      }
    case 'polygon':
      return { kind: 'polygon', points: p.points.map((q) => ({ x: q.x * s + d, y: q.y * s + d })) }
  }
}

/**
 * The exact primitive a face ring draws: its one closed edge's, when the fit
 * described that edge as a whole primitive.
 */
export function ringPrimitive(ring: FaceRing, fits: readonly FittedEdge[]): Primitive | null {
  if (ring.edges.length !== 1) return null
  const prim = fits[ring.edges[0]].primitive
  return prim === undefined ? null : svgPrimitive(prim)
}

/**
 * The stroked primitive a face's outer ring and its one hole draw together
 * (`annulusStroke`): both rings single whole-primitive edges, one the other
 * offset by a uniform width.
 */
export function ringStroke(
  outer: FaceRing,
  hole: FaceRing,
  fits: readonly FittedEdge[],
): StrokedPrimitive | null {
  const o = ringPrimitive(outer, fits)
  const h = o === null ? null : ringPrimitive(hole, fits)
  return o === null || h === null ? null : annulusStroke(o, h)
}

/**
 * Positional uncertainty of a set-back point, in source pixels: loose, since it
 * is hidden; the fit passes within `τ·σ` (τ = 2) of it, half a source pixel, so
 * a run set back one pixel stays beneath the sheet over it.
 */
const SET_BACK_SIGMA = 0.25

/**
 * The fit of a stacked layer's set-back run (interleaved points, walk order):
 * the multimodel program and its post-fit passes with every point held to
 * {@link SET_BACK_SIGMA}, its ends pinned, as segments after the first point.
 * A fit that strays from a point by more than a source pixel, the distance the
 * run is set back, is replaced by the fits of the run's two halves, pinned at
 * its middle point, down to lines through the points: the program prices a
 * line by its points' best-fit line but draws it as the chord between its
 * ends, and pinned to a set-back run's ends that chord can cut a pixel or more
 * across the sheet's edge. The fit is a function of the points alone, so each
 * distinct run (bit for bit) is fitted once and its segments handed out again
 * to every sheet that sets the same run back.
 */
export function setBackFit(width: number, height: number, scale: number): SetBack['fit'] {
  const cfg = contentFitConfig(width, height, scale)
  const sigma = SET_BACK_SIGMA * scale
  const fitted = new Map<string, readonly PathCommand[]>()
  const fit = (points: Float64Array): PathCommand[] => {
    const n = points.length >> 1
    if (n <= 3) {
      const lines: PathCommand[] = []
      for (let i = 1; i < n; i++) lines.push({ type: 'L', x: points[i * 2], y: points[i * 2 + 1] })
      return lines
    }
    const key = bitsKey(points)
    const known = fitted.get(key)
    if (known !== undefined) return known.slice()
    const segs = fitRun(points, new Float64Array(n).fill(sigma), cfg).segments
    const mid = n >> 1
    const out = keepsTo(points, segs, scale)
      ? segs
      : [...fit(points.subarray(0, (mid + 1) * 2)), ...fit(points.subarray(mid * 2))]
    fitted.set(key, out.slice())
    return out
  }
  return fit
}

/** A string that two arrays share exactly when their values are the same bits. */
function bitsKey(a: Float64Array): string {
  const units = new Uint16Array(a.buffer, a.byteOffset, a.length * 4)
  let key = ''
  for (let i = 0; i < units.length; i += 4096) {
    key += String.fromCharCode(...units.subarray(i, i + 4096))
  }
  return key
}

/**
 * Whether the path from the first point through `segments` passes within `tol`
 * of every point (interleaved, in path order). Each point is measured against
 * the path's polyline (sampled `tol / 2` apart) near its own fraction of the
 * path's length first, and against the whole path only when that misses.
 */
export function keepsTo(
  points: Float64Array,
  segments: readonly PathCommand[],
  tol: number,
): boolean {
  const n = points.length >> 1
  const path = fittedPoints(
    { x0: points[0], y0: points[1], segments: [...segments], closed: false, params: 0, chi2: 0 },
    tol / 2,
  ).points
  const m = path.length >> 1
  if (m < 2) return n < 2
  const reach = Math.max(8, Math.ceil(0.15 * m))
  const near = (i: number, lo: number, hi: number): boolean => {
    const x = points[i * 2]
    const y = points[i * 2 + 1]
    for (let k = Math.max(0, lo); k < Math.min(m - 1, hi); k++) {
      const ax = path[k * 2]
      const ay = path[k * 2 + 1]
      const dx = path[k * 2 + 2] - ax
      const dy = path[k * 2 + 3] - ay
      const len2 = dx * dx + dy * dy
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2)) : 0
      if (Math.hypot(x - ax - t * dx, y - ay - t * dy) <= tol) return true
    }
    return false
  }
  for (let i = 0; i < n; i++) {
    const c = Math.round((i / Math.max(1, n - 1)) * (m - 1))
    if (!near(i, c - reach, c + reach) && !near(i, 0, m - 1)) return false
  }
  return true
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

/** What the planar chain traces: a label map, the image it came from and each label's paint. */
export interface PlanarTraceInput {
  labels: LabelMap
  /** The working image, composited over white. */
  image: RasterImage
  /** Its source alpha, or null when opaque. */
  alpha: Uint8Array | null
  /** Each label's paint, by label. */
  paints: readonly LabelPaint[]
  /**
   * Working pixels per source pixel (the supersample factor): the fit prices
   * a boundary in source pixels, as content units.
   */
  scale?: number
  /**
   * The source the working image was enlarged from (`scale` > 1), composited
   * as the working image is, with its alpha (null when opaque): the boundary
   * solve renders each of its pixels' exact coverage against it.
   */
  source?: { image: RasterImage; alpha: Uint8Array | null }
  /**
   * The pixel noise the sub-pixel stage divides by (encoded sRGB units), when
   * the front end measured it; else the stage reads it off the image.
   */
  sigmaNoise?: number
  /** Called with the map after each stage, and with the fits after the fit. */
  onStage?: (stage: string, map: PlanarMap, fits?: readonly FittedEdge[]) => void
  /** Runs the boundary solve's descent in this WebAssembly kernel; in TypeScript when absent. */
  solveKernel?: BandKernel
  /**
   * Fits every edge of the solved map under `cfg`, by edge index, exactly as
   * `fitEdges` does — elsewhere, such as across helper workers; `fitEdges` on
   * this thread when absent.
   */
  fitEdges?: (map: PlanarMap, cfg: FitConfig) => Promise<FittedEdge[]>
}

/** The fit's output precision, in source pixels (inkvec's default). */
const FIT_PRECISION = 0.1

/**
 * The fit's objective for a map traced `scale` working pixels per source
 * pixel, in content units (inkvec `units.rs`): a coordinate is priced at the
 * source's own resolution, `ln(extent / (scale·precision))` nats, and `λ`
 * grows by `scale` with the boundary points per unit of content; the caller
 * scales every σ by `scale` too. The identity at `scale` 1.
 */
export function contentFitConfig(width: number, height: number, scale: number): FitConfig {
  const cfg = fitConfig(Math.max(width, height), FIT_PRECISION * scale)
  return { tau: cfg.tau, lambda: cfg.lambda * scale }
}

/**
 * The planar chain's geometry: the label map's faces and the edges they share;
 * every boundary point measured to sub-pixel against its two faces' paint,
 * every junction placed where its edges meet, then the whole boundary solved
 * at once against the observed image — all in the forward model's space; on
 * an enlarged copy, against the source's own pixels (`source`) — and each
 * edge described once, as curves or a whole primitive, the edges of
 * a ring whose fits cross refitted until none does. Each stage is reported to `onStage`.
 */
export async function tracePlanar(input: PlanarTraceInput): Promise<{
  geo: PlanarGeometry
  fits: FittedEdge[]
}> {
  const geo = planarGeometry(input.labels)
  const { map } = geo
  input.onStage?.('lattice', map)
  const image = premultipliedImage(input.image, input.alpha)
  const fills = faceFills(map.faces.label, input.paints)
  const s = input.scale ?? 1
  const source =
    s > 1 && input.source !== undefined
      ? { image: premultipliedImage(input.source.image, input.source.alpha), scale: s }
      : undefined
  refineSubpixel(
    map,
    image,
    fills,
    input.sigmaNoise !== undefined ? { sigmaNoise: input.sigmaNoise } : {},
  )
  input.onStage?.('subpixel', map)
  refineJunctions(map)
  input.onStage?.('junctions', map)
  solveBoundaries(map, image, fills, {
    ...(source !== undefined ? { source } : {}),
    ...(input.solveKernel !== undefined ? { kernel: input.solveKernel } : {}),
  })
  input.onStage?.('solve', map)
  // From here on σ is in content units (source pixels), as the fit's prices are.
  if (s !== 1) for (const e of map.edges) e.sigma = e.sigma.map((v) => v * s)
  const cfg = contentFitConfig(map.width, map.height, s)
  const fitted = input.fitEdges ? await input.fitEdges(map, cfg) : fitEdges(map, cfg)
  input.onStage?.('fit', map, fitted)
  const { fits } = repairCrossings(map, geo.rings, fitted, cfg)
  input.onStage?.('repair', map, fits)
  return { geo, fits }
}

/**
 * Twice the signed area of a flat polygon (interleaved points): negative for an
 * outer ring, anticlockwise on screen in y-down.
 */
function polygonArea2(poly: ArrayLike<number>): number {
  let a = 0
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    a += poly[j] * poly[i + 1] - poly[i] * poly[j + 1]
  }
  return a
}

/** A cutout region, with the primitive it draws when it is one face of one whole-primitive ring. */
export interface PlanarRegion extends RegionShape {
  primitive: Primitive | null
}

/**
 * The cutout partition: one compound path per label, every ring of every face
 * of that label (outer rings and holes, wound as walked), drawn over the
 * shared fitted edges, so two labels meet on the same curve. Transparent faces
 * paint nothing. A label that is a single face bounded by one closed edge the
 * fit described as a primitive draws that primitive; its neighbour's hole
 * runs over the same edge.
 */
export function cutoutRegions(geo: PlanarGeometry, fits: readonly FittedEdge[]): PlanarRegion[] {
  const { faces } = geo.map
  const byLabel = new Map<number, PlanarRegion>()
  const faceCount = new Map<number, number>()
  for (let f = 0; f < faces.count; f++) {
    const label = faces.label[f]
    if (label < 0) continue
    let region = byLabel.get(label)
    if (region === undefined) {
      region = { label, commands: [], area: 0, holeCount: 0, primitive: null }
      byLabel.set(label, region)
    }
    const rings = geo.rings[f]
    const n = (faceCount.get(label) ?? 0) + 1
    faceCount.set(label, n)
    region.primitive = n === 1 && rings.length === 1 ? ringPrimitive(rings[0], fits) : null
    region.area += faces.area[f]
    for (const ring of rings) {
      const commands = ringCommands(ring, fits)
      if (!paintsArea(commands)) continue
      for (const c of commands) region.commands.push(c)
      if (!ring.outer) region.holeCount++
    }
  }
  return [...byLabel.values()].toSorted((a, b) => a.label - b.label)
}

/**
 * Whether a hole ring borders a transparent face, or one painted alone (a
 * translucent paint, which must composite over what lies beneath it in the
 * source, not over its parent): a cut the face must keep.
 */
function holeOntoClear(
  geo: PlanarGeometry,
  ring: FaceRing,
  alone?: (label: number) => boolean,
): boolean {
  const { edges, faces } = geo.map
  for (let k = 0; k < ring.edges.length; k++) {
    const e = edges[ring.edges[k]]
    const across = ring.reversed[k] ? e.left : e.right
    if (across < 0) continue
    const l = faces.label[across]
    if (l < 0 || (alone !== undefined && alone(l))) return true
  }
  return false
}

/** A nested face, with the primitive it draws when its only ring is one whole-primitive edge. */
export interface PlanarFace extends FaceShape {
  primitive: Primitive | null
}

/**
 * The nested faces: one per painted face, its outer ring plus the holes it
 * keeps onto transparency and onto faces painted `alone` (a hole an opaque
 * labeled face fills is repainted by that face, drawn after it), each
 * recording its nearest painted ancestor. A face
 * drawing its outer ring alone, one closed edge the fit described as a
 * primitive, draws that primitive.
 */
export function nestedFaces(
  geo: PlanarGeometry,
  fits: readonly FittedEdge[],
  alone?: (label: number) => boolean,
): PlanarFace[] {
  const { faces } = geo.map
  const index = new Int32Array(faces.count).fill(-1)
  const out: PlanarFace[] = []
  for (let f = 0; f < faces.count; f++) {
    const label = faces.label[f]
    if (label < 0) continue
    index[f] = out.length
    const commands: PathCommand[] = []
    const kept: FaceRing[] = []
    let area = 0
    for (const ring of geo.rings[f]) {
      if (!ring.outer && !holeOntoClear(geo, ring, alone)) continue
      const ringCmds = ringCommands(ring, fits)
      if (!paintsArea(ringCmds)) continue
      if (ring.outer) area = Math.abs(polygonArea2(faceRingPolygon(geo.map, ring))) / 2
      for (const c of ringCmds) commands.push(c)
      kept.push(ring)
    }
    const primitive = kept.length === 1 ? ringPrimitive(kept[0], fits) : null
    out.push({ label, commands, area, parent: -1, primitive })
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
function insidePolygon(x: number, y: number, poly: ArrayLike<number>): boolean {
  let odd = false
  for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) {
    const yi = poly[i + 1]
    const yj = poly[j + 1]
    if (yi > y !== yj > y && x < ((poly[j] - poly[i]) * (y - yi)) / (yj - yi) + poly[i]) odd = !odd
  }
  return odd
}

/**
 * Fitted area, in px², below which a ring paints nothing: the fit put every side
 * of a sliver face on one curve (a ring out along a chord and back, or a point),
 * leaving an area that is floating-point error. A millionth of a pixel stays
 * under one 8-bit coverage level of a single pixel even at 60× zoom
 * (`3600 · 10⁻⁶ < 1/255`), while the smallest face the front end keeps holds a
 * pixel or more.
 */
const NO_AREA = 1e-6

/** Whether a fitted ring encloses any area ({@link NO_AREA}). */
export function paintsArea(commands: readonly PathCommand[]): boolean {
  return Math.abs(fittedArea(commands)) >= NO_AREA
}

/** Gauss–Legendre nodes and weights on [0, 1], three points: exact for the quintic `x·y′ − y·x′` of a cubic. */
const GL3_T = [0.5 - Math.sqrt(15) / 10, 0.5, 0.5 + Math.sqrt(15) / 10]
const GL3_W = [5 / 18, 8 / 18, 5 / 18]

/**
 * The signed area a closed path's fitted segments enclose, by Green's theorem
 * (`½∮ x dy − y dx`): exact for lines, quadratics and cubics, an arc summed over
 * its angle in 32 steps of Simpson's rule.
 */
export function fittedArea(commands: readonly PathCommand[]): number {
  let twice = 0
  let x = 0
  let y = 0
  let sx = 0
  let sy = 0
  for (const c of commands) {
    switch (c.type) {
      case 'M':
        x = sx = c.x
        y = sy = c.y
        break
      case 'Z':
        twice += x * sy - sx * y
        x = sx
        y = sy
        break
      case 'L':
        twice += x * c.y - c.x * y
        x = c.x
        y = c.y
        break
      case 'Q':
      case 'C': {
        const px = c.type === 'Q' ? [x, c.x1, c.x] : [x, c.x1, c.x2, c.x]
        const py = c.type === 'Q' ? [y, c.y1, c.y] : [y, c.y1, c.y2, c.y]
        const d = px.length - 1
        for (let k = 0; k < 3; k++) {
          const t = GL3_T[k]
          let bx = px.slice()
          let by = py.slice()
          let dx = 0
          let dy = 0
          for (let m = d; m > 0; m--) {
            if (m === 1) {
              dx = d * (bx[1] - bx[0])
              dy = d * (by[1] - by[0])
            }
            for (let i = 0; i < m; i++) {
              bx[i] += (bx[i + 1] - bx[i]) * t
              by[i] += (by[i + 1] - by[i]) * t
            }
            bx = bx.slice(0, m)
            by = by.slice(0, m)
          }
          twice += GL3_W[k] * (bx[0] * dy - by[0] * dx)
        }
        x = c.x
        y = c.y
        break
      }
      case 'A': {
        const e = arcToCenter(x, y, c)
        if (e === null) twice += x * c.y - c.x * y
        else {
          const cos = Math.cos(e.phi)
          const sin = Math.sin(e.phi)
          const steps = 32
          const h = e.dTheta / steps
          for (let i = 0; i <= steps; i++) {
            const th = e.theta1 + i * h
            const ex = e.rx * Math.cos(th)
            const ey = e.ry * Math.sin(th)
            const px = e.cx + cos * ex - sin * ey
            const py = e.cy + sin * ex + cos * ey
            const dpx = -cos * e.rx * Math.sin(th) - sin * e.ry * Math.cos(th)
            const dpy = -sin * e.rx * Math.sin(th) + cos * e.ry * Math.cos(th)
            const wgt = i === 0 || i === steps ? 1 : i % 2 === 1 ? 4 : 2
            twice += ((wgt * h) / 3) * (px * dpy - py * dpx)
          }
        }
        x = c.x
        y = c.y
        break
      }
      default:
        break
    }
  }
  return twice / 2
}

/**
 * Group a union's rings into shapes: each outer ring (anticlockwise on screen,
 * a negative signed area) with the holes inside it — the smallest outer ring
 * holding a hole's first point — so a lone round ring is a shape of its own a
 * serializer can recognize as a primitive. Orientation and containment are read
 * off each ring's dense polygon over the map's points (`poly`), which the fit
 * follows; a ring fitted as two arcs has no polygon of its own end points.
 */
function groupRings(
  all: readonly { commands: PathCommand[]; poly: Float64Array; primitive: Primitive | null }[],
): StackedShape[] {
  const rings = all.filter((r) => paintsArea(r.commands))
  const areas = rings.map((r) => polygonArea2(r.poly))
  const outers: number[] = []
  for (let i = 0; i < rings.length; i++) if (areas[i] < 0) outers.push(i)
  const groups = new Map<number, PathCommand[]>()
  const holes = new Map<number, number[]>()
  for (const o of outers) {
    groups.set(o, [...rings[o].commands])
    holes.set(o, [])
  }
  for (let h = 0; h < rings.length; h++) {
    if (areas[h] < 0) continue
    const x = rings[h].poly[0]
    const y = rings[h].poly[1]
    let best = -1
    for (const o of outers) {
      if (!insidePolygon(x, y, rings[o].poly)) continue
      if (best < 0 || -areas[o] < -areas[best]) best = o
    }
    if (best < 0) continue
    for (const c of rings[h].commands) groups.get(best)?.push(c)
    holes.get(best)?.push(h)
  }
  return outers.map((o) => {
    const inside = holes.get(o) as number[]
    const outer = rings[o].primitive
    const hole = inside.length === 1 ? rings[inside[0]].primitive : null
    return {
      commands: groups.get(o) as PathCommand[],
      primitive: inside.length === 0 ? outer : null,
      stroked: outer !== null && hole !== null ? annulusStroke(outer, hole) : null,
    }
  })
}

/**
 * One stacked shape: an outer ring and the holes inside it, with the primitive
 * it draws when it is one whole-primitive ring, or the stroked primitive when
 * it is a ring of one width between two ({@link ringStroke}).
 */
export interface StackedShape {
  commands: PathCommand[]
  primitive: Primitive | null
  stroked: StrokedPrimitive | null
}

/**
 * How a stacked layer's hidden edges are set back beneath the sheets above
 * them. Where a sheet painted above a layer reaches the layer's outline, the
 * two draw the same edge, and composited as independent coverages (Porter &
 * Duff 1984) the lower sheet's paint shows in the upper sheet's anti-aliased
 * rim. The lower sheet's edge there is hidden, so it moves `distance` px inward,
 * beneath the upper sheet, wherever that sheet is at least two pixels deep, and
 * eases back onto the shared edge over `ramp` px where it meets a visible edge.
 */
export interface SetBack {
  /** The face of each pixel (the planar map's `faces.ids`). */
  faceIds: Int32Array
  width: number
  height: number
  /** How far a hidden edge sits beneath the sheet over it (px). */
  distance: number
  /** Arc length over which a set-back grows from nothing at a visible neighbour (px). */
  ramp: number
  /** Fits the set-back points (walk order) into segments from the first point. */
  fit: (points: Float64Array) => PathCommand[]
}

/** The face of the pixel holding (x, y), or -1 outside the image. */
function faceAt(sb: SetBack, x: number, y: number): number {
  const i = Math.floor(x)
  const j = Math.floor(y)
  if (i < 0 || j < 0 || i >= sb.width || j >= sb.height) return -1
  return sb.faceIds[j * sb.width + i]
}

/**
 * Arc length either side of a point, in set-back distances, over which the
 * normal it is set back along is read: the chord across the window, a centred
 * finite difference over a wide stencil, follows the edge's shape and not its
 * small turns (an edge fitted as a polyline turns at every vertex, and a
 * normal from the points next to each one would turn with it).
 */
const SET_BACK_WINDOW = 2

/**
 * A fitted edge as points in its stored direction, about `step` px apart:
 * every segment's end (so each corner of the fit is a point), lines cut
 * evenly, cubics and quadratics evenly in their parameter by their control
 * polygon's length, arcs evenly in angle (their center form, W3C SVG 1.1
 * F.6.5). A closed edge's points do not repeat its first. `ends[k]` is the
 * index of segment k's end point (a closed edge's last is the point count:
 * its first point again).
 */
export function fittedPoints(
  fit: FittedEdge,
  step: number,
): { points: Float64Array; ends: Int32Array } {
  const xy: number[] = [fit.x0, fit.y0]
  const ends = new Int32Array(fit.segments.length)
  let x = fit.x0
  let y = fit.y0
  for (let k = 0; k < fit.segments.length; k++) {
    const s = fit.segments[k]
    if (s.type === 'M' || s.type === 'Z') {
      ends[k] = xy.length / 2 - 1
      continue
    }
    if (s.type === 'C' || s.type === 'Q') {
      const x1 = s.type === 'C' ? s.x1 : x + (2 / 3) * (s.x1 - x)
      const y1 = s.type === 'C' ? s.y1 : y + (2 / 3) * (s.y1 - y)
      const x2 = s.type === 'C' ? s.x2 : s.x + (2 / 3) * (s.x1 - s.x)
      const y2 = s.type === 'C' ? s.y2 : s.y + (2 / 3) * (s.y1 - s.y)
      const net =
        Math.hypot(x1 - x, y1 - y) + Math.hypot(x2 - x1, y2 - y1) + Math.hypot(s.x - x2, s.y - y2)
      const pieces = Math.max(1, Math.ceil(net / step))
      for (let j = 1; j < pieces; j++) {
        const t = j / pieces
        const u = 1 - t
        xy.push(
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * s.x,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * s.y,
        )
      }
    } else if (s.type === 'A') {
      const c = arcToCenter(x, y, s)
      if (c !== null) {
        const pieces = Math.max(1, Math.ceil((Math.abs(c.dTheta) * Math.max(c.rx, c.ry)) / step))
        const cos = Math.cos(c.phi)
        const sin = Math.sin(c.phi)
        for (let j = 1; j < pieces; j++) {
          const a = c.theta1 + (c.dTheta * j) / pieces
          const ex = c.rx * Math.cos(a)
          const ey = c.ry * Math.sin(a)
          xy.push(c.cx + cos * ex - sin * ey, c.cy + sin * ex + cos * ey)
        }
      }
    } else {
      const pieces = Math.max(1, Math.ceil(Math.hypot(s.x - x, s.y - y) / step))
      for (let j = 1; j < pieces; j++) {
        xy.push(x + ((s.x - x) * j) / pieces, y + ((s.y - y) * j) / pieces)
      }
    }
    xy.push(s.x, s.y)
    ends[k] = xy.length / 2 - 1
    x = s.x
    y = s.y
  }
  if (fit.closed && xy.length > 2) xy.length -= 2
  return { points: Float64Array.from(xy), ends }
}

/**
 * One hidden edge's points (walk order), each moved along the walk's left
 * normal — into the sheet over it — by the set-back. The normal at a point is
 * the chord's between the points {@link SET_BACK_WINDOW} set-back distances
 * of arc length either side of it (as far as an open edge runs), so the run
 * keeps its points' shape instead of amplifying their small turns. A point
 * may go the full distance where the sheet's face holds the set-back point and
 * the pixel half a pixel past it; elsewhere the sheet is too thin and the
 * point stays. (A fitted edge lies anywhere within a pixel or so of the label
 * map's lattice boundary, so the point itself may sit on either face.) The
 * set-back eases between them: no farther from a point that stays than its arc
 * length to it (a thin spot dips the run at 45° instead of notching it), and
 * growing from nothing over the ramp at an end that meets a visible edge.
 */
export function setBackPoints(
  edge: { readonly points: ArrayLike<number>; readonly closed: boolean },
  inner: number,
  easeStart: boolean,
  easeEnd: boolean,
  sb: SetBack,
): Float64Array {
  const n = edge.points.length >> 1
  const pts = Float64Array.from(edge.points)
  const along = new Float64Array(n)
  for (let i = 1; i < n; i++) {
    along[i] =
      along[i - 1] + Math.hypot(pts[i * 2] - pts[i * 2 - 2], pts[i * 2 + 1] - pts[i * 2 - 1])
  }
  // The perimeter of a closed edge: the walk back from the last point to the first.
  const period = edge.closed
    ? along[n - 1] + Math.hypot(pts[0] - pts[n * 2 - 2], pts[1] - pts[n * 2 - 1])
    : 0
  // Each point's inward normal, and whether the sheet over it is deep enough there.
  const nrm = new Float64Array(n * 2)
  const stays = new Uint8Array(n)
  const span = SET_BACK_WINDOW * sb.distance
  // A closed edge's window never reaches round past the point itself.
  const reach = edge.closed ? (n - 1) >> 1 : n
  // The step from point k to the next, round the loop on a closed edge.
  const stepFrom = (k: number): number => {
    const j = k + 1 < n ? k + 1 : 0
    return Math.hypot(pts[j * 2] - pts[k * 2], pts[j * 2 + 1] - pts[k * 2 + 1])
  }
  const depth = sb.distance + 0.5
  for (let i = 0; i < n; i++) {
    let a = i
    let back = 0
    for (let t = 0; t < reach && back < span; t++) {
      if (!edge.closed && a === 0) break
      const prev = a === 0 ? n - 1 : a - 1
      back += stepFrom(prev)
      a = prev
    }
    let b = i
    let ahead = 0
    for (let t = 0; t < reach && ahead < span; t++) {
      if (!edge.closed && b === n - 1) break
      ahead += stepFrom(b)
      b = b + 1 < n ? b + 1 : 0
    }
    const tx = pts[b * 2] - pts[a * 2]
    const ty = pts[b * 2 + 1] - pts[a * 2 + 1]
    const len = Math.hypot(tx, ty)
    if (len === 0) {
      stays[i] = 1
      continue
    }
    // The walk keeps its union on the left: (ty, −tx) points into it on screen.
    const nx = ty / len
    const ny = -tx / len
    nrm[i * 2] = nx
    nrm[i * 2 + 1] = ny
    const x = pts[i * 2]
    const y = pts[i * 2 + 1]
    if (
      faceAt(sb, x + sb.distance * nx, y + sb.distance * ny) !== inner ||
      faceAt(sb, x + depth * nx, y + depth * ny) !== inner
    )
      stays[i] = 1
  }
  // Arc length to the nearest point that stays (`gap`, eased over one set-back
  // distance: a thin spot dips the run at 45°) and to an end meeting a visible
  // edge (`end`, eased over the ramp): forward and backward sweeps, twice round a
  // closed edge so the gap wraps.
  const gap = new Float64Array(n).fill(Infinity)
  const laps = edge.closed ? 2 : 1
  let last = -Infinity
  for (let t = 0; t < laps * n; t++) {
    const i = t % n
    const s = along[i] + Math.floor(t / n) * period
    if (stays[i]) last = s
    gap[i] = Math.min(gap[i], s - last)
  }
  let next = Infinity
  for (let t = laps * n - 1; t >= 0; t--) {
    const i = t % n
    const s = along[i] + Math.floor(t / n) * period
    if (stays[i]) next = s
    gap[i] = Math.min(gap[i], next - s)
  }
  const total = along[n - 1]
  const out = new Float64Array(n * 2)
  for (let i = 0; i < n; i++) {
    let end = Infinity
    if (!edge.closed && easeStart) end = along[i]
    if (!edge.closed && easeEnd) end = Math.min(end, total - along[i])
    const d = sb.distance * Math.min(1, gap[i] / Math.max(sb.distance, 1e-9), end / sb.ramp)
    out[i * 2] = pts[i * 2] + d * nrm[i * 2]
    out[i * 2 + 1] = pts[i * 2 + 1] + d * nrm[i * 2 + 1]
  }
  return out
}

/**
 * Largest turn, radians, at a join of a fitted edge that a set-back run is
 * fitted across: the 10° tangent break the multimodel fit charges a full corner
 * for (`G1_BREAK_DEGREES`). A sharper join is a corner the set-back keeps.
 */
const SET_BACK_SMOOTH_TURN = (10 * Math.PI) / 180

/** A segment's tangents at its start and end (unnormalized), drawn from (x, y). */
function segmentTangents(x: number, y: number, s: PathCommand): [number, number, number, number] {
  switch (s.type) {
    case 'C': {
      const [ax, ay] = s.x1 !== x || s.y1 !== y ? [s.x1, s.y1] : [s.x2, s.y2]
      const [bx, by] = s.x2 !== s.x || s.y2 !== s.y ? [s.x2, s.y2] : [s.x1, s.y1]
      return [ax - x, ay - y, s.x - bx, s.y - by]
    }
    case 'Q':
      return [s.x1 - x, s.y1 - y, s.x - s.x1, s.y - s.y1]
    case 'A': {
      const c = arcToCenter(x, y, s)
      if (c !== null && c.dTheta !== 0) {
        const at = (t: number): [number, number] => {
          const dx = -c.rx * Math.sin(t) * Math.sign(c.dTheta)
          const dy = c.ry * Math.cos(t) * Math.sign(c.dTheta)
          return [
            Math.cos(c.phi) * dx - Math.sin(c.phi) * dy,
            Math.sin(c.phi) * dx + Math.cos(c.phi) * dy,
          ]
        }
        return [...at(c.theta1), ...at(c.theta1 + c.dTheta)]
      }
      return [s.x - x, s.y - y, s.x - x, s.y - y]
    }
    case 'L':
      return [s.x - x, s.y - y, s.x - x, s.y - y]
    default:
      return [0, 0, 0, 0]
  }
}

/** The turn, radians, at the end of each segment of a fitted edge into the next (the last: 0). */
function joinTurns(fit: FittedEdge): Float64Array {
  const segs = fit.segments
  const tan = new Float64Array(segs.length * 4)
  let x = fit.x0
  let y = fit.y0
  for (let k = 0; k < segs.length; k++) {
    const s = segs[k]
    tan.set(segmentTangents(x, y, s), k * 4)
    if (s.type !== 'Z') {
      x = s.x
      y = s.y
    }
  }
  const turns = new Float64Array(segs.length)
  for (let k = 0; k + 1 < segs.length; k++) {
    const ex = tan[k * 4 + 2]
    const ey = tan[k * 4 + 3]
    const sx = tan[k * 4 + 4]
    const sy = tan[k * 4 + 5]
    turns[k] = Math.abs(Math.atan2(ex * sy - ey * sx, ex * sx + ey * sy))
  }
  return turns
}

/**
 * A layer ring as a closed subpath: visible steps draw the shared fitted edge,
 * hidden ones (`hidden(inner face)`) the shared fit's points
 * ({@link fittedPoints}, one per working pixel) set back. Each run of the
 * fit's segments with a point that moves, joined smoothly (turning at most
 * {@link SET_BACK_SMOOTH_TURN}), is fitted on its own from its moved points;
 * every other segment is drawn as the shared fit draws it. So the layer keeps
 * the fit's corners, and where the sheet over the edge is too thin to set back
 * under, its very segments. Two hidden steps meet halfway between their
 * set-back ends; a step is joined to the last by a line wherever their ends
 * still differ. An edge on the canvas frame is never hidden: nothing lies
 * beyond it to show through, so every sheet that reaches the frame ends on it.
 */
function layerRingCommands(
  map: PlanarMap,
  ring: FaceRing,
  fits: readonly FittedEdge[],
  hidden: (face: number) => boolean,
  sb: SetBack,
): PathCommand[] {
  const m = ring.edges.length
  const inner = ring.edges.map((e, t) =>
    ring.reversed[t] ? map.edges[e].right : map.edges[e].left,
  )
  const isHidden = inner.map((f, t) => {
    const e = map.edges[ring.edges[t]]
    const across = ring.reversed[t] ? e.left : e.right
    return f >= 0 && across !== OUTSIDE && hidden(f)
  })
  const out: PathCommand[] = []
  let px = Number.NaN
  let py = Number.NaN
  const moveOrLine = (x: number, y: number): void => {
    if (out.length === 0) out.push({ type: 'M', x, y })
    else if (x !== px || y !== py) out.push({ type: 'L', x, y })
    px = x
    py = y
  }
  const take = (segs: readonly PathCommand[]): void => {
    for (const c of segs) {
      out.push(c)
      if (c.type !== 'Z' && c.type !== 'M') {
        px = c.x
        py = c.y
      }
    }
  }
  // Each step's fit in walk order and, on a hidden step, its points set back.
  const steps = ring.edges.map((e, t) => {
    const fit = fits[e]
    const last = fit.segments[fit.segments.length - 1] as { x: number; y: number } | undefined
    const walk = ring.reversed[t]
      ? { ...fit, x0: last?.x ?? fit.x0, y0: last?.y ?? fit.y0, segments: reversedSegments(fit) }
      : fit
    if (!isHidden[t]) return { walk, points: null, ends: null, back: null }
    const { points, ends } = fittedPoints(walk, 1)
    const back = setBackPoints(
      { points, closed: map.edges[e].closed },
      inner[t],
      !isHidden[(t + m - 1) % m],
      !isHidden[(t + 1) % m],
      sb,
    )
    return { walk, points, ends, back }
  })
  // Two hidden steps meet where their set-back ends meet: halfway between the
  // two, each moved along its own edge's normal, so the outline does not hook
  // back across the node.
  for (let t = 0; t < m; t++) {
    const a = steps[t].back
    const b = steps[(t + 1) % m].back
    // A ring of one edge has no node to meet at.
    if (m === 1 || a === null || b === null) continue
    const k = a.length - 2
    const x = (a[k] + b[0]) / 2
    const y = (a[k + 1] + b[1]) / 2
    a[k] = b[0] = x
    a[k + 1] = b[1] = y
  }
  for (let t = 0; t < m; t++) {
    const { walk, points, ends, back } = steps[t]
    if (points === null || ends === null || back === null) {
      moveOrLine(walk.x0, walk.y0)
      take(walk.segments)
      continue
    }
    const n = points.length >> 1
    const movedIn = (a: number, b: number): boolean => {
      for (let i = a; i <= b; i++) {
        const k = (i % n) * 2
        if (back[k] !== points[k] || back[k + 1] !== points[k + 1]) return true
      }
      return false
    }
    const segs = walk.segments
    const turns = joinTurns(walk)
    moveOrLine(back[0], back[1])
    for (let k = 0; k < segs.length;) {
      const a = k === 0 ? 0 : ends[k - 1]
      if (!movedIn(a, ends[k])) {
        take([segs[k]])
        k++
        continue
      }
      // A run of moved segments, through their smooth joins: never round a corner.
      let j = k
      while (
        j + 1 < segs.length &&
        turns[j] <= SET_BACK_SMOOTH_TURN &&
        movedIn(ends[j], ends[j + 1])
      )
        j++
      const b = ends[j]
      const run = new Float64Array((b - a + 1) * 2)
      for (let i = a; i <= b; i++) {
        run[(i - a) * 2] = back[(i % n) * 2]
        run[(i - a) * 2 + 1] = back[(i % n) * 2 + 1]
      }
      take(sb.fit(run))
      k = j + 1
    }
  }
  out.push({ type: 'Z' })
  return out
}

/**
 * The stacked sheets: layer `k` (`order[k]`, base first) is the union of the
 * faces of its own label and the faces painted above it that those reach,
 * carried on only through faces that border nothing painted below the sheet,
 * plus every pocket the union encloses whose faces are all painted above it.
 * Every face painted above that the sheet's own faces border is in it, so
 * along any edge the lower face's sheet lies beneath the upper face and no
 * edge can crack. A face painted above that borders a face painted below the
 * sheet does not carry it on: reaching through it would take in faces whose
 * edges with the faces below are then drawn once more, set back, by every sheet
 * between the two — an edge drawn as many times as the paint positions it
 * spans. An enclosed pocket joins, so a sheet carries no hole beneath faces
 * painted over it. Its outline is walked over the shared fitted edges
 * ({@link regionRings}). `paintLabel` is each face's label as the base layers
 * paint it (an island lifted onto its own top layer takes its surround's
 * label); `islands` are the faces painted on top, by layer. A
 * label `alone` names (a translucent paint) is never reached by another layer:
 * the sheets beneath end at its edge, so it composites over what lies there.
 */
export function stackedLayers(
  geo: PlanarGeometry,
  fits: readonly FittedEdge[],
  paintLabel: Int32Array,
  order: readonly number[],
  islands: readonly { label: number; faces: number[] }[],
  setBack?: SetBack,
  alone?: (label: number) => boolean,
): { label: number; shapes: StackedShape[] }[] {
  const { map } = geo
  const { faces, edges } = map
  const position = new Int32Array(Math.max(1, ...order.map((l) => l + 1))).fill(-1)
  order.forEach((l, i) => (position[l] = i))
  const posOf = (f: number): number => {
    const l = paintLabel[f]
    return l >= 0 && l < position.length ? position[l] : -1
  }
  // A face painted alone (translucent) is reached by its own layer only: a sheet
  // beneath it would show through.
  const lone = new Uint8Array(faces.count)
  if (alone)
    for (let f = 0; f < faces.count; f++)
      if (paintLabel[f] >= 0 && alone(paintLabel[f])) lone[f] = 1
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
  // Faces on the frame: a pocket holding one is not enclosed by any sheet.
  const onFrame = new Uint8Array(faces.count)
  for (const e of edges) {
    if (e.left < 0 && e.right >= 0) onFrame[e.right] = 1
    if (e.right < 0 && e.left >= 0) onFrame[e.left] = 1
  }
  const out: { label: number; shapes: StackedShape[] }[] = []
  const inRegion = new Uint8Array(faces.count)
  const seen = new Uint8Array(faces.count)
  const stack: number[] = []
  for (let k = 0; k < order.length; k++) {
    // Whether a face borders a face painted below the sheet, or transparency.
    const bordersBelow = (f: number): boolean => {
      for (let a = adjStart[f]; a < adjStart[f + 1]; a++) if (posOf(adj[a]) < k) return true
      return false
    }
    inRegion.fill(0)
    for (let f = 0; f < faces.count; f++) {
      if (posOf(f) === k) {
        inRegion[f] = 1
        stack.push(f)
      }
    }
    while (stack.length > 0) {
      const f = stack.pop() as number
      // Only the sheet's own faces and faces clear of everything below it carry it on.
      if (posOf(f) !== k && bordersBelow(f)) continue
      for (let a = adjStart[f]; a < adjStart[f + 1]; a++) {
        const g = adj[a]
        if (inRegion[g] === 0 && posOf(g) > k && lone[g] === 0) {
          inRegion[g] = 1
          stack.push(g)
        }
      }
    }
    // The pockets the sheet encloses whose faces are all painted above it.
    seen.fill(0)
    for (let f0 = 0; f0 < faces.count; f0++) {
      if (inRegion[f0] === 1 || seen[f0] === 1) continue
      const pocket = [f0]
      seen[f0] = 1
      let enclosed = true
      for (let i = 0; i < pocket.length; i++) {
        const f = pocket[i]
        if (posOf(f) <= k || lone[f] === 1 || onFrame[f] === 1) enclosed = false
        for (let a = adjStart[f]; a < adjStart[f + 1]; a++) {
          const g = adj[a]
          if (inRegion[g] === 0 && seen[g] === 0) {
            seen[g] = 1
            pocket.push(g)
          }
        }
      }
      if (enclosed) for (const f of pocket) inRegion[f] = 1
    }
    const own = order[k]
    const rings = regionRings(map, inRegion).map((r) => ({
      commands: setBack
        ? layerRingCommands(map, r, fits, (f) => paintLabel[f] !== own, setBack)
        : ringCommands(r, fits),
      poly: faceRingPolygon(map, r),
      // A ring set back beneath a sheet above no longer draws its fit.
      primitive:
        setBack && paintLabel[innerFaces(map, r)[0]] !== own ? null : ringPrimitive(r, fits),
    }))
    out.push({ label: own, shapes: groupRings(rings) })
  }
  for (const island of islands) {
    inRegion.fill(0)
    for (const f of island.faces) inRegion[f] = 1
    const rings = regionRings(map, inRegion).map((r) => ({
      commands: ringCommands(r, fits),
      poly: faceRingPolygon(map, r),
      primitive: ringPrimitive(r, fits),
    }))
    out.push({ label: island.label, shapes: groupRings(rings) })
  }
  return out
}
