import { mulberry32, rgbToHex } from '@vectorizer/core'
import { describe, expect, it } from 'vitest'
import { quantize } from '../src/index'
import type { QuantizeOptions } from '../src/index'
import { maskOf, rasterOf } from './helpers'
import type { Rgba } from './helpers'

const baseOpts: QuantizeOptions = {
  k: 8,
  colorSpace: 'oklab',
  quality: 5,
  seed: 42,
}

const quadrantOf = (x: number, y: number): number => (y < 20 ? 0 : 2) + (x < 20 ? 0 : 1)
const clampByte = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)

/** 40x40 image of four noisy color clusters (one per quadrant). */
function noisyClusters(seed: number): {
  image: ReturnType<typeof rasterOf>
  bases: Array<[number, number, number]>
} {
  const bases: Array<[number, number, number]> = [
    [230, 40, 40],
    [40, 200, 60],
    [50, 60, 220],
    [235, 225, 60],
  ]
  const rng = mulberry32(seed)
  const image = rasterOf(40, 40, (x, y) => {
    const [r, g, b] = bases[quadrantOf(x, y)]
    const jitter = (): number => ((rng() * 21) | 0) - 10
    return [clampByte(r + jitter()), clampByte(g + jitter()), clampByte(b + jitter()), 255] as Rgba
  })
  return { image, bases }
}

describe('quantize — exact distinct-color path', () => {
  it('returns the exact colors of a two-color image, ordered by count desc', () => {
    const img = rasterOf(6, 6, (x, y) => (y * 6 + x < 24 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const res = quantize(img, baseOpts)
    expect(res.labels.count).toBe(2)
    expect(res.paletteHex).toEqual(['#ff0000', '#0000ff'])
    expect([...res.paletteRgb]).toEqual([255, 0, 0, 0, 0, 255])
    expect([...res.counts]).toEqual([24, 12])
    for (let i = 0; i < 36; i++) {
      expect(res.labels.data[i]).toBe(i < 24 ? 0 : 1)
    }
  })

  it('is unaffected by colorSpace and preserves near-duplicate colors (pixel-art fidelity)', () => {
    const img = rasterOf(4, 1, (x) => (x < 3 ? [16, 16, 16, 255] : [18, 18, 18, 255]))
    for (const colorSpace of ['oklab', 'rgb'] as const) {
      const res = quantize(img, { ...baseOpts, colorSpace, autoK: true })
      expect(res.paletteHex).toEqual(['#101010', '#121212'])
    }
  })

  it('labels masked-out pixels -1 and excludes them from the palette', () => {
    const img = rasterOf(4, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const mask = maskOf(4, 1, (x) => x < 2)
    const res = quantize(img, { ...baseOpts, mask })
    expect(res.labels.count).toBe(1)
    expect(res.paletteHex).toEqual(['#ff0000'])
    expect([...res.labels.data]).toEqual([0, 0, -1, -1])
    expect([...res.counts]).toEqual([2])
  })

  it('handles an all-masked image gracefully', () => {
    const img = rasterOf(3, 3, () => [10, 20, 30, 255])
    const mask = maskOf(3, 3, () => false)
    const res = quantize(img, { ...baseOpts, mask })
    expect(res.labels.count).toBe(0)
    expect(res.paletteHex).toEqual([])
    expect(res.counts.length).toBe(0)
    expect([...res.labels.data]).toEqual(new Array(9).fill(-1))
  })
})

describe('quantize — k-means path', () => {
  it('recovers four noisy clusters in oklab space', () => {
    const { image, bases } = noisyClusters(7)
    const res = quantize(image, { ...baseOpts, k: 4 })
    expect(res.labels.count).toBe(4)
    let total = 0
    for (const c of res.counts) total += c
    expect(total).toBe(40 * 40)
    // Each base color is matched by exactly one palette entry within tolerance.
    const used = new Set<number>()
    for (const [r, g, b] of bases) {
      let best = -1
      let bestD = Infinity
      for (let c = 0; c < 4; c++) {
        const dr = res.paletteRgb[c * 3] - r
        const dg = res.paletteRgb[c * 3 + 1] - g
        const db = res.paletteRgb[c * 3 + 2] - b
        const d = Math.sqrt(dr * dr + dg * dg + db * db)
        if (d < bestD) {
          bestD = d
          best = c
        }
      }
      expect(bestD).toBeLessThan(20)
      used.add(best)
    }
    expect(used.size).toBe(4)
    // All pixels of one quadrant share a label.
    const labelOfQuadrant = [
      res.labels.data[5 * 40 + 5],
      res.labels.data[5 * 40 + 25],
      res.labels.data[25 * 40 + 5],
      res.labels.data[25 * 40 + 25],
    ]
    for (let y = 0; y < 40; y++) {
      for (let x = 0; x < 40; x++) {
        expect(res.labels.data[y * 40 + x]).toBe(labelOfQuadrant[quadrantOf(x, y)])
      }
    }
    // Palette ordered by count descending.
    for (let c = 1; c < res.counts.length; c++) {
      expect(res.counts[c]).toBeLessThanOrEqual(res.counts[c - 1])
    }
  })

  it('recovers clusters in rgb space too', () => {
    const { image, bases } = noisyClusters(11)
    const res = quantize(image, { ...baseOpts, k: 4, colorSpace: 'rgb' })
    expect(res.labels.count).toBe(4)
    for (const [r, g, b] of bases) {
      let bestD = Infinity
      for (let c = 0; c < 4; c++) {
        const dr = res.paletteRgb[c * 3] - r
        const dg = res.paletteRgb[c * 3 + 1] - g
        const db = res.paletteRgb[c * 3 + 2] - b
        bestD = Math.min(bestD, Math.sqrt(dr * dr + dg * dg + db * db))
      }
      expect(bestD).toBeLessThan(20)
    }
  })

  it('is deterministic for a given seed', () => {
    const { image } = noisyClusters(3)
    const a = quantize(image, { ...baseOpts, k: 6, quality: 3 })
    const b = quantize(image, { ...baseOpts, k: 6, quality: 3 })
    expect(b.paletteHex).toEqual(a.paletteHex)
    expect(b.counts).toEqual(a.counts)
    expect(b.labels.data).toEqual(a.labels.data)
  })

  it('labels masked-out pixels -1 and counts only in-mask pixels', () => {
    const { image } = noisyClusters(5)
    const mask = maskOf(40, 40, (x) => x < 20)
    const res = quantize(image, { ...baseOpts, k: 4, mask })
    let total = 0
    for (const c of res.counts) total += c
    expect(total).toBe(20 * 40)
    for (let y = 0; y < 40; y++) {
      for (let x = 20; x < 40; x++) {
        expect(res.labels.data[y * 40 + x]).toBe(-1)
      }
    }
  })

  it('autoK merges centroids closer than 0.03 in Oklab', () => {
    // Six distinct colors (> k) forming two tight groups.
    const shades = [0x10, 0x12, 0x14, 0xec, 0xee, 0xf0]
    const img = rasterOf(60, 20, (x) => {
      const v = shades[x % 6]
      return [v, v, v, 255]
    })
    const merged = quantize(img, { ...baseOpts, k: 4, seed: 1, autoK: true })
    expect(merged.labels.count).toBe(2)
    // One dark and one light survivor.
    const lum = [merged.paletteRgb[0], merged.paletteRgb[3]].toSorted((a, b) => a - b)
    expect(lum[0]).toBeLessThan(0x30)
    expect(lum[1]).toBeGreaterThan(0xd0)
    const plain = quantize(img, { ...baseOpts, k: 4, seed: 1 })
    expect(plain.labels.count).toBeGreaterThan(2)
  })
})

describe('quantize — fixed palette', () => {
  it('labels every pixel with the nearest of the given colors, in the given order', () => {
    const img = rasterOf(32, 4, (x) => {
      const v = Math.round((x / 31) * 255)
      return [v, v, v, 255]
    })
    const palette = ['#000000', '#808080', '#ffffff']
    const res = quantize(img, { ...baseOpts, k: 2, autoK: true, fixedPalette: palette })
    expect(res.labels.count).toBe(3)
    expect(res.paletteHex).toEqual(palette)
    expect([...res.paletteRgb]).toEqual([0, 0, 0, 128, 128, 128, 255, 255, 255])
    let total = 0
    for (const c of res.counts) total += c
    expect(total).toBe(32 * 4)
    const labelAt = (x: number): number => res.labels.data[x]
    expect(labelAt(0)).toBe(0)
    expect(labelAt(31)).toBe(2)
    expect(labelAt(16)).toBe(1) // v = 132, nearest to #808080
    // Monotonic assignment across the ramp.
    for (let x = 1; x < 32; x++) {
      expect(labelAt(x)).toBeGreaterThanOrEqual(labelAt(x - 1))
    }
  })

  it('keeps zero-count entries in their label slot (no compaction, no reordering)', () => {
    const img = rasterOf(4, 4, () => [0, 0, 0, 255])
    const res = quantize(img, {
      ...baseOpts,
      fixedPalette: ['#ff0000', '#000000', '#00ff00'],
    })
    expect(res.paletteHex).toEqual(['#ff0000', '#000000', '#00ff00'])
    expect([...res.counts]).toEqual([0, 16, 0])
    for (const l of res.labels.data) expect(l).toBe(1)
  })

  it('drops invalid entries and respects the mask', () => {
    const img = rasterOf(4, 1, () => [200, 10, 10, 255])
    const mask = maskOf(4, 1, (x) => x > 0)
    const res = quantize(img, {
      ...baseOpts,
      mask,
      fixedPalette: ['oops', '#ff0000', ''],
    })
    expect(res.paletteHex).toEqual(['#ff0000'])
    expect([...res.labels.data]).toEqual([-1, 0, 0, 0])
    expect([...res.counts]).toEqual([3])
  })

  it('falls back to normal clustering when no entry is valid', () => {
    const img = rasterOf(4, 1, (x) => (x < 2 ? [255, 0, 0, 255] : [0, 0, 255, 255]))
    const res = quantize(img, { ...baseOpts, fixedPalette: ['nope', '#12345'] })
    expect(res.paletteHex).toEqual(['#ff0000', '#0000ff'])
  })

  it('normalizes hex input via the core helpers', () => {
    const img = rasterOf(2, 1, () => [255, 255, 255, 255])
    const res = quantize(img, { ...baseOpts, fixedPalette: ['#ABC', '#ffffff'] })
    expect(res.paletteHex).toEqual([rgbToHex(0xaa, 0xbb, 0xcc), '#ffffff'])
  })
})
