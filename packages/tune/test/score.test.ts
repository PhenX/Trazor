import { describe, expect, it } from 'vitest'
import type { VectorizeWarning } from '@trazor/core'
import {
  cleanlinessUtility,
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
  it('is the weight-normalized mean of the utilities', () => {
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
    expect(score).toBeCloseTo((utilities.fidelity + utilities.simplicity) / 2, 6)
  })

  it('ignores zero-weight objectives', () => {
    const base = metrics()
    const cand = metrics({ meanDeltaE: 0 })
    expect(scoreCandidate(cand, base, ONLY('fidelity')).score).toBe(1)
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
