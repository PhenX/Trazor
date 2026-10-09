import { describe, expect, it } from 'vitest'
import type { FitConfig, FittedEdge } from '../../src/planar/types'
import { fitConfig } from '../../src/planar/types'
import {
  STANDARD_COST_MODEL,
  withCostModel,
  withWrittenArcs,
  PARAMS_ARC_WRITTEN,
} from '../../src/fit/cost'
import { bestCubic, rawMomentsDirect } from '../../src/fit/cubicfit'
import type { FitSegment, Vec } from '../../src/fit/curves'
import { chi2 as sampledChi2, segmentParams } from '../../src/fit/curves'
import { Limits } from '../../src/fit/limits'
import {
  decimateIndices,
  fitPolyline,
  openAt,
  optimalMultimodel,
  optimalMultimodelCapped,
  optimalMultimodelForced,
  refine,
  segmentCostDirect,
} from '../../src/fit/multimodel'
import type { MultimodelFit, SegKind, Solution } from '../../src/fit/multimodel'
import type { FitPath, Polyline } from '../../src/fit/objective'
import {
  arcLengths,
  pathChi2,
  pathMaxDeviation,
  polyline,
  PrefixSums,
  uniformPolyline,
} from '../../src/fit/objective'
import {
  CutOff,
  nextUp,
  OVER_NO,
  OVER_UNKNOWN,
  OVER_YES,
  PRUNE_PATIENCE,
  SpanScorer,
} from '../../src/fit/scan'
import type { Table } from '../../src/fit/scan'
import { estimateTangents, vertexCost } from '../../src/fit/tangents'
import type { Tangents } from '../../src/fit/tangents'
import { dir, flat, near, run } from './fit-helpers'
import {
  noisy,
  rationalCircle,
  REFERENCE,
  REFERENCE_DIRECT,
  REFERENCE_STAR_STRIDE5,
  referenceInputs,
  roundedRect,
  star,
  parabola,
} from './multimodel-reference'

const cfg = (lambda: number): FitConfig => ({ tau: 2, lambda })
const DEG = Math.PI / 180

/** `samples` points of a left-turning arc of radius `r` leaving `start` at `dirDeg`, sweeping `sweepDeg`; `start` excluded. */
function arcAfter(
  start: [number, number],
  dirDeg: number,
  r: number,
  sweepDeg: number,
  samples: number,
): [number, number][] {
  const d = dirDeg * DEG
  const cx = start[0] - r * Math.sin(d)
  const cy = start[1] + r * Math.cos(d)
  const out: [number, number][] = []
  for (let k = 1; k <= samples; k++) {
    const th = d + (sweepDeg * DEG * k) / samples
    out.push([cx + r * Math.sin(th), cy - r * Math.cos(th)])
  }
  return out
}

/** Tangents set by hand, `[incoming, outgoing]` per point. */
function tangents(t: [Vec, Vec][]): Tangents {
  return { incoming: t.map((p) => p[0]), outgoing: t.map((p) => p[1]) }
}

/** A segment's numbers in the reference's order: `L x y`, `C x1 y1 x2 y2 x y`, `A rx ry phi x y` (phi in radians). */
function segmentNumbers(s: FitSegment): number[] {
  if (s.type === 'L') return [s.x, s.y]
  if (s.type === 'C') return [s.x1, s.y1, s.x2, s.y2, s.x, s.y]
  return [s.rx, s.ry, s.rotation * DEG, s.x, s.y]
}

/** An arc's SVG flags; none for another segment. */
function segmentFlags(s: FitSegment): boolean[] {
  return s.type === 'A' ? [s.largeArc, s.sweep] : []
}

/** An edge's segments, which the fit writes as `L`, `C` and `A` only. */
function segsOf(edge: FittedEdge): FitSegment[] {
  return edge.segments as FitSegment[]
}

/** The end of a segment. */
function endOf(s: FitSegment): Vec {
  return { x: s.x, y: s.y }
}

function dist(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function unitOf(x: number, y: number): Vec {
  const l = Math.hypot(x, y)
  return { x: x / l, y: y / l }
}

/** `(lines, curves)` of a path; a curve is a cubic or an arc. */
function count(path: FitPath): [number, number] {
  const lines = path.segments.filter((s) => s.type === 'L').length
  return [lines, path.segments.length - lines]
}

/** The point of a polyline. */
function pointOf(poly: Polyline, k: number): Vec {
  return { x: poly.points[2 * k], y: poly.points[2 * k + 1] }
}

/** Whether the path passes through `p` at its start or a segment end. */
function passesThrough(path: FitPath, p: Vec): boolean {
  if (dist({ x: path.x0, y: path.y0 }, p) < 1e-9) return true
  return path.segments.some((s) => dist(endOf(s), p) < 1e-9)
}

// --- the reference: inkvec's own answers ------------------------------------------

describe('against inkvec', () => {
  const inputs = referenceInputs()

  it('finds the same segmentation, models, cost and path on every reference input', () => {
    for (const [k, input] of inputs.entries()) {
      const want = REFERENCE[k]
      expect(want.name).toBe(input.name)
      const poly = uniformPolyline(input.points, input.sigma, input.closed)
      const c = cfg(input.lambda)
      const fit =
        input.mode === 'free'
          ? optimalMultimodel(poly, c)
          : input.mode === 'capped'
            ? optimalMultimodelCapped(poly, c, input.maxSpan)
            : optimalMultimodelForced(poly, c, input.maxSpan, input.forced)
      expect({
        name: input.name,
        vertices: fit.vertices,
        kinds: fit.kinds,
        closed: fit.path.closed,
        segments: fit.path.segments.map((s) => [s.type, ...segmentFlags(s)]),
      }).toEqual({
        name: want.name,
        vertices: want.vertices,
        kinds: want.kinds,
        closed: want.closed,
        segments: want.segments.map((w) => [w[0], ...w.filter((v) => typeof v === 'boolean')]),
      })
      // Every coordinate, radius and rotation, and the cost, to the last few bits.
      let worst = Math.max(
        Math.abs(fit.path.x0 - want.start[0]),
        Math.abs(fit.path.y0 - want.start[1]),
      )
      fit.path.segments.forEach((s, q) => {
        const ref = want.segments[q].filter((v): v is number => typeof v === 'number')
        segmentNumbers(s).forEach((v, m) => (worst = Math.max(worst, Math.abs(v - ref[m]))))
      })
      const cost = near(fit.cost, want.cost, 1e-9)
      expect({ name: input.name, worst, close: worst < 1e-9, cost }).toMatchObject({
        close: true,
        cost: true,
      })
    }
  })

  it('fills the same table on the open reference inputs', () => {
    for (const [k, input] of inputs.entries()) {
      const want = REFERENCE[k].best
      if (!want) continue
      const poly = uniformPolyline(input.points, input.sigma, false)
      const shifted = centeredCopy(poly)
      const c = cfg(input.lambda)
      const tan = estimateTangents(shifted, c)
      const pre = new PrefixSums(shifted.points, shifted.sigma)
      const tab = new SpanScorer(shifted.points, shifted.sigma, tan, pre, c, false).fillTable(
        Limits.FREE,
      )
      const off = want.flatMap((v, j) => (near(tab.best[j], v, 1e-12) ? [] : [j]))
      expect({ name: input.name, off }).toEqual({ name: input.name, off: [] })
    }
  })

  it('prices spans directly as inkvec does', () => {
    const poly = uniformPolyline(noisy(parabola(), 0.02, 2), 0.05, false)
    const c = cfg(7.5)
    const tan = estimateTangents(poly, c)
    for (const [i, j, joins, line, cubic, arc] of REFERENCE_DIRECT) {
      const got = (['line', 'cubic', 'arc'] as SegKind[]).map((k) =>
        segmentCostDirect(poly, tan, i, j, k, c, joins),
      )
      const same = [line, cubic, arc].map((want, m) =>
        want === Infinity ? got[m] === Infinity : near(got[m], want, 1e-10),
      )
      expect({ i, j, joins, same }).toEqual({ i, j, joins, same: [true, true, true] })
    }
  })

  it('decimates as inkvec does: corners move onto the grid, smooth runs keep it', () => {
    const c = cfg(7.5)
    const starPoly = uniformPolyline(noisy(star(), 0.03, 11), 0.05, true)
    expect(decimateIndices(starPoly, 5, c)).toEqual(REFERENCE_STAR_STRIDE5)
    const ring = uniformPolyline(noisy(rationalCircle(0, 0, 100, 250), 0.05, 12), 0.05, true)
    expect(decimateIndices(ring, 2, c)).toEqual(Array.from({ length: 500 }, (_, k) => 2 * k))
  })
})

/** The polyline moved so its bounding-box center is the origin, as the program works on it. */
function centeredCopy(poly: Polyline): Polyline {
  const p = poly.points
  let loX = Infinity
  let loY = Infinity
  let hiX = -Infinity
  let hiY = -Infinity
  for (let k = 0; k < p.length; k += 2) {
    loX = Math.min(loX, p[k])
    hiX = Math.max(hiX, p[k])
    loY = Math.min(loY, p[k + 1])
    hiY = Math.max(hiY, p[k + 1])
  }
  const cx = 0.5 * (loX + hiX)
  const cy = 0.5 * (loY + hiY)
  const points = p.map((v, k) => (k % 2 === 0 ? v - cx : v - cy))
  return { points, sigma: poly.sigma, closed: poly.closed }
}

// --- known optimal segmentations ----------------------------------------------------

describe('known optimal segmentations', () => {
  it('fits an exact open L as two lines costing exactly 5λ', () => {
    const pts = flat([...run([0, 0], [10, 0], 10), ...run([10, 0], [10, 10], 10).slice(1)])
    for (const lambda of [1, 3.5]) {
      const fit = optimalMultimodel(uniformPolyline(pts, 0.05, false), cfg(lambda))
      expect(fit.vertices).toEqual([0, 10, 20])
      expect(fit.kinds).toEqual(['line', 'line'])
      expect(near(fit.cost, 5 * lambda, 1e-9)).toBe(true)
      expect(fit.path.segments.length).toBe(2)
      expect(dist({ x: fit.path.x0, y: fit.path.y0 }, { x: 0, y: 0 })).toBeLessThan(1e-9)
      expect(dist(endOf(fit.path.segments[0]), { x: 10, y: 0 })).toBeLessThan(1e-9)
      expect(dist(endOf(fit.path.segments[1]), { x: 10, y: 10 })).toBeLessThan(1e-9)
    }
  })

  it('fits a closed square as four lines costing exactly 12λ, the cut a corner', () => {
    const c: [number, number][] = [
      [-6, -6],
      [6, -6],
      [6, 6],
      [-6, 6],
    ]
    const pairs: [number, number][] = []
    for (let e = 0; e < 4; e++) pairs.push(...run(c[e], c[(e + 1) % 4], 12).slice(0, 12))
    const fit = optimalMultimodel(uniformPolyline(flat(pairs), 0.05, true), cfg(2))
    expect([...new Set(fit.vertices)].sort((a, b) => a - b)).toEqual([0, 12, 24, 36])
    expect(fit.kinds).toEqual(['line', 'line', 'line', 'line'])
    expect(near(fit.cost, 24, 1e-9)).toBe(true)
  })

  it('fits an exact quarter circle as one arc costing 5λ', () => {
    const pts = flat([[0, 0], ...arcAfter([0, 0], 0, 10, 90, 12)])
    const fit = optimalMultimodel(uniformPolyline(pts, 0.02, false), cfg(2))
    expect(fit.vertices).toEqual([0, 12])
    expect(fit.kinds).toEqual(['arc'])
    expect(near(fit.cost, 10, 1e-6)).toBe(true)
    const s = fit.path.segments[0]
    expect(s.type).toBe('A')
    if (s.type !== 'A') return
    expect(s.rx).toBeCloseTo(10, 9)
    expect(s.ry).toBeCloseTo(10, 9)
    expect(s.sweep).toBe(true)
    expect(s.largeArc).toBe(false)
    expect(dist(endOf(s), { x: 10, y: 10 })).toBeLessThan(1e-9)
  })

  it('breaks a straight run into a tangent arc exactly at the tangent point', () => {
    const pts = flat([...run([-10, 0], [0, 0], 10), ...arcAfter([0, 0], 0, 10, 90, 16)])
    const fit = optimalMultimodel(uniformPolyline(pts, 0.005, false), cfg(2))
    expect(fit.vertices).toEqual([0, 10, 26])
    expect(fit.kinds).toEqual(['line', 'arc'])
    expect(fit.cost).toBeGreaterThanOrEqual(14 - 1e-9)
    expect(fit.cost).toBeLessThan(7.3 * 2)
  })
})

// --- exhaustive optimality -----------------------------------------------------------

/** The cheapest model over every span `i..j` of an open polyline, by `segmentCostDirect`. */
function directSpans(poly: Polyline, tan: Tangents, c: FitConfig, joins: boolean): number[][] {
  const n = poly.points.length / 2
  const span: number[][] = []
  for (let i = 0; i < n; i++) {
    span.push([])
    for (let j = 0; j < n; j++) {
      span[i].push(
        j <= i
          ? Infinity
          : Math.min(
              segmentCostDirect(poly, tan, i, j, 'line', c, joins),
              segmentCostDirect(poly, tan, i, j, 'cubic', c, joins),
              segmentCostDirect(poly, tan, i, j, 'arc', c, joins),
            ),
      )
    }
  }
  return span
}

/** Exhaustive minimum over every segmentation of an open polyline and every model per segment. */
function bruteForceOpen(poly: Polyline, c: FitConfig): number {
  const n = poly.points.length / 2
  const tan = estimateTangents(poly, c)
  const span = directSpans(poly, tan, c, false)
  const interior = Math.max(n - 2, 0)
  let best = Infinity
  for (let mask = 0; mask < 1 << interior; mask++) {
    const verts = [0]
    for (let b = 0; b < interior; b++) if (mask & (1 << b)) verts.push(b + 1)
    verts.push(n - 1)
    let total = 0
    for (let q = 0; q + 1 < verts.length; q++) total += span[verts[q]][verts[q + 1]]
    for (let q = 1; q + 1 < verts.length; q++) total += vertexCost(tan, verts[q], c)
    best = Math.min(best, total)
  }
  return best
}

/** Exhaustive minimum over every cyclic segmentation of a closed polyline. */
function bruteForceClosed(poly: Polyline, c: FitConfig): number {
  const n = poly.points.length / 2
  const tan = estimateTangents(poly, c)
  // span[a][len]: the cheapest model from vertex a, len edges long, on the loop opened at a.
  const span: number[][] = []
  for (let a = 0; a < n; a++) {
    const opened = openAt(poly, tan, a)
    span.push([Infinity])
    for (let len = 1; len <= n; len++) {
      span[a].push(
        Math.min(
          ...(['line', 'cubic', 'arc'] as SegKind[]).map((k) =>
            segmentCostDirect(opened.poly, opened.tan, 0, len, k, c, true),
          ),
        ),
      )
    }
  }
  let best = Infinity
  for (let mask = 1; mask < 1 << n; mask++) {
    const verts: number[] = []
    for (let b = 0; b < n; b++) if (mask & (1 << b)) verts.push(b)
    const m = verts.length
    let total = 0
    for (let q = 0; q < m; q++) {
      const a = verts[q]
      const b = verts[(q + 1) % m]
      const len = m === 1 ? n : (b + n - a) % n
      total += span[a][len] + vertexCost(tan, a, c)
    }
    best = Math.min(best, total)
  }
  return best
}

describe('optimality', () => {
  it('matches exhaustive search on small inputs', () => {
    const line = (n: number, x0: number, y0: number, x1: number, y1: number) =>
      Array.from({ length: n }, (_, k): [number, number] => {
        const t = k / (n - 1)
        return [x0 + t * (x1 - x0), y0 + t * (y1 - y0)]
      })
    const circle12 = Array.from({ length: 12 }, (_, k): [number, number] => {
      const a = (2 * Math.PI * k) / 12
      return [10 * Math.cos(a), 10 * Math.sin(a)]
    })
    const arc = Array.from({ length: 12 }, (_, k): [number, number] => {
      const a = ((0.6 * k) / 11) * 2 * Math.PI
      return [10 * Math.cos(a), 10 * Math.sin(a)]
    })
    const sCurve = Array.from({ length: 12 }, (_, k): [number, number] => {
      const x = k * 1.5
      return [x, 3 * Math.sin(x * 0.4)]
    })
    const bend = [
      ...line(5, 0, 0, 8, 0),
      ...Array.from({ length: 7 }, (_, m): [number, number] => {
        const a = ((Math.PI / 2) * (m + 1)) / 7
        return [8 + 6 * Math.sin(a), 6 - 6 * Math.cos(a)]
      }),
    ]
    const cases = [
      line(10, 0, 0, 20, 6),
      circle12,
      arc,
      sCurve,
      [...line(6, 0, 0, 10, 0), ...line(6, 10, 0, 10, 10)],
      Array.from({ length: 12 }, (_, k): [number, number] => [k, Math.floor(k / 3)]),
      bend,
    ]
    for (const [idx, pairs] of cases.entries()) {
      for (const sigma of [0.5, 0.1]) {
        const poly = uniformPolyline(flat(pairs), sigma, false)
        const got = optimalMultimodel(poly, cfg(1)).cost
        const want = bruteForceOpen(poly, cfg(1))
        expect({ idx, sigma, got, want, same: near(got, want, 1e-7) }).toMatchObject({ same: true })
      }
    }
  })

  it('matches exhaustive search on random inputs', () => {
    // xorshift64, as inkvec's test draws them.
    const MASK = (1n << 64n) - 1n
    let state = 0x9e3779b97f4a7c15n
    const rnd = () => {
      state ^= (state << 13n) & MASK
      state ^= state >> 7n
      state ^= (state << 17n) & MASK
      return Number(state >> 11n) / 2 ** 53
    }
    for (let c = 0; c < 40; c++) {
      const n = 8 + Math.floor(rnd() * 5)
      const pairs: [number, number][] = [[0, 0]]
      let heading = rnd() * 2 * Math.PI
      const curvature = (rnd() - 0.5) * 0.6
      for (let k = 1; k < n; k++) {
        heading += curvature + (rnd() - 0.5) * 0.2
        if (rnd() < 0.12) heading += (rnd() - 0.5) * 3
        const step = 1 + rnd()
        const p = pairs[k - 1]
        pairs.push([p[0] + step * Math.cos(heading), p[1] + step * Math.sin(heading)])
      }
      const sigma = [0.5, 0.2, 0.05][c % 3]
      const poly = uniformPolyline(flat(pairs), sigma, false)
      const got = optimalMultimodel(poly, cfg(1)).cost
      const want = bruteForceOpen(poly, cfg(1))
      expect({ c, got, want, same: near(got, want, 1e-7) }).toMatchObject({ same: true })
    }
  })

  /** A bean: an ellipse with its top pushed in to a concave corner. */
  function bean(n: number, dent: number): [number, number][] {
    return Array.from({ length: n }, (_, k): [number, number] => {
      const a = (2 * Math.PI * k) / n
      const x = 10 * Math.cos(a)
      const y = 4 * Math.sin(a)
      return k === Math.floor(n / 4) ? [x, y - dent] : [x, y]
    })
  }

  it('reaches the exhaustive cyclic optimum on small closed loops, and never goes below it', () => {
    const square: [number, number][] = []
    const c: [number, number][] = [
      [0, 0],
      [6, 0],
      [6, 6],
      [0, 6],
    ]
    for (let e = 0; e < 4; e++) square.push(...run(c[e], c[(e + 1) % 4], 3).slice(0, 3))
    const cases: [string, [number, number][], number, number[]][] = [
      ['square', square, 0.1, [1, 2.5, 4]],
      ['bean', bean(12, 3), 0.1, [1, 2.5, 4]],
      ['bean fine', bean(12, 3), 0.05, [1, 2.5, 4]],
      ['bean deep', bean(11, 5), 0.2, [1, 2.5, 4]],
      ['bean shallow', bean(12, 2), 0.1, [1, 2.5, 4]],
      ['bean 10', bean(10, 3), 0.1, [1, 2.5, 4]],
      ['bean 4', bean(12, 4), 0.2, [1, 2.5, 4]],
      ['bean coarse', bean(12, 3), 0.3, [1, 2.5]],
    ]
    for (const [name, pairs, sigma, lambdas] of cases) {
      for (const lambda of lambdas) {
        const poly = uniformPolyline(flat(pairs), sigma, true)
        const got = optimalMultimodel(poly, cfg(lambda)).cost
        const want = bruteForceClosed(poly, cfg(lambda))
        expect({ name, lambda, got, want, same: near(got, want, 1e-7) }).toMatchObject({
          same: true,
        })
      }
    }
    // Where the two-cut heuristic misses it is still an admissible segmentation.
    for (const [sigma, lambda] of [
      [0.5, 1],
      [0.2, 4],
    ]) {
      const poly = uniformPolyline(flat(bean(12, 3)), sigma, true)
      const got = optimalMultimodel(poly, cfg(lambda)).cost
      const want = bruteForceClosed(poly, cfg(lambda))
      expect(got).toBeGreaterThanOrEqual(want - 1e-7 * want)
    }
  })
})

// --- decimation, caps and forced vertices ------------------------------------------

describe('limits', () => {
  it('runs a long free fit on the decimated grid', () => {
    const pairs = Array.from({ length: 40 }, (_, k): [number, number] => [
      k,
      k % 3 === 0 ? 0 : 0.05,
    ])
    const poly = uniformPolyline(flat(pairs), 0.02, false)
    const fit = optimalMultimodel(poly, cfg(1.5), { maxPoints: 16 })
    expect(fit.vertices).toEqual([0, 39])
    expect(fit.kinds).toEqual(['line'])
    expect(near(fit.cost, 3, 1e-9)).toBe(true)
    // On every point the off-axis ones cost.
    expect(optimalMultimodel(poly, cfg(1.5)).cost).toBeGreaterThan(3.1)
  })

  it('never decimates under a span cap', () => {
    const pairs = Array.from({ length: 40 }, (_, k): [number, number] => [k, 2 * Math.sin(k * 0.7)])
    const poly = uniformPolyline(flat(pairs), 0.1, false)
    const fit = optimalMultimodelCapped(poly, cfg(1), 1, { maxPoints: 16 })
    expect(fit.vertices).toEqual(Array.from({ length: 40 }, (_, k) => k))
    expect(fit.path.segments.length).toBe(39)
    fit.path.segments.forEach((s, q) => {
      expect(dist(endOf(s), { x: pairs[q + 1][0], y: pairs[q + 1][1] })).toBeLessThan(1e-9)
    })
  })

  it('keeps a long open L corner when decimating it', () => {
    const pairs = Array.from({ length: 1603 }, (_, i): [number, number] =>
      i <= 801 ? [i, 0] : [801, i - 801],
    )
    const poly = uniformPolyline(flat(pairs), 0.05, false)
    const kept = decimateIndices(poly, 4, fitConfig(256))
    expect(kept[0]).toBe(0)
    expect(kept[kept.length - 1]).toBe(1602)
    expect(kept.length).toBe(Math.ceil(1603 / 4) + 1)
    expect(kept).toContain(801)
    for (let k = 1; k < kept.length; k++) expect(kept[k]).toBeGreaterThan(kept[k - 1])
  })

  /** A wobbly open run and a lobed closed ring, the shapes the crossing repair refits. */
  function pinnedShapes(): Polyline[] {
    const open = Array.from({ length: 90 }, (_, k): [number, number] => [k, 6 * Math.sin(k * 0.11)])
    const n = 120
    const ring = Array.from({ length: n }, (_, k): [number, number] => {
      const t = ((2 * Math.PI) / n) * k
      const r = 30 + 4 * Math.sin(3 * t)
      return [r * Math.cos(t), r * Math.sin(t)]
    })
    return [uniformPolyline(flat(open), 0.06, false), uniformPolyline(flat(ring), 0.06, true)]
  }

  it('keeps every forced vertex, the path passing through its point', () => {
    for (const poly of pinnedShapes()) {
      const n = poly.points.length / 2
      const forced = [Math.floor(n / 5), Math.floor(n / 2) + 3, Math.floor((4 * n) / 5)]
      const free = optimalMultimodelCapped(poly, cfg(2.5), n)
      for (const maxSpan of [Infinity, n, 25]) {
        const fit = optimalMultimodelForced(poly, cfg(2.5), maxSpan, forced)
        for (const f of forced) {
          expect(fit.vertices).toContain(f)
          expect({ f, through: passesThrough(fit.path, pointOf(poly, f)) }).toEqual({
            f,
            through: true,
          })
        }
        // On an open run the pinned fit restricts the free one; on a loop the free
        // program is the two-cut heuristic, which a forced cut can beat.
        expect(poly.closed || fit.cost >= free.cost - 1e-9).toBe(true)
      }
    }
  })

  it('forcing nothing is the capped or the free program', () => {
    const bits = (f: MultimodelFit) => [f.vertices, f.kinds, f.cost]
    for (const poly of pinnedShapes()) {
      const n = poly.points.length / 2
      const capped = optimalMultimodelCapped(poly, cfg(2), 9)
      expect(bits(optimalMultimodelForced(poly, cfg(2), 9, []))).toEqual(bits(capped))
      const free = optimalMultimodel(poly, cfg(2))
      const none = optimalMultimodelForced(poly, cfg(2), Infinity, [])
      expect(bits(none)).toEqual(bits(free))
      // The ends of an open boundary, out-of-range indices and duplicates force nothing.
      const ends = poly.closed ? [] : [0, n - 1, n + 4, 0]
      expect(bits(optimalMultimodelForced(poly, cfg(2), 9, ends))).toEqual(bits(capped))
    }
  })

  it('normalizes forced indices and caps', () => {
    const open = Limits.pinned(10, false, 12, [9, 3, 3, 0, 14, -1])
    expect(open.forced).toEqual([3])
    expect(open.maxSpan).toBe(Infinity)
    const closed = Limits.pinned(10, true, 0, [0, 9])
    expect(closed.forced).toEqual([0, 9])
    expect(closed.maxSpan).toBe(1)
    expect(closed.allows(8, 9)).toBe(true)
    expect(closed.allows(0, 2)).toBe(false)
    const pinned = Limits.pinned(10, true, Infinity, [5])
    expect(pinned.allows(0, 5)).toBe(true)
    expect(pinned.allows(4, 6)).toBe(false)
    expect(open.allows(2, 4)).toBe(false)
    expect(open.allows(3, 9)).toBe(true)
    expect(open.wallAfter(1)).toBe(3)
    expect(open.wallAfter(3)).toBe(Infinity)
    expect(Limits.FREE.free).toBe(true)
    expect(Limits.capped(5).free).toBe(false)
  })
})

// --- direct span prices -------------------------------------------------------------

describe('segmentCostDirect', () => {
  it('prices hand-built spans', () => {
    const poly = uniformPolyline(flat(run([0, 0], [8, 0], 8)), 0.1, false)
    const lambda = 1.7
    const c = cfg(lambda)
    const t: [Vec, Vec][] = Array.from({ length: 9 }, () => [dir(0), dir(0)])
    t[2][1] = dir(5)
    t[6][0] = dir(-10)
    const tan = tangents(t)
    const line = (i: number, j: number) => segmentCostDirect(poly, tan, i, j, 'line', c, false)
    expect(near(line(0, 8), 2 * lambda, 1e-12)).toBe(true)
    expect(near(line(0, 5), 2 * lambda, 1e-12)).toBe(true)
    expect(near(line(2, 5), 2.25 * lambda, 1e-9)).toBe(true)
    expect(near(line(3, 6), 3 * lambda, 1e-9)).toBe(true)
    expect(near(line(2, 6), 3.25 * lambda, 1e-9)).toBe(true)
    for (const [i, j] of [
      [0, 9],
      [3, 3],
      [5, 2],
    ]) {
      expect(line(i, j)).toBe(Infinity)
    }
    const cubic = (i: number, j: number) => segmentCostDirect(poly, tan, i, j, 'cubic', c, false)
    expect(cubic(3, 4)).toBe(Infinity)
    expect(cubic(0, 9)).toBe(Infinity)

    const apts = flat([[0, 0], ...arcAfter([0, 0], 0, 6, 60, 8)])
    const apoly = uniformPolyline(apts, 0.05, false)
    const atan = tangents(
      Array.from({ length: 9 }, (_, k): [Vec, Vec] => [dir((60 * k) / 8), dir((60 * k) / 8)]),
    )
    expect(near(segmentCostDirect(apoly, atan, 0, 8, 'arc', c, true), 5 * lambda, 1e-6)).toBe(true)
  })
})

// --- the continuous refinement on hand-built solutions ------------------------------

function solution(vertices: number[], kinds: SegKind[], arms: (Arms | null)[]): Solution {
  return {
    vertices,
    kinds,
    arms,
    tans: kinds.map(() => null),
    arcs: kinds.map(() => null),
    cost: 0,
  }
}

interface Arms {
  d0: number
  d1: number
}

/** Moment-matched arms for span `i..j`, as the program hands them to `refine`. */
function g1Arms(poly: Polyline, tan: Tangents, i: number, j: number): Arms | null {
  const raw = new Float64Array(3)
  rawMomentsDirect(poly.points, i, j, raw)
  const s = arcLengths(poly.points)
  const f = bestCubic(
    poly.points,
    poly.sigma,
    s,
    i,
    j,
    tan.outgoing[i],
    tan.incoming[j],
    raw,
    false,
  )
  return f ? { d0: f.d0, d1: f.d1 } : null
}

function refineHand(poly: Polyline, tan: Tangents, sol: Solution, lambda: number): FitPath {
  return refine(poly, tan, new PrefixSums(poly.points, poly.sigma), sol, cfg(lambda))
}

/** An L whose corner sample is cut off: the vertical edge at `x = x`, the last horizontal sample at 10. */
function chamferedL(x: number): Polyline {
  const pairs = run([0, 0], [10, 0], 10)
  for (let k = 1; k <= 10; k++) pairs.push([x, k])
  return uniformPolyline(flat(pairs), 0.05, false)
}

/** A line from (−10, 3) to (0, 3), then a left arc of radius 10 leaving at `arcDir`, 80° in 10 samples. */
function lineThenArc(arcDir: number, startErr: number, sigma: number): [Polyline, Tangents] {
  const pairs = [...run([-10, 3], [0, 3], 10), ...arcAfter([0, 3], arcDir, 10, 80, 10)]
  const t: [Vec, Vec][] = Array.from({ length: 11 }, () => [dir(0), dir(0)])
  for (let k = 1; k <= 10; k++) t.push([dir(arcDir + 8 * k), dir(arcDir + 8 * k)])
  t[10][1] = dir(arcDir + startErr)
  return [uniformPolyline(flat(pairs), sigma, false), tangents(t)]
}

/** The start direction of the cubic `q` of a path. */
function cubicStartDir(path: FitPath, q: number): Vec {
  const from = endOf(path.segments[q - 1])
  const s = path.segments[q]
  if (s.type !== 'C') throw new Error(`segment ${q} is not a cubic`)
  return unitOf(s.x1 - from.x, s.y1 - from.y)
}

describe('refine', () => {
  it('moves a line–line corner to the intersection only within reach', () => {
    const sol = solution([0, 10, 20], ['line', 'line'], [null, null])
    const tan = tangents(Array.from({ length: 21 }, (): [Vec, Vec] => [dir(0), dir(0)]))
    const near1 = refineHand(chamferedL(11), tan, sol, 1)
    expect(dist({ x: near1.x0, y: near1.y0 }, { x: 0, y: 0 })).toBeLessThan(1e-12)
    expect(dist(endOf(near1.segments[0]), { x: 11, y: 0 })).toBeLessThan(1e-9)
    expect(dist(endOf(near1.segments[1]), { x: 11, y: 10 })).toBeLessThan(1e-12)
    expect(near1.closed).toBe(false)
    const far = refineHand(chamferedL(13), tan, sol, 1)
    expect(dist(endOf(far.segments[0]), { x: 10, y: 0 })).toBeLessThan(1e-12)
  })

  it('snaps a cubic to the direction of the line before it', () => {
    const [poly, tan] = lineThenArc(0, 5, 0.01)
    const sol = solution([0, 10, 20], ['line', 'cubic'], [null, g1Arms(poly, tan, 10, 20)])
    const path = refineHand(poly, tan, sol, 1)
    const d = cubicStartDir(path, 1)
    expect(d.x).toBeCloseTo(1, 12)
    expect(Math.abs(d.y)).toBeLessThan(1e-12)
    expect(pathMaxDeviation(poly, path)).toBeLessThan(0.01)
  })

  it('snaps a true kink only when the break pays for it', () => {
    for (const [sigma, snapped] of [
      [1, true],
      [0.01, false],
    ] as const) {
      const [poly, tan] = lineThenArc(5, 0, sigma)
      const sol = solution([0, 10, 20], ['line', 'cubic'], [null, g1Arms(poly, tan, 10, 20)])
      const d = cubicStartDir(refineHand(poly, tan, sol, 1), 1)
      const want = snapped ? dir(0) : dir(5)
      expect(d.x).toBeCloseTo(want.x, 12)
      expect(d.y).toBeCloseTo(want.y, 12)
    }
  })

  it('joins short cubics at the bisector of their own tangents', () => {
    for (const [mid, last] of [
      [7, 10],
      [10, 13],
      [7, 13],
    ]) {
      const pairs = [
        ...run([-4, 0], [0, 0], 4),
        ...arcAfter([0, 0], 0, 8, 7 * (last - 4), last - 4),
      ]
      const truth = (k: number) => dir(k <= 4 ? 0 : 7 * (k - 4))
      const t: [Vec, Vec][] = pairs.map((_, k): [Vec, Vec] => [truth(k), truth(k)])
      const at = 7 * (mid - 4)
      t[mid][0] = dir(at + 4)
      t[mid][1] = dir(at - 2)
      const tan = tangents(t)
      const poly = uniformPolyline(flat(pairs), 1, false)
      const arms = [null, g1Arms(poly, tan, 4, mid), g1Arms(poly, tan, mid, last)]
      expect(arms[1] && arms[2]).toBeTruthy()
      const sol = solution([0, 4, mid, last], ['line', 'cubic', 'cubic'], arms)
      const path = refineHand(poly, tan, sol, 1)
      const want = dir(at + 1)
      const a = path.segments[1]
      const b = path.segments[2]
      if (a.type !== 'C' || b.type !== 'C') throw new Error('expected two cubics')
      for (const d of [unitOf(a.x - a.x2, a.y - a.y2), unitOf(b.x1 - a.x, b.y1 - a.y)]) {
        expect(d.x).toBeCloseTo(want.x, 9)
        expect(d.y).toBeCloseTo(want.y, 9)
      }
    }
  })

  it('moves only line–line corners on an opened loop', () => {
    const c: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]
    const pairs: [number, number][] = []
    for (let e = 0; e < 4; e++) pairs.push(...run(c[e], c[(e + 1) % 4], 20).slice(0, 20))
    pairs[0] = [0.5, 0.5]
    pairs[20] = [19.5, 0.5]
    pairs.push(pairs[0])
    const poly = uniformPolyline(flat(pairs), 0.05, true)
    const side = [dir(0), dir(90), dir(180), dir(270)]
    const tan = tangents(
      Array.from({ length: 81 }, (_, k): [Vec, Vec] => [
        side[Math.floor(k / 20) % 4],
        side[Math.floor(k / 20) % 4],
      ]),
    )
    const sol = solution(
      [0, 20, 40, 60, 80],
      ['line', 'line', 'line', 'cubic'],
      [null, null, null, g1Arms(poly, tan, 60, 80)],
    )
    const path = refineHand(poly, tan, sol, 1)
    expect(dist({ x: path.x0, y: path.y0 }, { x: 0.5, y: 0.5 })).toBeLessThan(1e-12)
    expect(dist(endOf(path.segments[0]), { x: 20, y: 0 })).toBeLessThan(1e-9)
    expect(dist(endOf(path.segments[1]), { x: 20, y: 20 })).toBeLessThan(1e-9)
    expect(dist(endOf(path.segments[3]), { x: 0.5, y: 0.5 })).toBeLessThan(1e-12)
  })

  it('snaps every line–cubic join of an opened rounded square', () => {
    const side = 10
    const arcN = 8
    const pairs: [number, number][] = [[0, 0]]
    const t: [Vec, Vec][] = [[dir(0), dir(0)]]
    const v = [0]
    let heading = 0
    for (let e = 0; e < 4; e++) {
      const from = pairs[pairs.length - 1]
      const to: [number, number] = [
        from[0] + side * Math.cos(heading * DEG),
        from[1] + side * Math.sin(heading * DEG),
      ]
      pairs.push(...run(from, to, side).slice(1))
      for (let k = 0; k < side; k++) t.push([dir(heading), dir(heading)])
      v.push(pairs.length - 1)
      pairs.push(...arcAfter(to, heading, 4, 90, arcN))
      for (let k = 1; k <= arcN; k++) {
        const d = dir(heading + (90 * k) / arcN)
        t.push([d, d])
      }
      v.push(pairs.length - 1)
      heading += 90
    }
    const n = pairs.length
    expect(n).toBe(4 * (side + arcN) + 1)
    pairs[n - 1] = pairs[0]
    t[v[1]][1] = dir(5)
    t[v[5]][1] = dir(185)
    const tan = tangents(t)
    const poly = uniformPolyline(flat(pairs), 0.05, true)
    const kinds: SegKind[] = Array.from({ length: 8 }, (_, q) => (q % 2 === 0 ? 'line' : 'cubic'))
    const arms = kinds.map((k, q) => (k === 'cubic' ? g1Arms(poly, tan, v[q], v[q + 1]) : null))
    const path = refineHand(poly, tan, solution(v, kinds, arms), 1)
    for (const [q, want] of [
      [1, dir(0)],
      [5, dir(180)],
    ] as const) {
      const d = cubicStartDir(path, q)
      expect(d.x).toBeCloseTo(want.x, 12)
      expect(d.y).toBeCloseTo(want.y, 12)
    }
    for (const [q, want] of [
      [1, dir(90)],
      [3, dir(180)],
      [5, dir(270)],
      [7, dir(0)],
    ] as const) {
      const s = path.segments[q]
      if (s.type !== 'C') throw new Error(`segment ${q} is not a cubic`)
      const d = unitOf(s.x - s.x2, s.y - s.y2)
      expect(d.x).toBeCloseTo(want.x, 9)
      expect(d.y).toBeCloseTo(want.y, 9)
    }
    expect(pathMaxDeviation(poly, path)).toBeLessThan(0.01)
  })

  it('emits arcs from their circle and falls back to a line without one', () => {
    const pairs: [number, number][] = [
      [0, 0],
      ...arcAfter([0, 0], 0, 5, 90, 6),
      ...run([5, 5], [5, 9], 4).slice(1),
    ]
    const poly = uniformPolyline(flat(pairs), 0.1, false)
    const tan = tangents(Array.from({ length: 11 }, (): [Vec, Vec] => [dir(0), dir(0)]))
    const sol = solution([0, 6, 10], ['arc', 'arc'], [null, null])
    sol.arcs[0] = { rx: 5, ry: 5, phi: 0, largeArc: false, sweep: true }
    const path = refineHand(poly, tan, sol, 1)
    const a = path.segments[0]
    expect(a).toMatchObject({ type: 'A', rx: 5, ry: 5, rotation: 0, largeArc: false, sweep: true })
    expect(dist(endOf(a), { x: 5, y: 5 })).toBeLessThan(1e-9)
    expect(path.segments[1].type).toBe('L')
    expect(dist(endOf(path.segments[1]), { x: 5, y: 9 })).toBeLessThan(1e-12)
  })
})

// --- the table and its bounds ---------------------------------------------------------

/** A deterministic stream in `[0, 1)`, seeded as inkvec's scan tests seed theirs. */
function scanRng(seed: number): () => number {
  const MASK = (1n << 64n) - 1n
  let st = ((BigInt(seed) * 0x9e3779b97f4a7c15n) & MASK) | 1n
  return () => {
    st = (st * 6364136223846793005n + 1442695040888963407n) & MASK
    return Number(st >> 11n) / 2 ** 53
  }
}

/** A long open boundary with a straight run, a circular bend, an elliptical sweep, a wobble and a corner. */
function boundary(): Polyline {
  const pairs: [number, number][] = []
  for (let k = 0; k < 60; k++) pairs.push([k, 0])
  for (let k = 0; k < 80; k++) {
    const t = (k / 80) * Math.PI
    pairs.push([60 + 25 * Math.sin(t), 25 - 25 * Math.cos(t)])
  }
  for (let k = 0; k < 120; k++) {
    const t = (k / 120) * Math.PI
    pairs.push([60 - 70 * Math.sin(t), 50 + 18 * (1 - Math.cos(t))])
  }
  for (let k = 0; k < 90; k++) pairs.push([60 - k * 0.9, 86 + 3 * Math.sin(k * 0.35)])
  for (let k = 0; k < 40; k++) pairs.push([-21, 86 - k * 1.3])
  return uniformPolyline(flat(pairs), 0.35, false)
}

/** Tracer-like boundaries: a lobed blob, a rounded square, a hook, and the degenerate ones. */
function tracerLike(): Polyline[] {
  const out: Polyline[] = []
  for (const seed of [1, 3]) {
    const r = scanRng(seed)
    const lobes = 2 + seed
    const n = 150 + 40 * seed
    const pairs: [number, number][] = []
    for (let k = 0; k < n; k++) {
      const t = (k / n) * 2 * Math.PI
      const rad = 30 + 6 * Math.sin(lobes * t) + 2 * Math.cos(3 * lobes * t)
      pairs.push([rad * Math.cos(t) + 0.05 * (r() - 0.5), rad * Math.sin(t) + 0.05 * (r() - 0.5)])
    }
    const sigma = Array.from({ length: n }, (_, k) => (k % 17 === 0 ? 0.5 : 0.05 + 0.01 * r()))
    out.push(polyline(flat(pairs), sigma, true))
  }
  const sq: [number, number][] = []
  const dirs = [
    [1, 0],
    [0, 1],
    [-1, 0],
    [0, -1],
  ]
  const orig = [
    [4, 0],
    [40, 4],
    [36, 40],
    [0, 36],
  ]
  const centers = [
    [36, 4],
    [36, 36],
    [4, 36],
    [4, 4],
  ]
  for (let s = 0; s < 4; s++) {
    for (let k = 0; k < 32; k++) sq.push([orig[s][0] + dirs[s][0] * k, orig[s][1] + dirs[s][1] * k])
    for (let k = 0; k < 6; k++) {
      const a = (s - 1 + k / 6) * (Math.PI / 2)
      sq.push([centers[s][0] + 4 * Math.cos(a), centers[s][1] + 4 * Math.sin(a)])
    }
  }
  out.push(uniformPolyline(flat(sq), 0.056, true))
  const r = scanRng(99)
  const hook: [number, number][] = []
  for (let k = 0; k < 70; k++) {
    const t = (k / 70) * 2.5
    hook.push([20 * Math.cos(t), 20 * Math.sin(t) + 0.04 * r()])
  }
  for (let k = 0; k < 40; k++) hook.push([-16 + k, 12 + 0.04 * r()])
  out.push(uniformPolyline(flat(hook), 0.06, false))
  const r7 = scanRng(7)
  out.push(
    uniformPolyline(
      flat(Array.from({ length: 200 }, (_, k): [number, number] => [k, 0.03 * (r7() - 0.5)])),
      0.05,
      false,
    ),
  )
  out.push(
    uniformPolyline(
      flat(Array.from({ length: 120 }, (_, k): [number, number] => [k, k % 2 === 0 ? 0 : 0.8])),
      0.05,
      false,
    ),
  )
  out.push(
    uniformPolyline(
      flat(
        Array.from({ length: 90 }, (_, k): [number, number] => [
          Math.floor(k / 3),
          Math.sin(Math.floor(k / 3) * 0.3) * 4,
        ]),
      ),
      0.1,
      false,
    ),
  )
  return out
}

/** The constraints the tables are compared under: none, two caps, forced vertices with and without a cap. */
function limitsFor(n: number): Limits[] {
  const forced = [
    Math.floor(n / 7),
    Math.floor(n / 3),
    Math.floor(n / 3) + 1,
    Math.floor(n / 2),
    n - 2,
  ]
  return [
    Limits.FREE,
    Limits.capped(45),
    Limits.capped(7),
    new Limits(Infinity, forced),
    new Limits(7, forced),
  ]
}

function tableBits(t: Table): unknown[] {
  return Array.from(t.best, (b, j) => [
    b,
    t.from[j],
    t.kind[j],
    t.arms[2 * j],
    t.arms[2 * j + 1],
    t.tans[j],
    t.arcs[j],
  ])
}

function scorer(poly: Polyline, c: FitConfig, joins: boolean): SpanScorer {
  const tan = estimateTangents(poly, c)
  return new SpanScorer(
    poly.points,
    poly.sigma,
    tan,
    new PrefixSums(poly.points, poly.sigma),
    c,
    joins,
  )
}

describe('the table', () => {
  it('is the same with and without its bounds', () => {
    let compared = 0
    const polys = [boundary(), ...tracerLike()]
    for (const [p, poly] of polys.entries()) {
      for (const lambda of p === 0 ? [0.7, 8.54] : [2.5]) {
        for (const joins of p === 0 ? [false, true] : [p % 2 === 0]) {
          const bounded = scorer(poly, cfg(lambda), joins)
          const reference = scorer(poly, cfg(lambda), joins)
          reference.bounds = false
          for (const lim of limitsFor(poly.points.length / 2)) {
            const want = tableBits(reference.fillTable(lim))
            const got = tableBits(bounded.fillTable(lim))
            expect({ p, lambda, joins, table: got }).toEqual({ p, lambda, joins, table: want })
            compared++
          }
        }
      }
    }
    expect(compared).toBeGreaterThan(40)
  })

  it('is split by forced vertices: every one is a vertex, and nothing before the first sees past it', () => {
    for (const poly of [boundary(), ...tracerLike()]) {
      const n = poly.points.length / 2
      const lim = new Limits(Infinity, [
        Math.floor(n / 4),
        Math.floor(n / 2),
        Math.floor((3 * n) / 4),
      ])
      for (const joins of [false, true]) {
        const sc = scorer(poly, cfg(2.5), joins)
        const tab = sc.fillTable(lim)
        const verts = [n - 1]
        let cur = n - 1
        while (cur !== 0) {
          cur = tab.from[cur]
          verts.push(cur)
        }
        for (const f of lim.forced) expect(verts).toContain(f)
        const free = sc.fillTable(Limits.FREE)
        for (let j = 0; j <= lim.forced[0]; j++) expect(tab.best[j]).toBe(free.best[j])
      }
    }
  })

  it('stops each scan where a counter of every answer would, whatever the bounds leave unknown', () => {
    let stoppedEarly = 0
    for (const poly of [boundary(), ...tracerLike()]) {
      const c = cfg(2.5)
      const reference = scorer(poly, c, true)
      reference.bounds = false
      const sc = scorer(poly, c, true)
      const n = poly.points.length / 2
      const table = reference.fillTable(Limits.FREE)
      const stop = (s: SpanScorer, i: number, base: number, best: (j: number) => number) => {
        const cut = new CutOff(i)
        for (let j = i + 1; j < n; j++) {
          s.terms(i, j, base, best(j))
          if (cut.push(j, s.lastOver, s, i)) return j
        }
        return n
      }
      for (let i = 0; i < n - 1; i++) {
        if (!Number.isFinite(table.best[i])) continue
        const want = stop(reference, i, 0, () => Infinity)
        // A high base makes most cubics dead, so most "over"s are left unknown.
        const got = stop(sc, i, table.best[i] + 50, (j) => table.best[j])
        expect({ start: i, stop: got }).toEqual({ start: i, stop: want })
        if (want < n) stoppedEarly++
      }
    }
    expect(stoppedEarly).toBeGreaterThan(0)
  })

  it('gives ties to the earlier start: nextUp is the least double above', () => {
    expect(nextUp(5)).toBe(5 + 2 ** -50)
    expect(nextUp(1)).toBe(1 + Number.EPSILON)
    expect(nextUp(0)).toBe(Number.MIN_VALUE)
    expect(nextUp(-1)).toBe(-1 + Number.EPSILON / 2)
    expect(nextUp(-Number.MIN_VALUE)).toBe(-0)
    expect(nextUp(Infinity)).toBe(Infinity)
    expect(nextUp(-Infinity)).toBe(-Number.MAX_VALUE)
    expect(Number.isNaN(nextUp(NaN))).toBe(true)
    // An earlier start is dead only above the winner's cost, a later one at it: a
    // floor that rounds away (5 + 1e-300 is 5) cannot kill an earlier start's tie.
    const dead = (earlier: boolean, floor: number) => 5 + floor >= (earlier ? nextUp(5) : 5)
    expect(dead(true, 1e-9)).toBe(true)
    expect(dead(true, 1e-300)).toBe(false)
    expect(dead(true, 0)).toBe(false)
    expect(dead(false, 0)).toBe(true)
  })

  it('cuts off where a counter of every answer would, on random answer streams', () => {
    const r = scanRng(5)
    for (let c = 0; c < 2000; c++) {
      const len = 1 + Math.floor(r() * 40)
      const pOver = [0.5, 0.8, 0.95][c % 3]
      const truth = Array.from({ length: len }, () => r() < pOver)
      const hidden = Array.from({ length: len }, () => r() < 0.6)
      const i = 3
      let runLen = 0
      let want = len
      for (let k = 0; k < len; k++) {
        runLen = truth[k] ? runLen + 1 : 0
        if (runLen >= PRUNE_PATIENCE) {
          want = k + 1
          break
        }
      }
      const cut = new CutOff(i)
      const oracle = { cubicOver: (_: number, q: number) => truth[q - i - 1] }
      let got = len
      for (let k = 0; k < len; k++) {
        const answer = hidden[k] ? OVER_UNKNOWN : truth[k] ? OVER_YES : OVER_NO
        if (cut.push(i + 1 + k, answer, oracle, i)) {
          got = k + 1
          break
        }
      }
      expect({ c, stop: got }).toEqual({ c, stop: want })
    }
  })
})

// --- shapes -----------------------------------------------------------------------------

/** How much of a path's length is straight. */
function straightFraction(path: FitPath): number {
  let cx = path.x0
  let cy = path.y0
  let straight = 0
  let total = 0
  for (const s of path.segments) {
    const d = Math.hypot(s.x - cx, s.y - cy)
    total += d
    if (s.type === 'L') straight += d
    cx = s.x
    cy = s.y
  }
  return total <= 0 ? 0 : straight / total
}

function circlePairs(n: number, r: number): [number, number][] {
  return Array.from({ length: n }, (_, k): [number, number] => {
    const a = (2 * Math.PI * k) / n
    return [r * Math.cos(a), r * Math.sin(a)]
  })
}

/** A square of side `side` rotated `deg`, about unit spacing, corners on samples. */
function rotatedSquare(side: number, deg: number): [number, number][] {
  const per = Math.round(side)
  const corners = [
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]
  const c = Math.cos(deg * DEG)
  const s = Math.sin(deg * DEG)
  const out: [number, number][] = []
  for (let e = 0; e < 4; e++) {
    const [ax, ay] = corners[e]
    const [bx, by] = corners[(e + 1) % 4]
    for (let k = 0; k < per; k++) {
      const t = k / per
      const x = side * (ax + t * (bx - ax))
      const y = side * (ay + t * (by - ay))
      out.push([c * x - s * y, s * x + c * y])
    }
  }
  return out
}

describe('shapes', () => {
  const standard = fitConfig(256)

  it('describes a clean circle with a few curves', () => {
    const poly = uniformPolyline(flat(circlePairs(300, 46)), 0.05, true)
    const fit = optimalMultimodel(poly, standard)
    expect(straightFraction(fit.path)).toBeLessThan(0.02)
    expect(count(fit.path)[1]).toBeLessThanOrEqual(6)
    expect(pathMaxDeviation(poly, fit.path)).toBeLessThan(0.1)
  })

  it('fits a rotated square as four lines', () => {
    const fit = optimalMultimodel(
      uniformPolyline(flat(rotatedSquare(80, 23)), 0.05, true),
      standard,
    )
    expect(count(fit.path)).toEqual([4, 0])
  })

  it('keeps an exact dense square at four segments through every corner, whatever its sampling', () => {
    for (const side of [180, 257, 513]) {
      for (const phase of [0, 2]) {
        const pairs = rotatedSquare(side, 36.87)
        const rotated = [...pairs.slice(phase), ...pairs.slice(0, phase)]
        const poly = uniformPolyline(flat(rotated), 0.05, true)
        const fit = optimalMultimodel(poly, fitConfig(side))
        expect({ side, phase, segments: fit.path.segments.length }).toEqual({
          side,
          phase,
          segments: 4,
        })
        expect(pathMaxDeviation(poly, fit.path)).toBeLessThan(1e-6)
      }
    }
  })

  it('lands corners on a D shape and keeps its flat side one line', () => {
    const r = 30
    const pairs: [number, number][] = []
    const edgeN = Math.round(2 * r)
    for (let k = 0; k < edgeN; k++) pairs.push([0, -r + (2 * r * k) / edgeN])
    const c1 = pairs.length
    const arcN = Math.round(Math.PI * r)
    for (let k = 0; k < arcN; k++) {
      const a = Math.PI / 2 - (Math.PI * k) / arcN
      pairs.push([r * Math.cos(a), r * Math.sin(a)])
    }
    const n = pairs.length
    const fit = optimalMultimodel(uniformPolyline(flat(pairs), 0.05, true), standard)
    for (const c of [0, c1]) {
      const hit = fit.vertices.some((v) => Math.min((v + n - c) % n, (c + n - v) % n) <= 1)
      expect({ corner: c, hit }).toEqual({ corner: c, hit: true })
    }
    const [lines, curves] = count(fit.path)
    expect(lines).toBe(1)
    expect(curves).toBeLessThanOrEqual(4)
  })

  it('handles degenerate inputs', () => {
    const cases: [number, number][][] = [
      [],
      [[1, 1]],
      [
        [1, 1],
        [2, 2],
      ],
      Array.from({ length: 8 }, (): [number, number] => [3, 3]),
      [
        [0, 0],
        [2.5, 2.5],
        [5, 5],
      ],
    ]
    for (const pairs of cases) {
      for (const closed of [false, true]) {
        const fit = optimalMultimodel(uniformPolyline(flat(pairs), 0.5, closed), standard)
        expect(fit.path.segments.length).toBeLessThan(8)
        const edge = fitPolyline(
          flat(pairs),
          new Float64Array(pairs.length).fill(0.5),
          closed,
          standard,
        )
        expect(Number.isFinite(edge.chi2)).toBe(true)
      }
    }
  })

  it('keeps no cubic past a quarter turn on a round cap under the written-arcs prices', () => {
    const roundCap = (r: number, cap: number): Polyline => {
      const pairs: [number, number][] = []
      const sigma: number[] = []
      for (let k = 0; k < 20; k++) {
        pairs.push([-r, 20 - k])
        sigma.push(0.05)
      }
      const m = Math.round(Math.PI * r)
      for (let k = 0; k <= m; k++) {
        const a = Math.PI * (1 - k / m)
        pairs.push([r * Math.cos(a), -r * Math.sin(a)])
        sigma.push(cap)
      }
      for (let k = 1; k <= 20; k++) {
        pairs.push([r, k])
        sigma.push(0.05)
      }
      return polyline(flat(pairs), sigma, false)
    }
    const widest = (poly: Polyline): number => {
      const path = optimalMultimodel(poly, fitConfig(128)).path
      let x = path.x0
      let y = path.y0
      let most = 0
      for (const s of path.segments) {
        if (s.type === 'C') {
          const a = unitOf(s.x1 - x, s.y1 - y)
          const b = unitOf(s.x - s.x2, s.y - s.y2)
          most = Math.max(most, Math.acos(Math.min(Math.max(a.x * b.x + a.y * b.y, -1), 1)) / DEG)
        }
        x = s.x
        y = s.y
      }
      return most
    }
    const written = withWrittenArcs(STANDARD_COST_MODEL)
    const unlimited = { ...STANDARD_COST_MODEL, arcParams: PARAMS_ARC_WRITTEN }
    for (const [r, cap] of [
      [5.3, 0.05],
      [8, 0.35],
    ]) {
      const poly = roundCap(r, cap)
      expect(withCostModel(written, () => widest(poly))).toBeLessThanOrEqual(100)
      expect(withCostModel(unlimited, () => widest(poly))).toBeGreaterThan(110)
    }
  })
})

// --- the edge entry point ------------------------------------------------------------

describe('fitPolyline', () => {
  const standard = fitConfig(256)

  it('fits a noisy straight run as one line from its first point to its last', () => {
    const pts = noisy(
      Array.from({ length: 60 }, (_, k): [number, number] => [3 + k, 7 + 0.4 * k]),
      0.06,
      21,
    )
    const sigma = new Float64Array(60).fill(0.05)
    const edge = fitPolyline(pts, sigma, false, standard)
    expect(segsOf(edge).map((s) => s.type)).toEqual(['L'])
    expect([edge.x0, edge.y0]).toEqual([pts[0], pts[1]])
    const last = segsOf(edge)[0]
    expect([last.x, last.y]).toEqual([pts[118], pts[119]])
    expect(edge.closed).toBe(false)
    expect(edge.params).toBe(4)
  })

  it('fits a noisy circular arc as one arc', () => {
    const pairs = arcAfter([5, 5], 20, 25, 100, 50)
    const pts = noisy([[5, 5], ...pairs], 0.04, 22)
    const edge = fitPolyline(pts, new Float64Array(51).fill(0.05), false, standard)
    expect(segsOf(edge).length).toBe(1)
    const a = segsOf(edge)[0]
    const radii = a.type === 'A' ? [a.rx, a.ry] : []
    expect(radii.length).toBe(2)
    expect(radii[0]).toBeCloseTo(25, 0)
    expect(radii[1]).toBe(radii[0])
    expect(edge.params).toBe(2 + 5)
  })

  it('fits a rounded rectangle as four lines and four arcs, the joins at the tangent points', () => {
    const pts = noisy(roundedRect(40, 24, 6, 8), 0.02, 9)
    const sigma = new Float64Array(pts.length / 2).fill(0.05)
    const edge = fitPolyline(pts, sigma, true, standard)
    const types = segsOf(edge)
      .map((s) => s.type)
      .join('')
    expect(['LALALALA', 'ALALALAL']).toContain(types)
    const fit = optimalMultimodel(uniformPolyline(pts, 0.05, true), standard)
    expect([...new Set(fit.vertices)].sort((a, b) => a - b)).toEqual([
      0, 28, 36, 48, 56, 84, 92, 104,
    ])
    expect(edge.closed).toBe(true)
    const last = segsOf(edge)[segsOf(edge).length - 1]
    expect([last.x, last.y]).toEqual([edge.x0, edge.y0])
  })

  it('keeps the tips of a star as vertices', () => {
    const pts = noisy(star(), 0.03, 11)
    const fit = optimalMultimodel(uniformPolyline(pts, 0.05, true), standard)
    for (const tip of [0, 24, 48, 72, 96]) expect(fit.vertices).toContain(tip)
    const edge = fitPolyline(pts, new Float64Array(120).fill(0.05), true, standard)
    expect(segsOf(edge).every((s) => s.type === 'L')).toBe(true)
    expect(segsOf(edge).length).toBe(10)
  })

  it('honors a forced vertex', () => {
    const pts = noisy(parabola(), 0.02, 2)
    const sigma = new Float64Array(41).fill(0.05)
    const free = fitPolyline(pts, sigma, false, cfg(7.5))
    expect(segsOf(free).length).toBe(1)
    const pinned = fitPolyline(pts, sigma, false, cfg(7.5), { forced: [17] })
    const p = { x: pts[34], y: pts[35] }
    expect(segsOf(pinned).some((s) => dist(endOf(s), p) < 1e-9)).toBe(true)
    const ring = noisy(rationalCircle(50, 40, 30, 16), 0.03, 10)
    const ringEdge = fitPolyline(ring, new Float64Array(64).fill(0.05), true, cfg(7.5), {
      forced: [13],
    })
    expect(dist({ x: ringEdge.x0, y: ringEdge.y0 }, { x: ring[26], y: ring[27] })).toBeLessThan(
      1e-9,
    )
  })

  it('reports params and chi2 under the objective it was fitted with', () => {
    const pts = noisy(rationalCircle(50, 40, 30, 16), 0.03, 10)
    const sigma = new Float64Array(64).fill(0.05)
    const edge = fitPolyline(pts, sigma, true, cfg(7.5))
    let params = 2
    for (const s of segsOf(edge)) params += segmentParams(s)
    expect(edge.params).toBe(params)
    // χ² is the sampled distance from the points, read from the path's start.
    const fit = optimalMultimodel(uniformPolyline(pts, 0.05, true), cfg(7.5))
    const cut = fit.vertices[0]
    const rot = new Float64Array(128)
    for (let k = 0; k < 64; k++) {
      rot[2 * k] = pts[2 * ((cut + k) % 64)]
      rot[2 * k + 1] = pts[2 * ((cut + k) % 64) + 1]
    }
    expect(edge.chi2).toBe(sampledChi2(rot, sigma, edge.x0, edge.y0, segsOf(edge)))
    // The exact nearest-point χ² agrees with it to within the sampling floor.
    const exact = pathChi2(uniformPolyline(pts, 0.05, true), {
      x0: edge.x0,
      y0: edge.y0,
      segments: segsOf(edge),
      closed: true,
    })
    expect(Math.abs(edge.chi2 - exact)).toBeLessThan(0.05 * 64)
    // A description's cost is never below the program's own optimum by more than
    // its start point and its residual sampling.
    expect(0.5 * edge.chi2 + 7.5 * edge.params).toBeGreaterThan(fit.cost - 1)
  })

  it('is deterministic', () => {
    const pts = noisy(roundedRect(60, 36, 9, 14), 0.02, 19)
    const sigma = new Float64Array(pts.length / 2).fill(0.03)
    expect(fitPolyline(pts, sigma, true, standard)).toEqual(fitPolyline(pts, sigma, true, standard))
  })

  it('fits a 2000-point ring in reasonable time', () => {
    const pts = noisy(rationalCircle(0, 0, 300, 500), 0.05, 13)
    const sigma = new Float64Array(2000).fill(0.05)
    const t0 = performance.now()
    const edge = fitPolyline(pts, sigma, true, standard)
    const ms = performance.now() - t0
    expect(segsOf(edge).length).toBeGreaterThanOrEqual(3)
    expect(segsOf(edge).length).toBeLessThanOrEqual(6)
    expect(ms).toBeLessThan(20000)
  })
})
