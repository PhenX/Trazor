import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, mulberry32, normalizeSettings } from '@trazor/core'
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

/** Metrics with sensible defaults; overridable per field. */
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

/**
 * A smooth quadratic bowl over two curve parameters: ΔE grows with distance
 * from an ideal (smoothing, optTolerance), so higher fidelity ⇔ closer to ideal.
 */
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
) {
  const search = new TuneSearch(base, opts)
  let rounds = 0
  for (;;) {
    const batch = search.nextRound()
    if (batch.length === 0) break
    const results: CandidateResult[] = batch.map((c) => ({
      id: c.id,
      metrics: evaluate(c.settings),
    }))
    search.report(results)
    if (++rounds > 1000) throw new Error('search did not terminate')
  }
  return search
}

const BASE = normalizeSettings({ ...DEFAULT_SETTINGS, smoothing: 0.1, optTolerance: 0.1 })
const CURVE_OPTS: TuneOptions = {
  weights: FIDELITY_ONLY,
  iterations: 80,
  seed: 12345,
  roundSize: 8,
  free: ['smoothing', 'optTolerance'],
}

describe('TuneSearch convergence', () => {
  it('climbs a quadratic bowl toward the optimum', () => {
    const ideal = { smoothing: 0.82, optTolerance: 3.5 }
    const search = run(BASE, CURVE_OPTS, (s) => bowl(s, ideal))
    const best = search.best()
    expect(best).not.toBeNull()
    expect(best!.score).toBeGreaterThan(0.95)
    expect(best!.settings.smoothing).toBeCloseTo(ideal.smoothing, 1)
    expect(best!.settings.optTolerance).toBeCloseTo(ideal.optTolerance, 0)
  })

  it('beats same-budget random sampling', () => {
    const ideal = { smoothing: 0.82, optTolerance: 3.5 }
    const search = run(BASE, CURVE_OPTS, (s) => bowl(s, ideal))

    // Random baseline: the same number of uniform samples over the two params.
    const rand = mulberry32(777)
    let randomBest = 0
    for (let i = 0; i < CURVE_OPTS.iterations; i++) {
      const s = normalizeSettings({ ...BASE, smoothing: rand(), optTolerance: rand() * 5 })
      const dist = Math.min(
        1,
        Math.hypot(s.smoothing - ideal.smoothing, (s.optTolerance - ideal.optTolerance) / 5),
      )
      randomBest = Math.max(randomBest, 1 - 4 * (0.25 * dist))
    }
    expect(search.best()!.score).toBeGreaterThanOrEqual(randomBest)
  })
})

describe('TuneSearch determinism', () => {
  it('reproduces the candidate sequence and winner for a fixed seed', () => {
    const ideal = { smoothing: 0.6, optTolerance: 2 }
    const evaluate = (s: VectorizeSettings) => bowl(s, ideal)
    const a = run(BASE, CURVE_OPTS, evaluate)
    const b = run(BASE, CURVE_OPTS, evaluate)

    const keyA = a
      .results()
      .map(
        (c) =>
          `${c.origin}:${c.settings.smoothing.toFixed(6)}:${c.settings.optTolerance.toFixed(6)}`,
      )
    const keyB = b
      .results()
      .map(
        (c) =>
          `${c.origin}:${c.settings.smoothing.toFixed(6)}:${c.settings.optTolerance.toFixed(6)}`,
      )
    expect(keyA).toEqual(keyB)
    expect(a.best()!.settings).toEqual(b.best()!.settings)
  })

  it('diverges for a different seed', () => {
    const ideal = { smoothing: 0.6, optTolerance: 2 }
    const evaluate = (s: VectorizeSettings) => bowl(s, ideal)
    const a = run(BASE, CURVE_OPTS, evaluate)
    const b = run(BASE, { ...CURVE_OPTS, seed: 999 }, evaluate)
    expect(a.results().length).toBeGreaterThan(0)
    // Different seeds explore different points (the seed rounds differ).
    expect(a.results()[3]?.settings).not.toEqual(b.results()[3]?.settings)
  })
})

describe('TuneSearch budget and dedup', () => {
  it('never exceeds the iteration budget and emits no duplicate settings', () => {
    const search = new TuneSearch(BASE, CURVE_OPTS)
    const keys = new Set<string>()
    let emitted = 0
    for (;;) {
      const batch = search.nextRound()
      if (batch.length === 0) break
      for (const c of batch) {
        const key = `${c.settings.smoothing}:${c.settings.optTolerance}`
        expect(keys.has(key)).toBe(false)
        keys.add(key)
        emitted++
      }
      search.report(
        batch.map((c) => ({
          id: c.id,
          metrics: bowl(c.settings, { smoothing: 0.5, optTolerance: 1 }),
        })),
      )
    }
    expect(emitted).toBeLessThanOrEqual(CURVE_OPTS.iterations)
    expect(search.progress().evaluated).toBe(emitted)
  })
})

describe('TuneSearch rejection and Pareto', () => {
  it('rejects empty results and never returns them as best', () => {
    // Every candidate but the baseline traces empty.
    const search = new TuneSearch(BASE, { ...CURVE_OPTS, iterations: 30 })
    for (;;) {
      const batch = search.nextRound()
      if (batch.length === 0) break
      search.report(
        batch.map((c) => ({
          id: c.id,
          metrics:
            c.origin === 'baseline'
              ? metrics({ meanDeltaE: 0.05 })
              : metrics({ pathCount: 0, nodeCount: 0 }),
        })),
      )
    }
    const best = search.best()
    expect(best).not.toBeNull()
    expect(best!.rejected).toBeUndefined()
    const emptyOnes = search.results().filter((c) => c.metrics.pathCount === 0)
    expect(emptyOnes.length).toBeGreaterThan(0)
    for (const c of emptyOnes) expect(c.rejected).toBe('empty')
  })

  it('reports a non-dominated Pareto front', () => {
    const ideal = { smoothing: 0.7, optTolerance: 2.5 }
    // Trade fidelity against simplicity: fewer nodes near high smoothing.
    const search = run(
      BASE,
      { ...CURVE_OPTS, weights: { ...FIDELITY_ONLY, simplicity: 1 } },
      (s) => {
        const dist = Math.min(
          1,
          Math.hypot(s.smoothing - ideal.smoothing, (s.optTolerance - ideal.optTolerance) / 5),
        )
        return metrics({
          meanDeltaE: 0.25 * dist,
          nodeCount: Math.round(200 + 1500 * (1 - s.smoothing)),
        })
      },
    )
    const front = search.paretoFront()
    expect(front.length).toBeGreaterThan(0)
    const axes = ['fidelity', 'simplicity', 'colorEconomy'] as const
    // No front member dominates another.
    for (const a of front) {
      for (const b of front) {
        if (a === b) continue
        const dominates =
          axes.every((ax) => b.utilities[ax] >= a.utilities[ax] - 1e-9) &&
          axes.some((ax) => b.utilities[ax] > a.utilities[ax] + 1e-9)
        expect(dominates).toBe(false)
      }
    }
  })
})
