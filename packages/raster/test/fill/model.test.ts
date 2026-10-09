import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import {
  colorAt,
  FillEval,
  fillKind,
  fillParams,
  fillT,
  flatOnly,
  isGradient,
  linearT,
  linearToSrgb32,
  radialT,
  representative,
  srgbToLinear32,
  unmixPair,
  withStops,
} from '../../src/fill/model'
import type { FillModel, Interp, Rgb, Stop } from '../../src/fill/model'
import { bicLambda } from '../../src/fill/select'

/** Largest per-channel difference of two colors. */
function diff3(a: Rgb, b: readonly number[]): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]))
}

const linear = (c0: Rgb, c1: Rgb, mids: Stop[] = [], interp: Interp = 'srgb'): FillModel => ({
  kind: 'linear',
  p0: [0, 0],
  p1: [10, 0],
  c0,
  c1,
  interp,
  mids,
})

const radialModel = (aspect: number, mids: Stop[] = [], interp: Interp = 'srgb'): FillModel => ({
  kind: 'radial',
  c: [0, 0],
  r: 1,
  c0: [0, 0, 0],
  c1: [1, 1, 1],
  interp,
  aspect,
  angle: 0,
  mids,
})

describe('gradient coordinates', () => {
  it('measures the elliptical radius along and across the r semi-axis', () => {
    const ang = (30 * Math.PI) / 180
    const c = [3, -2] as const
    // Along the r semi-axis, 5 out of 10: half way.
    expect(radialT(3 + 5 * Math.cos(ang), -2 + 5 * Math.sin(ang), c, 10, 2, ang)).toBeCloseTo(
      0.5,
      12,
    )
    // Across it, the semi-axis is r / aspect = 5: 2.5 out is half way.
    expect(radialT(3 - 2.5 * Math.sin(ang), -2 + 2.5 * Math.cos(ang), c, 10, 2, ang)).toBeCloseTo(
      0.5,
      12,
    )
    // Diagonal in the ellipse's frame: u = 3, v = 2·2 = 4, ρ = 5.
    const x = 3 + 3 * Math.cos(ang) - 2 * Math.sin(ang)
    const y = -2 + 3 * Math.sin(ang) + 2 * Math.cos(ang)
    expect(radialT(x, y, c, 10, 2, ang)).toBeCloseTo(0.5, 12)
    // Circular, padded beyond the rim, and degenerate.
    expect(radialT(6, 8, [0, 0], 20, 1, 0.7)).toBeCloseTo(0.5, 12)
    expect(radialT(40, 0, [0, 0], 20, 1, 0)).toBe(1)
    expect(radialT(4, 0, [0, 0], 0, 1, 0)).toBe(0)
  })

  it('projects onto a linear axis, padded beyond its ends', () => {
    const p0 = [1, 1] as const
    const p1 = [5, 4] as const
    expect(linearT(3, 2.5, p0, p1)).toBeCloseTo(0.5, 12)
    // A perpendicular offset does not move t.
    expect(linearT(0, 6.5, p0, p1)).toBeCloseTo(0.5, 12)
    expect(linearT(-10, -10, p0, p1)).toBe(0)
    expect(linearT(50, 50, p0, p1)).toBe(1)
    expect(linearT(3, 3, p0, p0)).toBe(0)
  })
})

describe('stop interpolation', () => {
  it('interpolates two stops in linear light and in sRGB', () => {
    const k: Rgb = [0, 0, 0]
    const w: Rgb = [1, 1, 1]
    // Half way from black to white in linear light is linear 0.5, sRGB 0.7354.
    expect(
      diff3(colorAt(linear(k, w, [], 'linearRgb'), 5, 0), [0.735357, 0.735357, 0.735357]),
    ).toBeLessThanOrEqual(1e-5)
    expect(diff3(colorAt(linear(k, w), 2.5, 0), [0.25, 0.25, 0.25])).toBeLessThanOrEqual(1e-7)
    const c0: Rgb = [0.2, 0.4, 0.6]
    const c1: Rgb = [0.6, 0.2, 1]
    expect(diff3(colorAt(linear(c0, c1, [], 'linearRgb'), 0, 0), c0)).toBeLessThanOrEqual(1e-6)
    expect(diff3(colorAt(linear(c0, c1, [], 'linearRgb'), 10, 0), c1)).toBeLessThanOrEqual(1e-6)
  })

  it('evaluates interior stops piecewise', () => {
    const k: Rgb = [0, 0, 0]
    const mid: Stop = { offset: 0.5, color: [1, 1, 1] }
    // t = 0.25 is half way from c0 to the mid, t = 0.75 half way from the mid to c1.
    expect(
      diff3(colorAt(linear(k, [1, 1, 1], [mid]), 2.5, 0), [0.5, 0.5, 0.5]),
    ).toBeLessThanOrEqual(1e-6)
    expect(diff3(colorAt(linear(k, k, [mid]), 7.5, 0), [0.5, 0.5, 0.5])).toBeLessThanOrEqual(1e-6)
    const two: Stop[] = [
      { offset: 0.2, color: [0.2, 0.2, 0.2] },
      { offset: 0.6, color: [0.2, 0.2, 0.2] },
    ]
    expect(diff3(colorAt(linear(k, [1, 1, 1], two), 8, 0), [0.6, 0.6, 0.6])).toBeLessThanOrEqual(
      1e-6,
    )
    expect(diff3(colorAt(linear(k, [1, 1, 1], two), 1, 0), [0.1, 0.1, 0.1])).toBeLessThanOrEqual(
      1e-6,
    )
  })

  it('evaluates a prepared model exactly as a one-off evaluation', () => {
    const rand = mulberry32(7)
    const col = (): Rgb => [Math.fround(rand()), Math.fround(rand()), Math.fround(rand())]
    for (let n = 0; n < 48; n++) {
      const interp: Interp = n % 2 === 0 ? 'linearRgb' : 'srgb'
      const mids = Array.from({ length: n % 3 }, () => ({
        offset: 0.1 + 0.8 * rand(),
        color: col(),
      }))
      mids.sort((a, b) => a.offset - b.offset)
      const shape = Math.floor(n / 2) % 4
      const model: FillModel =
        shape === 0
          ? {
              kind: 'linear',
              p0: [3, 4],
              p1: [40 * rand(), 25],
              c0: col(),
              c1: col(),
              interp,
              mids,
            }
          : shape === 1
            ? { kind: 'flat', color: col() }
            : {
                kind: 'radial',
                c: [20, 18],
                r: 5 + 20 * rand(),
                c0: col(),
                c1: col(),
                interp,
                aspect: shape === 2 ? 1 : 0.4 + rand(),
                angle: 3 * rand(),
                mids,
              }
      const ev = new FillEval(model)
      const out = new Float32Array(3)
      for (let i = 0; i < 50; i++) {
        const x = 48 * rand()
        const y = 48 * rand()
        ev.colorAt(x, y, out, 0)
        expect(Array.from(out)).toEqual([...colorAt(model, x, y)])
        expect(ev.tAt(x, y)).toBe(fillT(model, x, y))
      }
    }
  })

  it('keeps the single-precision transfer curves inverse to each other on 8-bit levels', () => {
    for (let v = 0; v <= 255; v++) {
      const c = Math.fround(v / 255)
      expect(Math.abs(linearToSrgb32(srgbToLinear32(c)) - c)).toBeLessThan(1e-6)
      expect(srgbToLinear32(c)).toBe(Math.fround(srgbToLinear32(c)))
    }
  })
})

describe('description lengths and names', () => {
  it('counts editable numbers', () => {
    const mid: Stop[] = [{ offset: 0.5, color: [0.5, 0.5, 0.5] }]
    expect(fillParams({ kind: 'flat', color: [0, 0, 0] })).toBe(3)
    expect(fillParams(radialModel(1))).toBe(9)
    expect(fillParams(radialModel(2))).toBe(11)
    expect(fillParams(radialModel(2, mid))).toBe(15)
    expect(fillParams(radialModel(1, mid))).toBe(13)
    expect(fillParams(linear([0, 0, 0], [1, 1, 1], mid, 'linearRgb'))).toBe(14)
    expect(fillKind(radialModel(2))).toBe('ellipse/srgb')
    expect(fillKind(radialModel(1))).toBe('radial/srgb')
    expect(fillKind(radialModel(1, [], 'linearRgb'))).toBe('radial/lin')
    expect(fillKind(radialModel(1.5, [], 'linearRgb'))).toBe('ellipse/lin')
    expect(fillKind(linear([0, 0, 0], [1, 1, 1], [], 'linearRgb'))).toBe('linear/lin')
    expect(fillKind({ kind: 'flat', color: [0, 0, 0] })).toBe('flat')
    expect(isGradient({ kind: 'flat', color: [0, 0, 0] })).toBe(false)
    expect(isGradient(radialModel(1))).toBe(true)
  })

  it('stands in for a gradient with the midpoint of its end stops', () => {
    expect(
      diff3(representative(linear([0.2, 0.4, 1], [0.6, 0, 0.5])), [0.4, 0.2, 0.75]),
    ).toBeLessThanOrEqual(1e-7)
    expect(representative({ kind: 'flat', color: [0.3, 0.3, 0.3] })).toEqual([0.3, 0.3, 0.3])
  })

  it('prices BIC and an assigned flat fill', () => {
    expect(bicLambda(100)).toBeCloseTo(0.5 * Math.log(100), 12)
    expect(bicLambda(0)).toBeCloseTo(0.5 * Math.log(2), 12)
    const f = flatOnly([0.5, 0.25, 1], 2)
    expect(f.chi2).toBe(0)
    expect(f.cost).toBe(6)
  })

  it('replaces a profile and leaves a flat fill alone', () => {
    const g = withStops(
      radialModel(1.5),
      [0.1, 0.1, 0.1],
      [{ offset: 0.3, color: [0.5, 0.5, 0.5] }],
      [1, 0, 0],
    )
    expect(g.kind === 'radial' && g.aspect === 1.5 && g.mids.length === 1 && g.c1[0] === 1).toBe(
      true,
    )
    const flat: FillModel = { kind: 'flat', color: [0.2, 0.2, 0.2] }
    expect(withStops(flat, [1, 1, 1], [], [0, 0, 0])).toBe(flat)
  })
})

describe('unmixPair', () => {
  it('unmixes two flats against their colors and Euclidean separation', () => {
    const a: FillModel = { kind: 'flat', color: [1, 0, 0] }
    const b: FillModel = { kind: 'flat', color: [0, 0, 1] }
    const u = unmixPair(a, b, 3, 4)
    expect([u.a, u.b]).toEqual([
      [1, 0, 0],
      [0, 0, 1],
    ])
    expect(u.separation).toBeCloseTo(Math.SQRT2, 6)
  })

  it('takes whichever pair separates a flat and a gradient more', () => {
    const a: FillModel = { kind: 'flat', color: [1, 0, 0] }
    const g = linear([0, 0, 0], [1, 0, 0])
    // At x = 10 the gradient is pure red, like `a`: the representatives separate 0.5.
    expect(unmixPair(a, g, 10, 0).separation).toBeCloseTo(0.5, 6)
    // At x = 0 the gradient is black: the local pair separates 1.
    const u = unmixPair(a, g, 0, 0)
    expect(u.separation).toBeCloseTo(1, 6)
    expect(u.b).toEqual([0, 0, 0])
  })
})
