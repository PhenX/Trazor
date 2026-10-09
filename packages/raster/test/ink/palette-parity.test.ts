import { inflateSync } from 'node:zlib'
import { estimateNoise } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { bicLambda } from '../../src/fill/select'
import { extractPaletteMdl, labelImage } from '../../src/ink/mdl'
import { DEFAULT_MERGE_DISTANCE, paletteEvidence, splitAlphaInks } from '../../src/ink/palette'
import type { PaletteEvidence } from '../../src/ink/palette'
import { ART_REFS, CORPUS_REFS, DEGENERATE_REFS, SCENE_REFS } from './palette-fixtures'
import type { PaletteRef } from './palette-fixtures'
import {
  Lcg,
  artCases,
  compositeOverWhite,
  concentricRings,
  labelHash,
  paint,
  randomArt,
} from './palette-helpers'
import type { TestImage } from './palette-helpers'

/**
 * Run the palette, the labeling and (when the reference did) the alpha split, and list how
 * they differ from inkvec's: the ink count, the entries in OKLab, the weights and opacities
 * (within 1e-6), the labels (exactly). Empty when they agree.
 */
function inkvecMismatch(img: TestImage, ref: PaletteRef, ev: PaletteEvidence): string[] {
  const pal = extractPaletteMdl(img.rgb, img.w, img.h, DEFAULT_MERGE_DISTANCE, ref.maxColors, ev)
  const labels = labelImage(img.rgb, pal)
  const minted = ref.split ? splitAlphaInks(labels, pal, img.alpha!) : 0
  const out: string[] = []
  const off = (what: string, got: ArrayLike<number>, want: number[]): void => {
    for (let i = 0; i < want.length; i++) {
      if (!(Math.abs(got[i] - Math.fround(want[i])) < 1e-6))
        out.push(`${what}[${i}] ${got[i]}, want ${want[i]}`)
    }
  }
  if (minted !== ref.minted) out.push(`${ref.name}: minted ${minted}, want ${ref.minted}`)
  if (pal.count !== ref.count) return [...out, `${ref.name}: ${pal.count} inks, want ${ref.count}`]
  off('inkLab', pal.inkLab, ref.inkLab)
  off('weight', pal.weight, ref.weight)
  off('alpha', pal.alpha, ref.alpha)
  if (labelHash(labels) !== ref.labelHash) out.push(`${ref.name}: labels differ`)
  return out
}

function evidenceOf(ref: PaletteRef, pixels: number): PaletteEvidence {
  return paletteEvidence(ref.sigmaNoise, pixels, ref.soft)
}

describe('palette parity with inkvec', () => {
  it('matches on random flat art of every shape, noise level, intake and cap', () => {
    const cases = artCases(ART_REFS.length)
    for (let c = 0; c < cases.length; c++) {
      const { img } = cases[c]
      const ref = ART_REFS[c]
      expect(ref.name).toBe(cases[c].name)
      expect(inkvecMismatch(img, ref, evidenceOf(ref, img.w * img.h))).toEqual([])
    }
  })

  it('matches on the painted scenes', () => {
    const RED = [0.9, 0.1, 0.1]
    const BLUE = [0.1, 0.2, 0.9]
    const GREEN = [0.1, 0.8, 0.2]
    const MID = [0.5, 0.15, 0.5]
    const scenes: Record<string, TestImage> = {
      rings: concentricRings(),
      'rings-soft': concentricRings(),
      pupil: paint(64, 64, (x, y) => (x >= 30 && x < 33 && y >= 30 && y < 33 ? GREEN : RED)),
      seam: paint(64, 64, (x, y) => (x === 32 && y < 16 ? MID : x < 32 ? RED : BLUE)),
    }
    for (const ref of SCENE_REFS) {
      const img = scenes[ref.name]
      expect(inkvecMismatch(img, ref, evidenceOf(ref, img.w * img.h))).toEqual([])
    }
  })

  it('matches on degenerate shapes: no pixels, a buffer shorter or longer than the grid, no grid', () => {
    const art = randomArt(new Lcg(99), 9, 7)
    const shapes: Record<string, [number, number, number]> = {
      empty: [0, 0, 0],
      short: [40, 9, 7],
      long: [63, 5, 7],
      'zero-width': [63, 0, 7],
      'zero-height': [63, 63, 0],
    }
    for (const ref of DEGENERATE_REFS) {
      const [n, w, h] = shapes[ref.name]
      const img: TestImage = { w, h, rgb: art.rgb.slice(0, n * 3), alpha: null }
      expect(
        inkvecMismatch(img, ref, {
          sigmaNoise: 0.002,
          lambda: 3,
          noiseSigmas: 3,
          sameInkDe00: 1.5,
        }),
      ).toEqual([])
    }
  })

  for (const corpus of CORPUS_REFS) {
    it(`matches on ${corpus.name} (${corpus.license})`, () => {
      const rgba = new Uint8Array(inflateSync(Buffer.from(corpus.rgba, 'base64')))
      const img = compositeOverWhite(rgba, corpus.w, corpus.h)
      const n = corpus.w * corpus.h
      // The intake measurements inkvec hands the palette: its noise estimate and BIC lambda.
      const lum = new Float32Array(n)
      const fr = Math.fround
      for (let p = 0; p < n; p++) {
        const [r, g, b] = [img.rgb[p * 3], img.rgb[p * 3 + 1], img.rgb[p * 3 + 2]]
        lum[p] = fr(fr(fr(fr(0.2126) * r) + fr(fr(0.7152) * g)) + fr(fr(0.0722) * b))
      }
      for (const ref of corpus.refs) {
        expect(estimateNoise(lum, corpus.w, corpus.h)).toBe(ref.sigmaNoise)
        expect(bicLambda(n)).toBeCloseTo(ref.lambda, 12)
        expect(inkvecMismatch(img, ref, evidenceOf(ref, n))).toEqual([])
      }
    })
  }
})
