import { estimateNoise, NOISE_FLOOR } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import {
  NOISE_SIGMAS,
  SAME_INK_DE00,
  SOFT_INTAKE_EDGE,
  SOFT_NOISE_SIGMAS,
  SOFT_RINGING,
  SOFT_RINGING_LARGE,
  SOFT_SAME_INK_DE00,
} from '../../src/ink/palette'
import {
  compositeOverWhite,
  downsampleTo,
  flatError,
  intakeEvidence,
  intakePixels,
  intakeScale,
  kthSmallest,
  lumaF32,
  oversampleFactor,
  rasterToRgba,
  rasterUnitScales,
  ringingScore,
} from '../../src/intake/coverage'
import type { RgbaImage } from '../../src/intake/coverage'
import { blockCompress, disc, iconScene, upscale } from './scenes'

const F = Math.fround

/** Gray `rgb` (three equal channels per pixel) from one value per pixel. */
function grayRgb(v: ArrayLike<number>): Float32Array {
  const out = new Float32Array(v.length * 3)
  for (let p = 0; p < v.length; p++) out.fill(v[p], p * 3, p * 3 + 3)
  return out
}

/** A hard step at `edge`, then a linear ramp `width` pixels wide, then flat: `width = 1` is a native blend pixel. */
function ramp(w: number, h: number, edge: number, width: number): Float32Array {
  const v = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) v[y * w + x] = Math.min(Math.max((x - edge) / width, 0), 1)
  }
  return grayRgb(v)
}

/** A step blurred by about `sigma` pixels (a tanh standing in for the error function). */
function blurredStep(w: number, h: number, edge: number, sigma: number): Float32Array {
  const v = new Float64Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) v[y * w + x] = 0.5 * (1 + Math.tanh((0.8 * (x - edge)) / sigma))
  }
  return grayRgb(v)
}

/** Deterministic xorshift values in `[0, 1)`. */
function xorshift(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s ^= s << 13
    s >>>= 0
    s ^= s >>> 17
    s ^= s << 5
    s >>>= 0
    return s / 2 ** 32
  }
}

describe('intakePixels', () => {
  it('composites over white in single precision and keeps alpha only when something is translucent', () => {
    const data = Uint8ClampedArray.of(255, 0, 0, 255, 0, 0, 255, 128, 10, 20, 30, 0)
    const { rgb, alpha } = intakePixels({ width: 3, height: 1, data })
    expect(Array.from(alpha ?? [])).toEqual([1, F(128 / 255), 0])
    const a = F(128 / 255)
    expect(rgb[5]).toBe(F(F(1 * a) + F(1 - a)))
    expect(rgb[3]).toBe(F(1 - a))
    expect(Array.from(rgb.subarray(6))).toEqual([1, 1, 1])
    const opaque = intakePixels({ width: 1, height: 1, data: Uint8ClampedArray.of(1, 2, 3, 255) })
    expect(opaque.alpha).toBeNull()
    expect(Array.from(opaque.rgb)).toEqual([F(1 / 255), F(2 / 255), F(3 / 255)])
  })

  it('reads each byte as the single-precision k / 255', () => {
    const data = new Uint8ClampedArray(256 * 4)
    for (let k = 0; k < 256; k++) data.fill(k, k * 4, k * 4 + 4)
    const { data: f } = rasterToRgba({ width: 256, height: 1, data })
    for (let k = 0; k < 256; k++) expect(f[k * 4]).toBe(F(k / 255))
  })
})

describe('intakeScale', () => {
  it('measures a native edge as one pixel', () => {
    expect(intakeScale(ramp(64, 64, 20, 1), 64, 64)).toBeCloseTo(1, 1)
  })

  it('reads 1.00 exactly on native renders at 128, 256 and 512', () => {
    for (const size of [128, 256, 512]) {
      const { rgb } = intakePixels(disc(size, size * 0.3))
      expect(intakeScale(rgb, size, size)).toBe(1)
      const icon = intakePixels(iconScene(size))
      expect(intakeScale(icon.rgb, size, size)).toBe(1)
    }
  })

  it('grows with the true width and clears the soft-intake threshold on a soft edge', () => {
    let last = 0
    for (const sigma of [1, 2, 4]) {
      const s = intakeScale(blurredStep(128, 128, 60, sigma), 128, 128)
      expect(s).toBeGreaterThan(last)
      last = s
    }
    expect(last).toBeGreaterThan(SOFT_INTAKE_EDGE)
  })

  it('never reports under one, and answers degenerate input', () => {
    expect(intakeScale(new Float32Array(32 * 32 * 3).fill(0.5), 32, 32)).toBeGreaterThanOrEqual(1)
    expect(intakeScale(new Float32Array(0), 0, 0)).toBe(1)
    expect(intakeScale(new Float32Array(3).fill(0.5), 1, 1)).toBe(1)
    expect(intakeScale(new Float32Array(12), 2, 2)).toBe(1)
    expect(intakeScale(new Float32Array(12), 100, 100)).toBe(1)
    const nan = new Float32Array(32 * 32 * 3).fill(0.5)
    nan[30] = Number.NaN
    nan[76] = Infinity
    const s = intakeScale(nan, 32, 32)
    expect(Number.isFinite(s) && s >= 1).toBe(true)
  })

  it('is the median of every row and column vote, as a column-major walk with a sort reads it', () => {
    const next = xorshift(0xfeedbeef)
    for (let trial = 0; trial < 40; trial++) {
      const w = 1 + Math.floor(next() * 70)
      const h = 1 + Math.floor(next() * 70)
      const width = 1 + next() * 6
      const rgb = new Float32Array(w * h * 3)
      for (let p = 0; p < w * h; p++) {
        const t = Math.min((((p % w) + 0.7 * Math.floor(p / w)) % 17) / width, 1)
        const n = trial % 3 === 0 ? next() * 0.02 : 0
        rgb[p * 3] = t + n
        rgb[p * 3 + 1] = 0.5 * t
        rgb[p * 3 + 2] = 1 - t
      }
      expect(intakeScale(rgb, w, h)).toBe(referenceScale(rgb, w, h))
    }
  })
})

/** {@link intakeScale} as the formula states it: rows, then columns walked column by column, median by sorting. */
function referenceScale(rgb: Float32Array, w: number, h: number): number {
  if (w < 3 || h < 3) return 1
  const lum = (i: number): number => F(F(F(rgb[i * 3] + rgb[i * 3 + 1]) + rgb[i * 3 + 2]) / 3)
  const votes: number[] = []
  const vote = (a: number, b: number, c: number): void => {
    const d0 = F(b - a)
    const d1 = F(c - b)
    const first = Math.max(Math.abs(d0), Math.abs(d1))
    const second = Math.abs(F(d1 - d0))
    if (first > F(2 / 255) && second > F(1e-6)) {
      const r = F(first / second)
      if (Number.isFinite(r)) votes.push(Math.min(Math.max(r, 0.25), 64))
    }
  }
  for (let y = 0; y < h; y++)
    for (let x = 0; x + 2 < w; x++) vote(lum(y * w + x), lum(y * w + x + 1), lum(y * w + x + 2))
  for (let x = 0; x < w; x++)
    for (let y = 0; y + 2 < h; y++) vote(lum(y * w + x), lum((y + 1) * w + x), lum((y + 2) * w + x))
  if (votes.length < 16) return 1
  votes.sort((a, b) => a - b)
  return Math.max(votes[votes.length >>> 1], 1)
}

describe('kthSmallest', () => {
  it('returns what sorting does, ties included', () => {
    const next = xorshift(0x12345678)
    for (let len = 1; len < 200; len++) {
      const v = Float32Array.from({ length: len }, () => Math.floor(next() * 23) * 0.125)
      const sorted = Float32Array.from(v).sort()
      for (const q of [0, 0.1, 0.5, 0.6, 0.9, 1]) {
        const k = Math.round((len - 1) * q)
        expect(kthSmallest(v.slice(), k)).toBe(sorted[k])
      }
    }
  })
})

describe('ringingScore', () => {
  /** A vertical boundary, dark left and light right, optionally with a decaying alternating overshoot 3-7 px out. */
  function boundary(ring: boolean): Float32Array {
    const w = 256
    const v = new Float64Array(w * w)
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        let t = F(x < w / 2 ? 0.1 : 0.9)
        const d = Math.abs(x - w / 2)
        if (ring && d >= 3 && d <= 7)
          t = F(t + F((d % 2 === 0 ? 1 : -1) * F(F(0.1) * F(1 - F((d - 3) / 5)))))
        v[y * w + x] = t
      }
    }
    return grayRgb(v)
  }

  it('sees ringing in the ring band and nowhere else', () => {
    const clean = ringingScore(boundary(false), 256, 256)
    const ringy = ringingScore(boundary(true), 256, 256)
    expect(clean).toBeLessThan(SOFT_RINGING_LARGE)
    expect(ringy).toBeGreaterThan(SOFT_RINGING_LARGE)
    expect(ringy).toBeGreaterThan(clean * 2 + 0.01)
  })

  it('separates a block-compressed render from its clean original', () => {
    const clean = intakePixels(iconScene(256))
    const jpeg = intakePixels(blockCompress(iconScene(256), 40))
    expect(ringingScore(clean.rgb, 256, 256)).toBeLessThan(0.01)
    expect(ringingScore(jpeg.rgb, 256, 256)).toBeGreaterThan(SOFT_RINGING_LARGE)
  })

  it('answers 0 on degenerate input', () => {
    expect(ringingScore(new Float32Array(0), 0, 0)).toBe(0)
    expect(ringingScore(new Float32Array(48).fill(0.5), 4, 4)).toBe(0)
    expect(ringingScore(new Float32Array(64 * 64 * 3).fill(0.5), 64, 64)).toBe(0)
    expect(ringingScore(new Float32Array(48).fill(0.5), 100, 100)).toBe(0)
  })

  it('is blind to edge width, and the noise estimate to ringing, as the soft-intake gate assumes', () => {
    // Ringing leaves the transition one pixel wide, so the edge width cannot see it; and it lives
    // in a band beside the edge while the image stays flat, so the noise estimate cannot either.
    const w = 96
    const img = ramp(w, w, 30, 1)
    let seed = 999
    for (let y = 0; y < w; y++) {
      for (let x = 0; x < w; x++) {
        const d = Math.abs(x - 30)
        if (d < 2) continue
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
        const amp = 0.06 * Math.exp(-d / 8) * ((seed >>> 16) / 65535 - 0.5)
        for (let c = 0; c < 3; c++) {
          const i = (y * w + x) * 3 + c
          img[i] = Math.min(Math.max(img[i] + amp, 0), 1)
        }
      }
    }
    expect(intakeScale(img, w, w)).toBeLessThan(SOFT_INTAKE_EDGE)
    const gray = (rgb: Float32Array): Float32Array => rgb.filter((_, i) => i % 3 === 0)
    expect(estimateNoise(gray(img), w, w)).toBeCloseTo(NOISE_FLOOR, 12)
    expect(estimateNoise(gray(ramp(w, w, 30, 1)), w, w)).toBeCloseTo(NOISE_FLOOR, 12)
  })
})

describe('oversampleFactor', () => {
  /** A black disc of `area` px² on an `n × n` white canvas, its rim a linear ramp `ramp` px wide. */
  function discOnWhite(n: number, area: number, rampWidth: number): Float32Array {
    const r = Math.sqrt(area / Math.PI)
    const c = n / 2
    const v = new Float64Array(n * n)
    for (let i = 0; i < n * n; i++) {
      const d = Math.hypot((i % n) - c, Math.floor(i / n) - c)
      v[i] = 1 - Math.min(Math.max((r + rampWidth / 2 - d) / rampWidth, 0), 1)
    }
    return grayRgb(v)
  }

  it('does not read a lone small shape on a near-empty canvas as eight times oversampled', () => {
    expect(oversampleFactor(discOnWhite(144, 38, 1), 144, 144)).toBeLessThanOrEqual(2)
    expect(oversampleFactor(discOnWhite(144, 38 * 16, 4), 144, 144)).toBeGreaterThanOrEqual(4)
    expect(oversampleFactor(new Float32Array(64 * 64 * 3).fill(0.3), 64, 64)).toBe(8)
  })

  it('reads a native raster as 1 and an upscaled one as at least 2', () => {
    expect(oversampleFactor(ramp(64, 64, 20, 1), 64, 64)).toBe(1)
    expect(oversampleFactor(blurredStep(64, 64, 30, 2), 64, 64)).toBeGreaterThanOrEqual(2)
    const up = intakePixels(upscale(iconScene(128), 4, 'bicubic'))
    expect(oversampleFactor(up.rgb, 512, 512)).toBeGreaterThanOrEqual(4)
  })

  it('answers 1 on degenerate input', () => {
    expect(oversampleFactor(new Float32Array(0), 0, 0)).toBe(1)
    expect(oversampleFactor(new Float32Array(12), 2, 2)).toBe(1)
    expect(oversampleFactor(new Float32Array(30), 20, 20)).toBe(1)
  })

  it('measures the flat error as the mean deviation from the per-channel median', () => {
    expect(flatError(grayRgb([0, 1, 1, 1]), 2, 2)).toBeCloseTo(255 / 4, 9)
    expect(flatError(grayRgb([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]), 3, 2)).toBe(0)
    expect(flatError(grayRgb([0, 0, 1, 1]), 4, 1)).toBeCloseTo(255 / 2, 9)
  })
})

/** A straight RGBA image from per-pixel `[r, g, b, a]`. */
function rgba(w: number, h: number, px: (x: number, y: number) => readonly number[]): RgbaImage {
  const data = new Float32Array(w * h * 4)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(px(x, y), (y * w + x) * 4)
  return { width: w, height: h, data }
}

describe('downsampleTo', () => {
  it('is the identity at the same size', () => {
    const img = rgba(8, 8, (x, y) => [((y * 8 + x) % 255) / 255, 0.2, 0.4, 1])
    expect(Array.from(downsampleTo(img, 8, 8).data)).toEqual(Array.from(img.data))
  })

  it('does not bleed color from transparent pixels', () => {
    const img = rgba(4, 4, (x, y) => ((y * 4 + x) % 2 === 0 ? [1, 1, 1, 1] : [0, 0, 0, 0]))
    const small = downsampleTo(img, 2, 2)
    for (let i = 0; i < 4; i++) {
      for (let c = 0; c < 3; c++) expect(small.data[i * 4 + c]).toBeGreaterThan(0.99)
    }
  })

  it('partitions a pixel between target cells by exact overlap at a non-integer ratio', () => {
    const img = rgba(5, 5, (x, y) => (x === 2 && y === 2 ? [1, 1, 1, 1] : [0, 0, 0, 0]))
    const small = downsampleTo(img, 2, 2)
    let total = 0
    for (let i = 0; i < 4; i++) {
      const a = small.data[i * 4 + 3]
      total += a
      expect(a).toBeCloseTo(0.25 / 6.25, 6)
      for (let c = 0; c < 3; c++) expect(small.data[i * 4 + c]).toBeCloseTo(1, 5)
    }
    expect(total * 6.25).toBeCloseTo(1, 6)
  })

  it('matches the closed-form integral of a piecewise-constant ramp', () => {
    const [w, h, nw, nh] = [100, 4, 41, 3]
    const small = downsampleTo(
      rgba(w, h, (x) => [x / w, x / w, x / w, 1]),
      nw,
      nh,
    )
    const integral = (x: number): number => {
      const n = Math.floor(x)
      return ((n * (n - 1)) / 2 + n * (x - n)) / w
    }
    const sx = w / nw
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const expected = (integral((x + 1) * sx) - integral(x * sx)) / sx
        expect(Math.abs(small.data[(y * nw + x) * 4] - expected)).toBeLessThan(1e-7)
      }
    }
  })

  it('partitions every source impulse, down and up, with asymmetric ratios', () => {
    for (const [w, h, nw, nh] of [
      [7, 5, 3, 2],
      [11, 7, 4, 3],
      [5, 3, 2, 7],
    ]) {
      const area = (w * h) / (nw * nh)
      const targetSums = new Float64Array(nw * nh)
      for (let source = 0; source < w * h; source++) {
        const img = rgba(w, h, (x, y) => (y * w + x === source ? [1, 1, 1, 1] : [0, 0, 0, 0]))
        const small = downsampleTo(img, nw, nh)
        let mass = 0
        for (let i = 0; i < nw * nh; i++) {
          mass += small.data[i * 4 + 3] * area
          targetSums[i] += small.data[i * 4 + 3]
        }
        expect(mass).toBeCloseTo(1, 6)
      }
      for (const s of targetSums) expect(s).toBeCloseTo(1, 6)
    }
  })

  it('conserves premultiplied energy at arbitrary ratios', () => {
    const [w, h, nw, nh] = [37, 23, 17, 11]
    let src = 0
    const img = rgba(w, h, (x, y) => {
      const v = F(((x * 7 + y * 13) % 256) / 255)
      const a = F(((x * 11 + y * 5) % 256) / 255)
      src += F(v * a)
      return [v, v, v, a]
    })
    const small = downsampleTo(img, nw, nh)
    const cell = (w / nw) * (h / nh)
    let dst = 0
    for (let i = 0; i < nw * nh; i++) dst += small.data[i * 4] * small.data[i * 4 + 3] * cell
    expect(Math.abs(dst - src) / src).toBeLessThan(1e-5)
  })

  it('handles a single pixel, an upsample to it and a reduction to one pixel', () => {
    const one = rgba(1, 1, () => [0.5, 0.4, 0.3, 0.8])
    expect(Array.from(downsampleTo(one, 1, 1).data)).toEqual(Array.from(one.data))
    const up = downsampleTo(one, 2, 2)
    expect([up.width, up.height]).toEqual([2, 2])
    for (let i = 0; i < 4; i++) {
      expect(up.data[i * 4]).toBeCloseTo(0.5, 5)
      expect(up.data[i * 4 + 3]).toBeCloseTo(0.8, 5)
    }
    const down = downsampleTo(
      rgba(7, 5, () => [1, 1, 1, 1]),
      1,
      1,
    )
    expect([down.width, down.data[0], down.data[3]]).toEqual([1, 1, 1])
  })

  it('returns the input at its own size for a zero dimension or a short buffer', () => {
    expect(downsampleTo({ width: 0, height: 5, data: new Float32Array(0) }, 10, 10).width).toBe(0)
    expect(downsampleTo({ width: 5, height: 0, data: new Float32Array(0) }, 10, 10).height).toBe(0)
    const valid = { width: 4, height: 4, data: new Float32Array(64).fill(0.5) }
    expect(downsampleTo(valid, 0, 4).width).toBe(4)
    expect(downsampleTo(valid, 4, 0).height).toBe(4)
    expect(
      downsampleTo({ width: 4, height: 4, data: new Float32Array(10) }, 2, 2).data.length,
    ).toBe(10)
  })

  it('keeps a flat color across anisotropic scaling, and gives a clear cell color 0', () => {
    const out = downsampleTo(
      rgba(10, 2, () => [0.8, 0.4, 0.2, 1]),
      3,
      8,
    )
    for (let i = 0; i < 24; i++) {
      expect(out.data[i * 4]).toBeCloseTo(0.8, 5)
      expect(out.data[i * 4 + 3]).toBeCloseTo(1, 5)
    }
    const clear = downsampleTo(
      rgba(33, 19, () => [1, 0.5, 0.2, 0]),
      11,
      7,
    )
    expect(clear.data.every((v) => v === 0)).toBe(true)
  })
})

describe('intakeEvidence', () => {
  it('keeps a native render clean, so the palette reads it with its native constants', () => {
    const { rgb } = intakePixels(iconScene(256))
    const ev = intakeEvidence(rgb, 256, 256, false)
    expect(ev.edgeWidth).toBe(1)
    expect(ev.soft).toBe(false)
    expect([ev.noiseSigmas, ev.sameInkDe00]).toEqual([NOISE_SIGMAS, SAME_INK_DE00])
    expect(ev.sigmaNoise).toBe(estimateNoise(lumaF32(rgb), 256, 256))
    expect(ev.ringingGate).toBe(SOFT_RINGING_LARGE)
  })

  it('opens the soft intake on any of a wide edge, a lossy container or ringing', () => {
    const native = intakePixels(iconScene(256)).rgb
    const lossy = intakeEvidence(native, 256, 256, true)
    expect([lossy.soft, lossy.noiseSigmas, lossy.sameInkDe00]).toEqual([
      true,
      SOFT_NOISE_SIGMAS,
      SOFT_SAME_INK_DE00,
    ])
    const up = intakePixels(upscale(iconScene(128), 4, 'bicubic')).rgb
    const wide = intakeEvidence(up, 512, 512, false)
    expect(wide.edgeWidth).toBeGreaterThan(SOFT_INTAKE_EDGE)
    expect(wide.soft).toBe(true)
    const jpeg = intakePixels(blockCompress(iconScene(256), 40)).rgb
    const ringing = intakeEvidence(jpeg, 256, 256, false)
    expect(ringing.edgeWidth).toBeLessThanOrEqual(SOFT_INTAKE_EDGE)
    expect(ringing.ringing).toBeGreaterThan(ringing.ringingGate)
    expect(ringing.soft).toBe(true)
  })

  it('holds a small image to the conservative ringing gate', () => {
    const { rgb } = intakePixels(iconScene(128))
    expect(intakeEvidence(rgb, 128, 128, false).ringingGate).toBe(SOFT_RINGING)
  })
})

describe('rasterUnitScales', () => {
  it('leaves a native render at the reference size alone', () => {
    const { rgb } = intakePixels(iconScene(128))
    const s = rasterUnitScales(rgb, 128, 128)
    expect([s.precision, s.minArea, s.lambda]).toEqual([1, 1, 1])
  })

  it('scales the speckle floor and lambda by the round trip above the reference size, and precision only when soft', () => {
    const native = rasterUnitScales(intakePixels(iconScene(512)).rgb, 512, 512)
    expect(native.roundTrip).toBeGreaterThan(1)
    expect(native.precision).toBe(1)
    expect(native.minArea).toBe(native.roundTrip ** 2)
    expect(native.lambda).toBe(native.roundTrip)
    const up = rasterUnitScales(intakePixels(upscale(iconScene(128), 4, 'bicubic')).rgb, 512, 512)
    expect(up.precision).toBe(up.roundTrip)
  })
})

describe('compositeOverWhite', () => {
  it('is c·a + (1 − a) per channel', () => {
    const img = rgba(2, 1, (x) => (x === 0 ? [0.2, 0.4, 0.6, 0.5] : [0.9, 0.1, 0, 0]))
    const rgb = compositeOverWhite(img)
    expect(rgb[0]).toBe(F(F(F(0.2) * 0.5) + 0.5))
    expect(Array.from(rgb.subarray(3))).toEqual([1, 1, 1])
  })
})
