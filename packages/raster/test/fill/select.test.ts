import { describe, expect, it } from 'vitest'
import { colorAt, fillKind } from '../../src/fill/model'
import type { FillFit, FillModel, Rgb } from '../../src/fill/model'
import { collectSamples, FIT_PIXELS_CAP, interiorCount, stridedUnion } from '../../src/fill/samples'
import {
  commonPixelGain,
  fitCandidates,
  fitFill,
  fitPixels,
  fitUnion,
  pixelsOf,
  select,
} from '../../src/fill/select'
import {
  clampedRadial,
  ELLIPSE,
  ellipse,
  horizontalLinear,
  LINEAR_C0,
  LINEAR_C1,
  lostFeature,
  multiStop,
  noisyFlat,
  obliqueLinear,
  quantize,
  radial,
  RADIAL_CENTRE,
  rampLinear,
  srgbLinear,
  step,
  oneLevel,
} from './scenes'
import type { FillScene } from './scenes'

const fit = (s: FillScene): FillFit => fitFill(s.rgb, s.w, s.h, s.labels, 1, s.sigma, s.lambda)
const cands = (s: FillScene): FillFit[] =>
  fitCandidates(s.rgb, s.w, s.h, s.labels, 1, s.sigma, s.lambda)

function close3(a: Rgb, b: readonly number[], tol: number): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(tol)
}

/** Axis direction in degrees, modulo 180. */
function axisDeg(m: FillModel): number {
  if (m.kind !== 'linear') throw new Error(`not linear: ${fillKind(m)}`)
  const a = (Math.atan2(m.p1[1] - m.p0[1], m.p1[0] - m.p0[0]) * 180) / Math.PI
  return ((a % 180) + 180) % 180
}

function angleDiff(a: number, b: number): number {
  const d = (((a - b) % 180) + 180) % 180
  return Math.min(d, 180 - d)
}

describe('fill selection on synthetic regions', () => {
  it('keeps a noisy flat region flat, at its color', () => {
    const f = fit(noisyFlat())
    expect(f.model.kind).toBe('flat')
    if (f.model.kind === 'flat') close3(f.model.color, [0.35, 0.55, 0.7], 1 / 255)
    // Unit-σ noise beyond a half-σ dead zone: about 1.26 per interior pixel.
    const interior = 78 * 78
    expect(f.chi2).toBeGreaterThan(0.9 * interior)
    expect(f.chi2).toBeLessThan(1.7 * interior)
  })

  it('recovers a horizontal linear ramp, its end points and its stops, in linear light', () => {
    const f = fit(horizontalLinear())
    const m = f.model
    if (m.kind !== 'linear') throw new Error(fillKind(m))
    expect(m.interp).toBe('linearRgb')
    expect(angleDiff(axisDeg(m), 0)).toBeLessThanOrEqual(2)
    // The interior spans pixels 9..86, centered at 9.5 and 86.5.
    const [lo, hi] = m.p0[0] < m.p1[0] ? [m.p0, m.p1] : [m.p1, m.p0]
    const [loC, hiC] = m.p0[0] < m.p1[0] ? [m.c0, m.c1] : [m.c1, m.c0]
    expect(Math.abs(lo[0] - 9.5)).toBeLessThan(0.5)
    expect(Math.abs(hi[0] - 86.5)).toBeLessThan(0.5)
    close3(loC, rampLinear(LINEAR_C0, LINEAR_C1, 9 / 95), 3 / 255)
    close3(hiC, rampLinear(LINEAR_C0, LINEAR_C1, 86 / 95), 3 / 255)
  })

  it('recovers an oblique linear axis', () => {
    expect(angleDiff(axisDeg(fit(obliqueLinear()).model), 32)).toBeLessThanOrEqual(2)
  })

  it('picks the interpolation space the ramp was made in', () => {
    const lin = fit(horizontalLinear()).model
    const srgb = fit(srgbLinear()).model
    expect(lin.kind === 'linear' && lin.interp).toBe('linearRgb')
    expect(srgb.kind === 'linear' && srgb.interp).toBe('srgb')
  })

  it('recovers a radial ramp’s center in pixel coordinates', () => {
    const m = fit(radial()).model
    if (m.kind !== 'radial') throw new Error(fillKind(m))
    expect(m.interp).toBe('linearRgb')
    expect(m.aspect).toBe(1)
    // The scene's center is in pixel indices; a pixel's center is its index plus ½.
    expect(
      Math.hypot(m.c[0] - RADIAL_CENTRE[0] - 0.5, m.c[1] - RADIAL_CENTRE[1] - 0.5),
    ).toBeLessThanOrEqual(0.5)
    close3(m.c0, [1, 0.98, 0.9], 3 / 255)
  })

  it('chooses an elliptical ramp as an ellipse', () => {
    const all = cands(ellipse())
    const ell = all.find((f) => fillKind(f.model) === 'ellipse/lin')
    expect(ell).toBeDefined()
    const m = ell!.model
    if (m.kind !== 'radial') throw new Error('not radial')
    expect(Math.hypot(m.c[0] - ELLIPSE.cx - 0.5, m.c[1] - ELLIPSE.cy - 0.5)).toBeLessThan(0.3)
    expect(Math.abs(m.aspect / ELLIPSE.aspect - 1)).toBeLessThan(0.03)
    expect(angleDiff((m.angle * 180) / Math.PI, 25)).toBeLessThan(1.5)
    expect(fillKind(select(all).model)).toBe('ellipse/lin')
  })

  it('recovers an interior stop', () => {
    const m = fit(multiStop()).model
    if (m.kind !== 'linear') throw new Error(fillKind(m))
    expect(m.interp).toBe('srgb')
    expect(m.mids.length).toBeGreaterThanOrEqual(1)
    // The stop sits at 0.4 of the region's span.
    const offsets = m.mids.map((s) => s.offset)
    const t = m.p0[0] < m.p1[0] ? 0.4 : 0.6
    expect(Math.min(...offsets.map((o) => Math.abs(o - t)))).toBeLessThan(0.03)
    for (const o of offsets) expect(Math.round(o * 1000)).toBeCloseTo(o * 1000, 9)
  })

  it('fits a clamped radial (flat core, ramp to the rim) with a radial', () => {
    const m = fit(clampedRadial()).model
    expect(m.kind).toBe('radial')
  })

  it('keeps a lost feature at one end flat, at the median', () => {
    const all = cands(lostFeature())
    expect(all.length).toBe(1)
    const m = all[0].model
    expect(m.kind === 'flat' && m.color.every((v) => v === Math.fround(quantize(0.02)))).toBe(true)
  })

  it('reads two flat colors as a step, not a ramp', () => {
    expect(fit(step()).model.kind).toBe('flat')
  })

  it('keeps 8-bit rounding of a ramp inside the dead zone, so no interior stop pays', () => {
    // An sRGB ramp quantized to 8 bits: the two-stop ramp predicts every pixel within
    // half a level, which costs nothing; a stop could only buy parameters.
    const all = cands(srgbLinear())
    const best = select(all)
    expect(fillKind(best.model)).toBe('linear/srgb')
    expect(best.model.kind === 'linear' && best.model.mids.length).toBe(0)
    expect(best.chi2).toBe(0)
  })

  it('keeps a ramp across a single level flat: its contrast is not visible', () => {
    const f = fit(oneLevel())
    expect(f.model.kind).toBe('flat')
    expect(f.chi2).toBeGreaterThan(0)
  })

  it('is deterministic and independent of the pixel order', () => {
    const s = clampedRadial()
    const a = fit(s)
    const b = fit(s)
    expect(b).toEqual(a)
    const px = pixelsOf(s.labels, 1).toReversed()
    const c = select(
      fitPixels(s.rgb, s.w, s.h, px, (p) => s.labels[p] === 1, null, s.sigma, s.lambda),
    )
    expect(c).toEqual(a)
  })

  it('gives an empty region a black flat fill at the price of its parameters', () => {
    const s = noisyFlat()
    const f = fitFill(s.rgb, s.w, s.h, s.labels, 7, s.sigma, 2)
    expect(f.model).toEqual({ kind: 'flat', color: [0, 0, 0] })
    expect(f.cost).toBe(6)
  })
})

describe('samples', () => {
  it('excludes edge pixels and the picture edge', () => {
    // A 3×3 block in a 5×5 image: its center only. The whole image: its inner 3×3.
    const block = Int32Array.from([6, 7, 8, 11, 12, 13, 16, 17, 18])
    const inBlock = (p: number): boolean => block.includes(p)
    expect(interiorCount(block, 5, 5, inBlock)).toBe(1)
    const all = Int32Array.from({ length: 25 }, (_, i) => i)
    expect(interiorCount(all, 5, 5, () => true)).toBe(9)
    const s = collectSamples(new Float32Array(75).fill(0.5), 5, 5, all, () => true, null, true)
    expect(Array.from(s.px)).toEqual([6, 7, 8, 11, 12, 13, 16, 17, 18])
    expect([s.x[4], s.y[4]]).toEqual([2, 2])
  })

  it('fits a 1 px line flat from all its pixels', () => {
    const w = 20
    const rgb = new Float32Array(3 * w * 5).fill(1)
    const labels = new Int32Array(w * 5)
    for (let x = 2; x < 18; x++) {
      labels[2 * w + x] = 1
      rgb.fill(Math.fround(x / 40), 3 * (2 * w + x), 3 * (2 * w + x) + 3)
    }
    const all = fitCandidates(rgb, w, 5, labels, 1, 1 / 255, 3)
    expect(all.length).toBe(1)
    expect(all[0].model.kind).toBe('flat')
  })

  it('strides a union over the gather cap', () => {
    const a = Int32Array.from({ length: 50000 }, (_, i) => i)
    const b = Int32Array.from({ length: 30000 }, (_, i) => 100000 + i)
    const u = stridedUnion(a, b)
    expect(u.length).toBe(Math.ceil(80000 / Math.floor(80000 / FIT_PIXELS_CAP)))
    expect(u[0]).toBe(0)
    expect(u[1]).toBe(1)
    expect(u[u.length - 1]).toBe(100000 + 29999)
    expect(Array.from(stridedUnion([3, 1], [2]))).toEqual([3, 1, 2])
  })
})

describe('unions and common-pixel gains', () => {
  it('scales chi² back up when a fit saw a subsample', () => {
    // A 300 × 240 flat-noise region (72,000 pixels) is gathered every other pixel.
    const w = 300
    const h = 240
    const rgb = new Float32Array(3 * w * h)
    const labels = new Int32Array(w * h).fill(1)
    let seed = 1
    for (let i = 0; i < rgb.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0
      rgb[i] = Math.fround(Math.round((0.5 + ((seed / 4294967296 - 0.5) * 6) / 255) * 255) / 255)
    }
    const px = pixelsOf(labels, 1)
    const member = (): boolean => true
    const f = fitUnion(rgb, w, h, px, [], member, null, 1 / 255, 5)
    const seen = stridedUnion(px, [])
    const direct = select(fitPixels(rgb, w, h, seen, member, null, 1 / 255, 5))
    const k = px.length / seen.length
    expect(f.chi2).toBeCloseTo(direct.chi2 * k, 6)
    expect(f.cost).toBeCloseTo(direct.cost - 0.5 * direct.chi2 + 0.5 * direct.chi2 * k, 6)
  })

  it('prices two bands of one ramp as cheaper together', () => {
    const s = horizontalLinear()
    const labels = Int32Array.from(s.labels, (l, p) => (l === 1 && p % s.w >= 48 ? 2 : l))
    const a = pixelsOf(labels, 1)
    const b = pixelsOf(labels, 2)
    const one = (l: number) => (p: number) => labels[p] === l
    const both = (p: number): boolean => labels[p] === 1 || labels[p] === 2
    const left = fitUnion(s.rgb, s.w, s.h, a, [], one(1), null, s.sigma, s.lambda)
    const right = fitUnion(s.rgb, s.w, s.h, b, [], one(2), null, s.sigma, s.lambda)
    const union = fitUnion(s.rgb, s.w, s.h, a, b, both, null, s.sigma, s.lambda)
    expect(union.model.kind).toBe('linear')
    const all = Int32Array.from([...a, ...b])
    const gain = commonPixelGain(
      s.rgb,
      s.w,
      s.h,
      all,
      both,
      one(1),
      null,
      left,
      right,
      union,
      s.sigma,
      s.lambda,
    )
    expect(gain).not.toBeNull()
    expect(gain!).toBeGreaterThan(0)
    // The union's model reads the ramp where the two halves meet.
    close3(colorAt(union.model, 48, 40), rampLinear(LINEAR_C0, LINEAR_C1, 47.5 / 95), 3 / 255)
  })
})
