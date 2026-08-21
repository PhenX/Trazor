import { describe, expect, it } from 'vitest'
import { chamferDistance, estimateStrokeWidth, maskArea, zhangSuenThin } from '../src/index'
import { hasSolid2x2, isConnected8, maskOf } from './helpers'

describe('zhangSuenThin', () => {
  it('reduces a 5px-thick bar to a connected 1px path spanning its length', () => {
    const mask = maskOf(30, 9, (_x, y) => y >= 2 && y <= 6)
    const thin = zhangSuenThin(mask)
    expect(isConnected8(thin)).toBe(true)
    expect(hasSolid2x2(thin)).toBe(false)
    const area = maskArea(thin)
    expect(area).toBeGreaterThan(0)
    expect(area).toBeLessThan(60)
    let minX = 30
    let maxX = -1
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 30; x++) {
        if (thin.data[y * 30 + x] !== 0) {
          minX = Math.min(minX, x)
          maxX = Math.max(maxX, x)
        }
      }
    }
    expect(minX).toBeLessThanOrEqual(3)
    expect(maxX).toBeGreaterThanOrEqual(26)
  })

  it('keeps a thick L-shape connected and 1px wide', () => {
    const mask = maskOf(24, 24, (x, y) => {
      const vertical = x >= 3 && x <= 7 && y >= 3 && y <= 20
      const horizontal = y >= 16 && y <= 20 && x >= 3 && x <= 20
      return vertical || horizontal
    })
    const thin = zhangSuenThin(mask)
    expect(maskArea(thin)).toBeGreaterThan(10)
    expect(isConnected8(thin)).toBe(true)
    expect(hasSolid2x2(thin)).toBe(false)
  })

  it('leaves an already 1px line untouched', () => {
    const mask = maskOf(10, 5, (x, y) => y === 2 && x >= 1 && x <= 8)
    const thin = zhangSuenThin(mask)
    expect(thin.data).toEqual(mask.data)
  })

  it('handles an empty mask', () => {
    const thin = zhangSuenThin(maskOf(5, 5, () => false))
    expect(maskArea(thin)).toBe(0)
  })
})

describe('chamferDistance', () => {
  it('computes ring distances inside a square', () => {
    // 7x7 image, 5x5 foreground square: distance = ring index from the edge.
    const mask = maskOf(7, 7, (x, y) => x >= 1 && x <= 5 && y >= 1 && y <= 5)
    const d = chamferDistance(mask)
    for (let y = 0; y < 7; y++) {
      for (let x = 0; x < 7; x++) {
        const inside = x >= 1 && x <= 5 && y >= 1 && y <= 5
        const expected = inside ? Math.min(x, y, 6 - x, 6 - y) : 0
        expect(d[y * 7 + x]).toBeCloseTo(expected, 5)
      }
    }
  })

  it('uses 4/3 for the diagonal step', () => {
    const mask = maskOf(5, 5, (x, y) => !(x === 0 && y === 0))
    const d = chamferDistance(mask)
    expect(d[0]).toBe(0)
    expect(d[1]).toBeCloseTo(1, 5)
    expect(d[5]).toBeCloseTo(1, 5)
    expect(d[6]).toBeCloseTo(4 / 3, 5)
  })
})

describe('estimateStrokeWidth', () => {
  it('estimates a 5px bar within ±1.5', () => {
    const mask = maskOf(30, 9, (_x, y) => y >= 2 && y <= 6)
    const skeleton = zhangSuenThin(mask)
    const width = estimateStrokeWidth(mask, skeleton)
    expect(width).toBeGreaterThanOrEqual(3.5)
    expect(width).toBeLessThanOrEqual(6.5)
  })

  it('returns 1 for an empty skeleton', () => {
    const mask = maskOf(6, 6, (x, y) => x === 2 && y === 2)
    const skeleton = maskOf(6, 6, () => false)
    expect(estimateStrokeWidth(mask, skeleton)).toBe(1)
  })
})
