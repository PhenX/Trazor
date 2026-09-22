import { describe, expect, it } from 'vitest'
import type { GrayImage } from '@trazor/core'
import { coverageOf, layerField, negatedField, signedFieldOf } from '@trazor/trace'

const W = 16
const H = 12
const RED: [number, number, number] = [220, 40, 50]
const BLUE: [number, number, number] = [40, 110, 190]

/**
 * Red on the left (label 0), blue on the right (label 1), one anti-aliased
 * column at x = 7 holding their 50% sRGB mix and labeled red. The blue layer's
 * mask is x ≥ 8, so its left edge is a color edge against red.
 */
function scene(): {
  mask: Uint8Array
  labels: Int32Array
  pixels: Uint8ClampedArray
  paletteRgb: Uint8Array
} {
  const mask = new Uint8Array(W * H)
  const labels = new Int32Array(W * H)
  const pixels = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      labels[p] = x < 8 ? 0 : 1
      mask[p] = x >= 8 ? 1 : 0
      const rgb: [number, number, number] = x < 7 ? RED : x === 7 ? [130, 75, 120] : BLUE
      pixels[p * 4] = rgb[0]
      pixels[p * 4 + 1] = rgb[1]
      pixels[p * 4 + 2] = rgb[2]
      pixels[p * 4 + 3] = 255
    }
  }
  const paletteRgb = new Uint8Array([...RED, ...BLUE])
  return { mask, labels, pixels, paletteRgb }
}

describe('layerField', () => {
  it('reads a color edge as the pixel’s position between the two palette colors', () => {
    const field = layerField({ width: W, height: H, ...scene(), label: -1 })
    // Deep inside and deep outside are saturated; the pure blue pixel at the
    // edge is fully its own color.
    expect(field.at(9, 5)).toBe(0.5)
    expect(field.at(6, 5)).toBe(-0.5)
    expect(field.at(8, 5)).toBeCloseTo(0.5, 5)
    // The half-mixed rim pixel sits on the zero contour.
    expect(Math.abs(field.at(7, 5))).toBeLessThan(0.01)
  })

  it('names the painted color for a lifted island', () => {
    const src = scene()
    const base = layerField({ width: W, height: H, ...src, label: -1 })
    const island = layerField({ width: W, height: H, ...src, label: 1 })
    for (let x = 5; x < 11; x++) expect(island.at(x, 4)).toBe(base.at(x, 4))
  })

  it('reads the exterior edge from the transparency coverage', () => {
    const src = scene()
    // Rows 0–1 are clear, row 2 is a quarter covered, the rest is solid.
    const alpha: GrayImage = { width: W, height: H, data: new Float32Array(W * H) }
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) alpha.data[y * W + x] = y < 2 ? -0.5 : y === 2 ? -0.25 : 0.5
    }
    const field = layerField({ width: W, height: H, ...src, label: -1, alpha })
    expect(field.at(9, 1)).toBe(-0.5)
    expect(field.at(9, 2)).toBe(-0.25)
    expect(field.at(9, 5)).toBe(0.5)
    // Solid pixels still read their color edge.
    expect(Math.abs(field.at(7, 5))).toBeLessThan(0.01)
  })

  it('reads a hard edge where the two palette colors coincide', () => {
    const src = scene()
    const same = new Uint8Array([...RED, ...RED])
    const field = layerField({ width: W, height: H, ...src, paletteRgb: same, label: -1 })
    expect(field.at(7, 5)).toBe(-0.5)
    expect(field.at(8, 5)).toBe(0.5)
  })

  it('is deterministic', () => {
    const src = scene()
    const a = layerField({ width: W, height: H, ...src, label: -1 })
    const b = layerField({ width: W, height: H, ...src, label: -1 })
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) expect(a.at(x, y)).toBe(b.at(x, y))
  })
})

describe('coverageOf', () => {
  it('inverts an sRGB blend exactly and clamps colors off the segment', () => {
    const palette = new Uint8Array([...RED, ...BLUE])
    const mix = (t: number): Uint8ClampedArray =>
      new Uint8ClampedArray([
        Math.round(RED[0] * t + BLUE[0] * (1 - t)),
        Math.round(RED[1] * t + BLUE[1] * (1 - t)),
        Math.round(RED[2] * t + BLUE[2] * (1 - t)),
        255,
      ])
    for (const t of [0, 0.25, 0.5, 0.8, 1]) {
      // Byte rounding of the blend moves the recovered weight by well under 0.01.
      expect(Math.abs(coverageOf(mix(t), 0, palette, 0, 3) - t)).toBeLessThan(0.01)
    }
    // Beyond either end the weight clamps; identical colors carry no edge.
    expect(coverageOf(new Uint8ClampedArray([255, 0, 0, 255]), 0, palette, 0, 3)).toBe(1)
    expect(coverageOf(mix(0.5), 0, new Uint8Array([...RED, ...RED]), 0, 3)).toBe(-1)
  })
})

describe('signedFieldOf / negatedField', () => {
  it('wraps a gray field and flips its sign', () => {
    const gray: GrayImage = { width: 2, height: 1, data: new Float32Array([0.25, -0.5]) }
    const field = signedFieldOf(gray)
    expect(field.at(0, 0)).toBe(0.25)
    expect(field.at(1, 0)).toBe(-0.5)
    const flipped = negatedField(gray)
    expect(flipped.at(0, 0)).toBe(-0.25)
    expect(flipped.at(1, 0)).toBe(0.5)
    expect(negatedField(field).at(0, 0)).toBe(-0.25)
  })
})
