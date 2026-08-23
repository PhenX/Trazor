import type { PathCommand } from '@trazor/core'
import { countPathNodes } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { extractGeometry, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

const triangle: PathCommand[] = [
  { type: 'M', x: 1, y: 1 },
  { type: 'L', x: 9, y: 1 },
  { type: 'L', x: 5, y: 9 },
  { type: 'Z' },
]

describe('extractGeometry on serializer output', () => {
  it('round-trips absolute path commands', () => {
    const doc: SvgDocument = {
      width: 10,
      height: 10,
      unit: 'px',
      shapes: [{ commands: triangle, fill: '#123456' }],
    }
    const geo = extractGeometry(serializeSvg(doc, { precision: 0 }))
    expect(geo.width).toBe(10)
    expect(geo.height).toBe(10)
    expect(geo.shapes).toHaveLength(1)
    expect(geo.shapes[0].kind).toBe('path')
    expect(geo.shapes[0].commands).toEqual(triangle)
  })

  it('resolves optimized (relative/H/V) paths to the same absolute geometry', () => {
    const doc: SvgDocument = {
      width: 10,
      height: 10,
      unit: 'px',
      shapes: [{ commands: triangle, fill: '#123456' }],
    }
    const absolute = serializeSvg(doc, { precision: 0 })
    const optimized = serializeSvg(doc, { precision: 0, optimizePaths: true })
    // The optimizer picks shorthand commands, so the two strings differ …
    expect(optimized).not.toBe(absolute)
    // … but the decoded geometry is identical.
    expect(extractGeometry(optimized).shapes[0].commands).toEqual(
      extractGeometry(absolute).shapes[0].commands,
    )
  })

  it('decodes an exact <rect> primitive back to its four corners, tagged rect', () => {
    const square: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'L', x: 0, y: 10 },
      { type: 'Z' },
    ]
    const svg = serializeSvg(
      { width: 10, height: 10, unit: 'px', shapes: [{ commands: square, fill: '#000000' }] },
      { precision: 0, optimizePaths: true },
    )
    expect(svg).toContain('<rect')
    const geo = extractGeometry(svg)
    expect(geo.shapes).toHaveLength(1)
    expect(geo.shapes[0].kind).toBe('rect')
    expect(countPathNodes(geo.shapes[0].commands)).toBe(4)
    expect(geo.shapes[0].commands).toEqual(square)
  })

  it('keeps document order and per-element kinds across mixed elements', () => {
    const svg =
      '<svg viewBox="0 0 20 20"><rect x="1" y="2" width="3" height="4"/>' +
      '<path d="M5 5 L6 6"/></svg>'
    const geo = extractGeometry(svg)
    expect(geo.shapes.map((s) => s.kind)).toEqual(['rect', 'path'])
    expect(geo.shapes[0].commands[0]).toEqual({ type: 'M', x: 1, y: 2 })
    expect(geo.shapes[1].commands[0]).toEqual({ type: 'M', x: 5, y: 5 })
  })

  it('captures per-element paint and id so layers can be grouped by color', () => {
    const svg =
      '<svg viewBox="0 0 20 20">' +
      '<g id="layer-1"><path id="a" d="M0 0 L1 0 L1 1 Z" fill="#ff0000"/></g>' +
      '<path d="M2 2 L3 2" fill="none" stroke="#00ff00"/></svg>'
    const geo = extractGeometry(svg)
    expect(geo.shapes[0]).toMatchObject({ fill: '#ff0000', stroke: null, id: 'a' })
    expect(geo.shapes[1]).toMatchObject({ fill: 'none', stroke: '#00ff00', id: null })
  })
})

describe('extractGeometry path-data parsing', () => {
  it('resolves relative, H/V and Z commands', () => {
    const geo = extractGeometry('<svg viewBox="0 0 10 10"><path d="M1 1 h8 l-4 8 Z"/></svg>')
    expect(geo.shapes[0].commands).toEqual(triangle)
  })

  it('treats extra coordinate pairs after M as implicit line-tos', () => {
    const geo = extractGeometry('<svg viewBox="0 0 4 4"><path d="M0 0 1 1 2 2"/></svg>')
    expect(geo.shapes[0].commands).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 1, y: 1 },
      { type: 'L', x: 2, y: 2 },
    ])
  })

  it('reflects the control point for smooth quadratics (T)', () => {
    const geo = extractGeometry('<svg viewBox="0 0 4 4"><path d="M0 0 Q1 1 2 0 T4 0"/></svg>')
    expect(geo.shapes[0].commands).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'Q', x1: 1, y1: 1, x: 2, y: 0 },
      { type: 'Q', x1: 3, y1: -1, x: 4, y: 0 },
    ])
  })

  it('reflects the control point for smooth cubics (S)', () => {
    const geo = extractGeometry(
      '<svg viewBox="0 0 8 8"><path d="M0 0 C1 1 2 1 3 0 S5 -1 6 0"/></svg>',
    )
    expect(geo.shapes[0].commands).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'C', x1: 1, y1: 1, x2: 2, y2: 1, x: 3, y: 0 },
      { type: 'C', x1: 4, y1: -1, x2: 5, y2: -1, x: 6, y: 0 },
    ])
  })
})

describe('extractGeometry primitive conversion', () => {
  it('converts a circle to four cubic segments through the cardinal points', () => {
    const geo = extractGeometry('<svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="5"/></svg>')
    expect(geo.shapes[0].kind).toBe('circle')
    const cmds = geo.shapes[0].commands
    // M + 4 C + Z, i.e. four on-curve segment ends plus the start anchor.
    expect(cmds.map((c) => c.type)).toEqual(['M', 'C', 'C', 'C', 'C', 'Z'])
    expect(cmds[0]).toMatchObject({ x: 15, y: 10 })
    const ends = cmds.filter((c) => c.type === 'C').map((c) => ({ x: c.x, y: c.y }))
    expect(ends).toEqual([
      { x: 10, y: 15 },
      { x: 5, y: 10 },
      { x: 10, y: 5 },
      { x: 15, y: 10 },
    ])
  })

  it('converts polyline (open) and polygon (closed) points', () => {
    const line = extractGeometry('<svg viewBox="0 0 9 9"><polyline points="0,0 3,3 6,0"/></svg>')
    expect(line.shapes[0].kind).toBe('polyline')
    expect(line.shapes[0].commands.some((c) => c.type === 'Z')).toBe(false)
    const poly = extractGeometry('<svg viewBox="0 0 9 9"><polygon points="0,0 3,3 6,0"/></svg>')
    expect(poly.shapes[0].kind).toBe('polygon')
    expect(poly.shapes[0].commands.at(-1)).toEqual({ type: 'Z' })
  })

  it('applies a rotate transform to an element', () => {
    const geo = extractGeometry(
      '<svg viewBox="0 0 100 100"><ellipse cx="60" cy="50" rx="40" ry="18" transform="rotate(30 60 50)"/></svg>',
    )
    expect(geo.shapes[0].kind).toBe('ellipse')
    const first = geo.shapes[0].commands[0] as Extract<PathCommand, { type: 'M' }>
    // The axis-aligned start point (100, 50) rotated 30° about (60, 50).
    expect(first.type).toBe('M')
    expect(first.x).toBeCloseTo(60 + 40 * Math.cos(Math.PI / 6), 2)
    expect(first.y).toBeCloseTo(50 + 40 * Math.sin(Math.PI / 6), 2)
  })

  it('drops degenerate shapes and reports viewBox dimensions', () => {
    const geo = extractGeometry(
      '<svg viewBox="0 0 30 40"><rect x="0" y="0" width="0" height="5"/><path d=""/></svg>',
    )
    expect(geo.shapes).toHaveLength(0)
    expect(geo.width).toBe(30)
    expect(geo.height).toBe(40)
  })
})
