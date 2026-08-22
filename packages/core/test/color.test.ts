import { describe, expect, it } from 'vitest'
import { deltaEOk, hexToRgb, oklabToRgb, rgbToHex, rgbToOklab } from '@vectorizer/core'

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
