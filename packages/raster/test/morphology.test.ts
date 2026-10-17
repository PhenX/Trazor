import { describe, expect, it } from 'vitest'
import { despeckleMaskGuided, maskArea } from '../src/index'
import { maskOf } from './helpers'

describe('despeckleMaskGuided without protection', () => {
  it('removes small foreground specks but keeps large blobs', () => {
    const mask = maskOf(12, 10, (x, y) => {
      if (x >= 1 && x <= 5 && y >= 1 && y <= 5) return true // 5x5 blob
      if (x === 9 && y === 2) return true // single-pixel speck
      return (x === 8 && y === 7) || (x === 9 && y === 8) // diagonal pair
    })
    const out = despeckleMaskGuided(mask, 3, null)
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
    const out = despeckleMaskGuided(mask, 2, null)
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
    const out = despeckleMaskGuided(mask, 2, null)
    expect(out.data[3 * 7 + 3]).toBe(1) // hole filled
    expect(out.data[3 * 7]).toBe(0) // border notch kept
  })

  it('treats diagonal background pixels as separate 4-connected holes', () => {
    const mask = maskOf(8, 8, (x, y) => {
      const inBlob = x >= 1 && x <= 6 && y >= 1 && y <= 6
      const hole = (x === 3 && y === 3) || (x === 4 && y === 4)
      return inBlob && !hole
    })
    const out = despeckleMaskGuided(mask, 2, null)
    // Each 1px hole is its own 4-connected component (< 2), so both fill.
    expect(out.data[3 * 8 + 3]).toBe(1)
    expect(out.data[4 * 8 + 4]).toBe(1)
  })

  it('does not mutate its input', () => {
    const mask = maskOf(5, 5, (x, y) => x === 2 && y === 2)
    const before = new Uint8Array(mask.data)
    despeckleMaskGuided(mask, 4, null)
    expect(mask.data).toEqual(before)
  })
})

describe('despeckleMaskGuided with a protect mask', () => {
  it('protects a small foreground speck that overlaps the protect mask', () => {
    const mask = maskOf(12, 10, (x, y) => {
      if (x >= 1 && x <= 5 && y >= 1 && y <= 5) return true // 5x5 blob
      return x === 9 && y === 2 // single-pixel speck
    })
    const protect = maskOf(12, 10, (x, y) => x === 9 && y === 2)
    const kept = despeckleMaskGuided(mask, 3, protect)
    expect(kept.data[2 * 12 + 9]).toBe(1) // speck survives
    expect(maskArea(kept)).toBe(26)
    // Unprotected, the same speck is removed.
    expect(despeckleMaskGuided(mask, 3, null).data[2 * 12 + 9]).toBe(0)
  })

  it('protects a small hole from being filled', () => {
    const mask = maskOf(7, 7, (x, y) => {
      if (x === 3 && y === 3) return false // 1px interior hole
      return x >= 0 && x <= 6 && y >= 1 && y <= 5
    })
    const protect = maskOf(7, 7, (x, y) => x === 3 && y === 3)
    expect(despeckleMaskGuided(mask, 2, protect).data[3 * 7 + 3]).toBe(0) // hole kept open
    expect(despeckleMaskGuided(mask, 2, null).data[3 * 7 + 3]).toBe(1) // filled without protection
  })
})
