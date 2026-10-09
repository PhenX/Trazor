import { describe, expect, it } from 'vitest'
import {
  endTangent,
  fitEndPolynomial,
  JUNCTION_MAX_MOVE,
  refineJunctions,
  solveJunction,
  taperFit,
} from '../../src/planar/junctions'
import type { TangentLine } from '../../src/planar/junctions'
import { refineSubpixel } from '../../src/planar/subpixel'
import { OUTSIDE } from '../../src/planar/types'
import type { PlanarEdge, PlanarMap } from '../../src/planar/types'
import {
  polygonCoverage,
  sceneImage,
  sceneMap,
  sectorsScene,
  type Rgba,
  type Scene,
} from './coverage-helpers'
import { INKVEC, SCENES } from './parity-scenes'

const RED: Rgba = [0.85, 0.15, 0.15, 1]
const GREEN: Rgba = [0.15, 0.75, 0.2, 1]
const BLUE: Rgba = [0.15, 0.25, 0.9, 1]
const YELLOW: Rgba = [0.9, 0.85, 0.1, 1]

/** A scene's map through the sub-pixel and junction stages; each node's lattice position kept. */
function traced(s: Scene, sigmaNoise = 0.002) {
  const { map, fills } = sceneMap(s)
  const lattice = map.nodes.map((n) => [n.x, n.y] as const)
  refineSubpixel(map, sceneImage(s), fills, { sigmaNoise })
  refineJunctions(map)
  return { map, lattice }
}

/** The node whose lattice position is nearest `(x, y)`. */
function nearestNode(lattice: readonly (readonly [number, number])[], x: number, y: number) {
  let best = -1
  let bd = Infinity
  lattice.forEach(([nx, ny], i) => {
    const d = Math.hypot(nx - x, ny - y)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return { index: best, gridError: bd }
}

/** Every open edge's ends sit exactly on their nodes. */
function expectNodesShared(map: PlanarMap): void {
  for (const e of map.edges) {
    if (e.closed) continue
    const n = e.points.length
    expect(e.points[0]).toBe(map.nodes[e.start].x)
    expect(e.points[1]).toBe(map.nodes[e.start].y)
    expect(e.points[n - 2]).toBe(map.nodes[e.end].x)
    expect(e.points[n - 1]).toBe(map.nodes[e.end].y)
  }
}

/** A map drawn by hand: nodes and open edges through given points, σ 0.05 inside. */
function handMap(
  w: number,
  h: number,
  nodes: [number, number][],
  edges: { pts: [number, number][]; left: number; right: number; start: number; end: number }[],
): PlanarMap {
  const built: PlanarEdge[] = edges.map(({ pts, left, right, start, end }) => {
    const fixed = new Uint8Array(pts.length)
    fixed[0] = 1
    fixed[pts.length - 1] = 1
    return {
      points: Float64Array.from(pts.flat()),
      sigma: new Float64Array(pts.length).fill(0.05),
      fixed,
      left,
      right,
      start,
      end,
      closed: false,
    }
  })
  return {
    width: w,
    height: h,
    faces: {
      width: w,
      height: h,
      ids: new Int32Array(w * h),
      count: 3,
      label: Int32Array.from([0, 1, 2]),
      area: new Uint32Array(3),
    },
    edges: built,
    nodes: nodes.map(([x, y]) => ({ x, y, ends: [] })),
  }
}

describe('fitEndPolynomial', () => {
  it('recovers a line and the tangent of a parabola', () => {
    const ts = Array.from({ length: 8 }, (_, k) => k + 1)
    const ws = new Array(8).fill(100)
    const line = fitEndPolynomial(
      ts,
      ts.map((t) => 0.3 + 0.2 * t),
      ws,
      8,
    )
    expect(line?.[0]).toBeCloseTo(0.3, 9)
    expect(line?.[1]).toBeCloseTo(0.2, 9)
    const parabola = fitEndPolynomial(
      ts,
      ts.map((t) => 0.3 + 0.2 * t - 0.05 * t * t),
      ws,
      8,
    )
    expect(parabola?.[0]).toBeCloseTo(0.3, 6)
    expect(parabola?.[1]).toBeCloseTo(0.2, 6)
  })

  it('widens the variance by a scatter larger than the stated sigma, never narrows it', () => {
    const ts = [1, 2, 3, 4]
    const exact = fitEndPolynomial(ts, [0, 0, 0, 0], [1, 1, 1, 1], 6)
    const noisy = fitEndPolynomial(ts, [2, -2, 2, -2], [1, 1, 1, 1], 6)
    const calm = fitEndPolynomial(ts, [0.1, -0.1, 0.1, -0.1], [1, 1, 1, 1], 6)
    expect(noisy![2]).toBeGreaterThan(exact![2])
    expect(calm![2]).toBe(exact![2])
  })
})

describe('solveJunction', () => {
  const line = (nx: number, ny: number, c: number, variance = 0.01): TangentLine => ({
    nx,
    ny,
    c,
    variance,
  })

  it('intersects crossing lines by weighted least squares', () => {
    const p = solveJunction([line(1, 0, 10.3), line(0, 1, 7.6)], 10, 8)
    expect(p?.x).toBeCloseTo(10.3, 12)
    expect(p?.y).toBeCloseTo(7.6, 12)
    expect(p?.sigma).toBeCloseTo(0.1, 12)
  })

  it('refuses too few lines, near-parallel lines and a far move', () => {
    expect(solveJunction([line(1, 0, 10)], 10, 8)).toBeNull()
    const a = (5 * Math.PI) / 180
    expect(solveJunction([line(0, 1, 8), line(Math.sin(a), Math.cos(a), 8)], 10, 8)).toBeNull()
    expect(
      solveJunction([line(1, 0, 10 + JUNCTION_MAX_MOVE + 0.1), line(0, 1, 8)], 10, 8),
    ).toBeNull()
  })
})

describe('taperFit', () => {
  /** The gap at `u` from the tangent point between a line and a circle of radius `r`. */
  const gap = (r: number, u: number): number =>
    Math.abs(u) >= r ? r : r - Math.sqrt(r * r - u * u)
  const samples = (pairs: [number, number][]): Float64Array => Float64Array.from(pairs.flat())

  it('finds the tangent point of a circle on a line', () => {
    const t = taperFit(samples(Array.from({ length: 14 }, (_, x) => [x, gap(14.22, 13.72 - x)])))
    expect(t).not.toBeNull()
    expect(Math.abs(t!.vanish - 13.72)).toBeLessThan(0.3)
    expect(t!.sigma).toBeLessThan(0.5)
  })

  it('survives measurement noise', () => {
    const noise = (i: number): number => {
      const v = Math.sin(i * 12.9898) * 43758.5453
      return 0.04 * (v - Math.trunc(v) - 0.5)
    }
    const t = taperFit(
      samples(
        Array.from({ length: 14 }, (_, x) => [x, Math.max(gap(14.22, 13.72 - x) + noise(x), 0)]),
      ),
    )
    expect(t).not.toBeNull()
    expect(Math.abs(t!.vanish - 13.72)).toBeLessThan(0.5)
  })

  it('does not care which way the samples run', () => {
    const fwd: [number, number][] = Array.from({ length: 10 }, (_, k) => [10 + k, gap(10, 10 - k)])
    const a = taperFit(samples(fwd))
    const b = taperFit(samples(fwd.toReversed()))
    expect(Math.abs(a!.vanish - b!.vanish)).toBeLessThan(1e-9)
  })

  it('refuses a strip of constant width', () => {
    expect(taperFit(samples(Array.from({ length: 12 }, (_, x) => [x, 2])))).toBeNull()
  })

  it('does not mistake a transversal wedge for a tangency', () => {
    const t = taperFit(
      samples(Array.from({ length: 12 }, (_, x) => [x, Math.max(0.5 * (12 - x), 0)])),
    )
    expect(t === null || t.tangencyDefect > 1).toBe(true)
  })

  it('recovers a real tangent point the planar map missed', () => {
    // Transparent thickness per column along the top edge of a rounded box (radius 4 at
    // 36 units in 128 px): the tangent point is at 13.72, the lattice junction at 10.5.
    const measured: [number, number][] = [
      [0, 10.929],
      [1, 8.0],
      [2, 6.188],
      [3, 4.937],
      [4, 3.875],
      [5, 3.063],
      [6, 2.251],
      [7, 1.749],
      [8, 1.251],
      [9, 0.875],
      [10, 0.565],
      [11, 0.251],
      [12, 0.251],
    ]
    const t = taperFit(samples(measured))
    expect(t).not.toBeNull()
    expect(Math.abs(t!.vanish - 13.72)).toBeLessThan(0.6)
    expect(Math.abs(t!.vanish - 10.5)).toBeGreaterThan(1.5)
    expect(Math.abs(t!.impliedRadius - 14.22)).toBeLessThan(5)
  })

  it('refuses too few usable samples', () => {
    expect(taperFit([0, 1, 1, 0.5])).toBeNull()
  })
})

describe('endTangent', () => {
  it('reads an edge against the frame as its exact first segment', () => {
    const map = handMap(
      10,
      10,
      [
        [4, 0],
        [7, 0],
      ],
      [
        {
          pts: [
            [4, 0],
            [5, 0],
            [6, 0],
            [7, 0],
          ],
          left: OUTSIDE,
          right: 0,
          start: 0,
          end: 1,
        },
      ],
    )
    const t = endTangent(map.edges[0], true, 4, 0)
    expect(t).toEqual({ nx: -0, ny: 1, c: 0, variance: 1e-6 })
  })
})

describe('refineJunctions', () => {
  it("reproduces inkvec's junctions", () => {
    const { scene, sigmaNoise } = SCENES.junction
    const { map } = traced(scene, sigmaNoise)
    const want = INKVEC.junction
    let i = 0
    for (const e of map.edges) {
      const n = e.points.length >> 1
      for (const k of [0, n - 1]) {
        expect(Math.abs(e.points[2 * k] - want[i])).toBeLessThan(2e-6)
        expect(Math.abs(e.points[2 * k + 1] - want[i + 1])).toBeLessThan(2e-6)
        expect(Math.abs(e.sigma[k] - want[i + 2])).toBeLessThan(2e-6)
        i += 3
      }
    }
    expect(i).toBe(want.length)
  })

  it('recovers a three-color junction below the pixel grid', () => {
    const truth = [31.3, 30.7] as const
    const { map, lattice } = traced(
      sectorsScene(...truth, [0, 1.9, 4.1], [GREEN, BLUE, RED], 64, 64),
    )
    const { index, gridError } = nearestNode(lattice, ...truth)
    expect(map.nodes[index].ends.length).toBe(3)
    expect(gridError).toBeGreaterThan(0.2)
    const node = map.nodes[index]
    expect(Math.hypot(node.x - truth[0], node.y - truth[1])).toBeLessThan(0.15)
    expectNodesShared(map)
  })

  it('holds across sub-pixel phases of the junction', () => {
    for (const [dx, dy] of [
      [0.1, 0.9],
      [0.5, 0.5],
      [0.75, 0.2],
      [0.95, 0.6],
    ]) {
      const tx = 30 + dx
      const ty = 33 + dy
      const { map, lattice } = traced(
        sectorsScene(tx, ty, [0.4, 2.5, 4.6], [GREEN, BLUE, RED], 64, 64),
      )
      const node = map.nodes[nearestNode(lattice, tx, ty).index]
      expect(Math.hypot(node.x - tx, node.y - ty)).toBeLessThan(0.15)
      expectNodesShared(map)
    }
  })

  it('keeps a T-junction on its straight through edge', () => {
    const truth = [31.3, 30.6] as const
    const { map, lattice } = traced(
      sectorsScene(...truth, [0, Math.PI / 2, Math.PI], [BLUE, GREEN, RED], 64, 64),
    )
    const node = map.nodes[nearestNode(lattice, ...truth).index]
    expect(Math.hypot(node.x - truth[0], node.y - truth[1])).toBeLessThan(0.15)
    expect(Math.abs(node.y - truth[1])).toBeLessThan(0.1)
    expectNodesShared(map)
  })

  it('places a tilted T-junction closer than its lattice corner', () => {
    const truth = [30.4, 31.8] as const
    const { map, lattice } = traced(
      sectorsScene(...truth, [0.2, 0.2 + Math.PI / 2, 0.2 + Math.PI], [BLUE, GREEN, RED], 64, 64),
    )
    const { index, gridError } = nearestNode(lattice, ...truth)
    const node = map.nodes[index]
    const err = Math.hypot(node.x - truth[0], node.y - truth[1])
    expect(err).toBeLessThan(0.2)
    expect(err).toBeLessThan(gridError / 2)
    expectNodesShared(map)
  })

  it('keeps a four-way junction one node', () => {
    const truth = [31.35, 30.65] as const
    const { map, lattice } = traced(
      sectorsScene(
        ...truth,
        [0, Math.PI / 2, Math.PI, 1.5 * Math.PI],
        [YELLOW, BLUE, GREEN, RED],
        64,
        64,
      ),
    )
    const node = map.nodes[nearestNode(lattice, ...truth).index]
    expect(node.ends.length).toBe(4)
    expect(Math.hypot(node.x - truth[0], node.y - truth[1])).toBeLessThan(0.15)
    expectNodesShared(map)
  })

  it('keeps every node shared, near its corner, and frame nodes on the frame', () => {
    // Cells of four colors over the whole image, many meeting the frame.
    const w = 64
    const coverage = [0, 1, 2, 3].map(() => new Float64Array(w * w))
    for (let i = -1; i < 5; i++) {
      for (let j = -1; j < 6; j++) {
        const x0 = 17.7 * i - 2.8
        const y0 = 15.3 * j + 2.6
        const cell = polygonCoverage(
          [x0, y0, x0 + 17.7, y0, x0 + 17.7, y0 + 15.3, x0, y0 + 15.3],
          w,
          w,
        )
        const c = coverage[(((i * 3 + j * 5) % 4) + 4) % 4]
        for (let p = 0; p < c.length; p++) c[p] += cell[p]
      }
    }
    const { map, lattice } = traced({
      width: w,
      height: w,
      coverage,
      colors: [RED, GREEN, BLUE, YELLOW],
    })
    expect(map.edges.length).toBeGreaterThan(10)
    expectNodesShared(map)
    const frameGot: number[] = []
    const frameWant: number[] = []
    map.nodes.forEach((node, v) => {
      const [lx, ly] = lattice[v]
      expect(Math.hypot(node.x - lx, node.y - ly)).toBeLessThanOrEqual(JUNCTION_MAX_MOVE)
      if (lx === 0 || lx === w) frameGot.push(node.x)
      if (lx === 0 || lx === w) frameWant.push(lx)
      if (ly === 0 || ly === w) frameGot.push(node.y)
      if (ly === 0 || ly === w) frameWant.push(ly)
      expect(node.x).toBeGreaterThanOrEqual(0)
      expect(node.y).toBeGreaterThanOrEqual(0)
      expect(node.x).toBeLessThanOrEqual(w)
      expect(node.y).toBeLessThanOrEqual(w)
    })
    expect(frameGot.length).toBeGreaterThan(4)
    expect(frameGot).toEqual(frameWant)
  })

  it('places a tangential junction where the taper vanishes, trimming passed points', () => {
    // A boundary along y = 20 and a branch leaving the node at (20, 20) along it, then
    // curving away on a circle of radius 8 tangent to the line at x = 23.
    const along = (from: number, to: number): [number, number][] => {
      const out: [number, number][] = []
      for (let x = from; from < to ? x <= to : x >= to; x += from < to ? 1 : -1) out.push([x, 20])
      return out
    }
    const branch: [number, number][] = along(20, 23)
    for (let x = 24; x <= 30; x++) branch.push([x, 20 + 8 - Math.sqrt(64 - (x - 23) ** 2)])
    const map = handMap(
      40,
      40,
      [
        [20, 20],
        [6, 20],
        [34, 20],
        [30, branch[branch.length - 1][1]],
      ],
      [
        { pts: along(20, 6), left: 0, right: 1, start: 0, end: 1 },
        { pts: along(20, 34), left: 2, right: 0, start: 0, end: 2 },
        { pts: branch, left: 1, right: 2, start: 0, end: 3 },
      ],
    )
    refineJunctions(map)
    const node = map.nodes[0]
    expect(Math.abs(node.x - 23)).toBeLessThan(0.3)
    expect(node.y).toBe(20)
    expectNodesShared(map)
    // The edges leaving towards +x no longer double back behind the node.
    for (const k of [1, 2]) {
      const e = map.edges[k]
      for (let i = 1; i < e.points.length >> 1; i++) expect(e.points[2 * i]).toBeGreaterThan(node.x)
    }
    // The edge leaving towards −x keeps every point.
    expect(map.edges[0].points.length).toBe(30)
  })

  it('leaves a node no estimator trusts where it is, at sigma ½', () => {
    // Two collinear edges and nothing else: no crossing, no taper.
    const map = handMap(
      20,
      20,
      [
        [10, 10],
        [2, 10],
        [18, 10],
      ],
      [
        {
          pts: Array.from({ length: 9 }, (_, k): [number, number] => [10 - k, 10]),
          left: 0,
          right: 1,
          start: 0,
          end: 1,
        },
        {
          pts: Array.from({ length: 9 }, (_, k): [number, number] => [10 + k, 10]),
          left: 1,
          right: 0,
          start: 0,
          end: 2,
        },
      ],
    )
    refineJunctions(map)
    expect(map.nodes[0]).toMatchObject({ x: 10, y: 10 })
    expect(map.edges[0].sigma[0]).toBe(0.5)
    expect(map.edges[1].sigma[0]).toBe(0.5)
  })
})
