import { describe, expect, it } from 'vitest'
import type { Vec } from '../../src/fit/curves'
import { evalCubic } from '../../src/fit/curves'
import {
  armsFromMoments,
  bendingEnergy,
  bestCubic,
  chi2Cubic,
  cubicDist2,
  cubicFromArms,
  CubicSamples,
  edgeTerms,
  fitCubicMoments,
  freeCubicFit,
  g1Frame,
  hasInflection,
  MAX_RESIDUAL_SAMPLES,
  polishArms,
  rawMomentsDirect,
  wobblePenalty,
} from '../../src/fit/cubicfit'
import type { Bezier } from '../../src/fit/curves'
import { arcLengths, PrefixSums } from '../../src/fit/objective'
import { dir, lcg, near } from './fit-helpers'

/** Points sampled on a cubic at `n + 1` uniform parameters. */
function sampleCubic(b: Bezier, n: number): Float64Array {
  const out = new Float64Array(2 * (n + 1))
  const p: Vec = { x: 0, y: 0 }
  for (let k = 0; k <= n; k++) {
    evalCubic(b, k / n, p)
    out[2 * k] = p.x
    out[2 * k + 1] = p.y
  }
  return out
}

/** The parabola span the pinned inkvec values were computed on (exact dyadic noise). */
function parabola(): { pts: Float64Array; sigma: Float64Array } {
  const rnd = lcg(7)
  const pts = new Float64Array(42)
  const sigma = new Float64Array(21)
  for (let k = 0; k < 21; k++) {
    const x = 0.5 * k
    pts[2 * k] = x
    pts[2 * k + 1] = 0.02 * x * x + 0.05 * (rnd() - 0.5)
    sigma[k] = 0.1 + 0.05 * (k % 3)
  }
  return { pts, sigma }
}

describe('Green moments', () => {
  it('sum to the signed area round a closed loop', () => {
    const sq = [0, 0, 4, 0, 4, 3, 0, 3, 0, 0]
    const e = new Float64Array(3)
    let area = 0
    for (let k = 0; k < 4; k++) {
      edgeTerms(sq[2 * k], sq[2 * k + 1], sq[2 * k + 2], sq[2 * k + 3], e)
      area += e[0]
    }
    // ∮ y dx = −A for a counter-clockwise loop in the raw frame.
    expect(area).toBe(-12)
    const raw = new Float64Array(3)
    rawMomentsDirect(Float64Array.from(sq), 0, 4, raw)
    expect(raw[0]).toBe(-12)
  })

  it('prefix differences equal the direct sums', () => {
    const rnd = lcg(2)
    const n = 40
    const pts = Float64Array.from({ length: 2 * n }, () => 200 * rnd() - 100)
    const pre = new PrefixSums(pts, new Float64Array(n).fill(0.2))
    const a = new Float64Array(3)
    const b = new Float64Array(3)
    for (const [i, j] of [
      [0, 39],
      [5, 6],
      [12, 30],
    ]) {
      pre.rawMoments(i, j, a)
      rawMomentsDirect(pts, i, j, b)
      for (let k = 0; k < 3; k++) expect(near(a[k], b[k], 1e-9)).toBe(true)
    }
  })
})

describe('Levien moment fit', () => {
  it('recovers a known cubic from its area and moment', () => {
    const b: Bezier = { x0: 10, y0: 20, x1: 40, y1: 60, x2: 90, y2: 70, x3: 120, y3: 30 }
    const pts = sampleCubic(b, 400)
    const l0 = Math.hypot(30, 40)
    const l1 = Math.hypot(30, -40)
    const cands = fitCubicMoments(pts, { x: 30 / l0, y: 40 / l0 }, { x: 30 / l1, y: -40 / l1 })
    expect(cands.length).toBeGreaterThan(0)
    const best = Math.min(
      ...cands.map((c) => Math.hypot(c.x1 - 40, c.y1 - 60) + Math.hypot(c.x2 - 90, c.y2 - 70)),
    )
    // 400 chords approximate the true area and moment to ~1e-5 relative.
    expect(best).toBeLessThan(0.05)
  })

  it('returns the arm pairs inkvec returns', () => {
    const cases: [number[], number[]][] = [
      [
        [0.4, -0.3, 0.12, 0.05],
        [
          1.8249375566520176, 0.8035489878243157, 0, 3.9006813088072616, 20.288929771325073,
          5.733405514996281,
        ],
      ],
      [
        [0.9, 0.7, 0.25, 0.08],
        [
          1.2923626993729314, 106.0397369838337, 0, 0.7836610603200947, 4.417983233087434,
          1.6800984904170908,
        ],
      ],
      [
        [-0.2, -0.5, -0.1, -0.03],
        [
          1.4719252925450481, 7.710453166203282, 0, 0.30838850706959875, 6.840490791670492,
          0.5949466087080528,
        ],
      ],
    ]
    for (const [[th0, th1, area, mx], want] of cases) {
      const got = armsFromMoments(th0, th1, area, mx)
      expect(got).toHaveLength(want.length)
      got.forEach((v, k) => expect(near(v, want[k], 1e-12)).toBe(true))
    }
  })

  it('takes the conventional third arms when the quartic vanishes', () => {
    expect(armsFromMoments(0, 0, 0, 0)).toEqual([1 / 3, 1 / 3])
  })

  it('has no frame for a zero-length chord', () => {
    expect(g1Frame(1, 1, 1, 1, dir(0), dir(0), [0, 0, 0])).toBeNull()
  })
})

describe('bestCubic', () => {
  it('recovers a known G1 cubic from noisy samples', () => {
    const t0 = dir(35)
    const t1 = dir(-40)
    const truth = cubicFromArms(0, 0, 30, 0, t0, t1, 30, 0.35, 0.3)
    const clean = sampleCubic(truth, 60)
    const rnd = lcg(13)
    const pts = clean.map((v) => v + 0.04 * (rnd() - 0.5))
    pts[0] = 0
    pts[1] = 0
    pts[120] = 30
    pts[121] = 0
    const sigma = new Float64Array(61).fill(0.05)
    const s = arcLengths(pts)
    const raw = new Float64Array(3)
    rawMomentsDirect(pts, 0, 60, raw)
    const fit = bestCubic(pts, sigma, s, 0, 60, t0, t1, raw, false)
    expect(fit).not.toBeNull()
    const f = fit as NonNullable<typeof fit>
    expect(f.d0).toBeCloseTo(0.35, 1)
    expect(f.d1).toBeCloseTo(0.3, 1)
    const polished = polishArms(pts, sigma, s, 0, 60, t0, t1, f.d0, f.d1)
    expect(polished.chi2).toBeLessThanOrEqual(f.chi2)
    expect(Math.abs(polished.d0 - 0.35)).toBeLessThan(0.01)
    expect(Math.abs(polished.d1 - 0.3)).toBeLessThan(0.01)
    // Uniform noise of ±0.02 px at σ = 0.05: about 0.053 per point, 59 interior points.
    expect(polished.chi2).toBeLessThan(59 * 0.2)
  })

  it('is the subsampled residual on short spans and refuses a zero chord', () => {
    const { pts, sigma } = parabola()
    const s = arcLengths(pts)
    const raw = new Float64Array(3)
    rawMomentsDirect(pts, 0, 20, raw)
    const t1 = { x: 0.928476690885259, y: 0.371390676354104 }
    const a = bestCubic(pts, sigma, s, 0, 20, dir(0), t1, raw, false)
    const b = bestCubic(pts, sigma, s, 0, 20, dir(0), t1, raw, true)
    expect(a).toEqual(b)
    const loop = Float64Array.from([0, 0, 1, 1, 2, 0, 0, 0])
    expect(
      bestCubic(loop, [1, 1, 1, 1], arcLengths(loop), 0, 3, dir(0), dir(0), [0, 0, 0], true),
    ).toBeNull()
  })

  it('gives the residual and arms inkvec gives', () => {
    const { pts, sigma } = parabola()
    const s = arcLengths(pts)
    const t0 = { x: 1, y: 0 }
    const t1 = { x: 0.928476690885259, y: 0.371390676354104 }
    const raw = new Float64Array(3)
    rawMomentsDirect(pts, 0, 20, raw)
    const f = bestCubic(pts, sigma, s, 0, 20, t0, t1, raw, false) as NonNullable<
      ReturnType<typeof bestCubic>
    >
    expect(near(f.chi2, 0.42282311288747354, 1e-9)).toBe(true)
    expect(near(f.d0, 0.2755823545799579, 1e-9)).toBe(true)
    expect(near(f.d1, 0.4316251449373667, 1e-9)).toBe(true)
    const p = polishArms(pts, sigma, s, 0, 20, t0, t1, f.d0, f.d1)
    expect(near(p.chi2, 0.20679636932695442, 1e-7)).toBe(true)
    expect(near(p.d0, 0.5561508612146784, 1e-6)).toBe(true)
    expect(near(p.d1, 0.013804097006551974, 1e-6)).toBe(true)
    // A span whose tangents point the wrong way keeps only a collapsed-arm root.
    const raw2 = new Float64Array(3)
    rawMomentsDirect(pts, 3, 17, raw2)
    const g = bestCubic(pts, sigma, s, 3, 17, t1, t0, raw2, true) as NonNullable<
      ReturnType<typeof bestCubic>
    >
    expect(near(g.chi2, 120.22393556032722, 1e-9)).toBe(true)
    expect(g.d0).toBe(0)
    expect(near(g.d1, 0.4923991295100275, 1e-9)).toBe(true)
  })
})

describe('residual', () => {
  it('projects a point onto the curve', () => {
    const b = cubicFromArms(0, 0, 10, 0, dir(0), dir(0), 10, 1 / 3, 1 / 3)
    // A straight cubic along x: the distance is the offset.
    expect(cubicDist2(b, 4, 2, 0.4)).toBeCloseTo(4, 12)
    expect(cubicDist2(b, -3, 4, 0)).toBeCloseTo(25, 12)
  })

  it('subsamples long spans to at most 32 points and stops at a bound', () => {
    const b = cubicFromArms(0, 0, 50, 0, dir(30), dir(-30), 50, 0.3, 0.3)
    const pts = sampleCubic(b, 100)
    const rnd = lcg(4)
    for (let k = 2; k < 200; k++) pts[k] += 0.1 * (rnd() - 0.5)
    const sigma = new Float64Array(101).fill(0.1)
    const s = arcLengths(pts)
    const plan = CubicSamples.of(pts, sigma, s, 0, 100) as CubicSamples
    expect(plan.len).toBe(MAX_RESIDUAL_SAMPLES)
    expect(plan.weight).toBeCloseTo(99 / 32, 15)
    const sub = chi2Cubic(pts, sigma, s, 0, 100, b, true)
    expect(plan.chi2(b, Infinity)).toBeCloseTo(sub, 12)
    expect(plan.chi2(b, 0.01)).toBeLessThan(sub)
    const full = chi2Cubic(pts, sigma, s, 0, 100, b, false)
    expect(Math.abs(sub - full) / full).toBeLessThan(0.3)
    expect(CubicSamples.of(pts, sigma, s, 4, 5)).toBeNull()
    expect(chi2Cubic(pts, sigma, s, 4, 5, b, true)).toBe(0)
  })
})

describe('freeCubicFit', () => {
  it('fits control points by least squares with the ends pinned', () => {
    const { pts, sigma } = parabola()
    const s = arcLengths(pts)
    const f = freeCubicFit(pts, sigma, s, 0, 20)
    expect(f).not.toBeNull()
    const c = f as NonNullable<typeof f>
    const want = [3.4191696407629664, 0.012113080639293826, 6.854747407062354, 0.6819545091048304]
    ;[c.x1, c.y1, c.x2, c.y2].forEach((v, k) => expect(near(v, want[k], 1e-9)).toBe(true))
    expect(freeCubicFit(pts, sigma, s, 0, 2)).toBeNull()
  })
})

describe('polishArms', () => {
  /** Points exactly on the G1 cubic from (0, 0) to (10, 0). */
  function known(arms: [number, number], a0: number, a1: number, samples: number) {
    const t0 = dir(a0)
    const t1 = dir(a1)
    const b = cubicFromArms(0, 0, 10, 0, t0, t1, 10, arms[0], arms[1])
    const pts = sampleCubic(b, samples)
    const sigma = new Float64Array(samples + 1).fill(0.05)
    const s = arcLengths(pts)
    const chi2 = (d0: number, d1: number) =>
      chi2Cubic(pts, sigma, s, 0, samples, cubicFromArms(0, 0, 10, 0, t0, t1, 10, d0, d1), false)
    const polish = (d0: number, d1: number) => polishArms(pts, sigma, s, 0, samples, t0, t1, d0, d1)
    return { chi2, polish }
  }

  it('recovers the arms of an exact cubic from a start near them', () => {
    for (const [arms, a0, a1, start] of [
      [[0.3, 0.45], 40, -35, [0.36, 0.4]],
      [[0.25, 0.2], 30, -60, [0.2, 0.28]],
      [[0.5, 0.3], 20, 10, [0.45, 0.36]],
    ] as [[number, number], number, number, [number, number]][]) {
      const k = known(arms, a0, a1, 24)
      expect(k.chi2(arms[0], arms[1])).toBeLessThan(1e-12)
      expect(k.chi2(start[0], start[1])).toBeGreaterThan(1)
      const p = k.polish(start[0], start[1])
      expect(Math.abs(p.d0 - arms[0])).toBeLessThanOrEqual(1e-5)
      expect(Math.abs(p.d1 - arms[1])).toBeLessThanOrEqual(1e-5)
      expect(p.chi2).toBeLessThan(1e-6)
      expect(p.chi2).toBe(k.chi2(p.d0, p.d1))
    }
  })

  it('keeps an optimum and clamps its start into the admissible box', () => {
    const k = known([0.3, 0.4], 45, -45, 20)
    const p = k.polish(0.3, 0.4)
    expect(Math.abs(p.d0 - 0.3)).toBeLessThanOrEqual(1e-9)
    expect(Math.abs(p.d1 - 0.4)).toBeLessThanOrEqual(1e-9)
    expect(p.chi2).toBeLessThan(1e-12)
    const q = k.polish(9, -3)
    expect(q.d0).toBeGreaterThanOrEqual(1e-3)
    expect(q.d0).toBeLessThanOrEqual(1.5)
    expect(q.d1).toBeGreaterThanOrEqual(1e-3)
    expect(q.d1).toBeLessThanOrEqual(1.5)
    expect(q.chi2).toBeLessThan(k.chi2(1.5, 1e-3))
    expect(q.chi2).toBe(k.chi2(q.d0, q.d1))
  })
})

describe('wobble', () => {
  it('a gentle arc pays nothing, an S-bend two parameters and more', () => {
    const arc = cubicFromArms(0, 0, 10, 0, dir(30), dir(-30), 10, 0.3, 0.3)
    expect(hasInflection(arc)).toBe(false)
    expect(bendingEnergy(arc)).toBeLessThan(2.5)
    expect(wobblePenalty(arc, 3)).toBe(0)
    const s = cubicFromArms(0, 0, 10, 0, dir(40), dir(40), 10, 0.4, 0.4)
    expect(hasInflection(s)).toBe(true)
    expect(wobblePenalty(s, 3)).toBeGreaterThanOrEqual(6)
    expect(bendingEnergy({ x0: 1, y0: 1, x1: 2, y1: 2, x2: 3, y2: 3, x3: 1, y3: 1 })).toBe(0)
  })
})
