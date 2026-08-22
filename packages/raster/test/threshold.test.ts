import { describe, expect, it } from 'vitest'
import { adaptiveBinarize, binarize, otsuThreshold } from '../src/index'
import { grayOf, maskOf } from './helpers'

describe('otsuThreshold', () => {
  it('lands between the modes of a bimodal histogram', () => {
    const g = grayOf(20, 10, (x) => (x < 10 ? 0.2 : 0.8))
    const t = otsuThreshold(g)
    expect(t).toBeGreaterThan(0.3)
    expect(t).toBeLessThan(0.7)
    const ink = binarize(g, t, false)
    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 20; x++) {
        expect(ink.data[y * 20 + x]).toBe(x < 10 ? 1 : 0)
      }
    }
  })

  it('separates modes with unequal populations and spread', () => {
    const g = grayOf(30, 10, (x) => {
      if (x < 24) return 0.15 + 0.01 * (x % 5) // large dark mode
      return 0.75 + 0.02 * (x % 3) // small bright mode
    })
    const t = otsuThreshold(g)
    expect(t).toBeGreaterThan(0.2)
    expect(t).toBeLessThan(0.75)
  })

  it('returns 0.5 for a degenerate single-mode image', () => {
    expect(otsuThreshold(grayOf(8, 8, () => 0.42))).toBe(0.5)
  })

  it('returns 0.5 for an empty mask', () => {
    const g = grayOf(4, 4, (x) => x / 4)
    expect(
      otsuThreshold(
        g,
        maskOf(4, 4, () => false),
      ),
    ).toBe(0.5)
  })

  it('ignores out-of-mask pixels', () => {
    // In-mask: modes at 0.1 / 0.4. Out-of-mask: bright 0.9 pixels that would
    // drag a global threshold up.
    const g = grayOf(30, 4, (x) => (x < 10 ? 0.1 : x < 20 ? 0.4 : 0.9))
    const mask = maskOf(30, 4, (x) => x < 20)
    const t = otsuThreshold(g, mask)
    expect(t).toBeGreaterThan(0.1)
    expect(t).toBeLessThan(0.4)
  })
})

describe('binarize', () => {
  it('marks ink where gray < threshold, XOR invert', () => {
    const g = grayOf(4, 1, (x) => [0.1, 0.4, 0.6, 0.9][x])
    expect([...binarize(g, 0.5, false).data]).toEqual([1, 1, 0, 0])
    expect([...binarize(g, 0.5, true).data]).toEqual([0, 0, 1, 1])
  })

  it('forces out-of-mask pixels to 0 even when inverted', () => {
    const g = grayOf(4, 1, () => 0.9)
    const mask = maskOf(4, 1, (x) => x < 2)
    expect([...binarize(g, 0.5, true, mask).data]).toEqual([1, 1, 0, 0])
  })
})

describe('adaptiveBinarize', () => {
  it('finds dark marks on both ends of an illumination gradient', () => {
    // Background gradient 0.2 → 0.8 across x, with two much darker dots.
    const dots = new Set(['5,4', '26,4'])
    const g = grayOf(32, 9, (x, y) => {
      const base = 0.2 + (0.6 * x) / 31
      return dots.has(`${x},${y}`) ? base - 0.3 : base
    })
    const out = adaptiveBinarize(g, 3, 0.05, false)
    expect(out.data[4 * 32 + 5]).toBe(1)
    expect(out.data[4 * 32 + 26]).toBe(1)
    // Background stays clean, including the clamped-window edges.
    let inkCount = 0
    for (const v of out.data) inkCount += v
    expect(inkCount).toBe(2)
  })

  it('a single global threshold cannot do the same (sanity check)', () => {
    const dots = new Set(['5,4', '26,4'])
    const g = grayOf(32, 9, (x, y) => {
      const base = 0.2 + (0.6 * x) / 31
      return dots.has(`${x},${y}`) ? base - 0.3 : base
    })
    const t = otsuThreshold(g)
    const global = binarize(g, t, false)
    let mislabeled = 0
    for (let y = 0; y < 9; y++) {
      for (let x = 0; x < 32; x++) {
        const isDot = dots.has(`${x},${y}`)
        if (global.data[y * 32 + x] !== (isDot ? 1 : 0)) mislabeled++
      }
    }
    expect(mislabeled).toBeGreaterThan(10)
  })

  it('supports invert and mask gating', () => {
    const g = grayOf(8, 8, (x) => (x === 4 ? 0.1 : 0.6))
    const mask = maskOf(8, 8, (_, y) => y < 4)
    const out = adaptiveBinarize(g, 2, 0.02, true, mask)
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        const v = out.data[y * 8 + x]
        // Out-of-mask rows stay 0 even inverted; the dark column inverts to 0;
        // the in-mask background inverts to 1.
        const expected = y >= 4 || x === 4 ? 0 : 1
        expect(v).toBe(expected)
      }
    }
  })
})
