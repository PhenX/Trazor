import { describe, expect, it } from 'vitest'
import { CirclePrefix, fitArcSpan } from '../../src/fit/circle'
import { arcCenter, arcFramePoint, arcEllipseCenter } from '../../src/fit/curves'
import { breakCost } from '../../src/fit/tangents'
import { circlePoints, dir, flat, lcg, near, run } from './fit-helpers'

/** A quarter circle of radius 12 about (5, 3) by the rational parametrization, with noise. */
function quarter(noise: number): Float64Array {
  const rnd = lcg(11)
  const pts = new Float64Array(34)
  for (let k = 0; k <= 16; k++) {
    const t = (k / 16) * 0.41421356237309503
    const d = 1 + t * t
    pts[2 * k] = (12 * (1 - t * t)) / d + 5 + noise * (rnd() - 0.5)
    pts[2 * k + 1] = (12 * 2 * t) / d + 3 + noise * (rnd() - 0.5)
  }
  return pts
}

/** `count` points of a left-turning arc of radius `r` leaving `start` at `dirDeg`, sweeping `sweepDeg`. */
function arcAfter(
  start: [number, number],
  dirDeg: number,
  r: number,
  sweepDeg: number,
  count: number,
): [number, number][] {
  const d = (dirDeg * Math.PI) / 180
  const cx = start[0] - r * Math.sin(d)
  const cy = start[1] + r * Math.cos(d)
  const out: [number, number][] = []
  for (let k = 1; k <= count; k++) {
    const th = d + (((sweepDeg * Math.PI) / 180) * k) / count
    out.push([cx + r * Math.sin(th), cy - r * Math.cos(th)])
  }
  return out
}

describe('CirclePrefix', () => {
  it('recovers a circle from noisy samples of a partial arc', () => {
    const rnd = lcg(3)
    const pts = flat(
      circlePoints(90, 40, -12, 25)
        .slice(0, 40)
        .map(([x, y]) => [x + 0.05 * (rnd() - 0.5), y + 0.05 * (rnd() - 0.5)] as [number, number]),
    )
    const pre = new CirclePrefix(pts, new Float64Array(40).fill(0.05))
    const fit = pre.fit(0, 39)
    expect(fit).not.toBeNull()
    const f = fit as NonNullable<typeof fit>
    expect(Math.hypot(f.cx - 40, f.cy + 12)).toBeLessThan(0.05)
    expect(Math.abs(f.r - 25)).toBeLessThan(0.05)
    // The fit's χ² is its residual about itself.
    expect(near(pre.residualAbout(0, 39, f.cx, f.cy, f.r), f.chi2, 1e-6)).toBe(true)
    // Sub-spans are O(1) differences.
    expect(pre.fit(10, 30)).not.toBeNull()
  })

  it('scores exact points on a circle at zero and refuses a degenerate radius', () => {
    const pts = flat(circlePoints(12, 3, 4, 7))
    const pre = new CirclePrefix(pts, new Float64Array(12).fill(0.1))
    // Zero up to the cancellation in the moment sums.
    expect(pre.residualAbout(0, 11, 3, 4, 7)).toBeLessThan(1e-8)
    // One pixel off radially, σ = 0.1: the algebraic residual (49 − 36)²/4·36 per point.
    expect(pre.residualAbout(0, 11, 3, 4, 6)).toBeCloseTo(12 * 100 * (13 / 12) ** 2, 6)
    expect(pre.residualAbout(0, 11, 3, 4, 0)).toBe(Infinity)
    // Coincident points cannot pin a circle.
    const same = new CirclePrefix(
      flat([
        [2, 3],
        [2, 3],
        [2, 3],
      ]),
      [0.1, 0.1, 0.1],
    )
    expect(same.fit(0, 2)).toBeNull()
  })

  it("measures a span's size from its spread, floored at one", () => {
    const pts = flat(run([0, 0], [30, 0], 30))
    const pre = new CirclePrefix(pts, new Float64Array(31).fill(1))
    expect(pre.scale(0, 30)).toBeCloseTo(Math.sqrt((31 * 31 - 1) / 12), 9)
    expect(pre.scale(4, 4)).toBe(1)
  })

  it('gives the circle inkvec gives', () => {
    const pts = quarter(0.04)
    const pre = new CirclePrefix(pts, new Float64Array(17).fill(0.05))
    const f = pre.fit(0, 16) as NonNullable<ReturnType<CirclePrefix['fit']>>
    const want = [4.953108848411514, 2.980574229552096, 12.050113095568975, 0.7112763715283313]
    ;[f.cx, f.cy, f.r, f.chi2].forEach((v, k) => expect(near(v, want[k], 1e-9)).toBe(true))
  })
})

describe('fitArcSpan', () => {
  it('describes an exact quarter circle as the arc SVG draws through its ends', () => {
    const pts = quarter(0)
    const pre = new CirclePrefix(pts, new Float64Array(17).fill(0.05))
    const arc = fitArcSpan(pts, pre, 0, 16)
    expect(arc).not.toBeNull()
    const a = arc as NonNullable<typeof arc>
    expect(a.chi2).toBeLessThan(1e-8)
    expect(a.radius).toBeCloseTo(12, 9)
    expect(a.largeArc).toBe(false)
    // Counter-clockwise in the raw frame: increasing angle, SVG sweep-flag 1.
    expect(a.sweep).toBe(true)
    expect(a.t0.x).toBeCloseTo(0, 9)
    expect(a.t0.y).toBeCloseTo(1, 9)
    expect(a.t1.x).toBeCloseTo(-Math.SQRT1_2, 9)
    expect(a.t1.y).toBeCloseTo(Math.SQRT1_2, 9)
    const c = arcCenter(pts[0], pts[1], a.radius, a.largeArc, a.sweep, pts[32], pts[33])
    expect(Math.hypot(c.cx - 5, c.cy - 3)).toBeLessThan(1e-9)
  })

  it('runs the other way round with the sweep flag cleared', () => {
    const fwd = quarter(0)
    const rev = new Float64Array(34)
    for (let k = 0; k <= 16; k++) {
      rev[2 * k] = fwd[2 * (16 - k)]
      rev[2 * k + 1] = fwd[2 * (16 - k) + 1]
    }
    const pre = new CirclePrefix(rev, new Float64Array(17).fill(0.05))
    const a = fitArcSpan(rev, pre, 0, 16) as NonNullable<ReturnType<typeof fitArcSpan>>
    expect(a.sweep).toBe(false)
    const f = arcEllipseCenter(
      rev[0],
      rev[1],
      a.radius,
      a.radius,
      0,
      a.largeArc,
      a.sweep,
      rev[32],
      rev[33],
    )
    const mid = { x: 0, y: 0 }
    arcFramePoint(f, f.theta1 + f.delta / 2, mid)
    expect(Math.hypot(mid.x - 5, mid.y - 3)).toBeCloseTo(12, 9)
    expect(Math.hypot(mid.x - rev[16], mid.y - rev[17])).toBeLessThan(0.5)
  })

  it('prices an exact 60° arc at its parameters alone', () => {
    const pts = flat([[0, 0], ...arcAfter([0, 0], 0, 6, 60, 8)])
    const pre = new CirclePrefix(pts, new Float64Array(9).fill(0.05))
    const a = fitArcSpan(pts, pre, 0, 8) as NonNullable<ReturnType<typeof fitArcSpan>>
    const lambda = 1.7
    // The estimated tangents are the arc's own, so neither join is charged.
    const cost =
      0.5 * a.chi2 + lambda * 5 + breakCost(dir(0), a.t0, lambda) + breakCost(a.t1, dir(60), lambda)
    expect(cost).toBeCloseTo(5 * lambda, 6)
  })

  it('refuses a radius past a thousand spans, sweeps past 120°, reversals and spans without an interior point', () => {
    // A 4 px piece of a circle of radius 100 000: a straight run in disguise.
    const flatArc = flat(
      Array.from({ length: 5 }, (_, k): [number, number] => [k - 2, (k - 2) ** 2 / 2e5]),
    )
    const lpre = new CirclePrefix(flatArc, new Float64Array(5).fill(0.05))
    const circle = lpre.fit(0, 4)
    expect(circle === null || circle.r > 1e3 * lpre.scale(0, 4)).toBe(true)
    expect(fitArcSpan(flatArc, lpre, 0, 4)).toBeNull()
    const wide = flat([[0, 0], ...arcAfter([0, 0], 0, 10, 150, 20)])
    const wpre = new CirclePrefix(wide, new Float64Array(21).fill(0.05))
    expect(fitArcSpan(wide, wpre, 0, 20)).toBeNull()
    expect(fitArcSpan(wide, wpre, 0, 12)).not.toBeNull()
    // Out round a circle and back the way it came.
    const back = flat(
      [0, 10, 20, 30, 40, 50, 60, 50, 40, 30].map((deg): [number, number] => [
        10 * Math.cos((deg * Math.PI) / 180),
        10 * Math.sin((deg * Math.PI) / 180),
      ]),
    )
    const spre = new CirclePrefix(back, new Float64Array(10).fill(0.05))
    expect(fitArcSpan(back, spre, 0, 6)).not.toBeNull()
    expect(fitArcSpan(back, spre, 0, 9)).toBeNull()
    expect(fitArcSpan(wide, wpre, 3, 4)).toBeNull()
  })

  it('gives the arc inkvec gives', () => {
    const pts = quarter(0.04)
    const pre = new CirclePrefix(pts, new Float64Array(17).fill(0.05))
    const a = fitArcSpan(pts, pre, 0, 16) as NonNullable<ReturnType<typeof fitArcSpan>>
    const want = [
      1.058553875528225, 12.056634465612074, -0.0018973505264397476, 0.99999820002887,
      -0.7048032238978909, 0.7094028584543056,
    ]
    ;[a.chi2, a.radius, a.t0.x, a.t0.y, a.t1.x, a.t1.y].forEach((v, k) =>
      expect(near(v, want[k], 1e-9)).toBe(true),
    )
    expect(a.largeArc).toBe(false)
    expect(a.sweep).toBe(true)
  })
})
