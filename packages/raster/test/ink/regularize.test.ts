import { NOISE_FLOOR, mulberry32 } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { regularizeLabels, residualIncoherence, residualSigma } from '../../src/ink/regularize'
import {
  compositeOverWhite,
  decodeRle,
  f32,
  mosaicScene,
  seamScene,
  translucentScene,
} from './region-scenes'
import type { Scene } from './region-scenes'
import { PARITY_FIXTURES } from './regions-parity'

const gray = (v: number, n: number): Float32Array => new Float32Array(n * 3).fill(v)

describe('regularizeLabels', () => {
  it('removes a weak island but keeps a high-contrast one-pixel stroke', () => {
    const inks = Float64Array.of(0, 0, 0, 0.025, 0.025, 0.025, 1, 1, 1)
    const rgb = gray(0, 81)
    const labels = new Int32Array(81)
    rgb.fill(0.025, 20 * 3, 21 * 3)
    labels[20] = 1
    for (let y = 0; y < 9; y++) {
      rgb.fill(1, (y * 9 + 6) * 3, (y * 9 + 7) * 3)
      labels[y * 9 + 6] = 2
    }
    regularizeLabels(rgb, labels, 9, 9, inks, 3 / 255)
    expect(labels[20]).toBe(0)
    for (let y = 0; y < 9; y++) expect(labels[y * 9 + 6]).toBe(2)
  })

  it('lowers the stated global energy', () => {
    const inks = Float64Array.of(0.2, 0.2, 0.2, 0.3, 0.3, 0.3)
    const rgb = gray(0.24, 64)
    const labels = Int32Array.from({ length: 64 }, (_, i) => (i % 3 === 0 ? 1 : 0))
    const sigma = 0.025
    const penalty = 2 * sigma * sigma * Math.log(64)
    const energy = (l: Int32Array): number => {
      let total = 0
      for (let i = 0; i < 64; i++) {
        for (let c = 0; c < 3; c++) total += (rgb[i * 3 + c] - inks[l[i] * 3 + c]) ** 2
        if (i % 8 < 7 && l[i] !== l[i + 1]) total += penalty
        if (Math.floor(i / 8) < 7 && l[i] !== l[i + 8]) total += penalty
      }
      return total
    }
    const before = energy(labels)
    const changes = regularizeLabels(rgb, labels, 8, 8, inks, sigma)
    expect(changes).toBeGreaterThan(0)
    expect(energy(labels)).toBeLessThan(before)
  })

  it('does nothing to an empty image', () => {
    expect(
      regularizeLabels(
        new Float32Array(0),
        new Int32Array(0),
        0,
        0,
        Float64Array.of(0, 0, 0),
        0.01,
      ),
    ).toBe(0)
  })
})

describe('residualSigma', () => {
  it('does not invent noise on exact flats', () => {
    expect(
      residualSigma(gray(0.5, 100), new Int32Array(100), 10, 10, Float64Array.of(0.5, 0.5, 0.5)),
    ).toBe(NOISE_FLOOR)
  })

  it('reads the floor for images under 3 × 3', () => {
    expect(
      residualSigma(gray(0.2, 4), new Int32Array(4), 2, 2, Float64Array.of(0.9, 0.9, 0.9)),
    ).toBe(NOISE_FLOOR)
  })

  it('reads interior noise as its RMS over channels, and leaves an anti-aliasing ramp out', () => {
    const w = 24
    const h = 24
    const rand = mulberry32(5)
    const inks = Float64Array.of(0.2, 0.2, 0.2, 0.8, 0.8, 0.8)
    const rgb = new Float32Array(w * h * 3)
    const labels = new Int32Array(w * h)
    const sd = 4 / 255
    for (let p = 0; p < w * h; p++) {
      const x = p % w
      labels[p] = x < 12 ? 0 : 1
      // The boundary column is a clean blend: on the two-ink segment.
      const base = x < 11 ? 0.2 : x === 11 ? 0.45 : 0.8
      for (let c = 0; c < 3; c++) {
        const jitter = x === 11 ? 0 : (rand() < 0.5 ? -1 : 1) * sd
        rgb[p * 3 + c] = base + jitter
      }
    }
    // Each interior pixel is off its ink by exactly `sd` per channel; the ramp adds nothing.
    expect(residualSigma(rgb, labels, w, h, inks)).toBeCloseTo(sd, 6)
  })

  it('clamps to eight levels', () => {
    const w = 12
    const rgb = gray(0.5, w * w)
    expect(
      residualSigma(rgb, new Int32Array(w * w), w, w, Float64Array.of(0.1, 0.1, 0.1)),
    ).toBeCloseTo(8 / 255, 9)
  })
})

describe('residualIncoherence', () => {
  it('is zero under 5 × 5 and with too few samples', () => {
    expect(
      residualIncoherence(gray(0.3, 16), new Int32Array(16), 4, 4, Float64Array.of(0, 0, 0)),
    ).toBe(0)
    expect(
      residualIncoherence(gray(0.3, 100), new Int32Array(100), 10, 10, Float64Array.of(0, 0, 0)),
    ).toBe(0)
  })

  it('annihilates a smooth ramp and reads pixel-to-pixel damage', () => {
    const w = 32
    const n = w * w
    const inks = Float64Array.of(0, 0, 0)
    const ramp = new Float32Array(n * 3)
    for (let p = 0; p < n; p++) ramp.fill(0.2 + 0.01 * (p % w), p * 3, p * 3 + 3)
    expect(residualIncoherence(ramp, new Int32Array(n), w, w, inks)).toBeLessThan(1e-3)
    const rand = mulberry32(9)
    const damaged = ramp.map((v) => v + (rand() - 0.5) * 0.04)
    expect(residualIncoherence(damaged, new Int32Array(n), w, w, inks)).toBeGreaterThan(1)
  })
})

describe('parity with inkvec', () => {
  const scenes: Record<string, () => Scene> = {
    seam: seamScene,
    translucent: translucentScene,
    mosaic: mosaicScene,
  }
  for (const fx of PARITY_FIXTURES) {
    it(`measures and regularizes the ${fx.name} scene as inkvec does`, () => {
      const scene = scenes[fx.name]()
      const { w, h } = scene
      const rgb = compositeOverWhite(scene)
      const inks = f32(fx.pal)
      const r = fx.regularize
      const labels0 = decodeRle(fx.cases[0].labels0)
      const speckled = decodeRle(fx.cases[2].labels0)
      const rel = (a: number, b: number): number => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12)
      expect(rel(residualSigma(rgb, labels0, w, h, inks), r.residualSigma)).toBeLessThan(1e-6)
      expect(rel(residualSigma(rgb, speckled, w, h, inks), r.residualSigmaSpeckled)).toBeLessThan(
        1e-6,
      )
      expect(rel(residualIncoherence(rgb, labels0, w, h, inks), r.incoherence)).toBeLessThan(1e-6)
      expect(
        rel(residualIncoherence(rgb, speckled, w, h, inks), r.incoherenceSpeckled),
      ).toBeLessThan(1e-6)

      const reg = labels0.slice()
      expect(regularizeLabels(rgb, reg, w, h, inks, r.sigmaLossy)).toBe(r.changes)
      expect(Array.from(reg)).toEqual(Array.from(decodeRle(r.labels)))
      const reg2 = speckled.slice()
      expect(regularizeLabels(rgb, reg2, w, h, inks, 0.02)).toBe(r.changesSpeckled)
      expect(Array.from(reg2)).toEqual(Array.from(decodeRle(r.labelsSpeckled)))
    })
  }
})
