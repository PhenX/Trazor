/**
 * The step length of one L-BFGS iteration of the boundary solve: the
 * Moré–Thuente line search, which finds a step satisfying the strong Wolfe
 * conditions by safeguarded cubic and quadratic interpolation.
 *
 * Along the search path the objective is a function of one variable, `φ(a)`,
 * its value at the point a step of length `a` reaches; `φ(0)` is the current
 * value and `φ'(0) < 0` its slope along a descent direction. The step sought
 * satisfies the **strong Wolfe conditions**
 *
 * ```text
 * φ(a) ≤ φ(0) + μ·a·φ'(0)      (sufficient decrease, μ = FTOL)
 * |φ'(a)| ≤ η·|φ'(0)|          (curvature, η = GTOL)
 * ```
 *
 * Sufficient decrease alone holds for any step short enough, so a search that
 * only enforces it can stop at a small fraction of the step the objective
 * rewards. The curvature condition rules such steps out: a step at which the
 * slope is still as steep as at the start is too short, and the search
 * extrapolates. It also guarantees `yᵀs > 0` for the L-BFGS pair the step
 * produces, so the curvature model stays positive definite.
 *
 * Method: J. J. Moré, D. J. Thuente (1994), "Line search algorithms with
 * guaranteed sufficient decrease", ACM TOMS 20(3):286–307, Algorithm 1 with
 * the safeguarded step of §4, as in their MINPACK-2 routines `dcsrch` and
 * `dcstep`; textbook account in J. Nocedal, S. J. Wright (2006), "Numerical
 * Optimization", 2nd ed., §3.5. In outline:
 *
 * 1. Keep an interval of uncertainty `[stx, sty]` (unordered) whose end `stx`
 *    is the best step so far, starting from `stx = sty = 0`.
 * 2. Evaluate `φ` and `φ'` at the trial step. Stop when it satisfies both
 *    conditions.
 * 3. Otherwise choose the next trial with {@link cstep}: a cubic fitted to the
 *    values and slopes at `stx` and the trial, a quadratic, or a secant step,
 *    safeguarded so the interval shrinks; once the minimizer is bracketed the
 *    interval must shrink by {@link SHRINK} at least every second trial
 *    (bisect otherwise). Before a bracket exists the trial extrapolates to
 *    between {@link XTRAPL} and {@link XTRAPU} times the last step from `stx`,
 *    up to the largest step allowed.
 * 4. While no trial has both decreased the objective enough and turned the
 *    slope non-negative ("stage 1"), the steps are chosen on the auxiliary
 *    function `ψ(a) = φ(a) − φ(0) − μ·a·φ'(0)`, which guarantees that the
 *    step returned has sufficient decrease even when the curvature condition
 *    is never met.
 *
 * Adapted to the boundary solve:
 * - **A cap on trials** ({@link MAX_EVALS}): each trial renders the band, the
 *   whole cost of an iteration. At the cap the search ends on its best
 *   sufficient-decrease step when there is one, and reports failure otherwise.
 * - **A largest step** `stpmax`, set by the caller so no point moves more than
 *   the solve's per-step cap.
 * - **A piecewise-smooth objective.** The band energy is continuous but its
 *   slope jumps where a piece of boundary meets a gridline, so the curvature
 *   condition can be impossible to meet exactly at a kink. The cap ends such a
 *   search on the best sufficient-decrease step, the behavior A. S. Lewis,
 *   M. L. Overton (2013), "Nonsmooth optimization via quasi-Newton methods",
 *   Math. Program. 141:135–163, found reliable for BFGS on such functions.
 * - **No extra evaluation at the end.** Where `dcsrch` sets the step back to
 *   `stx` and asks for one more evaluation, this search stops and the caller
 *   takes {@link MoreThuente.best}, whose point it kept.
 *
 * The search runs in reverse communication, as `dcsrch` does: the caller
 * evaluates `φ` and `φ'` at {@link MoreThuente.stp} and hands them to
 * {@link MoreThuente.update}, so the objective (which owns the problem's
 * scratch) stays with the caller. Pure arithmetic: no allocation per trial
 * except a new best record.
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt/linesearch.rs`.
 */

/** The sufficient-decrease constant `μ` (Nocedal & Wright's `c1`). */
export const FTOL = 1e-4
/**
 * The curvature constant `η` (`c2`): the value recommended for quasi-Newton
 * directions (Nocedal & Wright §3.1; Moré & Thuente §1), loose enough that the
 * unit quasi-Newton step is usually accepted at once.
 */
export const GTOL = 0.9
/**
 * Relative width of the interval of uncertainty below which the search stops
 * (MINPACK-2's `xtol`, the value in its driver).
 */
export const XTOL = 0.1
/**
 * Most trials one search may take. Every trial renders the band; inkvec
 * measured 96.3 % of 13,285 accepted steps on 41 icons taking one trial,
 * 99.7 % at most two and none more than four.
 */
export const MAX_EVALS = 10
/**
 * Extrapolation window before a bracket exists: the next trial lies between
 * `stp + XTRAPL·(stp − stx)` and `stp + XTRAPU·(stp − stx)` (MINPACK-2's
 * `xtrapl`, `xtrapu`).
 */
export const XTRAPL = 1.1
export const XTRAPU = 4
/**
 * Required shrink of a bracketing interval over two trials, else bisect
 * (Moré & Thuente §4; MINPACK-2's `p66`).
 */
export const SHRINK = 0.66

/**
 * What {@link MoreThuente.update} asks for next: `'eval'` — evaluate at
 * {@link MoreThuente.stp} and call `update` again; `'converged'` — the step
 * last evaluated satisfies the strong Wolfe conditions; `'stop'` — no further
 * progress is possible in this search (rounding, the interval has shrunk to
 * {@link XTOL}, the step is pinned at a bound the conditions ask to pass, or
 * the trial cap), and {@link MoreThuente.best} holds the best
 * sufficient-decrease step, if any.
 */
export type LineSearchNext = 'eval' | 'converged' | 'stop'

/** A step of sufficient decrease and the value `φ` there. */
export interface LineSearchBest {
  readonly step: number
  readonly value: number
}

/**
 * The interval of uncertainty {@link cstep} updates in place: `stx` with `φ`
 * and `φ'` there (`fx`, `dx`), `sty` likewise, and whether the minimizer is
 * bracketed by them.
 */
interface Interval {
  stx: number
  fx: number
  dx: number
  sty: number
  fy: number
  dy: number
  brackt: boolean
}

/** One Moré–Thuente search (the saved state of MINPACK-2's `dcsrch`). */
export class MoreThuente {
  /** The trial step to evaluate next. */
  private next: number
  /** `φ(0)` and `φ'(0)`. */
  private readonly finit: number
  private readonly ginit: number
  /** `μ·φ'(0)`, the slope of the sufficient-decrease line. */
  private readonly gtest: number
  /** Stage 1 (steps chosen on the auxiliary `ψ`) or 2 (on `φ` itself). */
  private stage1 = true
  /** The interval of uncertainty, `stx` its best end. */
  private readonly iv: Interval
  /** The bounds the next trial is kept within. */
  private stmin = 0
  private stmax: number
  /** The interval's width now and one trial ago (for the shrink test). */
  private width: number
  private width1: number
  /** The bounds on every step. */
  private readonly stpmin = 0
  private readonly stpmax: number
  private count = 0
  private bestTrial: LineSearchBest | undefined = undefined

  /**
   * A search from `φ(0) = f0` with slope `φ'(0) = g0 < 0`, first trying
   * `stp`, never stepping beyond `stpmax`. `stp` is clamped into
   * `[0, stpmax]`.
   */
  constructor(f0: number, g0: number, stp: number, stpmax: number) {
    const first = maxNum(minNum(stp, stpmax), 0)
    this.next = first
    this.finit = f0
    this.ginit = g0
    this.gtest = FTOL * g0
    this.iv = { stx: 0, fx: f0, dx: g0, sty: 0, fy: f0, dy: g0, brackt: false }
    this.stmax = first + XTRAPU * first
    this.width = stpmax
    this.width1 = 2 * stpmax
    this.stpmax = stpmax
  }

  /** The trial step to evaluate. */
  get stp(): number {
    return this.next
  }

  /** The best step evaluated that satisfies sufficient decrease, and `φ` there. */
  get best(): LineSearchBest | undefined {
    return this.bestTrial
  }

  /** Trials evaluated so far. */
  get evals(): number {
    return this.count
  }

  /**
   * Hand in `φ(stp) = f` and `φ'(stp) = g` for the step last asked for, and
   * get what to do next: `dcsrch`'s body between two evaluations.
   */
  update(f: number, g: number): LineSearchNext {
    this.count++
    const stp = this.next
    const ftest = this.finit + stp * this.gtest
    // A non-finite value fails every comparison below: read it as no decrease,
    // so a degenerate input cannot hang the search.
    if (!Number.isFinite(f)) f = Infinity
    if (!Number.isFinite(g)) g = 0
    if (f <= ftest && (this.bestTrial === undefined || f < this.bestTrial.value)) {
      this.bestTrial = { step: stp, value: f }
    }
    if (this.stage1 && f <= ftest && g >= 0) this.stage1 = false
    const iv = this.iv
    // No better step can be found (MINPACK-2's warnings): rounding has made
    // the interval useless, the interval is within XTOL, or the step sits on a
    // bound while the conditions ask to go beyond it.
    if (iv.brackt && (stp <= this.stmin || stp >= this.stmax)) return 'stop'
    if (iv.brackt && this.stmax - this.stmin <= XTOL * this.stmax) return 'stop'
    if (stp >= this.stpmax && f <= ftest && g <= this.gtest) return 'stop'
    if (stp <= this.stpmin && (f > ftest || g >= this.gtest)) return 'stop'
    // The strong Wolfe conditions.
    if (f <= ftest && Math.abs(g) <= GTOL * -this.ginit) return 'converged'
    if (this.count >= MAX_EVALS) return 'stop'
    // The next trial. In stage 1, while the step has lowered φ below the best
    // so far but not below the sufficient-decrease line, it is chosen on
    // ψ = φ − φ(0) − μ·a·φ'(0) (Moré & Thuente §3): ψ's values and slopes are
    // φ's less the line's.
    let next: number
    if (this.stage1 && f <= iv.fx && f > ftest) {
      const gt = this.gtest
      iv.fx -= iv.stx * gt
      iv.fy -= iv.sty * gt
      iv.dx -= gt
      iv.dy -= gt
      next = cstep(iv, stp, f - stp * gt, g - gt, this.stmin, this.stmax)
      iv.fx += iv.stx * gt
      iv.fy += iv.sty * gt
      iv.dx += gt
      iv.dy += gt
    } else {
      next = cstep(iv, stp, f, g, this.stmin, this.stmax)
    }
    // A bracketing interval that two trials have not shrunk by SHRINK is
    // bisected.
    if (iv.brackt) {
      if (Math.abs(iv.sty - iv.stx) >= SHRINK * this.width1) next = iv.stx + 0.5 * (iv.sty - iv.stx)
      this.width1 = this.width
      this.width = Math.abs(iv.sty - iv.stx)
    }
    // The bounds of the next trial: the interval once bracketed, else an
    // extrapolation window beyond the last step.
    if (iv.brackt) {
      this.stmin = Math.min(iv.stx, iv.sty)
      this.stmax = Math.max(iv.stx, iv.sty)
    } else {
      this.stmin = next + XTRAPL * (next - iv.stx)
      this.stmax = next + XTRAPU * (next - iv.stx)
    }
    next = minNum(maxNum(next, this.stpmin), this.stpmax)
    this.next = next
    // When no progress is possible the best step is the answer.
    if (
      (iv.brackt && (next <= this.stmin || next >= this.stmax)) ||
      (iv.brackt && this.stmax - this.stmin <= XTOL * this.stmax)
    ) {
      return 'stop'
    }
    return 'eval'
  }
}

/**
 * The safeguarded step of Moré & Thuente §4 (MINPACK-2 `dcstep`): from the
 * interval end `stx` (the best step, `φ = fx`, `φ' = dx`), the other end `sty`
 * (`fy`, `dy`) and the trial `stp` (`fp`, `dp`), choose the next trial and
 * update the interval in place. Returns the next trial, kept finite.
 *
 * The interval update: a higher value at the trial replaces `sty`; otherwise
 * the trial becomes the best step, and the old best becomes `sty` when the
 * slopes changed sign.
 */
function cstep(
  iv: Interval,
  stp: number,
  fp: number,
  dp: number,
  stpmin: number,
  stpmax: number,
): number {
  const { stx, fx, dx } = iv
  // The sign of φ' at stp relative to φ' at stx.
  const sgnd = dp * (dx / Math.abs(dx))
  let stpf = nextTrial(iv, stp, fp, dp, stpmin, stpmax)
  const brackt = iv.brackt || fp > fx || sgnd < 0
  if (fp > fx) {
    iv.sty = stp
    iv.fy = fp
    iv.dy = dp
  } else {
    if (sgnd < 0) {
      iv.sty = stx
      iv.fy = fx
      iv.dy = dx
    }
    iv.stx = stp
    iv.fx = fp
    iv.dx = dp
  }
  iv.brackt = brackt
  // A degenerate cubic (0/0 when every value and slope is equal) gives NaN,
  // which would stall the search: take the interval's midpoint, or the far
  // bound.
  if (!Number.isFinite(stpf)) stpf = brackt ? 0.5 * (iv.stx + iv.sty) : stpmax
  return stpf
}

/**
 * The next trial of {@link cstep}, from the interval before its update.
 * Four cases, by what the trial says about the minimizer:
 *
 * 1. `fp > fx`: a higher value; the minimizer is bracketed between `stx` and
 *    `stp`. The cubic step if it is closer to `stx` than the quadratic one
 *    (through `fx`, `dx`, `fp`), else their midpoint.
 * 2. `fp ≤ fx` and the slopes at `stx` and `stp` have opposite signs:
 *    bracketed. Whichever of the cubic and the secant (through `dx`, `dp`)
 *    steps is further from `stp`.
 * 3. `fp ≤ fx`, same signs, `|dp| < |dx|`: the slope is shrinking. The cubic
 *    step when the cubic has its minimizer beyond `stp`, else a bound;
 *    compared with the secant step. Within a bracket, never closer to `sty`
 *    than {@link SHRINK} of the way.
 * 4. `fp ≤ fx`, same signs, `|dp| ≥ |dx|`: the slope is not shrinking. Within
 *    a bracket, the cubic through `stp` and `sty`; else a bound.
 *
 * The cubic through two points with values `fa`, `fb` and slopes `da`, `db`
 * has its minimizer at `a + r·(b − a)` with `θ = 3(fa − fb)/(b − a) + da + db`,
 * `γ = ±sqrt(θ² − da·db)` and `r = (γ − da + θ)/(2γ − da + db)`; each case
 * writes it as `dcstep` does.
 */
function nextTrial(
  iv: Interval,
  stp: number,
  fp: number,
  dp: number,
  stpmin: number,
  stpmax: number,
): number {
  const { stx, fx, dx, sty, fy, dy, brackt } = iv
  const sgnd = dp * (dx / Math.abs(dx))
  if (fp > fx) {
    // Case 1.
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp
    const g = cubicGamma(theta, dx, dp)
    const gamma = stp < stx ? -g : g
    const r = (gamma - dx + theta) / (gamma - dx + gamma + dp)
    const stpc = stx + r * (stp - stx)
    const stpq = stx + (dx / ((fx - fp) / (stp - stx) + dx) / 2) * (stp - stx)
    return Math.abs(stpc - stx) < Math.abs(stpq - stx) ? stpc : stpc + (stpq - stpc) / 2
  }
  if (sgnd < 0) {
    // Case 2.
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp
    const g = cubicGamma(theta, dx, dp)
    const gamma = stp > stx ? -g : g
    const r = (gamma - dp + theta) / (gamma - dp + gamma + dx)
    const stpc = stp + r * (stx - stp)
    const stpq = stp + (dp / (dp - dx)) * (stx - stp)
    return Math.abs(stpc - stp) > Math.abs(stpq - stp) ? stpc : stpq
  }
  if (Math.abs(dp) < Math.abs(dx)) {
    // Case 3. The cubic step only when the cubic tends to infinity in the
    // direction of the step or its minimizer lies beyond stp; else a bound.
    const theta = (3 * (fx - fp)) / (stp - stx) + dx + dp
    const g = cubicGamma(theta, dx, dp)
    const gamma = stp > stx ? -g : g
    const r = (gamma - dp + theta) / (gamma + (dx - dp) + gamma)
    let stpc: number
    if (r < 0 && gamma !== 0) stpc = stp + r * (stx - stp)
    else stpc = stp > stx ? stpmax : stpmin
    const stpq = stp + (dp / (dp - dx)) * (stx - stp)
    if (brackt) {
      const pick = Math.abs(stpc - stp) < Math.abs(stpq - stp) ? stpc : stpq
      const limit = stp + SHRINK * (sty - stp)
      return stp > stx ? minNum(pick, limit) : maxNum(pick, limit)
    }
    const pick = Math.abs(stpc - stp) > Math.abs(stpq - stp) ? stpc : stpq
    return maxNum(minNum(pick, stpmax), stpmin)
  }
  if (brackt) {
    // Case 4, bracketed: the cubic through stp and sty.
    const theta = (3 * (fp - fy)) / (sty - stp) + dp + dy
    const g = cubicGamma(theta, dp, dy)
    const gamma = stp > sty ? -g : g
    const r = (gamma - dp + theta) / (gamma - dp + gamma + dy)
    return stp + r * (sty - stp)
  }
  // Case 4, not bracketed: the bound in the direction of the step.
  return stp > stx ? stpmax : stpmin
}

/**
 * `|γ| = sqrt(θ² − da·db)` of the cubic with slopes `da`, `db` at its two
 * points, scaled by `s = max(|θ|, |da|, |db|)` against overflow and with the
 * radicand clamped at zero (a NaN radicand included), as `dcstep` computes it.
 * The caller gives `γ` its sign.
 */
function cubicGamma(theta: number, da: number, db: number): number {
  const s = maxNum(maxNum(Math.abs(theta), Math.abs(da)), Math.abs(db))
  const t = theta / s
  const rad = t * t - (da / s) * (db / s)
  return s * Math.sqrt(rad > 0 ? rad : 0)
}

/** The larger of two numbers, ignoring a NaN (IEEE 754 `maxNum`). */
function maxNum(a: number, b: number): number {
  if (Number.isNaN(a)) return b
  if (Number.isNaN(b)) return a
  return a > b ? a : b
}

/** The smaller of two numbers, ignoring a NaN (IEEE 754 `minNum`). */
function minNum(a: number, b: number): number {
  if (Number.isNaN(a)) return b
  if (Number.isNaN(b)) return a
  return a < b ? a : b
}
