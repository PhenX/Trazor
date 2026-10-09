/**
 * The prices the fit charges: the parameter count of every segment kind and the
 * turn charged as a full corner, chosen per trace rather than per process.
 *
 * Every fitter minimizes `E = ½·χ² + λ·P + breaks`, in nats: `½·χ²` is the
 * Gaussian negative log-likelihood of the measured points given the emitted
 * geometry, `λ` (`FitConfig.lambda`) the price of writing one number, `P`
 * the numbers a segment writes (a line {@link PARAMS_LINE}, a cubic
 * {@link cubicParams}, a circular arc {@link arcParams}, an elliptical arc
 * {@link PARAMS_ELLIPTICAL_ARC}; a segment's start is the previous one's end and
 * is not charged again), and a join where the tangent turns costs up to one more
 * parameter, ramping quadratically up to {@link g1BreakRadians}.
 *
 * Two prices decide how willing the fit is to draw a curve: what one Bézier
 * costs, and the turn at a join charged as a full corner. A caller sets them for
 * one trace with {@link withCostModel}; a trace that asks for nothing runs at
 * {@link STANDARD_COST_MODEL}. The prices in force are module state, read by
 * every fitter; a scope restores the standard prices when it ends, and a scope
 * opened inside another inherits the outer one.
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/cost.rs`, the price constants of
 * `lib.rs`, `curves.rs`, `tangents.rs`, `multimodel.rs` and `candidates/turn.rs`.
 */

/** Parameters a line adds to the document: its endpoint `(x, y)`. */
export const PARAMS_LINE = 2

/** Parameters a cubic adds by default: two control points and an endpoint. */
export const PARAMS_CUBIC = 6

/**
 * Parameters charged for a circular arc by default: one radius, two flags
 * charged a full parameter each (a choice the designer makes when editing) and
 * an endpoint, `1 + 2 + 2`. Not 3: an arc that ignored its flags would undercut a
 * cubic on every short run where the two are indistinguishable.
 */
export const PARAMS_ARC = 5

/**
 * Parameters charged for a circular arc under the written-arcs prices
 * ({@link withWrittenArcs}): the seven numbers SVG writes,
 * `A rx,ry rot large,sweep x,y`. Maier, Janda & Schindler (2012), "Minimum
 * description length arc spline approximation of digital curves", ICIP.
 */
export const PARAMS_ARC_WRITTEN = 7

/**
 * Parameters charged for an elliptical arc: all seven numbers SVG writes. One
 * more than a cubic, so an ellipse must be a materially better description of
 * its span, not merely an equal one.
 */
export const PARAMS_ELLIPTICAL_ARC = 7

/**
 * Tangent break, in degrees, charged the full cost of a corner (one parameter,
 * `λ`). Below it the charge ramps quadratically.
 */
export const G1_BREAK_DEGREES = 10

/**
 * The most a single cubic may turn, in degrees, before the written-arcs prices
 * charge it as two: a cubic's radial error on a circular arc grows as the sixth
 * power of the sweep (Goldapp 1991, "Approximation of circular arcs by cubic
 * polynomials", CAGD 8(3)).
 */
export const CAP_TURN_DEGREES = 90

/** The prices a trace charges for a curve. */
export interface CostModel {
  /** Parameters charged for one Bézier segment. */
  readonly cubicParams: number
  /** Degrees of turn, at a join, charged as a full corner. */
  readonly g1BreakDegrees: number
  /** Parameters charged for one circular arc. */
  readonly arcParams: number
  /** Turn, degrees, beyond which one cubic is charged as two; infinite for never. */
  readonly cubicMaxTurnDegrees: number
}

/** The range {@link CostModel.cubicParams} is held to: a line's price up to twelve. */
export const CUBIC_RANGE: readonly [number, number] = [2, 12]

/** The range {@link CostModel.g1BreakDegrees} is held to. */
export const G1_RANGE: readonly [number, number] = [1, 60]

/** The shipped prices: a Bézier costs its six numbers, a 10° turn is a full corner. */
export const STANDARD_COST_MODEL: CostModel = Object.freeze({
  cubicParams: PARAMS_CUBIC,
  g1BreakDegrees: G1_BREAK_DEGREES,
  arcParams: PARAMS_ARC,
  cubicMaxTurnDegrees: Infinity,
})

/**
 * `model` with a circular arc charged the seven numbers SVG writes for it and
 * one cubic charged as two beyond {@link CAP_TURN_DEGREES} of turn. Experimental:
 * the two prices go together, since at five an arc undercuts a six-number cubic
 * the document charges seven for.
 */
export function withWrittenArcs(model: CostModel): CostModel {
  return { ...model, arcParams: PARAMS_ARC_WRITTEN, cubicMaxTurnDegrees: CAP_TURN_DEGREES }
}

/**
 * The standard prices with any that were asked for replaced and held to their
 * range. An absent or non-finite request leaves the standard price.
 */
export function costModelWithOverrides(askedCubic?: number, askedBreak?: number): CostModel {
  return {
    ...STANDARD_COST_MODEL,
    cubicParams: heldTo(askedCubic, STANDARD_COST_MODEL.cubicParams, CUBIC_RANGE),
    g1BreakDegrees: heldTo(askedBreak, STANDARD_COST_MODEL.g1BreakDegrees, G1_RANGE),
  }
}

/** A requested price clamped to `range`, or `base` when nothing finite was asked. */
function heldTo(asked: number | undefined, base: number, range: readonly [number, number]) {
  return asked !== undefined && Number.isFinite(asked)
    ? Math.min(Math.max(asked, range[0]), range[1])
    : base
}

/** Whether two cost models charge the same prices. */
function samePrices(a: CostModel, b: CostModel): boolean {
  return (
    a.cubicParams === b.cubicParams &&
    a.g1BreakDegrees === b.g1BreakDegrees &&
    a.arcParams === b.arcParams &&
    a.cubicMaxTurnDegrees === b.cubicMaxTurnDegrees
  )
}

/** Radians per degree, as `f64::to_radians` multiplies. */
const RADIANS_PER_DEGREE = Math.PI / 180

/** The prices in force: the standard ones outside any {@link withCostModel} scope. */
let inForce: CostModel = STANDARD_COST_MODEL
/** Whether a {@link withCostModel} scope is open. */
let inside = false

/** Parameters charged for a cubic segment in the trace that is running. */
export function cubicParams(): number {
  return inForce.cubicParams
}

/** The full-corner turn, in radians, in the trace that is running. */
export function g1BreakRadians(): number {
  return inForce.g1BreakDegrees * RADIANS_PER_DEGREE
}

/** Parameters charged for a circular arc in the trace that is running. */
export function arcParams(): number {
  return inForce.arcParams
}

/** The turn, radians, beyond which one cubic is charged as two; infinite by default. */
export function cubicMaxTurnRadians(): number {
  return inForce.cubicMaxTurnDegrees * RADIANS_PER_DEGREE
}

/**
 * Run `f` with `model`'s prices in force, then put the standard ones back. Wrap
 * one whole trace. A call made inside another scope inherits that scope's prices.
 */
export function withCostModel<T>(model: CostModel, f: () => T): T {
  if (inside) return f()
  inside = true
  inForce = samePrices(model, STANDARD_COST_MODEL) ? STANDARD_COST_MODEL : { ...model }
  try {
    return f()
  } finally {
    inForce = STANDARD_COST_MODEL
    inside = false
  }
}
