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
   * Windowed SSIM (Wang et al. 2004) of the rendered SVG vs the source,
   * −1..1, higher = structurally closer. Optional: when present it blends
   * into the fidelity utility so perception (structure) votes alongside
   * color distance; absent ⇒ the utility is pure ΔE.
   */
  ssim?: number
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

/**
 * Fidelity: the app's own score, 1 − 4·ΔE clamped — an absolute anchor, not
 * relative to the baseline. With a structural SSIM the two are blended
 * (0.7 color, 0.3 structure), so a candidate that matches the palette but
 * blurs edges scores below one that keeps the shapes crisp.
 */
export function fidelityUtility(meanDeltaE: number, ssim?: number): number {
  const dE = clamp(1 - 4 * meanDeltaE, 0, 1)
  if (ssim === undefined) return dE
  const perceptual = clamp((ssim + 1) / 2, 0, 1) // −1..1 → 0..1
  return 0.7 * dE + 0.3 * perceptual
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
    fidelity: fidelityUtility(metrics.meanDeltaE, metrics.ssim),
    simplicity: fewerIsBetter(metrics.nodeCount, baseline.nodeCount),
    fileSize: fewerIsBetter(metrics.byteLength, baseline.byteLength),
    colorEconomy: fewerIsBetter(metrics.colorCount, baseline.colorCount, 1),
    cleanliness: cleanlinessUtility(metrics.warnings),
  }
}

/**
 * Score a candidate: the weight-normalized sum of its objective utilities. The
 * baseline anchors the "fewer is better" axes; weights need not sum to anything.
 */
export function scoreCandidate(
  metrics: CandidateMetrics,
  baseline: CandidateMetrics,
  weights: TuneWeights,
): { score: number; utilities: Record<ObjectiveId, number> } {
  const utilities = utilitiesOf(metrics, baseline)
  let weighted = 0
  let total = 0
  for (const id of OBJECTIVE_IDS) {
    const w = Math.max(0, weights[id] ?? 0)
    weighted += w * utilities[id]
    total += w
  }
  return { score: total > 0 ? weighted / total : 0, utilities }
}
