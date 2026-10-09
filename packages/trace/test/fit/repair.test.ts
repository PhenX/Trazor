import { describe, expect, it } from 'vitest'
import type { PathCommand } from '@trazor/core'
import type { FaceRing, FitConfig, FittedEdge, PlanarMap } from '../../src/planar/types'
import { fitConfig } from '../../src/planar/types'
import { faceRings } from '../../src/planar/rings'
import { PARAMS_CUBIC } from '../../src/fit/cost'
import { flattenEdge, locatedCrossings } from '../../src/fit/crossings'
import type { FitSegment } from '../../src/fit/curves'
import { fitEdges } from '../../src/fit/edge'
import { pathMaxDeviation, polyline, uniformPolyline } from '../../src/fit/objective'
import {
  EXPLODED_SEGMENTS,
  LOCAL_ROUNDS,
  REPAIR_ROUNDS,
  pinCrossings,
  repairCrossings,
  segmentRanges,
} from '../../src/fit/repair'
import type { RepairedEdge, RepairReport } from '../../src/fit/repair'
import { handMap, labelsFrom, mapOfLabels } from '../solve/solve-helpers'
import { lcg } from './fit-helpers'

const CFG: FitConfig = fitConfig(64)

const L = (x: number, y: number): PathCommand => ({ type: 'L', x, y })
const C = (x1: number, y1: number, x2: number, y2: number, x: number, y: number): PathCommand => ({
  type: 'C',
  x1,
  y1,
  x2,
  y2,
  x,
  y,
})

function fitted(x0: number, y0: number, segments: PathCommand[], closed = false): FittedEdge {
  return { x0, y0, segments, closed, params: 2 + 2 * segments.length, chi2: 0 }
}

/** Every crossing left in the rings, both sides of each. */
function crossingsOf(rings: readonly (readonly FaceRing[])[], fits: readonly FittedEdge[]) {
  return locatedCrossings(rings.flat(), fits.map(flattenEdge))
}

/** The faces' rings of a map of two edges between the same two nodes: the sliver, then the rest. */
const LENS_RINGS: FaceRing[][] = [
  [{ edges: [1, 0], reversed: [false, true], outer: true }],
  [{ edges: [0, 1], reversed: [false, true], outer: false }],
]

interface Sliver {
  half: number
  noise: number
  sag: number
  wiggle: number
  seed: number
  sigma: number
}

/**
 * A thin sliver face between two curved edges sharing their two nodes: 41
 * points a side, `half` px either side of a centre line that sags by `sag` and
 * wiggles by `wiggle` px, each side's offset jittered by up to `noise / 2`,
 * tapering to the nodes over two points. Every edge has σ `sigma`. With
 * `island`, a closed circle edge (face 2) sits below it in face 1.
 */
function sliverMap(s: Sliver, island = false): PlanarMap {
  const r = lcg(s.seed)
  const top: number[] = []
  const bottom: number[] = []
  const n = 40
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const c = 20 + s.sag * 4 * t * (1 - t) + s.wiggle * Math.sin(3 * Math.PI * t)
    const taper = Math.min(1, k / 2, (n - k) / 2)
    top.push(4 + k, c - taper * (s.half + s.noise * (r() - 0.5)))
    bottom.push(4 + k, c + taper * (s.half + s.noise * (r() - 0.5)))
  }
  const circle: number[] = []
  for (let k = 0; k < 32; k++) {
    const a = (2 * Math.PI * k) / 32
    circle.push(24 + 4 * Math.cos(a), 33 - 4 * Math.sin(a))
  }
  const map = handMap(
    48,
    40,
    [
      { points: top, left: 1, right: 0, start: 0, end: 1 },
      { points: bottom, left: 0, right: 1, start: 0, end: 1 },
      ...(island ? [{ points: circle, left: 2, right: 1, closed: true }] : []),
    ],
    [
      [top[0], top[1]],
      [top[2 * n], top[2 * n + 1]],
    ],
    island ? 3 : 2,
  )
  for (const e of map.edges) e.sigma.fill(s.sigma)
  return map
}

/** {@link LENS_RINGS} with the island's two rings when the map has one. */
function sliverRings(map: PlanarMap): FaceRing[][] {
  if (map.edges.length < 3) return LENS_RINGS
  return [
    LENS_RINGS[0],
    [...LENS_RINGS[1], { edges: [2], reversed: [true], outer: false }],
    [{ edges: [2], reversed: [false], outer: true }],
  ]
}

/**
 * Two edges between the same two nodes whose measured points cross each other
 * (one along `+3·sin`, the other along `−3·sin`, `n` points each, the crossing
 * between two samples): a map no refit can make simple.
 */
function crossedMap(n: number): PlanarMap {
  const a: number[] = []
  const b: number[] = []
  for (let k = 0; k < n; k++) {
    const t = k / (n - 1)
    a.push(4 + 40 * t, 20 + 3 * Math.sin(2 * Math.PI * t))
    b.push(4 + 40 * t, 20 - 3 * Math.sin(2 * Math.PI * t))
  }
  const map = handMap(
    48,
    40,
    [
      { points: a, left: 1, right: 0, start: 0, end: 1 },
      { points: b, left: 0, right: 1, start: 0, end: 1 },
    ],
    [
      [a[0], a[1]],
      [a[2 * n - 2], a[2 * n - 1]],
    ],
  )
  for (const e of map.edges) e.sigma.fill(0.3)
  return map
}

const totalParams = (fits: readonly FittedEdge[]): number =>
  fits.reduce((sum, f) => sum + f.params, 0)

/** The largest distance from an edge's measured points to its fit, in units of its σ. */
function deviationInSigma(map: PlanarMap, k: number, fit: FittedEdge): number {
  const e = map.edges[k]
  const path = {
    x0: fit.x0,
    y0: fit.y0,
    segments: fit.segments as FitSegment[],
    closed: fit.closed,
  }
  return pathMaxDeviation(polyline(e.points, e.sigma, e.closed), path) / e.sigma[0]
}

/** An open edge's fit starts and ends exactly on its nodes. */
function expectOnNodes(map: PlanarMap, fits: readonly FittedEdge[]): void {
  map.edges.forEach((e, k) => {
    if (e.closed) return
    const f = fits[k]
    const last = f.segments[f.segments.length - 1] as FitSegment
    expect([f.x0, f.y0]).toEqual([map.nodes[e.start].x, map.nodes[e.start].y])
    expect([last.x, last.y]).toEqual([map.nodes[e.end].x, map.nodes[e.end].y])
  })
}

/** The report's own bookkeeping holds together. */
function expectConsistent(
  report: RepairReport,
  fits: readonly FittedEdge[],
  before: readonly FittedEdge[],
): void {
  expect(report.pinned + report.halved).toBe(report.refits)
  expect(report.rounds).toBeLessThanOrEqual(REPAIR_ROUNDS)
  expect(report.edges.map((e) => e.edge)).toEqual(
    report.edges.map((e) => e.edge).toSorted((a, b) => a - b),
  )
  // An edge the report does not list is the object it came in as.
  const listed = new Set(report.edges.map((e) => e.edge))
  const moved = fits.flatMap((f, k) => (!listed.has(k) && f !== before[k] ? [k] : []))
  expect(moved).toEqual([])
  // A listed edge is its own fit again exactly when it kept its unconstrained one.
  const restored = (e: RepairedEdge): boolean => e.kept === 'full' || e.kept === 'exploded'
  expect(report.edges.map((e) => fits[e.edge] === before[e.edge])).toEqual(
    report.edges.map(restored),
  )
  expect(Math.max(0, ...report.edges.map((e) => e.pinned))).toBeLessThanOrEqual(LOCAL_ROUNDS)
}

describe('segmentRanges', () => {
  // An open run of 11 points along the x axis, and a closed 2×2 square of 8.
  const run = uniformPolyline(
    Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? i / 2 : 0)),
    0.05,
    false,
  )
  const square = uniformPolyline([0, 0, 1, 0, 2, 0, 2, 1, 2, 2, 1, 2, 0, 2, 0, 1], 0.05, true)
  const ring = fitted(2, 0, [L(2, 2), L(0, 2), L(0, 0), L(2, 0)], true)

  it('follows each segment over the measured boundary', () => {
    const path = fitted(0, 0, [L(4, 0), C(6, 0.1, 8, 0.1, 10, 0)])
    expect(segmentRanges(path, run)).toEqual([
      [0, 4],
      [4, 10],
    ])
  })

  it('unwraps the runs of a loop fitted from another point across its seam', () => {
    // 8 is index 0 again, 10 the start once more.
    expect(segmentRanges(ring, square)).toEqual([
      [2, 4],
      [4, 6],
      [6, 8],
      [8, 10],
    ])
  })

  it('cannot place a join behind the one before it, nor a fit with nothing to place', () => {
    expect(segmentRanges(fitted(0, 0, [L(10, 0), L(3, 0)]), run)).toBeNull()
    expect(segmentRanges(fitted(0, 0, []), run)).toBeNull()
    expect(segmentRanges(fitted(0, 0, [L(1, 0)]), uniformPolyline([0, 0], 0.05, false))).toBeNull()
  })

  it('takes the first of two equally near points', () => {
    // (4.5, 0) is as near index 4 as index 5.
    expect(segmentRanges(fitted(0, 0, [L(4.5, 0), L(10, 0)]), run)).toEqual([
      [0, 4],
      [4, 10],
    ])
  })
})

describe('pinCrossings', () => {
  const square = uniformPolyline([0, 0, 1, 0, 2, 0, 2, 1, 2, 2, 1, 2, 0, 2, 0, 1], 0.05, true)
  const ring = fitted(2, 0, [L(2, 2), L(0, 2), L(0, 0), L(2, 0)], true)
  const run = uniformPolyline(
    Array.from({ length: 22 }, (_, i) => (i % 2 === 0 ? i / 2 : 0)),
    0.05,
    false,
  )

  it('pins a crossing inside its segment at the nearest measured point', () => {
    const pins = [6]
    // Segment 1 runs over indices 4..6, so 5 is the only point inside it;
    // segment 3 runs 8..10 across the seam, so its inside point is index 1. A
    // repeat adds nothing.
    const added = pinCrossings(
      ring,
      square,
      [
        { segment: 1, x: 1.2, y: 2.3 },
        { segment: 3, x: 0.9, y: -0.2 },
        { segment: 1, x: 1, y: 2 },
      ],
      pins,
    )
    expect(added).toBe(2)
    expect(pins).toEqual([1, 5, 6])
  })

  it('has nothing to pin in a segment between adjacent measured points', () => {
    const tight = fitted(0, 0, [L(1, 0), L(10, 0)])
    const pins: number[] = []
    expect(pinCrossings(tight, run, [{ segment: 0, x: 0.5, y: 0.1 }], pins)).toBe(0)
    expect(pins).toEqual([])
  })

  it('pins the nearest point inside a long run, and nothing for an unplaceable fit', () => {
    const pins: number[] = []
    const line = fitted(0, 0, [L(10, 0)])
    expect(pinCrossings(line, run, [{ segment: 0, x: 6.4, y: 3 }], pins)).toBe(1)
    expect(pins).toEqual([6])
    // A segment index the fit does not have is skipped.
    expect(pinCrossings(line, run, [{ segment: 4, x: 2, y: 0 }], pins)).toBe(0)
    const back = fitted(0, 0, [L(10, 0), L(3, 0)])
    expect(pinCrossings(back, run, [{ segment: 0, x: 2, y: 0 }], pins)).toBe(0)
    expect(pins).toEqual([6])
  })
})

describe('repairCrossings', () => {
  it('repairs a thin sliver between two curved edges whose fits cross, at little cost', () => {
    const map = sliverMap(
      { half: 0.2, noise: 0.05, sag: 0, wiggle: 1.5, seed: 1, sigma: 0.5 },
      true,
    )
    const rings = sliverRings(map)
    const fits = fitEdges(map, CFG)
    expect(crossingsOf(rings, fits).length).toBeGreaterThan(0)

    const { fits: out, report } = repairCrossings(map, rings, fits, CFG)
    expect(crossingsOf(rings, out)).toEqual([])
    expect(report.crossing).toBe(0)
    expect(report.refits).toBeGreaterThan(0)
    // The island crosses nothing and is never touched.
    expect(out[2]).toBe(fits[2])
    expect(report.edges.map((e) => e.edge)).toEqual([0, 1])
    // At most one cubic's worth of extra parameters, and every fit follows its
    // own points within half a σ of how closely its unconstrained fit did.
    expect(totalParams(out)).toBeLessThanOrEqual(totalParams(fits) + PARAMS_CUBIC)
    for (const k of [0, 1]) {
      expect(deviationInSigma(map, k, out[k])).toBeLessThan(deviationInSigma(map, k, fits[k]) + 0.5)
    }
    expectOnNodes(map, out)
    expectConsistent(report, out, fits)
  })

  it('pins where the curves cross when the objective prices the pin lower', () => {
    const map = sliverMap({ half: 0.12, noise: 0.05, sag: 4, wiggle: 1.5, seed: 2, sigma: 0.35 })
    const fits = fitEdges(map, CFG)
    expect(crossingsOf(LENS_RINGS, fits).length).toBeGreaterThan(0)

    const { fits: out, report } = repairCrossings(map, LENS_RINGS, fits, CFG)
    expect(crossingsOf(LENS_RINGS, out)).toEqual([])
    expect(report.pinned).toBeGreaterThan(0)
    expect(totalParams(out)).toBeLessThanOrEqual(totalParams(fits) + PARAMS_CUBIC)
    // A pin is a vertex of the fit that keeps it, or the corner the refinement
    // moved it to where two lines meet: at most 3·max(σ, ¼) plus the chamfer
    // allowance of 3 px away.
    for (const e of report.edges) {
      const f = out[e.edge]
      const pts = map.edges[e.edge].points
      const ends = [[f.x0, f.y0], ...(f.segments as FitSegment[]).map((s) => [s.x, s.y])]
      for (const p of e.pins) {
        const near = Math.min(
          ...ends.map(([x, y]) => Math.hypot(x - pts[2 * p], y - pts[2 * p + 1])),
        )
        expect(near).toBeLessThanOrEqual(3 * 0.35 + 3)
      }
    }
    expectOnNodes(map, out)
    expectConsistent(report, out, fits)
  })

  it('keeps the merged refit when the full fit and the pins alone still cross', () => {
    const map = sliverMap({ half: 0.2, noise: 0.12, sag: 4, wiggle: 1.5, seed: 3, sigma: 0.35 })
    const fits = fitEdges(map, CFG)
    const { fits: out, report } = repairCrossings(map, LENS_RINGS, fits, CFG)
    expect(report.edges.map((e) => e.kept)).toContain('smoothed')
    expect(crossingsOf(LENS_RINGS, out)).toEqual([])
    expectOnNodes(map, out)
    expectConsistent(report, out, fits)
  })

  it('repairs every crossing sliver of a sweep, within the round limit', () => {
    let crossing = 0
    for (const sigma of [0.35, 0.5]) {
      for (const half of [0.08, 0.2]) {
        for (const sag of [0, 8]) {
          const map = sliverMap({
            half,
            noise: 0.12,
            sag,
            wiggle: sag === 0 ? 1.5 : 3,
            seed: 3,
            sigma,
          })
          const fits = fitEdges(map, CFG)
          if (crossingsOf(LENS_RINGS, fits).length === 0) continue
          crossing++
          const { fits: out, report } = repairCrossings(map, LENS_RINGS, fits, CFG)
          expect(crossingsOf(LENS_RINGS, out)).toEqual([])
          expect(report.crossing).toBe(0)
          expectOnNodes(map, out)
          expectConsistent(report, out, fits)
        }
      }
    }
    expect(crossing).toBeGreaterThanOrEqual(3)
  })

  it('leaves a map whose fits do not cross unchanged, byte for byte', () => {
    const labels = labelsFrom(24, 16, (x, y) => {
      if (Math.hypot(x + 0.5 - 7, y + 0.5 - 8) < 4.5) return 1
      return x >= 13 && x < 21 && y >= 3 && y < 13 ? 2 : 0
    })
    const map = mapOfLabels(labels)
    const rings = faceRings(map)
    const fits = fitEdges(map, CFG)
    const snapshot = JSON.stringify(fits)
    expect(crossingsOf(rings, fits)).toEqual([])

    const { fits: out, report } = repairCrossings(map, rings, fits, CFG)
    expect(out).not.toBe(fits)
    out.forEach((f, k) => expect(f).toBe(fits[k]))
    expect(JSON.stringify(out)).toBe(snapshot)
    expect(report).toEqual({ refits: 0, pinned: 0, halved: 0, rounds: 0, edges: [], crossing: 0 })
  })

  it('leaves a thin neck that fits without crossing alone', () => {
    // A narrow hairpin: out along y = 0, round the end, back along y = 1.2,
    // closed by a short edge between its two nodes.
    const pin: number[] = []
    for (let k = 0; k <= 40; k++) pin.push(k * 2, 0)
    for (let k = 1; k < 8; k++) {
      const a = Math.PI * (k / 8) - Math.PI / 2
      pin.push(80 + 0.6 * Math.cos(a), 0.6 + 0.6 * Math.sin(a))
    }
    for (let k = 40; k >= 0; k--) pin.push(k * 2, 1.2)
    const map = handMap(
      90,
      10,
      [
        { points: pin, left: 0, right: 1, start: 0, end: 1 },
        { points: [0, 1.2, 0, 0], left: 0, right: 1, start: 1, end: 0 },
      ],
      [
        [0, 0],
        [0, 1.2],
      ],
    )
    for (const e of map.edges) e.sigma.fill(0.35)
    const cfg = fitConfig(128, 0.1, 2)
    const rings: FaceRing[][] = [
      [{ edges: [0, 1], reversed: [false, false], outer: true }],
      [{ edges: [1, 0], reversed: [true, true], outer: false }],
    ]
    const fits = fitEdges(map, cfg)
    const { fits: out, report } = repairCrossings(map, rings, fits, cfg)
    expect(crossingsOf(rings, out)).toEqual([])
    out.forEach((f, k) => expect(f).toBe(fits[k]))
    expect(report.refits).toBe(0)
  })

  it('refits only the edges of the rings that cross, on a map from labels', () => {
    // Face 1 (left square) and face 2 (right square) share one edge; the
    // shared edge's fit bulges out through face 2's far side.
    const labels = labelsFrom(20, 12, (x, y) => {
      if (y < 2 || y >= 10) return 0
      return x >= 2 && x < 8 ? 1 : x >= 8 && x < 16 ? 2 : 0
    })
    const map = mapOfLabels(labels)
    const rings = faceRings(map)
    const fits = fitEdges(map, CFG)
    const shared = map.edges.findIndex((e) => e.left > 0 && e.right > 0)
    const e = map.edges[shared]
    const m = e.points.length
    const bad = fitted(e.points[0], e.points[1], [L(18, 6), L(e.points[m - 2], e.points[m - 1])])
    const given = fits.slice()
    given[shared] = bad
    const hits = crossingsOf(rings, given)
    expect(hits.length).toBeGreaterThan(0)
    const guilty = [...new Set(hits.map((h) => h.edge))].toSorted((a, b) => a - b)
    expect(guilty).toContain(shared)

    const { fits: out, report } = repairCrossings(map, rings, given, CFG)
    expect(crossingsOf(rings, out)).toEqual([])
    expect(report.edges.map((r) => r.edge)).toEqual(guilty)
    expect(out[shared]).not.toBe(bad)
    // The neighbour it crossed takes its own fit back once the bulge is gone.
    const others = report.edges.filter((r) => r.edge !== shared)
    expect(others.map((r) => r.kept)).toEqual(others.map(() => 'full'))
    expectOnNodes(map, out)
    expectConsistent(report, out, given)
  })

  it('repairs a curve doubling back across the edge feeding its node', () => {
    // A rectangle face: in along y = 0 to the node (10, 0), down the side to
    // (10, 3), home round the rest. The side's fit doubles back across the
    // first edge about 1.4 px before the node.
    const into: number[] = []
    for (let x = 0; x <= 10; x++) into.push(x, 0)
    const home: number[] = []
    for (let y = 3; y <= 8; y++) home.push(10, y)
    for (let x = 9; x >= 0; x--) home.push(x, 8)
    for (let y = 7; y >= 0; y--) home.push(0, y)
    const map = handMap(
      12,
      10,
      [
        { points: into, left: 1, right: 0, start: 0, end: 1 },
        { points: [10, 0, 10, 1, 10, 2, 10, 3], left: 1, right: 0, start: 1, end: 2 },
        { points: home, left: 1, right: 0, start: 2, end: 0 },
      ],
      [
        [0, 0],
        [10, 0],
        [10, 3],
      ],
    )
    for (const edge of map.edges) edge.sigma.fill(0.3)
    const rings: FaceRing[][] = [
      [{ edges: [0, 1, 2], reversed: [false, false, false], outer: true }],
      [{ edges: [2, 1, 0], reversed: [true, true, true], outer: false }],
    ]
    const free = fitEdges(map, CFG)
    const given = [free[0], fitted(10, 0, [C(8, -1, 8, 1, 10, 3)]), free[2]]
    expect(crossingsOf(rings, given).map((h) => h.edge)).toContain(0)

    const { fits: out, report } = repairCrossings(map, rings, given, CFG)
    expect(crossingsOf(rings, out)).toEqual([])
    expect(out[0]).toBe(given[0])
    expect(out[2]).toBe(given[2])
    expect(out[1]).not.toBe(given[1])
    expect(report.edges.find((r) => r.edge === 0)?.kept).toBe('full')
    expectOnNodes(map, out)
    expectConsistent(report, out, given)
  })

  it('repairs a closed edge whose fit crosses itself', () => {
    // A thin rectangular island, its fit drawn as a bow tie through its middle.
    const pts: number[] = []
    for (let x = 10; x <= 40; x++) pts.push(x, 19.2)
    for (let x = 40; x >= 10; x--) pts.push(x, 20.8)
    const map = handMap(48, 40, [{ points: pts, left: 0, right: 1, closed: true }], [])
    map.edges[0].sigma.fill(0.3)
    const rings: FaceRing[][] = [
      [{ edges: [0], reversed: [false], outer: true }],
      [{ edges: [0], reversed: [true], outer: false }],
    ]
    const bow = fitted(10, 19.2, [L(40, 20.8), L(40, 19.2), L(10, 20.8), L(10, 19.2)], true)
    expect(crossingsOf(rings, [bow]).length).toBeGreaterThan(0)

    const { fits: out, report } = repairCrossings(map, rings, [bow], CFG)
    expect(crossingsOf(rings, out)).toEqual([])
    expect(report.crossing).toBe(0)
    const f = out[0]
    expect(f.closed).toBe(true)
    const last = f.segments[f.segments.length - 1] as FitSegment
    expect([last.x, last.y]).toEqual([f.x0, f.y0])
    expectConsistent(report, out, [bow])
  })

  it('drops an edge whose cap reaches one, and takes back a refit that exploded', () => {
    // Measured points that cross: halving ends at a cap of one, where each
    // refit is its measured polyline, a staircase of 39 segments.
    const map = crossedMap(40)
    const fits = fitEdges(map, CFG)
    const { fits: out, report } = repairCrossings(map, LENS_RINGS, fits, CFG)
    expect(report.rounds).toBeLessThan(REPAIR_ROUNDS)
    expect(map.edges[0].points.length / 2 - 1).toBeGreaterThan(EXPLODED_SEGMENTS)
    for (const e of report.edges) {
      expect(e.cap).toBe(1)
      expect(e.kept).toBe('exploded')
    }
    // The unconstrained fits come back, still crossing, and the report says so.
    out.forEach((f, k) => expect(f).toBe(fits[k]))
    expect(report.crossing).toBe(2)
    expectConsistent(report, out, fits)
  })

  it('stops at the round limit', { timeout: 60_000 }, () => {
    // 600 points need ten halvings to reach a cap of one, so the rounds run out first.
    const map = crossedMap(600)
    const fits = fitEdges(map, CFG)
    const { fits: out, report } = repairCrossings(map, LENS_RINGS, fits, CFG)
    expect(report.rounds).toBe(REPAIR_ROUNDS)
    expect(report.refits).toBeLessThanOrEqual(2 * REPAIR_ROUNDS)
    for (const e of report.edges) {
      expect(e.cap).toBeGreaterThan(1)
      expect(e.pinned).toBeLessThanOrEqual(LOCAL_ROUNDS)
    }
    expect(report.crossing).toBe(2)
    expectConsistent(report, out, fits)
  })

  it('is deterministic and modifies neither the map nor the fits', () => {
    const run = (): { fits: FittedEdge[]; report: RepairReport; points: number[][] } => {
      const map = sliverMap({ half: 0.08, noise: 0.12, sag: 8, wiggle: 3, seed: 2, sigma: 0.5 })
      const fits = fitEdges(map, CFG)
      const before = JSON.stringify(fits)
      const points = map.edges.map((e) => Array.from(e.points))
      const res = repairCrossings(map, LENS_RINGS, fits, CFG)
      expect(JSON.stringify(fits)).toBe(before)
      expect(map.edges.map((e) => Array.from(e.points))).toEqual(points)
      return { ...res, points }
    }
    const a = run()
    const b = run()
    expect(a.report.refits).toBeGreaterThan(0)
    expect(JSON.stringify(b.fits)).toBe(JSON.stringify(a.fits))
    expect(b.report).toEqual(a.report)
  })

  it('wants one fit per edge', () => {
    const map = crossedMap(8)
    expect(() => repairCrossings(map, LENS_RINGS, [], CFG)).toThrow('one fit per edge')
  })
})
