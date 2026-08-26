import { describe, expect, it } from 'vitest'
import { boundaryIoU, gaussianBlur, hausdorff, ssim } from '../src/index'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

/** A hard vertical black/white step between columns x0−1 and x0. */
function stepAt(x0: number, width = 24, height = 20) {
  return rasterOf(width, height, (x) => (x < x0 ? [0, 0, 0, 255] : [255, 255, 255, 255]) as Rgba)
}

const gray = (v: number) => rasterOf(8, 8, () => [v, v, v, 255] as Rgba)

describe('ssim', () => {
  it('is exactly 1 for identical images', () => {
    expect(ssim(stepAt(12), stepAt(12))).toBe(1)
    expect(ssim(gray(90), gray(90))).toBe(1)
  })

  it('is nearly 0 between black and white constants', () => {
    expect(ssim(gray(0), gray(255))).toBeLessThan(0.1)
  })

  it('drops below 1 for a blurred version of the same scene', () => {
    const a = stepAt(12)
    const b = gaussianBlur(a, 2)
    const s = ssim(a, b)
    expect(s).toBeLessThan(1)
    expect(s).toBeGreaterThan(0.5)
  })

  it('is symmetric', () => {
    const a = stepAt(10)
    const b = gaussianBlur(stepAt(12), 2)
    expect(ssim(a, b)).toBeCloseTo(ssim(b, a), 12)
  })

  it('is deterministic', () => {
    const a = gaussianBlur(stepAt(7), 3)
    const b = gaussianBlur(stepAt(9), 1)
    expect(ssim(a, b)).toBe(ssim(a, b))
  })
})

describe('hausdorff', () => {
  it('is 0 when the boundaries coincide', () => {
    expect(hausdorff(stepAt(12), stepAt(12))).toBe(0)
  })

  it('measures the pixel gap between two parallel boundaries', () => {
    // Edges sit on columns {9,10} and {14,15}; nearest pairing is 5px apart.
    expect(hausdorff(stepAt(10), stepAt(15))).toBeCloseTo(5, 3)
  })

  it('is Infinity when only one image has edges', () => {
    expect(hausdorff(stepAt(12), gray(200))).toBe(Infinity)
    expect(hausdorff(gray(200), stepAt(12))).toBe(Infinity)
  })

  it('is 0 when neither image has edges', () => {
    expect(hausdorff(gray(10), gray(200))).toBe(0)
  })
})

describe('boundaryIoU', () => {
  it('is 1 for identical boundaries', () => {
    expect(boundaryIoU(stepAt(12), stepAt(12))).toBeCloseTo(1, 12)
  })

  it('is 0 for boundaries further apart than the tolerance', () => {
    expect(boundaryIoU(stepAt(10), stepAt(15), 48, 1)).toBe(0)
  })

  it('measures partial overlap of nearby boundaries', () => {
    // Edges {9,10} and {11,12}, dilated by 1: bands 8..11 and 10..13 overlap
    // in 2 of 6 columns.
    expect(boundaryIoU(stepAt(10), stepAt(12), 48, 1)).toBeCloseTo(1 / 3, 3)
  })
})
