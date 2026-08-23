import { mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { bilateralFilter, gaussianBlur, medianFilter } from '../src/index'
import { rasterOf } from './helpers'

describe('gaussianBlur', () => {
  it('keeps a uniform image uniform (normalized kernel, edge clamp)', () => {
    const img = rasterOf(9, 7, () => [100, 150, 200, 120])
    const out = gaussianBlur(img, 2)
    for (let p = 0; p < out.data.length; p += 4) {
      expect(out.data[p]).toBe(100)
      expect(out.data[p + 1]).toBe(150)
      expect(out.data[p + 2]).toBe(200)
      expect(out.data[p + 3]).toBe(120)
    }
  })

  it('spreads an impulse symmetrically and blurs alpha too', () => {
    const img = rasterOf(9, 9, (x, y) => (x === 4 && y === 4 ? [255, 255, 255, 255] : [0, 0, 0, 0]))
    const out = gaussianBlur(img, 2)
    const at = (x: number, y: number, c: number): number => out.data[(y * 9 + x) * 4 + c]
    expect(at(4, 4, 0)).toBeGreaterThan(at(3, 4, 0))
    expect(at(3, 4, 0)).toBeGreaterThan(0)
    expect(at(3, 4, 0)).toBe(at(5, 4, 0))
    expect(at(4, 3, 0)).toBe(at(4, 5, 0))
    expect(at(3, 4, 0)).toBe(at(4, 3, 0))
    // Alpha is blurred like the color channels.
    expect(at(3, 4, 3)).toBe(at(3, 4, 0))
    expect(at(4, 4, 3)).toBeGreaterThan(0)
  })

  it('returns an untouched copy for radius 0', () => {
    const img = rasterOf(4, 4, (x, y) => [x * 10, y * 10, 0, 255])
    const out = gaussianBlur(img, 0)
    expect(out).not.toBe(img)
    expect(out.data).toEqual(img.data)
  })
})

describe('medianFilter', () => {
  it('removes isolated salt-and-pepper noise', () => {
    const img = rasterOf(9, 9, (x, y) => {
      if ((x === 2 && y === 3) || (x === 6 && y === 6)) return [255, 255, 255, 255]
      if ((x === 4 && y === 1) || (x === 7 && y === 4)) return [0, 0, 0, 255]
      return [128, 128, 128, 255]
    })
    const out = medianFilter(img, 1)
    for (let p = 0; p < out.data.length; p += 4) {
      expect(out.data[p]).toBe(128)
      expect(out.data[p + 1]).toBe(128)
      expect(out.data[p + 2]).toBe(128)
    }
  })

  it('copies alpha unchanged', () => {
    const rng = mulberry32(5)
    const img = rasterOf(7, 7, () => [
      (rng() * 256) | 0,
      (rng() * 256) | 0,
      (rng() * 256) | 0,
      (rng() * 256) | 0,
    ])
    const out = medianFilter(img, 1)
    for (let p = 3; p < out.data.length; p += 4) {
      expect(out.data[p]).toBe(img.data[p])
    }
  })

  it('returns an untouched copy for radius 0', () => {
    const img = rasterOf(3, 3, (x) => [x * 50, 0, 0, 255])
    const out = medianFilter(img, 0)
    expect(out).not.toBe(img)
    expect(out.data).toEqual(img.data)
  })
})

describe('bilateralFilter', () => {
  it('smooths within regions but preserves a strong edge', () => {
    const rng = mulberry32(99)
    const noise = (): number => ((rng() * 7) | 0) - 3
    const img = rasterOf(12, 8, (x) => {
      const base = x < 6 ? 20 : 220
      const v = base + noise()
      return [v, v, v, 255]
    })
    const out = bilateralFilter(img, 2, 2, 20)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 12; x++) {
        const v = out.data[(y * 12 + x) * 4]
        const sideBase = x < 6 ? 20 : 220
        expect(Math.abs(v - sideBase)).toBeLessThan(20)
      }
    }
    // Noise amplitude shrinks: values move toward their side's base color.
    let maxDev = 0
    for (let y = 0; y < 8; y++) {
      for (let x = 1; x < 5; x++) {
        const v = out.data[(y * 12 + x) * 4]
        maxDev = Math.max(maxDev, Math.abs(v - 20))
      }
    }
    expect(maxDev).toBeLessThanOrEqual(2)
  })

  it('copies alpha unchanged', () => {
    const img = rasterOf(5, 5, (x, y) => [100, 100, 100, (x * 5 + y * 7) % 256])
    const out = bilateralFilter(img, 1, 1.5, 30)
    for (let p = 3; p < out.data.length; p += 4) {
      expect(out.data[p]).toBe(img.data[p])
    }
  })
})
