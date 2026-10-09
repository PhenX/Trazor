import { describe, expect, it } from 'vitest'
import { costModelWithOverrides, withCostModel } from '../../src/fit/cost'
import { polyline, uniformPolyline } from '../../src/fit/objective'
import {
  breakCost,
  estimateTangents,
  symmetricTangent,
  turnAngle,
  vertexCost,
} from '../../src/fit/tangents'
import { circlePoints, flat, lcg, near, run } from './fit-helpers'

const cfg = { tau: 2, lambda: 3 }

/** The parabola the pinned inkvec values were computed on. */
function parabola() {
  const rnd = lcg(7)
  const pts: [number, number][] = []
  const sigma: number[] = []
  for (let k = 0; k < 21; k++) {
    const x = 0.5 * k
    pts.push([x, 0.02 * x * x + 0.05 * (rnd() - 0.5)])
    sigma.push(0.1 + 0.05 * (k % 3))
  }
  return polyline(flat(pts), sigma, false)
}

/** A noisy quarter circle of radius 12 followed by eight unit steps of straight line. */
function quarterThenLine() {
  const rnd = lcg(11)
  const pts: [number, number][] = []
  for (let k = 0; k <= 16; k++) {
    const t = (k / 16) * 0.41421356237309503
    const d = 1 + t * t
    const x = (12 * (1 - t * t)) / d + 5 + 0.04 * (rnd() - 0.5)
    const y = (12 * 2 * t) / d + 3 + 0.04 * (rnd() - 0.5)
    pts.push([x, y])
  }
  const [lx, ly] = pts[16]
  for (let k = 1; k <= 8; k++) pts.push([lx - k, ly])
  return uniformPolyline(flat(pts), 0.05, false)
}

describe('turn costs', () => {
  it('a right angle is a full corner', () => {
    const a = { x: 1, y: 0 }
    const b = { x: 0, y: 1 }
    expect(turnAngle(a, b)).toBeCloseTo(Math.PI / 2, 12)
    expect(breakCost(a, b, 1)).toBe(1)
  })

  it('ramps quadratically to λ at the break angle and saturates there', () => {
    const at = (deg: number) => ({
      x: Math.cos((deg * Math.PI) / 180),
      y: Math.sin((deg * Math.PI) / 180),
    })
    const x = { x: 1, y: 0 }
    expect(breakCost(x, at(5), 2)).toBeCloseTo(0.5, 9)
    expect(breakCost(x, at(10), 2)).toBeCloseTo(2, 9)
    expect(breakCost(x, at(40), 2)).toBe(2)
    expect(breakCost(x, { x: 0, y: 0 }, 2)).toBe(0)
    withCostModel(costModelWithOverrides(undefined, 30), () => {
      expect(breakCost(x, at(15), 2)).toBeCloseTo(0.5, 9)
    })
  })
})

describe('estimateTangents', () => {
  it('follows a straight line in its direction of travel', () => {
    const poly = uniformPolyline(flat(run([0, 0], [-12, 9], 15)), 0.1, false)
    const tan = estimateTangents(poly, cfg)
    for (let k = 0; k < 16; k++) {
      for (const t of [tan.incoming[k], tan.outgoing[k]]) {
        expect(t.x).toBeCloseTo(-0.8, 9)
        expect(t.y).toBeCloseTo(0.6, 9)
      }
    }
  })

  it('is perpendicular to the radius on a circle and smooth everywhere', () => {
    const pts = circlePoints(48, 10, 20, 15)
    const poly = uniformPolyline(flat(pts), 0.05, true)
    const tan = estimateTangents(poly, cfg)
    pts.forEach(([x, y], k) => {
      const t = tan.outgoing[k]
      expect(Math.abs(t.x * (x - 10) + t.y * (y - 20)) / 15).toBeLessThan(1e-3)
      // Counter-clockwise travel.
      expect(-(y - 20) * t.x + (x - 10) * t.y).toBeGreaterThan(0)
      expect(tan.incoming[k]).toEqual(t)
      expect(vertexCost(tan, k, cfg)).toBeLessThan(1e-12)
    })
  })

  it('keeps each side of a corner on its own edge', () => {
    const pts = [...run([0, 0], [10, 0], 10), ...run([10, 0], [10, 10], 10).slice(1)]
    const poly = uniformPolyline(flat(pts), 0.05, false)
    const tan = estimateTangents(poly, cfg)
    expect(tan.incoming[10].x).toBeCloseTo(1, 9)
    expect(tan.incoming[10].y).toBeCloseTo(0, 9)
    expect(tan.outgoing[10].x).toBeCloseTo(0, 9)
    expect(tan.outgoing[10].y).toBeCloseTo(1, 9)
    expect(vertexCost(tan, 10, cfg)).toBe(cfg.lambda)
    expect(symmetricTangent(poly, 10, 16, cfg)).toBeNull()
    // The ends of an open polyline take their one side.
    expect(tan.incoming[0]).toEqual(tan.outgoing[0])
    expect(tan.outgoing[20].y).toBeCloseTo(1, 9)
  })

  it('stands in the x axis where there is nothing to measure', () => {
    const tan = estimateTangents(uniformPolyline([4, 4], 0.1, false), cfg)
    expect(tan.incoming).toEqual([{ x: 1, y: 0 }])
    const two = estimateTangents(uniformPolyline([0, 0, 0, 2], 0.1, false), cfg)
    for (const t of [two.outgoing[0], two.incoming[1]]) {
      expect(t.x).toBeCloseTo(0, 15)
      expect(t.y).toBe(1)
    }
  })

  it('gives the tangents inkvec gives on a noisy parabola', () => {
    const tan = estimateTangents(parabola(), cfg)
    const inc = [
      0.9999967821892968, 0.0025368506168747538, 0.9984220082943854, 0.05615597344366799,
      0.9996107893625443, 0.027897487162666226, 0.9984963388528353, 0.05481843939300045,
      0.9968627044879219, 0.0791501636197043, 0.9950123312563788, 0.09975199570808803,
      0.9930963417785582, 0.117301559861943, 0.9905834020547938, 0.1369106408339062,
      0.9877879201785562, 0.15580444393316292, 0.9848079472076429, 0.17364707632628995,
      0.981152131699322, 0.19323688690795085, 0.9770645308105673, 0.21294342589506274,
      0.9728077777622504, 0.2316139622848159, 0.968260432507509, 0.2499434632879434,
      0.9636684079472371, 0.26710147795255174, 0.9575188339889735, 0.28837073803768043,
      0.9508966610881413, 0.30950854581323706, 0.9438376318163402, 0.330409631771416,
      0.9380598343415762, 0.3464732993970166, 0.9335363184951131, 0.35848283369024925,
      0.9252363204406003, 0.3793912905399101,
    ]
    const out = [...inc]
    out[2] = 0.9997431324275643
    out[3] = 0.022664270646145256
    out[38] = 0.9316498998504756
    out[39] = 0.36335721282038547
    for (let k = 0; k < 21; k++) {
      expect(near(tan.incoming[k].x, inc[2 * k], 1e-9)).toBe(true)
      expect(near(tan.incoming[k].y, inc[2 * k + 1], 1e-9)).toBe(true)
      expect(near(tan.outgoing[k].x, out[2 * k], 1e-9)).toBe(true)
      expect(near(tan.outgoing[k].y, out[2 * k + 1], 1e-9)).toBe(true)
    }
  })

  it('gives the tangents inkvec gives where an arc meets a line', () => {
    const tan = estimateTangents(quarterThenLine(), cfg)
    // Past the join the line's first point sees the arc behind it and the line ahead.
    expect(near(tan.incoming[17].x, -0.9588523279278905, 1e-9)).toBe(true)
    expect(near(tan.incoming[17].y, 0.28390528918508184, 1e-9)).toBe(true)
    expect(tan.outgoing[17].x).toBe(-1)
    expect(Math.abs(tan.outgoing[17].y)).toBeLessThan(1e-12)
    expect(near(tan.incoming[16].x, -0.8982240078660133, 1e-9)).toBe(true)
    expect(tan.outgoing[16]).toEqual(tan.incoming[16])
    expect(near(tan.incoming[1].x, -0.07879708138672306, 1e-9)).toBe(true)
    expect(near(tan.outgoing[1].x, -0.06342802196362426, 1e-9)).toBe(true)
    expect(near(tan.incoming[23].x, -0.9982689903141369, 1e-9)).toBe(true)
    expect(near(tan.incoming[23].y, -0.05881345915004347, 1e-9)).toBe(true)
    expect(tan.outgoing[23].x).toBe(-1)
    expect(Math.abs(tan.outgoing[23].y)).toBeLessThan(1e-15)
    expect(near(tan.outgoing[24].y, -0.0498621142104765, 1e-9)).toBe(true)
  })
})
