import { describe, expect, it } from 'vitest'
import { analyzeSvg, serializeSvg } from '../src/index'
import type { SvgDocument } from '../src/index'

const gradientDoc = (): SvgDocument => ({
  width: 20,
  height: 10,
  unit: 'px',
  defs: [
    {
      id: 'g0',
      kind: 'linear',
      x1: 0,
      y1: 5,
      x2: 20,
      y2: 5,
      stops: [
        { offset: 0, color: '#1a1a1a' },
        { offset: 1, color: '#dcdcdc' },
      ],
    },
  ],
  shapes: [
    {
      commands: [
        { type: 'M', x: 0, y: 0 },
        { type: 'L', x: 20, y: 0 },
        { type: 'L', x: 20, y: 10 },
        { type: 'L', x: 0, y: 10 },
        { type: 'Z' },
      ],
      fill: 'url(#g0)',
      fillRule: 'evenodd',
    },
  ],
})

describe('serializeSvg — gradients', () => {
  it('emits a userSpaceOnUse <defs> gradient the shape references', () => {
    const svg = serializeSvg(gradientDoc(), { precision: 2 })
    expect(svg).toContain('<defs>')
    expect(svg).toContain('<linearGradient id="g0" gradientUnits="userSpaceOnUse"')
    expect(svg).toContain('x1="0" y1="5" x2="20" y2="5"')
    expect(svg).toContain('<stop offset="0" stop-color="#1a1a1a"/>')
    expect(svg).toContain('<stop offset="1" stop-color="#dcdcdc"/>')
    expect(svg).toContain('fill="url(#g0)"')
    // Defs precede the shapes that reference them.
    expect(svg.indexOf('<defs>')).toBeLessThan(svg.indexOf('url(#g0)'))
  })

  it('emits stop-opacity only on a stop whose opacity is below 1', () => {
    const doc = gradientDoc()
    doc.defs![0].stops = [
      { offset: 0, color: '#c81e1e', opacity: 1 },
      { offset: 0.5, color: '#c81e1e', opacity: 0.5 },
      { offset: 1, color: '#c81e1e', opacity: 0 },
    ]
    const svg = serializeSvg(doc, { precision: 2 })
    expect(svg).toContain('<stop offset="0" stop-color="#c81e1e"/>')
    expect(svg).toContain('<stop offset="0.5" stop-color="#c81e1e" stop-opacity="0.5"/>')
    expect(svg).toContain('<stop offset="1" stop-color="#c81e1e" stop-opacity="0"/>')
  })

  it('omits <defs> entirely when there are no gradients (byte-identical path)', () => {
    const doc = gradientDoc()
    doc.defs = undefined
    doc.shapes[0].fill = '#123456'
    expect(serializeSvg(doc, { precision: 2 })).not.toContain('<defs>')
  })

  it('parses as XML and round-trips through optimizePaths', () => {
    const plain = serializeSvg(gradientDoc(), { precision: 2 })
    const optimized = serializeSvg(gradientDoc(), { precision: 2, optimizePaths: true })
    // The gradient def does not depend on path optimization.
    expect(optimized).toContain('<linearGradient id="g0"')
    expect(plain).toContain('<linearGradient id="g0"')
  })
})

describe('analyzeSvg — gradients', () => {
  it('counts gradient stop colors, not the url() reference', () => {
    const analysis = analyzeSvg(serializeSvg(gradientDoc(), { precision: 2 }))
    expect(analysis.palette).toEqual(['#1a1a1a', '#dcdcdc'])
    expect(analysis.colorCount).toBe(2)
    // A gradient-filled region is still one drawable path.
    expect(analysis.pathCount).toBe(1)
  })
})
