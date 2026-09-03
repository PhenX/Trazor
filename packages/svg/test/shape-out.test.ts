import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { serializeSvg, shapeOut } from '../src/index'
import type { SerializeOptions, SvgDocument, SvgShape } from '../src/index'

const square = (x0: number, y0: number, x1: number, y1: number): PathCommand[] => [
  { type: 'M', x: x0, y: y0 },
  { type: 'L', x: x1, y: y0 },
  { type: 'L', x: x1, y: y1 },
  { type: 'L', x: x0, y: y1 },
  { type: 'Z' },
]

const circleish = (cx: number, cy: number, r: number): PathCommand[] => {
  const k = r * 0.5522847498
  return [
    { type: 'M', x: cx, y: cy - r },
    { type: 'C', x1: cx + k, y1: cy - r, x2: cx + r, y2: cy - k, x: cx + r, y: cy },
    { type: 'C', x1: cx + r, y1: cy + k, x2: cx + k, y2: cy + r, x: cx, y: cy + r },
    { type: 'C', x1: cx - k, y1: cy + r, x2: cx - r, y2: cy + k, x: cx - r, y: cy },
    { type: 'C', x1: cx - r, y1: cy - k, x2: cx - k, y2: cy - r, x: cx, y: cy - r },
    { type: 'Z' },
  ]
}

/**
 * A document exercising every branch the per-shape half can take: a ring with a
 * hole, two adjacent same-paint shapes that fold into one `<path>`, a primitive
 * candidate, a stroked open path, a shape with no paint at all (dropped) and an
 * empty one, plus recurring layer ids and a gradient reference.
 */
function doc(): SvgDocument {
  const shapes: SvgShape[] = [
    {
      commands: [...square(2, 2, 60, 60), ...square(10, 10, 30, 30)],
      fill: '#102030',
      fillRule: 'evenodd',
      layerId: 0,
    },
    { commands: square(62, 2, 90, 30), fill: '#102030', fillRule: 'evenodd', layerId: 0 },
    { commands: square(62, 34, 90, 60), fill: 'url(#g0)', fillRule: 'evenodd', layerId: 1 },
    { commands: circleish(120, 30, 20), fill: '#a01020', fillRule: 'evenodd', layerId: 2 },
    {
      commands: [
        { type: 'M', x: 5, y: 80 },
        { type: 'Q', x1: 40, y1: 70, x: 80, y: 80 },
      ],
      stroke: '#00ff00',
      strokeWidth: 2.5,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      layerId: 3,
    },
    { commands: square(1, 1, 2, 2), layerId: 4 },
    { commands: [], fill: '#ffffff', layerId: 5 },
  ]
  return {
    width: 160,
    height: 100,
    unit: 'px',
    title: 'Shapes & <parts>',
    defs: [
      {
        id: 'g0',
        kind: 'linear',
        x1: 62,
        y1: 34,
        x2: 90,
        y2: 60,
        stops: [
          { offset: 0, color: '#000000' },
          { offset: 1, color: '#ffffff' },
        ],
      },
    ],
    shapes,
  }
}

const CASES: { name: string; opts: SerializeOptions }[] = [
  { name: 'plain', opts: { precision: 2 } },
  { name: 'optimized', opts: { precision: 2, optimizePaths: true } },
  {
    name: 'optimized with primitives',
    opts: { precision: 2, optimizePaths: true, roundPrimitives: true },
  },
  { name: 'grouped by color', opts: { precision: 2, optimizePaths: true, groupByColor: true } },
  { name: 'grouped by layer', opts: { precision: 2, optimizePaths: true, groupByLayer: true } },
  {
    name: 'pretty, grouped by layer',
    opts: {
      precision: 3,
      optimizePaths: true,
      roundPrimitives: true,
      groupByLayer: true,
      pretty: true,
    },
  },
  { name: 'mm units', opts: { precision: 1, optimizePaths: true } },
]

describe('shapeOut + document assembly', () => {
  for (const { name, opts } of CASES) {
    it(`reproduces serializeSvg for ${name}`, () => {
      const d = name === 'mm units' ? { ...doc(), unit: 'mm' as const, widthMm: 80 } : doc()
      // What a helper pool does: each shape's own SVG is produced separately
      // (order-free, in parallel), and the document assembler folds, groups and
      // orders those parts.
      const parts = d.shapes.map((shape) =>
        shapeOut(shape, opts.precision, opts.optimizePaths === true, opts.roundPrimitives === true),
      )
      expect(serializeSvg(d, opts, parts)).toBe(serializeSvg(d, opts))
    })
  }

  it('drops a shape with no geometry and one with no paint', () => {
    expect(shapeOut({ commands: [], fill: '#000000' }, 2, true, false)).toBeNull()
    expect(shapeOut({ commands: square(0, 0, 4, 4) }, 2, true, false)).toBeNull()
  })

  it('splits an optimized path into its `d` and paint so equal paints fold', () => {
    // A triangle, not a rectangle: an exact rect would come back as an element.
    const tri = (dx: number): PathCommand[] => [
      { type: 'M', x: dx, y: 0 },
      { type: 'L', x: dx + 6, y: 1 },
      { type: 'L', x: dx + 3, y: 7 },
      { type: 'Z' },
    ]
    const a = shapeOut({ commands: tri(0), fill: '#123456' }, 2, true, false)
    const b = shapeOut({ commands: tri(20), fill: '#123456' }, 2, true, false)
    expect(a).toMatchObject({ kind: 'path' })
    expect(b).toMatchObject({ kind: 'path' })
    // Equal paint means the assembler can fold the two into one <path>.
    expect((a as { paint: string }).paint).toBe((b as { paint: string }).paint)
  })

  it('returns a finished element for an unoptimized path', () => {
    const out = shapeOut({ commands: square(0, 0, 4, 4), fill: '#123456' }, 2, false, false)
    expect(out?.kind).toBe('element')
  })
})
