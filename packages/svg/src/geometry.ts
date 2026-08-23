/**
 * Geometry extraction — turn SVG text back into the absolute path model, so a
 * UI can draw an inspection overlay (anchor points, Bézier handles, outlines)
 * that mirrors the exact nodes in the document. Regex/string-based, no DOM, so
 * it runs in Node and workers like {@link analyzeSvg}. Best-effort on foreign
 * SVGs; exact on our own serializer output.
 *
 * Every drawable element becomes one shape whose `commands` are absolute
 * coordinates: `<path>` data is parsed (absolute/relative, `H`/`V`/`S`/`T`
 * shorthands resolved), and `<rect>`/`<circle>`/`<ellipse>`/`<line>`/
 * `<polyline>`/`<polygon>` are converted to the equivalent commands
 * (circles/ellipses via the standard four-Bézier arc approximation). Each shape
 * keeps its source element `kind`, so an overlay can tint primitives apart from
 * traced paths.
 */

import type { PathCommand } from '@trazor/core'
import { arcToCubics } from './arc'

/** Source element a shape came from. */
export type SvgElementKind =
  | 'path'
  | 'rect'
  | 'circle'
  | 'ellipse'
  | 'line'
  | 'polyline'
  | 'polygon'

export interface SvgGeometryShape {
  kind: SvgElementKind
  /** Absolute path commands for this element. */
  commands: PathCommand[]
  /** `fill` value as authored (`'#rrggbb'`, `'none'`, …); null when the attribute is absent. */
  fill: string | null
  /** `stroke` value as authored; null when the attribute is absent. */
  stroke: string | null
  /** `id` attribute value; null when absent. */
  id: string | null
}

export interface SvgGeometry {
  /** viewBox width/height (the overlay coordinate space); null when absent. */
  width: number | null
  height: number | null
  /** One entry per drawable element, in document order. */
  shapes: SvgGeometryShape[]
}

/** Control-point offset that approximates a quarter circle with one cubic. */
const KAPPA = 0.5522847498307936

/** A path-data token: a command letter or a numeric operand. */
interface Token {
  letter?: string
  value?: number
}

// A command letter, or an SVG number (optional sign, decimal, exponent).
const TOKEN_RE = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?)/g

function tokenizePath(d: string): Token[] {
  const tokens: Token[] = []
  for (const m of d.matchAll(TOKEN_RE)) {
    if (m[1] !== undefined) tokens.push({ letter: m[1] })
    else tokens.push({ value: Number(m[2]) })
  }
  return tokens
}

/**
 * Parse a `d` value into absolute `M`/`L`/`Q`/`C`/`Z` commands. `H`/`V` become
 * `L`; `S`/`T` become `C`/`Q` with the reflected control point; `A` is expanded
 * to the equivalent cubic Béziers so an overlay draws the true arc.
 */
function parsePathData(d: string): PathCommand[] {
  const tokens = tokenizePath(d)
  const out: PathCommand[] = []
  let i = 0
  let curX = 0
  let curY = 0
  let startX = 0
  let startY = 0
  // Last cubic/quadratic control points (absolute), for S/T reflection.
  let cCtrlX = 0
  let cCtrlY = 0
  let qCtrlX = 0
  let qCtrlY = 0
  let prev = ''
  let cmd = ''

  // Read the next operand; a missing one (malformed or a following letter)
  // yields 0 without consuming the token.
  const num = (): number => {
    if (i < tokens.length && tokens[i].value !== undefined) return tokens[i++].value as number
    return 0
  }

  while (i < tokens.length) {
    const tk = tokens[i]
    if (tk.letter !== undefined) {
      cmd = tk.letter
      i++
      if (cmd === 'Z' || cmd === 'z') {
        out.push({ type: 'Z' })
        curX = startX
        curY = startY
        prev = 'Z'
        cmd = ''
        continue
      }
    } else {
      if (cmd === '') {
        i++
        continue
      }
      // Repeated operands reuse the last command; a repeated M/m draws lines.
      if (cmd === 'M') cmd = 'L'
      else if (cmd === 'm') cmd = 'l'
    }

    const rel = cmd >= 'a'
    const kind = cmd.toUpperCase()
    const bx = rel ? curX : 0
    const by = rel ? curY : 0

    switch (kind) {
      case 'M': {
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'M', x, y })
        curX = x
        curY = y
        startX = x
        startY = y
        prev = 'M'
        break
      }
      case 'L': {
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'L', x, y })
        curX = x
        curY = y
        prev = 'L'
        break
      }
      case 'H': {
        const x = num() + bx
        out.push({ type: 'L', x, y: curY })
        curX = x
        prev = 'L'
        break
      }
      case 'V': {
        const y = num() + by
        out.push({ type: 'L', x: curX, y })
        curY = y
        prev = 'L'
        break
      }
      case 'Q': {
        const x1 = num() + bx
        const y1 = num() + by
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'Q', x1, y1, x, y })
        qCtrlX = x1
        qCtrlY = y1
        curX = x
        curY = y
        prev = 'Q'
        break
      }
      case 'T': {
        const reflect = prev === 'Q'
        const x1 = reflect ? 2 * curX - qCtrlX : curX
        const y1 = reflect ? 2 * curY - qCtrlY : curY
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'Q', x1, y1, x, y })
        qCtrlX = x1
        qCtrlY = y1
        curX = x
        curY = y
        prev = 'Q'
        break
      }
      case 'C': {
        const x1 = num() + bx
        const y1 = num() + by
        const x2 = num() + bx
        const y2 = num() + by
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'C', x1, y1, x2, y2, x, y })
        cCtrlX = x2
        cCtrlY = y2
        curX = x
        curY = y
        prev = 'C'
        break
      }
      case 'S': {
        const reflect = prev === 'C'
        const x1 = reflect ? 2 * curX - cCtrlX : curX
        const y1 = reflect ? 2 * curY - cCtrlY : curY
        const x2 = num() + bx
        const y2 = num() + by
        const x = num() + bx
        const y = num() + by
        out.push({ type: 'C', x1, y1, x2, y2, x, y })
        cCtrlX = x2
        cCtrlY = y2
        curX = x
        curY = y
        prev = 'C'
        break
      }
      case 'A': {
        // rx ry x-axis-rotation large-arc-flag sweep-flag x y.
        const rx = num()
        const ry = num()
        const rotation = num()
        const largeArc = num() !== 0
        const sweep = num() !== 0
        const x = num() + bx
        const y = num() + by
        const cubics = arcToCubics(curX, curY, {
          type: 'A',
          rx,
          ry,
          rotation,
          largeArc,
          sweep,
          x,
          y,
        })
        for (const c of cubics) out.push(c)
        const lastC = cubics[cubics.length - 1]
        if (lastC !== undefined && lastC.type === 'C') {
          cCtrlX = lastC.x2
          cCtrlY = lastC.y2
        }
        curX = x
        curY = y
        prev = 'C'
        break
      }
      default:
        i++
        break
    }
  }

  return out
}

/** Value of a `"…"`/`'…'` attribute in an element's attribute text. */
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`(?<![\\w-])${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`).exec(attrs)
  if (m === null) return null
  return m[1] ?? m[2] ?? ''
}

/** Numeric attribute value; missing or unparsable ⇒ 0. */
function attrNum(attrs: string, name: string): number {
  const raw = attr(attrs, name)
  if (raw === null) return 0
  const n = Number(raw)
  return Number.isFinite(n) ? n : 0
}

/** Rectangle as a closed 4-line subpath (corner radii ignored). */
function rectCommands(attrs: string): PathCommand[] {
  const x = attrNum(attrs, 'x')
  const y = attrNum(attrs, 'y')
  const w = attrNum(attrs, 'width')
  const h = attrNum(attrs, 'height')
  if (w <= 0 || h <= 0) return []
  return [
    { type: 'M', x, y },
    { type: 'L', x: x + w, y },
    { type: 'L', x: x + w, y: y + h },
    { type: 'L', x, y: y + h },
    { type: 'Z' },
  ]
}

/** Ellipse (or circle) as four cubic Béziers — the standard kappa approximation. */
function ellipseCommands(cx: number, cy: number, rx: number, ry: number): PathCommand[] {
  if (rx <= 0 || ry <= 0) return []
  const ox = rx * KAPPA
  const oy = ry * KAPPA
  return [
    { type: 'M', x: cx + rx, y: cy },
    { type: 'C', x1: cx + rx, y1: cy + oy, x2: cx + ox, y2: cy + ry, x: cx, y: cy + ry },
    { type: 'C', x1: cx - ox, y1: cy + ry, x2: cx - rx, y2: cy + oy, x: cx - rx, y: cy },
    { type: 'C', x1: cx - rx, y1: cy - oy, x2: cx - ox, y2: cy - ry, x: cx, y: cy - ry },
    { type: 'C', x1: cx + ox, y1: cy - ry, x2: cx + rx, y2: cy - oy, x: cx + rx, y: cy },
    { type: 'Z' },
  ]
}

/** Parse a `points` list into an open (polyline) or closed (polygon) subpath. */
function pointsCommands(attrs: string, close: boolean): PathCommand[] {
  const raw = attr(attrs, 'points')
  if (raw === null) return []
  const nums: number[] = []
  for (const m of raw.matchAll(/[+-]?(?:\d*\.\d+|\d+\.?)(?:[eE][+-]?\d+)?/g)) {
    nums.push(Number(m[0]))
  }
  const out: PathCommand[] = []
  for (let p = 0; p + 1 < nums.length; p += 2) {
    out.push({ type: p === 0 ? 'M' : 'L', x: nums[p], y: nums[p + 1] })
  }
  if (close && out.length > 0) out.push({ type: 'Z' })
  return out
}

function elementCommands(tag: SvgElementKind, attrs: string): PathCommand[] {
  switch (tag) {
    case 'path': {
      const d = attr(attrs, 'd')
      return d === null ? [] : parsePathData(d)
    }
    case 'rect':
      return rectCommands(attrs)
    case 'circle': {
      const r = attrNum(attrs, 'r')
      return ellipseCommands(attrNum(attrs, 'cx'), attrNum(attrs, 'cy'), r, r)
    }
    case 'ellipse':
      return ellipseCommands(
        attrNum(attrs, 'cx'),
        attrNum(attrs, 'cy'),
        attrNum(attrs, 'rx'),
        attrNum(attrs, 'ry'),
      )
    case 'line':
      return [
        { type: 'M', x: attrNum(attrs, 'x1'), y: attrNum(attrs, 'y1') },
        { type: 'L', x: attrNum(attrs, 'x2'), y: attrNum(attrs, 'y2') },
      ]
    case 'polyline':
      return pointsCommands(attrs, false)
    case 'polygon':
      return pointsCommands(attrs, true)
    default:
      return []
  }
}

/** Rotate every coordinate of `commands` about (cx, cy) by `deg` degrees. */
function rotateCommands(
  commands: PathCommand[],
  deg: number,
  cx: number,
  cy: number,
): PathCommand[] {
  const a = (deg * Math.PI) / 180
  const co = Math.cos(a)
  const si = Math.sin(a)
  const rot = (x: number, y: number): [number, number] => {
    const dx = x - cx
    const dy = y - cy
    return [cx + dx * co - dy * si, cy + dx * si + dy * co]
  }
  return commands.map((c): PathCommand => {
    switch (c.type) {
      case 'M': {
        const [x, y] = rot(c.x, c.y)
        return { type: 'M', x, y }
      }
      case 'L': {
        const [x, y] = rot(c.x, c.y)
        return { type: 'L', x, y }
      }
      case 'Q': {
        const [x1, y1] = rot(c.x1, c.y1)
        const [x, y] = rot(c.x, c.y)
        return { type: 'Q', x1, y1, x, y }
      }
      case 'C': {
        const [x1, y1] = rot(c.x1, c.y1)
        const [x2, y2] = rot(c.x2, c.y2)
        const [x, y] = rot(c.x, c.y)
        return { type: 'C', x1, y1, x2, y2, x, y }
      }
      default:
        return c
    }
  })
}

/** Apply a `transform` attribute (only `rotate(a [cx cy])`, what the serializer emits). */
function applyTransform(commands: PathCommand[], attrs: string): PathCommand[] {
  const tf = attr(attrs, 'transform')
  if (tf === null) return commands
  const m = /rotate\(\s*([+-]?[\d.eE]+)(?:[\s,]+([+-]?[\d.eE]+)[\s,]+([+-]?[\d.eE]+))?\s*\)/.exec(
    tf,
  )
  if (m === null) return commands
  const deg = Number(m[1])
  if (!Number.isFinite(deg)) return commands
  const cx = m[2] === undefined ? 0 : Number(m[2])
  const cy = m[3] === undefined ? 0 : Number(m[3])
  return rotateCommands(commands, deg, cx, cy)
}

function viewBoxSize(svg: string): { width: number | null; height: number | null } {
  const m = /(?<![\w-])viewBox\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(svg)
  if (m === null) return { width: null, height: null }
  const parts = (m[1] ?? m[2] ?? '').trim().split(/[\s,]+/)
  if (parts.length < 4) return { width: null, height: null }
  const w = Number(parts[2])
  const h = Number(parts[3])
  return {
    width: Number.isFinite(w) ? w : null,
    height: Number.isFinite(h) ? h : null,
  }
}

/**
 * Extract per-shape absolute path geometry from SVG text, preserving document
 * order. Empty shapes are dropped.
 */
export function extractGeometry(svg: string): SvgGeometry {
  const { width, height } = viewBoxSize(svg)
  const shapes: SvgGeometryShape[] = []
  for (const m of svg.matchAll(/<(path|rect|circle|ellipse|line|polyline|polygon)\b([^>]*)>/g)) {
    const kind = m[1] as SvgElementKind
    const attrs = m[2]
    const commands = applyTransform(elementCommands(kind, attrs), attrs)
    if (commands.length > 0) {
      shapes.push({
        kind,
        commands,
        fill: attr(attrs, 'fill'),
        stroke: attr(attrs, 'stroke'),
        id: attr(attrs, 'id'),
      })
    }
  }
  return { width, height, shapes }
}
