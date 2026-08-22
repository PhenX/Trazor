/**
 * SVG document model and serializer. Produces compact, valid XML from the
 * engine's path model; the only whitespace in compact mode lives inside `d`
 * attributes.
 */

import type { PathCommand } from '@vectorizer/core'
import { buildPathData, clampPrecision, formatNumber } from './pathdata'

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

function serializeShape(shape: SvgShape, precision: number): string | null {
  if (shape.commands.length === 0) return null
  if (shape.fill === undefined && shape.stroke === undefined) return null

  const d = assertAttrSafe(buildPathData(shape.commands, precision), 'path data')
  if (d === '') return null

  let attrs = `d="${d}"`
  const fill = shape.fill === undefined ? 'none' : assertAttrSafe(shape.fill, 'fill')
  attrs += ` fill="${fill}"`
  if (shape.fillRule !== undefined) attrs += ` fill-rule="${shape.fillRule}"`
  if (shape.stroke !== undefined) attrs += ` stroke="${assertAttrSafe(shape.stroke, 'stroke')}"`
  if (shape.strokeWidth !== undefined) {
    attrs += ` stroke-width="${formatNumber(shape.strokeWidth, precision)}"`
  }
  if (shape.strokeLinecap !== undefined) attrs += ` stroke-linecap="${shape.strokeLinecap}"`
  if (shape.strokeLinejoin !== undefined) attrs += ` stroke-linejoin="${shape.strokeLinejoin}"`
  if (shape.id !== undefined && shape.id !== '') attrs += ` id="${xmlEscape(shape.id)}"`
  return `<path ${attrs}/>`
}

/**
 * Serialize a document to SVG text. Compact by default (a single line with no
 * inter-tag whitespace); `pretty` puts each child on its own 2-space-indented
 * line and ends with a newline.
 */
export function serializeSvg(doc: SvgDocument, opts: SerializeOptions): string {
  const precision = clampPrecision(opts.precision)
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
  for (const shape of doc.shapes) {
    const path = serializeShape(shape, precision)
    if (path !== null) children.push(path)
  }

  if (opts.pretty === true) {
    return `${open}\n  ${children.join('\n  ')}\n</svg>\n`
  }
  return `${open}${children.join('')}</svg>`
}
