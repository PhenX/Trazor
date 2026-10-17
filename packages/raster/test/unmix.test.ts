import { rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { unmixThinInks } from '../src/unmix'
import type { UnmixResult } from '../src/unmix'

const W = 32
const H = 16
const WHITE = [246, 246, 246]
const BLACK = [3, 2, 1]

/**
 * A black outline (region 1, x ≤ 6) on a white field (region 0), and region 2:
 * a strip two pixels high running along the field from the outline, its pixels
 * painted by `paint`. What {@link unmixThinInks} finds, at the source size.
 */
function strip(paint: (x: number, y: number) => readonly number[]): UnmixResult {
  const rgba = new Uint8ClampedArray(W * H * 4)
  const region = new Int32Array(W * H)
  const size = new Float64Array(3)
  const sum = new Float64Array(9)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = y * W + x
      const r = x <= 6 ? 1 : (y === 7 || y === 8) && x <= 22 ? 2 : 0
      const c = r === 1 ? BLACK : r === 2 ? paint(x, y) : WHITE
      region[p] = r
      rgba.set([c[0], c[1], c[2], 255], p * 4)
      size[r]++
      for (let k = 0; k < 3; k++) sum[r * 3 + k] += c[k] / 255
    }
  }
  const mL = new Float64Array(3)
  const mA = new Float64Array(3)
  const mB = new Float64Array(3)
  for (let r = 0; r < 3; r++) {
    const s = size[r]
    ;[mL[r], mA[r], mB[r]] = rgbToOklab(sum[r * 3] / s, sum[r * 3 + 1] / s, sum[r * 3 + 2] / s)
  }
  return unmixThinInks(rgba, region, W, H, 3, new Uint8Array([0, 0, 1]), size, mL, mA, mB, 1)
}

/**
 * The field's rim along the outline: its four pixels nearest the outline blend
 * toward the black, a grey tinted green by `tint(x, y)` levels (the chroma a
 * compressed red edge rings past its outline); the rest is the field, faintly
 * tinted.
 */
function rim(tint: (x: number, y: number) => number): (x: number, y: number) => number[] {
  return (x, y) => {
    const v = x <= 10 ? [70, 110, 150, 190][x - 7] : x <= 12 ? 225 : 240
    const d = x <= 10 ? tint(x, y) : x <= 12 ? 2 : 1
    return [v, v + d, v]
  }
}

describe('unmixThinInks — the rim of a field along an outline', () => {
  it('keeps the mean of a rim whose tint is uneven, as compression rings it', () => {
    // The blends at the dark end are tinted 1 or 19 levels green by turns: their
    // mean sits just past the mixture tolerance off the black–white chord, by
    // less than its standard error, and most of the strip is the field.
    const res = strip(rim((x, y) => ((x + y) % 2 === 0 ? 1 : 19)))
    expect(res.unmixed[2]).toBe(0)
  })

  it('unmixes the same rim when its pixels carry one tint alike, as an ink drawn there', () => {
    const res = strip(rim(() => 10))
    expect(res.unmixed[2]).toBe(1)
  })
})
