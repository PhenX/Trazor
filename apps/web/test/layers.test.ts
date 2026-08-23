import { extractGeometry, serializeSvg } from '@trazor/svg'
import type { SvgDocument } from '@trazor/svg'
import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { buildLayers, framingViewBox } from '../src/lib/layers'

const tri = (ox: number): PathCommand[] => [
  { type: 'M', x: ox, y: 0 },
  { type: 'L', x: ox + 4, y: 0 },
  { type: 'L', x: ox + 2, y: 4 },
  { type: 'Z' },
]

function svgFrom(shapes: SvgDocument['shapes'], opts = {}): string {
  return serializeSvg({ width: 20, height: 20, unit: 'px', shapes }, { precision: 2, ...opts })
}

describe('buildLayers', () => {
  it('groups shapes into one layer per color in paint order', () => {
    const svg = svgFrom([
      { commands: tri(0), fill: '#ff0000' },
      { commands: tri(6), fill: '#00ff00' },
      { commands: tri(12), fill: '#ff0000' },
    ])
    const model = buildLayers(extractGeometry(svg))
    expect(model.layers.map((l) => l.key)).toEqual(['#ff0000', '#00ff00'])
    // The two red triangles land on the first layer as two contours.
    expect(model.layers[0].shapes).toHaveLength(2)
    expect(model.layers[1].shapes).toHaveLength(1)
    expect(model.totalShapes).toBe(3)
  })

  it('splits a folded multi-subpath path into one shape per contour', () => {
    // Same color: the serializer folds these into a single <path> with two M…Z.
    const svg = svgFrom(
      [
        { commands: tri(0), fill: '#123456' },
        { commands: tri(10), fill: '#123456' },
      ],
      { optimizePaths: true },
    )
    expect((svg.match(/<path/g) ?? []).length).toBe(1)
    const model = buildLayers(extractGeometry(svg))
    expect(model.layers).toHaveLength(1)
    expect(model.layers[0].shapes).toHaveLength(2)
  })

  it('keys a stroke-only layer by its stroke color', () => {
    const svg = svgFrom([
      {
        commands: [
          { type: 'M', x: 1, y: 1 },
          { type: 'L', x: 8, y: 8 },
        ],
        stroke: '#0000ff',
      },
    ])
    const model = buildLayers(extractGeometry(svg))
    expect(model.layers).toHaveLength(1)
    expect(model.layers[0].key).toBe('#0000ff')
    expect(model.layers[0].stroke).toBe(true)
  })

  it('reports document size and per-layer node totals', () => {
    const svg = svgFrom([{ commands: tri(0), fill: '#000000' }])
    const model = buildLayers(extractGeometry(svg))
    expect(model.width).toBe(20)
    expect(model.height).toBe(20)
    // M + L + L (Z excluded).
    expect(model.layers[0].nodeCount).toBe(3)
    expect(model.totalNodes).toBe(3)
  })
})

describe('framingViewBox', () => {
  it('frames the bounds as a padded square', () => {
    const vb = framingViewBox({ minX: 0, minY: 0, maxX: 4, maxY: 4 }, 20, 20).split(' ').map(Number)
    // Square side is the span plus 8% padding on each side.
    expect(vb[2]).toBeCloseTo(4 * 1.16, 5)
    expect(vb[2]).toBe(vb[3])
  })

  it('falls back to the full document when there are no bounds', () => {
    expect(framingViewBox(null, 30, 40)).toBe('0 0 30 40')
  })
})
