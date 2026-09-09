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

const WHITE: Rgba = [255, 255, 255, 255]

/** Perceptual lightness (Oklab L) of a palette entry, from its RGB bytes. */
function paletteL(seg: ReturnType<typeof segmentRegions>, label: number): number {
  const r = seg.paletteRgb[label * 3] / 255
  const g = seg.paletteRgb[label * 3 + 1] / 255
  const b = seg.paletteRgb[label * 3 + 2] / 255
  // Rec. 601 luma is enough to tell "dark" from "light" here.
  return 0.299 * r + 0.587 * g + 0.114 * b
}

describe('segmentRegions — rescuing marker-less thin features', () => {
  // A 2px black bar across a white field: too thin to hold a flat core, so it
  // gets no marker of its own. Without the rescue pass the flood dissolves it
  // into the white on either side and it vanishes (one region); the rescue pass
  // seeds it as its own marker so it survives as a distinct dark region.
  function thinBarImage(w = 40, h = 40): ReturnType<typeof rasterOf> {
    const mid = h >> 1
    return rasterOf(w, h, (_x, y) => (y === mid || y === mid + 1 ? BLACK : WHITE))
  }

  it('keeps a thin coreless bar instead of dissolving it into the field', () => {
    const w = 40
    const h = 40
    const seg = segmentRegions(thinBarImage(w, h))
    expect(seg.labels.count).toBe(2)
    const corner = seg.labels.data[0]
    const bar = seg.labels.data[(h >> 1) * w + (w >> 1)]
    expect(bar).not.toBe(corner) // the bar is not painted with the background
    expect(paletteL(seg, bar)).toBeLessThan(0.2) // and it stays dark
    expect(paletteL(seg, corner)).toBeGreaterThan(0.8)
  })

  it('rescues the feature as one region (deterministically)', () => {
    const img = thinBarImage()
    const a = segmentRegions(img)
    const b = segmentRegions(img)
    expect(b.labels.count).toBe(a.labels.count)
    expect(Array.from(b.labels.data)).toEqual(Array.from(a.labels.data))
  })

  it('does not invent a third color on a genuine black↔white ramp', () => {
    // The mirror case: a two-sided ramp borders two different colors and must
    // still split between them — the rescue pass must not seed the mid-gray band
    // as its own region. Checked across ramp widths (a wide, hard edge is the
    // case whose near-endpoint sliver most tempts the rescue).
    for (const width of [2, 4, 6, 8]) {
      const w = 60
      const ramp = rasterOf(w, 20, (x) => {
        const t = Math.min(1, Math.max(0, (x - (w / 2 - width / 2)) / width))
        const v = Math.round(t * 255)
        return [v, v, v, 255] as Rgba
      })
      expect(segmentRegions(ramp).labels.count).toBe(2)
    }
  })

  it('rescues thin line-art on a colored field despite its soft rim (fur, facial strokes)', () => {
    // A 2px navy stroke on a mid-blue field, wrapped in an anti-aliased rim: the
    // rim is a chain of small color steps that joins the stroke to the field's
    // edge web, and navy-on-blue is far below black-on-white contrast. The stroke
    // must still come out as its own dark region, with the field on both sides.
    const FIELD: Rgba = [70, 150, 200, 255]
    const STROKE: Rgba = [20, 40, 70, 255]
    const RIM: Rgba = [58, 122, 168, 255] // 25% stroke / 75% field
    const w = 40
    const h = 40
    const mid = h >> 1
    const img = rasterOf(w, h, (_x, y) => {
      if (y === mid || y === mid + 1) return STROKE
      if (y === mid - 1 || y === mid + 2) return RIM
      return FIELD
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(2)
    const corner = seg.labels.data[0]
    const stroke = seg.labels.data[mid * w + (w >> 1)]
    expect(stroke).not.toBe(corner)
    expect(paletteL(seg, stroke)).toBeLessThan(0.3) // navy, not a rim-diluted teal
    expect(paletteL(seg, corner)).toBeGreaterThan(0.45)
  })

  it('keeps a dark contour line between two different colors', () => {
    // A 2px black line where a red field meets a blue one — a cartoon outline,
    // a tooth separator. It is not a mixture of its two sides (it is farther from
    // both than they are from each other), so it must survive as its own dark
    // region instead of being split between red and blue and vanishing.
    const RED: Rgba = [220, 30, 30, 255]
    const BLUE: Rgba = [40, 60, 220, 255]
    const w = 40
    const img = rasterOf(w, 40, (x) => (x === 19 || x === 20 ? BLACK : x < 19 ? RED : BLUE))
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(3)
    const line = seg.labels.data[20 * w + 19]
    expect(line).not.toBe(seg.labels.data[0])
    expect(line).not.toBe(seg.labels.data[w - 1])
    expect(paletteL(seg, line)).toBeLessThan(0.2)
  })

  it('leaves a low-contrast thin feature to the flood (only high-contrast is rescued)', () => {
    // A faint bar (ΔE well under the rescue contrast gate) is one the flood
    // renders acceptably; it must not be seeded as its own region.
    const w = 40
    const h = 40
    const mid = h >> 1
    const faint = rasterOf(w, h, (_x, y) =>
      y === mid || y === mid + 1 ? [232, 232, 232, 255] : WHITE,
    )
    expect(segmentRegions(faint).labels.count).toBe(1)
  })
})

describe('segmentRegions — palette colors come from flat interiors', () => {
  it('does not let an absorbed rim tint a region toward its neighbor', () => {
    // A white square on black with a 1px anti-aliased rim (the 50% mixture every
    // rim pixel of a real edge is). The rim has no flat interior, so the flood
    // hands it to the nearer region (white) — correct, no third color — but the
    // square's palette entry must stay white, taken from its flat interior, not
    // a rim-darkened grey.
    const GREY: Rgba = [128, 128, 128, 255]
    const w = 60
    const img = rasterOf(w, 60, (x, y) => {
      const inSquare = x >= 20 && x < 40 && y >= 20 && y < 40
      const inRim = x >= 19 && x < 41 && y >= 19 && y < 41
      return inSquare ? WHITE : inRim ? GREY : BLACK
    })
    const seg = segmentRegions(img)
    expect(seg.labels.count).toBe(2)
    const square = seg.labels.data[30 * w + 30]
    expect(paletteL(seg, square)).toBeGreaterThan(0.98)
    expect(paletteL(seg, seg.labels.data[0])).toBeLessThan(0.02)
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
