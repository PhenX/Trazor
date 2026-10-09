import { oklabToRgb, rgbToOklab } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { bicLambda } from '../../src/fill/select'
import { labelImage } from '../../src/ink/mdl'
import {
  BLEND_INTERIOR_FRACTION,
  BLEND_TMIN,
  InkAxes,
  NOISE_SIGMAS,
  SAME_INK_DE00,
  SOFT_NOISE_SIGMAS,
  SOFT_SAME_INK_DE00,
  blendPairs,
  de00,
  dist3F32,
  escapeNeedsInterior,
  isSoftIntake,
  nearestInk,
  oklabToRgbF32,
  paletteEvidence,
  rgbToOklabF32,
  sameInkAsAccepted,
  splitAlphaInks,
} from '../../src/ink/palette'
import type { Palette } from '../../src/ink/palette'
import { mixLinear } from './palette-helpers'

const RED = [0.9, 0.1, 0.1]
const BLUE = [0.1, 0.2, 0.9]
const GREEN = [0.1, 0.8, 0.2]

const lab = (c: readonly number[]): [number, number, number] => rgbToOklab(c[0], c[1], c[2])
const axesOf = (...inks: (readonly number[])[]): InkAxes => InkAxes.of(inks.flatMap((c) => lab(c)))
const pairsOf = (c: readonly number[], axes: InkAxes, tol: number) => {
  const [l, a, b] = lab(c)
  return blendPairs(l, a, b, axes, tol, BLEND_TMIN)
}
const rgb8 = (r: number, g: number, b: number): [number, number, number] => [
  r / 255,
  g / 255,
  b / 255,
]

/** A palette of the given encoded sRGB inks, opaque, equal weights. */
function paletteOf(inks: (readonly number[])[]): Palette {
  return {
    count: inks.length,
    inkLab: Float64Array.from(inks.flatMap((c) => lab(c))),
    inkRgb: Float64Array.from(inks.flat()),
    weight: new Float64Array(inks.length).fill(1 / inks.length),
    alpha: new Float64Array(inks.length).fill(1),
  }
}

describe('de00', () => {
  it('matches skimage on sRGB pairs', () => {
    expect(de00(...rgb8(0, 0, 0), ...rgb8(2, 2, 2))).toBeCloseTo(0.31, 1)
    expect(de00(...rgb8(0, 0, 0), ...rgb8(7, 7, 7))).toBeCloseTo(1.11, 1)
    expect(Math.abs(de00(...rgb8(7, 96, 84), ...rgb8(15, 103, 91)) - 2.35)).toBeLessThan(0.08)
    expect(Math.abs(de00(...rgb8(128, 128, 128), ...rgb8(136, 136, 136)) - 2.95)).toBeLessThan(0.08)
    expect(de00(...rgb8(50, 100, 150), ...rgb8(50, 100, 150))).toBe(0)
    const cases: [number[], number[], number][] = [
      [[1, 0, 0], [0, 0, 1], 52.8814],
      [[0, 0, 0], [1, 1, 1], 100],
      [[0.2, 0.4, 0.6], [0.6, 0.4, 0.2], 40.1182],
      [[1, 1, 0], [0, 1, 1], 41.9714],
      [[0.9, 0.1, 0.5], [0.85, 0.15, 0.5], 2.3185],
    ]
    for (const [a, b, want] of cases)
      expect(Math.abs(de00(a[0], a[1], a[2], b[0], b[1], b[2]) - want)).toBeLessThan(0.02)
  })
})

describe('rgbToOklabF32', () => {
  it('matches Ottosson’s reference values in single precision', () => {
    const refs: [number[], number[]][] = [
      [
        [1, 0, 0],
        [0.627955, 0.224863, 0.125846],
      ],
      [
        [0, 1, 0],
        [0.86644, -0.233888, 0.179498],
      ],
      [
        [0, 0, 1],
        [0.452014, -0.032457, -0.311528],
      ],
      [
        [1, 1, 1],
        [1, 0, 0],
      ],
    ]
    for (const [rgb, want] of refs) {
      const got = rgbToOklabF32(rgb[0], rgb[1], rgb[2])
      for (let k = 0; k < 3; k++) {
        expect(Math.abs(got[k] - want[k])).toBeLessThan(1e-3)
        expect(Math.fround(got[k])).toBe(got[k])
      }
    }
  })

  it('agrees with the double-precision conversion to single-precision rounding', () => {
    let worst = 0
    for (let r = 0; r <= 8; r++) {
      for (let g = 0; g <= 8; g++) {
        for (let b = 0; b <= 8; b++) {
          const f = rgbToOklabF32(r / 8, g / 8, b / 8)
          const d = rgbToOklab(r / 8, g / 8, b / 8)
          for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(f[k] - d[k]))
        }
      }
    }
    expect(worst).toBeLessThan(1e-6)
  })

  it('keeps a gray’s a and b as rounding noise, which can fall either side of zero', () => {
    // inkvec's own values for these levels: the sign of the noise decides a grid cell.
    const g4 = rgbToOklabF32(4 / 255, 4 / 255, 4 / 255)
    expect(g4[1]).toBe(-1.4901161193847656e-8)
    const g1 = rgbToOklabF32(1 / 255, 1 / 255, 1 / 255)
    expect(g1[1]).toBe(1.862645149230957e-9)
    expect(g1[2]).toBe(3.725290298461914e-9)
  })
})

describe('blendPairs', () => {
  it('finds a linear-light mixture as a blend of its two inks', () => {
    const axes = axesOf(RED, GREEN, BLUE)
    const pairs = pairsOf(mixLinear(RED, BLUE, 0.3), axes, 0.05)
    const lin = pairs.filter((p) => p.linear)
    expect(lin).toHaveLength(1)
    expect([lin[0].i, lin[0].j]).toEqual([0, 2])
    expect(lin[0].off).toBeLessThan(2e-3)
    // Every reported pair is within tolerance, and none involves green.
    for (const p of pairs) {
      expect(p.off).toBeLessThanOrEqual(0.05)
      expect(p.i !== 1 && p.j !== 1).toBe(true)
    }
  })

  it('finds an sRGB mixture in the sRGB space only', () => {
    const mid = [0, 1, 2].map((k) => 0.5 * (RED[k] + BLUE[k]))
    const pairs = pairsOf(mid, axesOf(RED, BLUE), 0.01)
    const srgb = pairs.find((p) => !p.linear)
    expect(srgb).toBeDefined()
    expect(srgb!.off).toBeLessThan(2e-3)
    expect(pairs.every((p) => !p.linear)).toBe(true)
  })

  it('rejects non-mixtures, chord ends, a single ink and coincident inks', () => {
    const axes = axesOf(RED, BLUE)
    expect(pairsOf(GREEN, axes, 0.05)).toHaveLength(0)
    const along = (t: number) => [0, 1, 2].map((k) => RED[k] + (BLUE[k] - RED[k]) * t)
    expect(pairsOf(along(0.01), axes, 0.05)).toHaveLength(0)
    expect(pairsOf(along(0.99), axes, 0.05)).toHaveLength(0)
    expect(pairsOf(along(0.1), axes, 0.05).length).toBeGreaterThan(0)
    expect(pairsOf(RED, axesOf(RED), 0.05)).toHaveLength(0)
    const g = [0.5, 0.5, 0.5]
    const g2 = [0.50001, 0.50001, 0.50001]
    expect(pairsOf(mixLinear(g, g2, 0.5), axesOf(g, g2), 0.05)).toHaveLength(0)
  })

  it('reads the interior window as four percent', () => {
    expect(BLEND_TMIN).toBe(0.04)
  })
})

describe('the perceptual floor and the escape rule', () => {
  it('folds a candidate within the floor of its OKLab-nearest ink', () => {
    const inks = [...lab([0, 0, 0]), ...lab([1, 1, 1])]
    const near = lab(rgb8(7, 7, 7))
    expect(sameInkAsAccepted(near[0], near[1], near[2], inks, 2, SAME_INK_DE00)).toBe(true)
    expect(sameInkAsAccepted(near[0], near[1], near[2], inks, 2, 1.0)).toBe(false)
    const far = lab(rgb8(20, 20, 20))
    expect(sameInkAsAccepted(far[0], far[1], far[2], inks, 2, SAME_INK_DE00)).toBe(false)
    expect(sameInkAsAccepted(far[0], far[1], far[2], inks, 0, SAME_INK_DE00)).toBe(false)
  })

  it('rejects a thin escaped non-blend and nothing else', () => {
    expect(escapeNeedsInterior(true, false, BLEND_INTERIOR_FRACTION - 1e-3)).toBe(true)
    expect(escapeNeedsInterior(true, false, BLEND_INTERIOR_FRACTION)).toBe(false)
    expect(escapeNeedsInterior(false, false, 0)).toBe(false)
    expect(escapeNeedsInterior(true, true, 0)).toBe(false)
  })
})

describe('intake switches', () => {
  it('opens the soft settings on a wide edge, a lossy container or ringing', () => {
    expect(isSoftIntake(1.0, 0, false, 128, 128)).toBe(false)
    expect(isSoftIntake(1.8, 0, false, 128, 128)).toBe(true)
    expect(isSoftIntake(1.0, 0, true, 128, 128)).toBe(true)
    expect(isSoftIntake(1.0, 0.1, false, 128, 128)).toBe(false)
    expect(isSoftIntake(1.0, 0.13, false, 128, 128)).toBe(true)
    expect(isSoftIntake(1.0, 0.06, false, 256, 300)).toBe(true)
    expect(isSoftIntake(1.0, 0.06, false, 255, 300)).toBe(false)
  })

  it('prices an ink with the BIC lambda and switches the guard and the floor together', () => {
    expect(bicLambda(128 * 128)).toBeCloseTo(0.5 * Math.log(16384), 12)
    expect(bicLambda(1)).toBe(0.5 * Math.log(2))
    expect(paletteEvidence(0.002, 100, false)).toEqual({
      sigmaNoise: 0.002,
      lambda: bicLambda(100),
      noiseSigmas: NOISE_SIGMAS,
      sameInkDe00: SAME_INK_DE00,
    })
    const soft = paletteEvidence(0.002, 100, true)
    expect([soft.noiseSigmas, soft.sameInkDe00]).toEqual([SOFT_NOISE_SIGMAS, SOFT_SAME_INK_DE00])
  })
})

describe('nearestInk and labelImage', () => {
  it('assign the OKLab-nearest entry, ties to the lower index', () => {
    const pal = paletteOf([RED, GREEN, BLUE])
    const c = lab([0.15, 0.25, 0.85])
    const [i, d] = nearestInk(pal, c[0], c[1], c[2])
    expect(i).toBe(2)
    expect(
      Math.abs(d - Math.hypot(c[0] - pal.inkLab[6], c[1] - pal.inkLab[7], c[2] - pal.inkLab[8])),
    ).toBeLessThan(1e-7)
    const rgb = Float32Array.from([...RED, ...BLUE, ...GREEN, 0.8, 0.2, 0.2])
    expect([...labelImage(rgb, pal)]).toEqual([0, 2, 1, 0])
    // Two equal entries: the first wins.
    expect(nearestInk(paletteOf([RED, RED]), ...lab(RED))[0]).toBe(0)
    expect(nearestInk(paletteOf([]), 0.5, 0, 0)).toEqual([0, Infinity])
  })

  it('measures distances in single precision', () => {
    expect(dist3F32(0, 0, 0, 0.3, 0.4, 0)).toBe(Math.fround(0.5))
    const d = dist3F32(0.1, 0.2, 0.3, 0.4, 0.5, 0.6)
    expect(Math.fround(d)).toBe(d)
  })
})

describe('splitAlphaInks', () => {
  const white = [1, 1, 1]

  it('gives a panel drawn at a quarter opacity its own entry', () => {
    const pal = paletteOf([white])
    const alpha = Float32Array.from({ length: 100 }, (_, p) => (p < 60 ? 1 : 0.25))
    const labels = new Int32Array(100)
    expect(splitAlphaInks(labels, pal, alpha)).toBe(1)
    expect(pal.count).toBe(2)
    expect([...pal.alpha]).toEqual([1, 0.25])
    expect([...pal.inkRgb.subarray(3, 6)]).toEqual(white)
    expect([...pal.inkLab.subarray(3, 6)]).toEqual([...pal.inkLab.subarray(0, 3)])
    expect(pal.weight[1]).toBe(0)
    expect(labels.subarray(0, 60).every((l) => l === 0)).toBe(true)
    expect(labels.subarray(60).every((l) => l === 1)).toBe(true)
  })

  it('counts the clear pixels as a level, and one level just sets the opacity', () => {
    const pal = paletteOf([white])
    const alpha = Float32Array.from({ length: 64 }, (_, p) => (p % 2 === 0 ? 0.01 : 0.5))
    const labels = new Int32Array(64)
    expect(splitAlphaInks(labels, pal, alpha)).toBe(1)
    expect([...pal.alpha]).toEqual([0.5, 0])
    for (let p = 0; p < 64; p++) expect(labels[p]).toBe(p % 2 === 0 ? 1 : 0)
    const one = paletteOf([[0.2, 0.3, 0.4]])
    expect(splitAlphaInks(new Int32Array(32), one, new Float32Array(32).fill(0.7))).toBe(0)
    expect(one.alpha[0]).toBeCloseTo(0.7, 6)
  })

  it('leaves glows, rare levels, loose groups, small inks and mismatched lengths alone', () => {
    const pal = paletteOf([[1, 0.8, 0.2]])
    const ramp = Float32Array.from({ length: 100 }, (_, p) => p / 99)
    expect(splitAlphaInks(new Int32Array(100), pal, ramp)).toBe(0)
    expect([...pal.alpha]).toEqual([1])
    // One pixel in a hundred at another level is under 2 %; two are not.
    const alpha = new Float32Array(100).fill(1)
    alpha[5] = 0.3
    expect(splitAlphaInks(new Int32Array(100), pal, alpha)).toBe(0)
    alpha[6] = 0.3
    expect(splitAlphaInks(new Int32Array(100), pal, alpha)).toBe(1)
    // Two levels closer than the gap are one group, too spread to be a level.
    const loose = Float32Array.from({ length: 40 }, (_, p) => (p < 20 ? 0.5 : 0.625))
    expect(splitAlphaInks(new Int32Array(40), paletteOf([white]), loose)).toBe(0)
    // Under sixteen pixels, and a length mismatch.
    const few = Float32Array.from({ length: 10 }, (_, p) => (p < 5 ? 1 : 0.2))
    expect(splitAlphaInks(new Int32Array(10), paletteOf([white]), few)).toBe(0)
    expect(splitAlphaInks(new Int32Array(10), paletteOf([white]), few.subarray(0, 9))).toBe(0)
    expect(splitAlphaInks(new Int32Array(0), paletteOf([]), new Float32Array(0))).toBe(0)
  })
})

describe('oklabToRgbF32', () => {
  it('inverts rgbToOklabF32 across the sRGB cube and returns single-precision values', () => {
    let worst = 0
    for (let r = 0; r <= 8; r++) {
      for (let g = 0; g <= 8; g++) {
        for (let b = 0; b <= 8; b++) {
          const back = oklabToRgbF32(...rgbToOklabF32(r / 8, g / 8, b / 8))
          worst = Math.max(
            worst,
            Math.abs(back[0] - r / 8),
            Math.abs(back[1] - g / 8),
            Math.abs(back[2] - b / 8),
          )
          expect(back.every((v) => Math.fround(v) === v)).toBe(true)
        }
      }
    }
    expect(worst).toBeLessThan(1e-4)
  })

  it('agrees with the double-precision conversion, and clamps out-of-gamut colors', () => {
    for (const c of [
      [0.627955, 0.224863, 0.125846],
      [0.5, -0.05, 0.08],
      [0.2, 0.01, -0.03],
    ]) {
      const f = oklabToRgbF32(c[0], c[1], c[2])
      const d = oklabToRgb(c[0], c[1], c[2])
      for (let k = 0; k < 3; k++) expect(Math.abs(f[k] - d[k])).toBeLessThan(2e-6)
    }
    expect(oklabToRgbF32(0.9, 0.4, 0.4).every((v) => v >= 0 && v <= 1)).toBe(true)
  })
})
