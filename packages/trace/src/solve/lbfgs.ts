/**
 * The descent of the boundary solve: limited-memory BFGS with a Moré–Thuente
 * line search on the projected path, run separately on each independent part
 * of the problem, and stopped on the projected gradient and the relative
 * decrease.
 *
 * **The problem.** Minimize an objective `E(x)` over `n` points `x_v`
 * (interleaved `x, y`), each held in the disc of radius `maxTotal`
 * ({@link MAX_TOTAL}) round its start `x⁰_v`, with a coordinate pinned by the
 * caller ({@link PIN_X}, {@link PIN_Y}) kept at its start value. `E` is
 * continuous and may be only piecewise smooth (the band energy's slope jumps
 * where a piece of boundary meets a gridline).
 *
 * **The method**, for each independent part, from the start:
 *
 * 1. *Stop test.* Stop when the projected gradient's largest point
 *    ({@link projectedGradientNorm}) is at most {@link PG_TOL} of the whole
 *    problem's largest gradient at the start; when the last step lowered the
 *    energy by less than {@link FUNC_TOL} of the whole problem's changeable
 *    energy at the start (its energy less `fixedEnergy`); after
 *    {@link MAX_ITERS} iterations or the caller's lower cap; when the line
 *    search finds no step of sufficient decrease; or when the caller's
 *    iteration budget for the whole descent is spent. Never on the length of a
 *    step.
 * 2. *Direction.* The L-BFGS two-loop recursion over the last {@link MEMORY}
 *    steps with the initial scaling `γ = sᵀy / yᵀy`, with the outward
 *    component removed at a point already on the edge of its disc (the tangent
 *    cone). A direction that is not downhill clears the memory and falls back
 *    to the projected steepest descent.
 * 3. *Step length.* Moré–Thuente (`linesearch.ts`), from the unit
 *    quasi-Newton step (on the first iteration, a move of `maxStep` for the
 *    furthest point), never beyond a move of `maxStep` ({@link MAX_STEP}),
 *    along the projected path `a ↦ P(x + a·d)` ({@link projectPath}). The
 *    path's slope `φ'(a)` is the gradient there dotted with the path's exact
 *    derivative ({@link pathSlope}), also where the projection is active.
 * 4. *Update.* Store the pair `(s, y)` when its curvature `yᵀs` exceeds
 *    `10⁻¹²·‖y‖·‖s‖`, and go to 1.
 *
 * **Sources.** Direction: D. C. Liu, J. Nocedal (1989), "On the limited
 * memory BFGS method for large scale optimization", Math. Programming 45; as
 * in J. Nocedal, S. J. Wright (2006), "Numerical Optimization", Algorithm 7.4
 * and §7.2. Constraints and stopping rule: after R. H. Byrd, P. Lu,
 * J. Nocedal, C. Zhu (1995), "A limited memory algorithm for bound
 * constrained optimization", SIAM J. Sci. Comput. 16(5) (L-BFGS-B), which
 * stops on the projected gradient and the relative reduction of the
 * objective and keeps the iterate feasible; the constraints here are discs
 * and pinned coordinates instead of boxes, so the direction is projected onto
 * the tangent cone of the active discs and the trial points onto the discs (a
 * projected-path search), and both thresholds are relative to the whole
 * problem at the start, whose scale differs by orders of magnitude between a
 * two-color logo and a crowded emoji. Per part: block-separable minimization,
 * as a sparse solver's independent residual blocks (Ceres Solver
 * documentation, `nnls_solving`); each part stops when it has converged
 * instead of every part paying for the slowest one.
 *
 * Nothing here depends on the pixel convention: the discs and pins are
 * relative to each point's start, so a coordinate pinned to the image frame
 * keeps whichever frame line the caller put it on (`0` or `width` in Trazor's
 * corner-on-integer frame, `−½` or `w − ½` in inkvec's).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt/lbfgs.rs`, with
 * the step caps `MAX_STEP` and `MAX_TOTAL` of `inkvec-trace/src/boundary_opt.rs`.
 */
import { MoreThuente } from './linesearch'
import type { LineSearchNext } from './linesearch'

/**
 * Steps remembered by the L-BFGS direction. inkvec measured three as good as
 * seven, fifteen or thirty on its icon screen set: the energy's kinks, not the
 * curvature model, set the pace.
 */
export const MEMORY = 3
/**
 * Iteration ceiling per independent part, inkvec's measured trade-off on its
 * 246-icon screen set (128 iterations read a fifth of a percent better dE00 at
 * 512 px for a trace 15 % slower).
 */
export const MAX_ITERS = 64
/**
 * Stop a part once an iteration lowers the energy by less than this fraction
 * of the whole problem's changeable energy at the start.
 */
export const FUNC_TOL = 1e-7
/**
 * Stop a part once its projected gradient's largest point is at most this
 * fraction of the whole problem's largest gradient at the start. On a
 * piecewise-smooth energy the gradient need not vanish at a minimum on a kink,
 * so this is the test for the smooth case.
 */
export const PG_TOL = 1e-6
/** Default largest move of any point in one step, in px. */
export const MAX_STEP = 0.35
/**
 * Default radius of the disc round its start a point stays in, in px: the
 * solve is a refinement of the boundary, not a search for it.
 */
export const MAX_TOTAL = 1

/** {@link LbfgsOptions.pin} bit: the point's x stays at its start. */
export const PIN_X = 1
/** {@link LbfgsOptions.pin} bit: the point's y stays at its start. */
export const PIN_Y = 2

/** Curvature below which a pair is not stored, relative to `‖y‖·‖s‖`. */
const CURVATURE_EPS = 1e-12
/** Relative slack under which a point counts as on the edge of its disc. */
const EDGE_EPS = 1e-9
/** Largest point of a direction below which it is no direction at all. */
const MIN_DIRECTION = 1e-12

/**
 * The objective: its value at `x` (every point, interleaved `x, y`), with its
 * gradient written over `grad` (same layout). `part` is the index into
 * {@link LbfgsOptions.parts} of the part being solved, or `-1` for the whole
 * problem (always `-1` when no parts are given). For a part, the value is that
 * part's energy alone, and only its points' gradient entries are read. The
 * objective must not modify `x`; a pinned coordinate's gradient entry is
 * ignored.
 */
export type Objective = (x: Float64Array, grad: Float64Array, part: number) => number

export interface LbfgsOptions {
  /**
   * The independent parts, each a list of point indices; no point in two
   * parts, and no term of the objective shared by two parts. Each part is
   * solved on its own, in this order; a point in no part keeps its start.
   * Default: one part holding every point.
   */
  parts?: readonly ArrayLike<number>[]
  /** Per point, {@link PIN_X} and/or {@link PIN_Y}: coordinates held at their start. */
  pin?: Uint8Array
  /** Radius of each point's disc round its start (positive; may be `Infinity`). Default {@link MAX_TOTAL}. */
  maxTotal?: number
  /** Largest move of any point in one step (positive, finite). Default {@link MAX_STEP}. */
  maxStep?: number
  /**
   * Iteration cap per part; it only lowers {@link MAX_ITERS}, so a cap at or
   * above the iterations a part takes changes nothing.
   */
  maxIters?: number
  /**
   * Iterations the whole descent may take, summed over the parts: checked
   * before each iteration, so once it is spent the parts not yet solved take no
   * step. Default: no budget.
   */
  iterationBudget?: number
  /**
   * The share of the energy no point can change (the band energy's residual of
   * the pixels no boundary touches). The relative-decrease test reads
   * decreases against the whole energy at the start less this. Default 0.
   */
  fixedEnergy?: number
  /** Called after each accepted step, for diagnostics. */
  onStep?: (step: LbfgsStep) => void
}

/** One accepted step, as {@link LbfgsOptions.onStep} reports it. */
export interface LbfgsStep {
  /** Index of the part, `-1` for the single whole-problem part. */
  part: number
  /** Iteration within the part, from 0. */
  iter: number
  /** The step length along the direction. */
  step: number
  /** Line-search trials (objective evaluations) the step took. */
  trials: number
  /** The part's energy after the step. */
  energy: number
  /** The decrease, relative to the whole problem's changeable energy at the start. */
  rel: number
  /** Largest distance any point moved. */
  moved: number
  /** The projected gradient's largest point before the step. */
  pg: number
}

export interface LbfgsResult {
  /** The solved positions, interleaved like the start. */
  x: Float64Array
  /** Sum of the parts' energies at the start. */
  before: number
  /** Sum of the parts' energies at the solution. */
  after: number
  /** Most iterations (accepted steps) any part took. */
  iters: number
  /** Objective evaluations, the whole problem's at the start included. */
  evals: number
}

/**
 * Minimize `objective` from `start` (interleaved `x, y` per point, left
 * untouched), one independent part at a time. Returns the solved positions,
 * or undefined when the energy did not fall or no part took a step.
 *
 * The whole problem is evaluated once at the start for the stopping tests'
 * denominators: its changeable energy and its largest gradient point. A part
 * measured against its own energy would keep iterating for gains that do not
 * move the whole problem (a frame edge, a speck) and would look converged
 * early when it is large; measured against the whole, each part stops when its
 * next step would not move the whole problem's energy, the test the unsplit
 * solve applies.
 */
export function lbfgsDescend(
  objective: Objective,
  start: Float64Array,
  options: LbfgsOptions = {},
): LbfgsResult | undefined {
  if (start.length % 2 !== 0) throw new RangeError('lbfgsDescend: start must hold x, y pairs')
  const n = start.length >> 1
  const maxTotal = options.maxTotal ?? MAX_TOTAL
  const maxStep = options.maxStep ?? MAX_STEP
  if (!(maxTotal > 0)) throw new RangeError('lbfgsDescend: maxTotal must be positive')
  if (!(maxStep > 0 && Number.isFinite(maxStep))) {
    throw new RangeError('lbfgsDescend: maxStep must be positive and finite')
  }
  const pin = options.pin ?? new Uint8Array(n)
  if (pin.length < n) throw new RangeError('lbfgsDescend: pin must have one entry per point')
  const pos = start.slice()
  const gfull = new Float64Array(start.length)
  // The whole problem at the start, for the stopping tests' denominators. No
  // point sits on its disc's edge there, so its gradient is also its projected
  // gradient.
  const eAll = objective(pos, gfull, -1)
  clearPinned(gfull, pin)
  const changeable = eAll - (options.fixedEnergy ?? 0)
  const ctx: Context = {
    objective,
    pos,
    gfull,
    maxTotal,
    maxStep,
    maxIters: Math.min(options.maxIters ?? MAX_ITERS, MAX_ITERS),
    scaleF: changeable > 1e-12 ? changeable : 1e-12,
    scalePg: maxPointNorm(gfull),
    onStep: options.onStep,
    budget: options.iterationBudget ?? Infinity,
    evals: 1,
  }
  const parts = options.parts
  let before = 0
  let after = 0
  let iters = 0
  const count = parts === undefined ? 1 : parts.length
  for (let k = 0; k < count; k++) {
    const ids = parts === undefined ? identity(n) : Uint32Array.from(parts[k])
    const part = new Part(ids, start, pin, pos)
    const r = solvePart(ctx, part, parts === undefined ? -1 : k)
    before += r.before
    after += r.after
    if (r.iters > iters) iters = r.iters
  }
  if (after >= before || iters === 0) return undefined
  return { x: pos, before, after, iters, evals: ctx.evals }
}

/** What every part's solve shares. */
interface Context {
  readonly objective: Objective
  /** Every point's current position. */
  readonly pos: Float64Array
  /** The objective's gradient buffer, every point. */
  readonly gfull: Float64Array
  readonly maxTotal: number
  readonly maxStep: number
  readonly maxIters: number
  /** The whole problem's changeable energy at the start. */
  readonly scaleF: number
  /** The whole problem's largest gradient point at the start. */
  readonly scalePg: number
  readonly onStep: ((step: LbfgsStep) => void) | undefined
  /** Iterations left to the whole descent. */
  budget: number
  evals: number
}

/** One remembered L-BFGS step: `s` the move, `y` the change of gradient, `rho = 1/yᵀs`. */
interface Pair {
  readonly s: Float64Array
  readonly y: Float64Array
  rho: number
}

/** A point accepted by the line search: the energy there and the step. */
interface Accepted {
  energy: number
  step: number
  trials: number
}

/**
 * L-BFGS on one part (the module docs' steps 1–4), for at most
 * `ctx.maxIters` iterations, its solution written into `ctx.pos`. Returns its
 * energy before and after and the iterations taken (steps accepted).
 */
function solvePart(
  ctx: Context,
  part: Part,
  index: number,
): { before: number; after: number; iters: number } {
  let e = part.evaluate(ctx, index, part.x, part.g)
  const e0 = e
  const mem: Pair[] = []
  let spare = newPair(part.x.length)
  let done = 0
  for (let it = 0; it < ctx.maxIters; it++) {
    if (ctx.budget <= 0) break
    // Step 1: the projected gradient is (relatively) zero, a stationary point
    // of the constrained problem.
    const pg = projectedGradientNorm(part.start, part.x, part.g, ctx.maxTotal)
    if (pg <= PG_TOL * ctx.scalePg) break
    // Step 2: the direction, kept inside the tangent cone of the active discs.
    const gd = descentDirection(part.g, mem, part.start, part.x, part.dir, ctx.maxTotal)
    const dmax = maxPointNorm(part.dir)
    if (!(dmax >= MIN_DIRECTION && gd < 0)) break
    // Step 3: the unit quasi-Newton step, or on the first iteration a move of
    // maxStep; never more than maxStep for the furthest point.
    const amax = ctx.maxStep / dmax
    const a0 = it === 0 ? amax : Math.min(amax, 1)
    const found = part.search(ctx, index, e, gd, a0, amax)
    if (found === undefined) break
    const rel = (e - found.energy) / ctx.scaleF
    if (ctx.onStep !== undefined) {
      ctx.onStep({
        part: index,
        iter: it,
        step: found.step,
        trials: found.trials,
        energy: found.energy,
        rel,
        moved: maxPointDistance(part.x, part.trial),
        pg,
      })
    }
    // Step 4: the curvature pair, then the step is taken.
    const keep = curvaturePair(part.x, part.trial, part.g, part.tg, spare)
    part.accept()
    e = found.energy
    done = it + 1
    ctx.budget--
    // Step 1's second test, on the step just taken: the relative decrease.
    if (rel < FUNC_TOL) break
    if (keep) {
      const evicted = mem.length === MEMORY ? mem.shift() : undefined
      mem.push(spare)
      spare = evicted ?? newPair(part.x.length)
    }
  }
  part.scatter(ctx.pos)
  return { before: e0, after: e, iters: done }
}

/**
 * The points of the part being solved, gathered out of the whole problem's,
 * and the buffers its iterations reuse: the current point `x` and its
 * gradient `g`, the direction, the trial point and its gradient, and the line
 * search's best trial.
 */
class Part {
  /** The part's points, as indices into the whole problem's. */
  readonly ids: Uint32Array
  /** Their start positions (the discs' centers). */
  readonly start: Float64Array
  readonly pin: Uint8Array
  x: Float64Array
  g: Float64Array
  readonly dir: Float64Array
  trial: Float64Array
  tg: Float64Array
  private readonly bestX: Float64Array
  private readonly bestG: Float64Array

  constructor(ids: Uint32Array, start: Float64Array, pin: Uint8Array, pos: Float64Array) {
    const m = ids.length
    this.ids = ids
    this.start = new Float64Array(2 * m)
    this.pin = new Uint8Array(m)
    this.x = new Float64Array(2 * m)
    for (let i = 0; i < m; i++) {
      const v = ids[i]
      this.start[2 * i] = start[2 * v]
      this.start[2 * i + 1] = start[2 * v + 1]
      this.x[2 * i] = pos[2 * v]
      this.x[2 * i + 1] = pos[2 * v + 1]
      this.pin[i] = pin[v]
    }
    this.g = new Float64Array(2 * m)
    this.dir = new Float64Array(2 * m)
    this.trial = this.x.slice()
    this.tg = new Float64Array(2 * m)
    this.bestX = this.x.slice()
    this.bestG = new Float64Array(2 * m)
  }

  /**
   * The energy with the part's points at `at` (written into the whole
   * positions, the rest unchanged), with the part's share of the gradient
   * gathered into `g`, zero along a pinned coordinate.
   */
  evaluate(ctx: Context, index: number, at: Float64Array, g: Float64Array): number {
    const { ids, pin } = this
    const { pos, gfull } = ctx
    for (let i = 0; i < ids.length; i++) {
      const v = ids[i]
      pos[2 * v] = at[2 * i]
      pos[2 * v + 1] = at[2 * i + 1]
    }
    const e = ctx.objective(pos, gfull, index)
    ctx.evals++
    for (let i = 0; i < ids.length; i++) {
      const v = ids[i]
      g[2 * i] = pin[i] & PIN_X ? 0 : gfull[2 * v]
      g[2 * i + 1] = pin[i] & PIN_Y ? 0 : gfull[2 * v + 1]
    }
    return e
  }

  /**
   * Step 3: the Moré–Thuente search along the projected path from `x` along
   * `dir`, from `φ(0) = e` with slope `gd`, first trying `a0`, never beyond
   * `amax`. On success `trial` and `tg` hold the accepted point and its
   * gradient. When the search stops on a later, worse trial, its best trial is
   * restored from the copy kept when it became the best, without evaluating it
   * again.
   */
  search(
    ctx: Context,
    index: number,
    e: number,
    gd: number,
    a0: number,
    amax: number,
  ): Accepted | undefined {
    const ls = new MoreThuente(e, gd, a0, amax)
    let bestA = Number.NaN
    let a: number
    let et: number
    let next: LineSearchNext
    do {
      a = ls.stp
      projectPath(this.start, this.pin, this.x, this.dir, a, ctx.maxTotal, this.trial)
      et = this.evaluate(ctx, index, this.trial, this.tg)
      const slope = pathSlope(this.start, this.x, this.dir, a, this.tg, ctx.maxTotal)
      next = ls.update(et, slope)
      const best = ls.best
      if (best !== undefined && best.step === a && bestA !== a) {
        bestA = a
        this.bestX.set(this.trial)
        this.bestG.set(this.tg)
      }
    } while (next === 'eval')
    // The strong Wolfe step is the trial just evaluated.
    if (next === 'converged') return { energy: et, step: a, trials: ls.evals }
    // Otherwise the best sufficient-decrease trial, when there was one.
    const best = ls.best
    if (best === undefined) return undefined
    if (best.step !== a) {
      this.trial.set(this.bestX)
      this.tg.set(this.bestG)
    }
    return { energy: best.value, step: best.step, trials: ls.evals }
  }

  /** Take the accepted trial as the current point. */
  accept(): void {
    const x = this.x
    this.x = this.trial
    this.trial = x
    const g = this.g
    this.g = this.tg
    this.tg = g
  }

  /** Write the part's current points into the whole positions. */
  scatter(pos: Float64Array): void {
    const { ids, x } = this
    for (let i = 0; i < ids.length; i++) {
      const v = ids[i]
      pos[2 * v] = x[2 * i]
      pos[2 * v + 1] = x[2 * i + 1]
    }
  }
}

/**
 * Step 2: the L-BFGS direction from the remembered pairs, projected onto the
 * tangent cone of the active discs; when that is not downhill, the memory is
 * cleared and the projected steepest descent taken instead. Returns `gᵀd`.
 */
function descentDirection(
  g: Float64Array,
  mem: Pair[],
  start: Float64Array,
  x: Float64Array,
  dir: Float64Array,
  maxTotal: number,
): number {
  lbfgsDirection(g, mem, dir)
  tangentCone(start, x, dir, maxTotal)
  let gd = dot(g, dir)
  if (gd >= 0) {
    mem.length = 0
    lbfgsDirection(g, mem, dir)
    tangentCone(start, x, dir, maxTotal)
    gd = dot(g, dir)
  }
  return gd
}

/**
 * The L-BFGS two-loop recursion (Nocedal & Wright Algorithm 7.4):
 * `dir = −H·g` with `H` the limited-memory inverse Hessian, scaled initially
 * by `γ = sᵀy / yᵀy` of the newest pair (the plain negative gradient with no
 * pairs stored). `mem` runs oldest first.
 */
function lbfgsDirection(g: Float64Array, mem: readonly Pair[], dir: Float64Array): void {
  const m = mem.length
  const len = g.length
  const alphas = new Float64Array(m)
  dir.set(g)
  for (let i = m - 1; i >= 0; i--) {
    const { s, y, rho } = mem[i]
    const a = rho * dot(s, dir)
    alphas[i] = a
    for (let k = 0; k < len; k++) dir[k] -= a * y[k]
  }
  let gamma = 1
  if (m > 0) {
    const { s, y } = mem[m - 1]
    const yy = dot(y, y)
    gamma = dot(s, y) / (yy > 1e-300 ? yy : 1e-300)
  }
  for (let k = 0; k < len; k++) dir[k] *= gamma
  for (let i = 0; i < m; i++) {
    const { s, y, rho } = mem[i]
    const b = rho * dot(y, dir)
    const c = alphas[i] - b
    for (let k = 0; k < len; k++) dir[k] += c * s[k]
  }
  for (let k = 0; k < len; k++) dir[k] = -dir[k]
}

/**
 * Step 4: the L-BFGS pair of the step from `x` to `trial` into `into` (`s` the
 * step, `y` the change of gradient from `g` to `tg`). Returns whether its
 * curvature `yᵀs` exceeds `10⁻¹²·‖y‖·‖s‖`; a pair that does not would make the
 * implied Hessian indefinite where the curvature condition could not be met (a
 * search ended at a kink), and is not stored.
 */
function curvaturePair(
  x: Float64Array,
  trial: Float64Array,
  g: Float64Array,
  tg: Float64Array,
  into: Pair,
): boolean {
  const { s, y } = into
  for (let k = 0; k < x.length; k++) {
    s[k] = trial[k] - x[k]
    y[k] = tg[k] - g[k]
  }
  const ys = dot(y, s)
  if (!(ys > CURVATURE_EPS * Math.sqrt(dot(y, y)) * Math.sqrt(dot(s, s)))) return false
  into.rho = 1 / ys
  return true
}

/**
 * Remove from each point's direction the outward normal component at a point
 * on the edge of its disc: the projection of `dir` onto the tangent cone of
 * the feasible set (Nocedal & Wright §16.7; L-BFGS-B keeps its direction
 * feasible the same way for boxes, by freezing the variables at a bound). A
 * step along the result moves such a point along the circle to first order
 * instead of into the projection, so the search path is close to a straight
 * line and `φ'(0) = gᵀd` holds. A pinned coordinate needs nothing here: its
 * gradient is zero, so is the direction there, and so is the normal.
 */
function tangentCone(
  start: Float64Array,
  x: Float64Array,
  dir: Float64Array,
  maxTotal: number,
): void {
  const edge = maxTotal * (1 - EDGE_EPS)
  for (let k = 0; k < x.length; k += 2) {
    const dx = x[k] - start[k]
    const dy = x[k + 1] - start[k + 1]
    const r = Math.sqrt(dx * dx + dy * dy)
    // maxTotal > 0, so a point on the edge is never at its start and r > 0.
    if (r < edge) continue
    const ux = dx / r
    const uy = dy / r
    const out = ux * dir[k] + uy * dir[k + 1]
    if (out > 0) {
      dir[k] -= out * ux
      dir[k + 1] -= out * uy
    }
  }
}

/**
 * The largest point of the projected gradient, `max_v |P_T(g_v)|`, with `P_T`
 * removing the outward normal component of `−g_v` at a point on the edge of
 * its disc (the steepest descent the constraint blocks): the stationarity
 * measure of L-BFGS-B (Byrd et al. 1995 §6, `‖P(x − g) − x‖∞`) for discs, zero
 * exactly at a first-order stationary point of the constrained problem. `g`
 * must be zero along pinned coordinates. Points are interleaved `x, y`.
 */
export function projectedGradientNorm(
  start: Float64Array,
  x: Float64Array,
  g: Float64Array,
  maxTotal: number,
): number {
  const edge = maxTotal * (1 - EDGE_EPS)
  let worst = 0
  for (let k = 0; k < x.length; k += 2) {
    let gx = g[k]
    let gy = g[k + 1]
    const dx = x[k] - start[k]
    const dy = x[k + 1] - start[k + 1]
    const r = Math.sqrt(dx * dx + dy * dy)
    if (r >= edge) {
      const ux = dx / r
      const uy = dy / r
      // Steepest descent −g points outward when g·u < 0.
      const gu = gx * ux + gy * uy
      if (gu < 0) {
        gx -= gu * ux
        gy -= gu * uy
      }
    }
    const norm = Math.sqrt(gx * gx + gy * gy)
    if (norm > worst) worst = norm
  }
  return worst
}

/**
 * `φ'(a)`, the slope of the objective along the projected path
 * `a ↦ P(x + a·dir)` at `a`, from the gradient `g` at that point:
 * `Σ_v g_v · dP_v/da`.
 *
 * For a point whose `z = x_v + a·d_v` lies inside its disc, `P` is the
 * identity and `dP_v/da = d_v`. Outside, `P(z) = s + R·u` with
 * `u = (z − s)/|z − s|` and `R = maxTotal`, whose derivative is
 * `dP_v/da = (R/|z − s|)·(d_v − (u·d_v)·u)`: the tangential part of the
 * motion, shrunk by the ratio of the radii. A pinned coordinate has `d` and
 * `g` zero and contributes nothing. This is the exact one-sided derivative of
 * the path {@link projectPath} evaluates, so the line search's slopes and
 * values agree.
 */
export function pathSlope(
  start: Float64Array,
  x: Float64Array,
  dir: Float64Array,
  a: number,
  g: Float64Array,
  maxTotal: number,
): number {
  let slope = 0
  for (let k = 0; k < x.length; k += 2) {
    const dx = x[k] + dir[k] * a - start[k]
    const dy = x[k + 1] + dir[k + 1] * a - start[k + 1]
    const r = Math.sqrt(dx * dx + dy * dy)
    let px = dir[k]
    let py = dir[k + 1]
    if (r > maxTotal) {
      const ux = dx / r
      const uy = dy / r
      const ud = ux * px + uy * py
      const shrink = maxTotal / r
      px = shrink * (px - ud * ux)
      py = shrink * (py - ud * uy)
    }
    slope += g[k] * px + g[k + 1] * py
  }
  return slope
}

/**
 * The projected path at `a`: `x + a·dir` into `out`, each point kept within
 * `maxTotal` of its start (scaled back radially onto the disc) and at its
 * start along a pinned coordinate. Points are interleaved `x, y`; `pin` has one
 * entry per point.
 */
export function projectPath(
  start: Float64Array,
  pin: Uint8Array,
  x: Float64Array,
  dir: Float64Array,
  a: number,
  maxTotal: number,
  out: Float64Array,
): void {
  for (let k = 0, v = 0; k < x.length; k += 2, v++) {
    let qx = x[k] + dir[k] * a
    let qy = x[k + 1] + dir[k + 1] * a
    const dx = qx - start[k]
    const dy = qy - start[k + 1]
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > maxTotal) {
      const s = maxTotal / d
      qx = start[k] + dx * s
      qy = start[k + 1] + dy * s
    }
    if (pin[v] & PIN_X) qx = start[k]
    if (pin[v] & PIN_Y) qy = start[k + 1]
    out[k] = qx
    out[k + 1] = qy
  }
}

/** `Σ_v a_v · b_v` over interleaved points, summed point by point. */
function dot(a: Float64Array, b: Float64Array): number {
  let sum = 0
  for (let k = 0; k < a.length; k += 2) sum += a[k] * b[k] + a[k + 1] * b[k + 1]
  return sum
}

/** The largest point norm `max_v |a_v|` (0 for none; a NaN point is skipped). */
function maxPointNorm(a: Float64Array): number {
  let worst = 0
  for (let k = 0; k < a.length; k += 2) {
    const norm = Math.sqrt(a[k] * a[k] + a[k + 1] * a[k + 1])
    if (norm > worst) worst = norm
  }
  return worst
}

/** The largest distance between corresponding points of `a` and `b`. */
function maxPointDistance(a: Float64Array, b: Float64Array): number {
  let worst = 0
  for (let k = 0; k < a.length; k += 2) {
    const dx = a[k] - b[k]
    const dy = a[k + 1] - b[k + 1]
    const d = Math.sqrt(dx * dx + dy * dy)
    if (d > worst) worst = d
  }
  return worst
}

/** Zero the gradient along every pinned coordinate. */
function clearPinned(g: Float64Array, pin: Uint8Array): void {
  for (let v = 0; v < g.length >> 1; v++) {
    if (pin[v] & PIN_X) g[2 * v] = 0
    if (pin[v] & PIN_Y) g[2 * v + 1] = 0
  }
}

function identity(n: number): Uint32Array {
  const ids = new Uint32Array(n)
  for (let i = 0; i < n; i++) ids[i] = i
  return ids
}

function newPair(len: number): Pair {
  return { s: new Float64Array(len), y: new Float64Array(len), rho: 0 }
}
