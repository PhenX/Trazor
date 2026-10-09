/**
 * The boundary solve (analysis by synthesis): move every boundary point of the
 * planar map at once so that the geometry's exact rendered coverage matches the
 * image.
 *
 * Every stage before this one decides a point on its own: the map puts it on
 * the lattice, the sub-pixel stage slides it along its own normal, the junction
 * stage intersects the edges at a node. A pixel's value is the area coverage of
 * every face that touches it, so a point's neighbors change what that pixel
 * should read, and a pixel says nothing about motion along the boundary. So the
 * boundary is solved as one problem: every point is an unknown (the open edges
 * ending at a node share the node's), and the objective is the rendering error
 * of `band.ts` plus its kink and anchor priors, scaled to the data term:
 *
 * ```text
 * w_kink   = K_KINK   · D₀ / K₀    (the kink term starts at 5 % of the data term)
 * w_anchor = K_ANCHOR · D₀ / n     (1 px costs a tenth of a point's share of it)
 * ```
 *
 * with `D₀` the starting residual of the pixels the boundary cuts and `K₀` the
 * starting kink sum, so they mean the same on a two-color logo and on a crowded
 * emoji. The problem splits into independent parts (boundaries sharing no
 * unknown and no band run), each minimized by L-BFGS with a Moré–Thuente line
 * search (`lbfgs.ts`): no point moves more than 0.35 px a step nor ends more
 * than 1 px from its start, a point on the image frame only slides along it,
 * and a part stops on its projected gradient or its relative decrease, both
 * measured against the whole problem at the start (its changeable energy is
 * its energy less the residual of the band pixels no boundary touches), or
 * after 64 iterations. Nothing is linearized: every trial re-renders the exact
 * coverage. The stopping rules count iterations, never time, so the result
 * depends only on the input. Afterwards the fold guard (`folds.ts`) backs off
 * only the boundaries in a self-crossing the solve made.
 *
 * Method: Chan–Vese region fidelity over a narrow band with exact box
 * coverage (see `band.ts`); L-BFGS after Liu & Nocedal 1989 with the stopping
 * rule of L-BFGS-B (Byrd, Lu, Nocedal & Zhu 1995) and the line search of Moré
 * & Thuente 1994 (see `lbfgs.ts`, `linesearch.ts`).
 *
 * After inkvec (Apache-2.0): `inkvec-trace/src/boundary_opt.rs`
 * (`optimise_alpha_capped`, `write_back`) and
 * `inkvec-trace/src/boundary_opt/lbfgs.rs` (`descend`, the prior weights).
 */
import { syncNodes } from '../planar/types'
import type { FaceFill, PlanarMap, PremultipliedImage } from '../planar/types'
import { BandProblem, buildUnknowns, pinFrame, tableBudget } from './band'
import { foldGuard } from './folds'
import { lbfgsDescend } from './lbfgs'
import type { LbfgsStep } from './lbfgs'

/** Kink weight: the kink term starts at this fraction of the data term. */
export const K_KINK = 0.05
/** Anchor weight: a point 1 px from its start costs this fraction of a point's share of the data term. */
export const K_ANCHOR = 0.1

export interface SolveOptions {
  /**
   * Iterations per independent part (it only lowers the solver's own ceiling
   * of 64, so a cap at or above what a part takes changes nothing).
   */
  maxIterations?: number
  /** Iterations the whole solve may take, summed over its parts. Default: none. */
  iterationBudget?: number
  /** Most band-table entries; default {@link tableBudget} of the map's size. */
  tableBudget?: number
  /** Called after each accepted step, for diagnostics. */
  onStep?: (step: LbfgsStep) => void
}

/**
 * Why a solve changed the map or left it alone: `solved`; `degenerate` (no
 * edges, an empty map, fewer than three unknowns, or no point with a kink
 * term); `over-budget` (the band's tables would pass the budget);
 * `no-residual` (the image already matches the map where the boundary cuts);
 * `no-gain` (the energy did not fall, or no part took a step).
 */
export type SolveOutcome = 'solved' | 'degenerate' | 'over-budget' | 'no-residual' | 'no-gain'

/** What the solve did. Every field but `outcome` is 0 (and `scale` 1) when it did nothing. */
export interface SolveReport {
  outcome: SolveOutcome
  /** Energy before the solve (the sum over the solved parts). */
  before: number
  /** Energy after the solve, before the fold guard backed anything off. */
  after: number
  /** Most iterations any independent part took. */
  iters: number
  /** Edge points moved by more than 10⁻⁶ px (a shared end once per edge). */
  moved: number
  /** Share of the solved displacement the fold guard kept. */
  scale: number
  /** Independent parts solved. */
  parts: number
  /** Energy evaluations. */
  evals: number
}

/**
 * Solve the boundary of `map` against `image` (premultiplied encoded sRGB
 * RGBA, the map's size) with each face's paint `fills[face]`, in place. On
 * success every edge's points, and every node's position, are overwritten
 * (sigmas are not touched; a boundary the fold guard backed off keeps part or
 * none of its displacement). Otherwise the map is left as it was.
 */
export function solveBoundaries(
  map: PlanarMap,
  image: PremultipliedImage,
  fills: readonly FaceFill[],
  opts: SolveOptions = {},
): SolveReport {
  const report: SolveReport = {
    outcome: 'degenerate',
    before: 0,
    after: 0,
    iters: 0,
    moved: 0,
    scale: 1,
    parts: 0,
    evals: 0,
  }
  if (map.width === 0 || map.height === 0 || map.edges.length === 0) return report
  const u = buildUnknowns(map)
  pinFrame(map, u)
  const n = u.count
  if (n < 3) return report
  const prob = new BandProblem(map, u, image, fills)
  if (!prob.setup(opts.tableBudget ?? tableBudget(map.width, map.height))) {
    report.outcome = 'over-budget'
    return report
  }
  const data0 = prob.cutResidual
  prob.wKink = 1
  prob.wAnchor = 0
  const kink0 = prob.priors(u.start, null)
  if (!(data0 > 0)) {
    report.outcome = 'no-residual'
    return report
  }
  if (!(kink0 > 0)) return report
  prob.wKink = (K_KINK * data0) / kink0
  prob.wAnchor = (K_ANCHOR * data0) / n
  const parts = prob.components()
  const result = lbfgsDescend(
    (x, grad, part) => {
      prob.active = part < 0 ? null : parts[part]
      return prob.energy(x, grad)
    },
    u.start,
    {
      parts: parts.map((p) => p.vars),
      pin: u.pin,
      maxIters: opts.maxIterations,
      iterationBudget: opts.iterationBudget,
      fixedEnergy: prob.restResidual,
      onStep: opts.onStep,
    },
  )
  prob.active = null
  if (result === undefined) {
    report.outcome = 'no-gain'
    report.parts = parts.length
    return report
  }
  const guarded = foldGuard(map, u, result.x)
  report.outcome = 'solved'
  report.before = result.before
  report.after = result.after
  report.iters = result.iters
  report.scale = guarded.scale
  report.parts = parts.length
  report.evals = result.evals
  report.moved = writeBack(map, u.of, u.node, guarded.pos)
  return report
}

/**
 * Copy the solved unknowns onto every edge's points and every node, and count
 * the edge points that moved by more than 10⁻⁶ px (a shared end once per edge).
 */
function writeBack(
  map: PlanarMap,
  of: readonly Int32Array[],
  node: Int32Array,
  pos: Float64Array,
): number {
  let moved = 0
  for (let k = 0; k < map.edges.length; k++) {
    const pts = map.edges[k].points
    const ids = of[k]
    for (let i = 0; i < ids.length; i++) {
      const x = pos[2 * ids[i]]
      const y = pos[2 * ids[i] + 1]
      if (Math.hypot(pts[2 * i] - x, pts[2 * i + 1] - y) > 1e-6) moved++
      pts[2 * i] = x
      pts[2 * i + 1] = y
    }
  }
  for (let v = 0; v < node.length; v++) {
    if (node[v] < 0) continue
    map.nodes[node[v]].x = pos[2 * v]
    map.nodes[node[v]].y = pos[2 * v + 1]
  }
  syncNodes(map)
  return moved
}
