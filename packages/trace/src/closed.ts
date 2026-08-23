import type { BinaryMask, CurveMode, GrayImage, PathCommand, TurnPolicy } from '@trazor/core'
import type { CrackPath } from './crack'
import { decomposeMask, ringBounds, ringContains } from './crack'
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
  const paths = decomposeMask(mask, opts.turnPolicy, Math.max(1, opts.minArea))

  const outers: {
    path: CrackPath
    commands: PathCommand[]
    bounds: [number, number, number, number]
    holes: PathCommand[][]
  }[] = []
  const holes: CrackPath[] = []
  for (const path of paths) {
    if (path.area > 0) {
      outers.push({
        path,
        commands: closedPathToCommands(path.points, opts),
        bounds: ringBounds(path.points),
        holes: [],
      })
    } else {
      holes.push(path)
    }
  }

  // Group each hole under the smallest outer ring containing its interior.
  const byArea = outers
    .map((o, index) => ({ index, area: o.path.area }))
    .toSorted((a, b) => a.area - b.area)
  for (const hole of holes) {
    const px = hole.interiorX + 0.5
    const py = hole.interiorY + 0.5
    for (const { index } of byArea) {
      const outer = outers[index]
      const [minX, minY, maxX, maxY] = outer.bounds
      if (px < minX || px > maxX || py < minY || py > maxY) continue
      if (ringContains(outer.path.points, px, py)) {
        outer.holes.push(closedPathToCommands(hole.points, opts))
        break
      }
    }
  }

  const shapes: TracedShape[] = outers.map((o) => ({
    commands: o.commands.concat(...o.holes),
    area: o.path.area,
    holeCount: o.holes.length,
  }))
  shapes.sort((a, b) => b.area - a.area)
  return shapes
}

/**
 * Full curve chain for one closed crack ring. The ring starts at a guaranteed
 * convex corner (decomposition invariant), so the cycle is linearized there
 * for the straightness/DP stages, while adjustment and smoothing stay cyclic.
 */
export function closedPathToCommands(
  ring: FlatPoints,
  opts: TraceCurveOptions,
  field?: SignedField,
): PathCommand[] {
  if (opts.curveMode === 'pixel') return pixelCommands(ring)

  // Extended array: append the start point so the DP sees an open anchored path.
  const ext = ring.slice()
  ext.push(ring[0], ring[1])

  const vertexIdx = optimalPolyline(ext)
  if (vertexIdx.length < 4) return pixelCommands(ring)

  // The optimal polygon picks vertices on the integer lattice (its straightness
  // analysis needs unit steps); sub-pixel refinement then feeds only the moment
  // sums and vertex adjustment, so each segment's best-fit line tracks the true
  // edge rather than the staircase. `field` (a color-boundary field for cutout
  // loops) takes precedence over the mode-level `coverage` (bw threshold field).
  const sampler = field ?? opts.coverage
  const geom = sampler ? refineRingToField(ext, sampler) : ext
  const sums = computeSums(geom)
  const adjusted = adjustVertices(geom, sums, vertexIdx, true)

  if (opts.curveMode === 'polygon') {
    const out: PathCommand[] = [{ type: 'M', x: adjusted[0], y: adjusted[1] }]
    // Last adjusted vertex duplicates the first — skip it.
    for (let i = 1; i < (adjusted.length >> 1) - 1; i++) {
      out.push({ type: 'L', x: adjusted[i * 2], y: adjusted[i * 2 + 1] })
    }
    out.push({ type: 'Z' })
    return out
  }

  // Drop the duplicated last vertex for the cyclic stages.
  const ringVerts = adjusted.slice(0, adjusted.length - 2)
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
