/**
 * Constraints on the multimodel dynamic program: a cap on how many measured
 * points one segment may span, and vertices every solution must keep.
 *
 * Normal fitting has neither ({@link Limits.free}). The crossing repair refits a
 * guilty boundary under one or both: a halved cap, or pins beside each crossing.
 * The scan reads them span by span through {@link Limits.allows}, the closed-loop
 * solver cuts a pinned loop at a pin, and the post-fit passes run on a pinned,
 * uncapped fit with the pins kept.
 *
 * A span is admissible when it covers at most `maxSpan` measured points and no
 * forced vertex lies strictly inside it, so every solution has each forced
 * vertex as one of its vertices. Both conditions are monotone in `j` for a fixed
 * start `i` (once a span from `i` is refused, every longer one is refused too),
 * which lets the scan drop a start for good the first time it is refused.
 *
 * Restricting where the program may break, rather than tightening the whole
 * chain's tolerance, follows the topology-preserving simplification literature:
 * de Berg, van Kreveld & Schirra (1998), "Topologically correct subdivision
 * simplification using the bandwidth criterion", CaGIS 25(4); Saalfeld (1999),
 * "Topologically consistent line simplification with the Douglas-Peucker
 * algorithm", CaGIS 26(1).
 *
 * After inkvec (Apache-2.0): `inkvec-fit/src/multimodel/limits.rs`.
 */

/** Which spans `i..j` the dynamic program may use. */
export class Limits {
  /** The most measured points one segment may span; `Infinity` for no cap. */
  readonly maxSpan: number
  /**
   * Indices of the polyline being solved, ascending, that every solution must
   * take as vertices. Empty in normal fitting.
   */
  readonly forced: readonly number[]

  constructor(maxSpan: number, forced: readonly number[]) {
    this.maxSpan = maxSpan
    this.forced = forced
  }

  /** No constraint at all: the normal fit, which may decimate and runs the post-fit passes. */
  static readonly FREE = new Limits(Infinity, [])

  /** Spans of at most `maxSpan` points and no forced vertex. */
  static capped(maxSpan: number): Limits {
    return new Limits(maxSpan, [])
  }

  /**
   * The constraints of a pinned refit of a polyline of `n` points: `forced`
   * (any order, duplicates and indices `≥ n` ignored; on an open polyline its two
   * ends, which every solution has already, dropped too) and a cap, where a cap
   * of `n` or more is no cap (no span covers more than `n` points; an opened
   * loop has `n + 1`) and anything below one is one.
   */
  static pinned(n: number, closed: boolean, maxSpan: number, forced: readonly number[]): Limits {
    const f = [...new Set(forced.filter((k) => k >= 0 && k < n))].toSorted((a, b) => a - b)
    const kept = closed ? f : f.filter((k) => k > 0 && k + 1 < n)
    return new Limits(maxSpan >= n ? Infinity : Math.max(maxSpan, 1), kept)
  }

  /** Whether nothing is constrained: no cap and no forced vertex. */
  get free(): boolean {
    return this.maxSpan === Infinity && this.forced.length === 0
  }

  /**
   * Whether the span `i..j` (`i < j`) is admissible: at most `maxSpan` points,
   * and no forced vertex `f` with `i < f < j`.
   */
  allows(i: number, j: number): boolean {
    if (j - i > this.maxSpan) return false
    for (const f of this.forced) if (f > i && f < j) return false
    return true
  }

  /**
   * The last index a span from `i` may reach under the forced vertices: the
   * first one after `i`, or `Infinity` when there is none.
   */
  wallAfter(i: number): number {
    for (const f of this.forced) if (f > i) return f
    return Infinity
  }
}
