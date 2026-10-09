import { describe, expect, it } from 'vitest'
import { OUTSIDE } from '../../src/planar/types'
import type { FaceFill, PlanarMap, PremultipliedImage } from '../../src/planar/types'
import { BandProblem, buildUnknowns, pinFrame } from '../../src/solve/band'
import { solveBoundaries } from '../../src/solve/boundary'
import type { SolveReport } from '../../src/solve/boundary'
import { FoldCounter } from '../../src/solve/folds'
import { MAX_TOTAL } from '../../src/solve/lbfgs'
import type { LbfgsStep } from '../../src/solve/lbfgs'
import {
  cloneMap,
  diskRegion,
  fillsByFace,
  flat,
  handMap,
  labelsFrom,
  labelsOfRegions,
  mapOfLabels,
  polygonBoundaryDistance,
  polygonRegion,
  render,
  rgbaOf,
  segmentDistance,
} from './solve-helpers'
import type { Region } from './solve-helpers'

const PAPER = flat(0.95, 0.9, 0.8)
const INK = flat(0.1, 0.2, 0.7)
const RED = flat(0.8, 0.15, 0.1)
const WHITE = flat(1, 1, 1)
const BLACK = flat(0, 0, 0)

/** The data term alone (no priors) of `map` at its current points. */
function dataTerm(map: PlanarMap, image: PremultipliedImage, fills: readonly FaceFill[]): number {
  const u = buildUnknowns(map)
  pinFrame(map, u)
  const prob = new BandProblem(map, u, image, fills)
  expect(prob.setup()).toBe(true)
  prob.wKink = 0
  prob.wAnchor = 0
  return prob.energy(u.start, null)
}

/** A scene from regions over a background: its image, its lattice map and the faces' fills. */
function scene(
  width: number,
  height: number,
  regions: Region[],
  fillByLabel: FaceFill[],
): { image: PremultipliedImage; map: PlanarMap; fills: FaceFill[] } {
  const image = render(width, height, regions, rgbaOf(fillByLabel[0]))
  const map = mapOfLabels(labelsOfRegions(width, height, regions))
  return { image, map, fills: fillsByFace(map.faces, fillByLabel) }
}

/** Every point of every edge between two faces of the image (not against the frame). */
function interiorPoints(map: PlanarMap): [number, number][] {
  const out: [number, number][] = []
  for (const e of map.edges) {
    if (e.left === OUTSIDE || e.right === OUTSIDE) continue
    for (let i = 0; i < e.points.length; i += 2) out.push([e.points[i], e.points[i + 1]])
  }
  return out
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length
}

/**
 * A `w × h` image of a vertical boundary at `x = x0`: `left` (the edge's left
 * face, +x walking down) right of it, `right` left of it, each pixel its exact
 * coverage.
 */
function verticalEdgeImage(
  w: number,
  h: number,
  x0: number,
  left: FaceFill,
  right: FaceFill,
): PremultipliedImage {
  const data = new Float32Array(4 * w * h)
  const a = rgbaOf(left)
  const b = rgbaOf(right)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const cov = Math.min(1, Math.max(0, x + 1 - x0))
      for (let k = 0; k < 4; k++) data[4 * (y * w + x) + k] = cov * a[k] + (1 - cov) * b[k]
    }
  }
  return { width: w, height: h, data }
}

/**
 * The boundary measured at `x`: straight down a `w × h` image, one point per
 * row off the gridlines, between two nodes on the top and bottom lines.
 */
function verticalChain(x: number, w: number, h: number): PlanarMap {
  const points = [x, 0]
  for (let y = 0; y < h; y++) points.push(x, y + 0.63)
  points.push(x, h)
  return handMap(
    w,
    h,
    [{ points, left: 0, right: 1, start: 0, end: 1 }],
    [
      [x, 0],
      [x, h],
    ],
  )
}

/**
 * The shape a straight edge's solve converges to: the middle of the chain
 * within 0.025 px of the truth (half the way from far off), every interior
 * point at least a quarter of the way, and the two ends, nodes anchored four
 * times harder, between a twentieth of the way and a twentieth past it.
 */
function expectConverged(xs: number[], start: number, truth: number): void {
  const n = xs.length
  const err0 = Math.abs(truth - start)
  const failures: string[] = []
  for (let i = 0; i < n; i++) {
    const err = Math.abs(xs[i] - truth)
    const frac = (xs[i] - start) / (truth - start)
    const middle = i >= Math.floor(n / 4) && i < Math.floor((3 * n) / 4)
    const ok =
      i === 0 || i === n - 1
        ? frac >= 0.05 && frac <= 1.05
        : err < (middle ? (err0 > 0.5 ? err0 * 0.5 : 0.025) : err0 * 0.75)
    if (!ok) failures.push(`point ${i} at ${xs[i].toFixed(4)}`)
  }
  expect(failures, `truth ${truth}: points at ${xs.map((v) => v.toFixed(4)).join(' ')}`).toEqual([])
}

/** Everything a solve writes, so two runs compare bit for bit. */
function outcome(map: PlanarMap, rep: SolveReport): unknown {
  return {
    points: map.edges.map((e) => Array.from(e.points)),
    nodes: map.nodes.map((v) => [v.x, v.y]),
    rep,
  }
}

describe('solveBoundaries on a mismeasured straight edge', () => {
  it('moves the edge onto its true sub-pixel position', () => {
    const w = 8
    const h = 10
    for (const truth of [3.8, 3.22, 4.35]) {
      const image = verticalEdgeImage(w, h, truth, WHITE, BLACK)
      const map = verticalChain(3.5, w, h)
      const before = map.edges[0].points.slice()
      const rep = solveBoundaries(map, image, [WHITE, BLACK])
      expect(rep.outcome).toBe('solved')
      expect(rep.after).toBeLessThan(rep.before)
      expect(rep.moved).toBe(before.length / 2)
      expect(rep.scale).toBe(1)
      expect(rep.iters).toBeGreaterThanOrEqual(1)
      const pts = map.edges[0].points
      const xs: number[] = []
      const ys: number[] = []
      for (let i = 0; i < pts.length; i += 2) {
        xs.push(pts[i])
        ys.push(pts[i + 1])
        expect(Math.hypot(pts[i] - before[i], pts[i + 1] - before[i + 1])).toBeLessThanOrEqual(
          MAX_TOTAL + 1e-9,
        )
      }
      expectConverged(xs, 3.5, truth)
      // Motion along a straight edge is invisible to the pixels: the points may
      // spread along it, but stay in order, so its shape is the straight line.
      for (let i = 1; i < ys.length; i++) expect(ys[i]).toBeGreaterThan(ys[i - 1])
      // The nodes moved with their edge's ends.
      expect([map.nodes[0].x, map.nodes[0].y]).toEqual([pts[0], pts[1]])
      expect([map.nodes[1].x, map.nodes[1].y]).toEqual([pts[pts.length - 2], pts[pts.length - 1]])
    }
  })

  it('places a boundary between two translucent paints of one color by their opacity', () => {
    // White paint at 0.9 and a white wash at 0.1: only the opacities differ.
    const paint = flat(1, 1, 1, 0.9)
    const wash = flat(1, 1, 1, 0.1)
    const image = verticalEdgeImage(8, 10, 3.85, paint, wash)
    const map = verticalChain(3.5, 8, 10)
    const rep = solveBoundaries(map, image, [paint, wash])
    expect(rep.outcome).toBe('solved')
    const pts = map.edges[0].points
    expectConverged(
      Array.from({ length: pts.length / 2 }, (_, i) => pts[2 * i]),
      3.5,
      3.85,
    )
  })

  it('leaves an edge already in place alone', () => {
    const image = verticalEdgeImage(6, 6, 3.3, WHITE, BLACK)
    const map = verticalChain(3.3, 6, 6)
    const before = map.edges[0].points.slice()
    solveBoundaries(map, image, [WHITE, BLACK])
    const pts = map.edges[0].points
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(pts[i] - before[i], pts[i + 1] - before[i + 1])).toBeLessThan(1e-6)
    }
  })

  it('does nothing on degenerate input', () => {
    const image = verticalEdgeImage(6, 6, 3.3, WHITE, BLACK)
    expect(solveBoundaries(handMap(6, 6, [], []), image, [WHITE, BLACK]).outcome).toBe('degenerate')
    const two = handMap(
      6,
      6,
      [{ points: [1.5, 0, 1.5, 6], left: 0, right: 1, start: 0, end: 1 }],
      [
        [1.5, 0],
        [1.5, 6],
      ],
    )
    const rep = solveBoundaries(two, image, [WHITE, BLACK])
    expect(rep.outcome).toBe('degenerate')
    expect(Array.from(two.edges[0].points)).toEqual([1.5, 0, 1.5, 6])
    // A band over its table budget is not solved, and the map keeps its points.
    const map = verticalChain(3.5, 8, 10)
    const before = Array.from(map.edges[0].points)
    const over = solveBoundaries(map, verticalEdgeImage(8, 10, 3.8, WHITE, BLACK), [WHITE, BLACK], {
      tableBudget: 10,
    })
    expect(over.outcome).toBe('over-budget')
    expect(Array.from(map.edges[0].points)).toEqual(before)
  })
})

describe('the iteration cap', () => {
  const image = verticalEdgeImage(8, 10, 3.8, WHITE, BLACK)

  it('stops the descent early, and a cap at or above what the solve takes changes nothing', () => {
    const full = verticalChain(3.5, 8, 10)
    const rf = solveBoundaries(full, image, [WHITE, BLACK])
    expect(rf.iters).toBeGreaterThan(1)
    // One iteration: one taken, already an improvement, no lower than the full solve.
    const one = verticalChain(3.5, 8, 10)
    const r1 = solveBoundaries(one, image, [WHITE, BLACK], { maxIterations: 1 })
    expect(r1.outcome).toBe('solved')
    expect(r1.iters).toBe(1)
    expect(r1.after).toBeLessThan(r1.before)
    expect(r1.after).toBeGreaterThanOrEqual(rf.after)
    // Zero iterations do nothing at all.
    const zero = verticalChain(3.5, 8, 10)
    const start = Array.from(zero.edges[0].points)
    expect(solveBoundaries(zero, image, [WHITE, BLACK], { maxIterations: 0 }).outcome).toBe(
      'no-gain',
    )
    expect(Array.from(zero.edges[0].points)).toEqual(start)
    for (const cap of [rf.iters, rf.iters + 1, 1000]) {
      const m = verticalChain(3.5, 8, 10)
      const r = solveBoundaries(m, image, [WHITE, BLACK], { maxIterations: cap })
      expect(outcome(m, r), `cap ${cap}`).toEqual(outcome(full, rf))
    }
  })

  it('spends at most the iteration budget over all parts', () => {
    const {
      image: img,
      map,
      fills,
    } = scene(22, 22, [diskRegion(10.3, 9.7, 6.2, rgbaOf(INK))], [PAPER, INK])
    let steps = 0
    const rep = solveBoundaries(map, img, fills, { iterationBudget: 5, onStep: () => steps++ })
    expect(rep.outcome).toBe('solved')
    expect(steps).toBe(5)
    expect(rep.iters).toBeLessThanOrEqual(5)
  })
})

describe('solveBoundaries from the lattice', () => {
  it('converges a disk onto its true circle', () => {
    for (const [cx, cy, r] of [
      [10.3, 9.7, 6.2],
      [12.1, 11.4, 7.6],
    ]) {
      const { image, map, fills } = scene(
        22,
        22,
        [diskRegion(cx, cy, r, rgbaOf(INK))],
        [PAPER, INK],
      )
      const d0 = dataTerm(cloneMap(map), image, fills)
      const rep = solveBoundaries(map, image, fills)
      expect(rep.outcome).toBe('solved')
      // The rendering error all but vanishes.
      expect(dataTerm(map, image, fills) / d0).toBeLessThan(1e-4)
      // A polygon matching a circle's coverage sits a little outside it at its
      // vertices (its chords cut inside); on average within 0.02 px.
      const errs = interiorPoints(map).map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r))
      expect(mean(errs)).toBeLessThan(0.02)
      expect(Math.max(...errs)).toBeLessThan(0.05)
    }
  })

  it('leaves a square with axis edges where it is', () => {
    const square = [4, 3, 11, 3, 11, 9, 4, 9]
    // Colors a float32 image holds exactly: no residual at all, nothing to solve.
    const exact = [flat(0.75, 0.5, 0.25), flat(0.125, 0.25, 0.5)]
    const a = scene(15, 12, [polygonRegion(square, rgbaOf(exact[1]))], exact)
    const before = a.map.edges.map((e) => Array.from(e.points))
    expect(solveBoundaries(a.map, a.image, a.fills).outcome).toBe('no-residual')
    expect(a.map.edges.map((e) => Array.from(e.points))).toEqual(before)
    // Colors rounded in the image: a residual at the rounding level, and no point moves visibly.
    const b = scene(15, 12, [polygonRegion(square, rgbaOf(INK))], [PAPER, INK])
    const start = b.map.edges.map((e) => e.points.slice())
    solveBoundaries(b.map, b.image, b.fills)
    for (let k = 0; k < start.length; k++) {
      const pts = b.map.edges[k].points
      for (let i = 0; i < pts.length; i += 2) {
        expect(Math.hypot(pts[i] - start[k][i], pts[i + 1] - start[k][i + 1])).toBeLessThan(1e-6)
      }
    }
  })

  it('moves a rectangle onto its sub-pixel sides and keeps its corners', () => {
    const rect = [3.3, 3.4, 12.6, 3.4, 12.6, 9.7, 3.3, 9.7]
    const { image, map, fills } = scene(16, 13, [polygonRegion(rect, rgbaOf(INK))], [PAPER, INK])
    const d0 = dataTerm(cloneMap(map), image, fills)
    solveBoundaries(map, image, fills)
    expect(dataTerm(map, image, fills) / d0).toBeLessThan(1e-3)
    const pts = interiorPoints(map)
    const dist = pts.map(([x, y]) => polygonBoundaryDistance(x, y, rect))
    expect(mean(dist)).toBeLessThan(0.01)
    expect(Math.max(...dist)).toBeLessThan(0.04)
    // Each corner keeps a point on it: the absolute kink prior lets a corner stay sharp.
    for (let c = 0; c < 4; c++) {
      const near = Math.min(
        ...pts.map(([x, y]) => Math.hypot(x - rect[2 * c], y - rect[2 * c + 1])),
      )
      expect(near).toBeLessThan(0.08)
    }
  })

  it('solves two faces and the background, moving their shared nodes', () => {
    const a = [3.3, 3.4, 8.6, 3.4, 8.6, 12.7, 3.3, 12.7]
    const b = [8.6, 3.4, 15.2, 3.4, 15.2, 12.7, 8.6, 12.7]
    const { image, map, fills } = scene(
      20,
      16,
      [polygonRegion(a, rgbaOf(INK)), polygonRegion(b, rgbaOf(RED))],
      [PAPER, INK, RED],
    )
    expect(map.nodes.length).toBe(2)
    const d0 = dataTerm(cloneMap(map), image, fills)
    const rep = solveBoundaries(map, image, fills)
    expect(rep.outcome).toBe('solved')
    expect(dataTerm(map, image, fills) / d0).toBeLessThan(1e-3)
    const dist = interiorPoints(map).map(([x, y]) =>
      Math.min(polygonBoundaryDistance(x, y, a), polygonBoundaryDistance(x, y, b)),
    )
    expect(mean(dist)).toBeLessThan(0.01)
    expect(Math.max(...dist)).toBeLessThan(0.05)
    // The two T junctions where both faces meet the background.
    const truth = [
      [8.6, 3.4],
      [8.6, 12.7],
    ]
    for (const v of map.nodes) {
      const d = Math.min(...truth.map(([x, y]) => Math.hypot(v.x - x, v.y - y)))
      expect(d).toBeLessThan(0.06)
    }
    // Every edge ending at a node reads the node's position.
    for (const e of map.edges) {
      if (e.closed) continue
      const n = e.points.length
      expect([e.points[0], e.points[1]]).toEqual([map.nodes[e.start].x, map.nodes[e.start].y])
      expect([e.points[n - 2], e.points[n - 1]]).toEqual([map.nodes[e.end].x, map.nodes[e.end].y])
    }
  })

  it('moves a junction of three faces onto the point where they meet', () => {
    const j = [6.3, 5.7]
    const p1 = [6.3, 5.7, 6.3, -1, -1, -1, -1, 9.57]
    const p2 = [6.3, 5.7, 17, 11.88, 17, -1, 6.3, -1]
    const { image, map, fills } = scene(
      16,
      14,
      [polygonRegion(p1, rgbaOf(INK)), polygonRegion(p2, rgbaOf(RED))],
      [PAPER, INK, RED],
    )
    const inner = map.nodes.filter((v) => v.x > 0 && v.x < 16 && v.y > 0 && v.y < 14)
    expect(inner.length).toBe(1)
    const start = Math.hypot(inner[0].x - j[0], inner[0].y - j[1])
    expect(start).toBeGreaterThan(0.3)
    solveBoundaries(map, image, fills)
    expect(Math.hypot(inner[0].x - j[0], inner[0].y - j[1])).toBeLessThan(0.03)
  })

  it('slides a boundary meeting the frame along the frame', () => {
    // A slanted boundary from (3.8, 0) to (4.6, 10): its nodes stay on the frame.
    const poly = [0, 0, 3.8, 0, 4.6, 10, 0, 10]
    const { image, map, fills } = scene(12, 10, [polygonRegion(poly, rgbaOf(INK))], [PAPER, INK])
    const frameNodes = map.nodes.filter((v) => v.y === 0 || v.y === 10)
    expect(frameNodes.length).toBe(2)
    solveBoundaries(map, image, fills)
    for (const v of frameNodes) {
      expect(v.y === 0 || v.y === 10).toBe(true)
      expect(Math.abs(v.x - (v.y === 0 ? 3.8 : 4.6))).toBeLessThan(0.05)
    }
    const dist = interiorPoints(map).map(([x, y]) => segmentDistance(x, y, 3.8, 0, 4.6, 10))
    expect(mean(dist)).toBeLessThan(0.02)
  })

  it('reads a gradient fill at each pixel centre', () => {
    const ramp: FaceFill = {
      r: 0.5,
      g: 0.4,
      b: 0.5,
      a: 1,
      at: (x, y, out) => {
        const t = Math.min(1, Math.max(0, ((x - 2.5) * 13 + (y - 3.5) * 6) / (13 * 13 + 6 * 6)))
        out[0] = 0.9 + (0.2 - 0.9) * t
        out[1] = 0.2 + (0.6 - 0.2) * t
        out[2] = 0.1 + (0.9 - 0.1) * t
        out[3] = 1
      },
    }
    const color = (x: number, y: number): [number, number, number, number] => {
      const o = new Float64Array(4)
      ramp.at!(x, y, o)
      return [o[0], o[1], o[2], o[3]]
    }
    const [cx, cy, r] = [8.9, 7.7, 4.6]
    const { image, map, fills } = scene(18, 14, [diskRegion(cx, cy, r, color)], [PAPER, ramp])
    const d0 = dataTerm(cloneMap(map), image, fills)
    solveBoundaries(map, image, fills)
    expect(dataTerm(map, image, fills) / d0).toBeLessThan(1e-3)
    const errs = interiorPoints(map).map(([x, y]) => Math.abs(Math.hypot(x - cx, y - cy) - r))
    expect(mean(errs)).toBeLessThan(0.03)
  })
})

describe('thin lines', () => {
  it('keeps the width of a 1.2 px line', () => {
    // Its pixel rows make a lattice band two pixels wide; the solve narrows it to the line.
    const [y0, y1] = [5.35, 6.55]
    const { image, map, fills } = scene(
      20,
      12,
      [polygonRegion([2.2, y0, 17.7, y0, 17.7, y1, 2.2, y1], rgbaOf(INK))],
      [PAPER, INK],
    )
    solveBoundaries(map, image, fills)
    const pts = interiorPoints(map).filter(([x]) => x > 4 && x < 16)
    const top = pts.filter(([, y]) => y < 6).map(([, y]) => y)
    const bottom = pts.filter(([, y]) => y > 6).map(([, y]) => y)
    expect(top.length).toBeGreaterThan(8)
    expect(bottom.length).toBeGreaterThan(8)
    for (const y of top) expect(Math.abs(y - y0)).toBeLessThan(0.01)
    for (const y of bottom) expect(Math.abs(y - y1)).toBeLessThan(0.01)
    expect(mean(bottom) - mean(top)).toBeCloseTo(1.2, 2)
  })

  it('keeps the width of a slanted 1.2 px line', () => {
    for (const degrees of [8, 45]) {
      const a = (degrees * Math.PI) / 180
      const [ux, uy] = [Math.cos(a), Math.sin(a)]
      const [nx, ny] = [-uy, ux]
      const [ax, ay, len, wid] = [2.3, 4.1, 20, 1.2]
      const line = [
        ax,
        ay,
        ax + len * ux,
        ay + len * uy,
        ax + len * ux + wid * nx,
        ay + len * uy + wid * ny,
        ax + wid * nx,
        ay + wid * ny,
      ]
      const { image, map, fills } = scene(26, 22, [polygonRegion(line, rgbaOf(INK))], [PAPER, INK])
      // One island: the line's pixels are 4-connected.
      expect(map.faces.count).toBe(2)
      solveBoundaries(map, image, fills)
      const sides: [number, number][] = []
      for (const [x, y] of interiorPoints(map)) {
        const s = (x - ax) * ux + (y - ay) * uy
        if (s < 3 || s > len - 3) continue
        const t = (x - ax) * nx + (y - ay) * ny
        sides.push([t, Math.min(Math.abs(t), Math.abs(t - wid))])
      }
      const near = sides.map(([, d]) => d)
      expect(mean(near), `${degrees}°`).toBeLessThan(0.01)
      expect(Math.max(...near), `${degrees}°`).toBeLessThan(0.05)
      // Both sides keep their own place: the width between them is the line's.
      const lo = mean(sides.filter(([t]) => t < wid / 2).map(([t]) => t))
      const hi = mean(sides.filter(([t]) => t >= wid / 2).map(([t]) => t))
      expect(hi - lo, `${degrees}°`).toBeCloseTo(wid, 1)
    }
  })
})

describe('the fold guard in a solve', () => {
  it('lets no self-crossing the solve made survive', () => {
    // A dark sliver in the map where the image shows a halo lighter than the
    // ground in its middle: the solve pulls the middle's two sides through each
    // other while its ends stay, so they cross until the guard backs them off.
    const w = 16
    const h = 10
    const map = mapOfLabels(labelsFrom(w, h, (x, y) => (y === 5 && x >= 3 && x <= 12 ? 1 : 0)))
    const data = new Float32Array(4 * w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = y === 5 && x >= 6 && x <= 9 ? 0.8 : y === 5 && x >= 3 && x <= 12 ? 0 : 0.5
        data.set([v, v, v, 1], 4 * (y * w + x))
      }
    }
    const image: PremultipliedImage = { width: w, height: h, data }
    const fills = fillsByFace(map.faces, [flat(0.5, 0.5, 0.5), BLACK])
    const start = cloneMap(map)
    const rep = solveBoundaries(map, image, fills)
    expect(rep.outcome).toBe('solved')
    expect(rep.scale).toBeLessThan(1)
    expect(rep.scale).toBeGreaterThan(0)
    const u0 = buildUnknowns(start)
    const u1 = buildUnknowns(map)
    expect(
      new FoldCounter(start, u0, u0.start, u1.start).newCrossings(u0.start, u1.start).length,
    ).toBe(0)
  })
})

describe('solveBoundaries as a whole', () => {
  it('is deterministic', () => {
    const run = (): unknown => {
      const { image, map, fills } = scene(
        22,
        22,
        [diskRegion(10.3, 9.7, 6.2, rgbaOf(INK))],
        [PAPER, INK],
      )
      return outcome(map, solveBoundaries(map, image, fills))
    }
    expect(run()).toEqual(run())
  })

  it('never lets the energy rise', () => {
    const a = [3.3, 3.4, 8.6, 3.4, 8.6, 12.7, 3.3, 12.7]
    const b = [8.6, 3.4, 15.2, 3.4, 15.2, 12.7, 8.6, 12.7]
    const { image, map, fills } = scene(
      20,
      16,
      [polygonRegion(a, rgbaOf(INK)), polygonRegion(b, rgbaOf(RED))],
      [PAPER, INK, RED],
    )
    const steps: LbfgsStep[] = []
    const d0 = dataTerm(cloneMap(map), image, fills)
    const rep = solveBoundaries(map, image, fills, { onStep: (s) => steps.push(s) })
    expect(rep.after).toBeLessThan(rep.before)
    expect(steps.length).toBeGreaterThan(10)
    for (let k = 1; k < steps.length; k++) {
      if (steps[k].part !== steps[k - 1].part) continue
      expect(steps[k].energy).toBeLessThan(steps[k - 1].energy)
    }
    expect(dataTerm(map, image, fills)).toBeLessThan(d0)
  })
})
