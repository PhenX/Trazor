/**
 * Crossing repair of fitted geometry: every face ring whose fitted edges cross
 * — an edge crossing itself, two edges of one ring crossing, a curve doubling
 * back across the edge it meets at a node — has the guilty edges refitted until
 * no ring crosses, and an edge that does not cross is never touched.
 *
 * Each edge is fitted on its own points (`./edge`), so nothing in
 * `½·χ² + λ·params` sees the other edges of its ring: two stretches of boundary
 * running close together can each be fitted within their tolerance and still
 * bulge across each other. The ring is the smallest unit the defect is visible
 * in, so detection runs on whole rings (`./crossings`, `locatedCrossings`) and
 * the refits on the edges that own a crossing segment. An edge is shared by the
 * two faces either side of it and is refitted once, for both.
 *
 * The rounds ({@link REPAIR_ROUNDS} at most): every ring walking an edge the
 * last round changed (every ring in the first) is tested, and each guilty edge
 * whose span cap is above one gets two candidate refits from the same dynamic
 * program (`./multimodel`):
 * - **pinned**: each crossing segment must break at the measured point nearest
 *   its first crossing, among the points strictly inside its measured run
 *   ({@link pinCrossings}, runs from {@link segmentRanges}), on top of the pins
 *   the edge has; under its current cap, which is no cap until it is first
 *   halved, and then with the post-fit passes keeping the pins. An edge pinned
 *   {@link LOCAL_ROUNDS} times, or with nothing new to pin, gets no pinned
 *   candidate;
 * - **halved**: its cap (the most measured points one segment may span,
 *   starting at the edge's point count) halved, its pins kept, no passes.
 *
 * The one with the lower program cost (`½·χ² + λ·params + breaks` before
 * refinement) is kept, ties to the pin, and only its constraint is remembered.
 * Pinning restores a vertex only where the simplified chain crosses another (de
 * Berg, van Kreveld & Schirra 1998, "Topologically correct subdivision
 * simplification using the bandwidth criterion", CaGIS 25(4):243–257; Saalfeld
 * 1999, "Topologically consistent line simplification with the Douglas-Peucker
 * algorithm", CaGIS 26(1):7–18); the cap guarantees the end, since at a cap of
 * one a refit reproduces the measured polyline, and the measured boundaries of
 * a partition do not cross.
 *
 * Afterwards each refitted edge, in increasing edge order, is offered its
 * unconstrained fit, then its latest pins alone with no cap (an edge whose cap
 * was halved), then its refit with free cubics merged and corners sharpened
 * (within {@link MERGE_BUDGET}), and keeps the first that crosses nothing in
 * the rings walking it; failing all three, its refit stands. A refit that
 * exploded ({@link EXPLODED_SEGMENTS}, {@link EXPLODED_RATIO}) takes its
 * unconstrained fit back whether or not that crosses: the staircase a collapsed
 * cap draws is the worst answer on every axis.
 *
 * Every test here reads distances between points and the order of measured
 * points, which do not depend on where the lattice sits, so inkvec's
 * pixel-centre coordinates and Trazor's pixel-corner ones need no shift.
 *
 * After inkvec (Apache-2.0): `inkvec-cli/src/rings.rs` (`repair_ring_crossings`,
 * `located_crossings`, `RepairState`, `pin_crossings`, `segment_ranges`) and
 * `inkvec-cli/src/pipeline.rs` (`repair_fits`).
 */
import type { FaceRing, FitConfig, FittedEdge, PlanarMap } from '../planar/types'
import { CROSSING_LIMIT, flattenEdge, locatedCrossings, ringCrossings } from './crossings'
import type { CrossingHit, FlatPath } from './crossings'
import type { FitSegment } from './curves'
import { pointsAtNodes, shippingPostFit } from './edge'
import { fittedEdgeOf, optimalMultimodelCapped, optimalMultimodelForced } from './multimodel'
import type { MultimodelFit } from './multimodel'
import { polyline, polylineSize } from './objective'
import type { FitPath, Polyline } from './objective'
import { hypot } from './roots'

/** Rounds of detection and refits at most. */
export const REPAIR_ROUNDS = 10

/**
 * Pinned refits one edge may have; after these every refit of it halves its
 * cap, which keeps the guarantee that the repair ends.
 */
export const LOCAL_ROUNDS = 4

/**
 * Segments a refitted edge may have and still be offered its merged
 * ("smoothed") refit; all such edges together get four times this, spent
 * shortest edge first. An edge the budget cannot afford keeps its capped refit.
 */
export const MERGE_BUDGET = 96

/**
 * A refit with more than this many segments, and more than
 * {@link EXPLODED_RATIO} times its unconstrained fit's, has exploded.
 */
export const EXPLODED_SEGMENTS = 32

/** See {@link EXPLODED_SEGMENTS}. */
export const EXPLODED_RATIO = 4

/** Two measured points this close (px) to the least distance are equally near. */
const NEAREST_SLACK = 1e-6

/**
 * What the restoration kept for a refitted edge: its unconstrained fit, its
 * pins alone with no cap, its merged refit, the round loop's refit, or its
 * unconstrained fit taken back because the refit exploded.
 */
export type RepairOutcome = 'full' | 'pins' | 'smoothed' | 'refit' | 'exploded'

/** One edge the rounds refitted, and what it ended as. */
export interface RepairedEdge {
  edge: number
  kept: RepairOutcome
  /** Pinned refits it had. */
  pinned: number
  /** Its span cap at the end, in measured points (its point count when never halved). */
  cap: number
  /**
   * The measured-point indices the kept fit was made to break at, ascending:
   * none for an unconstrained or merged fit.
   */
  pins: number[]
}

/** What {@link repairCrossings} did. */
export interface RepairReport {
  /** Refits the rounds made, pinned or halved (inkvec's count). */
  refits: number
  /** Of those, the refits that kept the pinned candidate. */
  pinned: number
  /** And those that kept the halved cap. */
  halved: number
  /** Rounds that refitted something. */
  rounds: number
  /** Every edge the rounds refitted, in increasing edge order. */
  edges: RepairedEdge[]
  /**
   * Rings walking a refitted edge that still cross at the end: every ring
   * still crossing, as any ring that crossed at the start walks a refitted edge.
   */
  crossing: number
}

/** A crossing on one segment of an edge's own fit: the segment, and where. */
export interface SegmentCrossing {
  segment: number
  x: number
  y: number
}

/**
 * The first offset `o` in `lo..=hi` whose point `o mod n` of `pts` lies within
 * {@link NEAREST_SLACK} of the least distance from `(x, y)`; `lo` when no
 * distance is a number.
 */
function nearestFrom(
  pts: Float64Array,
  n: number,
  x: number,
  y: number,
  lo: number,
  hi: number,
): number {
  let least = Infinity
  for (let o = lo; o <= hi; o++) {
    const i = o % n
    const d = hypot(pts[2 * i] - x, pts[2 * i + 1] - y)
    if (d < least) least = d
  }
  for (let o = lo; o <= hi; o++) {
    const i = o % n
    if (hypot(pts[2 * i] - x, pts[2 * i + 1] - y) <= least + NEAREST_SLACK) return o
  }
  return lo
}

/**
 * The measured run of each segment of `fit` on `poly`: `[a, b]` per segment,
 * in unwrapped offsets (a closed boundary's runs may pass its first point, so
 * `b` can exceed the point count `n`; reduce mod `n`), or null when the fit's
 * joins cannot be placed on the polyline in order.
 *
 * The fit keeps no record of the points each segment came from (the post-fit
 * merge and the corner sharpening change the segmentation after the program),
 * so it is recovered from the geometry: the fit's start is matched to its
 * nearest measured point, then each segment's end to the nearest measured point
 * ahead of the previous match (the first within {@link NEAREST_SLACK} of that
 * distance), up to one lap of a closed boundary, whose last segment ends where
 * it began. A join the program chose is a measured point or one the corner
 * refinement moved by a few σ, so the walk lands on it or beside it.
 * O(n · segments).
 */
export function segmentRanges(fit: FittedEdge, poly: Polyline): [number, number][] | null {
  const n = polylineSize(poly)
  const segs = fit.segments as readonly FitSegment[]
  if (n < 2 || segs.length === 0) return null
  const pts = poly.points
  const start = nearestFrom(pts, n, fit.x0, fit.y0, 0, n - 1)
  // One lap on a closed boundary, to the end on an open one.
  const last = poly.closed ? start + n : n - 1
  const out: [number, number][] = []
  let at = start
  for (let q = 0; q < segs.length; q++) {
    let next: number
    if (poly.closed && q + 1 === segs.length) next = last
    else {
      if (at + 1 > last) return null
      next = nearestFrom(pts, n, segs[q].x, segs[q].y, at + 1, last)
    }
    out.push([at, next])
    at = next
  }
  return out
}

/**
 * Pin an edge's fit where it crosses: for each crossing in `hits` (a segment of
 * `fit`, the edge's current fit in its own direction, and where it crosses),
 * the measured point of `poly` nearest the crossing among those strictly inside
 * the segment's measured run ({@link segmentRanges}; the first on a tie) is
 * added to `pins` (ascending, no duplicates), in place. A segment joining
 * adjacent measured points has nothing inside it to pin. Returns how many pins
 * were added: none when the fit's joins cannot be placed on the polyline.
 *
 * A pin is a vertex of every later refit, so the refitted curve passes through
 * a measured point beside the crossing; the measured boundaries of a partition
 * do not cross, so two curves pinned there are held apart where they crossed.
 */
export function pinCrossings(
  fit: FittedEdge,
  poly: Polyline,
  hits: readonly SegmentCrossing[],
  pins: number[],
): number {
  const ranges = segmentRanges(fit, poly)
  if (!ranges) return 0
  const n = polylineSize(poly)
  const pts = poly.points
  let added = 0
  for (const h of hits) {
    const range = ranges[h.segment]
    if (!range) continue
    const [a, b] = range
    let best = -1
    let bestDist = Infinity
    for (let o = a + 1; o < b; o++) {
      const i = o % n
      const d = hypot(pts[2 * i] - h.x, pts[2 * i + 1] - h.y)
      if (best < 0 || d < bestDist) {
        best = i
        bestDist = d
      }
    }
    if (best < 0) continue
    let lo = 0
    let hi = pins.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (pins[mid] < best) lo = mid + 1
      else hi = mid
    }
    if (pins[lo] !== best) {
      pins.splice(lo, 0, best)
      added++
    }
  }
  return added
}

/**
 * The dynamic program on `poly` under a cap of `maxSpan` points and the vertices
 * `pins`: the capped program with no pins, else the pinned one, which with no
 * cap (`maxSpan ≥ n`) runs the shipping post-fit passes keeping the pins.
 */
function program(
  poly: Polyline,
  cfg: FitConfig,
  maxSpan: number,
  pins: readonly number[],
): MultimodelFit {
  if (pins.length === 0) return optimalMultimodelCapped(poly, cfg, maxSpan)
  return optimalMultimodelForced(poly, cfg, maxSpan, pins, { postFit: shippingPostFit })
}

/** A fitted edge as the path the post-fit passes edit (its segments are `L`, `C` and `A`). */
function fitPathOf(fit: FittedEdge): FitPath {
  return {
    x0: fit.x0,
    y0: fit.y0,
    segments: (fit.segments as FitSegment[]).slice(),
    closed: fit.closed,
  }
}

/** Whether `path` starts where `fit` does and holds the same segment objects. */
function samePath(path: FitPath, fit: FittedEdge): boolean {
  const segs = fit.segments
  if (path.x0 !== fit.x0 || path.y0 !== fit.y0 || path.segments.length !== segs.length) {
    return false
  }
  return path.segments.every((s, q) => s === segs[q])
}

/**
 * Refit the edges whose fits make a face ring cross, as the module comment
 * describes, and return every edge's fit (an edge never refitted, or given its
 * unconstrained fit back, keeps the object it came in as) and a report.
 *
 * `rings` are the faces' rings ({@link FaceRing}, as `faceRings` gives them),
 * `fits` every edge's unconstrained fit by edge index (`fitEdges`), and `cfg`
 * the objective they were fitted under; σ and points are read from `map` as
 * they stand, each open edge's ends at its nodes as the fit put them. Neither
 * `map` nor `fits` is modified.
 */
export function repairCrossings(
  map: PlanarMap,
  rings: readonly (readonly FaceRing[])[],
  fits: readonly FittedEdge[],
  cfg: FitConfig,
): { fits: FittedEdge[]; report: RepairReport } {
  if (fits.length !== map.edges.length) throw new Error('one fit per edge of the map')
  const all: FaceRing[] = rings.flat()
  const count = fits.length
  const out = fits.slice()
  const full = fits.slice()
  const flats: FlatPath[] = out.map(flattenEdge)
  const fullFlats = flats.slice()

  // Per edge: its measured polyline (made when first needed), its span cap
  // (its point count, at least 2, before any halving), its pins (measured-point
  // indices every later refit keeps), its pinned refits so far, its latest
  // proposed pins (kept or not) and the vertices of its latest refit.
  const polys: (Polyline | undefined)[] = new Array(count)
  const cap = Int32Array.from(map.edges, (e) => Math.max(e.points.length >> 1, 2))
  const pins: number[][] = Array.from({ length: count }, () => [])
  const pinnedRounds = new Int32Array(count)
  const lastProposed = new Map<number, number[]>()
  const refitVertices = new Map<number, number[]>()
  const polyOf = (k: number): Polyline => {
    let p = polys[k]
    if (!p) {
      const e = map.edges[k]
      p = polyline(e.closed ? e.points : pointsAtNodes(map, e), e.sigma, e.closed)
      polys[k] = p
    }
    return p
  }
  const report: RepairReport = {
    refits: 0,
    pinned: 0,
    halved: 0,
    rounds: 0,
    edges: [],
    crossing: 0,
  }

  let changed: Set<number> | undefined
  for (let round = 0; round < REPAIR_ROUNDS; round++) {
    const hits = locatedCrossings(all, flats, { changed, limit: CROSSING_LIMIT })
    // Each guilty edge's crossings, by segment then x: the first per segment is pinned.
    const mine = new Map<number, CrossingHit[]>()
    for (const h of hits) {
      if (cap[h.edge] <= 1) continue
      const list = mine.get(h.edge)
      if (!list) mine.set(h.edge, [h])
      else if (list[list.length - 1].segment !== h.segment) list.push(h)
    }
    if (mine.size === 0) break
    const guilty = [...mine.keys()].toSorted((a, b) => a - b)
    report.rounds++

    // The pinned candidate's pins: the edge's pins so far plus one per crossing segment.
    const proposed = new Map<number, number[]>()
    for (const k of guilty) {
      if (pinnedRounds[k] >= LOCAL_ROUNDS) continue
      const trial = pins[k].slice()
      if (pinCrossings(out[k], polyOf(k), mine.get(k) ?? [], trial) > 0) {
        lastProposed.set(k, trial)
        proposed.set(k, trial)
      }
    }

    for (const k of guilty) {
      const poly = polyOf(k)
      const halved = program(poly, cfg, Math.max(cap[k] >> 1, 1), pins[k])
      const p = proposed.get(k)
      const pinned = p ? program(poly, cfg, cap[k], p) : null
      let fit: MultimodelFit
      if (p && pinned && !(halved.cost < pinned.cost)) {
        fit = pinned
        pins[k] = p
        pinnedRounds[k]++
        report.pinned++
      } else {
        fit = halved
        cap[k] = Math.max(cap[k] >> 1, 1)
        report.halved++
      }
      out[k] = fittedEdgeOf(poly, fit)
      flats[k] = flattenEdge(out[k])
      refitVertices.set(k, fit.vertices)
      report.refits++
    }
    changed = new Set(guilty)
  }

  if (refitVertices.size === 0) return { fits: out, report }

  // The rings walking each refitted edge.
  const ringsOf = new Map<number, number[]>()
  for (const k of refitVertices.keys()) ringsOf.set(k, [])
  all.forEach((ring, r) => {
    for (const k of new Set(ring.edges)) ringsOf.get(k)?.push(r)
  })
  const keys = [...refitVertices.keys()].toSorted((a, b) => a - b)

  // The merge budget, spent shortest refit first on the refits as the rounds left them.
  const affordable = new Set<number>()
  let spent = 0
  const bySize = keys.toSorted((a, b) => out[a].segments.length - out[b].segments.length || a - b)
  for (const k of bySize) {
    const n = out[k].segments.length
    if (n <= MERGE_BUDGET && spent + n <= 4 * MERGE_BUDGET) {
      spent += n
      affordable.add(k)
    }
  }

  // Whether no ring walking edge `k` crosses where one of `k`'s own segments is
  // involved. Every other pair is as the rounds left it.
  const safe = (k: number): boolean =>
    (ringsOf.get(k) ?? []).every(
      (r) => ringCrossings(all[r], flats, { touching: k, limit: 1 }).length === 0,
    )

  for (const k of keys) {
    const refit = out[k]
    const refitFlat = flats[k]
    const segs = refit.segments.length
    if (segs > EXPLODED_SEGMENTS && segs > EXPLODED_RATIO * Math.max(full[k].segments.length, 1)) {
      out[k] = full[k]
      flats[k] = fullFlats[k]
      report.edges.push({
        edge: k,
        kept: 'exploded',
        pinned: pinnedRounds[k],
        cap: cap[k],
        pins: [],
      })
      continue
    }
    const poly = polyOf(k)
    const vertices = refitVertices.get(k) ?? []
    // The pins alone are offered to an edge whose cap was halved: its latest proposal.
    const alone = lastProposed.get(k) ?? pins[k]
    const offerPins = alone.length > 0 && cap[k] < Math.max(polylineSize(poly), 2)
    // The candidates in order, each made only when the one before it crossed. A
    // merge that changes nothing leaves the refit as it is.
    const candidates: [RepairOutcome, () => FittedEdge | null][] = [
      ['full', () => full[k]],
      ['pins', () => (offerPins ? fittedEdgeOf(poly, program(poly, cfg, Infinity, alone)) : null)],
      [
        'smoothed',
        () => {
          if (!affordable.has(k)) return null
          const path = shippingPostFit(fitPathOf(refit), poly, vertices, cfg, null)
          return samePath(path, refit) ? null : fittedEdgeOf(poly, { path, vertices })
        },
      ],
    ]
    let kept: RepairOutcome = 'refit'
    for (const [name, make] of candidates) {
      const candidate = make()
      if (!candidate) continue
      out[k] = candidate
      flats[k] = name === 'full' ? fullFlats[k] : flattenEdge(candidate)
      if (safe(k)) {
        kept = name
        break
      }
      out[k] = refit
      flats[k] = refitFlat
    }
    const keptPins = kept === 'pins' ? alone : kept === 'refit' ? pins[k] : []
    report.edges.push({ edge: k, kept, pinned: pinnedRounds[k], cap: cap[k], pins: keptPins })
  }

  const touched = new Set<number>()
  for (const k of keys) for (const r of ringsOf.get(k) ?? []) touched.add(r)
  for (const r of touched) {
    if (ringCrossings(all[r], flats, { limit: 1 }).length > 0) report.crossing++
  }
  return { fits: out, report }
}
