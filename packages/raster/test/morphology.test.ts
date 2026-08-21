import { describe, expect, it } from 'vitest'
import { despeckleMask, dilate, erode, maskArea } from '../src/index'
import { maskOf } from './helpers'

describe('dilate', () => {
  it('grows a point into a (2r+1)^2 square', () => {
    const mask = maskOf(7, 7, (x, y) => x === 3 && y === 3)
    const d1 = dilate(mask, 1)
    expect(maskArea(d1)).toBe(9)
    for (let y = 2; y <= 4; y++) {
      for (let x = 2; x <= 4; x++) expect(d1.data[y * 7 + x]).toBe(1)
    }
    expect(maskArea(dilate(mask, 2))).toBe(25)
  })

  it('clips at the image border', () => {
    const mask = maskOf(3, 3, (x, y) => x === 0 && y === 0)
    expect(maskArea(dilate(mask, 1))).toBe(4)
  })

  it('returns a copy for radius 0', () => {
    const mask = maskOf(3, 3, (x) => x === 1)
    const out = dilate(mask, 0)
    expect(out).not.toBe(mask)
    expect(out.data).toEqual(mask.data)
  })
})

describe('erode', () => {
  it('shrinks a 3x3 square to its center pixel', () => {
    const mask = maskOf(7, 7, (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 4)
    const e = erode(mask, 1)
    expect(maskArea(e)).toBe(1)
    expect(e.data[3 * 7 + 3]).toBe(1)
  })

  it('treats outside the image as background (borders erode)', () => {
    const mask = maskOf(5, 5, () => true)
    const e = erode(mask, 1)
    expect(maskArea(e)).toBe(9)
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        expect(e.data[y * 5 + x]).toBe(x >= 1 && x <= 3 && y >= 1 && y <= 3 ? 1 : 0)
      }
    }
  })

  it('dilate-then-erode (closing) bridges a 1px gap between thick blocks', () => {
    // Two 3x3 blocks separated by a single background column.
    const mask = maskOf(
      9,
      5,
      (x, y) => y >= 1 && y <= 3 && ((x >= 1 && x <= 3) || (x >= 5 && x <= 7)),
    )
    const closed = erode(dilate(mask, 1), 1)
    for (let y = 1; y <= 3; y++) expect(closed.data[y * 9 + 4]).toBe(1)
  })
})

describe('despeckleMask', () => {
  it('removes small foreground specks but keeps large blobs', () => {
    const mask = maskOf(12, 10, (x, y) => {
      if (x >= 1 && x <= 5 && y >= 1 && y <= 5) return true // 5x5 blob
      if (x === 9 && y === 2) return true // single-pixel speck
      return (x === 8 && y === 7) || (x === 9 && y === 8) // diagonal pair
    })
    const out = despeckleMask(mask, 3)
    expect(out.data[2 * 12 + 9]).toBe(0)
    expect(out.data[7 * 12 + 8]).toBe(0)
    expect(out.data[8 * 12 + 9]).toBe(0)
    expect(maskArea(out)).toBe(25)
  })

  it('counts diagonal foreground pixels as one 8-connected component', () => {
    const mask = maskOf(12, 10, (x, y) => {
      if (x >= 1 && x <= 5 && y >= 1 && y <= 5) return true
      return (x === 8 && y === 7) || (x === 9 && y === 8)
    })
    // The diagonal pair has size 2 ≥ minArea 2, so it survives.
    const out = despeckleMask(mask, 2)
    expect(out.data[7 * 12 + 8]).toBe(1)
    expect(out.data[8 * 12 + 9]).toBe(1)
  })

  it('fills interior holes but not background touching the border', () => {
    // A ring with a 1px hole in the middle, plus a 1px border notch.
    const mask = maskOf(7, 7, (x, y) => {
      if (x === 3 && y === 3) return false // hole
      if (x === 0 && y === 3) return false // notch on the border
      return x >= 0 && x <= 6 && y >= 1 && y <= 5
    })
    const out = despeckleMask(mask, 2)
    expect(out.data[3 * 7 + 3]).toBe(1) // hole filled
    expect(out.data[3 * 7]).toBe(0) // border notch kept
  })

  it('treats diagonal background pixels as separate 4-connected holes', () => {
    const mask = maskOf(8, 8, (x, y) => {
      const inBlob = x >= 1 && x <= 6 && y >= 1 && y <= 6
      const hole = (x === 3 && y === 3) || (x === 4 && y === 4)
      return inBlob && !hole
    })
    const out = despeckleMask(mask, 2)
    // Each 1px hole is its own 4-connected component (< 2), so both fill.
    expect(out.data[3 * 8 + 3]).toBe(1)
    expect(out.data[4 * 8 + 4]).toBe(1)
  })

  it('does not mutate its input', () => {
    const mask = maskOf(5, 5, (x, y) => x === 2 && y === 2)
    const before = new Uint8Array(mask.data)
    despeckleMask(mask, 4)
    expect(mask.data).toEqual(before)
  })
})
