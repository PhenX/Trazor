import { describe, expect, it } from 'vitest'
import { mmPerPx } from '../src/utils'

describe('mmPerPx', () => {
  it('derives the width at 96 dpi when widthMm is missing or zero', () => {
    // 96 px at 96 dpi is exactly one inch = 25.4 mm ⇒ 25.4/96 mm per px.
    expect(mmPerPx(96)).toBeCloseTo(25.4 / 96, 10)
    expect(mmPerPx(96, 0)).toBeCloseTo(25.4 / 96, 10)
  })

  it('is resolution-independent under the derived width', () => {
    // Derived width scales with the pixel width, so the ratio is constant.
    expect(mmPerPx(1600)).toBeCloseTo(mmPerPx(400), 10)
  })

  it('uses an explicit physical width when given', () => {
    expect(mmPerPx(200, 100)).toBeCloseTo(0.5, 10)
    expect(mmPerPx(96, 96)).toBeCloseTo(1, 10)
  })

  it('returns 0 for a degenerate width', () => {
    expect(mmPerPx(0)).toBe(0)
    expect(mmPerPx(-5, 10)).toBe(0)
  })
})
