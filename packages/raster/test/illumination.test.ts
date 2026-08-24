import { rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { flattenIllumination } from '../src/index'
import { rasterOf } from './helpers'

/** Mean and std-dev of the Oklab L channel across an image. */
function lStats(image: { data: Uint8ClampedArray }): { mean: number; std: number } {
  const { data } = image
  const n = data.length / 4
  let sum = 0
  let sum2 = 0
  for (let p = 0; p < data.length; p += 4) {
    const L = rgbToOklab(data[p] / 255, data[p + 1] / 255, data[p + 2] / 255)[0]
    sum += L
    sum2 += L * L
  }
  const mean = sum / n
  return { mean, std: Math.sqrt(Math.max(0, sum2 / n - mean * mean)) }
}

/** Channel means in byte units. */
function rgbMeans(image: { data: Uint8ClampedArray }): [number, number, number] {
  const { data } = image
  const n = data.length / 4
  let r = 0
  let g = 0
  let b = 0
  for (let p = 0; p < data.length; p += 4) {
    r += data[p]
    g += data[p + 1]
    b += data[p + 2]
  }
  return [r / n, g / n, b / n]
}

/** A flat base color under a smooth top→bottom multiplicative shade. */
function shadedColumn(
  w: number,
  h: number,
  base: [number, number, number],
  alpha = 255,
): ReturnType<typeof rasterOf> {
  return rasterOf(w, h, (_x, y) => {
    const f = 0.35 + (0.65 * y) / (h - 1)
    return [base[0] * f, base[1] * f, base[2] * f, alpha]
  })
}

describe('flattenIllumination', () => {
  it('collapses a smooth lightness gradient toward a flat tone', () => {
    const img = shadedColumn(64, 64, [190, 70, 45])
    const before = lStats(img)
    const flat = flattenIllumination(img, { scale: 0.12, strength: 1 })
    const after = lStats(flat)
    // The shading gradient carried real lightness spread; flattening removes
    // most of it (the residual is edge effects of the finite blur).
    expect(before.std).toBeGreaterThan(0.08)
    expect(after.std).toBeLessThan(before.std * 0.3)
  })

  it('preserves hue while flattening lightness', () => {
    const img = shadedColumn(64, 64, [190, 70, 45]) // a red
    const flat = flattenIllumination(img, { scale: 0.12, strength: 1 })
    const [r, g, b] = rgbMeans(flat)
    // Still unmistakably red: only L was touched, a/b passed through.
    expect(r).toBeGreaterThan(g)
    expect(r).toBeGreaterThan(b)
  })

  it('strength 0 is an exact no-op clone', () => {
    const img = shadedColumn(16, 16, [120, 200, 90])
    const flat = flattenIllumination(img, { strength: 0 })
    expect(flat).not.toBe(img)
    expect(flat.data).toEqual(img.data)
  })

  it('leaves an already-flat image essentially unchanged', () => {
    const img = rasterOf(24, 24, () => [70, 130, 210, 255])
    const flat = flattenIllumination(img, { scale: 0.12, strength: 1 })
    // A single uniform color has gain ≈ 1 everywhere; only Oklab round-trip
    // rounding can nudge a byte.
    for (let p = 0; p < img.data.length; p++) {
      expect(Math.abs(flat.data[p] - img.data[p])).toBeLessThanOrEqual(2)
    }
  })

  it('passes alpha through unchanged', () => {
    const img = shadedColumn(20, 20, [200, 200, 60], 128)
    const flat = flattenIllumination(img, { strength: 1 })
    for (let p = 3; p < flat.data.length; p += 4) expect(flat.data[p]).toBe(128)
  })

  it('edge-aware estimate rings far less at a hard edge than a plain blur', () => {
    // Two flat gray regions, a hard vertical edge, no shading. A plain low-pass
    // bleeds the two lightnesses across the seam and the division rings a
    // bright/dark halo there; the guided estimate keeps the edge, so the output
    // stays close to flat.
    const img = rasterOf(64, 64, (x) => (x < 32 ? [70, 70, 70, 255] : [200, 200, 200, 255]))
    const range = (im: { data: Uint8ClampedArray }): number => {
      let lo = Infinity
      let hi = -Infinity
      for (let p = 0; p < im.data.length; p += 4) {
        const L = rgbToOklab(im.data[p] / 255, im.data[p + 1] / 255, im.data[p + 2] / 255)[0]
        if (L < lo) lo = L
        if (L > hi) hi = L
      }
      return hi - lo
    }
    const edgeAware = range(flattenIllumination(img, { scale: 0.12, edgeAware: true }))
    const plain = range(flattenIllumination(img, { scale: 0.12, edgeAware: false }))
    expect(edgeAware).toBeLessThan(plain * 0.5)
  })

  it('plain-blur estimator still flattens a gradient', () => {
    const img = shadedColumn(64, 64, [190, 70, 45])
    const before = lStats(img)
    const after = lStats(flattenIllumination(img, { scale: 0.12, strength: 1, edgeAware: false }))
    expect(after.std).toBeLessThan(before.std * 0.3)
  })

  it('is deterministic', () => {
    const img = shadedColumn(40, 30, [160, 90, 200])
    const a = flattenIllumination(img, { scale: 0.15, strength: 0.8 })
    const b = flattenIllumination(img, { scale: 0.15, strength: 0.8 })
    expect(a.data).toEqual(b.data)
  })

  it('handles a zero-size image', () => {
    const img = rasterOf(0, 0, () => [0, 0, 0, 0])
    const flat = flattenIllumination(img)
    expect(flat.width).toBe(0)
    expect(flat.data.length).toBe(0)
  })
})
