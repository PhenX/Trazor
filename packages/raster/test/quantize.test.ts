import { mulberry32, rgbToHex } from '@trazor/core'
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

  it('an all-eligible sampleMask reproduces the unfiltered result byte-for-byte', () => {
    const { image } = noisyClusters(9)
    const plain = quantize(image, { ...baseOpts, k: 5, quality: 4 })
    const all = maskOf(40, 40, () => true)
    const same = quantize(image, { ...baseOpts, k: 5, quality: 4, sampleMask: all })
    expect(same.paletteHex).toEqual(plain.paletteHex)
    expect([...same.counts]).toEqual([...plain.counts])
    expect([...same.labels.data]).toEqual([...plain.labels.data])
  })

  it('falls back to full sampling when the sampleMask leaves too few pixels', () => {
    const { image } = noisyClusters(13)
    const plain = quantize(image, { ...baseOpts, k: 5, quality: 4 })
    // Only a handful of eligible pixels (< max(k, 256)) ⇒ filter is dropped.
    const sparse = maskOf(40, 40, (x, y) => x < 2 && y < 2)
    const res = quantize(image, { ...baseOpts, k: 5, quality: 4, sampleMask: sparse })
    expect([...res.labels.data]).toEqual([...plain.labels.data])
  })

  it('keeps an anti-alias rim color out of the palette when the sampleMask excludes it', () => {
    // Two jittered regions (so distinct colors ≫ k ⇒ the k-means path runs)
    // split by a two-column gray "anti-aliased" seam at x = 20..21.
    const A: [number, number, number] = [30, 30, 200]
    const B: [number, number, number] = [200, 200, 30]
    const rim: [number, number, number] = [115, 115, 115]
    const rng = mulberry32(99)
    const j = (): number => ((rng() * 13) | 0) - 6
    const img = rasterOf(40, 40, (x) => {
      const base = x >= 20 && x <= 21 ? rim : x < 20 ? A : B
      return [
        clampByte(base[0] + j()),
        clampByte(base[1] + j()),
        clampByte(base[2] + j()),
        255,
      ] as Rgba
    })
    const nearestToRim = (res: ReturnType<typeof quantize>): number => {
      let best = Infinity
      for (let c = 0; c < res.paletteHex.length; c++) {
        const d =
          Math.abs(res.paletteRgb[c * 3] - rim[0]) +
          Math.abs(res.paletteRgb[c * 3 + 1] - rim[1]) +
          Math.abs(res.paletteRgb[c * 3 + 2] - rim[2])
        best = Math.min(best, d)
      }
      return best
    }
    // k=3 normally spends a whole entry on the rim cluster.
    const plain = quantize(img, { ...baseOpts, k: 3, seed: 1 })
    // Excluding the rim band from clustering frees that entry for a real color.
    const sampleMask = maskOf(40, 40, (x) => x < 20 || x > 21)
    const filtered = quantize(img, { ...baseOpts, k: 3, seed: 1, sampleMask })
    expect(nearestToRim(plain)).toBeLessThan(40)
    expect(nearestToRim(filtered)).toBeGreaterThan(80)
  })

  it('assigns every pixel of a repeated color the same label (memoized final pass)', () => {
    // 40 distinct colors (> k) tiled so each appears in many pixels; the
    // memoized labeling must give one color exactly one label everywhere.
    const bases: [number, number, number][] = Array.from({ length: 40 }, (_, i) => [
      (i * 61) % 256,
      (i * 113) % 256,
      (i * 179) % 256,
    ])
    const img = rasterOf(60, 60, (x, y) => {
      const c = bases[(x * 7 + y * 11) % 40]
      return [c[0], c[1], c[2], 255] as Rgba
    })
    const res = quantize(img, { ...baseOpts, k: 8, seed: 3 })
    const labelOfColor = new Map<number, number>()
    let mismatches = 0
    for (let y = 0; y < 60; y++) {
      for (let x = 0; x < 60; x++) {
        const p = (y * 60 + x) * 4
        const key = (img.data[p] << 16) | (img.data[p + 1] << 8) | img.data[p + 2]
        const lab = res.labels.data[y * 60 + x]
        const seen = labelOfColor.get(key)
        if (seen === undefined) labelOfColor.set(key, lab)
        else if (seen !== lab) mismatches++
      }
    }
    expect(mismatches).toBe(0)
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
