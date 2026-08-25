/**
 * SVG document model and serializer. Produces compact, valid XML from the
 * engine's path model; the only whitespace in compact mode lives inside `d`
 * attributes.
 */

import type { GradientPaint, PathCommand } from '@trazor/core'
import { buildPathData, clampPrecision, formatNumber } from './pathdata'
import { optimizePathData } from './optimize'
import { cleanCommands } from './clean'
import { fitArcs } from './arc'
import { detectPrimitive } from './primitive'
import type { Primitive } from './primitive'

export interface SvgShape {
  /** May contain several M…Z subpaths. */
  commands: PathCommand[]
  /** `'#rrggbb'` or `'none'`. Undefined ⇒ `fill="none"` when stroked, else the shape is skipped. */
  fill?: string
  fillRule?: 'nonzero' | 'evenodd'
  stroke?: string
  strokeWidth?: number
  strokeLinecap?: 'butt' | 'round' | 'square'
  strokeLinejoin?: 'miter' | 'round' | 'bevel'
  id?: string
  /**
   * Stacking layer this shape belongs to (paint order). Shapes sharing a value
   * form one cut layer under `groupByLayer` — used by stacked color output,
   * where a color can recur at different heights (a base outline and a pupil
   * island on top) and so must stay separate layers, not one merged color.
   */
  layerId?: number
}

/** A gradient paint server (`@trazor/core` `GradientPaint`) plus the `id` a shape
 *  references it by (`fill="url(#id)"`). Emitted in `<defs>`. */
export type SvgGradient = GradientPaint & { id: string }

export interface SvgDocument {
  /** px viewBox size. */
  width: number
  height: number
  unit: 'px' | 'mm'
  /** Physical width when `unit` is `'mm'`; 0/undefined ⇒ derive at 96 dpi (px / 96 * 25.4). */
  widthMm?: number
  title?: string
  desc?: string
  /** Gradient paint servers referenced by shape fills (`fill: 'url(#id)'`). */
  defs?: SvgGradient[]
  shapes: SvgShape[]
}

export interface SerializeOptions {
  /** Coordinate decimals, 0..4. */
  precision: number
  /** Newline per path when true; default compact (no whitespace between tags). */
  pretty?: boolean
  /**
   * Compact `d` values with relative/`H`/`V` command selection, collinear-point
   * removal, and exact `<rect>` detection (never larger, same geometry).
   * Default false ⇒ absolute `M`/`L`/`Q`/`C` only.
   */
  optimizePaths?: boolean
  /**
   * When optimizing, also emit `<circle>`/`<ellipse>` for near-circular loops
   * (a sub-pixel change). Leave off for cutout mode, where a neighbor still
   * traces the Bézier boundary and must match exactly. Default false.
   */
  roundPrimitives?: boolean
  /**
   * Wrap the shapes of each paint color in its own `<g>` layer (fill color, or
   * stroke when there is no fill), in first-appearance order, each carrying an
   * `id` and a `<title>` naming the color. Cut/print software then reads one
   * selectable layer per color. Reorders same-color shapes to sit together;
   * safe for a disjoint partition (cutout) or one-run-per-color paint order
   * (stacked). Default false. */
  groupByColor?: boolean
  /**
   * Wrap each stacking layer (a run of shapes sharing `layerId`) in its own
   * `<g>`, in paint order, each `<title>`d with its color. Unlike
   * `groupByColor` this keeps a color that recurs at different heights (a base
   * outline and a pupil island above it) as separate, correctly ordered layers
   * — the cut order for stacked vinyl. Takes precedence over `groupByColor`.
   * Default false. */
  groupByLayer?: boolean
}

/** Stable marker emitted right after the opening tag. */
const METADATA_COMMENT = '<!-- Trazor: traced client-side -->'

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
}

/** Escape text for use in XML content and quoted attribute values. */
function xmlEscape(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => XML_ESCAPES[ch])
}

/**
 * Values that never legitimately need escaping (path data, hex colors) still
 * must not be able to break out of their attribute — fail loudly if they would.
 */
function assertAttrSafe(value: string, what: string): string {
  if (value.includes('<') || value.includes('"')) {
    throw new Error(`unsafe ${what} in SVG output: ${JSON.stringify(value)}`)
  }
  return value
}

/** Fill/stroke/id attributes shared by `<path>` and primitive elements. */
function paintAttrs(shape: SvgShape, precision: number, includeFillRule: boolean): string {
  let attrs = ''
  const fill = shape.fill === undefined ? 'none' : assertAttrSafe(shape.fill, 'fill')
  attrs += ` fill="${fill}"`
  if (includeFillRule && shape.fillRule !== undefined) attrs += ` fill-rule="${shape.fillRule}"`
  if (shape.stroke !== undefined) attrs += ` stroke="${assertAttrSafe(shape.stroke, 'stroke')}"`
  if (shape.strokeWidth !== undefined) {
    attrs += ` stroke-width="${formatNumber(shape.strokeWidth, precision)}"`
  }
  if (shape.strokeLinecap !== undefined) attrs += ` stroke-linecap="${shape.strokeLinecap}"`
  if (shape.strokeLinejoin !== undefined) attrs += ` stroke-linejoin="${shape.strokeLinejoin}"`
  if (shape.id !== undefined && shape.id !== '') attrs += ` id="${xmlEscape(shape.id)}"`
  return attrs
}

/** A detected primitive as its SVG element (fill-rule dropped — a single region). */
function primitiveElement(prim: Primitive, shape: SvgShape, precision: number): string {
  const paint = paintAttrs(shape, precision, false)
  const n = (v: number): string => formatNumber(v, precision)
  switch (prim.kind) {
    case 'rect':
      return `<rect x="${n(prim.x)}" y="${n(prim.y)}" width="${n(prim.width)}" height="${n(prim.height)}"${paint}/>`
    case 'rrect':
      return `<rect x="${n(prim.x)}" y="${n(prim.y)}" width="${n(prim.width)}" height="${n(prim.height)}" rx="${n(prim.r)}"${paint}/>`
    case 'circle':
      return `<circle cx="${n(prim.cx)}" cy="${n(prim.cy)}" r="${n(prim.r)}"${paint}/>`
    case 'ellipse': {
      const transform =
        prim.angle !== undefined && Math.abs(prim.angle) > 0.05
          ? ` transform="rotate(${n(prim.angle)} ${n(prim.cx)} ${n(prim.cy)})"`
          : ''
      return `<ellipse cx="${n(prim.cx)}" cy="${n(prim.cy)}" rx="${n(prim.rx)}" ry="${n(prim.ry)}"${transform}${paint}/>`
    }
    case 'polygon': {
      const points = prim.points.map((p) => `${n(p.x)},${n(p.y)}`).join(' ')
      return `<polygon points="${points}"${paint}/>`
    }
  }
}

/**
 * A gradient as its `<defs>` element. Coordinates are user space
 * (`gradientUnits="userSpaceOnUse"`), so they share the paths' pixel space and
 * need no per-shape normalization. Stop offsets carry their own precision (only
 * ever 0/1 today) independent of the coordinate precision.
 */
function gradientElement(g: SvgGradient, precision: number): string {
  const n = (v: number): string => formatNumber(v, precision)
  const stops = g.stops
    .map(
      (s) =>
        `<stop offset="${formatNumber(s.offset, 3)}" stop-color="${assertAttrSafe(s.color, 'stop-color')}"/>`,
    )
    .join('')
  const id = xmlEscape(g.id)
  if (g.kind === 'linear') {
    return (
      `<linearGradient id="${id}" gradientUnits="userSpaceOnUse"` +
      ` x1="${n(g.x1)}" y1="${n(g.y1)}" x2="${n(g.x2)}" y2="${n(g.y2)}">${stops}</linearGradient>`
    )
  }
  return (
    `<radialGradient id="${id}" gradientUnits="userSpaceOnUse"` +
    ` cx="${n(g.cx)}" cy="${n(g.cy)}" r="${n(g.r)}">${stops}</radialGradient>`
  )
}

/**
 * A shape as either a finished element (primitive or an un-optimized path) or,
 * when optimizing, a path split into its `d` and paint so consecutive shapes
 * sharing the exact paint can be merged into one `<path>`.
 */
type ShapeOut = { kind: 'element'; svg: string } | { kind: 'path'; d: string; paint: string }

function shapeOut(
  shape: SvgShape,
  precision: number,
  optimize: boolean,
  roundPrimitives: boolean,
): ShapeOut | null {
  if (shape.commands.length === 0) return null
  if (shape.fill === undefined && shape.stroke === undefined) return null

  if (optimize) {
    const cleaned = cleanCommands(shape.commands, precision)
    const prim = detectPrimitive(cleaned, precision, roundPrimitives)
    if (prim !== null) return { kind: 'element', svg: primitiveElement(prim, shape, precision) }
    // Collapse circular-arc cubic runs to `A` (a sub-pixel geometry change, like
    // circle/ellipse detection); off for cutout so a neighbor's Bézier boundary
    // still matches exactly and the classical path stays byte-identical.
    const arced = roundPrimitives ? fitArcs(cleaned, precision) : cleaned
    const d = assertAttrSafe(optimizePathData(arced, precision), 'path data')
    if (d === '') return null
    return { kind: 'path', d, paint: paintAttrs(shape, precision, true) }
  }

  const d = assertAttrSafe(buildPathData(shape.commands, precision), 'path data')
  if (d === '') return null
  return { kind: 'element', svg: `<path d="${d}"${paintAttrs(shape, precision, true)}/>` }
}

/**
 * Serialize a document to SVG text. Compact by default (a single line with no
 * inter-tag whitespace); `pretty` puts each child on its own 2-space-indented
 * line and ends with a newline.
 */
export function serializeSvg(doc: SvgDocument, opts: SerializeOptions): string {
  const precision = clampPrecision(opts.precision)
  const optimize = opts.optimizePaths === true
  const roundPrimitives = opts.roundPrimitives === true
  const w = formatNumber(doc.width, precision)
  const h = formatNumber(doc.height, precision)

  let widthAttr: string
  let heightAttr: string
  if (doc.unit === 'mm') {
    const widthMm =
      doc.widthMm !== undefined && doc.widthMm > 0 ? doc.widthMm : (doc.width / 96) * 25.4
    const heightMm = doc.width > 0 ? widthMm * (doc.height / doc.width) : 0
    widthAttr = `${formatNumber(widthMm, 3)}mm`
    heightAttr = `${formatNumber(heightMm, 3)}mm`
  } else {
    widthAttr = w
    heightAttr = h
  }

  const open =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}"` +
    ` width="${widthAttr}" height="${heightAttr}">`

  const children: string[] = [METADATA_COMMENT]
  if (doc.title !== undefined && doc.title !== '') {
    children.push(`<title>${xmlEscape(doc.title)}</title>`)
  }
  if (doc.desc !== undefined && doc.desc !== '') {
    children.push(`<desc>${xmlEscape(doc.desc)}</desc>`)
  }
  if (doc.defs !== undefined && doc.defs.length > 0) {
    const body = doc.defs.map((g) => gradientElement(g, precision))
    children.push(
      opts.pretty === true
        ? `<defs>\n    ${body.join('\n    ')}\n  </defs>`
        : `<defs>${body.join('')}</defs>`,
    )
  }
  if (opts.groupByLayer === true || opts.groupByColor === true) {
    // One <g> per layer: by paint order (runs sharing `layerId`) for
    // groupByLayer, else one per paint color (first-appearance order). Each
    // group's shapes fold into a single <path>; pretty mode indents them.
    const groups =
      opts.groupByLayer === true ? groupShapesByLayer(doc.shapes) : groupShapesByColor(doc.shapes)
    let layer = 0
    for (const group of groups) {
      const body = foldShapes(group.shapes, precision, optimize, roundPrimitives)
      if (body.length === 0) continue
      layer++
      const groupOpen = `<g id="layer-${layer}"><title>${xmlEscape(group.key)}</title>`
      children.push(
        opts.pretty === true
          ? `${groupOpen}\n    ${body.join('\n    ')}\n  </g>`
          : `${groupOpen}${body.join('')}</g>`,
      )
    }
  } else {
    for (const child of foldShapes(doc.shapes, precision, optimize, roundPrimitives)) {
      children.push(child)
    }
  }

  if (opts.pretty === true) {
    return `${open}\n  ${children.join('\n  ')}\n</svg>\n`
  }
  return `${open}${children.join('')}</svg>`
}

/**
 * Emit shapes as finished element strings. Consecutive optimized paths that
 * share identical paint fold into one `<path>` (same-paint shapes in our output
 * are disjoint, so the union renders identically); primitives and un-optimized
 * paths flush the pending run. Shapes that produce no output are dropped.
 */
function foldShapes(
  shapes: readonly SvgShape[],
  precision: number,
  optimize: boolean,
  roundPrimitives: boolean,
): string[] {
  const out: string[] = []
  let pending: { d: string; paint: string } | null = null
  const flush = (): void => {
    if (pending !== null) {
      out.push(`<path d="${pending.d}"${pending.paint}/>`)
      pending = null
    }
  }
  for (const shape of shapes) {
    const so = shapeOut(shape, precision, optimize, roundPrimitives)
    if (so === null) continue
    if (so.kind === 'element') {
      flush()
      out.push(so.svg)
    } else if (pending !== null && pending.paint === so.paint) {
      pending.d += ` ${so.d}`
    } else {
      flush()
      pending = { d: so.d, paint: so.paint }
    }
  }
  flush()
  return out
}

/** Paint key of a shape — its fill, or its stroke when there is no fill. */
function paintKeyOf(shape: SvgShape): string {
  return shape.fill !== undefined && shape.fill !== 'none' ? shape.fill : (shape.stroke ?? '')
}

/**
 * Partition shapes into one bucket per paint color — the fill, or the stroke
 * when there is no fill — keeping the order in which each color first appears.
 */
function groupShapesByColor(shapes: readonly SvgShape[]): { key: string; shapes: SvgShape[] }[] {
  const groups: { key: string; shapes: SvgShape[] }[] = []
  const byKey = new Map<string, SvgShape[]>()
  for (const shape of shapes) {
    const key = paintKeyOf(shape)
    let bucket = byKey.get(key)
    if (bucket === undefined) {
      bucket = []
      byKey.set(key, bucket)
      groups.push({ key, shapes: bucket })
    }
    bucket.push(shape)
  }
  return groups
}

/**
 * Partition shapes into runs sharing `layerId`, preserving paint order — one
 * group per stacking layer, keyed by the run's paint color. A shape with no
 * `layerId` forms its own run, so mixed input still serializes sanely.
 */
function groupShapesByLayer(shapes: readonly SvgShape[]): { key: string; shapes: SvgShape[] }[] {
  const groups: { key: string; shapes: SvgShape[] }[] = []
  let current: { shapes: SvgShape[]; id: number | undefined } | null = null
  for (const shape of shapes) {
    const id = shape.layerId
    if (current === null || id === undefined || id !== current.id) {
      current = { shapes: [shape], id }
      groups.push({ key: paintKeyOf(shape), shapes: current.shapes })
    } else {
      current.shapes.push(shape)
    }
  }
  return groups
}
