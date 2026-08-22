import { mulberry32 } from '@vectorizer/core'
import { describe, expect, it } from 'vitest'
import { resizeGray, resizeToFit } from '../src/index'
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
