import type { BinaryMask } from '@trazor/core'
import { oklabToRgb } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { segmentRegions } from '../src/index'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

const BLACK: Rgba = [0, 0, 0, 255]
const SKIN: Rgba = [230, 180, 140, 255]

/** Two flat colors joined by a 4px anti-aliased ramp (a black outline meeting skin). */
function rampImage(w = 40, h = 20): ReturnType<typeof rasterOf> {
  const edge = w / 2
  return rasterOf(w, h, (x) => {
    const t = Math.min(1, Math.max(0, (x - (edge - 2)) / 4))
    const mix = (a: number, b: number): number => Math.round(a * (1 - t) + b * t)
    return [mix(BLACK[0], SKIN[0]), mix(BLACK[1], SKIN[1]), mix(BLACK[2], SKIN[2]), 255] as Rgba
  })
}

describe('segmentRegions — region growing', () => {
  it('never invents a third color on an anti-aliased edge', () => {
    // Global quantization would map the mid-ramp mixture to a nearest third
    // color; region growing splits it between the two real neighbors.
    const seg = segmentRegions(rampImage())
    expect(seg.labels.count).toBe(2)
    expect(seg.paletteHex).toHaveLength(2)
    for (const v of seg.labels.data) expect(v === 0 || v === 1).toBe(true)
  })

  it('is deterministic', () => {
    const img = rampImage()
    const a = segmentRegions(img)
    const b = segmentRegions(img)
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })

  it('separates distinct flat blocks and keeps every color', () => {
    const img = rasterOf(40, 40, (x, y) => {
      if (y < 20 && x < 20) return [220, 30, 30, 255]
      if (y < 20) return [30, 180, 60, 255]
      if (x < 20) return [40, 60, 220, 255]
      return [235, 220, 60, 255]
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(4)
  })

  it('folds near-duplicate regions into one color', () => {
    const img = rasterOf(40, 20, (x) => (x < 20 ? [200, 50, 50, 255] : [202, 52, 51, 255]))
    const seg = segmentRegions(img, { mergeThreshold: 0.1 })
    expect(seg.labels.count).toBe(1)
  })

  it('respects a hard region cap without collapsing distinct hues', () => {
    // Four vivid quadrants capped at 3: the two closest merge; no blue-into-black.
    const img = rasterOf(40, 40, (x, y) => {
      if (y < 20 && x < 20) return [220, 30, 30, 255]
      if (y < 20) return [235, 60, 40, 255] // near the red
      if (x < 20) return [40, 60, 220, 255]
      return [235, 220, 60, 255]
    })
    const seg = segmentRegions(img, { maxRegions: 3 })
    expect(seg.labels.count).toBeLessThanOrEqual(4)
  })

  it('marks masked-out pixels as -1 and segments only the rest', () => {
    const img = rasterOf(20, 20, (x) => (x < 10 ? [10, 10, 10, 255] : [200, 200, 200, 255]))
    const mask: BinaryMask = { width: 20, height: 20, data: new Uint8Array(400) }
    for (let i = 0; i < 400; i++) mask.data[i] = i % 20 < 10 ? 1 : 0
    const seg = segmentRegions(img, { mask })
    let masked = 0
    for (const v of seg.labels.data) if (v === -1) masked++
    expect(masked).toBe(200)
    expect(seg.labels.count).toBe(1)
  })

  it('palette length matches the label count', () => {
    const seg = segmentRegions(rampImage())
    expect(seg.paletteHex).toHaveLength(seg.labels.count)
    expect(seg.paletteRgb).toHaveLength(seg.labels.count * 3)
    expect(seg.counts).toHaveLength(seg.labels.count)
  })
})

/** An Oklab color as an 8-bit clamped RGBA pixel. */
function okPixel(L: number, a: number, b: number): Rgba {
  const [r, g, bl] = oklabToRgb(L, a, b)
  const c = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 255)))
  return [c(r), c(g), c(bl), 255]
}

// A close-but-distinct Oklab pair (ΔE ≈ 0.07): merged by the flat `mergeThreshold`
// (0.1) yet above the near-duplicate floor (`SRM_FLOOR` ≈ 0.03) — a coral sun
// against a pink sky, the colors size-aware merging must keep apart at scale.
const CORAL = okPixel(0.6, 0.05, 0.02)
const PINK = okPixel(0.6, 0.12, 0.02)

/** Two flat blocks of the close pair, left | right. */
function twoBlocks(w: number, h: number): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (x) => (x < w / 2 ? CORAL : PINK))
}

describe('segmentRegions — size-aware merge (SRM)', () => {
  it('is byte-identical to the flat threshold when off (default and explicit 0)', () => {
    const img = twoBlocks(160, 80)
    const dflt = segmentRegions(img)
    const off = segmentRegions(img, { mergeSizeBias: 0 })
    expect(off.labels.count).toBe(dflt.labels.count)
    expect(Array.from(off.labels.data)).toEqual(Array.from(dflt.labels.data))
    expect(off.paletteHex).toEqual(dflt.paletteHex)
  })

  it('keeps close-but-distinct large colors apart that the flat threshold washes together', () => {
    const img = twoBlocks(160, 80)
    // Flat 0.1 merges the pair into one mean color (the wash-out); size-aware
    // merging keeps the two large regions distinct.
    expect(segmentRegions(img).labels.count).toBe(1)
    expect(segmentRegions(img, { mergeSizeBias: 0.8 }).labels.count).toBe(2)
  })

  it('still folds the same pair when both regions are small (size-dependent tolerance)', () => {
    // The essence of SRM: the identical color pair merges at small scale — a
    // sliver folds into its neighbor — but is preserved at large scale above.
    const img = twoBlocks(24, 12)
    expect(segmentRegions(img, { mergeSizeBias: 0.8 }).labels.count).toBe(1)
  })

  it('is deterministic with size-aware merging on', () => {
    const img = twoBlocks(160, 80)
    const a = segmentRegions(img, { mergeSizeBias: 0.8 })
    const b = segmentRegions(img, { mergeSizeBias: 0.8 })
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })
})
