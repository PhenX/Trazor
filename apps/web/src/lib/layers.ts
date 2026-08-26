/**
 * Turn the traced SVG's decoded geometry into a layer tree for the layer
 * visualizer. A **layer** is one paint color — the unit a cutting machine
 * weeds and stacks (one vinyl sheet / one screen per color), in the same
 * first-appearance order the serializer groups them by. Each layer holds the
 * individual **shapes** (subpaths) that make it up, so the panel can surface
 * both counts a maker checks before importing: too many layers, or too many
 * shapes on a layer.
 *
 * Pure and DOM-free: it consumes {@link SvgGeometry} (already decoded by
 * `@trazor/svg`) and precomputes the `d` strings and bounding boxes the panel
 * and the preview highlight reuse across renders.
 */

import { buildPathData } from '@trazor/svg'
import type { SvgGeometry, SvgGeometryShape } from '@trazor/svg'
import type { PathCommand } from '@trazor/core'

/** Path-data precision for thumbnails and highlight outlines (display only). */
const THUMB_PRECISION = 2

export interface Bounds {
  minX: number
  minY: number
  maxX: number
  maxY: number
}

/** One contour (subpath) on a layer — the granularity a blade actually cuts. */
export interface LayerShape {
  /** Absolute commands for this single subpath. */
  commands: PathCommand[]
  /** Precomputed `d` for rendering. */
  d: string
  /** Draw nodes (M/L/Q/C, excluding Z). */
  nodeCount: number
  /** Tight-ish bounds (includes off-curve control points, so never clips). */
  bounds: Bounds | null
}

/** One paint color = one selectable/cuttable layer. */
export interface Layer {
  /** Normalized paint key (lowercased hex when it is one), unique per layer. */
  key: string
  /** Color to paint the swatch / thumbnail with (authored value). */
  color: string
  /** True when the color came from `stroke` (centerline / outlined art). */
  stroke: boolean
  /** Layer index in paint order (0-based). */
  index: number
  /** The contours on this layer, in document order. */
  shapes: LayerShape[]
  /** `d` for every contour joined — one fill (evenodd) reproduces holes. */
  d: string
  /** Total draw nodes across the layer. */
  nodeCount: number
  /** Union bounds of every contour. */
  bounds: Bounds | null
}

export interface LayerModel {
  /** Traced document size (viewBox), for full-document previews. */
  width: number | null
  height: number | null
  layers: Layer[]
  /** Totals for the panel summary. */
  totalShapes: number
  totalNodes: number
}

/** Resolve the paint that defines a shape's layer: fill, else stroke. */
function paintOf(shape: SvgGeometryShape): { key: string; color: string; stroke: boolean } | null {
  const fill = shape.fill
  if (fill !== null && fill !== 'none' && fill !== 'transparent') {
    return { key: normalizeKey(fill), color: fill, stroke: false }
  }
  const stroke = shape.stroke
  if (stroke !== null && stroke !== 'none' && stroke !== 'transparent') {
    return { key: normalizeKey(stroke), color: stroke, stroke: true }
  }
  return null
}

/** Lowercase and expand `#rgb` so `#FFF` and `#ffffff` group as one layer. */
function normalizeKey(paint: string): string {
  const c = paint.trim().toLowerCase()
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(c)
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`
  return c
}

/** Split a shape's commands into subpaths, each starting at its `M`. */
function toSubpaths(commands: readonly PathCommand[]): PathCommand[][] {
  const subpaths: PathCommand[][] = []
  let current: PathCommand[] | null = null
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      current = [cmd]
      subpaths.push(current)
    } else if (current) {
      current.push(cmd)
    }
  }
  // Drop subpaths that carry no drawable segment (a lone M).
  return subpaths.filter((sp) => sp.some((c) => c.type !== 'M'))
}

function boundsOf(commands: readonly PathCommand[]): Bounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const add = (x: number, y: number): void => {
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  for (const c of commands) {
    switch (c.type) {
      case 'M':
      case 'L':
        add(c.x, c.y)
        break
      case 'Q':
        add(c.x1, c.y1)
        add(c.x, c.y)
        break
      case 'C':
        add(c.x1, c.y1)
        add(c.x2, c.y2)
        add(c.x, c.y)
        break
      case 'Z':
        break
    }
  }
  return minX <= maxX && minY <= maxY ? { minX, minY, maxX, maxY } : null
}

function unionBounds(a: Bounds | null, b: Bounds | null): Bounds | null {
  if (!a) return b
  if (!b) return a
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  }
}

function countNodes(commands: readonly PathCommand[]): number {
  let n = 0
  for (const c of commands) if (c.type !== 'Z') n++
  return n
}

/**
 * Group decoded geometry into color layers (paint order), each split into its
 * contours. Shapes with no paintable color are ignored (nothing to weed).
 */
export function buildLayers(geometry: SvgGeometry): LayerModel {
  const byKey = new Map<string, Layer>()
  const order: Layer[] = []

  for (const shape of geometry.shapes) {
    const paint = paintOf(shape)
    if (!paint) continue
    let layer = byKey.get(paint.key)
    if (!layer) {
      layer = {
        key: paint.key,
        color: paint.color,
        stroke: paint.stroke,
        index: order.length,
        shapes: [],
        d: '',
        nodeCount: 0,
        bounds: null,
      }
      byKey.set(paint.key, layer)
      order.push(layer)
    }
    for (const sub of toSubpaths(shape.commands)) {
      const bounds = boundsOf(sub)
      layer.shapes.push({
        commands: sub,
        d: buildPathData(sub, THUMB_PRECISION),
        nodeCount: countNodes(sub),
        bounds,
      })
      layer.nodeCount += countNodes(sub)
      layer.bounds = unionBounds(layer.bounds, bounds)
    }
  }

  let totalShapes = 0
  let totalNodes = 0
  for (const layer of order) {
    layer.d = layer.shapes.map((s) => s.d).join(' ')
    totalShapes += layer.shapes.length
    totalNodes += layer.nodeCount
  }

  return {
    width: geometry.width,
    height: geometry.height,
    layers: order,
    totalShapes,
    totalNodes,
  }
}

/**
 * A padded `viewBox` string that frames `bounds` (falling back to the whole
 * document), so a small contour still fills its thumbnail. A minimum span keeps
 * a hairline or a single point from blowing up to sub-pixel scale.
 */
export function framingViewBox(
  bounds: Bounds | null,
  docW: number | null,
  docH: number | null,
): string {
  if (!bounds) return `0 0 ${docW ?? 1} ${docH ?? 1}`
  const w = bounds.maxX - bounds.minX
  const h = bounds.maxY - bounds.minY
  const span = Math.max(w, h, 1)
  const pad = span * 0.08
  // Center the tighter axis so the shape sits in the middle of a square frame.
  const side = span + pad * 2
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  const x = cx - side / 2
  const y = cy - side / 2
  return `${round(x)} ${round(y)} ${round(side)} ${round(side)}`
}

function round(v: number): number {
  return Math.round(v * 100) / 100
}

/** Drawable elements the serializer emits — same set {@link extractGeometry} reads. */
const DRAWABLE_RE = /<(?:path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)>/g

/** Value of a quoted `name="…"` attribute in an element's attribute text. */
function readAttr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
  if (m === null) return null
  return m[1] ?? m[2] ?? ''
}

/** The normalized paint key an element belongs to — fill, else stroke; null when unpainted. */
function paintKeyOfAttrs(attrs: string): string | null {
  const fill = readAttr(attrs, 'fill')
  if (fill !== null && fill !== 'none' && fill !== 'transparent') return normalizeKey(fill)
  const stroke = readAttr(attrs, 'stroke')
  if (stroke !== null && stroke !== 'none' && stroke !== 'transparent') return normalizeKey(stroke)
  return null
}

/**
 * Drop every drawable element whose paint (fill, else stroke) matches one of the
 * `removed` layer keys, leaving the rest of the document — and any now-empty
 * `<g>` wrappers — untouched. Keys are the same normalized paints
 * {@link buildLayers} groups by, so removing a `Layer.key` removes exactly that
 * color's shapes. String-based and DOM-free, like the rest of this module; a
 * pass-through when nothing is removed.
 */
export function filterLayers(svg: string, removed: ReadonlySet<string>): string {
  if (removed.size === 0) return svg
  return svg.replace(DRAWABLE_RE, (full, attrs: string) => {
    const key = paintKeyOfAttrs(attrs)
    return key !== null && removed.has(key) ? '' : full
  })
}
