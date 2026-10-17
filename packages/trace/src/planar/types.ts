/**
 * The planar-map geometry core's data model: the contract between its stages
 * (faces → planar map → sub-pixel → junctions → boundary solve → fit → repair →
 * rings). Every color mode runs the same chain; only the label front end and
 * the emission differ.
 *
 * Coordinates: y down, pixel `(i, j)` covers `[i, i+1] × [j, j+1]`, so lattice
 * corners sit on integers and pixel centres on half-integers. Colors inside the
 * core are encoded sRGB in `[0, 1]`, premultiplied by alpha — the space a
 * rasterizer composites in, so the boundary solve's forward model is what a
 * browser draws. A transparent face is the zero color.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/planar.rs` (the map) and
 * `inkvec-fit/src/lib.rs` (the fit's objective). See docs/REFERENCES.md.
 */
import type { PathCommand } from '@trazor/core'

/** The virtual face beyond the image frame. */
export const OUTSIDE = -1

/** The label of a face that is transparent in the source. */
export const CLEAR = -1

/**
 * Connected regions of a label map. A face is one 4-connected component of one
 * label (transparency included, as label {@link CLEAR}); two diagonal pixels of
 * the same label are separate faces unless a 4-path joins them.
 */
export interface Faces {
  readonly width: number
  readonly height: number
  /** Face id per pixel, row-major, in `[0, count)`. */
  readonly ids: Int32Array
  readonly count: number
  /** Source label of each face ({@link CLEAR} for a transparent one). */
  readonly label: Int32Array
  /** Pixel count of each face. */
  readonly area: Uint32Array
}

/**
 * A boundary between exactly two faces, stored once and referenced by both.
 *
 * `points` is interleaved `x0, y0, x1, y1, …`. An open edge runs from its
 * `start` node to its `end` node, and its first and last points are those
 * nodes' positions (kept equal by {@link syncNodes}). A closed edge is a loop
 * with no junction (`start === end === -1`) and does not repeat its first
 * point. At build time every point sits on a lattice corner; the sub-pixel,
 * junction and solve stages move them. Travelling along the stored direction,
 * `left` is on the left in the y-down frame (screen view).
 */
export interface PlanarEdge {
  points: Float64Array
  /** Positional uncertainty of each point in px (0.5 on the lattice). */
  sigma: Float64Array
  /**
   * Per point, 1 where the point does not move on its own: a point on the
   * image frame (a stage may at most slide it along the frame), or an open
   * edge's end, which moves only with its node.
   */
  fixed: Uint8Array
  left: number
  right: number
  start: number
  end: number
  closed: boolean
}

/**
 * A junction: a lattice corner where three or more faces meet. A corner where
 * one diagonal is a single face is split into two points instead.
 */
export interface PlanarNode {
  x: number
  y: number
  /**
   * Edge ends meeting here, as `2·edge` for an edge's start and `2·edge + 1`
   * for its end, in counter-clockwise order around the node (screen view).
   */
  ends: number[]
}

export interface PlanarMap {
  readonly width: number
  readonly height: number
  readonly faces: Faces
  readonly edges: PlanarEdge[]
  readonly nodes: PlanarNode[]
}

/**
 * An image in the core's color space: premultiplied encoded sRGB RGBA in
 * `[0, 1]`, four values per pixel (`r·a, g·a, b·a, a`), row-major.
 */
export interface PremultipliedImage {
  readonly width: number
  readonly height: number
  readonly data: Float32Array
}

/**
 * A face's paint as the core models it: premultiplied encoded sRGB in `[0, 1]`
 * and coverage alpha. `at`, when present, is a smooth fill (a gradient) read at
 * a point in pixel coordinates into `out[0..3]` (premultiplied r, g, b, a); the
 * flat components are then its mean.
 */
export interface FaceFill {
  r: number
  g: number
  b: number
  a: number
  at?: (x: number, y: number, out: Float64Array) => void
}

/**
 * The fit's objective (inkvec `FitConfig`): a description costs
 * `0.5·χ² + λ·params`, with χ² weighted by each point's `1/σ²`, and
 * `λ = ln(max(e, extent / precision))` — the nats a coordinate confined to
 * `extent` costs at `precision`. `tau` bounds a span's admissible residual in σ.
 */
export interface FitConfig {
  tau: number
  lambda: number
}

/** {@link FitConfig} from the image extent and the output precision (px). */
export function fitConfig(extent: number, precision = 0.1, tau = 2): FitConfig {
  return { tau, lambda: Math.log(Math.max(Math.E, extent / Math.max(precision, 1e-300))) }
}

/** A whole-edge primitive the choice took over the segment path. */
export type EdgePrimitive =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  /** `rotation` in radians. */
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number; rotation: number }
  | {
      kind: 'rect'
      cx: number
      cy: number
      w: number
      h: number
      /** Corner radius; 0 for a sharp rectangle. */
      r: number
      /** Radians. */
      rotation: number
    }

/**
 * One edge's fitted description. `segments` are absolute `L`, `C` and `A`
 * commands (no `M`, no `Z`) running from `(x0, y0)`; an open edge ends exactly
 * at its end node, a closed one back at `(x0, y0)`. `params` and `chi2` are
 * the description's parameter count and its χ², so later stages compare
 * descriptions under the same objective.
 */
export interface FittedEdge {
  x0: number
  y0: number
  segments: PathCommand[]
  closed: boolean
  params: number
  chi2: number
  primitive?: EdgePrimitive
}

/**
 * One closed boundary of a face, as a walk over its edges: `edges[k]` is an
 * edge index, `reversed[k]` whether the walk takes it against its stored
 * direction. The face lies on the walk's left (screen view) on every ring: an
 * outer ring runs anticlockwise on screen (a negative shoelace sum in y-down),
 * a hole clockwise. A face's rings list its outer ring first.
 */
export interface FaceRing {
  edges: number[]
  reversed: boolean[]
  /** True for the face's outer ring, false for a hole. */
  outer: boolean
}

/**
 * Write each open edge's end points from its nodes' current positions, after a
 * stage moved the nodes.
 */
export function syncNodes(map: PlanarMap): void {
  for (const e of map.edges) {
    if (e.closed) continue
    const n = e.points.length
    const s = map.nodes[e.start]
    const t = map.nodes[e.end]
    e.points[0] = s.x
    e.points[1] = s.y
    e.points[n - 2] = t.x
    e.points[n - 1] = t.y
  }
}
