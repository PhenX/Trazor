/**
 * The multimodel program's table, filled endpoint by endpoint with provably
 * useless work skipped, without changing a bit of it.
 *
 * The program is a shortest path over the spans `i..j` of one opened boundary.
 * For points `0..n` with `best[0] = 0`,
 *
 *     base(i) = best[i] + (i > 0 ? vertexCost(i) : 0)
 *     best[j] = min over admissible i < j of  base(i) + min_model cost_model(i, j)
 *
 * where `cost_model` is the line, G1 cubic, circular arc or elliptical arc price
 * of `./candidates`, ties go to the smallest `i`, and a span is admissible when
 * `Limits.allows` it. Leaving a point makes it a vertex, which pays its turn. The
 * scan from a start stops after {@link PRUNE_PATIENCE} consecutive spans whose
 * line and cubic fidelity terms both exceed `PRUNE_SLACK·λ·PARAMS_LINE·(j − i)`
 * (covering `i..j` with the finest segmentation costs at least `2λ(j − i)`). A
 * curved model is fitted only when the line (for the ellipse, the best candidate
 * so far) already costs more than its parameter floor `λ·P` — a proof, not a
 * heuristic, that it could not otherwise win; the circle is also fitted wherever
 * the line's residual exceeds one per point, because it is the evidence for the
 * line's bow penalty.
 *
 * Bounds: almost every candidate loses, and the program reads a candidate only
 * through the minimum at `j`, the ellipse's price gate and the cut-off's "over"
 * test. So a model whose price floor already reaches the best at `j` needs no
 * residual, and a residual being summed stops once its partial sum settles all
 * three (`bestCubicBounded`). Every bound is a floor on an IEEE expression the
 * program itself evaluates (`fl(base + floor)` is monotone in both), so the
 * table is the unbounded one's bit for bit. The fill scores each endpoint's
 * candidates ("pull"), the likeliest winner first — the start that won `j − 1` —
 * so the rest meet a bound near the final `best[j]`: branch and bound inside a
 * dynamic program (Morin & Marsten 1976, Oper. Res. 24(4)), with the
 * per-candidate test of Killick, Fearnhead & Eckley (2012, JASA 107, without
 * PELT's permanent pruning, whose condition these costs break). A span whose cubic
 * is dead but whose line is over leaves its "over" answer unknown, and the
 * cut-off asks for it only when the last {@link PRUNE_PATIENCE} spans hold no
 * known "not over" — the same stop at the same span as counting every answer.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/multimodel/scan.rs`, without its
 * thread-parallel blocks (which decide only where spans are evaluated).
 */
import type { FitConfig } from '../planar/types'
import {
  Abandon,
  bestCubicBounded,
  bowPenalty,
  lineCostTerms,
  overTurnParams,
  tryArc,
  tryEllipse,
} from './candidates'
import type { ArcSpan } from './candidates'
import { CirclePrefix } from './circle'
import { arcParams, cubicParams, PARAMS_ELLIPTICAL_ARC, PARAMS_LINE } from './cost'
import { cubicFromArms, wobblePenalty } from './cubicfit'
import type { Vec } from './curves'
import type { Limits } from './limits'
import { PRUNE_SLACK } from './objective'
import type { PrefixSums } from './objective'
import { vertexCost } from './tangents'
import type { Tangents } from './tangents'

/**
 * Consecutive candidates that must exceed the cut-off before the scan from a
 * start stops. The line residual is monotone in the span, so one exceedance
 * would do for lines alone; the cubic residual is not (its end tangent changes
 * with `j`, and a badly fitting span can be followed by a longer one that fits).
 */
export const PRUNE_PATIENCE = 8

/** The model a segment of the program's fit was chosen from; circular and elliptical arcs share `arc`. */
export type SegKind = 'line' | 'cubic' | 'arc'

/** An arc's drawn shape: radii (px), rotation (radians) and SVG flags. */
export interface ArcShape {
  rx: number
  ry: number
  phi: number
  largeArc: boolean
  sweep: boolean
}

/** A segment's own unit end directions, start and end. */
export interface EndTangents {
  t0: Vec
  t1: Vec
}

/**
 * The program's table: for each point, the cheapest cost of reaching it and the
 * last segment of the path that does.
 */
export class Table {
  /** Cheapest cost (nats) of describing points `0..=j`; infinite where unreached. */
  readonly best: Float64Array
  /** Start of the last segment on that cheapest path; −1 for point 0. */
  readonly from: Int32Array
  /** That segment's model. */
  readonly kind: SegKind[]
  /** Its arms `d0, d1` (fractions of the chord) at `2j`, `2j + 1`; NaN unless a cubic. */
  readonly arms: Float64Array
  /** Its own end directions, when it is an arc. */
  readonly tans: (EndTangents | null)[]
  /** Its drawn shape, when it is an arc. */
  readonly arcs: (ArcShape | null)[]

  /** An empty table for `n` points: only point 0 is reached, at cost 0. */
  constructor(n: number) {
    this.best = new Float64Array(n).fill(Infinity)
    this.best[0] = 0
    this.from = new Int32Array(n).fill(-1)
    this.kind = new Array<SegKind>(n).fill('line')
    this.arms = new Float64Array(2 * n).fill(NaN)
    this.tans = new Array<EndTangents | null>(n).fill(null)
    this.arcs = new Array<ArcShape | null>(n).fill(null)
  }

  /** Take the span `i..j` as the way to reach `j` if it is cheaper than the best so far. */
  offer(i: number, j: number, c: Candidate): void {
    if (c.cost < this.best[j]) {
      this.best[j] = c.cost
      this.from[j] = i
      this.kind[j] = c.kind
      this.arms[2 * j] = c.d0
      this.arms[2 * j + 1] = c.d1
      this.tans[j] = c.tans
      this.arcs[j] = c.arc
    }
  }
}

/** What one candidate span offers: `base` plus its cheapest model's cost, and that model. */
export class Candidate {
  cost = Infinity
  kind: SegKind = 'line'
  /** Arms when a cubic, NaN otherwise. */
  d0 = NaN
  d1 = NaN
  tans: EndTangents | null = null
  arc: ArcShape | null = null
}

/** The cut-off's answer for one span: not over. */
export const OVER_NO = 0
/** Both fidelity terms exceed the floor. */
export const OVER_YES = 1
/** The line is over and the cubic, which cannot be offered, was not scored. */
export const OVER_UNKNOWN = 2

/** Who answers an unknown span's "over" question. */
export interface OverOracle {
  /** Whether the span `i..k` is over the cut-off floor. */
  cubicOver(i: number, k: number): boolean
}

/**
 * The scan's cut-off, fed one span at a time: the scan from a start stops at
 * the first span that ends {@link PRUNE_PATIENCE} consecutive "over"s, exactly as
 * a counter of every answer would, but unknown answers are looked up only when
 * the stop depends on them, latest first.
 */
export class CutOff {
  /** The latest span end known not to be over; the start itself before any. */
  private lastNo: number
  /** Span ends after `lastNo` whose answer is not known yet, oldest first. */
  private readonly pending = new Int32Array(PRUNE_PATIENCE)
  private len = 0

  constructor(i: number) {
    this.lastNo = i
  }

  /**
   * Record span `j`'s answer; true when the scan must stop after `j`. The spans
   * in `(lastNo, j]` are all "over" or unknown; when that window reaches
   * {@link PRUNE_PATIENCE} spans its unknowns are answered latest first by
   * `oracle.cubicOver(i, k)`, and the first "not over" moves `lastNo`.
   */
  push(j: number, over: number, oracle: OverOracle, i: number): boolean {
    if (over === OVER_NO) {
      this.lastNo = j
      this.len = 0
    } else if (over === OVER_UNKNOWN) {
      this.pending[this.len++] = j
    }
    if (j - this.lastNo < PRUNE_PATIENCE) return false
    while (this.len > 0) {
      this.len--
      const k = this.pending[this.len]
      if (!oracle.cubicOver(i, k)) {
        this.lastNo = k
        this.len = 0
        return false
      }
    }
    return true
  }
}

/** One start the pull fill is still extending. */
interface Start {
  i: number
  /** `base(i)`: the cost of reaching it and leaving it, nats. */
  base: number
  cut: CutOff
  /** The cut-off fired at the endpoint just scored. */
  stopped: boolean
}

/** A double and its two 32-bit words, low word first in memory on a little-endian host. */
const bits = new Float64Array(1)
const words = new Uint32Array(bits.buffer)
const LOW = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1 ? 0 : 1
const HIGH = 1 - LOW

/** Rust's `f64::next_up`: the least double above `x` (NaN and `+∞` unchanged). */
export function nextUp(x: number): number {
  if (Number.isNaN(x) || x === Infinity) return x
  if (x === 0) return Number.MIN_VALUE
  bits[0] = x
  if (x > 0) {
    words[LOW] += 1
    if (words[LOW] === 0) words[HIGH] += 1
  } else {
    if (words[LOW] === 0) words[HIGH] -= 1
    words[LOW] -= 1
  }
  return bits[0]
}

/**
 * Prices the candidate spans of one program run: {@link SpanScorer.terms} fits
 * the models a span offers, skipping what its bound proves useless, and
 * {@link SpanScorer.resolve} adds the cost of reaching the start with the
 * program's own expressions, in the same order.
 */
export class SpanScorer implements OverOracle {
  /** Skip what the table can never use; off only for the unbounded reference. */
  bounds = true
  private readonly n: number
  private readonly circles: CirclePrefix
  /** Each curved model's parameter price, `λ·P`, nats: the least it can cost. */
  private readonly cubicFloor: number
  private readonly arcFloor: number
  private readonly ellipseFloor: number
  // The last `terms` call's results, read by `resolve`.
  private line = 0
  private circle: ArcSpan | null = null
  private hasG1 = false
  private g1Chi2 = 0
  private g1Wobble = 0
  private g1Turn = 0
  private g1D0 = 0
  private g1D1 = 0
  private over = OVER_NO
  private readonly raw = new Float64Array(3)
  private readonly abandon = new Abandon()
  private readonly abandonOver = new Abandon()
  private readonly winner = new Candidate()
  private readonly rival = new Candidate()

  constructor(
    private readonly pts: Float64Array,
    private readonly sigma: Float64Array,
    private readonly tan: Tangents,
    private readonly pre: PrefixSums,
    private readonly cfg: FitConfig,
    /** Whether both ends of the polyline are joins (an opened loop). */
    private readonly joinsAtEnds: boolean,
  ) {
    this.n = pts.length >> 1
    this.circles = new CirclePrefix(pts, sigma)
    this.cubicFloor = cfg.lambda * cubicParams()
    this.arcFloor = cfg.lambda * arcParams()
    this.ellipseFloor = cfg.lambda * PARAMS_ELLIPTICAL_ARC
  }

  /**
   * An ellipse is asked about only where a circle has not already described
   * the span (it is two parameters dearer); "has not" includes the circle
   * declining outright, as it does on a strongly elliptical run.
   */
  private static ellipseAsked(i: number, j: number, circle: ArcSpan | null): boolean {
    return !(circle !== null && circle.chi2 <= 4 * (j - i)) && j >= i + 2
  }

  /** The cut-off's per-span floor, `PRUNE_SLACK·λ·PARAMS_LINE·(j − i)` nats. */
  private cutoffFloor(i: number, j: number): number {
    return PRUNE_SLACK * this.cfg.lambda * PARAMS_LINE * (j - i)
  }

  /**
   * Everything the span `i..j` offers that does not depend on the cost of
   * reaching `i`, scored against the bound `(bdBase, bdBest)`: a model priced at
   * least `floor` above `bdBase` is dead when `bdBase + floor ≥ bdBest`. With
   * `(0, ∞)` nothing is dead.
   */
  terms(i: number, j: number, bdBase: number, bdBest: number): void {
    const { pts, tan, cfg } = this
    const chi2L = this.pre.chi2Line(i, j)
    const linePlain = lineCostTerms(pts, tan, i, j, chi2L, cfg, this.joinsAtEnds)
    // The circle is asked for first: what it finds is evidence about the line
    // (the bow penalty). Its uses are the arc itself and that penalty, so when the
    // arc's floor and the bare line both reach the best at `j`, neither can be
    // offered, and the dearer ellipse cannot either.
    const circleUsed = !(bdBase + this.arcFloor >= bdBest && bdBase + linePlain >= bdBest)
    let circle: ArcSpan | null = null
    if (circleUsed && j >= i + 2 && (linePlain > this.arcFloor || chi2L > j - i)) {
      circle = tryArc(pts, tan, this.circles, i, j, cfg, this.joinsAtEnds)
    }
    const line = linePlain + (circle ? bowPenalty(chi2L, circle.chi2, j - i) : 0)
    // Both models must be over the floor: a line blows up at the first bend while
    // the cubic is still fine.
    const floor = this.cutoffFloor(i, j)
    const lineOver = 0.5 * chi2L > floor
    this.line = line
    this.circle = circle
    this.hasG1 = false
    this.over = OVER_NO
    // A cubic needs an interior point and costs `λ·cubicParams()` before any
    // residual: if the line already costs less its residual is never evaluated.
    if (j >= i + 2 && line > this.cubicFloor) this.cubicTerms(i, j, bdBase, bdBest, lineOver, floor)
  }

  /** The G1 cubic of a span the pre-check lets through, scored against the bound. */
  private cubicTerms(
    i: number,
    j: number,
    bdBase: number,
    bdBest: number,
    lineOver: boolean,
    floor: number,
  ): void {
    const { pts, tan, cfg } = this
    if (bdBase + this.cubicFloor >= bdBest) {
      // Its price alone reaches `best[j]`: never offered. Its residual is read only
      // by the cut-off, and only if the line is over too.
      if (lineOver) this.over = OVER_UNKNOWN
      return
    }
    // Where an ellipse may still be offered, a dropped cubic must be clear of its
    // gate: `½χ² ≥ (7λ − 6λ) + δ` puts its cost above the ellipse's floor with room
    // for every rounding (δ is 1e-9 relative).
    const gate =
      bdBase + this.ellipseFloor >= bdBest
        ? 0
        : 2 * (this.ellipseFloor - this.cubicFloor + 1e-9 * (Math.abs(bdBest) + cfg.lambda))
    const ab =
      bdBest === Infinity
        ? Abandon.NONE
        : this.abandon.reset(bdBase, bdBest, this.cubicFloor, gate, lineOver ? floor : -Infinity)
    const t0 = tan.outgoing[i]
    const tj = tan.incoming[j]
    const raw = this.pre.rawMoments(i, j, this.raw)
    const fit = bestCubicBounded(pts, this.sigma, this.pre.s, i, j, t0, tj, raw, ab)
    if (fit.kind === 'exact') {
      const pix = pts[2 * i]
      const piy = pts[2 * i + 1]
      const pjx = pts[2 * j]
      const pjy = pts[2 * j + 1]
      const chord = Math.hypot(pjx - pix, pjy - piy)
      const cb = cubicFromArms(pix, piy, pjx, pjy, t0, tj, chord, fit.d0, fit.d1)
      this.hasG1 = true
      this.g1Chi2 = fit.chi2
      this.g1Wobble = wobblePenalty(cb, cfg.lambda)
      this.g1Turn = cfg.lambda * overTurnParams(t0, tj)
      this.g1D0 = fit.d0
      this.g1D1 = fit.d1
      // An untried G1 cubic ("no admissible arms") is no evidence of
      // hopelessness, so only a fitted one makes a span over.
      if (lineOver && 0.5 * fit.chi2 > floor) this.over = OVER_YES
    } else if (fit.kind === 'dead') {
      if (lineOver && fit.over) this.over = OVER_YES
    }
  }

  /**
   * The cut-off's answer for a span `i..k` left unknown: its line is over and
   * its cubic cannot be offered, so only "is the best root's residual over the
   * floor" is asked, each root summed only until that is settled.
   */
  cubicOver(i: number, k: number): boolean {
    const floor = this.cutoffFloor(i, k)
    const fit = bestCubicBounded(
      this.pts,
      this.sigma,
      this.pre.s,
      i,
      k,
      this.tan.outgoing[i],
      this.tan.incoming[k],
      this.pre.rawMoments(i, k, this.raw),
      this.abandonOver.overOnly(floor),
    )
    if (fit.kind === 'exact') return 0.5 * fit.chi2 > floor
    if (fit.kind === 'dead') return fit.over
    return false
  }

  /**
   * The span's cheapest model, from the last {@link terms}, once `base` — the
   * cost of reaching `i` and leaving it — is known; `bestJ` is the table's value
   * at `j` now. Written into `out`.
   */
  resolve(i: number, j: number, base: number, bestJ: number, out: Candidate): void {
    const cubicFloor = this.cubicFloor
    let c = base + this.line
    let kind: SegKind = 'line'
    let d0 = NaN
    let d1 = NaN
    let tans: EndTangents | null = null
    let arc: ArcShape | null = null
    if (this.hasG1) {
      const cc = base + 0.5 * this.g1Chi2 + cubicFloor + this.g1Wobble + this.g1Turn
      if (cc < c) {
        c = cc
        kind = 'cubic'
        d0 = this.g1D0
        d1 = this.g1D1
      }
    }
    // The arc, tried on the same terms as the cubic: only once the line already
    // pays more than the arc's price, so straight runs never fit a circle.
    const circle = this.circle
    if (circle) {
      const cc = base + circle.cost
      if (cc < c) {
        c = cc
        kind = 'arc'
        d0 = NaN
        d1 = NaN
        tans = { t0: circle.t0, t1: circle.t1 }
        arc = {
          rx: circle.radius,
          ry: circle.radius,
          phi: 0,
          largeArc: circle.largeArc,
          sweep: circle.sweep,
        }
      }
    }
    // What an ellipse has to beat is the best candidate so far, not the line;
    // nor is one fitted whose price alone reaches the table's value at `j`.
    if (
      SpanScorer.ellipseAsked(i, j, circle) &&
      c - base > this.ellipseFloor &&
      !(this.bounds && base + this.ellipseFloor >= bestJ)
    ) {
      const e = tryEllipse(this.pts, this.sigma, this.tan, i, j, this.cfg, this.joinsAtEnds)
      if (e) {
        const cc = base + e.cost
        if (cc < c) {
          c = cc
          kind = 'arc'
          d0 = NaN
          d1 = NaN
          tans = { t0: e.t0, t1: e.t1 }
          arc = { rx: e.rx, ry: e.ry, phi: e.phi, largeArc: e.largeArc, sweep: e.sweep }
        }
      }
    }
    out.cost = c
    out.kind = kind
    out.d0 = d0
    out.d1 = d1
    out.tans = tans
    out.arc = arc
  }

  /** The over answer of the last {@link terms} call. */
  get lastOver(): number {
    return this.over
  }

  /**
   * Score the span `st.i..j` against `best` (the bound a candidate must beat),
   * feed the start's cut-off, and write what it offers into `out`.
   */
  private score(st: Start, j: number, best: number, out: Candidate): void {
    if (this.bounds) this.terms(st.i, j, st.base, best)
    else this.terms(st.i, j, 0, Infinity)
    const over = this.over
    this.resolve(st.i, j, st.base, best, out)
    st.stopped = st.cut.push(j, over, this, st.i)
  }

  /**
   * The program's table for the spans `lim` allows. Filled endpoint by endpoint
   * ("pull"): every `best[i]` a span to `j` needs is final before `j` is scored,
   * and the candidates for `j` are scored against the best found so far, the
   * span from the start that won `j − 1` first. The result is the start-by-start
   * fill's ({@link fillPush}) bit for bit: each span's price is the same
   * expression of the same final `base(i)`, a winner is replaced only by a cheaper
   * span or an equal one from an earlier start, and a span is skipped only when
   * its bound proves it cannot replace the winner. A start refused by `lim` at
   * `j` is refused at every later endpoint too, so it is dropped for good.
   */
  fillTable(lim: Limits): Table {
    if (!this.bounds) return this.fillPush(lim)
    const n = this.n
    const tab = new Table(n)
    const live: Start[] = []
    for (let j = 1; j < n; j++) {
      this.admit(tab, live, j)
      retain(live, (st) => lim.allows(st.i, j))
      if (live.length === 0) continue
      this.endpoint(tab, live, j)
      retain(live, (st) => !st.stopped)
    }
    return tab
  }

  /**
   * Add start `j − 1` once its cost is final (and finite): leaving it makes it
   * a vertex, which pays its turn.
   */
  private admit(tab: Table, live: Start[], j: number): void {
    const s = j - 1
    if (!Number.isFinite(tab.best[s])) return
    const base = tab.best[s] + (s > 0 ? vertexCost(this.tan, s, this.cfg) : 0)
    live.push({ i: s, base, cut: new CutOff(s), stopped: false })
  }

  /**
   * Endpoint `j`: the start that won `j − 1` first (the latest start when it is
   * gone), unbounded, then every other start against the winner so far. Ties go
   * to the earlier start, as the start-by-start fill's strict `<` over starts in
   * increasing order gives them: an earlier start is bounded just above the
   * winner's cost, a later one at it.
   */
  private endpoint(tab: Table, live: Start[], j: number): void {
    let guess = live.length - 1
    const prev = tab.from[j - 1]
    for (let k = 0; k < live.length; k++) {
      if (live[k].i === prev) {
        guess = k
        break
      }
    }
    let win = this.winner
    let other = this.rival
    this.score(live[guess], j, Infinity, win)
    let winI = live[guess].i
    for (let k = 0; k < live.length; k++) {
      if (k === guess) continue
      const st = live[k]
      const bound = st.i < winI ? nextUp(win.cost) : win.cost
      this.score(st, j, bound, other)
      if (other.cost < win.cost || (other.cost === win.cost && st.i < winI)) {
        const t = win
        win = other
        other = t
        winI = st.i
      }
    }
    tab.offer(winI, j, win)
  }

  /**
   * The table filled start by start, every span scored in full: the program
   * without its bounds, the reference the bounded fill is held to. The scan from
   * `i` ends at the span cap or at the first forced vertex after `i`, whichever is
   * first, or at the cut-off.
   */
  fillPush(lim: Limits): Table {
    const n = this.n
    const tab = new Table(n)
    const cand = this.winner
    for (let i = 0; i < n - 1; i++) {
      if (!Number.isFinite(tab.best[i])) continue
      const base = tab.best[i] + (i > 0 ? vertexCost(this.tan, i, this.cfg) : 0)
      const cut = new CutOff(i)
      const end = Math.min(i + lim.maxSpan + 1, lim.wallAfter(i) + 1, n)
      for (let j = i + 1; j < end; j++) {
        this.terms(i, j, 0, Infinity)
        const over = this.over
        this.resolve(i, j, base, Infinity, cand)
        tab.offer(i, j, cand)
        if (cut.push(j, over, this, i)) break
      }
    }
    return tab
  }
}

/** Keep the entries of `a` that pass `keep`, in order, in place. */
function retain<T>(a: T[], keep: (v: T) => boolean): void {
  let w = 0
  for (let r = 0; r < a.length; r++) if (keep(a[r])) a[w++] = a[r]
  a.length = w
}
