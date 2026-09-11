/**
 * Pure helpers for the tune bench (`tune-bench.ts`) — the parts that turn a
 * search's scored candidates into the efficiency numbers the bench reports, with
 * no engine, filesystem or timing coupling so they unit-test in Node.
 *
 * The central artifact is the **score-vs-candidates curve**: the best winnable
 * score known after each candidate is evaluated, in evaluation order. Its final
 * value is the search's result; how quickly it approaches that value is the
 * efficiency the space-narrowing work tries to improve.
 */

/** One scored candidate as the bench observes it, in evaluation order. */
export interface CurvePoint {
  /** Combined objective score; a barred (rejected) candidate contributes 0. */
  score: number
  /** True when the candidate may win (not empty, not below the fidelity floor). */
  winnable: boolean
}

/**
 * The running best winnable score after each candidate, in evaluation order.
 * A non-winnable candidate never raises the best, so the curve is monotone
 * non-decreasing and its last value is the search's final score.
 */
export function bestScoreCurve(points: readonly CurvePoint[]): number[] {
  const curve = new Array<number>(points.length)
  let best = 0
  for (let i = 0; i < points.length; i++) {
    const p = points[i]
    if (p.winnable && p.score > best) best = p.score
    curve[i] = best
  }
  return curve
}

/** The final (best) score a curve reaches — its last value, or 0 when empty. */
export function finalScore(curve: readonly number[]): number {
  return curve.length > 0 ? curve[curve.length - 1] : 0
}

/**
 * The number of candidates needed to reach `fraction` of the curve's final
 * score: the 1-based index of the first candidate whose running best is at or
 * above `fraction × final`. Returns the curve length when the target is never
 * met (an empty or all-zero curve), and 0 for an empty curve.
 */
export function candidatesToFraction(curve: readonly number[], fraction: number): number {
  const target = finalScore(curve) * fraction
  if (curve.length === 0) return 0
  if (target <= 0) return 1
  for (let i = 0; i < curve.length; i++) {
    if (curve[i] >= target - 1e-12) return i + 1
  }
  return curve.length
}

/** Summary statistics of one search run's score-vs-candidates curve. */
export interface CurveSummary {
  /** Total candidates evaluated. */
  evaluated: number
  /** Best winnable score reached (the curve's last value). */
  finalScore: number
  /** Candidates to reach 95 % of the final score. */
  candidatesTo95: number
  /**
   * Area under the normalized curve (best/final vs candidate fraction), in
   * [0,1]: 1 means the final score was reached on the first candidate, lower
   * means budget was spent climbing. A single scalar for "how front-loaded".
   */
  areaUnderCurve: number
}

/** Summarize a score-vs-candidates curve into the bench's efficiency numbers. */
export function summarizeCurve(curve: readonly number[]): CurveSummary {
  const final = finalScore(curve)
  let area = 0
  if (curve.length > 0 && final > 0) {
    let sum = 0
    for (const v of curve) sum += v / final
    area = sum / curve.length
  }
  return {
    evaluated: curve.length,
    finalScore: final,
    candidatesTo95: candidatesToFraction(curve, 0.95),
    areaUnderCurve: area,
  }
}

/** Mean of a numeric series (0 when empty). */
export function mean(xs: readonly number[]): number {
  if (xs.length === 0) return 0
  let s = 0
  for (const x of xs) s += x
  return s / xs.length
}

/** Sample standard deviation (n−1); 0 for fewer than two samples. */
export function stddev(xs: readonly number[]): number {
  const n = xs.length
  if (n < 2) return 0
  const m = mean(xs)
  let s = 0
  for (const x of xs) s += (x - m) * (x - m)
  return Math.sqrt(s / (n - 1))
}

/**
 * Fraction of a metric's variance explained by one factor, one-way ANOVA
 * (between-group sum of squares over total sum of squares) — the study's
 * main-effect measure. `groups` partitions the observations of `values` by the
 * factor's level; empty groups are ignored. Returns 0 when the metric does not
 * vary at all.
 */
export function varianceExplained(
  values: readonly number[],
  groups: readonly (readonly number[])[],
): number {
  if (values.length === 0) return 0
  const grand = mean(values)
  let ssTotal = 0
  for (const v of values) ssTotal += (v - grand) * (v - grand)
  if (ssTotal <= 0) return 0
  let ssBetween = 0
  for (const g of groups) {
    if (g.length === 0) continue
    const gm = mean(g)
    ssBetween += g.length * (gm - grand) * (gm - grand)
  }
  return ssBetween / ssTotal
}
