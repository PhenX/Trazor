import type { PathCommand } from '@vectorizer/core'
import { describe, expect, it } from 'vitest'
import { analyzeSvg, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

const ring: PathCommand[] = [
  { type: 'M', x: 2, y: 2 },
  { type: 'L', x: 22, y: 2 },
  { type: 'L', x: 22, y: 22 },
  { type: 'L', x: 2, y: 22 },
  { type: 'Z' },
  { type: 'M', x: 8, y: 8 },
  { type: 'L', x: 16, y: 8 },
  { type: 'L', x: 16, y: 16 },
  { type: 'L', x: 8, y: 16 },
  { type: 'Z' },
]

describe('analyzeSvg on serializer output', () => {
  it('round-trips path, node and color counts', () => {
    const doc: SvgDocument = {
      width: 24,
      height: 24,
      unit: 'px',
      title: 'Icon',
      shapes: [
        { commands: ring, fill: '#102030', fillRule: 'evenodd' },
        {
          commands: [
            { type: 'M', x: 4, y: 20 },
            { type: 'Q', x1: 12, y1: 26, x: 20, y: 20 },
          ],
          stroke: '#ff0000',
          strokeWidth: 1.5,
        },
      ],
    }
    const svg = serializeSvg(doc, { precision: 2 })
    const a = analyzeSvg(svg)
    expect(a.pathCount).toBe(2)
    // 8 non-Z commands in the ring + M and Q in the curve.
    expect(a.nodeCount).toBe(10)
    // fill="none" on the stroked path must not enter the palette.
    expect(a.palette).toEqual(['#102030', '#ff0000'])
    expect(a.colorCount).toBe(2)
    expect(a.width).toBe(24)
    expect(a.height).toBe(24)
    expect(a.byteLength).toBe(new TextEncoder().encode(svg).length)
  })

  it('measures byteLength in UTF-8, not UTF-16 code units', () => {
    const svg = serializeSvg(
      { width: 4, height: 4, unit: 'px', title: 'héllo ✓', shapes: [] },
      { precision: 2 },
    )
    const a = analyzeSvg(svg)
    expect(a.byteLength).toBe(new TextEncoder().encode(svg).length)
    expect(a.byteLength).toBeGreaterThan(svg.length)
  })

  it('parses fractional viewBox sizes', () => {
    const svg = serializeSvg(
      { width: 32.4, height: 16.6, unit: 'px', shapes: [] },
      { precision: 3 },
    )
    const a = analyzeSvg(svg)
    expect(a.width).toBe(32.4)
    expect(a.height).toBe(16.6)
  })
})

describe('analyzeSvg on foreign SVG text', () => {
  it('handles style declarations, short hex, quotes and named colors', () => {
    const svg =
      '<svg viewBox="0 0 10 20">' +
      '<rect style="fill:#ABC; stroke: RED" width="5"/>' +
      '<path d="M0 0h5v5H0Z" fill=\'#AABBCC\'/>' +
      '<path d="m1 1 l2 2" stroke="none"/>' +
      '</svg>'
    const a = analyzeSvg(svg)
    expect(a.pathCount).toBe(2)
    // d letters in [MLQCTSAmlqctsa]: M from the first path, m and l from the second.
    expect(a.nodeCount).toBe(3)
    // #ABC expands and merges with #AABBCC; RED lowercases; none is excluded.
    expect(a.palette).toEqual(['#aabbcc', 'red'])
    expect(a.colorCount).toBe(2)
    expect(a.width).toBe(10)
    expect(a.height).toBe(20)
  })

  it('ignores fill-rule / stroke-width attributes and transparent paints', () => {
    const svg =
      '<svg viewBox="0, 0, 3, 4">' +
      '<path d="M0 0L1 1" fill-rule="evenodd" fill="transparent" stroke-width="2" stroke="#0F0"/>' +
      '</svg>'
    const a = analyzeSvg(svg)
    expect(a.pathCount).toBe(1)
    expect(a.nodeCount).toBe(2)
    expect(a.palette).toEqual(['#00ff00'])
    expect(a.width).toBe(3)
    expect(a.height).toBe(4)
  })

  it('returns null sizes without a usable viewBox', () => {
    const a = analyzeSvg('<svg width="10" height="4"><path d="M0 0"/></svg>')
    expect(a.width).toBeNull()
    expect(a.height).toBeNull()
    expect(a.pathCount).toBe(1)
    expect(a.nodeCount).toBe(1)
    expect(a.palette).toEqual([])
    expect(a.colorCount).toBe(0)
  })
})
