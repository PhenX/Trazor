import { describe, expect, it } from 'vitest'
import {
  bestScoreCurve,
  candidatesToFraction,
  finalScore,
  summarizeCurve,
  varianceExplained,
} from './tune-bench-lib'
import type { CurvePoint } from './tune-bench-lib'

const pts = (specs: Array<[number, boolean]>): CurvePoint[] =>
  specs.map(([score, winnable]) => ({ score, winnable }))

describe('bestScoreCurve', () => {
  it('is monotone non-decreasing and tracks the running best', () => {
    const curve = bestScoreCurve(
      pts([
        [0.2, true],
        [0.5, true],
        [0.4, true],
        [0.7, true],
      ]),
    )
    expect(curve).toEqual([0.2, 0.5, 0.5, 0.7])
  })

  it('ignores non-winnable candidates', () => {
    // A high-scoring barred candidate must not raise the best.
    const curve = bestScoreCurve(
      pts([
        [0.3, true],
        [0.9, false],
        [0.4, true],
      ]),
    )
    expect(curve).toEqual([0.3, 0.3, 0.4])
  })

  it('is all zero when nothing is winnable', () => {
    expect(
      bestScoreCurve(
        pts([
          [0.9, false],
          [0.8, false],
        ]),
      ),
    ).toEqual([0, 0])
  })

  it('handles an empty input', () => {
    expect(bestScoreCurve([])).toEqual([])
  })
})

describe('candidatesToFraction', () => {
  it('finds the first candidate reaching 95 % of the final score', () => {
    // final = 1.0; 0.95 first met at index 3 (0-based 2) here.
    const curve = [0.5, 0.9, 0.96, 1.0]
    expect(candidatesToFraction(curve, 0.95)).toBe(3)
  })

  it('returns 1 when the first candidate already meets the target', () => {
    expect(candidatesToFraction([1.0, 1.0, 1.0], 0.95)).toBe(1)
  })

  it('returns 1 for an all-zero (never-improving) curve', () => {
    // Target is 0, met immediately.
    expect(candidatesToFraction([0, 0, 0], 0.95)).toBe(1)
  })

  it('returns 0 for an empty curve', () => {
    expect(candidatesToFraction([], 0.95)).toBe(0)
  })

  it('reaches the final only at the last candidate when the win comes last', () => {
    const curve = [0.1, 0.1, 0.1, 1.0]
    expect(candidatesToFraction(curve, 0.95)).toBe(4)
  })
})

describe('summarizeCurve', () => {
  it('reports evaluated, final, the 95 % point and the area', () => {
    const curve = [0.5, 0.5, 1.0, 1.0]
    const s = summarizeCurve(curve)
    expect(s.evaluated).toBe(4)
    expect(s.finalScore).toBe(1.0)
    expect(s.candidatesTo95).toBe(3)
    // normalized curve = [0.5, 0.5, 1, 1] → mean 0.75.
    expect(s.areaUnderCurve).toBeCloseTo(0.75, 10)
  })

  it('a front-loaded curve has area near 1', () => {
    expect(summarizeCurve([1, 1, 1, 1]).areaUnderCurve).toBeCloseTo(1, 10)
  })

  it('handles an all-zero curve without dividing by zero', () => {
    const s = summarizeCurve([0, 0])
    expect(s.finalScore).toBe(0)
    expect(s.areaUnderCurve).toBe(0)
  })
})

describe('finalScore', () => {
  it('is the last value, or 0 when empty', () => {
    expect(finalScore([0.2, 0.9])).toBe(0.9)
    expect(finalScore([])).toBe(0)
  })
})

describe('varianceExplained', () => {
  it('is 1 when the factor fully separates the values', () => {
    // Two groups with no within-group spread.
    const values = [1, 1, 2, 2]
    const groups = [
      [1, 1],
      [2, 2],
    ]
    expect(varianceExplained(values, groups)).toBeCloseTo(1, 10)
  })

  it('is 0 when group means match the grand mean', () => {
    const values = [1, 3, 1, 3]
    const groups = [
      [1, 3],
      [1, 3],
    ]
    expect(varianceExplained(values, groups)).toBeCloseTo(0, 10)
  })

  it('is 0 when the metric does not vary', () => {
    expect(varianceExplained([2, 2, 2], [[2], [2, 2]])).toBe(0)
  })

  it('lands between the extremes for a partial effect', () => {
    const values = [1, 2, 4, 5]
    const groups = [
      [1, 2],
      [4, 5],
    ]
    const ve = varianceExplained(values, groups)
    expect(ve).toBeGreaterThan(0.8)
    expect(ve).toBeLessThan(1)
  })
})
