import { describe, expect, it } from 'vitest'
import {
  arcParams,
  costModelWithOverrides,
  CUBIC_RANGE,
  cubicMaxTurnRadians,
  cubicParams,
  G1_RANGE,
  g1BreakRadians,
  PARAMS_ARC,
  PARAMS_ARC_WRITTEN,
  PARAMS_CUBIC,
  PARAMS_ELLIPTICAL_ARC,
  PARAMS_LINE,
  STANDARD_COST_MODEL,
  withCostModel,
  withWrittenArcs,
} from '../../src/fit/cost'
import { circularArc, cubicTo, ellipticalArc, lineTo, segmentParams } from '../../src/fit/curves'

describe('parameter prices', () => {
  it('charge a line two numbers, a cubic six, a circular arc five, an ellipse seven', () => {
    expect([
      PARAMS_LINE,
      PARAMS_CUBIC,
      PARAMS_ARC,
      PARAMS_ARC_WRITTEN,
      PARAMS_ELLIPTICAL_ARC,
    ]).toEqual([2, 6, 5, 7, 7])
    expect(segmentParams(lineTo(1, 2))).toBe(2)
    expect(segmentParams(cubicTo(0, 1, 2, 3, 4, 5))).toBe(6)
    expect(segmentParams(circularArc(5, false, true, 1, 0))).toBe(5)
    expect(segmentParams(ellipticalArc(5, 3, 0.3, false, true, 1, 0))).toBe(7)
    // Equal radii but rotated: not a circle's arc as written.
    expect(segmentParams(ellipticalArc(5, 5, 0.3, false, true, 1, 0))).toBe(7)
  })

  it('asking for nothing is the standard model', () => {
    expect(costModelWithOverrides()).toEqual(STANDARD_COST_MODEL)
    expect(cubicParams()).toBe(6)
    expect(arcParams()).toBe(5)
    expect(g1BreakRadians()).toBeCloseTo((10 * Math.PI) / 180, 15)
    expect(cubicMaxTurnRadians()).toBe(Infinity)
  })

  it('holds requested prices to their range; a non-finite request is no request', () => {
    const m = costModelWithOverrides(0.1, 500)
    expect(m.cubicParams).toBe(CUBIC_RANGE[0])
    expect(m.g1BreakDegrees).toBe(G1_RANGE[1])
    expect(costModelWithOverrides(NaN, Infinity)).toEqual(STANDARD_COST_MODEL)
  })
})

describe('withCostModel', () => {
  it('changes the prices for the scope and puts them back', () => {
    const asked = costModelWithOverrides(3, 30)
    withCostModel(asked, () => {
      expect(cubicParams()).toBe(3)
      expect(g1BreakRadians()).toBeCloseTo((30 * Math.PI) / 180, 15)
      expect(segmentParams(cubicTo(0, 0, 1, 1, 2, 2))).toBe(3)
    })
    expect(cubicParams()).toBe(6)
    expect(g1BreakRadians()).toBeCloseTo((10 * Math.PI) / 180, 15)
  })

  it('is undone when the work inside it throws', () => {
    expect(() =>
      withCostModel(costModelWithOverrides(2.5), () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(cubicParams()).toBe(6)
  })

  it('a nested scope inherits the outer one', () => {
    withCostModel(costModelWithOverrides(4), () => {
      withCostModel(costModelWithOverrides(9), () => {
        expect(cubicParams()).toBe(4)
      })
      expect(cubicParams()).toBe(4)
    })
    expect(cubicParams()).toBe(6)
  })

  it('returns what the scoped work returns', () => {
    expect(withCostModel(STANDARD_COST_MODEL, () => 42)).toBe(42)
  })

  it('written arcs charge an arc seven and limit one cubic to ninety degrees', () => {
    const arc = circularArc(5, false, true, 1, 0)
    expect(segmentParams(arc)).toBe(PARAMS_ARC)
    const written = withWrittenArcs(STANDARD_COST_MODEL)
    expect(written.cubicParams).toBe(STANDARD_COST_MODEL.cubicParams)
    withCostModel(written, () => {
      expect(arcParams()).toBe(PARAMS_ARC_WRITTEN)
      expect(segmentParams(arc)).toBe(7)
      expect(cubicMaxTurnRadians()).toBeCloseTo(Math.PI / 2, 15)
    })
    expect(arcParams()).toBe(PARAMS_ARC)
    expect(cubicMaxTurnRadians()).toBe(Infinity)
  })
})
