import { describe, expect, it } from 'vitest'
import {
  CLEAR,
  absorbBlendSliversNative,
  inkRgbaW,
  reassignBlendPixelsNative,
  rgbaW,
} from '../../src/ink/native-regions'
import { despeckle } from '../../src/ink/regions'
import { compositeOverWhite, decodeRle, f32, translucentScene } from './region-scenes'
import { PARITY_FIXTURES } from './regions-parity'

describe('rgbaW / inkRgbaW', () => {
  it('pairs each color over white with its alpha, clamped, opaque when absent', () => {
    const px = rgbaW(Float32Array.of(0.1, 0.2, 0.3, 0.4, 0.5, 0.6), Float32Array.of(1.5, -0.1), 2)
    expect(Array.from(px)).toEqual(Array.from(Float32Array.of(0.1, 0.2, 0.3, 1, 0.4, 0.5, 0.6, 0)))
    expect(Array.from(rgbaW(Float32Array.of(0, 0, 0), null, 1))).toEqual([0, 0, 0, 1])
    const inks = inkRgbaW(Float64Array.of(0.1, 0.2, 0.3, 0.4, 0.5, 0.6), [0.25])
    expect(Array.from(inks)).toEqual([0.1, 0.2, 0.3, 0.25, 0.4, 0.5, 0.6, 1])
  })
})

/**
 * A red ink beside the clear ground, with a column of translucent red rim between them
 * labeled with a third, pale ink: over white the rim is a red–white blend, in four channels
 * a red–clear one.
 */
function rim(): { labels: Int32Array; px: Float32Array; inks: Float64Array; w: number; h: number } {
  const w = 8
  const h = 5
  const inks = inkRgbaW(Float64Array.of(0.9, 0.1, 0.1, 1, 1, 1, 0.96, 0.6, 0.6), [1, 0, 1])
  const labels = new Int32Array(w * h)
  const rgb = new Float32Array(w * h * 3)
  const alpha = new Float32Array(w * h)
  for (let p = 0; p < w * h; p++) {
    const x = p % w
    const a = x < 3 ? 1 : x === 3 ? 0.6 : 0
    labels[p] = x < 3 ? 0 : x === 3 ? 2 : 1
    alpha[p] = a
    rgb.set([0.9 * a + (1 - a), 0.1 * a + (1 - a), 0.1 * a + (1 - a)], p * 3)
  }
  return { labels, px: rgbaW(rgb, alpha, w * h), inks, w, h }
}

describe('absorbBlendSliversNative', () => {
  it('hands a translucent rim between an ink and the clear ground to the ink', () => {
    const s = rim()
    expect(absorbBlendSliversNative(s.labels, s.px, s.w, s.h, s.inks, 0.002)).toBe(1)
    for (let y = 0; y < s.h; y++) expect(s.labels[y * s.w + 3]).toBe(0)
  })

  it('keeps a rim that is no blend of its neighbors', () => {
    const s = rim()
    for (let y = 0; y < s.h; y++) s.px[(y * s.w + 3) * 4 + 1] = 0.9
    expect(absorbBlendSliversNative(s.labels, s.px, s.w, s.h, s.inks, 0.002)).toBe(0)
  })

  it('reads the clear ground in as the backdrop when no neighbor is clear', () => {
    // Red | blue with a translucent seam: a blend of red, blue and the clear ground.
    const w = 10
    const h = 4
    const inks = inkRgbaW(Float64Array.of(0.9, 0.1, 0.1, 0.1, 0.1, 0.9, 0.7, 0.7, 0.7), null)
    const labels = new Int32Array(w * h)
    const rgb = new Float32Array(w * h * 3)
    const alpha = new Float32Array(w * h).fill(1)
    for (let p = 0; p < w * h; p++) {
      const x = p % w
      labels[p] = x < 5 ? 0 : 1
      rgb.set(x < 5 ? [0.9, 0.1, 0.1] : [0.1, 0.1, 0.9], p * 3)
      if (x === 5) {
        labels[p] = 2
        alpha[p] = 0.5
        // Half red, half blue at half opacity, over white.
        rgb.set([0.5 * 0.5 + 0.5, 0.1 * 0.5 + 0.5, 0.5 * 0.5 + 0.5], p * 3)
      }
    }
    expect(absorbBlendSliversNative(labels, rgbaW(rgb, alpha, w * h), w, h, inks, 0.002)).toBe(1)
    for (let y = 0; y < h; y++) expect([0, 1]).toContain(labels[y * w + 5])
  })
})

describe('reassignBlendPixelsNative', () => {
  it('moves a lone translucent rim pixel to its real ink', () => {
    const s = rim()
    // Only the middle row's rim pixel carries the pale label.
    for (let y = 0; y < s.h; y++) if (y !== 2) s.labels[y * s.w + 3] = 0
    expect(reassignBlendPixelsNative(s.labels, s.px, s.w, s.h, s.inks, 0.002)).toBe(1)
    expect(s.labels[2 * s.w + 3]).toBe(0)
  })
})

describe('parity with inkvec', () => {
  it('reproduces the four-channel blend passes of the translucent scene label for label', () => {
    const fx = PARITY_FIXTURES.find((f) => f.name === 'translucent')
    expect(fx?.native).toBeTruthy()
    if (!fx?.native) return
    const scene = translucentScene()
    const { w, h } = scene
    const px = rgbaW(compositeOverWhite(scene), scene.alpha, w * h)
    const inks = inkRgbaW(f32(fx.native.pal), f32(fx.native.palAlpha))
    expect(Array.from(inks.subarray(0, 4))).not.toEqual(Array.from(CLEAR))
    for (const c of fx.native.cases) {
      let l = decodeRle(c.labels0)
      despeckle(l, w, h, c.min)
      expect(Array.from(l), `${c.name} despeckle`).toEqual(Array.from(decodeRle(c.despeckle)))

      l = decodeRle(c.despeckle)
      expect(absorbBlendSliversNative(l, px, w, h, inks, c.sigma), `${c.name} absorbed`).toBe(
        c.absorbed,
      )
      expect(Array.from(l), `${c.name} absorb`).toEqual(Array.from(decodeRle(c.absorb)))

      l = decodeRle(c.absorb)
      expect(reassignBlendPixelsNative(l, px, w, h, inks, c.sigma), `${c.name} moved`).toBe(c.moved)
      expect(Array.from(l), `${c.name} reassign`).toEqual(Array.from(decodeRle(c.reassign)))
    }
  })
})
