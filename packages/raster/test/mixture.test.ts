import type { LabelMap } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { absorbMixtureLabels, dissolveBlendBands, returnSeamPixels } from '../src/index'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

/** Count pixels per label. */
function census(labels: LabelMap): number[] {
  const out = new Array(labels.count).fill(0)
  for (const l of labels.data) if (l >= 0) out[l]++
  return out
}

describe('absorbMixtureLabels', () => {
  // 40×20: black left (label 0), white right (label 1), and a two-column band
  // in the middle (label 2) whose pixels are grays on the black↔white segment —
  // exactly the anti-aliased rim k-means hands its own centroid.
  const W = 40
  const H = 20
  const band = (x: number): Rgba => {
    if (x < 19) return [0, 0, 0, 255]
    if (x === 19) return [96, 96, 96, 255]
    if (x === 20) return [160, 160, 160, 255]
    return [255, 255, 255, 255]
  }
  const labelOf = (x: number): number => (x < 19 ? 0 : x <= 20 ? 2 : 1)
  const makeLabels = (): LabelMap => {
    const data = new Int32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = labelOf(x)
    return { width: W, height: H, data, count: 3 }
  }
  const palette = Uint8Array.from([0, 0, 0, 255, 255, 255, 128, 128, 128])

  it('dissolves a rim label into the two neighbors it blends', () => {
    const image = rasterOf(W, H, band)
    const labels = makeLabels()
    absorbMixtureLabels(image, labels, palette)
    const counts = census(labels)
    expect(counts[2]).toBe(0) // the mixture band is gone
    // Its columns split to the nearer ink: x=19 (t≈0.62 toward black) → black,
    // x=20 (t≈0.37) → white.
    for (let y = 0; y < H; y++) {
      expect(labels.data[y * W + 19]).toBe(0)
      expect(labels.data[y * W + 20]).toBe(1)
    }
  })

  it('keeps a filled tint region that merely lies on the chord', () => {
    // A solid 8-wide gray block between black and white: its color is a blend of
    // the two, but it fills interior area, so it is a chosen ink, not a rim.
    const blockX = (x: number): number => (x < 16 ? 0 : x < 24 ? 2 : 1)
    const image = rasterOf(W, H, (x) =>
      x < 16 ? [0, 0, 0, 255] : x < 24 ? [128, 128, 128, 255] : [255, 255, 255, 255],
    )
    const data = new Int32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = blockX(x)
    const labels: LabelMap = { width: W, height: H, data, count: 3 }
    absorbMixtureLabels(image, labels, palette)
    expect(census(labels)[2]).toBe(8 * H) // untouched
  })

  it('keeps a thin band whose color is off the neighbors’ segment', () => {
    // The middle columns are saturated red — not a blend of black and white.
    const red = Uint8Array.from([0, 0, 0, 255, 255, 255, 220, 30, 30])
    const image = rasterOf(W, H, (x) =>
      x < 19 ? [0, 0, 0, 255] : x <= 20 ? [220, 30, 30, 255] : [255, 255, 255, 255],
    )
    const labels = makeLabels()
    absorbMixtureLabels(image, labels, red)
    expect(census(labels)[2]).toBe(2 * H) // a real ink, kept
  })

  it('is a no-op with fewer than three labels', () => {
    const image = rasterOf(W, H, (x) => (x < 20 ? [0, 0, 0, 255] : [255, 255, 255, 255]))
    const data = new Int32Array(W * H)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) data[y * W + x] = x < 20 ? 0 : 1
    const labels: LabelMap = { width: W, height: H, data, count: 2 }
    const before = labels.data.slice()
    absorbMixtureLabels(image, labels, Uint8Array.from([0, 0, 0, 255, 255, 255]))
    expect(labels.data).toEqual(before)
  })
})

describe('returnSeamPixels', () => {
  // 24×24: a black band on top (label 0) over a cream band below (label 1),
  // meeting across rows 11–12, with an orange field (label 2) filling the
  // left third and touching the seam's end — the region a flood can let run
  // along the seam between the other two.
  const W = 24
  const H = 24
  const BLACK: Rgba = [2, 10, 9, 255]
  const CREAM: Rgba = [235, 224, 152, 255]
  const ORANGE: Rgba = [224, 87, 41, 255]
  const palette = Uint8Array.from([2, 10, 9, 235, 224, 152, 224, 87, 41])
  const mix = (t: number): Rgba => [
    Math.round(BLACK[0] * t + CREAM[0] * (1 - t)),
    Math.round(BLACK[1] * t + CREAM[1] * (1 - t)),
    Math.round(BLACK[2] * t + CREAM[2] * (1 - t)),
    255,
  ]
  /** The scene with `seam` (a color per seam row 11 and 12) labeled `seamLabel` right of the field. */
  function scene(
    seam: (y: number) => Rgba | null,
    seamLabel: number,
  ): { image: ReturnType<typeof rasterOf>; labels: LabelMap } {
    const data = new Int32Array(W * H)
    const image = rasterOf(W, H, (x, y) => {
      if (x < 8) return ORANGE
      return seam(y) ?? (y < 12 ? BLACK : CREAM)
    })
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        data[y * W + x] = x < 8 ? 2 : seam(y) ? seamLabel : y < 12 ? 0 : 1
      }
    }
    return { image, labels: { width: W, height: H, data, count: 3 } }
  }

  it('hands a seam a third region ran along back to the two sides, by coverage', () => {
    // Rows 11 and 12 carry the anti-aliased blend (70 % black, then 30 %),
    // but the orange field claimed them.
    const { image, labels } = scene((y) => (y === 11 ? mix(0.7) : y === 12 ? mix(0.3) : null), 2)
    const moved = returnSeamPixels(image, labels, palette)
    expect(moved).toBe(2 * (W - 8))
    for (let x = 8; x < W; x++) {
      expect(labels.data[11 * W + x]).toBe(0)
      expect(labels.data[12 * W + x]).toBe(1)
    }
    // The field itself is a real region and stays.
    expect(labels.data[5 * W + 3]).toBe(2)
  })

  it('keeps a line drawn in the region’s own color', () => {
    const { image, labels } = scene((y) => (y === 11 ? ORANGE : null), 2)
    const before = labels.data.slice()
    expect(returnSeamPixels(image, labels, palette)).toBe(0)
    expect(labels.data).toEqual(before)
  })

  it('keeps a region whose own color is a blend of the two sides', () => {
    // A dark tone that lies on the black–cream segment is an intermediate
    // ink, not a third color, so its thin run is left to the mixture pass.
    const tone = Uint8Array.from([2, 10, 9, 235, 224, 152, 61, 64, 45])
    const { image, labels } = scene((y) => (y === 11 ? mix(0.5) : null), 2)
    const before = labels.data.slice()
    expect(returnSeamPixels(image, labels, tone)).toBe(0)
    expect(labels.data).toEqual(before)
  })
})

describe('dissolveBlendBands', () => {
  // 40×20: an orange field (label 0) left of a blue one (label 1), and between
  // them the columns a test labels 2 — a band of blend colors grown along the
  // soft edge between the two, or a stroke drawn in a color of its own.
  const W = 40
  const H = 20
  const ORANGE: Rgba = [224, 87, 41, 255]
  const BLUE: Rgba = [91, 126, 172, 255]
  const palette = Uint8Array.from([224, 87, 41, 91, 126, 172, 157, 106, 106])
  const FLAT = 0.02
  /** The blend `t` of orange over blue, its green channel moved by `shift`. */
  const mix = (t: number, shift = 0): Rgba => [
    Math.round(ORANGE[0] * t + BLUE[0] * (1 - t)),
    Math.round(ORANGE[1] * t + BLUE[1] * (1 - t)) + shift,
    Math.round(ORANGE[2] * t + BLUE[2] * (1 - t)),
    255,
  ]
  /**
   * The scene with each column of `band` in its color and labeled 2 (orange
   * left of the band, blue right of it), and a gradient that is flat only on
   * the `flat` columns.
   */
  function scene(
    band: Map<number, Rgba>,
    flat: readonly number[] = [],
  ): { image: ReturnType<typeof rasterOf>; labels: LabelMap; gradient: Float32Array } {
    const first = Math.min(...band.keys())
    const image = rasterOf(W, H, (x) => band.get(x) ?? (x < first ? ORANGE : BLUE))
    const data = new Int32Array(W * H)
    const gradient = new Float32Array(W * H).fill(1)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        data[y * W + x] = band.has(x) ? 2 : x < first ? 0 : 1
        if (flat.includes(x)) gradient[y * W + x] = 0
      }
    }
    return { image, labels: { width: W, height: H, data, count: 3 }, gradient }
  }
  const columnLabels = (labels: LabelMap, x: number): Set<number> =>
    new Set(Array.from({ length: H }, (_, y) => labels.data[y * W + x]))

  it('hands a band of blend colors back to the two fills, split at half coverage', () => {
    // Three columns of a ramp from orange to blue: a band thicker than a hair,
    // holding a stretch of the ramp across it.
    const { image, labels, gradient } = scene(
      new Map([
        [18, mix(0.8)],
        [19, mix(0.55)],
        [20, mix(0.3)],
      ]),
    )
    expect(dissolveBlendBands(image, labels, palette, gradient, FLAT)).toBe(3 * H)
    expect(census(labels)[2]).toBe(0)
    expect(columnLabels(labels, 19)).toEqual(new Set([0]))
    expect(columnLabels(labels, 20)).toEqual(new Set([1]))
  })

  it('hands back a hair of one blend', () => {
    const { image, labels, gradient } = scene(new Map([[20, mix(0.6)]]))
    expect(dissolveBlendBands(image, labels, palette, gradient, FLAT)).toBe(H)
    expect(columnLabels(labels, 20)).toEqual(new Set([0]))
  })

  it('reads the smeared chroma of a compressed edge as a blend', () => {
    // Chroma subsampling pushes each pixel of the edge off the blend segment —
    // here by ~20 sRGB levels, more than a clean anti-aliased pixel ever strays
    // — in opposite directions on either side, so the band's mean stays on it.
    const { image, labels, gradient } = scene(
      new Map([
        [19, mix(0.7, 20)],
        [20, mix(0.3, -20)],
      ]),
    )
    expect(dissolveBlendBands(image, labels, palette, gradient, FLAT)).toBe(2 * H)
    expect(columnLabels(labels, 19)).toEqual(new Set([0]))
    expect(columnLabels(labels, 20)).toEqual(new Set([1]))
  })

  it('keeps a stroke drawn in an intermediate color', () => {
    // Five columns: an anti-aliased column on each side of a plateau of one
    // blend. Its coverage spreads like a ramp's, but its core is flat — a
    // stroke painted in that color.
    const { image, labels, gradient } = scene(
      new Map([
        [16, mix(0.8)],
        [17, mix(0.5)],
        [18, mix(0.5)],
        [19, mix(0.5)],
        [20, mix(0.2)],
      ]),
      [18],
    )
    const before = labels.data.slice()
    expect(dissolveBlendBands(image, labels, palette, gradient, FLAT)).toBe(0)
    expect(labels.data).toEqual(before)
  })

  it('keeps a line in a color of its own between the two fills', () => {
    const dark = Uint8Array.from([224, 87, 41, 91, 126, 172, 40, 30, 30])
    const { image, labels, gradient } = scene(
      new Map([
        [19, [40, 30, 30, 255]],
        [20, [40, 30, 30, 255]],
      ]),
    )
    expect(dissolveBlendBands(image, labels, dark, gradient, FLAT)).toBe(0)
    expect(census(labels)[2]).toBe(2 * H)
  })

  it('keeps a line within one field, and a spur that meets the second only at its tip', () => {
    // Column 10 runs inside the orange field; row 10 runs from x 12 to the blue
    // field's edge, which it meets end-on.
    const image = rasterOf(W, H, (x, y) =>
      x === 10 || (y === 10 && x >= 12 && x < 20) ? mix(0.5) : x < 20 ? ORANGE : BLUE,
    )
    const data = new Int32Array(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        data[y * W + x] = x === 10 || (y === 10 && x >= 12 && x < 20) ? 2 : x < 20 ? 0 : 1
      }
    }
    const labels: LabelMap = { width: W, height: H, data, count: 3 }
    const gradient = new Float32Array(W * H).fill(1)
    expect(dissolveBlendBands(image, labels, palette, gradient, FLAT)).toBe(0)
  })
})
