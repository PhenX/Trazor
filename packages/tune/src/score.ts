import { clamp } from '@trazor/core'
import type { VectorizeWarning, WarningCode } from '@trazor/core'

/** The quality axes a search balances; each maps a metric to a 0..1 utility. */
export type ObjectiveId = 'fidelity' | 'simplicity' | 'fileSize' | 'colorEconomy' | 'cleanliness'

export const OBJECTIVE_IDS: readonly ObjectiveId[] = [
  'fidelity',
  'simplicity',
  'fileSize',
  'colorEconomy',
  'cleanliness',
]

/** Importance of each objective (0 = don't care). Normalized internally, so any scale works. */
export type TuneWeights = Record<ObjectiveId, number>

/** Everything measured for one traced candidate, read straight off its result + one fidelity pass. */
export interface CandidateMetrics {
  /** Mean Oklab ΔE between the rendered SVG and the source (lower is better). */
  meanDeltaE: number
  /**
   * 95th-percentile Oklab ΔE over the same sampled pixels (lower is better).
   * Optional: when absent, fidelity is judged on the mean alone.
   */
  p95DeltaE?: number
  nodeCount: number
  pathCount: number
  byteLength: number
  colorCount: number
  warnings: readonly VectorizeWarning[]
  durationMs: number
}

/** Per-warning cleanliness penalty; unlisted codes cost nothing. Info severity is halved. */
const WARNING_PENALTY: Partial<Record<WarningCode, number>> = {
  'tiny-features': 0.2,
  'stencil-islands': 0.15,
  'node-count': 0.15,
  'palette-clamped': 0.05,
  'centerline-input': 0.1,
}

/** Share of the 95th-percentile ΔE in the judged error (the rest is the mean). */
const P95_BLEND = 0.35

/**
 * Max fidelity-utility drop below the pool's best before a candidate is barred
 * from winning (see {@link fidelityFloor}).
 */
export const FIDELITY_DROP = 0.2

/** Utilities enter the geometric score no lower than this, so ranking among poor candidates stays informative. */
const UTILITY_FLOOR = 1e-4

/**
 * Fidelity: 1 − 4·ΔE clamped to 0..1 — an absolute anchor, not relative to the
 * baseline. When the caller measured a 95th-percentile ΔE, the judged error
 * blends it with the mean (65/35): a whole-image mean dilutes damage confined
 * to a small region (a lost subject on a matching background), while the high
 * percentile keeps that damage visible to the score.
 */
export function fidelityUtility(meanDeltaE: number, p95DeltaE?: number): number {
  const deltaE =
    p95DeltaE === undefined
      ? meanDeltaE
      : (1 - P95_BLEND) * meanDeltaE + P95_BLEND * Math.max(meanDeltaE, p95DeltaE)
  return clamp(1 - 4 * deltaE, 0, 1)
}

/**
 * The fidelity floor for a candidate pool: the caller's explicit floor, raised
 * to within {@link FIDELITY_DROP} of the best fidelity any candidate in the
 * pool achieved. Candidates below it must not win — whatever their other
 * utilities, a "best choice" visibly worse than what the search proved
 * attainable is a bad recommendation. Never rejects the pool's best-fidelity
 * candidate, so at least one candidate always survives the adaptive part.
 */
export function fidelityFloor(bestFidelity: number, minFidelity?: number): number {
  return Math.max(minFidelity ?? 0, bestFidelity - FIDELITY_DROP)
}

/**
 * A "less is better" count mapped to 0..1, anchored so the baseline scores 0.5,
 * half the baseline ≈ 0.67, and zero → 1. `offset` lets a count whose floor is 1
 * (colors) anchor on `value − 1`.
 */
function fewerIsBetter(value: number, baseline: number, offset = 0): number {
  const v = Math.max(0, value - offset)
  const b = Math.max(1, baseline - offset)
  return 1 / (1 + v / b)
}

export function cleanlinessUtility(warnings: readonly VectorizeWarning[]): number {
  let penalty = 0
  for (const w of warnings) {
    const base = WARNING_PENALTY[w.code]
    if (base === undefined) continue
    penalty += w.severity === 'info' ? base / 2 : base
  }
  return clamp(1 - penalty, 0, 1)
}

/** True when the result is effectively empty (nothing traced), and must not be scored. */
export function isEmptyResult(metrics: CandidateMetrics): boolean {
  return (
    metrics.pathCount === 0 ||
    metrics.nodeCount === 0 ||
    metrics.warnings.some((w) => w.code === 'empty-result')
  )
}

/**
 * The 0..1 utility of each objective for one candidate, anchored to the baseline
 * candidate (the user's current settings) so the score is scale-free across
 * images. Fidelity is absolute; the "fewer is better" axes anchor at 0.5.
 */
export function utilitiesOf(
  metrics: CandidateMetrics,
  baseline: CandidateMetrics,
): Record<ObjectiveId, number> {
  return {
    fidelity: fidelityUtility(metrics.meanDeltaE, metrics.p95DeltaE),
    simplicity: fewerIsBetter(metrics.nodeCount, baseline.nodeCount),
    fileSize: fewerIsBetter(metrics.byteLength, baseline.byteLength),
    colorEconomy: fewerIsBetter(metrics.colorCount, baseline.colorCount, 1),
    cleanliness: cleanlinessUtility(metrics.warnings),
  }
}

/**
 * Score a candidate: the weighted geometric mean of its objective utilities
 * (weighted product model; zero-weight axes are ignored, weights need not sum
 * to anything). Geometric rather than arithmetic so the axes don't compensate:
 * near-perfect simplicity/file-size — which a degenerate few-blob trace gets
 * for free — cannot buy off a collapsed fidelity, and a candidate near zero on
 * any weighted objective scores near zero overall. The baseline anchors the
 * "fewer is better" axes.
 */
export function scoreCandidate(
  metrics: CandidateMetrics,
  baseline: CandidateMetrics,
  weights: TuneWeights,
): { score: number; utilities: Record<ObjectiveId, number> } {
  const utilities = utilitiesOf(metrics, baseline)
  let logSum = 0
  let total = 0
  for (const id of OBJECTIVE_IDS) {
    const w = Math.max(0, weights[id] ?? 0)
    if (w === 0) continue
    logSum += w * Math.log(Math.max(utilities[id], UTILITY_FLOOR))
    total += w
  }
  return { score: total > 0 ? Math.exp(logSum / total) : 0, utilities }
}
