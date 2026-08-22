/**
 * SVG document model and serializer. Produces compact, valid XML from the
 * engine's path model; the only whitespace in compact mode lives inside `d`
 * attributes.
 */

import type { PathCommand } from '@vectorizer/core'
import { buildPathData, clampPrecision, formatNumber } from './pathdata'
import { optimizePathData } from './optimize'
import { cleanCommands } from './clean'
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
}

export interface SvgDocument {
  /** px viewBox size. */
  width: number
  height: number
  unit: 'px' | 'mm'
  /** Physical width when `unit` is `'mm'`; 0/undefined ⇒ derive at 96 dpi (px / 96 * 25.4). */
  widthMm?: number
  title?: string
  desc?: string
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
}

/** Stable marker emitted right after the opening tag. */
const METADATA_COMMENT = '<!-- Vectorizer: traced client-side -->'

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
  }
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
    const d = assertAttrSafe(optimizePathData(cleaned, precision), 'path data')
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
  // Consecutive optimized paths that share identical paint fold into one
  // <path> (same-fill shapes in our output are disjoint, so the union renders
  // identically). Primitives and un-optimized paths flush the pending run.
  let pending: { d: string; paint: string } | null = null
  const flush = (): void => {
    if (pending !== null) {
      children.push(`<path d="${pending.d}"${pending.paint}/>`)
      pending = null
    }
  }
  for (const shape of doc.shapes) {
    const out = shapeOut(shape, precision, optimize, roundPrimitives)
    if (out === null) continue
    if (out.kind === 'element') {
      flush()
      children.push(out.svg)
    } else if (pending !== null && pending.paint === out.paint) {
      pending.d += ` ${out.d}`
    } else {
      flush()
      pending = { d: out.d, paint: out.paint }
    }
  }
  flush()

  if (opts.pretty === true) {
    return `${open}\n  ${children.join('\n  ')}\n</svg>\n`
  }
  return `${open}${children.join('')}</svg>`
}
