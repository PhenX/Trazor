import type { BinaryMask, CurveMode, GrayImage, PathCommand, TurnPolicy } from '@trazor/core'
import { decomposeMask } from './crack'
import type { CrackPath } from './crack'
import { adjustVertices } from './potrace/adjust'
import { assemblePieces } from './potrace/opticurve'
import { optimalPolyline } from './potrace/polyfit'
import { smoothClosed } from './potrace/smooth'
import { computeSums } from './potrace/sums'
import type { FlatPoints } from './paths'
import { refineRingToField } from './refine'
import type { SignedField } from './refine'

export interface TraceCurveOptions {
  curveMode: CurveMode
  /** 0..1, mapped to alphamax = smoothing × 4/3. */
  smoothing: number
  curveOptimize: boolean
  optTolerance: number
  /**
   * Interior angle (deg) below which a vertex is pinned as a corner, and above
   * which pixel-scale jags stay smooth. Omit for the pure Selinger α behavior
   * (byte-identical to no threshold); supply it for angle/scale-aware corners.
   */
  cornerThreshold?: number
  /**
   * Signed boundary field (positive inside a region, zero at the true edge) at
   * mask resolution. When present, boundary vertices are refined onto its zero
   * level for sub-pixel, de-staircased edges. Omit for exact lattice geometry
   * (byte-identical). Ignored in `pixel` curveMode.
   */
  coverage?: GrayImage
}

export interface TraceMaskOptions extends TraceCurveOptions {
  turnPolicy: TurnPolicy
  /** Boundaries enclosing fewer pixels than this are dropped (specks & pinholes). */
  minArea: number
}

export interface TracedShape {
  /** Outer ring followed by its hole rings, evenodd semantics. */
  commands: PathCommand[]
  /** Enclosed pixel area of the outer ring. */
  area: number
  holeCount: number
}

/**
 * Trace a binary mask into filled shapes: Potrace-chain quality curves per
 * boundary, holes grouped under their smallest enclosing shape.
 */
export function traceMask(mask: BinaryMask, opts: TraceMaskOptions): TracedShape[] {
  return shapesFromPaths(decomposeMask(mask, opts.turnPolicy, Math.max(1, opts.minArea)), opts)
}

/**
 * Decomposed crack paths → filled shapes: the curve chain per ring, holes
 * grouped under their smallest enclosing outer ring (evenodd), shapes ordered
 * by descending area. Decomposition depends only on the mask, the turn policy
 * and the area floor, so a caller that keeps the paths can re-run this alone
 * when only the curve options change.
 *
 * `polygons` are the adjusted polygons of `paths` (same length, same order) from
 * {@link ringPolygon}: supplying them skips the polygon stages, so a caller that
 * keeps them re-runs only smoothing and curve optimization. They must have been
 * built against the same sub-pixel field as `opts.coverage`.
 */
export function shapesFromPaths(
  paths: CrackPath[],
  opts: TraceCurveOptions,
  polygons?: readonly (FlatPoints | null)[],
): TracedShape[] {
  const commandsOf = (path: CrackPath, i: number): PathCommand[] =>
    polygons
      ? polygonToCommands(path.points, polygons[i], opts)
      : closedPathToCommands(path.points, opts)

  const outers: { area: number; commands: PathCommand[]; holes: PathCommand[][] }[] = []
  // Decomposition index → index in `outers`. Each hole carries the smallest
  // outer ring enclosing it, and an enclosing ring is always decomposed before
  // the paths it contains, so its entry is already in place here.
  const outerOf = new Int32Array(paths.length)
  for (let i = 0; i < paths.length; i++) {
    const path = paths[i]
    if (path.area > 0) {
      outerOf[i] = outers.length
      outers.push({
        area: path.area,
        commands: commandsOf(path, i),
        holes: [],
      })
    } else if (path.parent >= 0) {
      outers[outerOf[path.parent]].holes.push(commandsOf(path, i))
    }
  }

  const shapes: TracedShape[] = outers.map((o) => ({
    commands: o.commands.concat(...o.holes),
    area: o.area,
    holeCount: o.holes.length,
  }))
  shapes.sort((a, b) => b.area - a.area)
  return shapes
}

/**
 * Full curve chain for one closed crack ring: the polygon stages followed by the
 * curve stages. `field` (a color-boundary field for cutout loops) takes
 * precedence over the mode-level `coverage` (the bw threshold field).
 */
export function closedPathToCommands(
  ring: FlatPoints,
  opts: TraceCurveOptions,
  field?: SignedField,
): PathCommand[] {
  if (opts.curveMode === 'pixel') return pixelCommands(ring)
  return polygonToCommands(ring, ringPolygon(ring, field ?? opts.coverage), opts)
}

/**
 * The polygon half of the chain for one closed ring (Selinger 2003, §2.2 +
 * §2.3.1): optimal polygon, then least-squares vertex adjustment. The ring
 * starts at a guaranteed convex corner (decomposition invariant), so the cycle
 * is linearized there for the straightness/DP stages. Returns the adjusted
 * vertices with the first repeated as the last, or `null` for a ring too short
 * to carry a polygon (the caller falls back to the exact lattice path).
 *
 * It depends on the ring and the optional sub-pixel `field` only — never on
 * smoothing, curve optimization or the corner threshold — so a caller may
 * compute it once and re-fit it many times through {@link polygonToCommands}.
 */
export function ringPolygon(ring: FlatPoints, field?: GrayImage | SignedField): FlatPoints | null {
  // Extended array: append the start point so the DP sees an open anchored path.
  const ext = ring.slice()
  ext.push(ring[0], ring[1])

  const vertexIdx = optimalPolyline(ext)
  if (vertexIdx.length < 4) return null

  // The optimal polygon picks vertices on the integer lattice (its straightness
  // analysis needs unit steps); sub-pixel refinement then feeds only the moment
  // sums and vertex adjustment, so each segment's best-fit line tracks the true
  // edge rather than the staircase.
  const geom = field ? refineRingToField(ext, field) : ext
  const sums = computeSums(geom)
  return adjustVertices(geom, sums, vertexIdx, true)
}

/**
 * The curve half of the chain (Selinger 2003, §2.3.2 + §2.4): an adjusted
 * polygon from {@link ringPolygon} → commands under the curve settings, with
 * adjustment and smoothing cyclic. `pixel` curveMode and a null polygon emit the
 * exact rectilinear ring instead.
 */
export function polygonToCommands(
  ring: FlatPoints,
  polygon: FlatPoints | null,
  opts: TraceCurveOptions,
): PathCommand[] {
  if (opts.curveMode === 'pixel' || polygon === null) return pixelCommands(ring)

  if (opts.curveMode === 'polygon') {
    const out: PathCommand[] = [{ type: 'M', x: polygon[0], y: polygon[1] }]
    // Last adjusted vertex duplicates the first — skip it.
    for (let i = 1; i < (polygon.length >> 1) - 1; i++) {
      out.push({ type: 'L', x: polygon[i * 2], y: polygon[i * 2 + 1] })
    }
    out.push({ type: 'Z' })
    return out
  }

  // Drop the duplicated last vertex for the cyclic stages.
  const ringVerts = polygon.slice(0, polygon.length - 2)
  const alphamax = (opts.smoothing * 4) / 3
  const pieces = smoothClosed(ringVerts, alphamax, opts.cornerThreshold)

  // The path starts at the end anchor of the last piece.
  const lastPiece = pieces[pieces.length - 1]
  const commands: PathCommand[] = [{ type: 'M', x: lastPiece.ex, y: lastPiece.ey }]
  commands.push(
    ...assemblePieces(lastPiece.ex, lastPiece.ey, pieces, opts.curveOptimize, opts.optTolerance),
  )
  commands.push({ type: 'Z' })
  return commands
}

/** Exact rectilinear ring (pixel mode): collinear lattice points collapsed. */
export function pixelCommands(ring: FlatPoints): PathCommand[] {
  const n = ring.length >> 1
  const out: PathCommand[] = []
  for (let i = 0; i < n; i++) {
    const prev = (i + n - 1) % n
    const next = (i + 1) % n
    const dx1 = ring[i * 2] - ring[prev * 2]
    const dy1 = ring[i * 2 + 1] - ring[prev * 2 + 1]
    const dx2 = ring[next * 2] - ring[i * 2]
    const dy2 = ring[next * 2 + 1] - ring[i * 2 + 1]
    if (dx1 * dy2 - dy1 * dx2 !== 0) {
      // Direction changes here — keep the point.
      if (out.length === 0) out.push({ type: 'M', x: ring[i * 2], y: ring[i * 2 + 1] })
      else out.push({ type: 'L', x: ring[i * 2], y: ring[i * 2 + 1] })
    }
  }
  if (out.length === 0) {
    // Degenerate ring (shouldn't happen for crack paths).
    out.push({ type: 'M', x: ring[0], y: ring[1] })
  }
  out.push({ type: 'Z' })
  return out
}
