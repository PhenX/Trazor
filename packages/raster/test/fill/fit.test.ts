import { describe, expect, it } from 'vitest'
import {
  colorAxis,
  fit1d,
  fitLinear,
  fitRadial,
  fitRadialElliptic,
  Resid1d,
} from '../../src/fill/fit'
import { colorAt, toSrgb } from '../../src/fill/model'
import type { Rgb } from '../../src/fill/model'
import { centroid, colorsIn, mean3 } from '../../src/fill/samples'
import type { Samples } from '../../src/fill/samples'
import { chi2TwoFlats } from '../../src/fill/select'
import { QUANT_HALF_STEP, rampSupport, visibleContrast } from '../../src/fill/score'

/**
 * Samples of the pixels of a `w × h` grid inside `member` (fitting frame: a
 * pixel's center at its indices), with an exact linear-light color field and its
 * single-precision sRGB encoding.
 */
function exactSamples(
  w: number,
  h: number,
  member: (x: number, y: number) => boolean,
  lin: (x: number, y: number) => number[],
): Samples {
  const px: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  const srgb: number[] = []
  const l: number[] = []
  for (let p = 0; p < w * h; p++) {
    const x = p % w
    const y = Math.floor(p / w)
    if (!member(x, y)) continue
    const c = lin(x, y)
    px.push(p)
    xs.push(x)
    ys.push(y)
    l.push(...c)
    srgb.push(...toSrgb(c))
  }
  return {
    n: px.length,
    px: Int32Array.from(px),
    x: Float64Array.from(xs),
    y: Float64Array.from(ys),
    srgb: Float32Array.from(srgb),
    lin: Float64Array.from(l),
    srgbWide: Float64Array.from(Float32Array.from(srgb)),
  }
}

const disc =
  (cx: number, cy: number, r: number) =>
  (x: number, y: number): boolean =>
    (x - cx) ** 2 + (y - cy) ** 2 <= r * r

const affine = (base: number[], slope: number[], t: number): number[] =>
  base.map((b, k) => b + slope[k] * t)

function close3(a: Rgb, b: readonly number[], tol: number): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(tol)
}

/** Difference of two axis directions in degrees, modulo 180. */
function axisDiffDeg(a: number, b: number): number {
  const d = (((((a - b) * 180) / Math.PI) % 180) + 180) % 180
  return Math.min(d, 180 - d)
}

describe('the residual machinery', () => {
  it('caches the 1-D least-squares residual', () => {
    const s = exactSamples(20, 20, disc(9.5, 9.5, 9), (x, y) => [
      0.1 + 0.02 * x,
      0.3 + 0.01 * y,
      0.5 + 0.001 * x * y,
    ])
    const idx = Int32Array.from({ length: s.n }, (_, i) => i)
    const cols = colorsIn(s, 'linearRgb')
    const rz = new Resid1d(s, idx, cols)
    const c = [4, 13]
    const rho = Float64Array.from({ length: s.n }, (_, i) =>
      Math.sqrt((s.x[i] - c[0]) ** 2 + (s.y[i] - c[1]) ** 2),
    )
    const want = fit1d(cols, rho, s.n).resid
    expect(want).toBeGreaterThan(1e-3)
    expect(Math.abs(rz.radial(c[0], c[1]) - want)).toBeLessThanOrEqual(1e-9 * want)
    // The elliptical frame at 40°, aspect 1.7.
    const a = (40 * Math.PI) / 180
    const sn = Math.sin(a)
    const cs = Math.cos(a)
    const ell = Float64Array.from({ length: s.n }, (_, i) => {
      const dx = s.x[i] - c[0]
      const dy = s.y[i] - c[1]
      const u = dx * cs + dy * sn
      const v = (-dx * sn + dy * cs) * 1.7
      return Math.sqrt(u * u + v * v)
    })
    const wantE = fit1d(cols, ell, s.n).resid
    expect(Math.abs(rz.elliptic(c[0], c[1], sn, cs, 1.7) - wantE)).toBeLessThanOrEqual(1e-9 * wantE)
    // An exact affine function of the distance leaves nothing.
    const e = exactSamples(20, 20, disc(9.5, 9.5, 9), (x, y) =>
      affine([0.1, 0.2, 0.3], [0.01, 0.02, -0.005], Math.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2)),
    )
    const rze = new Resid1d(
      e,
      Int32Array.from({ length: e.n }, (_, i) => i),
      colorsIn(e, 'linearRgb'),
    )
    expect(rze.radial(c[0], c[1])).toBeLessThan(1e-10)
    expect(rze.radial(c[0] + 1, c[1])).toBeGreaterThan(1e-6)
  })

  it('recovers an exact line', () => {
    const t = Float64Array.from({ length: 10 }, (_, i) => i * 0.7 - 1)
    const cols = Float64Array.from(
      Array.from(t).flatMap((v) => affine([0.2, 0.5, 0.9], [0.1, -0.05, 0], v)),
    )
    const { resid, a, g } = fit1d(cols, t, 10)
    expect(resid).toBeLessThan(1e-12)
    a.forEach((v, k) => expect(v).toBeCloseTo([0.2, 0.5, 0.9][k], 12))
    g.forEach((v, k) => expect(v).toBeCloseTo([0.1, -0.05, 0][k], 12))
  })

  it('finds unit principal color directions', () => {
    const dir = [1 / 3, 2 / 3, 2 / 3]
    const cols = Float64Array.from(
      Array.from({ length: 9 }, (_, i) => affine([0.1, 0.1, 0.1], dir, 0.05 * i)).flat(),
    )
    const v = colorAxis(cols, 9)!
    expect(Math.abs(Math.abs(v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]) - 1)).toBeLessThan(1e-9)
    const red = Float64Array.from(Array.from({ length: 9 }, (_, i) => [0.1 * i, 0.5, 0.5]).flat())
    const r = colorAxis(red, 9)!
    expect(Math.abs(Math.abs(r[0]) - 1)).toBeLessThan(1e-9)
    expect(colorAxis(new Float64Array(15).fill(0.3), 5)).toBeNull()
  })

  it('prices two flat colors like a brute-force split', () => {
    // Gray levels, 12 at 0.1, 6 at 0.45, 10 at 0.9: the best 2-split is {0.1, 0.45} | {0.9}.
    const levels = [...Array(12).fill(0.1), ...Array(6).fill(0.45), ...Array(10).fill(0.9)].map(
      Math.fround,
    )
    const sigma = 2 / 255
    const s = grayRow(levels)
    const sorted = [...levels].sort((a, b) => a - b)
    const sse = (g: number[]): number => {
      const m = g.reduce((a, b) => a + b, 0) / g.length
      return g.reduce((a, v) => a + (v - m) ** 2, 0)
    }
    let best = { e: Infinity, k: 0 }
    for (let k = 1; k < sorted.length; k++) {
      const e = sse(sorted.slice(0, k)) + sse(sorted.slice(k))
      if (e < best.e) best = { e, k }
    }
    const chi = (g: number[]): number => {
      const m = g.reduce((a, b) => a + b, 0) / g.length
      return g.reduce((a, v) => a + Math.max(Math.abs(v - m) - QUANT_HALF_STEP, 0) ** 2, 0)
    }
    const want = (3 * (chi(sorted.slice(0, best.k)) + chi(sorted.slice(best.k)))) / (sigma * sigma)
    expect(Math.abs(chi2TwoFlats(s, sigma) - want)).toBeLessThanOrEqual(1e-6 * want)
    // Exactly two levels leave nothing beyond the dead zone; one level cannot be split.
    expect(
      chi2TwoFlats(grayRow([...Array(7).fill(0.2), ...Array(9).fill(0.7)].map(Math.fround)), sigma),
    ).toBe(0)
    expect(chi2TwoFlats(grayRow(Array(8).fill(Math.fround(0.4))), sigma)).toBe(Infinity)
  })
})

/** Gray samples in a row. */
function grayRow(levels: number[]): Samples {
  const n = levels.length
  return {
    n,
    px: Int32Array.from({ length: n }, (_, i) => i),
    x: Float64Array.from({ length: n }, (_, i) => i),
    y: new Float64Array(n),
    srgb: Float32Array.from(levels.flatMap((v) => [v, v, v])),
    lin: new Float64Array(3 * n),
    srgbWide: Float64Array.from(levels.flatMap((v) => [v, v, v])),
  }
}

describe('the linear fitter', () => {
  for (const deg of [100, 60, 20]) {
    it(`recovers the axis, the end points and the stops at ${deg}°`, () => {
      const theta = (deg * Math.PI) / 180
      const dc = Math.cos(theta)
      const ds = Math.sin(theta)
      const field = (x: number, y: number): number[] =>
        affine([0.4, 0.45, 0.5], [0.02, 0.012, -0.018], (x - 20) * dc + (y - 21) * ds)
      const s = exactSamples(44, 44, disc(21.3, 20.6, 15), field)
      const m = fitLinear(s, colorsIn(s, 'linearRgb'), 'linearRgb')!
      expect(m.kind).toBe('linear')
      if (m.kind !== 'linear') return
      expect(m.interp).toBe('linearRgb')
      expect(m.mids).toEqual([])
      expect(axisDiffDeg(Math.atan2(m.p1[1] - m.p0[1], m.p1[0] - m.p0[0]), theta)).toBeLessThan(
        1e-3,
      )
      // End points: the extreme projections onto the true axis through the centroid.
      const [xc, yc] = centroid(s)
      let smin = Infinity
      let smax = -Infinity
      for (let i = 0; i < s.n; i++) {
        const t = (s.x[i] - xc) * dc + (s.y[i] - yc) * ds
        smin = Math.min(smin, t)
        smax = Math.max(smax, t)
      }
      const ends = [
        [xc + smin * dc, yc + smin * ds],
        [xc + smax * dc, yc + smax * ds],
      ]
      const [e0, e1] =
        Math.hypot(m.p0[0] - ends[0][0], m.p0[1] - ends[0][1]) < 1 ? ends : [ends[1], ends[0]]
      expect(Math.hypot(m.p0[0] - e0[0], m.p0[1] - e0[1])).toBeLessThan(1e-3)
      expect(Math.hypot(m.p1[0] - e1[0], m.p1[1] - e1[1])).toBeLessThan(1e-3)
      close3(m.c0, toSrgb(field(e0[0], e0[1])), 1e-4)
      close3(m.c1, toSrgb(field(e1[0], e1[1])), 1e-4)
      for (let i = 0; i < s.n; i += 7) {
        close3(colorAt(m, s.x[i], s.y[i]), Array.from(s.srgb.subarray(3 * i, 3 * i + 3)), 2e-4)
      }
    })
  }

  it('searches past a poor seed to the least-squares axis', () => {
    // A 50 × 30 region whose channels vary along different directions: the PCA seed is
    // more than 20° off the least-squares axis, inside the ±45° scan.
    const s = exactSamples(
      60,
      40,
      (x, y) => x >= 5 && x <= 54 && y >= 5 && y < 35,
      (x, y) => [0.1 + 0.01 * x, 0.2 + 0.01 * y, 0.5 + 0.004 * x - 0.01 * y],
    )
    const cols = colorsIn(s, 'linearRgb')
    const m = fitLinear(s, cols, 'linearRgb')!
    if (m.kind !== 'linear') throw new Error('not linear')
    const got = Math.atan2(m.p1[1] - m.p0[1], m.p1[0] - m.p0[0])
    const residAt = (th: number): number =>
      fit1d(
        cols,
        Float64Array.from({ length: s.n }, (_, i) => s.x[i] * Math.cos(th) + s.y[i] * Math.sin(th)),
        s.n,
      ).resid
    let best = { th: 0, r: Infinity }
    for (let k = 0; k < 1800; k++) {
      const th = (k * 0.1 * Math.PI) / 180
      const r = residAt(th)
      if (r < best.r) best = { th, r }
    }
    const from = best.th - (0.2 * Math.PI) / 180
    for (let k = 0; k < 800; k++) {
      const th = from + (k * 0.0005 * Math.PI) / 180
      const r = residAt(th)
      if (r < best.r) best = { th, r }
    }
    expect(axisDiffDeg(got, best.th)).toBeLessThan(0.01)
  })

  it('refuses collinear or tiny regions', () => {
    const line = exactSamples(
      40,
      3,
      (_, y) => y === 1,
      (x) => [x * 0.02, x * 0.02, x * 0.02],
    )
    expect(fitLinear(line, colorsIn(line, 'srgb'), 'srgb')).toBeNull()
    const tiny = exactSamples(
      3,
      3,
      () => true,
      (x) => [x * 0.2, x * 0.2, x * 0.2],
    )
    expect(fitLinear(tiny, colorsIn(tiny, 'srgb'), 'srgb')).toBeNull()
  })
})

describe('the radial fitters', () => {
  it('recover a circle’s center and stops', () => {
    const centre = [18.3, 23.6]
    const base = [0.9, 0.7, 0.2]
    const slope = [-0.02, -0.015, 0.01]
    const s = exactSamples(48, 48, disc(22, 22, 17), (x, y) =>
      affine(base, slope, Math.hypot(x - centre[0], y - centre[1])),
    )
    const m = fitRadial(s, colorsIn(s, 'linearRgb'), 'linearRgb', 48)!
    expect([m.aspect, m.angle, m.interp]).toEqual([1, 0, 'linearRgb'])
    expect(Math.hypot(m.c[0] - centre[0], m.c[1] - centre[1])).toBeLessThan(0.05)
    let far = 0
    for (let i = 0; i < s.n; i++) far = Math.max(far, Math.hypot(s.x[i] - m.c[0], s.y[i] - m.c[1]))
    expect(Math.abs(m.r - far)).toBeLessThan(1e-9)
    close3(m.c0, toSrgb(base), 2e-3)
    close3(m.c1, toSrgb(affine(base, slope, m.r)), 2e-3)
  })

  it('find a center outside the region', () => {
    const centre = [4, 20]
    const s = exactSamples(
      40,
      40,
      (x, y) => x >= 14 && x <= 30 && y >= 6 && y <= 34,
      (x, y) =>
        affine([0.1, 0.2, 0.3], [0.012, 0.01, 0.008], Math.hypot(x - centre[0], y - centre[1])),
    )
    const m = fitRadial(s, colorsIn(s, 'linearRgb'), 'linearRgb', 40)!
    expect(Math.hypot(m.c[0] - centre[0], m.c[1] - centre[1])).toBeLessThan(0.1)
  })

  it('recover an ellipse’s center, orientation and aspect, and keep a circle a circle', () => {
    const centre = [24.3, 26.1]
    const angle = (35 * Math.PI) / 180
    const aspect = 2.2
    const sn = Math.sin(angle)
    const cs = Math.cos(angle)
    const rho = (x: number, y: number): number => {
      const dx = x - centre[0]
      const dy = y - centre[1]
      return Math.hypot(dx * cs + dy * sn, (-dx * sn + dy * cs) * aspect)
    }
    const base = [0.8, 0.3, 0.1]
    const slope = [-0.01, 0.012, 0.015]
    const s = exactSamples(50, 50, disc(25, 25, 18), (x, y) => affine(base, slope, rho(x, y)))
    const cols = colorsIn(s, 'linearRgb')
    const circ = fitRadial(s, cols, 'linearRgb', 50)!
    const m = fitRadialElliptic(s, cols, 'linearRgb', circ)!
    expect(Math.hypot(m.c[0] - centre[0], m.c[1] - centre[1])).toBeLessThan(0.1)
    expect(Math.abs(m.aspect / aspect - 1)).toBeLessThan(0.01)
    expect(axisDiffDeg(m.angle, angle)).toBeLessThan(0.5)
    let far = 0
    for (let i = 0; i < s.n; i++) far = Math.max(far, rho(s.x[i], s.y[i]))
    expect(Math.abs(m.r / far - 1)).toBeLessThan(0.01)
    close3(m.c0, toSrgb(base), 3e-3)
    close3(m.c1, toSrgb(affine(base, slope, m.r)), 3e-3)
    const round = exactSamples(50, 50, disc(25, 25, 18), (x, y) =>
      affine(base, slope, Math.hypot(x - 24, y - 25.5)),
    )
    const rc = colorsIn(round, 'linearRgb')
    expect(
      fitRadialElliptic(round, rc, 'linearRgb', fitRadial(round, rc, 'linearRgb', 50)!),
    ).toBeNull()
    expect(fitRadialElliptic(s, cols, 'linearRgb', { kind: 'flat', color: [0, 0, 0] })).toBeNull()
  })
})

describe('contrast and support', () => {
  it('measure what a ramp draws and how much of the region it shades', () => {
    // Black to white across x = 0..10 in sRGB: range 1. Against mid-gray a sample is
    // shaded when |v − 0.5|·√3 > 0.25: x = 0..3 and 7..10, 8 of 11.
    const s = exactSamples(
      11,
      1,
      () => true,
      (x) => {
        const l = x / 10
        return [l, l, l].map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
      },
    )
    const ramp = {
      kind: 'linear',
      p0: [0, 0],
      p1: [10, 0],
      c0: [0, 0, 0],
      c1: [1, 1, 1],
      interp: 'srgb',
      mids: [],
    } as const
    const contrast = visibleContrast(ramp, s)
    expect(Math.abs(contrast - 1)).toBeLessThan(1e-6)
    expect(rampSupport(ramp, s, [0.5, 0.5, 0.5], contrast)).toBeCloseTo(8 / 11, 12)
    expect(visibleContrast({ kind: 'flat', color: [0.3, 0.3, 0.3] }, s)).toBe(0)
  })

  it('averages colors per channel', () => {
    expect(mean3(Float64Array.from([0, 1, 2, 2, 3, 4]), 2)).toEqual([1, 2, 3])
    expect(mean3(new Float64Array(0), 0)).toEqual([0, 0, 0])
  })
})
