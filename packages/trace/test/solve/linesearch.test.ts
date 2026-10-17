import { describe, expect, it } from 'vitest'
import { FTOL, GTOL, MAX_EVALS, MoreThuente } from '../../src/solve/linesearch'
import type { LineSearchNext } from '../../src/solve/linesearch'

/** `φ(a)` and `φ'(a)`. */
type Phi = (a: number) => [number, number]

/** What a driven search ended with: the outcome, the step it stands on, and the trials. */
interface Run {
  outcome: LineSearchNext
  step: number
  evals: number
  trials: number[]
}

/**
 * Drive a search on `phi` from `stp`, as the solver does: on `converged` the
 * last trial, on `stop` the best sufficient-decrease trial (undefined when
 * there is none).
 */
function drive(phi: Phi, stp: number, stpmax: number): Run | undefined {
  const [f0, g0] = phi(0)
  const ls = new MoreThuente(f0, g0, stp, stpmax)
  const trials: number[] = []
  for (;;) {
    const a = ls.stp
    expect(a, `trial ${a} outside (0, ${stpmax}]`).toBeGreaterThan(0)
    expect(a).toBeLessThanOrEqual(stpmax)
    trials.push(a)
    expect(trials.length, 'more than MAX_EVALS trials').toBeLessThanOrEqual(MAX_EVALS)
    const [f, g] = phi(a)
    const next = ls.update(f, g)
    expect(ls.evals).toBe(trials.length)
    if (next === 'eval') continue
    if (next === 'converged') return { outcome: next, step: a, evals: trials.length, trials }
    const best = ls.best
    return best && { outcome: next, step: best.step, evals: trials.length, trials }
  }
}

/** Whether `a` satisfies the strong Wolfe conditions for `phi`. */
function strongWolfe(phi: Phi, a: number): boolean {
  const [f0, g0] = phi(0)
  const [f, g] = phi(a)
  return f <= f0 + FTOL * a * g0 && Math.abs(g) <= GTOL * Math.abs(g0)
}

/** Moré & Thuente's function 1, `φ(a) = −a/(a² + β)` with `β = 2`: minimizer `√2`. */
const mt1: Phi = (a) => {
  const b = 2
  return [-a / (a * a + b), (a * a - b) / (a * a + b) ** 2]
}

describe('MoreThuente', () => {
  it('converges to a Wolfe step on a quadratic from any start', () => {
    const phi: Phi = (a) => [(a - 2) ** 2, 2 * (a - 2)]
    for (const stp of [1e-3, 0.1, 1, 2, 3.5, 10]) {
      const r = drive(phi, stp, 100)
      expect(r, `start ${stp}`).toBeDefined()
      expect(r!.outcome, `start ${stp}`).toBe('converged')
      expect(strongWolfe(phi, r!.step), `start ${stp}: ${r!.step}`).toBe(true)
    }
  })

  it("reaches a Wolfe step on Moré & Thuente's function 1 from the paper's starts", () => {
    // The paper's tolerances are μ = 1e-3, η = 0.1; the guarantee tested is
    // theirs: a strong Wolfe step within the trial cap.
    for (const stp of [1e-3, 1e-1, 1e1, 1e3]) {
      const r = drive(mt1, stp, 1e4)
      expect(r, `start ${stp}`).toBeDefined()
      expect(r!.outcome, `start ${stp}`).toBe('converged')
      expect(strongWolfe(mt1, r!.step), `start ${stp}: ${r!.step}`).toBe(true)
    }
  })

  it('extends a short first step instead of accepting it', () => {
    const phi: Phi = (a) => [(a - 1) ** 2, 2 * (a - 1)]
    const r = drive(phi, 0.01, 10)!
    expect(r.step).toBeGreaterThan(0.1)
    expect(strongWolfe(phi, r.step)).toBe(true)
    // Extrapolation stays within the window [1.1, 4] times the last step.
    for (let i = 1; i < r.trials.length && r.trials[i] > r.trials[i - 1]; i++) {
      expect(r.trials[i]).toBeLessThanOrEqual(r.trials[i - 1] + 4 * r.trials[i - 1] + 1e-12)
    }
  })

  it('accepts the first trial when it already satisfies both conditions', () => {
    const phi: Phi = (a) => [(a - 1) ** 2, 2 * (a - 1)]
    const r = drive(phi, 1, 10)!
    expect(r.outcome).toBe('converged')
    expect(r.evals).toBe(1)
    expect(r.step).toBe(1)
  })

  it('stops at the largest step when the minimizer lies beyond it', () => {
    // The slope stays steeper than GTOL of the start's all the way to stpmax,
    // so no step within it meets the curvature condition.
    const phi: Phi = (a) => [-a + 0.01 * a * a, -1 + 0.02 * a]
    const r = drive(phi, 0.5, 1)!
    expect(r.outcome).toBe('stop')
    expect(r.step).toBe(1)
  })

  it('clamps the first trial into (0, stpmax]', () => {
    const ls = new MoreThuente(0, -1, 5, 2)
    expect(ls.stp).toBe(2)
    expect(new MoreThuente(0, -1, Number.NaN, 2).stp).toBe(2)
  })

  it('ends a kinked function on a sufficient-decrease step', () => {
    // |a − 1| meets the strong curvature condition only exactly at the kink;
    // the search must still end, within the cap, on a step of sufficient
    // decrease.
    const phi: Phi = (a) => [Math.abs(a - 1) - 1, a < 1 ? -1 : 1]
    const r = drive(phi, 0.3, 10)!
    const [f0, g0] = phi(0)
    const [f] = phi(r.step)
    expect(f).toBeLessThanOrEqual(f0 + FTOL * r.step * g0)
    expect(r.evals).toBeLessThanOrEqual(MAX_EVALS)
  })

  it('reports no step when the function only rises', () => {
    // A slope that claims descent but a function that only rises: no
    // sufficient decrease exists, and the search must say so.
    const phi: Phi = (a) => (a === 0 ? [0, -1] : [1 + a, 1])
    expect(drive(phi, 1, 10)).toBeUndefined()
  })

  it('keeps the step in its bounds and does not hang on NaN', () => {
    const phi: Phi = (a) => (a > 0.5 ? [Number.NaN, Number.NaN] : [(a - 0.4) ** 2, 2 * (a - 0.4)])
    const r = drive(phi, 1, 2)!
    expect(r.step).toBeLessThanOrEqual(0.5)
  })

  it('keeps the best sufficient-decrease trial when a later one is worse', () => {
    // A steep wall right past a shallow descent: every trial past it is worse,
    // and the best trial is the one the search stands on.
    const phi: Phi = (a) => (a < 0.3 ? [-a, -1] : [-0.3 + 100 * (a - 0.3), 100])
    const [f0, g0] = phi(0)
    const ls = new MoreThuente(f0, g0, 0.2, 10)
    let next: LineSearchNext
    let bestSeen = Infinity
    do {
      const [f, g] = phi(ls.stp)
      if (f <= f0 + FTOL * ls.stp * g0) bestSeen = Math.min(bestSeen, f)
      next = ls.update(f, g)
    } while (next === 'eval')
    expect(ls.best).toBeDefined()
    expect(ls.best!.value).toBe(bestSeen)
    expect(phi(ls.best!.step)[0]).toBe(ls.best!.value)
  })

  it('is deterministic', () => {
    const a = drive(mt1, 1e-3, 1e4)!
    const b = drive(mt1, 1e-3, 1e4)!
    expect(b.trials).toEqual(a.trials)
  })
})
