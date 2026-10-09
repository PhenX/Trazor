import { describe, expect, it } from 'vitest'
import { arcToCenter } from '@trazor/core'
import type { FitSegment, Vec } from '../../src/fit/curves'
import {
  arcCenter,
  arcEllipseCenter,
  arcFramePoint,
  bernstein,
  chi2,
  circularArc,
  cubicSelfIntersects,
  cubicTangent,
  cubicTo,
  ellipticalArc,
  evalCubic,
  isCircular,
  lineTo,
  maxDeviation,
  nearestCubicDist2,
  nearestLineDist2,
  sampleRun,
  segmentArcFrame,
  segmentDistance,
} from '../../src/fit/curves'
import type { Bezier } from '../../src/fit/curves'
import { reversePath } from '../../src/fit/objective'
import { flat, lcg } from './fit-helpers'

const bez = (p: number[]): Bezier => ({
  x0: p[0],
  y0: p[1],
  x1: p[2],
  y1: p[3],
  x2: p[4],
  y2: p[5],
  x3: p[6],
  y3: p[7],
})

/** Wrap an angle difference into (−π, π]. */
function wrap(a: number): number {
  const t = (((a + Math.PI) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI)
  return t - Math.PI
}

describe('cubic evaluation', () => {
  it('Bernstein weights are a partition of unity and the curve hits its ends', () => {
    for (const t of [0, 0.1, 0.5, 0.77, 1]) {
      const b = bernstein(t)
      expect(b[0] + b[1] + b[2] + b[3]).toBeCloseTo(1, 15)
    }
    const c = bez([1, 2, 5, 9, 8, -3, 12, 4])
    const p: Vec = { x: 0, y: 0 }
    expect(evalCubic(c, 0, p)).toEqual({ x: 1, y: 2 })
    expect(evalCubic(c, 1, p)).toEqual({ x: 12, y: 4 })
  })

  it('the tangent is the derivative', () => {
    const c = bez([1, 2, 5, 9, 8, -3, 12, 4])
    const a: Vec = { x: 0, y: 0 }
    const b: Vec = { x: 0, y: 0 }
    const d: Vec = { x: 0, y: 0 }
    for (const t of [0.05, 0.4, 0.9]) {
      const h = 1e-6
      evalCubic(c, t + h, a)
      evalCubic(c, t - h, b)
      cubicTangent(c, t, d)
      expect(d.x).toBeCloseTo((a.x - b.x) / (2 * h), 5)
      expect(d.y).toBeCloseTo((a.y - b.y) / (2 * h), 5)
    }
    // 3·(p1 − p0) at the start.
    expect(cubicTangent(c, 0, d)).toEqual({ x: 12, y: 21 })
  })
})

describe('arc centre', () => {
  it('agrees with the SVG specification conversion', () => {
    const rnd = lcg(21)
    let compared = 0
    for (let c = 0; c < 400; c++) {
      const x0 = 40 * rnd() - 20
      const y0 = 40 * rnd() - 20
      const x1 = 40 * rnd() - 20
      const y1 = 40 * rnd() - 20
      const rx = 30 * rnd() + 0.5
      const ry = rnd() < 0.5 ? rx : 30 * rnd() + 0.5
      const rotation = rnd() < 0.5 ? 0 : Math.round(360 * rnd())
      const largeArc = rnd() < 0.5
      const sweep = rnd() < 0.5
      const seg = ellipticalArc(rx, ry, (rotation * Math.PI) / 180, largeArc, sweep, x1, y1)
      const spec = arcToCenter(x0, y0, seg as Extract<FitSegment, { type: 'A' }>)
      const f = segmentArcFrame(x0, y0, seg as Extract<FitSegment, { type: 'A' }>)
      expect(spec).not.toBeNull()
      if (!spec) continue
      // Away from the chord-is-a-diameter case, where the centre is ill-conditioned.
      if (Math.abs(Math.abs(spec.dTheta) - Math.PI) < 1e-3) continue
      compared++
      expect(f.cx).toBeCloseTo(spec.cx, 8)
      expect(f.cy).toBeCloseTo(spec.cy, 8)
      expect(f.rx).toBeCloseTo(spec.rx, 9)
      expect(f.ry).toBeCloseTo(spec.ry, 9)
      expect(wrap(f.theta1 - spec.theta1)).toBeCloseTo(0, 9)
      expect(f.delta).toBeCloseTo(spec.dTheta, 9)
      // The frame passes through both endpoints.
      const p: Vec = { x: 0, y: 0 }
      arcFramePoint(f, f.theta1, p)
      expect(p.x).toBeCloseTo(x0, 8)
      expect(p.y).toBeCloseTo(y0, 8)
      arcFramePoint(f, f.theta1 + f.delta, p)
      expect(p.x).toBeCloseTo(x1, 8)
      expect(p.y).toBeCloseTo(y1, 8)
    }
    expect(compared).toBeGreaterThan(100)
  })

  it('scales radii too small for the chord, as SVG does', () => {
    const f = arcEllipseCenter(0, 0, 1, 1, 0, false, true, 10, 0)
    expect(f.rx).toBeCloseTo(5, 12)
    expect(f.cx).toBeCloseTo(5, 12)
    expect(f.cy).toBeCloseTo(0, 12)
    expect(Math.abs(f.delta)).toBeCloseTo(Math.PI, 12)
  })

  it('coincident endpoints or a zero radius draw nothing', () => {
    expect(arcEllipseCenter(3, 4, 5, 5, 0, false, true, 3, 4).delta).toBe(0)
    expect(arcEllipseCenter(3, 4, 0, 5, 0, false, true, 8, 4).delta).toBe(0)
  })

  it('round-trips a circle and keeps its geometry when reversed', () => {
    const c = { x: 30, y: 40 }
    const r = 25
    for (const [a0, delta] of [
      [0.3, 1.2],
      [2.0, -1.9],
      [-1.0, 2.9],
      [0.0, -0.5],
      [1.0, 4.0],
    ]) {
      const sx = c.x + r * Math.cos(a0)
      const sy = c.y + r * Math.sin(a0)
      const ex = c.x + r * Math.cos(a0 + delta)
      const ey = c.y + r * Math.sin(a0 + delta)
      const large = Math.abs(delta) > Math.PI
      const sweep = delta > 0
      const got = arcCenter(sx, sy, r, large, sweep, ex, ey)
      expect(Math.hypot(got.cx - c.x, got.cy - c.y)).toBeLessThan(1e-9)
      expect(got.r).toBeCloseTo(r, 9)
      expect(wrap(got.theta1 - a0)).toBeCloseTo(0, 9)
      expect(got.delta).toBeCloseTo(delta, 9)

      const fwd = {
        x0: sx,
        y0: sy,
        segments: [circularArc(r, large, sweep, ex, ey)],
        closed: false,
      }
      const rev = reversePath(fwd)
      expect([rev.x0, rev.y0]).toEqual([ex, ey])
      const seg = rev.segments[0] as Extract<FitSegment, { type: 'A' }>
      expect([seg.x, seg.y]).toEqual([sx, sy])
      const back = arcCenter(rev.x0, rev.y0, seg.rx, seg.largeArc, seg.sweep, seg.x, seg.y)
      expect(Math.hypot(back.cx - c.x, back.cy - c.y)).toBeLessThan(1e-9)
      expect(back.r).toBeCloseTo(r, 9)
      expect(back.delta).toBeCloseTo(-delta, 9)

      const samples: [number, number][] = []
      for (let i = 0; i <= 50; i++) {
        const a = a0 + (delta * i) / 50
        samples.push([c.x + r * Math.cos(a), c.y + r * Math.sin(a)])
      }
      const fwdPts = flat(samples)
      const backPts = flat(samples.toReversed())
      expect(maxDeviation(backPts, rev.x0, rev.y0, rev.segments)).toBeLessThan(1e-3)
      expect(maxDeviation(fwdPts, fwd.x0, fwd.y0, fwd.segments)).toBeLessThan(1e-3)
    }
  })
})

describe('cubicSelfIntersects', () => {
  it('reports the loops inkvec reports and nothing else', () => {
    expect(cubicSelfIntersects(bez([0, 0, 30, 0, 70, 100, 100, 100]))).toBe(false)
    // The quarter-circle arm, (4/3)(√2 − 1).
    const k = (4 / 3) * (Math.SQRT2 - 1)
    expect(cubicSelfIntersects(bez([40, 0, 40, k * 40, k * 40, 40, 0, 40]))).toBe(false)
    expect(cubicSelfIntersects(bez([0, 0, 80, 50, -70, 50, 10, 0]))).toBe(true)
    // Arms crossing in the control polygon without folding the curve.
    expect(cubicSelfIntersects(bez([0, 0, 100, 20, 0, 20, 100, 0]))).toBe(false)
    // A closed teardrop touches itself only at its ends.
    expect(cubicSelfIntersects(bez([0, 0, 120, 60, -120, 60, 0, 0]))).toBe(false)
  })

  it('agrees with dense sampling', () => {
    const crosses = (a: number[], b: number[], c: number[], d: number[]) => {
      const o = (p: number[], q: number[], r: number[]) =>
        Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]))
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
    }
    const rnd = lcg(5)
    let agree = 0
    let total = 0
    for (let c = 0; c < 150; c++) {
      const p = Array.from({ length: 8 }, () => 100 * rnd() - 50)
      const b = bez(p)
      const pts: number[][] = []
      const q: Vec = { x: 0, y: 0 }
      for (let k = 0; k <= 300; k++) {
        evalCubic(b, k / 300, q)
        pts.push([q.x, q.y])
      }
      let brute = false
      for (let a = 0; a + 1 < pts.length && !brute; a++) {
        for (let e = a + 2; e + 1 < pts.length; e++) {
          if (crosses(pts[a], pts[a + 1], pts[e], pts[e + 1])) {
            brute = true
            break
          }
        }
      }
      total++
      if (brute === cubicSelfIntersects(b)) agree++
    }
    // Sampling can miss a loop thinner than its step; the closed form is exact.
    expect(agree).toBeGreaterThanOrEqual(total - 2)
  })
})

describe('sampleRun', () => {
  const segs: FitSegment[] = [
    lineTo(10, 0),
    cubicTo(14, 0, 16, 4, 16, 8),
    circularArc(6, false, true, 10, 14),
  ]

  it('starts at the start, lands on every segment end and keeps its spacing', () => {
    const s = sampleRun(0, 0, segs, 0.25)
    expect([s[0], s[1]]).toEqual([0, 0])
    expect([s[s.length - 2], s[s.length - 1]]).toEqual([10, 14])
    // The line part: 40 steps of exactly 0.25.
    for (let k = 1; k <= 40; k++) expect(s[2 * k]).toBeCloseTo(0.25 * k, 12)
    expect([s[80], s[81]]).toEqual([10, 0])
    let maxStep = 0
    for (let k = 2; k < s.length; k += 2) {
      maxStep = Math.max(maxStep, Math.hypot(s[k] - s[k - 2], s[k + 1] - s[k - 1]))
    }
    expect(maxStep).toBeLessThanOrEqual(0.25 + 1e-9)
  })

  it('samples an arc on its circle', () => {
    const arc = circularArc(5, false, true, 0, 5)
    const s = sampleRun(5, 0, [arc], 0.1)
    const c = arcCenter(5, 0, 5, false, true, 0, 5)
    for (let k = 0; k < s.length; k += 2) {
      expect(Math.hypot(s[k] - c.cx, s[k + 1] - c.cy)).toBeCloseTo(5, 9)
    }
  })
})

describe('sampled residual', () => {
  it('is near zero for points on the run and scales with 1/σ²', () => {
    const segs: FitSegment[] = [lineTo(10, 0), circularArc(5, false, true, 15, 5)]
    const on = sampleRun(0, 0, segs, 0.37)
    const sigma = new Float64Array(on.length / 2).fill(0.1)
    // What remains is the sagitta of the 0.25 px chords on the arc, s²/8r ≈ 0.0016 px.
    expect(chi2(on, sigma, 0, 0, segs)).toBeLessThan(0.01)
    expect(maxDeviation(on, 0, 0, segs)).toBeLessThan(2e-3)
    // A point 0.3 px off the line, σ = 0.1: χ² = 9.
    const off = flat([
      [0, 0],
      [5, 0.3],
      [10, 0],
    ])
    expect(chi2(off, [0.1, 0.1, 0.1], 0, 0, [lineTo(10, 0)])).toBeCloseTo(9, 9)
    expect(chi2(off, [0.2, 0.2, 0.2], 0, 0, [lineTo(10, 0)])).toBeCloseTo(2.25, 9)
    expect(maxDeviation(off, 0, 0, [lineTo(10, 0)])).toBeCloseTo(0.3, 12)
  })

  it('an empty run is infinitely far', () => {
    const pts = flat([
      [0, 0],
      [1, 1],
    ])
    expect(chi2(pts, [1, 1], 0, 0, [])).toBe(Infinity)
    expect(maxDeviation(pts, 0, 0, [])).toBe(Infinity)
  })
})

describe('nearest distances', () => {
  it('to a segment clamp at its ends', () => {
    expect(nearestLineDist2(5, 3, 0, 0, 10, 0)).toBe(9)
    expect(nearestLineDist2(-3, 4, 0, 0, 10, 0)).toBe(25)
    expect(nearestLineDist2(13, 4, 0, 0, 10, 0)).toBe(25)
    expect(nearestLineDist2(3, 4, 2, 2, 2, 2)).toBe(5)
    expect(segmentDistance(5, 3, 0, 0, 10, 0)).toBe(3)
  })

  it('to a cubic match dense sampling', () => {
    const rnd = lcg(17)
    const q: Vec = { x: 0, y: 0 }
    for (let c = 0; c < 60; c++) {
      const b = bez(Array.from({ length: 8 }, () => 40 * rnd() - 20))
      const px = 50 * rnd() - 25
      const py = 50 * rnd() - 25
      let brute = Infinity
      for (let k = 0; k <= 20000; k++) {
        evalCubic(b, k / 20000, q)
        brute = Math.min(brute, (q.x - px) ** 2 + (q.y - py) ** 2)
      }
      const exact = nearestCubicDist2(b, px, py, 1e-9)
      expect(exact).toBeLessThanOrEqual(brute + 1e-9)
      expect(Math.sqrt(brute) - Math.sqrt(exact)).toBeLessThan(5e-3)
    }
  })
})

describe('isCircular', () => {
  it('holds for equal radii without rotation and for every other segment', () => {
    expect(isCircular(circularArc(3, false, false, 1, 1))).toBe(true)
    expect(isCircular(ellipticalArc(3, 3 + 1e-12, 0, false, false, 1, 1))).toBe(true)
    expect(isCircular(ellipticalArc(3, 4, 0, false, false, 1, 1))).toBe(false)
    expect(isCircular(lineTo(1, 1))).toBe(true)
  })
})
