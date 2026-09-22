import { describe, expect, it } from 'vitest'
import {
  ciede2000,
  ciede2000Rgb,
  deltaEOk,
  hexToRgb,
  oklabToRgb,
  rgbToHex,
  rgbToLab,
  rgbToOklab,
} from '@trazor/core'

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

describe('CIEDE2000', () => {
  // Sharma, Wu & Dalal 2005, Table 1: Lab pairs with reference ΔE₀₀ chosen to
  // exercise the hue-rotation term, the near-neutral chroma path, the L*
  // weighting in the shadows, and the ±180° hue wraparound.
  const pairs: [number[], number[], number][] = [
    [[50, 2.6772, -79.7751], [50, 0, -82.7485], 2.0425],
    [[50, 3.1571, -77.2803], [50, 0, -82.7485], 2.8615],
    [[50, 2.8361, -74.02], [50, 0, -82.7485], 3.4412],
    [[50, -1.3802, -84.2814], [50, 0, -82.7485], 1.0],
    [[50, 0, 0], [50, -1, 2], 2.3669],
    [[50, 2.49, -0.001], [50, -2.49, 0.0009], 7.1792],
    [[50, 2.49, -0.001], [50, -2.49, 0.0011], 7.2195],
    [[50, -0.001, 2.49], [50, 0.0009, -2.49], 4.8045],
    [[50, 2.5, 0], [50, 0, -2.5], 4.3065],
    [[50, 2.5, 0], [73, 25, -18], 27.1492],
    [[50, 2.5, 0], [56, -27, -3], 31.903],
    [[60.2574, -34.0099, 36.2677], [60.4626, -34.1751, 39.4387], 1.2644],
    [[63.0109, -31.0961, -5.8663], [62.8187, -29.7946, -4.0864], 1.263],
    [[22.7233, 20.0904, -46.694], [23.0331, 14.973, -42.5619], 2.0373],
    [[90.8027, -2.0831, 1.441], [91.1528, -1.6435, 0.0447], 1.4441],
    [[6.7747, -0.2908, -2.4247], [5.8714, -0.0985, -2.2286], 0.6377],
    [[2.0776, 0.0795, -1.135], [0.9033, -0.0636, -0.5514], 0.9082],
  ]

  it('matches the published reference pairs to 4 decimals', () => {
    for (const [a, b, expected] of pairs) {
      expect(ciede2000(a[0], a[1], a[2], b[0], b[1], b[2])).toBeCloseTo(expected, 4)
    }
  })

  it('is symmetric and zero for identical colors', () => {
    for (const [a, b] of pairs) {
      expect(ciede2000(a[0], a[1], a[2], b[0], b[1], b[2])).toBeCloseTo(
        ciede2000(b[0], b[1], b[2], a[0], a[1], a[2]),
        10,
      )
      expect(ciede2000(a[0], a[1], a[2], a[0], a[1], a[2])).toBe(0)
    }
  })

  it('rgbToLab maps the sRGB anchors to CIELAB', () => {
    expect(rgbToLab(1, 1, 1)).toEqual([
      expect.closeTo(100, 3),
      expect.closeTo(0, 3),
      expect.closeTo(0, 3),
    ])
    expect(rgbToLab(0, 0, 0)).toEqual([0, 0, 0])
    // Pure sRGB red: the CIELAB anchor is L*≈53.24, a*≈80.09, b*≈67.20.
    expect(rgbToLab(1, 0, 0)).toEqual([
      expect.closeTo(53.24, 2),
      expect.closeTo(80.09, 2),
      expect.closeTo(67.2, 2),
    ])
  })

  it('ciede2000Rgb reflects the Oklab-too-strict-near-black gap', () => {
    // #000 vs #0a0a0a are two distinct inks perceptually — well above a 1.5 floor.
    expect(ciede2000Rgb(0, 0, 0, 0x0a, 0x0a, 0x0a)).toBeGreaterThan(1.5)
    // Two near-identical mid grays stay far below the floor.
    expect(ciede2000Rgb(128, 128, 128, 129, 129, 129)).toBeLessThan(1.5)
  })
})
