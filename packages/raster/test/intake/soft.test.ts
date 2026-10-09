import type { RasterImage } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { intakePixels } from '../../src/intake/coverage'
import {
  cappedFactor,
  factorForWidth,
  MAX_FACTOR,
  reduceRaster,
  softIntake,
  softVerdict,
} from '../../src/intake/soft'
import { blur, coverage, glowScene, grayRaster, iconScene, upscale } from './scenes'

/** A white disc on black, `size²`, `ss×` supersampled, rounded to 8 bits. */
function whiteDisc(size: number, r: number, ss: number): RasterImage {
  const c = size / 2
  return grayRaster(
    coverage(size, size, ss, (x, y) => (x - c) ** 2 + (y - c) ** 2 < r * r),
    size,
    size,
  )
}

const verdictOf = (img: RasterImage) => softVerdict(intakePixels(img).rgb, img.width, img.height)

describe('factorForWidth', () => {
  it('lands on the measured upscales', () => {
    expect(factorForWidth(2.14)).toBe(2)
    expect(factorForWidth(2.3)).toBe(2)
    expect(factorForWidth(1.85)).toBe(2)
    expect(factorForWidth(2.54)).toBe(3)
    expect(factorForWidth(3.11)).toBe(4)
    expect(factorForWidth(3.27)).toBe(4)
    expect(factorForWidth(6.12)).toBe(8)
    expect(factorForWidth(0)).toBe(1)
    expect(factorForWidth(40)).toBe(MAX_FACTOR)
  })
})

describe('cappedFactor', () => {
  it('is the largest divisor of the upscale within the cap', () => {
    expect(cappedFactor(4, 8)).toBe(4)
    expect(cappedFactor(4, 3)).toBe(2)
    expect(cappedFactor(3, 2)).toBe(1)
    expect(cappedFactor(8, 7)).toBe(4)
    expect(cappedFactor(6, 5)).toBe(3)
    expect(cappedFactor(5, 4)).toBe(1)
    expect(cappedFactor(3, 0)).toBe(0)
  })
})

describe('softVerdict', () => {
  it('keeps a native render', () => {
    expect(verdictOf(whiteDisc(128, 40, 8)).reason).toBe('native-edges')
    for (const size of [128, 256, 512]) {
      const v = verdictOf(iconScene(size))
      expect([v.factor, v.reason]).toEqual([1, 'native-edges'])
    }
  })

  it('reduces a bilinear 4× upscale by about 4 and keeps its 2× upscale', () => {
    const native = whiteDisc(128, 40, 8)
    const v = verdictOf(upscale(native, 4, 'bilinear'))
    expect(v.factor).toBeGreaterThanOrEqual(3)
    expect(v.factor).toBeLessThanOrEqual(5)
    const v2 = verdictOf(upscale(native, 2, 'bilinear'))
    expect([v2.factor, v2.reason]).toEqual([1, 'about-2x'])
  })

  it('reads a bicubic 4× upscale at about 3.3 pixels and reduces it by 4', () => {
    const v = verdictOf(upscale(iconScene(128), 4, 'bicubic'))
    expect(v.evidence.width).toBeGreaterThan(2.9)
    expect(v.evidence.width).toBeLessThan(3.7)
    expect(v.factor).toBe(4)
    expect(v.reason).toBeNull()
  })

  it('keeps a bicubic 2× upscale, soft as it reads', () => {
    const v = verdictOf(upscale(iconScene(128), 2, 'bicubic'))
    expect(v.evidence.softFraction).toBeGreaterThanOrEqual(0.9)
    expect(v.factor).toBe(1)
    expect(['about-2x', 'barely-soft']).toContain(v.reason)
  })

  it('vetoes a sharp drawing with a glow', () => {
    const v = verdictOf(glowScene(256))
    expect(v.factor).toBe(1)
    expect(['sharp-edges', 'native-edges']).toContain(v.reason)
    expect(v.evidence.sharpFraction).toBeGreaterThan(0.5)
  })

  it('keeps a raster whose thinnest features a reduction would squeeze out', () => {
    // A 1.6 px bar at 96 px, Lanczos 3×: the bar is about 10 px wide, under 3 px per factor.
    const v = verdictOf(upscale(iconScene(96), 3, 'lanczos3'))
    expect(v.reason).toBe('thin-features')
  })

  it('keeps a raster with too few strong edges', () => {
    const flat = grayRaster(new Float64Array(64 * 64).fill(1), 64, 64)
    expect(verdictOf(flat).reason).toBe('too-few-edges')
  })
})

describe('softIntake', () => {
  it('leaves a flat raster alone, the same object', () => {
    const flat = grayRaster(new Float64Array(64 * 64).fill(1), 64, 64)
    const out = softIntake(flat)
    expect(out.image).toBe(flat)
    expect(out.verdict.factor).toBe(1)
  })

  it('reduces an upscale to its source grid and an 8-bit raster', () => {
    const up = upscale(iconScene(128), 4, 'bicubic')
    const out = softIntake(up)
    expect(out.verdict.factor).toBe(4)
    expect([out.image.width, out.image.height]).toEqual([128, 128])
    expect(out.image.data).toBeInstanceOf(Uint8ClampedArray)
    expect(out.image.data.length).toBe(128 * 128 * 4)
  })

  it('is deterministic and leaves its input untouched', () => {
    const up = blur(upscale(iconScene(96), 4, 'bilinear'), 0.8)
    const before = up.data.slice()
    const a = softIntake(up)
    const b = softIntake(up)
    expect(Array.from(up.data)).toEqual(Array.from(before))
    expect(a.verdict).toEqual(b.verdict)
    expect(Array.from(a.image.data)).toEqual(Array.from(b.image.data))
  })
})

describe('reduceRaster', () => {
  it('rounds each side to the factor, at least 8 px', () => {
    const white = (w: number, h: number): RasterImage => ({
      width: w,
      height: h,
      data: new Uint8ClampedArray(w * h * 4).fill(255),
    })
    const small = reduceRaster(white(40, 18), 4)
    expect([small.width, small.height]).toEqual([10, 8])
    const odd = reduceRaster(white(42, 34), 4)
    expect([odd.width, odd.height]).toEqual([11, 9])
  })

  it('puts an exact half level back on the lattice by rounding it up', () => {
    // Opaque columns alternating 254 and 255: each 2 × 2 average is 254.5 levels.
    const data = new Uint8ClampedArray(32 * 16 * 4)
    for (let p = 0; p < 32 * 16; p++) {
      data.fill(p % 2 === 0 ? 254 : 255, p * 4, p * 4 + 3)
      data[p * 4 + 3] = 255
    }
    const out = reduceRaster({ width: 32, height: 16, data }, 2)
    expect([out.width, out.height]).toEqual([16, 8])
    expect(out.data.every((v) => v === 255)).toBe(true)
  })
})
