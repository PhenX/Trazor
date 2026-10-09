import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import { BinnedProfile, bestKnot, binOf, OFFSET_STEPS, solveSmall, tau } from '../../src/fill/knots'
import type { FillModel } from '../../src/fill/model'
import { colorsIn, samplesOf } from '../../src/fill/samples'
import { fitMidStops, fitPiecewise, repartition, StopProblem } from '../../src/fill/stops'

/** `n` samples of a three-stop profile with a kink at `kink`, plus noise, and weights. */
function problem(
  n: number,
  kink: number,
  noise: number,
  rand: () => number,
): { t: Float64Array; c: Float64Array; w: Float64Array } {
  const a = [0.1, 0.8, 0.3]
  const m = [0.9, 0.2, 0.4]
  const b = [0.2, 0.3, 0.95]
  const t = new Float64Array(n)
  const c = new Float64Array(3 * n)
  const w = new Float64Array(n)
  for (let i = 0; i < n; i++) {
    const ti = rand()
    const [p, q, u] = ti < kink ? [a, m, ti / kink] : [m, b, (ti - kink) / (1 - kink)]
    for (let k = 0; k < 3; k++) c[3 * i + k] = p[k] + (q[k] - p[k]) * u + noise * (rand() - 0.5)
    t[i] = ti
    w[i] = 0.3 + 0.7 * rand()
  }
  return { t, c, w }
}

/** Weighted sum of squared residuals of the per-sample weighted least-squares fit through `knots`. */
function sseDirect(
  t: Float64Array,
  c: Float64Array,
  w: Float64Array,
  knots: number[],
): { sse: number; x: number[][] } {
  const { x } = fitPiecewise(c, t, knots, w, Infinity, 0)!
  const nodes = [0, ...knots, 1]
  let sse = 0
  for (let i = 0; i < t.length; i++) {
    let j = 0
    while (j < nodes.length && nodes[j] < t[i]) j++
    j = Math.min(Math.max(j, 1), nodes.length - 1)
    const u = Math.min(Math.max((t[i] - nodes[j - 1]) / (nodes[j] - nodes[j - 1]), 0), 1)
    for (let k = 0; k < 3; k++) {
      const d = c[3 * i + k] - (x[j - 1][k] + (x[j][k] - x[j - 1][k]) * u)
      sse += w[i] * d * d
    }
  }
  return { sse, x }
}

describe('the piecewise profile', () => {
  it('fits a piecewise-linear profile exactly', () => {
    const t = Float64Array.from({ length: 11 }, (_, i) => i / 10)
    const cols = Float64Array.from(Array.from(t).flatMap((x) => [x, x * 0.5, 1 - x]))
    const fit = fitPiecewise(cols, t, [0.5], new Float64Array(11).fill(1), 1, 1)!
    expect(fit.objective).toBeLessThan(1e-6)
    expect(fit.x.length).toBe(3)
    expect(fit.x[0][0]).toBeCloseTo(0, 4)
    expect(fit.x[1][0]).toBeCloseTo(0.5, 4)
    expect(fit.x[2][0]).toBeCloseTo(1, 4)
  })

  it('prices a grid knot set from binned moments like the per-sample fit', () => {
    const rand = mulberry32(9)
    for (let n = 0; n < 30; n++) {
      const { t, c, w } = problem(200 + 97 * n, 0.2 + 0.02 * n, 0.05, rand)
      const prof = new BinnedProfile(t, c, w)
      const j1 = 150 + 20 * n
      for (const set of [[j1], [j1 - 90, j1]]) {
        const fit = prof.solve([0, ...set, OFFSET_STEPS + 1])!
        const ref = sseDirect(t, c, w, set.map(tau))
        expect(Math.abs(fit.sse - ref.sse)).toBeLessThanOrEqual(1e-7 * Math.max(ref.sse, 1e-6))
        fit.x.forEach((p, i) =>
          p.forEach((v, k) => expect(Math.abs(v - ref.x[i][k])).toBeLessThan(1e-8)),
        )
      }
    }
  })

  it('scans for the global minimum over the grid', () => {
    const rand = mulberry32(21)
    for (let n = 0; n < 6; n++) {
      const { t, c, w } = problem(600, 0.3 + 0.07 * n, 0.2, rand)
      const j = new BinnedProfile(t, c, w).scan([], 60, 940)!.j
      let brute = Infinity
      for (let jj = 60; jj <= 940; jj++) brute = Math.min(brute, sseDirect(t, c, w, [tau(jj)]).sse)
      expect(sseDirect(t, c, w, [tau(j)]).sse).toBeLessThanOrEqual(brute * (1 + 1e-9))
    }
  })

  it('finds a clean kink on the offset grid', () => {
    const { t, c } = problem(3000, 0.37, 0, mulberry32(4))
    const w = new Float64Array(t.length).fill(1)
    expect(bestKnot(t, c, w, 3 / 255, [], 50, 950)).toBe(370)
    expect(bestKnot(t, c, w, 3 / 255, [370], 50, 950)).not.toBeNull()
  })

  it('resists a sliver of outliers by reweighting', () => {
    const rand = mulberry32(77)
    const { t, c } = problem(2000, 0.5, 0.01, rand)
    for (let i = 0; i < 200; i++) {
      t[i] = 0.88 + 0.04 * rand()
      c.set([0, 1, 0], 3 * i)
    }
    const w = new Float64Array(t.length).fill(1)
    const delta = 0.02
    const j = bestKnot(t, c, w, delta, [], 50, 950)!
    const jLs = new BinnedProfile(t, c, w).scan([], 50, 950)!.j
    expect(Math.abs(j - 500)).toBeLessThanOrEqual(3)
    const huber = (jj: number): number => fitPiecewise(c, t, [tau(jj)], w, delta, 2)!.objective
    expect(huber(j)).toBeLessThanOrEqual(huber(jLs) + 1e-12)
  })

  it('bins coordinates and maps grid positions to offsets', () => {
    expect(binOf(0)).toBe(0)
    expect(binOf(0.0015)).toBe(1)
    expect(binOf(1)).toBe(OFFSET_STEPS)
    expect(binOf(-0.2)).toBe(0)
    expect(binOf(Number.NaN)).toBe(0)
    expect(tau(OFFSET_STEPS + 1)).toBe(1)
    expect(tau(250)).toBe(0.25)
  })

  it('solves small systems for three right-hand sides and refuses singular ones', () => {
    const x = solveSmall(
      [
        [2, 1],
        [1, 3],
      ],
      [
        [1, 0, 2],
        [2, 1, 1],
      ],
      2,
    )!
    for (let k = 0; k < 3; k++) {
      expect(2 * x[0][k] + x[1][k]).toBeCloseTo([1, 0, 2][k], 12)
      expect(x[0][k] + 3 * x[1][k]).toBeCloseTo([2, 1, 1][k], 12)
    }
    expect(
      solveSmall(
        [
          [1, 2],
          [2, 4],
        ],
        [
          [1, 1, 1],
          [1, 1, 1],
        ],
        2,
      ),
    ).toBeNull()
  })
})

/** A clamped profile along a linear axis: flat to 0.55, then two ramps meeting at 0.85. */
function twoBends(): { model: FillModel; s: ReturnType<typeof samplesOf> } {
  const w = 200
  const h = 6
  const profile = (t: number): number =>
    0.8 - Math.min(Math.max(t - 0.55, 0), 0.3) * 0.8 - Math.max(t - 0.85, 0) * 3
  const px: number[] = []
  const xs: number[] = []
  const ys: number[] = []
  const c: number[] = []
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = profile(x / (w - 1))
      px.push(y * w + x)
      xs.push(x)
      ys.push(y)
      c.push(v, 0.5 * v, 0.3)
    }
  }
  const model: FillModel = {
    kind: 'linear',
    p0: [0, 0],
    p1: [w - 1, 0],
    c0: [0.8, 0.4, 0.3],
    c1: [0.11, 0.055, 0.3],
    interp: 'srgb',
    mids: [],
  }
  return { model, s: samplesOf(px, xs, ys, c) }
}

describe('interior stops', () => {
  it('re-places a stop left on the rim onto the core end', () => {
    const { model, s } = twoBends()
    const p = StopProblem.of(model, s, colorsIn(s, 'srgb'), 'srgb')!
    const knots = [0.7, 0.85]
    repartition(p, knots)
    expect(Math.abs(knots[0] - 0.55)).toBeLessThan(0.02)
    expect(Math.abs(knots[1] - 0.85)).toBeLessThan(0.02)
    // Two knots closer than 5 % of the span are never made.
    const close = [0.84, 0.85]
    repartition(p, close)
    expect(close[1] - close[0]).toBeGreaterThanOrEqual(0.05 * p.span)
  })

  it('recovers both bends of a two-bend profile as interior stops', () => {
    const { model, s } = twoBends()
    const variants = fitMidStops(model, s, colorsIn(s, 'srgb'), 'srgb')
    expect(variants.length).toBe(2)
    const two = variants[1]
    if (two.kind === 'flat') throw new Error('flat')
    expect(two.mids.map((m) => m.offset)).toEqual([
      expect.closeTo(0.55, 1),
      expect.closeTo(0.85, 1),
    ])
    for (const m of two.mids) expect(Math.round(m.offset * 1000)).toBeCloseTo(m.offset * 1000, 9)
  })

  it('places no stop with too few samples', () => {
    const s = samplesOf([0, 1, 2], [0, 1, 2], [0, 0, 0], [0, 0, 0, 0.5, 0.5, 0.5, 1, 1, 1])
    const model: FillModel = {
      kind: 'linear',
      p0: [0, 0],
      p1: [2, 0],
      c0: [0, 0, 0],
      c1: [1, 1, 1],
      interp: 'srgb',
      mids: [],
    }
    expect(fitMidStops(model, s, colorsIn(s, 'srgb'), 'srgb')).toEqual([])
  })
})
