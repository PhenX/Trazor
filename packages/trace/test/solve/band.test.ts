import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import { OUTSIDE } from '../../src/planar/types'
import type { FaceFill, PlanarMap, PremultipliedImage } from '../../src/planar/types'
import {
  BandProblem,
  GridCrossings,
  JUNCTION_ANCHOR,
  KINK_EPS,
  TABLE_BUDGET_FLOOR,
  buildUnknowns,
  cellOf,
  gridCrossings,
  pinFrame,
  tableBudget,
  tableEntries,
} from '../../src/solve/band'
import type { Unknowns } from '../../src/solve/band'
import { PIN_X, PIN_Y } from '../../src/solve/lbfgs'
import { fillsByFace, flat, handMap, labelsFrom, mapOfLabels } from './solve-helpers'

/** The unknowns of `map`, frame pinned, and a problem over it with the band set up. */
function problemOf(
  map: PlanarMap,
  image: PremultipliedImage,
  fills: readonly FaceFill[],
): { u: Unknowns; prob: BandProblem } {
  const u = buildUnknowns(map)
  pinFrame(map, u)
  const prob = new BandProblem(map, u, image, fills)
  expect(prob.setup()).toBe(true)
  prob.wKink = 0
  prob.wAnchor = 0
  return { u, prob }
}

/** An image of one color per pixel, `[r, g, b, a]`. */
function imageOf(
  width: number,
  height: number,
  px: (x: number, y: number) => number[],
): PremultipliedImage {
  const data = new Float32Array(4 * width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data.set(px(x, y), 4 * (y * width + x))
  }
  return { width, height, data }
}

/** A linear gradient fill from `c0` at `p0` to `c1` at `p1` (premultiplied, padded). */
function linear(p0: [number, number], p1: [number, number], c0: number[], c1: number[]): FaceFill {
  const at = (x: number, y: number, out: Float64Array): void => {
    const dx = p1[0] - p0[0]
    const dy = p1[1] - p0[1]
    const t = Math.min(1, Math.max(0, ((x - p0[0]) * dx + (y - p0[1]) * dy) / (dx * dx + dy * dy)))
    for (let k = 0; k < 4; k++) out[k] = c0[k] + (c1[k] - c0[k]) * t
  }
  return {
    r: 0.5 * (c0[0] + c1[0]),
    g: 0.5 * (c0[1] + c1[1]),
    b: 0.5 * (c0[2] + c1[2]),
    a: 0.5 * (c0[3] + c1[3]),
    at,
  }
}

/**
 * Three faces: a disk of label 1 and a bar of label 2 on label 0, one a
 * translucent gradient, with every interior point and node moved off the
 * lattice, over a random image.
 */
function threeFaces(rnd: () => number): {
  map: PlanarMap
  image: PremultipliedImage
  fills: FaceFill[]
} {
  const w = 10
  const h = 9
  const labels = labelsFrom(w, h, (x, y) => ((x - 4) ** 2 + (y - 4) ** 2 < 7 ? 1 : x >= 7 ? 2 : 0))
  const map = mapOfLabels(labels)
  const onFrame = (x: number, y: number): boolean => x === 0 || y === 0 || x === w || y === h
  for (const e of map.edges) {
    if (e.left === OUTSIDE || e.right === OUTSIDE) continue
    const n = e.points.length / 2
    for (let i = e.closed ? 0 : 1; i < (e.closed ? n : n - 1); i++) {
      e.points[2 * i] += (rnd() - 0.5) * 0.6
      e.points[2 * i + 1] += (rnd() - 0.5) * 0.6
    }
  }
  for (const v of map.nodes) {
    if (onFrame(v.x, v.y)) continue
    v.x += (rnd() - 0.5) * 0.6
    v.y += (rnd() - 0.5) * 0.6
  }
  const image = imageOf(w, h, () => [rnd(), rnd(), rnd(), rnd()])
  const byLabel = [
    flat(0.9, 0.8, 0.1),
    linear([2.5, 2.5], [6.5, 6.5], [0.1, 0.2, 0.9, 1], [0.36, 0.06, 0.18, 0.6]),
    flat(0.2, 0.7, 0.4, 0.8),
  ]
  return { map, image, fills: fillsByFace(map.faces, byLabel) }
}

/** `start` moved by up to `±spread/2` per coordinate, pinned coordinates kept. */
function jitter(u: Unknowns, rnd: () => number, spread: number): Float64Array {
  const pos = u.start.slice()
  for (let v = 0; v < u.count; v++) {
    if (!(u.pin[v] & PIN_X)) pos[2 * v] += (rnd() - 0.5) * spread
    if (!(u.pin[v] & PIN_Y)) pos[2 * v + 1] += (rnd() - 0.5) * spread
  }
  return pos
}

/** Central differences of the energy against its analytic gradient; returns the count of sizable entries. */
function checkGradient(prob: BandProblem, u: Unknowns, pos: Float64Array, tol: number): number {
  const grad = new Float64Array(pos.length)
  prob.energy(pos, grad)
  const d = 1e-6
  let sizable = 0
  const failures: string[] = []
  for (let v = 0; v < u.count; v++) {
    for (let axis = 0; axis < 2; axis++) {
      const ana = grad[2 * v + axis]
      if (u.pin[v] & (axis === 0 ? PIN_X : PIN_Y)) {
        if (ana !== 0) failures.push(`pinned unknown ${v} axis ${axis}: ${ana}`)
        continue
      }
      const plus = pos.slice()
      const minus = pos.slice()
      plus[2 * v + axis] += d
      minus[2 * v + axis] -= d
      const num = (prob.energy(plus, null) - prob.energy(minus, null)) / (2 * d)
      if (!(Math.abs(num - ana) < tol * (1 + Math.abs(ana)))) {
        failures.push(`unknown ${v} axis ${axis}: analytic ${ana}, numeric ${num}`)
      }
      if (Math.abs(ana) > 1e-3) sizable++
    }
  }
  expect(failures).toEqual([])
  return sizable
}

describe('gridCrossings', () => {
  it('lists the gridlines a segment crosses in parameter order, vertical first on a tie', () => {
    const out = new GridCrossings()
    // From (0.7, 0.8) to (3.3, 2.4): x = 1, 2, 3 and y = 1, 2.
    expect(gridCrossings(0.7, 0.8, 3.3, 2.4, out)).toBe(5)
    const want = [
      [0.3 / 2.6, 1, 1],
      [0.2 / 1.6, 2, 1],
      [1.3 / 2.6, 1, 2],
      [1.2 / 1.6, 2, 2],
      [2.3 / 2.6, 1, 3],
    ].sort((a, b) => a[0] - b[0])
    for (let k = 0; k < 5; k++) {
      expect(out.t[k]).toBeCloseTo(want[k][0], 12)
      expect(out.kind[k]).toBe(want[k][1])
      expect(out.line[k]).toBe(want[k][2])
    }
    // Walking the other way reverses the order.
    gridCrossings(3.3, 2.4, 0.7, 0.8, out)
    expect(out.t[0]).toBeCloseTo(1 - 2.3 / 2.6, 12)
    expect(out.line[0]).toBe(3)
    // Inside one pixel: none; an end exactly on a gridline is a vertex, not a crossing.
    expect(gridCrossings(0.6, 0.6, 0.9, 0.8, out)).toBe(0)
    expect(gridCrossings(1, 0.6, 1.7, 0.6, out)).toBe(0)
    // A lattice corner: both gridlines at one parameter, the vertical one first.
    expect(gridCrossings(0.5, 0.5, 1.5, 1.5, out)).toBe(2)
    expect(out.t[0]).toBe(out.t[1])
    expect([out.kind[0], out.kind[1]]).toEqual([1, 2])
  })

  it('keeps both axes of a long segment', () => {
    // 20 vertical and 30 horizontal gridlines, the horizontal axis the longer.
    const out = new GridCrossings()
    expect(gridCrossings(0.55, 0.45, 20.35, 30.65, out)).toBe(50)
    for (let k = 1; k < 50; k++) expect(out.t[k]).toBeGreaterThan(out.t[k - 1])
    let vertical = 0
    for (let k = 0; k < 50; k++) {
      const t = out.t[k]
      const at = out.kind[k] === 1 ? 0.55 + 19.8 * t : 0.45 + 30.2 * t
      expect(at).toBeCloseTo(out.line[k], 9)
      if (out.kind[k] === 1) vertical++
    }
    expect(vertical).toBe(20)
  })

  it('crosses every gridline it spans and ends on non-finite or huge coordinates', () => {
    const out = new GridCrossings()
    expect(gridCrossings(0.7, 0.7, 4.2, 0.7, out)).toBe(4)
    for (let k = 0; k < 4; k++) expect(0.7 + 3.5 * out.t[k]).toBeCloseTo(k + 1, 9)
    const cases = [
      [0, 0, Infinity, 1],
      [-Infinity, 0, 0, 0],
      [0, Number.NaN, 2, Infinity],
      [1e20, 0, 1e20 + 1e5, 0],
      [-1e300, 3, 1e300, 3],
      [0, 0, 1e12, 1e12],
    ]
    for (const [ax, ay, bx, by] of cases) {
      const n = gridCrossings(ax, ay, bx, by, out)
      for (let k = 0; k < n; k++) expect(Number.isFinite(out.t[k])).toBe(true)
    }
  })
})

describe('cellOf', () => {
  it('files a point on a gridline into the pixel after it, except at the left and top frame', () => {
    expect(cellOf(0.3)).toBe(0)
    expect(cellOf(1)).toBe(1)
    expect(cellOf(2.999)).toBe(2)
    expect(cellOf(3)).toBe(3)
    expect(cellOf(0)).toBe(-1)
    expect(cellOf(-0.2)).toBe(-1)
    expect(cellOf(-1)).toBe(-2)
    expect(cellOf(0.5)).toBe(0)
  })
})

describe('the band energy', () => {
  it('renders a straight edge exactly, also on a gridline', () => {
    const w = 6
    const h = 3
    const labels = labelsFrom(w, h, (x) => (x >= 3 ? 1 : 0))
    for (const delta of [0, -0.3, 0.2, -0.5, 0.45]) {
      const map = mapOfLabels(labels)
      // Move the boundary at x = 3, and the frame nodes it ends on, to 3 + delta.
      for (const e of map.edges) {
        for (let i = 0; i < e.points.length; i += 2) if (e.points[i] === 3) e.points[i] = 3 + delta
      }
      for (const v of map.nodes) if (v.x === 3) v.x = 3 + delta
      const x0 = 3 + delta
      const fills = fillsByFace(map.faces, [flat(0, 0, 0), flat(1, 1, 1)])
      const image = imageOf(w, h, (x) => {
        const c = Math.min(1, Math.max(0, x + 1 - x0))
        return [c, c, c, 1]
      })
      const { u, prob } = problemOf(map, image, fills)
      expect(prob.energy(u.start, null), `delta ${delta}`).toBeLessThan(1e-12)
      // The wrong side is not interchangeable with the right one.
      const flipped = imageOf(w, h, (x) => {
        const c = 1 - Math.min(1, Math.max(0, x + 1 - x0))
        return [c, c, c, 1]
      })
      expect(problemOf(map, flipped, fills).prob.energy(u.start, null)).toBeGreaterThan(1)
    }
  })

  it('has an analytic gradient that matches finite differences', () => {
    const rnd = mulberry32(3)
    for (let trial = 0; trial < 3; trial++) {
      const { map, image, fills } = threeFaces(rnd)
      const { u, prob } = problemOf(map, image, fills)
      prob.wKink = 0.2
      prob.wAnchor = 0.1
      const sizable = checkGradient(prob, u, jitter(u, rnd, 0.2), 1e-4)
      expect(sizable).toBeGreaterThan(20)
    }
  })

  it('has an exact gradient through both kinds of gridline crossing', () => {
    // A diagonal chain crosses vertical and horizontal gridlines alike.
    const map = handMap(
      3,
      3,
      [
        {
          points: [0.09, 0.71, 1.23, 1.34, 2.12, 1.87, 2.91, 2.63],
          left: 0,
          right: 1,
          start: 0,
          end: 1,
        },
      ],
      [
        [0.09, 0.71],
        [2.91, 2.63],
      ],
    )
    const image = imageOf(3, 3, (x, y) => [0.2 + 0.07 * (3 * y + x), 0.5, 0.4, 1])
    const fills = [flat(0.9, 0.8, 0.1), flat(0.1, 0.3, 0.7)]
    const { u, prob } = problemOf(map, image, fills)
    prob.wKink = 0.4
    prob.wAnchor = 0.25
    const pos = u.start.slice()
    for (let v = 0; v < u.count; v++) {
      pos[2 * v] -= 0.013 * v
      pos[2 * v + 1] += 0.017 * v
    }
    expect(prob.energy(pos, null)).toBeGreaterThan(1e-3)
    checkGradient(prob, u, pos, 1e-3)
  })

  it('has no jumps', () => {
    // Slide every free point together in steps far smaller than a pixel, across
    // many gridlines: the energy changes by at most its slope times the step.
    const rnd = mulberry32(11)
    const { map, image, fills } = threeFaces(rnd)
    const { u, prob } = problemOf(map, image, fills)
    const pos = u.start.slice()
    let prev = Number.NaN
    let worst = 0
    for (let k = 0; k < 6000; k++) {
      const t = -0.3 + k * 1e-4
      for (let v = 0; v < u.count; v++) {
        pos[2 * v] = u.start[2 * v] + (u.pin[v] & PIN_X ? 0 : t)
        pos[2 * v + 1] = u.start[2 * v + 1] + (u.pin[v] & PIN_Y ? 0 : 0.37 * t)
      }
      const e = prob.energy(pos, null)
      if (k > 0) worst = Math.max(worst, Math.abs(e - prev))
      prev = e
    }
    expect(worst).toBeLessThan(1e-2)
  })

  it('sums the stretches without pieces at once exactly as pixel by pixel', () => {
    const rnd = mulberry32(5)
    for (let trial = 0; trial < 4; trial++) {
      const { map, image, fills } = threeFaces(rnd)
      const { u, prob } = problemOf(map, image, fills)
      const pos = jitter(u, rnd, 0.3)
      prob.bucket(pos)
      const gFast = new Float64Array(pos.length)
      const gCells = new Float64Array(pos.length)
      const eFast = prob.bandData(pos, gFast)
      const eCells = prob.bandDataCells(pos, gCells)
      expect(Math.abs(eFast - eCells)).toBeLessThan(1e-9 * (1 + Math.abs(eCells)))
      for (let k = 0; k < pos.length; k++) expect(Math.abs(gFast[k] - gCells[k])).toBeLessThan(1e-8)
    }
  })

  it('compares all four premultiplied channels, so opacity alone places a boundary', () => {
    // White paint at 0.8 and at 0.1 either side of x = 0.8 in a 3x3 image:
    // color over white could not tell them apart, the premultiplied pixels can.
    const map = handMap(
      3,
      3,
      [{ points: [0.8, 0, 0.8, 3], left: 0, right: 1, start: 0, end: 1 }],
      [
        [0.8, 0],
        [0.8, 3],
      ],
    )
    const fills = [flat(1, 1, 1, 0.8), flat(1, 1, 1, 0.1)]
    const col0 = 0.2 * 0.8 + 0.8 * 0.1
    const exact = imageOf(3, 3, (x) => (x === 0 ? [col0, col0, col0, col0] : [0.8, 0.8, 0.8, 0.8]))
    const { u, prob } = problemOf(map, exact, fills)
    expect(prob.energy(u.start, null)).toBeLessThan(1e-12)
    // Off by 0.1 in alpha in each of the three cut pixels.
    const off = imageOf(3, 3, (x) =>
      x === 0 ? [col0, col0, col0, col0 + 0.1] : [0.8, 0.8, 0.8, 0.8],
    )
    const d = problemOf(map, off, fills).prob.energy(u.start, null)
    expect(d).toBeCloseTo(3 * 0.01, 6)
  })
})

describe('the priors', () => {
  const blank = (w: number, h: number): PremultipliedImage => imageOf(w, h, () => [0, 0, 0, 1])

  it('sums absolute second differences round a ring, and anchors every point', () => {
    const map = handMap(
      5,
      5,
      [{ points: [1, 1, 3, 1, 3, 3, 1, 3], left: 0, right: 1, closed: true }],
      [],
    )
    const u = buildUnknowns(map)
    expect(Array.from(u.junction)).toEqual([0, 0, 0, 0])
    const prob = new BandProblem(map, u, blank(5, 5), [flat(1, 1, 1), flat(0, 0, 0)])
    prob.wKink = 0.5
    prob.wAnchor = 0
    // At every corner a − 2b + c has length 2√2.
    expect(prob.priors(u.start, null)).toBeCloseTo(4 * 0.5 * Math.sqrt(8 + KINK_EPS), 12)
    prob.wKink = 0
    prob.wAnchor = 2
    const moved = u.start.map((v, k) => (k % 2 === 0 ? v + 0.1 : v))
    expect(prob.priors(moved, null)).toBeCloseTo(4 * 2 * 0.01, 12)
  })

  it('anchors a junction four times harder', () => {
    const map = handMap(
      4,
      2,
      [{ points: [1, 1, 2, 1.2, 3, 1], left: 0, right: 1, start: 0, end: 1 }],
      [
        [1, 1],
        [3, 1],
      ],
    )
    const u = buildUnknowns(map)
    expect(Array.from(u.junction)).toEqual([1, 0, 1])
    const prob = new BandProblem(map, u, blank(4, 2), [flat(1, 1, 1), flat(0, 0, 0)])
    prob.wKink = 0
    prob.wAnchor = 1
    const shift = (v: number): number => {
      const p = u.start.slice()
      p[2 * v + 1] += 0.1
      return prob.priors(p, null)
    }
    expect(shift(1)).toBeCloseTo(0.01, 12)
    expect(shift(0)).toBeCloseTo(JUNCTION_ANCHOR * 0.01, 12)
    expect(shift(2)).toBeCloseTo(JUNCTION_ANCHOR * 0.01, 12)
  })
})

describe('the unknowns', () => {
  it('share one unknown per node and pin the frame', () => {
    const map = mapOfLabels(labelsFrom(4, 3, (x) => (x >= 2 ? 1 : 0)))
    const u = buildUnknowns(map)
    let points = 0
    for (const e of map.edges) points += e.points.length / 2
    // Every open edge's two ends are node unknowns, counted once per node.
    let ends = 0
    for (const e of map.edges) if (!e.closed) ends += 2
    expect(u.count).toBe(points - ends + map.nodes.length)
    for (let k = 0; k < map.edges.length; k++) {
      const e = map.edges[k]
      if (e.closed) continue
      const ids = u.of[k]
      expect(u.node[ids[0]]).toBe(e.start)
      expect(u.node[ids[ids.length - 1]]).toBe(e.end)
    }
    pinFrame(map, u)
    for (let v = 0; v < u.count; v++) {
      const x = u.start[2 * v]
      const y = u.start[2 * v + 1]
      expect(!!(u.pin[v] & PIN_X)).toBe(x === 0 || x === 4)
      expect(!!(u.pin[v] & PIN_Y)).toBe(y === 0 || y === 3)
    }
  })
})

describe('the band-table budget', () => {
  /** One-pixel vertical stripes of `k` faces: a band of whole rows with a face per column. */
  function stripes(
    w: number,
    h: number,
    k: number,
  ): { map: PlanarMap; image: PremultipliedImage; fills: FaceFill[] } {
    const map = mapOfLabels(labelsFrom(w, h, (x) => x % k))
    const image = imageOf(w, h, (x) => {
      const c = (x % k) / k
      return [c, c, c, 1]
    })
    const byLabel = Array.from({ length: k }, (_, f) => flat(f / k, f / k, f / k))
    return { map, image, fills: fillsByFace(map.faces, byLabel) }
  }

  it('counts exactly what the tables take', () => {
    const rnd = mulberry32(17)
    for (const { map, image, fills } of [threeFaces(rnd), stripes(23, 7, 2), stripes(16, 5, 16)]) {
      const u = buildUnknowns(map)
      pinFrame(map, u)
      const prob = new BandProblem(map, u, image, fills)
      expect(prob.setup(Infinity)).toBe(true)
      const band = prob.band!
      let counted = 0
      for (let r = 0; r < band.runCount; r++)
        counted += tableEntries(band.x1[r] - band.x0[r] + 1, band.nf[r])
      expect(counted).toBe(band.entries)
      expect(band.colour.length + band.prefix.length).toBe(counted)
    }
  })

  it('refuses a band one entry over the budget, with nothing set up', () => {
    const { map, image, fills } = stripes(40, 12, 40)
    const u = buildUnknowns(map)
    pinFrame(map, u)
    const prob = new BandProblem(map, u, image, fills)
    expect(prob.setup(Infinity)).toBe(true)
    const band = prob.band!
    // Whole rows, a face per column: the quadratic growth the budget is for.
    for (let r = 0; r < band.runCount; r++) expect(band.nf[r]).toBeGreaterThanOrEqual(38)
    const total = band.entries
    expect(new BandProblem(map, u, image, fills).setup(total)).toBe(true)
    const over = new BandProblem(map, u, image, fills)
    expect(over.setup(total - 1)).toBe(false)
    expect(over.band).toBeNull()
  })

  it('has a floor and grows with the image', () => {
    expect(tableBudget(128, 128)).toBe(TABLE_BUDGET_FLOOR)
    expect(tableBudget(2048, 2048)).toBe(TABLE_BUDGET_FLOOR)
    expect(tableBudget(8192, 8192)).toBe(4 * 8192 * 8192)
  })

  it('does not bind on an ordinary large map', () => {
    // A 600 x 400 image of a few dozen disks on two grounds fits in a sixteenth of the floor.
    const w = 600
    const h = 400
    const labels = labelsFrom(w, h, (x, y) => {
      const cx = Math.floor(x / 50) * 50 + 25
      const cy = Math.floor(y / 50) * 50 + 25
      return ((x - cx) ** 2 + (y - cy) ** 2 < 18 ** 2 ? 1 : 0) + (x > 300 ? 1 : 0)
    })
    const map = mapOfLabels(labels)
    const image = imageOf(w, h, (x, y) => {
      const c = labels.data[y * w + x] / 2
      return [c, c, c, 1]
    })
    const fills = fillsByFace(map.faces, [flat(0, 0, 0), flat(0.5, 0.5, 0.5), flat(1, 1, 1)])
    const u = buildUnknowns(map)
    pinFrame(map, u)
    expect(new BandProblem(map, u, image, fills).setup(TABLE_BUDGET_FLOOR / 16)).toBe(true)
  })
})

describe('the independent parts', () => {
  it('split boundaries that share no run and no unknown, and skip the unread frame', () => {
    // Two disks far apart on one ground: each its own part; the frame's left
    // side is read by column 0 and forms a third.
    const labels = labelsFrom(30, 12, (x, y) =>
      (x - 6) ** 2 + (y - 6) ** 2 < 10 || (x - 22) ** 2 + (y - 6) ** 2 < 10 ? 1 : 0,
    )
    const map = mapOfLabels(labels)
    const image = imageOf(30, 12, () => [0.5, 0.5, 0.5, 1])
    const fills = fillsByFace(map.faces, [flat(0, 0, 0), flat(1, 1, 1)])
    const { u, prob } = problemOf(map, image, fills)
    const parts = prob.components()
    const interior = map.edges.filter((e) => e.left !== OUTSIDE && e.right !== OUTSIDE).length
    expect(interior).toBe(2)
    expect(parts.length).toBe(3)
    // Every unknown in at most one part, every part with runs.
    const seen = new Uint8Array(u.count)
    for (const p of parts) {
      expect(p.runs.length).toBeGreaterThan(0)
      for (const v of p.vars) {
        expect(seen[v]).toBe(0)
        seen[v] = 1
      }
    }
    // The parts' energies add up to the whole problem's.
    prob.wKink = 0.3
    prob.wAnchor = 0.2
    const rnd = mulberry32(9)
    const pos = jitter(u, rnd, 0.4)
    prob.active = null
    const whole = prob.energy(pos, null)
    let sum = 0
    for (const p of parts) {
      prob.active = p
      sum += prob.energy(pos, null)
    }
    prob.active = null
    // The frame's top, right and bottom are in no part: their priors are not in the sum.
    let frameOnly = 0
    const covered = new Uint8Array(map.edges.length)
    for (const p of parts) for (const k of p.edges) covered[k] = 1
    const rest = map.edges.map((_, k) => k).filter((k) => !covered[k])
    if (rest.length > 0) {
      prob.active = {
        edges: Int32Array.from(rest),
        runs: new Int32Array(0),
        vars: new Int32Array(0),
      }
      frameOnly = prob.energy(pos, null)
      prob.active = null
    }
    expect(sum + frameOnly).toBeCloseTo(whole, 9)
  })
})
