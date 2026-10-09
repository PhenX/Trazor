import { describe, expect, it } from 'vitest'
import { hexToRgb } from '@trazor/core'
import type { GradientPaint } from '@trazor/core'
import { colorAt } from '../../src/fill/model'
import type { FillModel, LinearFill, Rgb, Stop } from '../../src/fill/model'
import { imperceptible } from '../../src/fill/score'
import { fadeToSvg, fillToPaint, fillToSvg, toHex } from '../../src/fill/svg'

const ramp = (interp: 'srgb' | 'linearRgb'): LinearFill => ({
  kind: 'linear',
  p0: [1.5, 2.5],
  p1: [40.5, 2.5],
  c0: [0, 0, 0],
  c1: [1, 1, 1],
  interp,
  mids: [],
})

/** A gradient paint's color at offset `t`, interpolated in sRGB between its stops. */
function paintAt(g: GradientPaint, t: number): number[] {
  const s = g.stops
  let k = 1
  while (k < s.length - 1 && s[k].offset < t) k++
  const a = s[k - 1]
  const b = s[k]
  const u = b.offset > a.offset ? (t - a.offset) / (b.offset - a.offset) : 0
  const ca = hexToRgb(a.color)!
  const cb = hexToRgb(b.color)!
  return ca.map((v, i) => (v + (cb[i] - v) * u) / 255)
}

describe('fills as SVG', () => {
  it('writes a flat color, a linear and a radial gradient', () => {
    expect(fillToSvg({ kind: 'flat', color: [1, 0.5, 0] }, 'g')).toEqual({
      defs: '',
      fill: '#ff8000',
    })
    const lin = fillToSvg(ramp('linearRgb'), 'g1')
    expect(lin.fill).toBe('url(#g1)')
    expect(lin.defs).toBe(
      '<linearGradient id="g1" gradientUnits="userSpaceOnUse" color-interpolation="linearRGB"' +
        ' x1="1.500" y1="2.500" x2="40.500" y2="2.500"><stop offset="0" stop-color="#000000"/>' +
        '<stop offset="1" stop-color="#ffffff"/></linearGradient>',
    )
    const ell: FillModel = {
      kind: 'radial',
      c: [10.5, 8.5],
      r: 6,
      c0: [1, 0, 0],
      c1: [0, 0, 1],
      interp: 'srgb',
      aspect: 2,
      angle: Math.PI / 6,
      mids: [{ offset: 0.25, color: [0, 1, 0] }],
    }
    expect(fillToSvg(ell, 'e').defs).toBe(
      '<radialGradient id="e" gradientUnits="userSpaceOnUse" gradientTransform="translate(10.500 8.500)' +
        ' rotate(30.00) scale(1 0.5000) translate(-10.500 -8.500)" cx="10.500" cy="8.500" r="6.000">' +
        '<stop offset="0" stop-color="#ff0000"/><stop offset="0.250" stop-color="#00ff00"/>' +
        '<stop offset="1" stop-color="#0000ff"/></radialGradient>',
    )
  })

  it('writes a fade with each stop’s color and opacity', () => {
    const alpha: FillModel = { ...ramp('srgb'), c0: [1, 1, 1], c1: [0.25, 0.25, 0.25] }
    const color: FillModel = { ...ramp('srgb'), c0: [1, 0, 0], c1: [0, 0, 1] }
    const { defs } = fadeToSvg(alpha, color, 'f')
    expect(defs).toContain('<stop offset="0" stop-color="#ff0000" stop-opacity="1.000"/>')
    expect(defs).toContain('<stop offset="1" stop-color="#0000ff" stop-opacity="0.250"/>')
    expect(fadeToSvg({ kind: 'flat', color: [0.5, 0.5, 0.5] }, color, 'f')).toEqual({
      defs: '',
      fill: '#ff0000',
    })
  })

  it('rounds hex channels to the nearest level', () => {
    expect(toHex([0, 0.5, 1])).toBe('#0080ff')
    expect(toHex([-0.1, 1.2, 0.999])).toBe('#00ffff')
  })
})

describe('fills as gradient paint', () => {
  it('has no paint for a flat fill or an ellipse', () => {
    expect(fillToPaint({ kind: 'flat', color: [0, 0, 0] })).toBeNull()
    expect(
      fillToPaint({
        kind: 'radial',
        c: [0, 0],
        r: 1,
        c0: [0, 0, 0],
        c1: [1, 1, 1],
        interp: 'srgb',
        aspect: 1.5,
        angle: 0,
        mids: [],
      }),
    ).toBeNull()
  })

  it('passes an sRGB profile through stop for stop', () => {
    const g = fillToPaint({ ...ramp('srgb'), mids: [{ offset: 0.3, color: [1, 0, 0] }] })!
    expect(g).toEqual({
      kind: 'linear',
      x1: 1.5,
      y1: 2.5,
      x2: 40.5,
      y2: 2.5,
      stops: [
        { offset: 0, color: '#000000' },
        { offset: 0.3, color: '#ff0000' },
        { offset: 1, color: '#ffffff' },
      ],
    })
    const r = fillToPaint({
      kind: 'radial',
      c: [3.5, 4.5],
      r: 9,
      c0: [0, 0, 0],
      c1: [1, 1, 1],
      interp: 'srgb',
      aspect: 1,
      angle: 0,
      mids: [],
    })
    expect(r).toMatchObject({ kind: 'radial', cx: 3.5, cy: 4.5, r: 9 })
  })

  it('draws a linear-light profile with sRGB stops within a level', () => {
    const m = ramp('linearRgb')
    const g = fillToPaint(m)!
    expect(g.stops.length).toBeGreaterThan(2)
    for (let i = 1; i < g.stops.length; i++)
      expect(g.stops[i].offset).toBeGreaterThan(g.stops[i - 1].offset)
    for (let t = 0; t <= 1; t += 0.01) {
      const want = colorAt(m, 1.5 + 39 * t, 2.5)
      const got = paintAt(g, t)
      for (let k = 0; k < 3; k++) expect(Math.abs(got[k] - want[k])).toBeLessThan(2 / 255)
    }
  })
})

describe('imperceptible gradients', () => {
  it('refuses a gradient whose stops all lie within the emitter’s JND', () => {
    const lin = (c0: Rgb, c1: Rgb, mids: Stop[] = []): FillModel => ({
      ...ramp('srgb'),
      c0,
      c1,
      mids,
    })
    expect(imperceptible(lin([0.94, 0.62, 0.34], [0.95, 0.63, 0.35]))).toBe(true)
    // Equal ends but a visible interior stop: the emitter keeps it.
    expect(
      imperceptible(
        lin([0.94, 0.62, 0.34], [0.94, 0.62, 0.34], [{ offset: 0.5, color: [0.5, 0.3, 0.2] }]),
      ),
    ).toBe(false)
    expect(imperceptible(lin([0.1, 0.1, 0.1], [0.9, 0.9, 0.9]))).toBe(false)
    expect(imperceptible({ kind: 'flat', color: [0.5, 0.5, 0.5] })).toBe(false)
  })
})
