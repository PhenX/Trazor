import { describe, expect, it } from 'vitest'
import { blendPartners, fillEvidence, FOREIGN, partnersInside, PURE } from '../../src/fill/evidence'
import { fitFill, fitPixels, pixelsOf, select } from '../../src/fill/select'
import { aaDisc, softDisc } from './scenes'

describe('fill evidence', () => {
  it('marks an anti-aliased rim as blends and the interiors as pure', () => {
    const s = aaDisc()
    const pure = fillEvidence(s.rgb, s.w, s.h, s.labels, s.inks, s.sigma)
    const nearInk: number[] = []
    const between: number[] = []
    for (let p = 0; p < s.w * s.h; p++) {
      const v = s.rgb[3 * p]
      // Within the noise of its own ink (black 0 or white 1): evidence.
      if (v < 0.005 || v > 0.995) nearInk.push(pure[p])
      // A gray between the inks, with the other ink within two pixels: a blend.
      if (v > 0.05 && v < 0.95) between.push(pure[p])
    }
    expect(nearInk.every((e) => e === 1)).toBe(true)
    expect(between.every((e) => e === 0)).toBe(true)
    expect(between.length).toBeGreaterThan(40)
  })

  it('keeps a soft rim from buying a gradient on a solid shape', () => {
    // Blends two pixels deep pass the interior rule and lighten the disc's rim: fitted
    // as evidence they buy a radial; excluded, the disc is flat black.
    const s = softDisc()
    expect(fitFill(s.rgb, s.w, s.h, s.labels, 1, s.sigma, s.lambda).model.kind).toBe('radial')
    const pure = fillEvidence(s.rgb, s.w, s.h, s.labels, s.inks, s.sigma)
    const member = (p: number): boolean => s.labels[p] === 1
    const px = pixelsOf(s.labels, 1)
    const f = select(
      fitPixels(s.rgb, s.w, s.h, px, member, (p) => pure[p] === 1, s.sigma, s.lambda),
    )
    expect(f.model).toEqual({ kind: 'flat', color: [0, 0, 0] })
  })

  it('records the first partner, or every partner up to three', () => {
    const s = aaDisc()
    const first = blendPartners(s.rgb, s.w, s.h, s.labels, s.inks, s.sigma, false)
    const all = blendPartners(s.rgb, s.w, s.h, s.labels, s.inks, s.sigma, true)
    let bad = 0
    for (let p = 0; p < s.w * s.h; p++) {
      if (first[3 * p + 1] !== PURE || first[3 * p] !== all[3 * p]) bad++
      const q = first[3 * p]
      if (q === PURE) continue
      // A partner is a pixel of the other label within the 5×5 window.
      const near =
        Math.abs((q % s.w) - (p % s.w)) <= 2 &&
        Math.abs(Math.floor(q / s.w) - Math.floor(p / s.w)) <= 2
      if (s.labels[q] === s.labels[p] || !near) bad++
    }
    expect(bad).toBe(0)
  })

  it('leaves a pixel without an ink pure, and skips labels without one', () => {
    const rgb = new Float32Array([0.5, 0.5, 0.5, 0, 0, 0, 1, 1, 1])
    const out = blendPartners(rgb, 3, 1, [5, 0, 1], [0, 0, 0, 1, 1, 1], 0.5 / 255, false)
    expect(out[0]).toBe(PURE)
    expect(out[3]).toBe(PURE)
    expect(out[6]).toBe(PURE)
  })

  it('marks a blend towards more than three inks as foreign', () => {
    // A gray pixel of the black ink (label 0, the center of a 3×3 image) with four
    // lighter inks around it: each is a blend partner, one more than recorded.
    const labels = [1, 2, 1, 3, 0, 4, 1, 1, 1]
    const rgb = new Float32Array(27).fill(0.9)
    rgb.fill(0.5, 12, 15)
    const inks = [0, 0, 0, 0.9, 0.9, 0.9, 0.8, 0.8, 0.8, 0.7, 0.7, 0.7, 1, 1, 1]
    const all = blendPartners(rgb, 3, 3, labels, inks, 0.5 / 255, true)
    expect(Array.from(all.subarray(12, 15))).toEqual([FOREIGN, FOREIGN, FOREIGN])
    const first = blendPartners(rgb, 3, 3, labels, inks, 0.5 / 255, false)
    expect(Array.from(first.subarray(12, 15))).toEqual([0, PURE, PURE])
  })

  it('asks whether every partner lies inside a fit', () => {
    const q = new Uint32Array([PURE, PURE, PURE, 4, 7, PURE, FOREIGN, FOREIGN, FOREIGN])
    expect(partnersInside(q, 0, () => false)).toBe(true)
    expect(partnersInside(q, 1, (r) => r === 4 || r === 7)).toBe(true)
    expect(partnersInside(q, 1, (r) => r === 4)).toBe(false)
    expect(partnersInside(q, 2, () => true)).toBe(false)
  })
})
