import { describe, expect, it } from 'vitest'
import { Resid1d } from '../../src/fill/fit'
import {
  kaufmanSystem,
  profileGeometries,
  refineSpline,
  scoreAt,
  solveSmall4,
} from '../../src/fill/profile'
import type { Geom } from '../../src/fill/profile'
import { colorsIn, samplesOf } from '../../src/fill/samples'
import type { Samples } from '../../src/fill/samples'

/** Samples of a `w × w` grid (fitting frame) whose color is `f(x, y)`, where `inside`. */
function grid(
  w: number,
  inside: (x: number, y: number) => boolean,
  f: (x: number, y: number) => number[],
): Samples {
  const px: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  const c: number[] = []
  for (let p = 0; p < w * w; p++) {
    const x = p % w
    const y = Math.floor(p / w)
    if (!inside(x, y)) continue
    px.push(p)
    xs.push(x)
    ys.push(y)
    c.push(...f(x, y))
  }
  return samplesOf(px, xs, ys, c)
}

/** The ellipse's normalized radius about `centre`. */
function ellT(centre: number[], r: number, angle: number, aspect: number) {
  const sn = Math.sin(angle)
  const cs = Math.cos(angle)
  return (x: number, y: number): number => {
    const dx = x - centre[0]
    const dy = y - centre[1]
    return Math.hypot(dx * cs + dy * sn, (-dx * sn + dy * cs) * aspect) / r
  }
}

/** An artist's clamped radial: flat to t = 0.4, a ramp to the rim, inside the ellipse. */
function clamped(w: number, centre: number[], r: number, angle: number, aspect: number): Samples {
  const t = ellT(centre, r, angle, aspect)
  return grid(
    w,
    (x, y) => t(x, y) <= 1,
    (x, y) => {
      const k = Math.max((t(x, y) - 0.4) / 0.6, 0)
      return [0.85 - 0.5 * k, 0.6 - 0.3 * k, 0.3 + 0.2 * k]
    },
  )
}

const all = (s: Samples): Int32Array => Int32Array.from({ length: s.n }, (_, i) => i)
const free = (g: Geom): Geom => g

describe('the profile-aware radial search', () => {
  it("computes Kaufman's gradient as the score's gradient", () => {
    const s = clamped(40, [19.3, 21.7], 15, 0.4, 1.5)
    const rz = new Resid1d(s, all(s), colorsIn(s, 'srgb'))
    const g: Geom = [18.1, 22.9, 0.25, 0.3]
    scoreAt(rz, g)
    const dr = kaufmanSystem(rz, g, 4)!.b
    for (let q = 0; q < 4; q++) {
      const h = 1e-5
      const a = g.slice() as Geom
      const b = g.slice() as Geom
      a[q] += h
      b[q] -= h
      const fd = (scoreAt(rz, a) - scoreAt(rz, b)) / (2 * h)
      const an = -2 * dr[q]
      expect(Math.abs(fd - an)).toBeLessThanOrEqual(
        1e-3 * Math.max(Math.abs(fd), Math.abs(an)) + 1e-9,
      )
    }
  })

  it('centers a clamped circle from a wrong start', () => {
    const centre = [20.3, 17.6]
    const s = clamped(48, centre, 16, 0, 1)
    const rz = new Resid1d(s, all(s), colorsIn(s, 'srgb'))
    const start: Geom = [23, 21, 0, 0]
    const atStart = scoreAt(rz, start)
    const { g, score } = refineSpline(rz, start, 2, free)
    expect(Math.hypot(g[0] - centre[0], g[1] - centre[1])).toBeLessThan(0.1)
    expect(score).toBeLessThan(2e-3 * atStart)
    expect(score).toBeLessThanOrEqual(scoreAt(rz, [centre[0], centre[1], 0, 0]) * 1.0001)
    expect([g[2], g[3]]).toEqual([0, 0])
  })

  it('finds a clamped ellipse in all four coordinates', () => {
    const s = clamped(48, [24.4, 22.1], 18, 0.5, 1.6)
    const rz = new Resid1d(s, all(s), colorsIn(s, 'srgb'))
    const { g } = refineSpline(rz, [23.5, 23, 0.3, Math.log(1.4)], 4, free)
    expect(Math.hypot(g[0] - 24.4, g[1] - 22.1)).toBeLessThan(0.2)
    expect((Math.abs(g[2] - 0.5) * 180) / Math.PI).toBeLessThan(2)
    expect(Math.abs(Math.exp(g[3]) / 1.6 - 1)).toBeLessThan(0.03)
  })

  it('is never worse than its start and respects the clamp', () => {
    const s = clamped(32, [15.2, 16.8], 12, 0, 1)
    const rz = new Resid1d(s, all(s), colorsIn(s, 'srgb'))
    const boxed = (g: Geom): Geom => [
      Math.min(Math.max(g[0], 0), 12),
      Math.min(Math.max(g[1], 0), 12),
      g[2],
      g[3],
    ]
    const start: Geom = [6, 6, 0, 0]
    const atStart = scoreAt(rz, start)
    const { g, score } = refineSpline(rz, start, 2, boxed)
    expect(score).toBeLessThanOrEqual(atStart)
    expect(g[0] <= 12 && g[1] <= 12).toBe(true)
    // One sample: no spread in t, nothing to do.
    const one = samplesOf([0], [0], [0], [0.5, 0.5, 0.5])
    const r1 = new Resid1d(one, [0], colorsIn(one, 'srgb'))
    expect(refineSpline(r1, [3, 4, 0, 0], 2, free).g).toEqual([3, 4, 0, 0])
  })

  it('finds a clamped ellipse from the gradient-line seed, and nothing in too few samples', () => {
    const s = clamped(52, [25.3, 23.6], 20, 0.6, 1.5)
    const found = profileGeometries(s, colorsIn(s, 'srgb'), 52)
    expect(found.length).toBe(2)
    const e = found[1]
    expect(Math.hypot(e.c[0] - 25.3, e.c[1] - 23.6)).toBeLessThan(0.3)
    expect(Math.abs(e.aspect / 1.5 - 1)).toBeLessThan(0.05)
    expect((Math.abs(e.angle - 0.6) * 180) / Math.PI).toBeLessThan(3)
    const tiny = clamped(52, [25.3, 23.6], 1.5, 0, 1)
    expect(profileGeometries(tiny, colorsIn(tiny, 'srgb'), 52)).toEqual([])
  })

  it('never scores a spline above the line', () => {
    const s = grid(
      24,
      (x, y) => Math.hypot(x - 11.5, y - 11.5) <= 11,
      (x, y) => [0.1 + 0.02 * x, 0.3 + 0.01 * y, 0.5 + 0.001 * x * y],
    )
    const rz = new Resid1d(s, all(s), colorsIn(s, 'srgb'))
    for (const c of [
      [3, 4],
      [11.5, 11.5],
      [20, 7.5],
      [-6, 30],
    ]) {
      const line = rz.radial(c[0], c[1])
      const spline = scoreAt(rz, [c[0], c[1], 0, 0])
      expect(spline).toBeLessThanOrEqual(line + 1e-9)
      expect(spline).toBeGreaterThan(0)
    }
    const one = samplesOf([0], [1], [1], [0.2, 0.4, 0.6])
    expect(scoreAt(new Resid1d(one, [0], colorsIn(one, 'srgb')), [0, 0, 0, 0])).toBe(0)
  })

  it('centers a clamped circle by the spline score, not by the line', () => {
    // A flat core of radius 7 and a ramp to the rim, centered off the region's middle.
    const centre = [20.3, 17.6]
    const s = grid(
      48,
      (x, y) => Math.hypot(x - 23, y - 21) <= 16,
      (x, y) => {
        const k = Math.max(Math.hypot(x - centre[0], y - centre[1]) - 7, 0)
        return [0.85 - 0.03 * k, 0.6 - 0.02 * k, 0.3 + 0.01 * k]
      },
    )
    const cols = colorsIn(s, 'linearRgb')
    const c = profileGeometries(s, cols, 48)[0].c
    expect(Math.hypot(c[0] - centre[0], c[1] - centre[1])).toBeLessThan(0.5)
    const rz = new Resid1d(s, all(s), cols)
    const line = rz.radial(centre[0], centre[1])
    expect(scoreAt(rz, [centre[0], centre[1], 0, 0])).toBeLessThan(0.05 * line)
  })

  it('solves small systems and refuses singular ones', () => {
    const x = solveSmall4(
      [
        [4, 1, 0, 0],
        [1, 3, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
      ],
      [1, 2, 0, 0],
      2,
    )!
    expect(Math.abs(4 * x[0] + x[1] - 1)).toBeLessThan(1e-12)
    expect(Math.abs(x[0] + 3 * x[1] - 2)).toBeLessThan(1e-12)
    const singular = [
      [1, 2, 0, 0],
      [2, 4, 0, 0],
      [0, 0, 0, 0],
      [0, 0, 0, 0],
    ]
    expect(solveSmall4(singular, [1, 1, 0, 0], 2)).toBeNull()
  })
})
