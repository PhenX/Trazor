import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, normalizeSettings } from '@trazor/core'
import type { VectorizeSettings } from '@trazor/core'
import { TuneSearch } from '../src/search'
import type { CandidateResult, TuneOptions, TuneWeights } from '../src/index'
import type { CandidateMetrics } from '../src/score'

const FIDELITY_ONLY: TuneWeights = {
  fidelity: 1,
  simplicity: 0,
  fileSize: 0,
  colorEconomy: 0,
  cleanliness: 0,
}

function metrics(patch: Partial<CandidateMetrics>): CandidateMetrics {
  return {
    meanDeltaE: 0.1,
    nodeCount: 1000,
    pathCount: 20,
    byteLength: 8000,
    colorCount: 6,
    warnings: [],
    durationMs: 10,
    ...patch,
  }
}

/** Only `smoothing` moves the score; `optTolerance` is inert (a deferrable tail axis). */
function bowlMetric(smoothing: number): CandidateMetrics {
  return metrics({ meanDeltaE: 0.25 * (1 - smoothing) })
}

/** A smooth quadratic bowl over the two curve parameters. */
function bowl(
  settings: VectorizeSettings,
  ideal: { smoothing: number; optTolerance: number },
): CandidateMetrics {
  const ds = settings.smoothing - ideal.smoothing
  const dt = (settings.optTolerance - ideal.optTolerance) / 5
  const dist = Math.min(1, Math.hypot(ds, dt))
  return metrics({ meanDeltaE: 0.25 * dist })
}

function run(
  base: VectorizeSettings,
  opts: TuneOptions,
  evaluate: (s: VectorizeSettings) => CandidateMetrics,
): TuneSearch {
  const search = new TuneSearch(base, opts)
  let rounds = 0
  for (;;) {
    const batch = search.nextRound()
    if (batch.length === 0) break
    search.report(
      batch.map((c) => ({ id: c.id, metrics: evaluate(c.settings) })) as CandidateResult[],
    )
    if (++rounds > 1000) throw new Error('search did not terminate')
  }
  return search
}

const BASE = normalizeSettings({ ...DEFAULT_SETTINGS, smoothing: 0.1, optTolerance: 0.1 })
const OPTS: TuneOptions = {
  weights: FIDELITY_ONLY,
  iterations: 80,
  seed: 12345,
  roundSize: 8,
  free: ['smoothing', 'optTolerance'],
  staged: true,
}

/** Candidate index (1-based emission order) of the first `step` probe of a key. */
function firstStepIndex(search: TuneSearch, key: string): number {
  const steps = search.results().filter((c) => c.origin === 'step')
  const i = steps.findIndex((c) => c.tweaked === key)
  return i < 0 ? Infinity : i
}

describe('staged descent', () => {
  it('is deterministic for a fixed seed', () => {
    const evaluate = (s: VectorizeSettings) => bowl(s, { smoothing: 0.6, optTolerance: 2 })
    const a = run(BASE, OPTS, evaluate)
    const b = run(BASE, OPTS, evaluate)
    const key = (search: TuneSearch) =>
      search
        .results()
        .map(
          (c) =>
            `${c.origin}:${c.settings.smoothing.toFixed(6)}:${c.settings.optTolerance.toFixed(6)}`,
        )
    expect(key(a)).toEqual(key(b))
    expect(a.best()!.settings).toEqual(b.best()!.settings)
  })

  it('climbs the bowl to the same optimum as the unstaged search', () => {
    const ideal = { smoothing: 0.82, optTolerance: 3.5 }
    const staged = run(BASE, OPTS, (s) => bowl(s, ideal))
    const current = run(BASE, { ...OPTS, staged: false }, (s) => bowl(s, ideal))
    expect(staged.best()!.score).toBeGreaterThan(0.95)
    // Reachability is preserved (the tail is still swept), so the optimum matches.
    expect(staged.best()!.score).toBeCloseTo(current.best()!.score, 1)
  })

  it('defers the inert tail axis relative to the unstaged search', () => {
    // Only smoothing moves the score; optTolerance is the deferrable tail.
    const evaluate = (s: VectorizeSettings) => bowlMetric(s.smoothing)
    const staged = run(BASE, OPTS, evaluate)
    const current = run(BASE, { ...OPTS, staged: false }, evaluate)
    // The sensitive axis is probed under both; the inert one is reached later
    // (or not at all) when staged concentrates budget on the primary axis first.
    expect(firstStepIndex(staged, 'optTolerance')).toBeGreaterThan(
      firstStepIndex(current, 'optTolerance'),
    )
  })
})
