import { mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { resizeGray, resizeToFit, upscaleImage } from '../src/index'
import { channelMeans, grayOf, rasterOf } from './helpers'

describe('resizeToFit', () => {
  it('returns the same object when maxDimension is 0', () => {
    const img = rasterOf(8, 6, () => [10, 20, 30, 255])
    expect(resizeToFit(img, 0)).toBe(img)
  })

  it('returns the same object when the image already fits (never upscales)', () => {
    const img = rasterOf(8, 6, () => [10, 20, 30, 255])
    expect(resizeToFit(img, 8)).toBe(img)
    expect(resizeToFit(img, 100)).toBe(img)
  })

  it('preserves the aspect ratio', () => {
    const img = rasterOf(100, 50, () => [0, 0, 0, 255])
    const out = resizeToFit(img, 10)
    expect(out.width).toBe(10)
    expect(out.height).toBe(5)
  })

  it('halves cleanly: each output pixel is the exact mean of its 2x2 block', () => {
    // 4x2 image, two 2x2 blocks with known channel values.
    const values = [
      [10, 20, 30, 40], // block 0, r channel
      [100, 120, 140, 180], // block 1, r channel
    ]
    const img = rasterOf(4, 2, (x, y) => {
      const block = x >> 1
      const idx = (y & 1) * 2 + (x & 1)
      const v = values[block][idx]
      return [v, 255 - v, v * 2 > 255 ? 255 : v * 2, 200]
    })
    const out = resizeToFit(img, 2)
    expect(out.width).toBe(2)
    expect(out.height).toBe(1)
    // Block 0 mean r = (10+20+30+40)/4 = 25; block 1 = (100+120+140+180)/4 = 135.
    expect(out.data[0]).toBe(25)
    expect(out.data[1]).toBe(255 - 25)
    expect(out.data[4]).toBe(135)
    expect(out.data[5]).toBe(255 - 135)
    expect(out.data[3]).toBe(200)
  })

  it('averages alpha like the other channels', () => {
    const alphas = [0, 255, 255, 255]
    const img = rasterOf(2, 2, (x, y) => [50, 60, 70, alphas[y * 2 + x]])
    const out = resizeToFit(img, 1)
    expect(out.width).toBe(1)
    expect(out.height).toBe(1)
    expect(out.data[3]).toBe(Math.round((0 + 255 + 255 + 255) / 4))
  })

  it('preserves mean color within 1/255 at non-integer scales', () => {
    const rng = mulberry32(1234)
    const img = rasterOf(11, 7, () => [
      (rng() * 256) | 0,
      (rng() * 256) | 0,
      (rng() * 256) | 0,
      (rng() * 256) | 0,
    ])
    const out = resizeToFit(img, 7)
    expect(out.width).toBe(7)
    expect(out.height).toBe(Math.round(7 * (7 / 11)))
    const inMeans = channelMeans(img)
    const outMeans = channelMeans(out)
    for (let c = 0; c < 4; c++) {
      expect(Math.abs(inMeans[c] - outMeans[c])).toBeLessThanOrEqual(1)
    }
  })
})

describe('resizeGray', () => {
  it('returns a fresh copy at identity size', () => {
    const g = grayOf(2, 2, (x, y) => x + 2 * y)
    const out = resizeGray(g, 2, 2)
    expect(out).not.toBe(g)
    expect(Array.from(out.data)).toEqual([0, 1, 2, 3])
  })

  it('bilinearly resamples a 1-D ramp (center-aligned, edge-clamped)', () => {
    const out = resizeGray(
      grayOf(2, 1, (x) => x),
      4,
      1,
    )
    expect(out.width).toBe(4)
    // sx = 0.5; sample centers clamp to 0, 0.25, 0.75, 1.
    const expected = [0, 0.25, 0.75, 1]
    for (let i = 0; i < expected.length; i++) expect(out.data[i]).toBeCloseTo(expected[i], 6)
  })
})

describe('upscaleImage', () => {
  it('returns the same object at factor 1', () => {
    const img = rasterOf(5, 4, () => [10, 20, 30, 255])
    expect(upscaleImage(img, 1)).toBe(img)
  })

  it('keeps a flat image flat at the enlarged size', () => {
    const img = rasterOf(5, 3, () => [10, 200, 30, 180])
    const out = upscaleImage(img, 3)
    expect(out.width).toBe(15)
    expect(out.height).toBe(9)
    for (let i = 0; i < out.data.length; i += 4) {
      expect(Array.from(out.data.subarray(i, i + 4))).toEqual([10, 200, 30, 180])
    }
  })

  it('keeps an edge where the source put it: the half-coverage crossing stays put', () => {
    // A vertical edge at x = 6.25 (column 6 a quarter covered), enlarged 2×.
    const cov = (x: number): number => Math.max(0, Math.min(1, 6.25 - x))
    const img = rasterOf(12, 2, (x) => {
      const v = Math.round(255 * (1 - cov(x)))
      return [v, v, v, 255]
    })
    const out = upscaleImage(img, 2)
    const row = Array.from({ length: out.width }, (_, x) => out.data[x * 4])
    // Crossing of the ½ level, in source pixels (working pixel X spans [X/2, (X+1)/2)).
    let crossing = -1
    for (let x = 0; x + 1 < row.length; x++) {
      if (row[x] < 127.5 && row[x + 1] >= 127.5) {
        const t = (127.5 - row[x]) / (row[x + 1] - row[x])
        crossing = (x + 0.5 + t) / 2
      }
    }
    expect(Math.abs(crossing - 6.25)).toBeLessThan(0.15)
  })

  it('holds a hard edge between its two colors when bounded, rings when not', () => {
    const img = rasterOf(8, 1, (x) => (x < 4 ? [200, 200, 200, 255] : [20, 20, 20, 255]))
    const row = (out: typeof img): number[] =>
      Array.from({ length: out.width }, (_, x) => out.data[x * 4])
    const bounded = row(upscaleImage(img, 2))
    expect(Math.min(...bounded)).toBe(20)
    expect(Math.max(...bounded)).toBe(200)
    const plain = row(upscaleImage(img, 2, false))
    expect(Math.min(...plain)).toBeLessThan(20)
    expect(Math.max(...plain)).toBeGreaterThan(200)
  })

  it('lends a transparent pixel no color: an opaque edge stays its own color', () => {
    const img = rasterOf(6, 1, (x) => (x < 3 ? [230, 20, 40, 255] : [0, 0, 0, 0]))
    const out = upscaleImage(img, 2)
    for (let x = 0; x < out.width; x++) {
      const o = x * 4
      if (out.data[o + 3] === 0) continue
      expect(Array.from(out.data.subarray(o, o + 3))).toEqual([230, 20, 40])
    }
    expect(out.data[(out.width - 1) * 4 + 3]).toBe(0)
  })
})
