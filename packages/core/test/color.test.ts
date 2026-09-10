import { describe, expect, it } from 'vitest'
import { deltaEOk, hexToRgb, oklabToRgb, rgbToHex, rgbToOklab } from '@trazor/core'

describe('oklab conversions', () => {
  it('roundtrips sRGB → Oklab → sRGB within 1/255', () => {
    const cases: [number, number, number][] = [
      [230, 40, 40],
      [10, 200, 120],
      [255, 255, 255],
      [0, 0, 0],
      [128, 64, 220],
      [1, 2, 3],
      [250, 250, 5],
    ]
    for (const [r, g, b] of cases) {
      const [L, a, bb] = rgbToOklab(r / 255, g / 255, b / 255)
      const [rr, gg, bbb] = oklabToRgb(L, a, bb)
      expect(Math.abs(rr * 255 - r)).toBeLessThanOrEqual(1)
      expect(Math.abs(gg * 255 - g)).toBeLessThanOrEqual(1)
      expect(Math.abs(bbb * 255 - b)).toBeLessThanOrEqual(1)
    }
  })

  it('maps white to L≈1 and black to L≈0 with no chroma', () => {
    const white = rgbToOklab(1, 1, 1)
    const black = rgbToOklab(0, 0, 0)
    expect(white[0]).toBeCloseTo(1, 3)
    expect(Math.abs(white[1])).toBeLessThan(1e-4)
    expect(Math.abs(white[2])).toBeLessThan(1e-4)
    expect(black[0]).toBeCloseTo(0, 3)
  })

  it('deltaEOk is symmetric and zero for identical colors', () => {
    const a = rgbToOklab(0.2, 0.5, 0.8)
    const b = rgbToOklab(0.8, 0.5, 0.2)
    expect(deltaEOk(a[0], a[1], a[2], a[0], a[1], a[2])).toBe(0)
    expect(deltaEOk(a[0], a[1], a[2], b[0], b[1], b[2])).toBeCloseTo(
      deltaEOk(b[0], b[1], b[2], a[0], a[1], a[2]),
      12,
    )
  })
})

describe('hex parsing', () => {
  it('parses long and short forms and rejects junk', () => {
    expect(hexToRgb('#a1B2c3')).toEqual([0xa1, 0xb2, 0xc3])
    expect(hexToRgb('fff')).toEqual([255, 255, 255])
    expect(hexToRgb('#12')).toBeNull()
    expect(hexToRgb('hello')).toBeNull()
  })

  it('formats and clamps', () => {
    expect(rgbToHex(255, 0, 128)).toBe('#ff0080')
    expect(rgbToHex(300, -5, 12.4)).toBe('#ff000c')
  })
})

describe('lightness toe', () => {
  it('maps [0, 1] onto [0, 1], monotonically, and inverts exactly', async () => {
    const { lightnessToe, lightnessToeInverse } = await import('@trazor/core')
    expect(lightnessToe(0)).toBe(0)
    expect(lightnessToe(1)).toBeCloseTo(1, 6)
    let prev = -1
    for (let i = 0; i <= 100; i++) {
      const L = i / 100
      const Lr = lightnessToe(L)
      expect(Lr).toBeGreaterThan(prev)
      expect(lightnessToeInverse(Lr)).toBeCloseTo(L, 9)
      prev = Lr
    }
  })

  it('pulls the darkest colors together and leaves light tones nearly alone', async () => {
    const { lightnessToe } = await import('@trazor/core')
    const near = rgbToOklab(6 / 255, 6 / 255, 6 / 255)[0]
    // Plain Oklab: (6,6,6) sits far from black; the toe brings it within a hair.
    expect(near).toBeGreaterThan(0.1)
    expect(lightnessToe(near)).toBeLessThan(0.05)
    const light = rgbToOklab(230 / 255, 230 / 255, 230 / 255)[0]
    expect(Math.abs(lightnessToe(light) - light)).toBeLessThan(0.03)
  })
})
