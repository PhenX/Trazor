import { describe, expect, it } from 'vitest'
import type { VectorizeWarning } from '@trazor/core'
import {
  cleanlinessUtility,
  FIDELITY_DROP,
  fidelityFloor,
  fidelityUtility,
  isEmptyResult,
  scoreCandidate,
  utilitiesOf,
} from '../src/score'
import type { CandidateMetrics, TuneWeights } from '../src/score'

function metrics(patch: Partial<CandidateMetrics> = {}): CandidateMetrics {
  return {
    meanDeltaE: 0.02,
    nodeCount: 1000,
    pathCount: 20,
    byteLength: 8000,
    colorCount: 6,
    warnings: [],
    durationMs: 100,
    ...patch,
  }
}

const ONLY = (id: keyof TuneWeights): TuneWeights => ({
  fidelity: 0,
  simplicity: 0,
  fileSize: 0,
  colorEconomy: 0,
  cleanliness: 0,
  [id]: 1,
})

describe('fidelityUtility', () => {
  it('is 1 at ΔE 0 and 0 at ΔE ≥ 0.25', () => {
    expect(fidelityUtility(0)).toBe(1)
    expect(fidelityUtility(0.25)).toBe(0)
    expect(fidelityUtility(0.5)).toBe(0)
    expect(fidelityUtility(0.0625)).toBeCloseTo(0.75, 6)
  })

  it('blends a measured p95 ΔE into the judged error (65/35)', () => {
    expect(fidelityUtility(0.02, 0.1)).toBeCloseTo(1 - 4 * (0.65 * 0.02 + 0.35 * 0.1), 6)
    // Local damage (high p95) lowers fidelity even when the mean barely moves.
    expect(fidelityUtility(0.02, 0.4)).toBeLessThan(fidelityUtility(0.02, 0.1))
    // A p95 below the mean cannot raise the utility above the mean-only value.
    expect(fidelityUtility(0.1, 0.05)).toBeCloseTo(fidelityUtility(0.1), 6)
  })
})

describe('fidelityFloor', () => {
  it('is the explicit floor raised to within FIDELITY_DROP of the pool best', () => {
    expect(fidelityFloor(0.9)).toBeCloseTo(0.9 - FIDELITY_DROP, 6)
    expect(fidelityFloor(0.9, 0.5)).toBeCloseTo(0.9 - FIDELITY_DROP, 6)
    expect(fidelityFloor(0.9, 0.85)).toBeCloseTo(0.85, 6)
    expect(fidelityFloor(0.1)).toBe(0)
  })
})

describe('utilitiesOf', () => {
  it('anchors the fewer-is-better axes at 0.5 for the baseline', () => {
    const base = metrics()
    const u = utilitiesOf(base, base)
    expect(u.simplicity).toBeCloseTo(0.5, 6)
    expect(u.fileSize).toBeCloseTo(0.5, 6)
    expect(u.colorEconomy).toBeCloseTo(0.5, 6)
  })

  it('rewards fewer nodes / bytes / colors than the baseline', () => {
    const base = metrics()
    const half = utilitiesOf(metrics({ nodeCount: 500 }), base)
    expect(half.simplicity).toBeCloseTo(1 / 1.5, 6)
    const fewerColors = utilitiesOf(metrics({ colorCount: 1 }), base)
    expect(fewerColors.colorEconomy).toBe(1)
  })
})

describe('cleanlinessUtility', () => {
  it('penalizes warnings and halves info severity', () => {
    expect(cleanlinessUtility([])).toBe(1)
    const warn: VectorizeWarning = { code: 'tiny-features', severity: 'warning', message: '' }
    const info: VectorizeWarning = { code: 'tiny-features', severity: 'info', message: '' }
    expect(cleanlinessUtility([warn])).toBeCloseTo(0.8, 6)
    expect(cleanlinessUtility([info])).toBeCloseTo(0.9, 6)
  })
})

describe('isEmptyResult', () => {
  it('flags empty output by path/node count or warning', () => {
    expect(isEmptyResult(metrics({ pathCount: 0 }))).toBe(true)
    expect(isEmptyResult(metrics({ nodeCount: 0 }))).toBe(true)
    expect(
      isEmptyResult(
        metrics({ warnings: [{ code: 'empty-result', severity: 'warning', message: '' }] }),
      ),
    ).toBe(true)
    expect(isEmptyResult(metrics())).toBe(false)
  })
})

describe('scoreCandidate', () => {
  it('is the weight-normalized geometric mean of the utilities', () => {
    const base = metrics()
    const cand = metrics({ meanDeltaE: 0, nodeCount: 500 })
    const both: TuneWeights = {
      fidelity: 2,
      simplicity: 2,
      fileSize: 0,
      colorEconomy: 0,
      cleanliness: 0,
    }
    const { score, utilities } = scoreCandidate(cand, base, both)
    expect(score).toBeCloseTo(Math.sqrt(utilities.fidelity * utilities.simplicity), 6)
  })

  it('ignores zero-weight objectives', () => {
    const base = metrics()
    const cand = metrics({ meanDeltaE: 0 })
    expect(scoreCandidate(cand, base, ONLY('fidelity')).score).toBe(1)
  })

  it('does not let strong axes buy off a collapsed one', () => {
    const base = metrics()
    // Perfect simplicity/file-size, but fidelity has collapsed to 0.
    const collapsed = metrics({ meanDeltaE: 0.3, nodeCount: 1, byteLength: 1 })
    const weights: TuneWeights = {
      fidelity: 1,
      simplicity: 1,
      fileSize: 1,
      colorEconomy: 0,
      cleanliness: 1,
    }
    expect(scoreCandidate(collapsed, base, weights).score).toBeLessThan(0.1)
  })

  it('prefers a faithful trace over a degenerate few-blob one at default-like weights', () => {
    const base = metrics()
    // A near-empty trace: superb simplicity/size, subject destroyed (high p95).
    const degenerate = metrics({
      meanDeltaE: 0.08,
      p95DeltaE: 0.4,
      nodeCount: 60,
      byteLength: 500,
      colorCount: 2,
    })
    // A real trace: close to the source everywhere, ordinary complexity.
    const faithful = metrics({
      meanDeltaE: 0.02,
      p95DeltaE: 0.08,
      nodeCount: 900,
      byteLength: 7000,
    })
    const weights: TuneWeights = {
      fidelity: 1,
      simplicity: 0.5,
      fileSize: 0.25,
      colorEconomy: 0,
      cleanliness: 0.25,
    }
    const good = scoreCandidate(faithful, base, weights).score
    const bad = scoreCandidate(degenerate, base, weights).score
    expect(good).toBeGreaterThan(bad)
  })

  it('returns 0 when all weights are zero', () => {
    const base = metrics()
    const zero: TuneWeights = {
      fidelity: 0,
      simplicity: 0,
      fileSize: 0,
      colorEconomy: 0,
      cleanliness: 0,
    }
    expect(scoreCandidate(metrics(), base, zero).score).toBe(0)
  })
})
