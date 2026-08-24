import { mulberry32, normalizeSettings } from '@trazor/core'
import type { VectorizeMode, VectorizeSettings } from '@trazor/core'
import {
  applicableParams,
  DEFAULT_FREE,
  fromUnit,
  settingsKey,
  toUnit,
  TUNABLE_PARAMS,
} from './params'
import type { ParamSpec, TunableKey } from './params'
import { fidelityUtility, isEmptyResult, scoreCandidate } from './score'
import type { CandidateMetrics, ObjectiveId, TuneWeights } from './score'

export type CandidateOrigin =
  | 'baseline'
  | 'assist'
  | 'profile'
  | 'sample'
  | 'step'
  | 'recombine'
  | 'restart'

/** One settings point the search wants evaluated. */
export interface TuneCandidate {
  id: number
  settings: VectorizeSettings
  origin: CandidateOrigin
  /** For `step` probes: the single parameter this candidate perturbs. */
  tweaked?: TunableKey
}

/** A candidate plus its measured metrics, utilities and combined score. */
export interface ScoredCandidate extends TuneCandidate {
  metrics: CandidateMetrics
  utilities: Record<ObjectiveId, number>
  score: number
  /** Set when the candidate is excluded from winning (empty output or below the fidelity floor). */
  rejected?: 'empty' | 'fidelity-floor'
}

/** What the caller feeds back for each emitted candidate. */
export interface CandidateResult {
  id: number
  metrics: CandidateMetrics
}

/** An extra round-0 starting point (e.g. the assist recommendation or a profile patch). */
export interface SeedPatch {
  patch: Partial<VectorizeSettings>
  origin?: CandidateOrigin
}

export interface TuneOptions {
  weights: TuneWeights
  /** Budget: total novel candidates to evaluate. */
  iterations: number
  /** PRNG seed — the whole search is deterministic in it. */
  seed: number
  /** Candidates proposed per round (≈ 2 × workers). */
  roundSize: number
  /** Parameters the search may move; defaults to {@link DEFAULT_FREE}. */
  free?: readonly TunableKey[]
  /** Reject candidates whose fidelity utility is below this floor. */
  minFidelity?: number
  /** Extra seed points merged over the base settings (assist / profiles). */
  seeds?: readonly SeedPatch[]
}

interface ParamState {
  /** Step size in [0,1] search space (numeric/int only). */
  unitStep: number
  /** EMA of the score gain this parameter recently produced. */
  gain: number
  /** Round index this parameter was last probed (-1 = never). */
  lastRound: number
  /** Stringified values already tried (enum/bool exhaustion). */
  tried: Set<string>
  /** No further useful moves: step floored (numeric) or all values tried (enum/bool). */
  exhausted: boolean
}

const UNIT_STEP_INIT = 0.25
const UNIT_STEP_FLOOR = 0.02
const UNIT_STEP_MAX = 0.5
const STEP_EXPAND = 1.6
const STEP_SHRINK = 0.5
const GAIN_EMA = 0.5
const STALL_LIMIT = 3
const EXPLORE_COEF = 0.02

/** Deterministic index for stable priority tiebreaks. */
const PARAM_ORDER = new Map<TunableKey, number>(TUNABLE_PARAMS.map((p, i) => [p.key, i]))

/**
 * A deterministic, round-based settings search. `nextRound()` emits a batch of
 * novel candidates; the caller traces + scores them and hands the metrics back
 * via `report()`. The strategy is pure (no worker/timing coupling) and seeded,
 * so the same inputs reproduce the same candidate sequence and winner.
 *
 * Round 0 seeds (baseline + caller seeds + Latin-hypercube fill); later rounds
 * run adaptive coordinate descent over the incumbent — probe one parameter at a
 * time, expand the step on success and shrink it on failure, with recombination
 * and, on stagnation, a seeded restart. See docs/AUTO_TUNE_PLAN.md.
 */
export class TuneSearch {
  private readonly base: VectorizeSettings
  private readonly mode: VectorizeMode
  private readonly opts: TuneOptions
  private readonly freeKeys: readonly TunableKey[]
  private readonly rand: () => number

  private nextId = 1
  private round = 0
  private evaluated = 0
  private stall = 0
  private converged = false
  private phase: 'seed' | 'descend' | 'done' = 'seed'

  /** Score cache + dedup, keyed by canonical settings. */
  private readonly seen = new Map<string, ScoredCandidate>()
  /** All scored candidates, in evaluation order (the comparison wall reads this). */
  private readonly ledger: ScoredCandidate[] = []
  /** Emitted-but-unreported candidates from the last `nextRound()`. */
  private pending = new Map<number, TuneCandidate>()
  /** Incumbent score when the pending round was proposed (gain attribution). */
  private pendingBaseScore = 0

  private baselineMetrics: CandidateMetrics | null = null
  private incumbent: ScoredCandidate | null = null
  private readonly paramState = new Map<TunableKey, ParamState>()

  constructor(base: VectorizeSettings, opts: TuneOptions) {
    this.base = normalizeSettings(base)
    this.mode = this.base.mode
    this.opts = opts
    this.rand = mulberry32(opts.seed >>> 0)
    const free = opts.free ?? DEFAULT_FREE
    // Keep only keys that can apply in this mode at all (any `when` state).
    this.freeKeys = free.filter((key) => {
      const spec = TUNABLE_PARAMS.find((p) => p.key === key)
      return spec && (!spec.modes || spec.modes.includes(this.mode))
    })
    for (const key of this.freeKeys) {
      this.paramState.set(key, {
        unitStep: UNIT_STEP_INIT,
        gain: 0,
        lastRound: -1,
        tried: new Set(),
        exhausted: false,
      })
    }
  }

  /** The next batch of novel candidates, or `[]` when the budget is spent or the search converged. */
  nextRound(): TuneCandidate[] {
    if (this.phase === 'done' || this.converged || this.evaluated >= this.opts.iterations) {
      return []
    }
    const batch = this.phase === 'seed' ? this.seedRound() : this.descendRound()
    this.pending = new Map(batch.map((c) => [c.id, c]))
    this.pendingBaseScore = this.incumbent?.score ?? 0
    return batch
  }

  /** Report the full emitted round (in any order); scores are computed against the baseline anchor. */
  report(results: readonly CandidateResult[]): void {
    // The baseline candidate anchors the "fewer is better" utilities, so capture
    // its metrics before scoring anything in the round.
    if (this.baselineMetrics === null) {
      for (const r of results) {
        if (this.pending.get(r.id)?.origin === 'baseline') {
          this.baselineMetrics = r.metrics
          break
        }
      }
      // No explicit baseline in this round (shouldn't happen in round 0): anchor
      // on the first reported candidate so scoring can proceed.
      this.baselineMetrics ??= results[0]?.metrics ?? null
    }
    const anchor = this.baselineMetrics
    if (!anchor) return

    const probedImproved = new Map<TunableKey, boolean>()
    const probedSeen = new Set<TunableKey>()
    let roundBest: ScoredCandidate | null = null

    for (const r of results) {
      const candidate = this.pending.get(r.id)
      if (!candidate) continue
      const scored = this.scoreOne(candidate, r.metrics, anchor)
      this.record(scored)

      if (candidate.origin === 'step' && candidate.tweaked) {
        probedSeen.add(candidate.tweaked)
        const improved = !scored.rejected && scored.score > this.pendingBaseScore + 1e-9
        if (improved) probedImproved.set(candidate.tweaked, true)
        const st = this.paramState.get(candidate.tweaked)
        if (st) {
          const gain = scored.rejected ? 0 : Math.max(0, scored.score - this.pendingBaseScore)
          st.gain = GAIN_EMA * st.gain + (1 - GAIN_EMA) * gain
          st.lastRound = this.round
        }
      }
      if (!scored.rejected && (!roundBest || scored.score > roundBest.score)) roundBest = scored
    }

    this.adaptSteps(probedSeen, probedImproved)
    this.updateIncumbent(roundBest)
    this.round++
    if (this.phase === 'seed') this.phase = 'descend'
    this.pending.clear()
    this.updateConvergence()
  }

  /** The best non-rejected candidate found so far. */
  best(): ScoredCandidate | null {
    let best: ScoredCandidate | null = null
    for (const c of this.ledger) {
      if (c.rejected) continue
      if (!best || c.score > best.score) best = c
    }
    return best
  }

  /** Every scored candidate, in evaluation order — the comparison wall's data. */
  results(): readonly ScoredCandidate[] {
    return this.ledger
  }

  /** The non-dominated set over (fidelity, simplicity, colorEconomy). */
  paretoFront(): readonly ScoredCandidate[] {
    const pool = this.ledger.filter((c) => !c.rejected)
    const axes: ObjectiveId[] = ['fidelity', 'simplicity', 'colorEconomy']
    return pool.filter((a) => {
      return !pool.some((b) => {
        if (b === a) return false
        let ge = true
        let gt = false
        for (const ax of axes) {
          if (b.utilities[ax] < a.utilities[ax] - 1e-9) ge = false
          if (b.utilities[ax] > a.utilities[ax] + 1e-9) gt = true
        }
        return ge && gt
      })
    })
  }

  progress(): { evaluated: number; total: number; converged: boolean } {
    return { evaluated: this.evaluated, total: this.opts.iterations, converged: this.converged }
  }

  // ------------------------------ internals ------------------------------

  private seedRound(): TuneCandidate[] {
    const out: TuneCandidate[] = []
    const usedKeys = new Set<string>()
    const add = (settings: VectorizeSettings, origin: CandidateOrigin): void => {
      const norm = normalizeSettings(settings)
      const key = settingsKey(norm)
      if (usedKeys.has(key) || this.seen.has(key)) return
      if (out.length >= this.remainingBudget()) return
      usedKeys.add(key)
      out.push({ id: this.nextId++, settings: norm, origin })
    }

    add(this.base, 'baseline')
    for (const seed of this.opts.seeds ?? []) {
      add({ ...this.base, ...seed.patch }, seed.origin ?? 'sample')
    }

    // Latin-hypercube fill over the applicable free space.
    const specs = applicableParams(this.freeKeys, this.mode, this.base)
    const fill = Math.min(this.remainingBudget(), this.opts.roundSize) - out.length
    if (fill > 0 && specs.length > 0) {
      const lhs = latinHypercube(fill, specs.length, this.rand)
      for (const sample of lhs) {
        let settings = this.base
        for (let d = 0; d < specs.length; d++) settings = withParam(settings, specs[d], sample[d])
        add(settings, 'sample')
      }
    }
    return out
  }

  private descendRound(): TuneCandidate[] {
    const inc = this.incumbent
    if (!inc) return []
    const out: TuneCandidate[] = []
    const usedKeys = new Set<string>()
    const budget = this.remainingBudget()
    const propose = (
      settings: VectorizeSettings,
      origin: CandidateOrigin,
      tweaked?: TunableKey,
    ): void => {
      if (out.length >= budget) return
      const norm = normalizeSettings(settings)
      const key = settingsKey(norm)
      if (usedKeys.has(key) || this.seen.has(key)) return
      usedKeys.add(key)
      out.push({ id: this.nextId++, settings: norm, origin, tweaked })
    }

    const specs = applicableParams(this.freeKeys, this.mode, inc.settings)
    const ranked = this.rankParams(specs)

    // Reserve room for a recombination and (when stalling) a restart.
    const reserve = 1 + (this.stall > 0 ? 1 : 0)
    const probeBudget = Math.max(1, Math.min(budget, this.opts.roundSize) - reserve)

    for (const spec of ranked) {
      if (out.length >= probeBudget) break
      this.probesFor(spec, inc.settings, propose)
    }

    this.recombine(propose)
    if (this.stall > 0) this.restart(specs, inc.settings, propose)
    return out
  }

  /** Emit the one-parameter moves for `spec` from the incumbent. */
  private probesFor(
    spec: ParamSpec,
    from: VectorizeSettings,
    propose: (s: VectorizeSettings, o: CandidateOrigin, t?: TunableKey) => void,
  ): void {
    const st = this.paramState.get(spec.key)
    if (!st || st.exhausted) return

    if (spec.kind === 'number' || spec.kind === 'int') {
      const u = toUnit(spec, from[spec.key] as number)
      propose(withParamUnit(from, spec, u + st.unitStep), 'step', spec.key)
      propose(withParamUnit(from, spec, u - st.unitStep), 'step', spec.key)
      return
    }

    if (spec.kind === 'bool') {
      const next = !(from[spec.key] as boolean)
      st.tried.add(String(next))
      propose({ ...from, [spec.key]: next }, 'step', spec.key)
      return
    }

    // enum: the next value not yet tried, cycling deterministically.
    const values = spec.values ?? []
    const current = String(from[spec.key])
    for (const v of values) {
      if (v === current || st.tried.has(v)) continue
      st.tried.add(v)
      propose({ ...from, [spec.key]: v }, 'step', spec.key)
      return
    }
  }

  private recombine(
    propose: (s: VectorizeSettings, o: CandidateOrigin, t?: TunableKey) => void,
  ): void {
    const ranked = this.ledger.filter((c) => !c.rejected).toSorted((a, b) => b.score - a.score)
    if (ranked.length < 2) return
    const [a, b] = ranked
    // Overlay one of the second-best's parameter groups onto the best.
    const groups = ['preprocess', 'palette', 'binarize', 'curve', 'output'] as const
    const group = groups[Math.floor(this.rand() * groups.length)]
    const settings = { ...a.settings } as unknown as Record<string, unknown>
    const bs = b.settings as unknown as Record<string, unknown>
    for (const spec of TUNABLE_PARAMS) {
      if (spec.group === group) settings[spec.key] = bs[spec.key]
    }
    propose(settings as unknown as VectorizeSettings, 'recombine')
  }

  private restart(
    specs: readonly ParamSpec[],
    from: VectorizeSettings,
    propose: (s: VectorizeSettings, o: CandidateOrigin, t?: TunableKey) => void,
  ): void {
    // A trust-region jitter around the incumbent: each numeric param jumps within
    // ±0.35 of its unit position; enum/bool pick a random value.
    let settings = from
    for (const spec of specs) {
      if (spec.kind === 'number' || spec.kind === 'int') {
        const u = toUnit(spec, from[spec.key] as number) + (this.rand() - 0.5) * 0.7
        settings = withParamUnit(settings, spec, u)
      } else if (spec.kind === 'bool') {
        settings = { ...settings, [spec.key]: this.rand() < 0.5 }
      } else if (spec.values && spec.values.length > 0) {
        const v = spec.values[Math.floor(this.rand() * spec.values.length)]
        settings = { ...settings, [spec.key]: v }
      }
    }
    propose(settings, 'restart')
  }

  /** Priority = recent gain + an exploration bonus for least-recently-tried params. */
  private rankParams(specs: readonly ParamSpec[]): ParamSpec[] {
    return specs
      .filter((s) => !this.paramState.get(s.key)?.exhausted)
      .toSorted((a, b) => {
        const pa = this.priority(a)
        const pb = this.priority(b)
        if (pb !== pa) return pb - pa
        return (PARAM_ORDER.get(a.key) ?? 0) - (PARAM_ORDER.get(b.key) ?? 0)
      })
  }

  private priority(spec: ParamSpec): number {
    const st = this.paramState.get(spec.key)
    if (!st) return 0
    const recency = this.round - (st.lastRound < 0 ? -1 : st.lastRound)
    return st.gain + EXPLORE_COEF * recency
  }

  private adaptSteps(seen: Set<TunableKey>, improved: Map<TunableKey, boolean>): void {
    for (const key of seen) {
      const st = this.paramState.get(key)
      if (!st) continue
      const spec = TUNABLE_PARAMS.find((p) => p.key === key)
      if (!spec) continue
      if (spec.kind === 'number' || spec.kind === 'int') {
        if (improved.get(key)) {
          st.unitStep = Math.min(UNIT_STEP_MAX, st.unitStep * STEP_EXPAND)
        } else {
          st.unitStep = st.unitStep * STEP_SHRINK
          if (st.unitStep <= UNIT_STEP_FLOOR) st.exhausted = true
        }
      } else if (spec.kind === 'bool') {
        // Both truth values seen and neither helped ⇒ nothing left to try.
        if (st.tried.size >= 2 && !improved.get(key)) st.exhausted = true
      } else if (spec.values) {
        if (st.tried.size >= spec.values.length - 1 && !improved.get(key)) st.exhausted = true
      }
    }
  }

  private updateIncumbent(roundBest: ScoredCandidate | null): void {
    if (!roundBest) {
      // No usable candidate this round: still seed the incumbent from the baseline
      // so descent has a point to step from.
      this.incumbent ??= this.baselineCandidate()
      this.stall++
      return
    }
    if (!this.incumbent || roundBest.score > this.incumbent.score + 1e-9) {
      this.incumbent = roundBest
      this.stall = 0
    } else {
      this.stall++
    }
  }

  private baselineCandidate(): ScoredCandidate | null {
    return this.ledger.find((c) => c.origin === 'baseline') ?? this.ledger[0] ?? null
  }

  private updateConvergence(): void {
    if (this.evaluated >= this.opts.iterations) {
      this.phase = 'done'
      return
    }
    if (this.phase !== 'descend' || !this.incumbent) return
    const specs = applicableParams(this.freeKeys, this.mode, this.incumbent.settings)
    const allExhausted = specs.every((s) => this.paramState.get(s.key)?.exhausted)
    if (allExhausted && this.stall >= STALL_LIMIT) this.converged = true
  }

  private scoreOne(
    candidate: TuneCandidate,
    metrics: CandidateMetrics,
    anchor: CandidateMetrics,
  ): ScoredCandidate {
    const empty = isEmptyResult(metrics)
    const { score, utilities } = scoreCandidate(metrics, anchor, this.opts.weights)
    let rejected: ScoredCandidate['rejected']
    if (empty) rejected = 'empty'
    else if (
      this.opts.minFidelity !== undefined &&
      fidelityUtility(metrics.meanDeltaE) < this.opts.minFidelity
    ) {
      rejected = 'fidelity-floor'
    }
    return { ...candidate, metrics, utilities, score: rejected ? 0 : score, rejected }
  }

  private record(scored: ScoredCandidate): void {
    const key = settingsKey(scored.settings)
    if (this.seen.has(key)) return
    this.seen.set(key, scored)
    this.ledger.push(scored)
    this.evaluated++
  }

  private remainingBudget(): number {
    return Math.max(0, this.opts.iterations - this.evaluated)
  }
}

/** Set a numeric/int parameter from a [0,1] unit coordinate; normalize. */
function withParamUnit(
  settings: VectorizeSettings,
  spec: ParamSpec,
  unit: number,
): VectorizeSettings {
  return normalizeSettings({ ...settings, [spec.key]: fromUnit(spec, unit) })
}

/** Set any parameter from a [0,1] sample (enum/bool discretized); normalize. */
function withParam(
  settings: VectorizeSettings,
  spec: ParamSpec,
  sample: number,
): VectorizeSettings {
  if (spec.kind === 'bool') return normalizeSettings({ ...settings, [spec.key]: sample >= 0.5 })
  if (spec.kind === 'enum') {
    const values = spec.values ?? []
    const idx = Math.min(values.length - 1, Math.floor(sample * values.length))
    return normalizeSettings({ ...settings, [spec.key]: values[idx] })
  }
  return withParamUnit(settings, spec, sample)
}

/**
 * A Latin-hypercube design: `n` samples in `[0,1]^dims`, each dimension
 * stratified into `n` equal bins with one sample per bin, permuted independently
 * per dimension from `rand` (McKay, Beckman & Conover 1979).
 */
export function latinHypercube(n: number, dims: number, rand: () => number): number[][] {
  const samples: number[][] = Array.from({ length: n }, () => new Array<number>(dims))
  for (let d = 0; d < dims; d++) {
    const perm = Array.from({ length: n }, (_, i) => i)
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1))
      ;[perm[i], perm[j]] = [perm[j], perm[i]]
    }
    for (let i = 0; i < n; i++) samples[i][d] = (perm[i] + rand()) / n
  }
  return samples
}
