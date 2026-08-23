import { rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { toGrayscale, toOklabBuffer } from '../src/index'
import { rasterOf } from './helpers'

describe('toOklabBuffer', () => {
  it('matches the core rgbToOklab conversion per pixel', () => {
    const colors: Array<[number, number, number, number]> = [
      [0, 0, 0, 255],
      [255, 255, 255, 255],
      [255, 0, 0, 255],
      [0, 255, 0, 128],
      [0, 0, 255, 0],
      [17, 130, 201, 255],
    ]
    const img = rasterOf(colors.length, 1, (x) => colors[x])
    const buf = toOklabBuffer(img)
    expect(buf.length).toBe(colors.length * 3)
    for (let i = 0; i < colors.length; i++) {
      const [r, g, b] = colors[i]
      const [L, A, B] = rgbToOklab(r / 255, g / 255, b / 255)
      expect(buf[i * 3]).toBeCloseTo(L, 6)
      expect(buf[i * 3 + 1]).toBeCloseTo(A, 6)
      expect(buf[i * 3 + 2]).toBeCloseTo(B, 6)
    }
  })
})

describe('toGrayscale', () => {
  it('maps black to 0 and white to 1, monotonically in between', () => {
    const img = rasterOf(4, 1, (x) => {
      const v = [0, 64, 160, 255][x]
      return [v, v, v, 255]
    })
    const g = toGrayscale(img)
    expect(g.data[0]).toBeCloseTo(0, 5)
    expect(g.data[3]).toBeCloseTo(1, 3)
    expect(g.data[1]).toBeGreaterThan(g.data[0])
    expect(g.data[2]).toBeGreaterThan(g.data[1])
    expect(g.data[3]).toBeGreaterThan(g.data[2])
    for (const v of g.data) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })

  it('equals the Oklab L channel of the same pixels', () => {
    const colors: Array<[number, number, number, number]> = [
      [250, 30, 60, 255],
      [12, 200, 100, 255],
      [128, 128, 128, 255],
    ]
    const img = rasterOf(3, 1, (x) => colors[x])
    const g = toGrayscale(img)
    const lab = toOklabBuffer(img)
    for (let i = 0; i < 3; i++) {
      expect(g.data[i]).toBeCloseTo(lab[i * 3], 6)
    }
  })
})
