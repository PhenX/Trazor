import { estimateNoise } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import {
  compositeOverWhite,
  downsampleTo,
  intakeScale,
  lumaF32,
  oversampleFactor,
  rasterToRgba,
  ringingScore,
} from '../../src/intake/coverage'
import { reduceRaster, softVerdict } from '../../src/intake/soft'
import { gridContrast, rampEvidence, shadingShare } from '../../src/intake/softness'
import { INKVEC_READINGS } from './intake-parity'
import { bitsOf, fnv, PARITY_SCENES } from './scenes'

/** inkvec's prose reasons, by the identifiers this port reports. */
const REASONS: Record<string, string | null> = {
  '': null,
  'too few strong edges': 'too-few-edges',
  'native edges': 'native-edges',
  'sharp edges beside the soft ones (a glow or a shadow)': 'sharp-edges',
  'edges barely soft': 'barely-soft',
  'about a 2x upscale': 'about-2x',
  'thin features': 'thin-features',
  'shaded artwork': 'shaded-artwork',
}

const finite = (v: number): number | null => (Number.isFinite(v) ? v : null)

describe('parity with inkvec 0.2.7', () => {
  for (const [name, make] of Object.entries(PARITY_SCENES)) {
    it(`reads ${name} bit for bit`, () => {
      const want = INKVEC_READINGS[name]
      const raster = make()
      const img = rasterToRgba(raster)
      const { width: w, height: h } = img
      const rgb = compositeOverWhite(img)
      expect(fnv(bitsOf(rgb))).toBe(want.rgbHash)
      expect(estimateNoise(lumaF32(rgb), w, h)).toBe(want.noise)
      expect(intakeScale(rgb, w, h)).toBe(want.edge)
      expect(ringingScore(rgb, w, h)).toBe(want.ringing)
      expect(oversampleFactor(rgb, w, h)).toBe(want.oversample)
      const e = rampEvidence(rgb, w, h)
      expect({ ...e, featureP10: finite(e.featureP10) }).toEqual(want.ramp)
      expect([2, 3, 4, 5, 6, 7, 8].map((k) => gridContrast(rgb, w, h, k))).toEqual(want.grid)
      expect([3, 6, 9, 12].map((r) => shadingShare(rgb, w, h, r))).toEqual(want.shading)
      const v = softVerdict(rgb, w, h)
      expect([v.factor, v.reason]).toEqual([want.factor, REASONS[want.reason]])
      const reduced = (): [number, number, string] => {
        const out = reduceRaster(raster, v.factor)
        const f = Float32Array.from(out.data, (b) => b / 255)
        return [out.width, out.height, fnv(bitsOf(f))]
      }
      expect(want.reduced ? reduced() : null).toEqual(
        want.reduced ? [want.rw, want.rh, want.reducedHash] : null,
      )
      for (const d of want.ds) {
        const out = downsampleTo(img, d.nw, d.nh)
        expect([out.width, out.height, fnv(bitsOf(out.data))]).toEqual([d.w, d.h, d.hash])
      }
    })
  }
})
