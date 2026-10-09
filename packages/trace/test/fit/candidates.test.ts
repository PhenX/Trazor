import { describe, expect, it } from 'vitest'
import {
  Abandon,
  bestCubicBounded,
  bowPenalty,
  ellipseSampsonChi2,
  endBreakCost,
  lineCostTerms,
  overTurnParams,
  overTurnParamsOf,
  tryArc,
  tryEllipse,
} from '../../src/fit/candidates'
import { CirclePrefix } from '../../src/fit/circle'
import { STANDARD_COST_MODEL, withCostModel, withWrittenArcs } from '../../src/fit/cost'
import { bestCubic, cubicFromArms, rawMomentsDirect, wobblePenalty } from '../../src/fit/cubicfit'
import type { Vec } from '../../src/fit/curves'
import { arcLengths } from '../../src/fit/objective'
import type { Tangents } from '../../src/fit/tangents'
import { dir, flat, lcg, near } from './fit-helpers'

const cfg = (lambda: number) => ({ tau: 2, lambda })

/** Tangents set by hand, the same direction in and out at every point. */
function sameTangents(dirs: Vec[]): Tangents {
  return { incoming: dirs, outgoing: dirs.map((d) => ({ x: d.x, y: d.y })) }
}

/** `count` points of a left-turning arc of radius `r` from `(0, 0)` heading +x, sweeping `sweep` degrees. */
function arcPoints(r: number, sweep: number, count: number): Float64Array {
  const out: [number, number][] = [[0, 0]]
  for (let k = 1; k <= count; k++) {
    const th = (((sweep * k) / count) * Math.PI) / 180
    out.push([r * Math.sin(th), r - r * Math.cos(th)])
  }
  return flat(out)
}

describe('bowPenalty', () => {
  it('charges one bit per point only when an arc fits four times better', () => {
    expect(bowPenalty(10, 1, 5)).toBe(5 * Math.LN2)
    expect(bowPenalty(4, 1, 5)).toBe(0)
    expect(bowPenalty(4.0000001, 1, 7)).toBe(7 * Math.LN2)
    expect(bowPenalty(0, 0, 3)).toBe(0)
  })
})

describe('endBreakCost and lineCostTerms', () => {
  const pts = flat(Array.from({ length: 9 }, (_, k): [number, number] => [k, 0]))
  const dirs = Array.from({ length: 9 }, () => dir(0))
  dirs[2] = dir(5)
  const tan: Tangents = { incoming: dirs.map(() => dir(0)), outgoing: dirs }
  tan.incoming[6] = dir(-10)

  it('charges breaks only at joins', () => {
    const lambda = 1.7
    const chord = { x: 1, y: 0 }
    // The open polyline's own ends are not joins; an opened loop's are.
    expect(endBreakCost(tan, 9, 0, 8, chord, chord, lambda, false)).toBe(0)
    expect(endBreakCost(tan, 9, 2, 5, chord, chord, lambda, false)).toBeCloseTo(0.25 * lambda, 9)
    expect(endBreakCost(tan, 9, 3, 6, chord, chord, lambda, false)).toBeCloseTo(lambda, 9)
    expect(endBreakCost(tan, 9, 2, 6, chord, chord, lambda, false)).toBeCloseTo(1.25 * lambda, 9)
    tan.outgoing[0] = dir(10)
    expect(endBreakCost(tan, 9, 0, 8, chord, chord, lambda, false)).toBe(0)
    expect(endBreakCost(tan, 9, 0, 8, chord, chord, lambda, true)).toBeCloseTo(lambda, 9)
    tan.outgoing[0] = dir(0)
  })

  it('prices an exact line at two parameters plus its breaks', () => {
    const c = cfg(1.7)
    expect(lineCostTerms(pts, tan, 0, 8, 0, c, false)).toBeCloseTo(3.4, 12)
    expect(lineCostTerms(pts, tan, 2, 5, 0, c, false)).toBeCloseTo(2.25 * 1.7, 9)
    expect(lineCostTerms(pts, tan, 0, 8, 4, c, false)).toBeCloseTo(2 + 3.4, 12)
  })
})

describe('tryArc', () => {
  it('prices an exact circular arc at its five parameters, its own tangents agreeing', () => {
    const pts = arcPoints(6, 60, 8)
    const sigma = new Float64Array(9).fill(0.05)
    const tan = sameTangents(Array.from({ length: 9 }, (_, k) => dir((60 * k) / 8)))
    const lambda = 1.7
    const a = tryArc(pts, tan, new CirclePrefix(pts, sigma), 0, 8, cfg(lambda), true)
    expect(a).not.toBeNull()
    if (!a) return
    expect(near(a.cost, 5 * lambda, 1e-6)).toBe(true)
    expect(a.radius).toBeCloseTo(6, 9)
    expect(a.sweep).toBe(true)
    expect(a.largeArc).toBe(false)
    expect(a.chi2).toBeLessThan(1e-9)
  })

  it('charges the breaks against the estimated tangents at joins', () => {
    const pts = arcPoints(6, 60, 8)
    const sigma = new Float64Array(9).fill(0.05)
    const tan = sameTangents(Array.from({ length: 9 }, () => dir(0)))
    const open = tryArc(pts, tan, new CirclePrefix(pts, sigma), 0, 8, cfg(2), false)
    const joined = tryArc(pts, tan, new CirclePrefix(pts, sigma), 0, 8, cfg(2), true)
    expect(open && joined).toBeTruthy()
    if (!open || !joined) return
    // The arc arrives at 60°, a full corner against the flat tangent there.
    expect(joined.cost - open.cost).toBeCloseTo(2, 6)
  })

  it('refuses spans without an interior point, straight runs and over-long sweeps', () => {
    const line = flat(Array.from({ length: 10 }, (_, k): [number, number] => [k, 0.5 * k]))
    const sigma = new Float64Array(10).fill(0.1)
    const tan = sameTangents(Array.from({ length: 10 }, () => dir(0)))
    const pre = new CirclePrefix(line, sigma)
    expect(tryArc(line, tan, pre, 0, 1, cfg(2), false)).toBeNull()
    expect(tryArc(line, tan, pre, 0, 9, cfg(2), false)).toBeNull()
    const half = arcPoints(5, 170, 17)
    const s2 = new Float64Array(18).fill(0.05)
    const t2 = sameTangents(Array.from({ length: 18 }, () => dir(0)))
    expect(tryArc(half, t2, new CirclePrefix(half, s2), 0, 17, cfg(2), false)).toBeNull()
    expect(tryArc(half, t2, new CirclePrefix(half, s2), 0, 10, cfg(2), false)).not.toBeNull()
  })
})

/** `n + 1` points on the ellipse `(cx + rx cos t, cy + ry sin t)` rotated `rot`, `t` from `t0` to `t1`. */
function ellipsePoints(rx: number, ry: number, rot: number, t0: number, t1: number, n: number) {
  const out: [number, number][] = []
  const c = Math.cos(rot)
  const s = Math.sin(rot)
  for (let k = 0; k <= n; k++) {
    const t = t0 + ((t1 - t0) * k) / n
    const x = rx * Math.cos(t)
    const y = ry * Math.sin(t)
    out.push([10 + c * x - s * y, 5 + s * x + c * y])
  }
  return flat(out)
}

describe('tryEllipse', () => {
  const tanFor = (n: number) => sameTangents(Array.from({ length: n }, () => dir(0)))

  it('recovers an exact elliptical arc as drawn', () => {
    const pts = ellipsePoints(30, 12, 0.3, -0.2, 1.6, 48)
    const sigma = new Float64Array(49).fill(0.02)
    const e = tryEllipse(pts, sigma, tanFor(49), 0, 48, cfg(3), false)
    expect(e).not.toBeNull()
    if (!e) return
    expect(e.rx).toBeCloseTo(30, 4)
    expect(e.ry).toBeCloseTo(12, 4)
    expect(Math.cos(2 * (e.phi - 0.3))).toBeCloseTo(1, 6)
    expect(e.sweep).toBe(true)
    expect(e.largeArc).toBe(false)
    // An exact arc costs its seven parameters and nothing else (open ends).
    expect(near(e.cost, 7 * 3, 1e-6)).toBe(true)
  })

  it('is tried only on spans of at least 24 steps whose length is a multiple of 16', () => {
    const pts = ellipsePoints(30, 12, 0, 0, 1.9, 60)
    const sigma = new Float64Array(61).fill(0.02)
    const tan = tanFor(61)
    expect(tryEllipse(pts, sigma, tan, 0, 16, cfg(3), false)).toBeNull()
    expect(tryEllipse(pts, sigma, tan, 0, 47, cfg(3), false)).toBeNull()
    expect(tryEllipse(pts, sigma, tan, 0, 32, cfg(3), false)).not.toBeNull()
    expect(tryEllipse(pts, sigma, tan, 12, 60, cfg(3), false)).not.toBeNull()
  })

  it('refuses a straight run and a sweep past the arc limit', () => {
    const line = flat(Array.from({ length: 33 }, (_, k): [number, number] => [k, 0.5 * k]))
    expect(tryEllipse(line, new Float64Array(33).fill(0.1), tanFor(33), 0, 32, cfg(3), false)).toBe(
      null,
    )
    const long = ellipsePoints(30, 12, 0, 0, 3, 48)
    const sigma = new Float64Array(49).fill(0.02)
    expect(tryEllipse(long, sigma, tanFor(49), 0, 48, cfg(3), false)).toBeNull()
  })
})

describe('ellipseSampsonChi2', () => {
  it('is zero on the curve and the squared distance in σ off a circle', () => {
    const on = ellipsePoints(8, 5, 0.4, 0, 6, 30)
    const sigma = new Float64Array(31).fill(0.1)
    expect(ellipseSampsonChi2(on, sigma, 10, 5, 8, 5, 0.4)).toBeLessThan(1e-18)
    // A point 0.1 px outside a circle of radius 10 at σ = 0.05: (0.1/0.05)² ≈ 4.
    const off = flat([[10.1, 0]])
    expect(ellipseSampsonChi2(off, [0.05], 0, 0, 10, 10, 0)).toBeCloseTo(4, 1)
    expect(ellipseSampsonChi2(flat([[0, 0]]), [1], 0, 0, 3, 2, 0)).toBe(Infinity)
  })
})

describe('overTurnParams', () => {
  it('charges nothing at the standard prices, one cubic past 90° under written arcs', () => {
    expect(overTurnParams(dir(0), dir(170))).toBe(0)
    withCostModel(withWrittenArcs(STANDARD_COST_MODEL), () => {
      expect(overTurnParams(dir(0), dir(80))).toBe(0)
      expect(overTurnParams(dir(0), dir(100))).toBe(6)
      // Control points with a collapsed arm read the chord through the next one.
      const b = { x0: 0, y0: 0, x1: 0, y1: 0, x2: 10, y2: 10, x3: 0, y3: 10 }
      expect(overTurnParamsOf(b)).toBe(6)
    })
    expect(overTurnParams(dir(0), dir(100))).toBe(0)
  })
})

describe('Abandon', () => {
  it('drops only what is dead, clear of the gate and over the floor', () => {
    const ab = new Abandon().reset(10, 30, 12, 4, -Infinity)
    // dead at ½·acc ≥ 30 − 10 − 12 = 8.
    expect(ab.dead(15.9)).toBe(false)
    expect(ab.dead(16)).toBe(true)
    expect(ab.drops(16)).toBe(true)
    expect(ab.trigger).toBeLessThan(16)
    expect(ab.trigger).toBeGreaterThan(16 - 1e-6)
    const gated = new Abandon().reset(10, 30, 12, 20, -Infinity)
    expect(gated.drops(16)).toBe(false)
    expect(gated.drops(20)).toBe(true)
    const floored = new Abandon().reset(10, 30, 12, 0, 9)
    expect(floored.drops(18)).toBe(false)
    expect(floored.drops(18.01)).toBe(true)
    expect(Abandon.NONE.dead(1e300)).toBe(false)
    expect(Abandon.NONE.trigger).toBe(Infinity)
    const over = new Abandon().overOnly(3)
    expect(over.trigger).toBe(6)
    expect(over.drops(6)).toBe(false)
    expect(over.drops(6.1)).toBe(true)
  })
})

/** Random spans of noisy arcs, S-bends, corners and straight runs, as inkvec's bounded tests build them. */
function randomSpans(count: number) {
  const rnd = lcg(11)
  const out = []
  for (let c = 0; c < count; c++) {
    const n = 3 + Math.floor(rnd() * 90)
    const bend = 4 * rnd() - 2
    const wave = c % 3 === 0 ? 3 * rnd() : 0
    const noise = [0, 0.05, 0.4][c % 3]
    const pairs: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const u = k / (n - 1)
      const y = bend * 20 * u * (1 - u) + wave * Math.sin(u * 9) + noise * (rnd() - 0.5)
      pairs.push([40 * u, y])
    }
    const pts = flat(pairs)
    const sigma = Float64Array.from({ length: n }, () => 0.05 + 0.3 * rnd())
    const s = arcLengths(pts)
    const turn = (v: Vec, a: number): Vec => ({
      x: v.x * Math.cos(a) - v.y * Math.sin(a),
      y: v.x * Math.sin(a) + v.y * Math.cos(a),
    })
    const unit = (x: number, y: number): Vec => {
      const l = Math.hypot(x, y)
      return l < 1e-12 ? { x: 1, y: 0 } : { x: x / l, y: y / l }
    }
    const a0 = 0.5 * (rnd() - 0.5)
    const a1 = 0.5 * (rnd() - 0.5)
    const t0 = turn(unit(pts[2] - pts[0], pts[3] - pts[1]), a0)
    const t1 = turn(unit(pts[2 * n - 2] - pts[2 * n - 4], pts[2 * n - 1] - pts[2 * n - 3]), a1)
    out.push({ pts, sigma, s, i: 0, j: n - 1, t0, t1 })
  }
  return out
}

describe('bestCubicBounded', () => {
  it('is bestCubic where it matters, dead only where it cannot be offered', () => {
    let dead = 0
    let exactUnderBound = 0
    const failures: unknown[] = []
    for (const { pts, sigma, s, i, j, t0, t1 } of randomSpans(300)) {
      const raw = new Float64Array(3)
      rawMomentsDirect(pts, i, j, raw)
      const want = bestCubic(pts, sigma, s, i, j, t0, t1, raw, true)
      const free = bestCubicBounded(pts, sigma, s, i, j, t0, t1, raw, Abandon.NONE)
      // With no bound, the bounded scoring is bestCubic itself.
      expect(free).toEqual(
        want ? { kind: 'exact', chi2: want.chi2, d0: want.d0, d1: want.d1 } : { kind: 'untried' },
      )
      if (!want) continue
      const lambda = 3
      const cubicFloor = 6 * lambda
      const chord = Math.hypot(pts[2 * j] - pts[2 * i], pts[2 * j + 1] - pts[2 * i + 1])
      const b = cubicFromArms(
        pts[0],
        pts[1],
        pts[2 * j],
        pts[2 * j + 1],
        t0,
        t1,
        chord,
        want.d0,
        want.d1,
      )
      const wobble = wobblePenalty(b, lambda)
      for (const base of [0, 17.25, 4e5]) {
        const cost = base + 0.5 * want.chi2 + cubicFloor + wobble
        for (const best of [cost * 0.5, cost - 1e-9, cost, cost + 1e-9, cost * 1.5 + 1]) {
          for (const gate of [0, 2 * (lambda + 1e-9 * (Math.abs(best) + lambda))]) {
            for (const overFloor of [-Infinity, 0.25 * want.chi2, 0.5 * want.chi2, 2 * want.chi2]) {
              const ab = new Abandon().reset(base, best, cubicFloor, gate, overFloor)
              const got = bestCubicBounded(pts, sigma, s, i, j, t0, t1, raw, ab)
              // Whatever it calls exact is bestCubic's answer bit for bit; whatever it
              // calls dead costs at least the bound, clears the ellipse gate, and has an
              // exact "over" answer.
              const sound =
                got.kind === 'exact'
                  ? got.chi2 === want.chi2 && got.d0 === want.d0 && got.d1 === want.d1
                  : got.kind === 'dead' &&
                    cost >= best &&
                    want.chi2 >= gate &&
                    (overFloor === -Infinity || got.over === 0.5 * want.chi2 > overFloor)
              if (!sound) failures.push({ span: j, base, best, gate, overFloor, got })
              if (got.kind === 'exact') exactUnderBound++
              if (got.kind === 'dead') dead++
            }
          }
        }
      }
      // Only the cut-off's answer.
      for (const overFloor of [0.1, 0.5, 0.49999, 3].map((f) => f * want.chi2)) {
        const got = bestCubicBounded(
          pts,
          sigma,
          s,
          i,
          j,
          t0,
          t1,
          raw,
          new Abandon().overOnly(overFloor),
        )
        const over =
          got.kind === 'exact' ? 0.5 * got.chi2 > overFloor : got.kind === 'dead' && got.over
        expect(over).toBe(0.5 * want.chi2 > overFloor)
      }
    }
    expect(failures).toEqual([])
    expect(dead).toBeGreaterThan(500)
    expect(exactUnderBound).toBeGreaterThan(500)
  })
})
