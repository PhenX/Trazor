/**
 * Each boundary's final description: the dynamic program's curve, or a
 * whole-boundary primitive (circle, ellipse, rectangle, rounded rectangle) or a
 * run of circular arcs when that is cheaper under the fit's objective.
 *
 * Both candidates are priced by one MDL cost, `½·χ² + λ·P`: the **curve** (the
 * program's path of lines, cubics and arcs, `./multimodel`) by its sampled χ²
 * against the points in path order and `P` its start point plus every
 * segment's parameters; the **offer** (`fitPrimitiveOrArcs`, `./primitives`)
 * by a whole primitive's own parameters and orthogonal χ², or an open arc
 * run's sampled χ² and its arcs plus its start point. The offer wins only when
 * strictly cheaper ({@link choose}); a tie or a NaN keeps the curve.
 *
 * {@link describe} skips work the choice would discard. When the boundary is
 * the image frame ({@link liesOnFrame}: one face touches every border pixel,
 * the background of most icons) the primitive search runs first, and when its
 * offer costs less than {@link costFloor} — a lower bound on the cost of every
 * fitted path of the polyline — the program is not run at all: the frame's
 * rectangle provably wins. Otherwise the result is exactly the plain choice.
 * Branch and bound on a dynamic program (Morin & Marsten 1976): the whole
 * program is the subproblem, the primitive the incumbent. The single-line part
 * of the floor is the smallest eigenvalue of the points' weighted scatter
 * matrix, the least squared distance to any line (Pearson 1901).
 *
 * Coordinates are px, y down, lattice corners on integers: the image frame is
 * the rectangle `[0, width] × [0, height]` (inkvec's pixel-centre frame at
 * `−0.5` and `width − 0.5`, shifted by ½).
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/choice.rs`.
 */
import type { FitConfig, FittedEdge } from '../planar/types'
import { cubicParams, PARAMS_LINE } from './cost'
import { fitPrimitiveOrArcs } from './primitives'
import type { PrimitiveOffer } from './primitives'

/** Smallest σ, px, the sampled χ² weighs a point by (as `curves.chi2`). */
const SIGMA_FLOOR = 1e-3

/** σ, px, of a point beyond the end of the σ list (as `curves.chi2`). */
const SIGMA_MISSING = 0.5

/**
 * The MDL cost of a description, `½·χ² + λ·params`, from the χ² and the
 * parameter count it records: for a fitted curve the sampled χ² against the
 * points in path order and its start point plus every segment's parameters.
 * Infinite for a path with no segments that is no primitive, as the sampled χ²
 * of an empty path is.
 */
export function descriptionCost(edge: FittedEdge, cfg: FitConfig): number {
  if (edge.segments.length === 0 && !edge.primitive) return Infinity
  return 0.5 * edge.chi2 + cfg.lambda * edge.params
}

/**
 * A lower bound on {@link descriptionCost} over every path of at least one
 * segment, with finite coordinates, fitted to the points (interleaved, px)
 * with uncertainties `sigma`: `min(6λ, (2 + c)λ, 4λ + ½·L)`, `c` the cubic's
 * price in force and `L` = {@link lineChi2Floor}. Minus infinity when `λ` is
 * negative or NaN, which proves nothing.
 *
 * Every segment costs at least two parameters (a line 2, a cubic `c ≥ 2`, an
 * arc 5 or 7) and the start point 2: two or more segments cost at least `6λ`,
 * one cubic `(2 + c)λ`, one arc at least `7λ`, one line `4λ` plus its χ², which
 * is at least the χ² of the whole straight line through it. The cost is
 * evaluated as `fl(fl(½χ²) + fl(λ·P))` with `χ² ≥ 0`, and rounding is
 * monotone, so it is at least these very expressions. O(n).
 */
export function costFloor(points: Float64Array, sigma: ArrayLike<number>, cfg: FitConfig): number {
  const lambda = cfg.lambda
  if (Number.isNaN(lambda) || lambda < 0) return -Infinity
  const twoSegments = lambda * (3 * PARAMS_LINE)
  const oneCubic = lambda * (2 + cubicParams())
  const oneLine = 0.5 * lineChi2Floor(points, sigma) + lambda * (2 * PARAMS_LINE)
  return Math.min(twoSegments, oneCubic, oneLine)
}

/**
 * A lower bound on the sampled χ² of any single straight segment against the
 * points: half the smallest eigenvalue of their weighted scatter matrix
 * `S = [[a, b], [b, d]]` about the weighted centroid,
 * `(a + d)/2 − √(((a − d)/2)² + b²)`, less `1e-9·(tr S + Σw·C²)` (`C` the
 * largest coordinate magnitude), which dwarfs the rounding of the scatter, its
 * eigenvalue and the quarter-pixel samples for any polyline under 2²⁰ points;
 * never below zero. Weights are `1/s²`, `s = max(σ, 1e-3)` px (0.5 where σ is
 * missing), as the sampled χ² weighs them. Zero for no points and for NaN or
 * infinite input. O(n).
 */
export function lineChi2Floor(points: Float64Array, sigma: ArrayLike<number>): number {
  const n = points.length >> 1
  const weight = (k: number): number => {
    const s = Math.max(k < sigma.length ? sigma[k] : SIGMA_MISSING, SIGMA_FLOOR)
    return 1 / (s * s)
  }
  let sw = 0
  let sx = 0
  let sy = 0
  let big = 0
  for (let k = 0; k < n; k++) {
    const w = weight(k)
    const x = points[2 * k]
    const y = points[2 * k + 1]
    sw += w
    sx += w * x
    sy += w * y
    big = Math.max(big, Math.abs(x), Math.abs(y))
  }
  // No points, or weights that are NaN: nothing to bound.
  if (Number.isNaN(sw) || sw <= 0) return 0
  const cx = sx / sw
  const cy = sy / sw
  let a = 0
  let b = 0
  let d = 0
  for (let k = 0; k < n; k++) {
    const w = weight(k)
    const dx = points[2 * k] - cx
    const dy = points[2 * k + 1] - cy
    a += w * dx * dx
    b += w * dx * dy
    d += w * dy * dy
  }
  const halfGap = 0.5 * (a - d)
  const smallest = 0.5 * (a + d) - Math.sqrt(halfGap * halfGap + b * b)
  const floor = 0.5 * smallest - 1e-9 * (a + d + sw * big * big)
  // `>` is false for NaN, so a NaN anywhere bounds nothing.
  return floor > 0 && Number.isFinite(floor) ? floor : 0
}

/**
 * Whether every point (interleaved, px) lies on the border of a
 * `width × height` image: on `x = 0`, `x = width`, `y = 0` or `y = height`, the
 * lattice lines the planar map puts the image edge on. False for no points.
 * Exact comparisons: the sub-pixel stage leaves frame edges alone and the
 * boundary solve keeps a frame point on its frame line, so a point on the
 * border is exactly on it. It only decides what to try first; the choice
 * itself rests on {@link costFloor}. O(n).
 */
export function liesOnFrame(points: Float64Array, width: number, height: number): boolean {
  const n = points.length >> 1
  if (n === 0) return false
  for (let k = 0; k < n; k++) {
    const x = points[2 * k]
    const y = points[2 * k + 1]
    if (!(x === 0 || y === 0 || x === width || y === height)) return false
  }
  return true
}

/**
 * The primitive search for a boundary (`fitPrimitiveOrArcs`), priced as a
 * description: a whole primitive as it comes (its own parameters, no start
 * point), an open run of arcs with its start point's {@link PARAMS_LINE}
 * numbers added to its parameters and cost, so it is priced on the same terms
 * as the curve it competes with. Null when nothing is offered.
 */
export function primitiveOffer(
  points: Float64Array,
  sigma: Float64Array,
  closed: boolean,
  cfg: FitConfig,
): PrimitiveOffer | null {
  const offer = fitPrimitiveOrArcs(points, sigma, closed, cfg)
  if (offer === null || offer.primitive) return offer
  return {
    ...offer,
    params: offer.params + PARAMS_LINE,
    cost: offer.cost + cfg.lambda * PARAMS_LINE,
  }
}

/** The fitted-edge record of an offer: its path form and primitive, without its cost. */
function offerEdge(offer: PrimitiveOffer): FittedEdge {
  const edge: FittedEdge = {
    x0: offer.x0,
    y0: offer.y0,
    segments: offer.segments,
    closed: offer.closed,
    params: offer.params,
    chi2: offer.chi2,
  }
  if (offer.primitive) edge.primitive = offer.primitive
  return edge
}

/**
 * The cheaper of the fitted `curve` and the primitive `offer`: the offer (its
 * path form, and its primitive when it is a whole one) when its cost is
 * strictly below {@link descriptionCost} of the curve, otherwise the curve. A
 * tie keeps the curve, and so does a NaN on either side.
 */
export function choose(
  curve: FittedEdge,
  offer: PrimitiveOffer | null,
  cfg: FitConfig,
): FittedEdge {
  if (offer !== null && offer.cost < descriptionCost(curve, cfg)) return offerEdge(offer)
  return curve
}

/**
 * A boundary's description (points interleaved, px; σ per point, px), with no
 * work the choice would discard. `frame` says the boundary is the image frame
 * ({@link liesOnFrame}); `fit` runs the dynamic program on it and is called at
 * most once. The result is exactly
 * `choose(fit(), primitiveOffer(points, sigma, closed, cfg), cfg)`: on the
 * frame the search runs first and the program is skipped when the offer is
 * below {@link costFloor}. Cost: one primitive search, plus the program unless
 * the frame's primitive is below the floor.
 */
export function describe(
  points: Float64Array,
  sigma: Float64Array,
  closed: boolean,
  cfg: FitConfig,
  frame: boolean,
  fit: () => FittedEdge,
): FittedEdge {
  const offer = primitiveOffer(points, sigma, closed, cfg)
  if (frame && offer !== null && offer.cost < costFloor(points, sigma, cfg)) {
    return offerEdge(offer)
  }
  return choose(fit(), offer, cfg)
}
