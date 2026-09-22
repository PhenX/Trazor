import type { LabelMap } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { absorbMixtureLabels } from '../src/index'
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
