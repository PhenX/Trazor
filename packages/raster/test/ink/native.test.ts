import { inflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { mergeGradientBands } from '../../src/fill/bands'
import { carveResidualFeatures } from '../../src/fill/carve'
import { FillEval, isGradient, representative } from '../../src/fill/model'
import type { FillFit, FillModel, Rgb } from '../../src/fill/model'
import { bicLambda, fitPixels } from '../../src/fill/select'
import {
  alphaParams,
  fadeChi2,
  fadeOverWhite,
  faceOpacity,
  fitColorStops,
  fitOpacity,
  mergeFades,
  modelStops,
  rimAlpha,
  solveStops,
} from '../../src/ink/fade'
import type { Fade } from '../../src/ink/fade'
import {
  CLEAR_INK_ALPHA,
  INK2,
  bin,
  colorIdsOfRgba,
  fromSix,
  ink2Alpha,
  ink2De00,
  ink2Dist,
  inkPoints,
  nameCarvedPaint,
  needsNativeAlpha,
  overSecondGround,
  pointOf,
  sameOpacity,
  six,
  snapAlpha,
} from '../../src/ink/native'
import {
  InkSix,
  blendPairsCached,
  extractPaletteNative,
  labelImageNative,
  nativeFrontEnd,
} from '../../src/ink/native-palette'
import {
  DEFAULT_MERGE_DISTANCE,
  SAME_INK_DE00,
  de00,
  oklabToRgbF32,
  paletteEvidence,
  rgbToOklabF32,
} from '../../src/ink/palette'
import type { Palette, PaletteEvidence } from '../../src/ink/palette'
import { CORPUS_REFS, FADE_REFS, RANDOM_REFS } from './native-fixtures'
import type { NativePaletteRef } from './native-fixtures'
import {
  draw,
  fadeScenes,
  flatWash,
  fromDeflated,
  glow,
  modelDiff,
  modelTokens,
  onWhite,
  randomCases,
  straight,
  twoGlows,
  washPalette,
} from './native-scenes'
import type { StraightImage } from './native-scenes'
import { labelHash } from './palette-helpers'

const fr = Math.fround
const RED = [0.9, 0.1, 0.1]
const BLUE = [0.1, 0.2, 0.9]
const GREEN = [0.1, 0.9, 0.1]
const CLEAR: readonly [readonly number[], number] = [[0, 0, 0], 0]

/** The two-ground point of a straight color `s` at opacity `a`. */
function ink(s: readonly number[], a: number): Float64Array {
  const w = onWhite(s, a)
  const out = new Float64Array(INK2)
  pointOf(w[0], w[1], w[2], a, out, 0)
  return out
}

/** Several points packed six per point. */
function pack(...pts: Float64Array[]): Float64Array {
  const out = new Float64Array(pts.length * INK2)
  pts.forEach((p, i) => out.set(p, i * INK2))
  return out
}

/** The color a fraction `t` of the way from `a` to `b`, channel by channel. */
function mix(a: readonly number[], b: readonly number[], t: number): number[] {
  return a.map((v, k) => fr(fr(v * fr(1 - t)) + fr(b[k] * t)))
}

function close(got: ArrayLike<number>, want: ArrayLike<number>, tol: number): boolean {
  for (let k = 0; k < want.length; k++) if (!(Math.abs(got[k] - want[k]) <= tol)) return false
  return true
}

function evidence(sigmaNoise: number, lambda: number, sameInkDe00: number): PaletteEvidence {
  return { sigmaNoise, lambda, noiseSigmas: 0, sameInkDe00 }
}

function palette(
  img: StraightImage,
  maxColors = 64,
  ev = evidence(0, 1, 1.5),
  merge = 0.035,
): Palette {
  return extractPaletteNative(img.rgb, img.alpha, img.w, img.h, merge, maxColors, ev)
}

/** The index of the ink drawn at opacity `alpha` (to 0.01). */
function find(pal: Palette, alpha: number): number {
  const i = Array.from(pal.alpha).findIndex((a) => Math.abs(a - alpha) < 0.01)
  if (i < 0) throw new Error(`no ink at ${alpha}: ${Array.from(pal.alpha)}`)
  return i
}

function rgbOf(pal: Palette, i: number): number[] {
  return Array.from(pal.inkRgb.subarray(i * 3, i * 3 + 3))
}

/** A red square on the clear ground with a one-pixel anti-aliased rim at half coverage. */
function redSquare(x: number, y: number): readonly [readonly number[], number] {
  const ring = (lo: number, hi: number): boolean => x >= lo && x < hi && y >= lo && y < hi
  if (ring(3, 9)) return [RED, 1]
  if (ring(2, 10)) return [RED, 0.5]
  return CLEAR
}

describe('the two-ground point', () => {
  it('takes the uncovered share of the gray ground off the color over white', () => {
    const w = [0.8, 0.5, 0.1]
    const out = [0, 0, 0]
    overSecondGround(w[0], w[1], w[2], 0.6, out, 0)
    expect(close(out, [0.6, 0.3, 0], 1e-6)).toBe(true)
    overSecondGround(w[0], w[1], w[2], 1, out, 0)
    expect(out).toEqual(w.map(fr))
    overSecondGround(w[0], w[1], w[2], 1.7, out, 0)
    expect(out).toEqual(w.map(fr))
    // Alpha clamps to 0.
    overSecondGround(w[0], w[1], w[2], -3, out, 0)
    expect(close(out, [0.3, 0, 0], 1e-6)).toBe(true)
  })

  it('measures the worse ground, both as distance and as CIEDE2000', () => {
    const o = (wl: number, kl: number): Float64Array => Float64Array.of(wl, 0, 0, kl, 0, 0)
    expect(ink2Dist(o(0.5, 0.2), 0, o(0.6, 0.5), 0)).toBeCloseTo(0.3, 6)
    expect(ink2Dist(o(0.2, 0.5), 0, o(0.5, 0.6), 0)).toBeCloseTo(0.3, 6)
    // White paint and the clear ground agree over white; over the gray ground they are white
    // against gray, and that is the whole perceptual difference.
    const paint = ink([1, 1, 1], 1)
    const ground = ink([1, 1, 1], 0)
    const want = de00(1, 1, 1, 0.5, 0.5, 0.5)
    expect(Math.abs(ink2De00(paint, 0, ground, 0) - want)).toBeLessThan(0.05)
    expect(want).toBeGreaterThan(10)
    // Opaque: plain CIEDE2000.
    const r = ink(RED, 1)
    const b = ink(BLUE, 1)
    expect(
      Math.abs(ink2De00(r, 0, b, 0) - de00(RED[0], RED[1], RED[2], BLUE[0], BLUE[1], BLUE[2])),
    ).toBeLessThan(0.05)
  })

  it('reads the opacity back from the two grounds and pins it at the ends', () => {
    for (const a of [0, 0.2, 0.4, 0.75, 1]) {
      expect(Math.abs(ink2Alpha(ink(BLUE, a), 0) - a)).toBeLessThan(0.01)
    }
    expect(snapAlpha(0.9951)).toBe(1)
    expect(snapAlpha(0.0049)).toBe(0)
    expect(snapAlpha(1.3)).toBe(1)
    expect(snapAlpha(-0.2)).toBe(0)
    expect(snapAlpha(0.5)).toBe(0.5)
  })

  it('carries the opacity of each palette entry into its point; an entry without one is opaque', () => {
    const wash = onWhite(BLUE, 0.4)
    const lab = [RED, wash, GREEN].flatMap((c) => rgbToOklabF32(c[0], c[1], c[2]))
    const pal: Palette = {
      count: 3,
      inkLab: Float64Array.from(lab),
      inkRgb: Float64Array.from([...RED, ...wash, ...GREEN], fr),
      weight: new Float64Array(3).fill(0.3),
      alpha: Float64Array.of(1, fr(0.4)),
    }
    const pts = inkPoints(pal)
    const opaque = (c: readonly number[]): number[] => {
      const out = [0, 0, 0, 0, 0, 0]
      pointOf(fr(c[0]), fr(c[1]), fr(c[2]), 1, out, 0)
      return out
    }
    expect(Array.from(pts.subarray(0, 6))).toEqual(opaque(RED))
    expect(Array.from(pts.subarray(12, 18))).toEqual(opaque(GREEN))
    expect(Array.from(pts.subarray(6, 9))).toEqual(rgbToOklabF32(wash[0], wash[1], wash[2]))
    const k = [0, 0, 0]
    overSecondGround(fr(wash[0]), fr(wash[1]), fr(wash[2]), fr(0.4), k, 0)
    expect(Array.from(pts.subarray(9, 12))).toEqual(rgbToOklabF32(k[0], k[1], k[2]))
    expect(Math.abs(ink2Alpha(pts, 6) - 0.4)).toBeLessThan(0.01)
  })

  it('lets two entries share a fill only within five hundredths of opacity', () => {
    const pal: Palette = {
      count: 4,
      inkLab: new Float64Array(12),
      inkRgb: new Float64Array(12),
      weight: new Float64Array(4),
      alpha: Float64Array.of(1, fr(0.97), 0.5),
    }
    const same = sameOpacity(pal)
    expect(same(0, 1)).toBe(true)
    expect(same(0, 3)).toBe(true)
    expect(same(0, 2)).toBe(false)
    expect(same(2, 3)).toBe(false)
  })

  it('bins lightness, then a, then b, in base 24', () => {
    const idx = (l: number, a: number, b: number): number => l * 576 + a * 24 + b
    expect(bin(0, fr(-0.4), fr(-0.4))).toBe(0)
    expect(bin(1, fr(0.4), fr(0.4))).toBe(24 ** 3 - 1)
    expect(bin(0.5, fr(0.2), fr(-0.2))).toBe(idx(12, 17, 6))
    expect(bin(0.25, fr(-0.3), fr(0.1))).toBe(idx(6, 3, 14))
    expect(bin(1.5, fr(0.9), fr(-0.9))).toBe(idx(23, 23, 0))
  })

  it('gives the six blend coordinates over both grounds, and inverts them', () => {
    const c = ink(BLUE, 0.4)
    const want = [0.64, 0.68, 0.96, 0.34, 0.38, 0.66]
    const got = new Float64Array(6)
    six(c, 0, false, got, 0)
    expect(close(got, want, 1e-4)).toBe(true)
    const lin = (v: number): number => ((v + 0.055) / 1.055) ** 2.4
    six(c, 0, true, got, 0)
    expect(close(got, want.map(lin), 1e-4)).toBe(true)
    const back = new Float64Array(6)
    for (const linear of [false, true]) {
      six(c, 0, linear, got, 0)
      fromSix(got, 0, linear, back, 0)
      expect(ink2Dist(back, 0, c, 0)).toBeLessThan(1e-4)
    }
  })

  it('numbers (color, alpha) points by first occurrence', () => {
    const rgb = Float32Array.of(1, 1, 1, 1, 1, 1, 1, 1, 1, 0.5, 0.5, 0.5, 1, 1, 1)
    const alpha = Float32Array.of(0, 1, 0, 1, 1)
    const ids = colorIdsOfRgba(rgb, alpha)
    expect(Array.from(ids.cid)).toEqual([0, 1, 0, 2, 1])
    expect(Array.from(ids.reps)).toEqual([0, 1, 3])
    expect(ids.count).toBe(3)
    // Only as many pixels as both arrays cover.
    expect(colorIdsOfRgba(rgb, alpha.subarray(0, 2)).cid.length).toBe(2)
  })

  it('takes the native path only when some pixel is translucent', () => {
    expect(needsNativeAlpha(null, 4)).toBe(false)
    expect(needsNativeAlpha(Float32Array.of(1, 1, 0.9991), 3)).toBe(false)
    expect(needsNativeAlpha(Float32Array.of(1, 0.5, 1), 3)).toBe(true)
    expect(needsNativeAlpha(Float32Array.of(1, 0.5), 3)).toBe(false)
  })
})

describe('blend tests over two grounds', () => {
  const r = ink(RED, 1)
  const b = ink(BLUE, 1)
  const g = ink(GREEN, 1)

  it('finds a mix of two inks, and only that pair', () => {
    const acc = InkSix.of(pack(r, b, g))
    // 30/70 in sRGB: on the red-blue chord in sRGB, nowhere else.
    const c = ink(mix(RED, BLUE, 0.7), 1)
    const pairs = blendPairsCached(c, 0, acc, 0.01, 0.04)
    expect(pairs.every((p) => p.i === 0 && p.j === 1)).toBe(true)
    const srgb = pairs.find((p) => !p.linear)
    expect(srgb?.off).toBeLessThan(1e-3)
    // The same mix in linear light is found in linear light.
    const lin = (v: number): number => fr(((v + 0.055) / 1.055) ** 2.4)
    const unlin = (v: number): number => fr(1.055 * v ** (1 / 2.4) - 0.055)
    const cLin = ink(mix(RED.map(lin), BLUE.map(lin), 0.7).map(unlin), 1)
    const l = blendPairsCached(cLin, 0, acc, 0.01, 0.04).find((p) => p.linear)
    expect(l?.i).toBe(0)
    expect(l?.j).toBe(1)
    expect(l?.off).toBeLessThan(1e-3)
    // An accepted ink is no blend of the others, and one ink alone has no pairs.
    expect(blendPairsCached(g, 0, acc, 0.01, 0.04)).toEqual([])
    expect(blendPairsCached(c, 0, InkSix.of(r), 1, 0.04)).toEqual([])
    // Too near an end of the chord to be a blend.
    const nearEnd = ink(mix(RED, BLUE, 0.01), 1)
    expect(blendPairsCached(nearEnd, 0, InkSix.of(pack(r, b)), 0.01, 0.04)).toEqual([])
    // A repeated ink has no chord with itself.
    const rep = blendPairsCached(c, 0, InkSix.of(pack(r, r, b)), 0.01, 0.04)
    expect(rep.length).toBeGreaterThan(0)
    expect(rep.every((p) => p.j === 2)).toBe(true)
  })

  it('reads an anti-aliased rim as a blend of the paint and the clear ground', () => {
    const paint = ink([1, 1, 1], 1)
    const ground = ink([1, 1, 1], 0)
    const rim = ink([1, 1, 1], 0.3)
    const p = blendPairsCached(rim, 0, InkSix.of(pack(paint, ground)), 0.01, 0.04).find(
      (q) => !q.linear,
    )
    expect(p?.i).toBe(0)
    expect(p?.j).toBe(1)
    expect(p?.off).toBeLessThan(1e-3)
  })
})

describe('the two-ground palette', () => {
  it('makes a painted square two inks, and its rim neither', () => {
    const img = draw(12, 12, redSquare)
    const pal = palette(img)
    expect(pal.count).toBe(2)
    const paint = find(pal, 1)
    const ground = find(pal, 0)
    expect(pal.alpha[paint]).toBe(1)
    expect(pal.alpha[ground]).toBe(0)
    expect(close(rgbOf(pal, paint), RED, 0.005)).toBe(true)
    expect(close(rgbOf(pal, ground), [1, 1, 1], 0.005)).toBe(true)
    expect(pal.weight[paint]).toBeCloseTo(36 / 144, 6)
    expect(pal.weight[ground]).toBeCloseTo(80 / 144, 6)
  })

  it('never counts the clear ground against the color cap', () => {
    const img = draw(12, 12, redSquare)
    expect(Array.from(palette(img, 1).alpha)).toEqual([0, 1])
    // A full cap still lets the walk find the ground.
    const two = draw(12, 12, (_x, y) => (y < 4 ? [RED, 1] : y < 8 ? [BLUE, 1] : CLEAR))
    const capped = palette(two, 1)
    expect(capped.count).toBe(2)
    expect(Array.from(capped.alpha).toSorted()).toEqual([0, 1])
  })

  it('keeps a white mark on the clear ground apart from the ground, with its own opacity', () => {
    const img = draw(16, 16, (x, y) =>
      x >= 4 && x < 12 && y >= 4 && y < 12 ? [[1, 1, 1], 1] : CLEAR,
    )
    const pal = palette(img)
    expect(pal.count).toBe(2)
    const mark = find(pal, 1)
    const ground = find(pal, 0)
    expect(close(rgbOf(pal, mark), [1, 1, 1], 1e-6)).toBe(true)
    expect(close(rgbOf(pal, ground), [1, 1, 1], 1e-6)).toBe(true)
    const labels = labelImageNative(img.rgb, img.alpha, pal)
    expect(labels[8 * 16 + 8]).toBe(mark)
    expect(labels[0]).toBe(ground)
    const fe = nativeFrontEnd(img.rgb, img.alpha, 16, 16, { sigmaNoise: 0.5 / 255, soft: false })
    expect(fe.labels[8 * 16 + 8]).not.toBe(fe.labels[0])
    expect(fe.palette.alpha[fe.labels[8 * 16 + 8]]).toBe(1)
    expect(fe.palette.alpha[fe.labels[0]]).toBe(0)
  })

  it('makes a translucent wash one ink with its own opacity', () => {
    const img = draw(12, 12, (x, y) => (x >= 3 && x < 9 && y >= 3 && y < 9 ? [BLUE, 0.5] : CLEAR))
    const pal = palette(img)
    expect(pal.count).toBe(2)
    const wash = find(pal, 0.5)
    expect(pal.alpha[wash]).toBeCloseTo(0.5, 2)
    expect(close(rgbOf(pal, wash), onWhite(BLUE, 0.5), 0.005)).toBe(true)
    find(pal, 0)
  })

  it('needs a hairline to be opaque to be an ink, and always finds a clear gap', () => {
    const line = (a: number): StraightImage => draw(12, 12, (x) => (x === 5 ? [GREEN, a] : CLEAR))
    expect(Array.from(palette(line(1)).alpha)).toEqual([0, 1])
    expect(Array.from(palette(line(0.5)).alpha)).toEqual([0])
    const gap = draw(12, 12, (x) => (x === 5 ? CLEAR : [RED, 1]))
    expect(Array.from(palette(gap).alpha)).toEqual([1, 0])
  })

  it('splits close inks only when the noise says they are two', () => {
    const halves = (d: number): StraightImage => {
      // 0.58 is cell 13 of lightness, 0.60 and 0.61 cell 14: the halves are two modes.
      const base = oklabToRgbF32(0.58, 0.05, -0.05)
      const other = oklabToRgbF32(fr(0.58 + d), 0.05, -0.05)
      return draw(8, 8, (x) => [x < 4 ? base : other, 1])
    }
    let img = halves(0.03)
    const n = (ev: PaletteEvidence, merge: number): number => palette(img, 64, ev, merge).count
    // Inside the merge radius: 0.5·32·(0.03/σ)² nats against 2·3 for the extra ink.
    expect(n(evidence(0.002, 2, 0), 0.05)).toBe(2)
    expect(n(evidence(0.1, 2, 0), 0.05)).toBe(1)
    expect(n(evidence(0, 2, 0), 0.05)).toBe(1)
    // Outside the merge radius the perceptual floor decides.
    img = halves(0.02)
    const p = img.rgb
    const de = de00(p[0], p[1], p[2], p[21], p[22], p[23])
    expect(n(evidence(0, 2, de * 0.8), 0.005)).toBe(2)
    expect(n(evidence(0, 2, de * 1.2), 0.005)).toBe(1)
  })

  it('keeps the seed of an ink no pixel is close to, at no weight', () => {
    const p = [0.6, 0.4, 0.3]
    const q = [0.61, 0.4, 0.3]
    const ip = ink(p, 1)
    const iq = ink(q, 1)
    expect(bin(ip[0], ip[1], ip[2])).toBe(bin(iq[0], iq[1], iq[2]))
    const img = straight(2, 1, Float32Array.of(...p, 1, ...q, 1))
    const pal = palette(img, 64, evidence(0, 1, 1.5), 1e-4)
    expect(pal.count).toBe(1)
    expect(Array.from(pal.weight)).toEqual([0])
    const mean = [0, 1, 2].map((k) => (ip[k] + iq[k]) / 2)
    expect(close(pal.inkLab, mean, 1e-6)).toBe(true)
  })

  it('makes a lone small shape on the clear ground an ink, though it is rare', () => {
    const n = 128
    const r = Math.sqrt(50 / Math.PI)
    const img = draw(n, n, (x, y) => [
      [0, 0, 0],
      Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - 64, y - 64))),
    ])
    let covered = 0
    for (const a of img.alpha) covered += a
    expect(covered / (n * n)).toBeLessThan(0.004)
    const pal = palette(img)
    expect(pal.count).toBe(2)
    expect(close(rgbOf(pal, find(pal, 1)), [0, 0, 0], 0.01)).toBe(true)
    find(pal, 0)
    const fe = nativeFrontEnd(img.rgb, img.alpha, n, n, { sigmaNoise: 0.5 / 255, soft: false })
    expect(fe.palette.alpha[fe.labels[64 * n + 64]]).toBe(1)
  })

  it('rejects an overshoot rim inside the merge radius on a clear ground', () => {
    const n = 64
    const gold = [176 / 255, 138 / 255, 74 / 255]
    const rim = gold.map((v) => Math.min(1, v * 1.067))
    const img = draw(n, n, (x, y) => {
      const d = Math.hypot(x - 31.5, y - 31.5)
      if (d < 19) return [gold, 1]
      if (d < 20) return [rim, 1]
      return [gold, Math.min(1, Math.max(0, 21 - d))]
    })
    // A separate color (above the same-ink floor), inside the merge radius.
    const g = ink(gold, 1)
    const k = ink(rim, 1)
    expect(ink2Dist(g, 0, k, 0)).toBeLessThan(DEFAULT_MERGE_DISTANCE)
    expect(ink2De00(g, 0, k, 0)).toBeGreaterThan(SAME_INK_DE00)
    const pal = palette(img, 64, evidence(0.5 / 255, 0.5 * Math.log(n * n), 1.5))
    expect(pal.count).toBe(2)
    expect(close(rgbOf(pal, find(pal, 1)), gold, 0.01)).toBe(true)
    find(pal, 0)
  })

  it('makes a rare color beside a visible ink an ink only when it is represented', () => {
    const n = 128
    const inks = (side: number): Palette =>
      palette(
        draw(n, n, (x, y) => {
          if (x >= 20 && x < 80 && y >= 20 && y < 80) return [RED, 1]
          if (x >= 100 && x < 100 + side && y >= 100 && y < 100 + side) return [BLUE, 1]
          return CLEAR
        }),
      )
    let pal = inks(2)
    expect(pal.count).toBe(2)
    expect(close(rgbOf(pal, find(pal, 1)), RED, 0.005)).toBe(true)
    pal = inks(3)
    expect(pal.count).toBe(3)
    expect([0, 1, 2].some((i) => close(rgbOf(pal, i), BLUE, 0.005))).toBe(true)
  })

  it('is deterministic', () => {
    const c = randomCases(2)[1]
    const ev = paletteEvidence(c.sigmaNoise, c.img.w * c.img.h, c.soft)
    const a = extractPaletteNative(c.img.rgb, c.img.alpha, c.img.w, c.img.h, undefined, 64, ev)
    const b = extractPaletteNative(c.img.rgb, c.img.alpha, c.img.w, c.img.h, undefined, 64, ev)
    expect(a).toEqual(b)
    expect(labelImageNative(c.img.rgb, c.img.alpha, a)).toEqual(
      labelImageNative(c.img.rgb, c.img.alpha, b),
    )
    const intake = { sigmaNoise: c.sigmaNoise, soft: c.soft }
    const x = nativeFrontEnd(c.img.rgb, c.img.alpha, c.img.w, c.img.h, intake)
    const y = nativeFrontEnd(c.img.rgb, c.img.alpha, c.img.w, c.img.h, intake)
    expect(x.labels).toEqual(y.labels)
    expect(x.palette).toEqual(y.palette)
    expect(x.sigmaNoise).toBe(y.sigmaNoise)
  })

  it('returns one ink for an empty image', () => {
    const pal = extractPaletteNative(new Float32Array(0), new Float32Array(0), 0, 0)
    expect(pal.count).toBe(1)
    expect(Array.from(pal.alpha)).toEqual([1])
    expect(Array.from(pal.weight)).toEqual([0])
  })
})

describe('the transparent-image front end', () => {
  it('labels the paint and the ground, and gives the band merge an opacity gate', () => {
    const img = draw(12, 12, redSquare)
    const fe = nativeFrontEnd(img.rgb, img.alpha, 12, 12, { sigmaNoise: 0.5 / 255, soft: false })
    const paint = find(fe.palette, 1)
    const ground = find(fe.palette, 0)
    expect(fe.labels[6 * 12 + 6]).toBe(paint)
    expect(fe.labels[0]).toBe(ground)
    expect(fe.labels.every((l) => l === paint || l === ground)).toBe(true)
    expect(fe.sameClass(paint, ground)).toBe(false)
    expect(fe.sameClass(paint, paint)).toBe(true)
    expect(fe.sigmaNoise).toBe(0.5 / 255)
    expect(fe.lambda).toBe(bicLambda(144))
  })

  it('raises the noise on a soft intake by the residual against the labels, within the cap', () => {
    const img = draw(32, 32, (x, y) => {
      const a = Math.min(1, Math.max(0, 10.5 - Math.hypot(x - 16, y - 16)))
      return [[0.2 + ((x * 7 + y * 3) % 5) * 0.01, 0.3, 0.6], a]
    })
    const clean = nativeFrontEnd(img.rgb, img.alpha, 32, 32, { sigmaNoise: 0.5 / 255, soft: false })
    const soft = nativeFrontEnd(img.rgb, img.alpha, 32, 32, { sigmaNoise: 0.5 / 255, soft: true })
    expect(clean.sigmaNoise).toBe(0.5 / 255)
    expect(soft.sigmaNoise).toBeGreaterThan(0.5 / 255)
    expect(soft.sigmaNoise).toBeLessThanOrEqual(8 / 255)
  })
})

describe('naming carved paint', () => {
  // Inks: 0 the clear ground, 1 black paint, 2 yellow paint.
  const pal: Palette = {
    count: 3,
    inkLab: Float64Array.from([
      ...rgbToOklabF32(1, 1, 1),
      ...rgbToOklabF32(0, 0, 0),
      ...rgbToOklabF32(1, 0.9, 0.2),
    ]),
    inkRgb: Float64Array.of(1, 1, 1, 0, 0, 0, 1, fr(0.9), fr(0.2)),
    weight: new Float64Array(3),
    alpha: Float64Array.of(0, 1, 1),
  }
  // A 4 × 2 image: label 3 pale yellow paint, label 4 faint residue, label 5 named black.
  const img = draw(4, 2, (x, y) =>
    y === 0 ? [[1, 0.94, 0.47], 1] : x < 2 ? [[0.8, 0.8, 0.8], 0.2] : [[0, 0, 0], 1],
  )
  const labels = Int32Array.of(3, 3, 3, 3, 4, 4, 5, 5)

  it('renames a feature of paint the carve named by the clear ground', () => {
    const labelInk = [0, 1, 2, 0, 0, 1]
    nameCarvedPaint(labels, img.rgb, img.alpha, pal, labelInk, 3)
    // The pale disc goes to the nearest ink that draws something; the residue stays clear;
    // a feature named by a visible ink keeps its name; palette labels are never touched.
    expect(labelInk).toEqual([0, 1, 2, 2, 0, 1])
  })

  it('does nothing without a visible ink or a minted label', () => {
    const clearOnly: Palette = { ...pal, count: 1, alpha: Float64Array.of(0) }
    const a = [0, 1, 2, 0, 0, 1]
    nameCarvedPaint(labels, img.rgb, img.alpha, clearOnly, a, 3)
    expect(a).toEqual([0, 1, 2, 0, 0, 1])
    const b = [0, 1, 2, 0, 0, 1]
    nameCarvedPaint(labels, img.rgb, img.alpha, pal, b, 6)
    expect(b).toEqual([0, 1, 2, 0, 0, 1])
  })

  /**
   * A black disc (r = 30) and a pale-yellow disc of `area` px² on a clear 128 px canvas, through
   * the front end, the band merge with the opacity gate, the carve and the naming: the pale
   * disc's label and its ink, and the inks before and after the naming.
   */
  function paleDisc(area: number): { ink: number; alpha: number; fill: Rgb; renamed: boolean } {
    const n = 128
    const canvas = draw(n, n, (x, y) => {
      const big = Math.min(1, Math.max(0, 30.5 - Math.hypot(x - 45, y - 45)))
      const r = Math.sqrt(area / Math.PI)
      const small = Math.min(1, Math.max(0, r + 0.5 - Math.hypot(x - 105, y - 105)))
      return small > 0 ? [[1, 0.94, 0.47], small] : [[0, 0, 0], big]
    })
    const { rgb, alpha } = canvas
    const fe = nativeFrontEnd(rgb, alpha, n, n, { sigmaNoise: 0.5 / 255, soft: false })
    const { palette: inks, labels: map, sigmaNoise, lambda, sameClass } = fe
    const merged = mergeGradientBands(map, rgb, n, n, inks.inkRgb, sigmaNoise, lambda, {
      sameClass,
    })
    const from = merged.fills.length
    carveResidualFeatures(
      map,
      rgb,
      n,
      n,
      inks.inkRgb,
      merged.fills,
      merged.ink,
      sigmaNoise,
      lambda,
      2,
      null,
    )
    const before = merged.ink.slice()
    nameCarvedPaint(map, rgb, alpha, inks, merged.ink, from)
    const l = map[105 * n + 105]
    return {
      ink: merged.ink[l],
      alpha: inks.alpha[merged.ink[l]],
      fill: representative(merged.fills[l].model),
      renamed: before[l] !== merged.ink[l],
    }
  }

  it('paints a pale disc beside a black disc on the clear ground', () => {
    // 30 px²: represented, so an ink of its own.
    const ink30 = paleDisc(30)
    expect(ink30.alpha).toBeGreaterThan(CLEAR_INK_ALPHA)
    expect(ink30.fill[0]).toBeGreaterThan(0.95)
    expect(ink30.fill[2]).toBeLessThan(0.9)
    expect(ink30.renamed).toBe(false)
    // 6 px²: under the representation floor, carved out of the clear ground and named by the
    // clear ink there, then renamed to the ink that draws something; its fill is its own.
    const ink6 = paleDisc(6)
    expect(ink6.renamed).toBe(true)
    expect(ink6.alpha).toBe(1)
    expect(ink6.fill[0]).toBeGreaterThan(0.95)
    expect(ink6.fill[2]).toBeLessThan(0.9)
    // 4 px²: mostly see-through, so it keeps the clear ink.
    const ink4 = paleDisc(4)
    expect(ink4.renamed).toBe(false)
    expect(ink4.alpha).toBe(0)
  })

  it('treats an ink without an opacity as clear', () => {
    const noAlpha: Palette = { ...pal, alpha: Float64Array.of(0, 1) }
    const labelInk = [0, 1, 2, 2]
    nameCarvedPaint(labels, img.rgb, img.alpha, noAlpha, labelInk, 3)
    expect(labelInk[3]).toBe(1)
    expect(CLEAR_INK_ALPHA).toBe(0.02)
  })
})

/** A horizontal sRGB linear gradient from inkvec's `(0, 0)` to `(len, 0)` (Trazor's frame: +½). */
function linearModel(c0: Rgb, mids: [number, Rgb][], c1: Rgb, len: number): FillModel {
  return {
    kind: 'linear',
    p0: [0.5, 0.5],
    p1: [len + 0.5, 0.5],
    c0,
    c1,
    interp: 'srgb',
    mids: mids.map(([offset, color]) => ({ offset, color })),
  }
}

/** The fill model's value at inkvec's pixel-center position `(x, y)`. */
function valueAt(m: FillModel, x: number, y: number): number[] {
  const out = [0, 0, 0]
  new FillEval(m).colorAt(x + 0.5, y + 0.5, out, 0)
  return out
}

const STOPS: Rgb[] = [
  [0.9, 0.2, 0.1],
  [0.3, 0.7, 0.2],
  [0.1, 0.3, 0.8],
]
/** The color a three-stop fade was painted with at `t`. */
function painted(t: number): number[] {
  return t <= 0.5
    ? mix(STOPS[0], STOPS[1], fr(t / 0.5))
    : mix(STOPS[1], STOPS[2], fr((t - 0.5) / 0.5))
}

/** An 11 × 3 fade: color by column along three stops, opacity rising along both axes (and `extra` faint pixels). */
function fadeFixture(extra = 0): { rgb: Float32Array; alpha: Float32Array } {
  const rgb = new Float32Array((33 + extra) * 3)
  const alpha = new Float32Array(33 + extra)
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 11; x++) {
      const a = fr(fr(0.25 + fr(0.05 * x)) + fr(0.1 * y))
      rgb.set(onWhite(painted(x / 10), a), (y * 11 + x) * 3)
      alpha[y * 11 + x] = a
    }
  }
  return { rgb, alpha }
}

describe('fades', () => {
  it('reads the stops of a profile and prices its opacity at one number per stop', () => {
    const c: Rgb = [0.2, 0.3, 0.4]
    expect(modelStops({ kind: 'flat', color: c })).toEqual([{ offset: 0, color: c }])
    const m = linearModel([0.1, 0.1, 0.1], [[0.3, c]], [0.9, 0.9, 0.9], 10)
    expect(modelStops(m).map((s) => s.offset)).toEqual([0, 0.3, 1])
    expect(alphaParams({ kind: 'flat', color: c })).toBe(1)
    expect(alphaParams(linearModel(c, [], c, 1))).toBe(6)
    expect(alphaParams(m)).toBe(8)
    const radial = (aspect: number, mids: number): FillModel => ({
      kind: 'radial',
      c: [0, 0],
      r: 1,
      c0: c,
      c1: c,
      interp: 'srgb',
      aspect,
      angle: 0,
      mids: Array.from({ length: mids }, (_, i) => ({ offset: 0.2 + 0.4 * i, color: c })),
    })
    expect(alphaParams(radial(1, 1))).toBe(7)
    expect(alphaParams(radial(1.5, 0))).toBe(7)
    expect(alphaParams(radial(1.5, 2))).toBe(11)
  })

  it('composites each stop of a fade over white at its own opacity', () => {
    const alpha = linearModel([0.2, 0.2, 0.2], [[0.5, [0.6, 0.6, 0.6]]], [0.9, 0.9, 0.9], 10)
    const fade: Fade = {
      color: linearModel([0.8, 0.2, 0.1], [[0.5, [0.4, 0.4, 0.4]]], [0.1, 0.3, 0.9], 10),
      alpha,
    }
    const want = [
      [0.96, 0.84, 0.82],
      [0.64, 0.64, 0.64],
      [0.19, 0.37, 0.91],
    ]
    const got = modelStops(fadeOverWhite(fade))
    expect(got.map((s) => s.offset)).toEqual([0, 0.5, 1])
    got.forEach((s, i) => expect(close(s.color, want[i], 1e-6)).toBe(true))
    const ow = fadeOverWhite(fade)
    expect(ow.kind === 'linear' && ow.p1[0] === 10.5).toBe(true)
    expect(rimAlpha(fade)).toBeCloseTo(0.2, 7)
    expect(faceOpacity(fade, washPalette([1, 1, 1], [1]), 0)).toBeCloseTo(0.2, 7)
    expect(faceOpacity(null, washPalette([1, 1, 1], [0.4]), 0)).toBe(fr(0.4))
    expect(faceOpacity(null, washPalette([1, 1, 1], [0.4]), 3)).toBe(1)
    // A flat color is the color at every stop.
    const black: Fade = { color: { kind: 'flat', color: [0, 0, 0] }, alpha }
    expect(
      close(
        modelStops(fadeOverWhite(black)).map((s) => s.color[0]),
        [0.8, 0.4, 0.1],
        1e-6,
      ),
    ).toBe(true)
  })

  it('solves a small system exactly and refuses a singular one', () => {
    // The first pivot is zero: this needs the row swap.
    const a = [
      [0, 2, 1],
      [1, 1, 1],
      [2, 1, 3],
    ]
    const x = [
      [1, 2, 3],
      [-1, 0.5, 2],
      [0.25, -3, 1],
    ]
    const b = a.map((row) => [0, 1, 2].map((c) => row.reduce((s, v, k) => s + v * x[k][c], 0)))
    const got = solveStops(
      a.map((r) => r.slice()),
      b,
    )
    expect(got).not.toBeNull()
    got!.forEach((row, i) => expect(close(row, x[i], 1e-12)).toBe(true))
    expect(
      solveStops(
        [
          [1, 2],
          [2, 4],
        ],
        [
          [1, 1, 1],
          [2, 2, 2],
        ],
      ),
    ).toBeNull()
  })

  it('recovers the colors a fade was painted with', () => {
    const { rgb, alpha } = fadeFixture()
    const model = linearModel([0, 0, 0], [[0.5, [0.5, 0.5, 0.5]]], [1, 1, 1], 10)
    const px = Array.from({ length: 33 }, (_, p) => p)
    const got = modelStops(fitColorStops(model, px, rgb, alpha, 11))
    got.forEach((s, i) => expect(close(s.color, STOPS[i], 2e-3)).toBe(true))
  })

  it('holds a stop no pixel testifies about to the mean color of the fade', () => {
    const { rgb, alpha } = fadeFixture(1)
    const px = Array.from({ length: 33 }, (_, p) => p).filter((p) => p % 11 <= 5)
    const num = [0, 0, 0]
    let den = 0
    for (const p of px) {
      const s = painted((p % 11) / 10)
      for (let k = 0; k < 3; k++) num[k] += fr(s[k] * alpha[p])
      den += alpha[p]
    }
    // A pixel too faint to see must not steer anything, whatever its color.
    rgb.set([0, 0, 0], 33 * 3)
    alpha[33] = 0.0009
    px.push(33)
    const model = linearModel([0, 0, 0], [[0.5, [0.5, 0.5, 0.5]]], [1, 1, 1], 10)
    const got = modelStops(fitColorStops(model, px, rgb, alpha, 11))
    expect(
      close(
        got[2].color,
        num.map((v) => v / den),
        1e-5,
      ),
    ).toBe(true)
    expect(close(got[0].color, STOPS[0], 2e-3)).toBe(true)
  })

  it('charges opacity and premultiplied color beyond half a level', () => {
    const s = [0.2, 0.4, 0.6]
    const rgb = Float32Array.from(onWhite(s, 0.5))
    const alpha = Float32Array.of(0.5)
    const model =
      (a: number) =>
      (_p: number, out: Float64Array): number => {
        out.set(s.map(fr))
        return fr(a)
      }
    expect(fadeChi2([0], rgb, alpha, 0.01, model(0.5))).toBe(0)
    expect(fadeChi2([0], rgb, alpha, 0.01, model(0.501))).toBe(0)
    const dead = 0.5 / 255
    const beyond = (e: number): number => ((e - dead) / 0.01) ** 2
    const want = beyond(0.1) + beyond(0.02) + beyond(0.04) + beyond(0.06)
    expect(Math.abs(fadeChi2([0, 0], rgb, alpha, 0.01, model(0.6)) - 2 * want)).toBeLessThan(
      1e-3 * want,
    )
  })

  it('fits the opacity profile counting the evidence once and each stop at one number', () => {
    const w = 12
    const h = 4
    const alpha = Float32Array.from({ length: w * h }, (_, p) => 0.1 + 0.07 * (p % w))
    const gray = new Float32Array(w * h * 3)
    alpha.forEach((a, p) => gray.set([a, a, a], p * 3))
    const px = Array.from({ length: w * h }, (_, p) => p)
    const sigma = 1 / 255
    const lambda = 2
    const ramp = fitOpacity(gray, w, h, px, () => true, sigma, lambda, false)
    expect(isGradient(ramp.model)).toBe(true)
    // A ramp is explained exactly: the cost is the geometry and two opacity stops.
    expect(Math.abs(ramp.cost - lambda * alphaParams(ramp.model))).toBeLessThan(1e-3)
    expect(alphaParams(ramp.model)).toBe(6)
    const flat = fitOpacity(gray, w, h, px, () => true, sigma, lambda, true)
    const cand = fitPixels(gray, w, h, px, () => true, null, sigma, lambda).find(
      (f) => !isGradient(f.model),
    )!
    expect(flat.model).toEqual(cand.model)
    expect(cand.chi2).toBeGreaterThan(1000)
    expect(flat.cost).toBeCloseTo(0.5 * (cand.chi2 / 3) + lambda, 6)
  })

  it('turns the bands of one glow into one fade', () => {
    const s = [0.8, 0.3, 0.1]
    const scene = glow(16, 4, 4, s, bicLambda(64))
    const labels = scene.labels.slice()
    const fills: FillFit[] = []
    const labelInk: number[] = []
    const { rgb, alpha } = scene.img
    const fades = mergeFades(
      labels,
      fills,
      labelInk,
      rgb,
      alpha,
      16,
      4,
      scene.palette,
      1 / 255,
      scene.lambda,
    )
    expect(fades.length).toBe(5)
    expect(fades.slice(0, 4).every((f) => f === null)).toBe(true)
    const fade = fades[4]!
    expect(labels.every((l) => l === 4)).toBe(true)
    expect(labelInk[4]).toBe(0)
    // The opacity profile is the ramp it was painted with, in one color throughout.
    for (let x = 1; x < 15; x++)
      expect(Math.abs(valueAt(fade.alpha, x, 1.5)[0] - alpha[x])).toBeLessThan(0.01)
    for (const st of modelStops(fade.color)) expect(close(st.color, s, 0.01)).toBe(true)
    expect(fills[4].model).toEqual(fadeOverWhite(fade))
    // The padding is each label's palette color.
    for (let l = 0; l < 4; l++)
      expect(fills[l].model).toEqual({
        kind: 'flat',
        color: Array.from(scene.palette.inkRgb.subarray(l * 3, l * 3 + 3)),
      })
  })

  it('gives two separate glows two new labels', () => {
    const scene = twoGlows()
    const labels = scene.labels.slice()
    const fades = mergeFades(
      labels,
      [],
      [],
      scene.img.rgb,
      scene.img.alpha,
      16,
      9,
      scene.palette,
      1 / 255,
      3,
    )
    expect(fades.length).toBe(7)
    expect(fades[5]).not.toBeNull()
    expect(fades[6]).not.toBeNull()
    expect(labels.subarray(0, 64).every((l) => l === 5)).toBe(true)
    expect(labels.subarray(64, 80).every((l) => l === 4)).toBe(true)
    expect(labels.subarray(80).every((l) => l === 6)).toBe(true)
  })

  it('keeps a flat wash a wash, with its color over white at the opacity of its ink', () => {
    const scene = flatWash()
    const labels = scene.labels.slice()
    const fills: FillFit[] = []
    const fades = mergeFades(
      labels,
      fills,
      [],
      scene.img.rgb,
      scene.img.alpha,
      6,
      6,
      scene.palette,
      1 / 255,
      2,
    )
    expect(fades).toEqual([null])
    expect(labels.every((l) => l === 0)).toBe(true)
    const m = fills[0].model
    expect(m.kind === 'flat' && close(m.color, onWhite([0.2, 0.4, 0.8], 0.52), 1e-5)).toBe(true)
  })

  it('leaves an image without washes alone', () => {
    const img = draw(8, 8, (x) => (x < 4 ? [RED, 1] : CLEAR))
    const labels = Int32Array.from({ length: 64 }, (_, p) => (p % 8 < 4 ? 0 : 1))
    const fills: FillFit[] = []
    const pal = washPalette([...RED, 1, 1, 1], [1, 0])
    expect(mergeFades(labels, fills, [], img.rgb, img.alpha, 8, 8, pal, 1 / 255, 2)).toEqual([
      null,
      null,
    ])
    expect(fills).toEqual([])
  })
})

/** How the port's palette and labels differ from inkvec's (inks within 1e-6, opacities, weights, labels exactly). */
function paletteMismatch(pal: Palette, labels: Int32Array, ref: NativePaletteRef): string[] {
  if (pal.count !== ref.count) return [`${pal.count} inks, want ${ref.count}`]
  const out: string[] = []
  const off = (what: string, got: ArrayLike<number>, want: number[], tol: number): void => {
    for (let i = 0; i < want.length; i++) {
      if (!(Math.abs(got[i] - want[i]) <= tol)) out.push(`${what}[${i}] ${got[i]}, want ${want[i]}`)
    }
  }
  off('inkLab', pal.inkLab, ref.inkLab, 1e-6)
  off('inkRgb', pal.inkRgb, ref.inkRgb, 1e-6)
  off('weight', pal.weight, ref.weight, 0)
  off('alpha', pal.alpha, ref.alpha, 1e-6)
  if (labelHash(labels) !== ref.labelHash) out.push('labels differ')
  return out
}

/** Every fade and fill of the fades stage against inkvec's tokens (positions and colors within 1e-6). */
function fadeMismatch(
  fades: (Fade | null)[],
  fills: FillFit[],
  want: {
    nFades: number
    fades: { label: number; color: (string | number)[]; alpha: (string | number)[] }[]
    fills: { label: number; model: (string | number)[]; chi2: number; params: number }[]
  },
): string[] {
  const out: string[] = []
  if (fades.length !== want.nFades) out.push(`${fades.length} fade slots, want ${want.nFades}`)
  const minted = fades.filter((f) => f !== null).length
  if (minted !== want.fades.length) out.push(`${minted} fades, want ${want.fades.length}`)
  for (const f of want.fades) {
    const got = fades[f.label]
    if (!got) {
      out.push(`no fade at ${f.label}`)
      continue
    }
    if (!(modelDiff(modelTokens(got.color), f.color) <= 1e-6)) out.push(`fade ${f.label} color`)
    if (!(modelDiff(modelTokens(got.alpha), f.alpha) <= 1e-6)) out.push(`fade ${f.label} opacity`)
  }
  for (const f of want.fills) {
    const got = fills[f.label]
    if (!(modelDiff(modelTokens(got.model), f.model) <= 1e-6)) out.push(`fill ${f.label} model`)
    if (fades[f.label]) {
      if (!(Math.abs(got.chi2 - f.chi2) <= 1e-6 * Math.max(1, f.chi2)))
        out.push(`fill ${f.label} chi2 ${got.chi2}, want ${f.chi2}`)
      if (got.params !== f.params) out.push(`fill ${f.label} params`)
    }
  }
  return out
}

const SENTINEL: FillModel = { kind: 'flat', color: [0.25, 0.5, 0.75] }

describe('transparent-image parity with inkvec', () => {
  it('matches the palette and labels on random transparent art', () => {
    const cases = randomCases(RANDOM_REFS.length)
    for (let c = 0; c < cases.length; c++) {
      const { img, maxColors, sigmaNoise, soft, name } = cases[c]
      const ref = RANDOM_REFS[c]
      expect(ref.name).toBe(name)
      const ev = paletteEvidence(sigmaNoise, img.w * img.h, soft)
      const pal = extractPaletteNative(
        img.rgb,
        img.alpha,
        img.w,
        img.h,
        DEFAULT_MERGE_DISTANCE,
        maxColors,
        ev,
      )
      const labels = labelImageNative(img.rgb, img.alpha, pal)
      expect({ name, mismatch: paletteMismatch(pal, labels, ref) }).toEqual({ name, mismatch: [] })
    }
  })

  for (const ref of CORPUS_REFS) {
    it(`matches the front end, the naming of carved paint and the fades on ${ref.name}`, () => {
      const img = fromDeflated(ref.w, ref.h, ref.rgba)
      const n = ref.w * ref.h
      const ev = paletteEvidence(ref.sigma0, n, ref.soft)
      const pal = extractPaletteNative(
        img.rgb,
        img.alpha,
        ref.w,
        ref.h,
        DEFAULT_MERGE_DISTANCE,
        64,
        ev,
      )
      expect(paletteMismatch(pal, labelImageNative(img.rgb, img.alpha, pal), ref.palette)).toEqual(
        [],
      )
      const fe = nativeFrontEnd(img.rgb, img.alpha, ref.w, ref.h, {
        sigmaNoise: ref.sigma0,
        soft: ref.soft,
      })
      // The soft-intake residual is measured in double precision (inkvec: single).
      expect(Math.abs(fe.sigmaNoise - ref.sigma)).toBeLessThan(1e-7 * ref.sigma)
      expect([fe.absorbed, fe.moved]).toEqual([ref.absorbed, ref.moved])
      expect(labelHash(fe.labels)).toBe(ref.l2Hash)

      // The carve and fades stages on inkvec's labels after its band merge and carve.
      const raw = inflateSync(Buffer.from(ref.carve.labels, 'base64'))
      const carved = new Int32Array(
        raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength),
      )
      const refPal: Palette = {
        count: ref.palette.count,
        inkLab: Float64Array.from(ref.palette.inkLab),
        inkRgb: Float64Array.from(ref.palette.inkRgb),
        weight: Float64Array.from(ref.palette.weight),
        alpha: Float64Array.from(ref.palette.alpha),
      }
      const named = ref.carve.inkBefore.slice()
      nameCarvedPaint(carved, img.rgb, img.alpha, refPal, named, ref.carve.from)
      expect(named).toEqual(ref.carve.inkAfter)
      const labels = carved.slice()
      const labelInk = ref.fade.labelInk.slice()
      const fills: FillFit[] = Array.from({ length: ref.fade.nFills }, () => ({
        model: SENTINEL,
        chi2: 0,
        params: 3,
        cost: 0,
      }))
      const fades = mergeFades(
        labels,
        fills,
        labelInk,
        img.rgb,
        img.alpha,
        ref.w,
        ref.h,
        refPal,
        ref.sigma,
        bicLambda(n),
      )
      expect(labelHash(labels)).toBe(ref.fade.labelHash)
      expect(labelInk).toEqual(ref.fade.labelInkAfter)
      expect(fills.length).toBe(ref.fade.totalFills)
      expect(fadeMismatch(fades, fills, ref.fade)).toEqual([])
      // Every fill inkvec left alone, the port left alone.
      const touched = new Set(ref.fade.fills.map((f) => f.label))
      const moved = fills.filter(
        (f, l) => l < ref.fade.nFills && !touched.has(l) && f.model !== SENTINEL,
      )
      expect(moved).toEqual([])
    })
  }

  it('matches the fades stage on synthetic glows, halos, shadows and washes', () => {
    const scenes = fadeScenes()
    expect(scenes.length).toBe(FADE_REFS.length)
    for (let s = 0; s < scenes.length; s++) {
      const scene = scenes[s]
      const ref = FADE_REFS[s]
      expect(ref.name).toBe(scene.name)
      const labels = scene.labels.slice()
      const labelInk = scene.labelInk.slice()
      const fills: FillFit[] = Array.from({ length: scene.nFills }, () => ({
        model: SENTINEL,
        chi2: 0,
        params: 3,
        cost: 0,
      }))
      const { rgb, alpha, w, h } = scene.img
      const fades = mergeFades(
        labels,
        fills,
        labelInk,
        rgb,
        alpha,
        w,
        h,
        scene.palette,
        scene.sigma,
        scene.lambda,
      )
      // The harness ran with the same placeholder fills: what it left alone carries them.
      const kept = (f: { label: number; model: (string | number)[] }): boolean =>
        f.label < scene.nFills && modelDiff(f.model, modelTokens(SENTINEL)) === 0
      const keptMoved = ref.fills.filter((f) => kept(f) && fills[f.label].model !== SENTINEL)
      expect({
        name: scene.name,
        labels: labelHash(labels),
        labelInk,
        fills: fills.length,
        mismatch: fadeMismatch(fades, fills, { ...ref, fills: ref.fills.filter((f) => !kept(f)) }),
        keptMoved,
      }).toEqual({
        name: ref.name,
        labels: ref.labelHash,
        labelInk: ref.labelInk,
        fills: ref.fills.length,
        mismatch: [],
        keptMoved: [],
      })
    }
  })
})
