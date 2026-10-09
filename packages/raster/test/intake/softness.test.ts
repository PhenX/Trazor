import { describe, expect, it } from 'vitest'
import { intakePixels } from '../../src/intake/coverage'
import {
  gridContrast,
  MIN_EDGES,
  NO_RAMP_EVIDENCE,
  rampEvidence,
  shadingShare,
} from '../../src/intake/softness'
import { coverage, glowScene, grayRaster, upscale } from './scenes'
import type { RasterImage } from '@trazor/core'

/** A dark disc of radius `r` at the center of a white `size²` raster, `ss×` supersampled, as unrounded gray `rgb`. */
function disc(size: number, r: number, ss: number): Float32Array {
  const c = size / 2
  const cov = coverage(size, size, ss, (x, y) => (x - c) ** 2 + (y - c) ** 2 < r * r)
  const out = new Float32Array(size * size * 3)
  for (let p = 0; p < size * size; p++) out.fill(1 - cov[p], p * 3, p * 3 + 3)
  return out
}

/** Bilinear upscale of an `n²` gray `rgb` raster by the integer `k`, unrounded. */
function bilinearUp(src: Float32Array, n: number, k: number): Float32Array {
  const m = n * k
  const out = new Float32Array(m * m * 3)
  for (let y = 0; y < m; y++) {
    for (let x = 0; x < m; x++) {
      const fx = Math.min(Math.max((x + 0.5) / k - 0.5, 0), n - 1)
      const fy = Math.min(Math.max((y + 0.5) / k - 0.5, 0), n - 1)
      const x0 = Math.floor(fx)
      const y0 = Math.floor(fy)
      const x1 = Math.min(x0 + 1, n - 1)
      const y1 = Math.min(y0 + 1, n - 1)
      const tx = fx - x0
      const ty = fy - y0
      const v = (xx: number, yy: number): number => src[(yy * n + xx) * 3]
      const a = v(x0, y0) * (1 - tx) + v(x1, y0) * tx
      const b = v(x0, y1) * (1 - tx) + v(x1, y1) * tx
      out.fill(a * (1 - ty) + b * ty, (y * m + x) * 3, (y * m + x) * 3 + 3)
    }
  }
  return out
}

const rgbOf = (img: RasterImage): Float32Array => intakePixels(img).rgb

describe('rampEvidence', () => {
  it('reads a native render as native and sharp', () => {
    const e = rampEvidence(disc(256, 90, 8), 256, 256)
    expect(e.edges).toBeGreaterThanOrEqual(MIN_EDGES)
    expect(e.softFraction).toBeLessThan(0.2)
    expect(e.width).toBeGreaterThanOrEqual(0.7)
    expect(e.width).toBeLessThan(1.25)
    expect(e.sharpFraction).toBeGreaterThan(0.9)
  })

  it('reads a native edge width of about one pixel at 128, 256 and 512', () => {
    for (const size of [128, 256, 512]) {
      const e = rampEvidence(disc(size, size * 0.35, 8), size, size)
      expect(e.width).toBeGreaterThanOrEqual(0.7)
      expect(e.width).toBeLessThan(1.25)
      expect(e.softFraction).toBeLessThan(0.2)
    }
  })

  it('catches a bilinear 2× upscale, whose linear ramps the edge width cannot see, and finds no sharp edge', () => {
    const e = rampEvidence(bilinearUp(disc(128, 45, 8), 128, 2), 256, 256)
    expect(e.softFraction).toBeGreaterThan(0.9)
    expect(e.width).toBeGreaterThan(1.6)
    expect(e.sharpFraction).toBeLessThan(0.2)
  })

  it('keeps the sharp edges of a disc with a glow', () => {
    const e = rampEvidence(rgbOf(glowScene(256)), 256, 256)
    expect(e.sharpFraction).toBeGreaterThan(0.5)
  })

  it('grows the width with the upscale factor', () => {
    const small = disc(64, 22, 8)
    const w2 = rampEvidence(bilinearUp(small, 64, 2), 128, 128).width
    const w4 = rampEvidence(bilinearUp(small, 64, 4), 256, 256).width
    expect(w4).toBeGreaterThan(1.6 * w2)
  })

  it('reads a bicubic 4× upscale at about 3 pixels, every edge soft and none sharp', () => {
    const small = grayRaster(
      disc(128, 40, 8).filter((_, i) => i % 3 === 0),
      128,
      128,
    )
    const e = rampEvidence(rgbOf(upscale(small, 4, 'bicubic')), 512, 512)
    expect(e.softFraction).toBe(1)
    expect(e.sharpFraction).toBe(0)
    expect(e.width).toBeGreaterThan(2.6)
    expect(e.width).toBeLessThan(3.7)
  })

  it('claims nothing on flat or tiny input', () => {
    const flat = new Float32Array(64 * 64 * 3).fill(0.5)
    expect(rampEvidence(flat, 64, 64)).toEqual(NO_RAMP_EVIDENCE)
    expect(rampEvidence(flat.subarray(0, 48), 4, 4)).toEqual(NO_RAMP_EVIDENCE)
    expect(rampEvidence(flat.subarray(0, 30), 64, 64)).toEqual(NO_RAMP_EVIDENCE)
  })
})

describe('gridContrast', () => {
  it('finds a 4× upscale repeating every 4 pixels and a native render not', () => {
    const up = bilinearUp(disc(64, 22, 8), 64, 4)
    expect(gridContrast(up, 256, 256, 4)).toBeGreaterThan(0.5)
    expect(gridContrast(disc(256, 90, 8), 256, 256, 4)).toBeLessThan(0.5)
    expect(gridContrast(up, 256, 256, 1)).toBe(0)
    expect(gridContrast(up.subarray(0, 300), 10, 10, 4)).toBe(0)
  })

  it('is the per-phase spread of the summed second differences, phase a mod k', () => {
    const img = bilinearUp(disc(40, 13, 4), 40, 3)
    const n = 120
    const lum = (i: number): number =>
      0.2126 * img[i * 3] + 0.7152 * img[i * 3 + 1] + 0.0722 * img[i * 3 + 2]
    for (let k = 2; k < 9; k++) {
      let worst = Infinity
      for (const rows of [true, false]) {
        const at = (a: number, c: number): number => (rows ? c * n + a : a * n + c)
        const phase = new Float64Array(k)
        const count = new Float64Array(k)
        for (let a = 1; a < n - 1; a++) {
          let s = 0
          for (let c = 0; c < n; c++)
            s += Math.abs(lum(at(a + 1, c)) - 2 * lum(at(a, c)) + lum(at(a - 1, c)))
          phase[a % k] += s
          count[a % k] += 1
        }
        const means = Array.from(phase, (s, i) => s / Math.max(count[i], 1))
        const mean = means.reduce((x, y) => x + y, 0) / k
        worst = Math.min(worst, (Math.max(0, ...means) - Math.min(...means)) / mean)
      }
      expect(gridContrast(img, n, n, k)).toBe(worst)
    }
  })
})

describe('shadingShare', () => {
  it('reads a soft edge as no shading and a ramp fill as shading', () => {
    const up = bilinearUp(disc(64, 22, 8), 64, 4)
    expect(shadingShare(up, 256, 256, 12)).toBe(0)
    const ramp = new Float32Array(128 * 128 * 3)
    for (let i = 0; i < 128 * 128; i++) ramp.fill((i % 128) / 255 + 0.2, i * 3, i * 3 + 3)
    expect(shadingShare(ramp, 128, 128, 6)).toBeGreaterThan(0.9)
    expect(shadingShare(ramp.subarray(0, 12), 2, 2, 1)).toBe(0)
  })
})
