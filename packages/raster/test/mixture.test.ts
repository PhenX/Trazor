import type { LabelMap } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { absorbMixtureLabels, returnSeamPixels } from '../src/index'
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
