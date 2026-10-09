import { describe, expect, it } from 'vitest'
import type { FittedEdge } from '../../src/planar/types'
import { fitConfig } from '../../src/planar/types'
import { withCostModel, STANDARD_COST_MODEL } from '../../src/fit/cost'
import { MAX_ARM, chi2Cubic } from '../../src/fit/cubicfit'
import {
  chi2,
  cubicSelfIntersects,
  cubicTo,
  circularArc,
  evalCubic,
  lineTo,
  segmentParams,
} from '../../src/fit/curves'
import type { Bezier, FitSegment } from '../../src/fit/curves'
import {
  BREAK_PARAMS,
  COARSE_SAMPLES,
  GRID_ANGLES,
  GRID_ARMS,
  SEARCH_DEGREES,
  edgeVertices,
  freeCubic,
  mergeChi2,
  mergeChi2Below,
  mergeFreeCubics,
  postFitPasses,
  sharpenCorners,
} from '../../src/fit/merge'
import { arcLengths, polyline } from '../../src/fit/objective'
import type { FitPath, Polyline } from '../../src/fit/objective'
import { hypot } from '../../src/fit/roots'
import { snapAxisAligned, snapSmoothJoins } from '../../src/fit/snap'
import { lcg } from './fit-helpers'

/** The cubic `[p0, p1, p2, p3]` from eight numbers. */
const bez = (p: readonly number[]): Bezier => ({
  x0: p[0],
  y0: p[1],
  x1: p[2],
  y1: p[3],
  x2: p[4],
  y2: p[5],
  x3: p[6],
  y3: p[7],
})

/** A cubic segment from its three points. */
const cub = (p: readonly number[]): FitSegment => cubicTo(p[0], p[1], p[2], p[3], p[4], p[5])

/** The `x, y` of point `i` of a polyline. */
const at = (poly: Polyline, i: number): [number, number] => [
  poly.points[2 * i],
  poly.points[2 * i + 1],
]

/** A noisy run of `n` points along a random cubic, with random σ (inkvec's `noisy_run`). */
function noisyRun(rnd: () => number, n: number, noise: number): Polyline {
  const c = bez(Array.from({ length: 8 }, () => 40 * (rnd() - 0.5)))
  const pts = new Float64Array(2 * n)
  const p = { x: 0, y: 0 }
  for (let k = 0; k < n; k++) {
    evalCubic(c, k / (n - 1), p)
    pts[2 * k] = p.x + noise * (rnd() - 0.5)
    pts[2 * k + 1] = p.y + noise * (rnd() - 0.5)
  }
  const sigma = Array.from({ length: n }, () => 0.05 + rnd())
  return polyline(pts, sigma, false)
}

/**
 * An L-shaped run with a rounded corner: a line along `y = 0`, a quarter circle
 * of radius 4 about `(10, 4)` by the rational parametrization, a line along
 * `x = 14`, each coordinate with exact dyadic noise. 29 points, σ 0.1.
 */
function roundedL(): Polyline {
  const rnd = lcg(3)
  const raw: [number, number][] = []
  for (let k = 0; k <= 10; k++) raw.push([k, 0])
  for (let k = 1; k <= 8; k++) {
    const u = k / 8
    const d = 1 + u * u
    raw.push([10 + 4 * ((2 * u) / d), 4 - 4 * ((1 - u * u) / d)])
  }
  for (let k = 5; k <= 14; k++) raw.push([14, k])
  const pts: number[] = []
  for (const [x, y] of raw) {
    const nx = x + 0.03 * (rnd() - 0.5)
    const ny = y + 0.03 * (rnd() - 0.5)
    pts.push(nx, ny)
  }
  return polyline(pts, new Array(raw.length).fill(0.1), false)
}

/** 41 noisy samples of one cubic, σ 0.15, and the two halves it splits into at `t = ½`. */
function oneCubic(): { poly: Polyline; halves: [FitSegment, FitSegment] } {
  const rnd = lcg(9)
  const c = bez([0, 0, 6, 9, 17, 11, 24, 3])
  const pts: number[] = []
  const p = { x: 0, y: 0 }
  for (let k = 0; k <= 40; k++) {
    evalCubic(c, k / 40, p)
    const nx = p.x + 0.02 * (rnd() - 0.5)
    const ny = p.y + 0.02 * (rnd() - 0.5)
    pts.push(nx, ny)
  }
  return {
    poly: polyline(pts, new Array(41).fill(0.15), false),
    halves: [cub([3, 4.5, 7.25, 7.25, 11.625, 7.875]), cub([16, 8.5, 20.5, 7, 24, 3])],
  }
}

/** A fitted edge's segments, which the passes keep to lines, cubics and arcs. */
const segsOf = (edge: FittedEdge): FitSegment[] => edge.segments as FitSegment[]

/** The segments of a path as plain arrays, for exact comparison. */
function shape(path: FitPath): number[][] {
  return [
    [path.x0, path.y0],
    ...path.segments.map((s) =>
      s.type === 'C' ? [s.x1, s.y1, s.x2, s.y2, s.x, s.y] : [s.type === 'L' ? 0 : 1, s.x, s.y],
    ),
  ]
}

/** The run's priced cost `Σ ½·χ²_seg + λ·params_seg`, each segment scored as the merge scores it. */
function pricedCost(path: FitPath, poly: Polyline, v: readonly number[], lambda: number): number {
  let cost = 0
  let cx = path.x0
  let cy = path.y0
  path.segments.forEach((s, q) => {
    const c =
      s.type === 'C'
        ? bez([cx, cy, s.x1, s.y1, s.x2, s.y2, s.x, s.y])
        : bez([cx, cy, cx, cy, s.x, s.y, s.x, s.y])
    cost += 0.5 * mergeChi2(c, poly, v[q], v[q + 1]) + lambda * segmentParams(s)
    cx = s.x
    cy = s.y
  })
  return cost
}

/** `x` one unit in the last place up or down. */
function nextAfter(x: number, up: boolean): number {
  if (!Number.isFinite(x) || x === 0) return up ? Number.MIN_VALUE : 0
  const b = new DataView(new ArrayBuffer(8))
  b.setFloat64(0, x)
  b.setBigUint64(0, b.getBigUint64(0) + (up === x > 0 ? 1n : -1n))
  return b.getFloat64(0)
}

/**
 * The free-cubic search without its speed-ups (inkvec's `free_cubic_reference`):
 * every grid candidate scored in full on 25 samples, every compass trial on 97.
 */
function freeCubicReference(
  poly: Polyline,
  a: number,
  b: number,
  p0x: number,
  p0y: number,
  p3x: number,
  p3y: number,
): Bezier | null {
  const pts = poly.points
  const chord = hypot(p0x - p3x, p0y - p3y)
  if (chord <= 1e-9 || b <= a + 1) return null
  const qi = Math.min(a + 2, b)
  const qj = Math.max(b - 2, a)
  const d0 = [pts[2 * qi] - p0x, pts[2 * qi + 1] - p0y]
  const d1 = [p3x - pts[2 * qj], p3y - pts[2 * qj + 1]]
  const n0 = hypot(d0[0], d0[1])
  const n1 = hypot(d1[0], d1[1])
  if (n0 <= 1e-9 || n1 <= 1e-9) return null
  let acc = 0
  for (let i = a; i < b; i++)
    acc += hypot(pts[2 * i] - pts[2 * i + 2], pts[2 * i + 1] - pts[2 * i + 3])
  if (acc <= 1e-9) return null
  const rot = (x: number, y: number, deg: number): [number, number] => {
    const r = deg * (Math.PI / 180)
    const s = Math.sin(r)
    const c = Math.cos(r)
    return [x * c - y * s, x * s + y * c]
  }
  const build = (t: readonly number[]): Bezier => {
    const e0 = rot(d0[0] / n0, d0[1] / n0, t[0])
    const e1 = rot(d1[0] / n1, d1[1] / n1, t[1])
    return bez([
      p0x,
      p0y,
      p0x + e0[0] * t[2] * chord,
      p0y + e0[1] * t[2] * chord,
      p3x - e1[0] * t[3] * chord,
      p3y - e1[1] * t[3] * chord,
      p3x,
      p3y,
    ])
  }
  const admissible = (t: readonly number[]): Bezier | null => {
    if (!(t[2] >= 0.02 && t[2] <= MAX_ARM) || !(t[3] >= 0.02 && t[3] <= MAX_ARM)) return null
    if (Math.abs(t[0]) > SEARCH_DEGREES || Math.abs(t[1]) > SEARCH_DEGREES) return null
    const c = build(t)
    return cubicSelfIntersects(c) ? null : c
  }
  let cur = [0, 0, 0.35, 0.35]
  let rough = Infinity
  for (const r0 of GRID_ANGLES) {
    for (const r1 of GRID_ANGLES) {
      for (const e0 of GRID_ARMS) {
        for (const e1 of GRID_ARMS) {
          const c = admissible([r0, r1, e0, e1])
          const x = c ? mergeChi2(c, poly, a, b, COARSE_SAMPLES) : Infinity
          if (x < rough) {
            rough = x
            cur = [r0, r1, e0, e1]
          }
        }
      }
    }
  }
  if (!Number.isFinite(rough)) return null
  const score = (t: readonly number[]): number => {
    const c = admissible(t)
    return c ? mergeChi2(c, poly, a, b) : Infinity
  }
  let best = score(cur)
  const step = [10, 10, 0.1, 0.1]
  for (let round = 0; round < 6; round++) {
    let improved = true
    while (improved) {
      improved = false
      for (let k = 0; k < 4; k++) {
        for (const sign of [-1, 1]) {
          const trial = cur.slice()
          trial[k] += sign * step[k]
          const x = score(trial)
          if (x < best) {
            best = x
            cur = trial
            improved = true
          }
        }
      }
    }
    for (let k = 0; k < 4; k++) step[k] *= 0.5
  }
  return Number.isFinite(best) ? build(cur) : null
}

const cfg = { tau: 2, lambda: 6 }

describe('hypot', () => {
  it('rounds as Rust’s f64::hypot does where Math.hypot and the plain root do not', () => {
    // Pairs and results from Rust's f64::hypot (glibc).
    const cases = [
      [-2.782490163151331, 0.4245830870739675, 2.81469755140107],
      [-2.0681637660897656, -0.4682994004357144, 2.1205201465242087],
      [-3.412749899343269, -3.745211310816728, 5.0668994106985235],
      [-4.704175878283151, -4.7290737273340895, 6.670337998361297],
    ]
    for (const [x, y, want] of cases) expect(hypot(x, y)).toBe(want)
  })

  it('handles zeros, the extremes and non-finite arguments', () => {
    expect(hypot(0, 0)).toBe(0)
    expect(hypot(3, -4)).toBe(5)
    expect(hypot(1e300, 1e300)).toBeCloseTo(Math.SQRT2 * 1e300, -285)
    expect(hypot(3e-320, 4e-320)).toBeGreaterThan(0)
    expect(hypot(Infinity, NaN)).toBe(Infinity)
    expect(hypot(NaN, 1)).toBeNaN()
  })
})

describe('mergeChi2', () => {
  it('is zero on the curve’s own samples and the nearest-sample distance elsewhere', () => {
    const c = bez([0, 0, 3, 6, 9, 6, 12, 0])
    const pts: number[] = []
    const p = { x: 0, y: 0 }
    for (const k of [0, 17, 48, 96]) {
      evalCubic(c, k / 96, p)
      pts.push(p.x, p.y)
    }
    expect(mergeChi2(c, polyline(pts, [0.1, 0.1, 0.1, 0.1], false), 0, 3)).toBe(0)
    // A point 0.3 px off the start, beyond the first sample, at σ 0.1: (0.3/0.1)².
    const off = polyline([-0.3, 0], [0.1], false)
    expect(mergeChi2(c, off, 0, 0)).toBeCloseTo(9, 12)
  })

  it('scores a line as the degenerate cubic, as inkvec does', () => {
    const poly = roundedL()
    const [x0, y0] = at(poly, 0)
    const [x9, y9] = at(poly, 9)
    expect(mergeChi2(bez([x0, y0, x0, y0, x9, y9, x9, y9]), poly, 0, 9)).toBe(1.041824477005847)
  })

  it('answers below its bound with the plain residual, bit for bit, and never claims below otherwise', () => {
    const rnd = lcg(7)
    for (let k = 0; k < 120; k++) {
      const n = [3, 4, 5, 8, 17, 40, 97, 98, 150][k % 9]
      const poly = noisyRun(rnd, n, [0, 0.3, 4][k % 3])
      const c = bez(Array.from({ length: 8 }, () => 40 * (rnd() - 0.5)))
      for (const samples of [COARSE_SAMPLES, 96]) {
        const exact = mergeChi2(c, poly, 0, n - 1, samples)
        const bounds = [
          exact,
          exact * (1 - 1e-15),
          exact * (1 + 1e-15),
          exact * 0.5,
          exact * 2,
          exact * (1 + 1e-13),
          exact * (1 - 1e-13),
          nextAfter(exact, true),
          nextAfter(exact, false),
          0,
          1e-300,
          Infinity,
          NaN,
          rnd() * 2 * exact,
        ]
        for (const bound of bounds) {
          const got = mergeChi2Below(c, poly, 0, n - 1, bound, samples)
          // Cut short only when the residual reaches the bound; otherwise the same bits.
          const agrees =
            got === Infinity && Number.isFinite(exact) ? exact >= bound : Object.is(got, exact)
          expect(agrees).toBe(true)
          expect(got < bound).toBe(exact < bound)
        }
      }
    }
  })

  it('keeps a NaN coordinate from winning a comparison', () => {
    const poly = noisyRun(lcg(3), 20, 0.2)
    poly.points[18] = NaN
    const c = bez([0, 0, 5, 5, 10, 5, 15, 0])
    expect(mergeChi2(c, poly, 0, 19)).toBeNaN()
    for (const bound of [0.1, 10, 1e9]) {
      const got = mergeChi2Below(c, poly, 0, 19, bound)
      expect(Number.isNaN(got) || got >= bound).toBe(true)
    }
  })
})

describe('freeCubic', () => {
  it('finds the cubic and residual inkvec finds', () => {
    const poly = roundedL()
    const [x0, y0] = at(poly, 0)
    const [x20, y20] = at(poly, 20)
    const f = freeCubic(poly, 0, 20, x0, y0, x20, y20)
    expect(f).not.toBeNull()
    const c = (f as NonNullable<typeof f>).cubic
    expect([c.x0, c.y0, c.x1, c.y1, c.x2, c.y2, c.x3, c.y3]).toEqual([
      -0.011603693914153442, -0.005255255758272728, 12.66370936537834, 0.005121194379773535,
      13.986651120782065, -0.8520813905915761, 14.000418208230647, 6.009730709048089,
    ])
    expect((f as NonNullable<typeof f>).chi2).toBe(13.363684923525218)
  })

  it('reports the residual of the cubic it returns, bit for bit', () => {
    const rnd = lcg(41)
    let found = 0
    for (let k = 0; k < 16; k++) {
      const n = 6 + ((k * 5) % 50)
      const poly = noisyRun(rnd, n, [0, 0.3][k % 2])
      const [ax, ay] = at(poly, 0)
      const [bx, by] = at(poly, n - 1)
      const f = freeCubic(poly, 0, n - 1, ax, ay, bx, by)
      if (!f) continue
      found++
      expect(f.chi2).toBe(mergeChi2(f.cubic, poly, 0, n - 1))
      // Its ends are the ones asked for, and it does not cross itself.
      expect([f.cubic.x0, f.cubic.y0, f.cubic.x3, f.cubic.y3]).toEqual([ax, ay, bx, by])
      expect(cubicSelfIntersects(f.cubic)).toBe(false)
    }
    expect(found).toBeGreaterThan(10)
  })

  it('finds the exhaustive search’s cubic despite the screen, the early exit and the cache', () => {
    const rnd = lcg(53)
    for (let k = 0; k < 14; k++) {
      const n = [5, 9, 24, 50, 97][k % 5]
      const base = noisyRun(rnd, n, [0, 0.05, 0.6][k % 3])
      const shift = [0, 2048.25, -1e5][k % 3]
      const scale = [1e-4, 1, 30][k % 3]
      const pts = base.points.map((v, i) => (i % 2 === 0 ? v + shift : v - shift))
      const poly = polyline(
        pts,
        base.sigma.map((s) => s * scale),
        false,
      )
      // The path's own ends sit near, not on, the contour's.
      const p0 = [pts[0] + 0.1 * rnd(), pts[1]]
      const p3 = [pts[2 * n - 2], pts[2 * n - 1] - 0.1 * rnd()]
      const fast = freeCubic(poly, 0, n - 1, p0[0], p0[1], p3[0], p3[1])
      const slow = freeCubicReference(poly, 0, n - 1, p0[0], p0[1], p3[0], p3[1])
      expect(fast?.cubic ?? null).toEqual(slow)
    }
  })

  it('refuses a zero chord, a run without interior points and a contour of zero length', () => {
    const poly = polyline([0, 0, 1, 1, 2, 0, 3, 0], [0.1, 0.1, 0.1, 0.1], false)
    expect(freeCubic(poly, 0, 3, 0, 0, 0, 0)).toBeNull()
    expect(freeCubic(poly, 0, 1, 0, 0, 1, 1)).toBeNull()
    const flat = polyline([2, 2, 2, 2, 2, 2, 2, 2], [0.1, 0.1, 0.1, 0.1], false)
    expect(freeCubic(flat, 0, 3, 0, 0, 5, 5)).toBeNull()
  })
})

describe('mergeFreeCubics', () => {
  it('merges two cubics one cubic explains, as inkvec does', () => {
    const { poly, halves } = oneCubic()
    const path: FitPath = { x0: 0, y0: 0, segments: [...halves], closed: false }
    const v = [0, 20, 40]
    expect(mergeFreeCubics(path, poly, v, cfg)).toBe(1)
    expect(v).toEqual([0, 40])
    expect(shape(path)).toEqual([
      [0, 0],
      [5.724896804452733, 8.719050730490498, 16.843388406293755, 11.200329901706965, 24, 3],
    ])
  })

  it('keeps two cubics that are not one cubic', () => {
    // A right-angle corner: along y = 0, then down x = 10, σ 0.05.
    const pts: number[] = []
    for (let k = 0; k <= 20; k++) pts.push(0.5 * k, 0)
    for (let k = 1; k <= 20; k++) pts.push(10, 0.5 * k)
    const poly = polyline(pts, new Array(41).fill(0.05), false)
    const path: FitPath = {
      x0: 0,
      y0: 0,
      segments: [cub([3.3, 0, 6.7, 0, 10, 0]), cub([10, 3.3, 10, 6.7, 10, 10])],
      closed: false,
    }
    const before = shape(path)
    const v = [0, 20, 40]
    expect(mergeFreeCubics(path, poly, v, cfg)).toBe(0)
    expect(shape(path)).toEqual(before)
    expect(v).toEqual([0, 20, 40])
  })

  it('replaces a rounded corner’s chord, cubic and chord by one cubic, as inkvec does', () => {
    const poly = roundedL()
    const [x0, y0] = at(poly, 0)
    const [x9, y9] = at(poly, 9)
    const [x20, y20] = at(poly, 20)
    const [x28, y28] = at(poly, 28)
    const path: FitPath = {
      x0,
      y0,
      segments: [lineTo(x9, y9), cub([x9 + 2.2, y9, x20, y20 - 2.2, x20, y20]), lineTo(x28, y28)],
      closed: false,
    }
    const v = [0, 9, 20, 28]
    expect(mergeFreeCubics(path, poly, v, cfg)).toBe(1)
    expect(v).toEqual([0, 28])
    expect(shape(path)).toEqual([
      [x0, y0],
      [
        15.585235808436273, 0.0075128570804552965, 14.07533826454333, -1.596947706102755,
        13.992693894419748, 13.999678063430578,
      ],
    ])
  })

  it('never absorbs a kept vertex', () => {
    const { poly, halves } = oneCubic()
    const path: FitPath = { x0: 0, y0: 0, segments: [...halves], closed: false }
    const v = [0, 20, 40]
    expect(mergeFreeCubics(path, poly, v, cfg, [20])).toBe(0)
    expect(path.segments).toEqual(halves)
  })

  it('lowers the priced cost by more than the break charge per merge, and keeps every end', () => {
    const rnd = lcg(29)
    let total = 0
    for (let k = 0; k < 6; k++) {
      const n = 40 + 9 * k
      const poly = noisyRun(rnd, n, [0, 0.1, 0.3][k % 3])
      // Chords every 3 to 5 points: the polygon a coarse fit would leave.
      const v = [0]
      while (v[v.length - 1] < n - 1) v.push(Math.min(v[v.length - 1] + 3 + (v.length % 3), n - 1))
      const path: FitPath = {
        x0: poly.points[0],
        y0: poly.points[1],
        segments: v.slice(1).map((i) => lineTo(...at(poly, i))),
        closed: false,
      }
      const ends = new Set(path.segments.map((s) => `${s.x},${s.y}`))
      const before = pricedCost(path, poly, v, cfg.lambda)
      const merged = mergeFreeCubics(path, poly, v, cfg)
      total += merged
      expect(v.length).toBe(path.segments.length + 1)
      const after = pricedCost(path, poly, v, cfg.lambda)
      expect(after).toBeLessThanOrEqual(before - BREAK_PARAMS * cfg.lambda * merged + 1e-9 * before)
      expect([path.x0, path.y0]).toEqual([poly.points[0], poly.points[1]])
      for (const s of path.segments) expect(ends.has(`${s.x},${s.y}`)).toBe(true)
      for (let q = 0; q < path.segments.length; q++) {
        expect([path.segments[q].x, path.segments[q].y]).toEqual(at(poly, v[q + 1]))
      }
    }
    expect(total).toBeGreaterThan(5)
  })

  it('leaves runs holding an arc, and vertex lists out of step, alone', () => {
    const { poly, halves } = oneCubic()
    const arcPath: FitPath = {
      x0: 0,
      y0: 0,
      segments: [halves[0], circularArc(20, false, true, 24, 3)],
      closed: false,
    }
    expect(mergeFreeCubics(arcPath, poly, [0, 20, 40], cfg)).toBe(0)
    const path: FitPath = { x0: 0, y0: 0, segments: [...halves], closed: false }
    expect(mergeFreeCubics(path, poly, [0, 40], cfg)).toBe(0)
  })

  it('is deterministic', () => {
    const run = () => {
      const poly = roundedL()
      const v = [0, 3, 6, 9, 12, 15, 18, 21, 24, 28]
      const path: FitPath = {
        x0: poly.points[0],
        y0: poly.points[1],
        segments: v.slice(1).map((i) => lineTo(...at(poly, i))),
        closed: false,
      }
      mergeFreeCubics(path, poly, v, cfg)
      return { path: shape(path), v }
    }
    expect(run()).toEqual(run())
  })
})

describe('sharpenCorners', () => {
  it('replaces a chamfer cubic between two lines by the corner', () => {
    const path: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(9, 0), cub([9.55, 0, 10, 0.45, 10, 1]), lineTo(10, 10)],
      closed: false,
    }
    expect(sharpenCorners(path)).toBe(1)
    expect(shape(path)).toEqual([
      [0, 0],
      [0, 10, 0],
      [0, 10, 10],
    ])
  })

  it('replaces a short edge with a chamfer at each end by two corners', () => {
    // A bar's end: the cubic bulges to x = 20 between the bar's two sides.
    const path: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(19, 0), cub([20 + 1 / 3, 0, 20 + 1 / 3, 4, 19, 4]), lineTo(0, 4)],
      closed: false,
    }
    expect(sharpenCorners(path)).toBe(2)
    expect(path.segments.map((s) => s.type)).toEqual(['L', 'L', 'L'])
    const [h1, h2] = path.segments
    expect(h1.x).toBeCloseTo(20, 12)
    expect(h1.y).toBeCloseTo(0, 12)
    expect(h2.x).toBeCloseTo(20, 12)
    expect(h2.y).toBeCloseTo(4, 12)
    expect([path.segments[2].x, path.segments[2].y]).toEqual([0, 4])
  })

  it('leaves a long fillet, a shallow turn and an open path’s ends alone', () => {
    const fillet: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(10, 0), cub([15.5, 0, 20, 4.5, 20, 10]), lineTo(20, 20)],
      closed: false,
    }
    const shallow: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(10, 0), cub([10.5, 0, 11, 0.1, 11.5, 0.2]), lineTo(20, 2)],
      closed: false,
    }
    // A chamfer as the first segment of an open path has no line before it.
    const first: FitPath = {
      x0: 9,
      y0: 0,
      segments: [cub([9.55, 0, 10, 0.45, 10, 1]), lineTo(10, 10), lineTo(0, 10)],
      closed: false,
    }
    for (const p of [fillet, shallow, first]) {
      const before = shape(p)
      expect(sharpenCorners(p)).toBe(0)
      expect(shape(p)).toEqual(before)
    }
  })

  it('never moves a pinned vertex and keeps the vertex list in step', () => {
    const pts = new Float64Array([0, 0, 3, 0, 6, 0, 9, 0, 10, 1, 10, 4, 10, 7, 10, 10])
    const poly = polyline(pts, new Array(8).fill(0.1), false)
    const make = (): FitPath => ({
      x0: 0,
      y0: 0,
      segments: [lineTo(9, 0), cub([9.55, 0, 10, 0.45, 10, 1]), lineTo(10, 10)],
      closed: false,
    })
    const pinned = make()
    const pv = [0, 3, 4, 7]
    expect(sharpenCorners(pinned, { vertices: pv, poly, keep: [3] })).toBe(0)
    expect(shape(pinned)).toEqual(shape(make()))
    const free = make()
    const fv = [0, 3, 4, 7]
    expect(sharpenCorners(free, { vertices: fv, poly })).toBe(1)
    expect(fv.length).toBe(free.segments.length + 1)
    expect(fv[0]).toBe(0)
    expect(fv[2]).toBe(7)
    expect([3, 4]).toContain(fv[1])
  })

  it('keeps a closed ring closed when the corner falls on its seam', () => {
    // A 20 x 4 bar whose left end is one cubic bulging to x = 0 between two
    // chamfers, the ring's last segment.
    const ring: FitPath = {
      x0: 1,
      y0: 0,
      segments: [
        lineTo(20, 0),
        lineTo(20, 4),
        lineTo(1, 4),
        cub([1 - 4 / 3, 4, 1 - 4 / 3, 0, 1, 0]),
      ],
      closed: true,
    }
    expect(sharpenCorners(ring)).toBe(2)
    expect(ring.segments.map((s) => s.type)).toEqual(['L', 'L', 'L', 'L'])
    expect(ring.x0).toBeCloseTo(0, 12)
    expect(ring.y0).toBeCloseTo(0, 12)
    const corner = ring.segments[2]
    expect(corner.x).toBeCloseTo(0, 12)
    expect(corner.y).toBeCloseTo(4, 12)
    const last = ring.segments[3]
    expect([last.x, last.y]).toEqual([ring.x0, ring.y0])
    // A chamfer on the seam itself: segment 0 between the last line and the next.
    const seam: FitPath = {
      x0: 0,
      y0: 1,
      segments: [
        cub([0, 0.45, 0.45, 0, 1, 0]),
        lineTo(20, 0),
        lineTo(20, 10),
        lineTo(0, 10),
        lineTo(0, 1),
      ],
      closed: true,
    }
    expect(sharpenCorners(seam)).toBe(1)
    expect([seam.x0, seam.y0]).toEqual([0, 0])
    const end = seam.segments[seam.segments.length - 1]
    expect([end.x, end.y]).toEqual([0, 0])
    expect(seam.segments.length).toBe(4)
  })
})

describe('snapSmoothJoins', () => {
  /** The two halves of one cubic, the second's first handle turned by 1/16 rad (inkvec's pinned case). */
  function kinked(): FitPath {
    return {
      x0: 0,
      y0: 0,
      segments: [
        cub([3, 4.5, 7.25, 7.25, 11.625, 7.875]),
        cub([15.952420785661447, 8.772039209747975, 20.5, 7, 24, 3]),
      ],
      closed: false,
    }
  }

  it('makes a nearly smooth join exactly smooth in floating point, as inkvec does', () => {
    const { poly } = oneCubic()
    const path = kinked()
    expect(snapSmoothJoins(path, poly, [0, 20, 40], cfg, null)).toBe(1)
    expect(shape(path)).toEqual([
      [0, 0],
      [3, 4.5, 7.2681844289487465, 7.247402224435893, 11.625, 7.875],
      [15.981815571051253, 8.502597775564107, 20.50779332669232, 7, 24, 3],
    ])
  })

  it('snaps a smooth join so the S reflection holds after rounding to 0.01', () => {
    const { poly } = oneCubic()
    const path = kinked()
    const free = path.segments.map((s) => ({ ...s }))
    expect(snapSmoothJoins(path, poly, [0, 20, 40], cfg)).toBe(1)
    const [a, b] = path.segments as Extract<FitSegment, { type: 'C' }>[]
    const r = (v: number) => Math.round(v * 100)
    expect(r(b.x1)).toBe(2 * r(a.x) - r(a.x2))
    expect(r(b.y1)).toBe(2 * r(a.y) - r(a.y2))
    // Only control points moved, and the residual stays within the budget.
    expect(shape(path).map((p) => p.slice(-2))).toEqual(shape(kinked()).map((p) => p.slice(-2)))
    const s = arcLengths(poly.points)
    const pair = (p: readonly FitSegment[]) => {
      const [c0, c1] = p as Extract<FitSegment, { type: 'C' }>[]
      return (
        chi2Cubic(
          poly.points,
          poly.sigma,
          s,
          0,
          20,
          bez([0, 0, c0.x1, c0.y1, c0.x2, c0.y2, c0.x, c0.y]),
          true,
        ) +
        chi2Cubic(
          poly.points,
          poly.sigma,
          s,
          20,
          40,
          bez([c0.x, c0.y, c1.x1, c1.y1, c1.x2, c1.y2, c1.x, c1.y]),
          true,
        )
      )
    }
    expect(pair(path.segments) - pair(free as FitSegment[])).toBeLessThan(2 * cfg.lambda * (6 - 4))
  })

  it('leaves a corner join, and every segment end, where they are', () => {
    const { poly } = oneCubic()
    const corner: FitPath = {
      x0: 0,
      y0: 0,
      segments: [cub([3, 4.5, 7.25, 7.25, 11.625, 7.875]), cub([12, 12, 20.5, 7, 24, 3])],
      closed: false,
    }
    const before = shape(corner)
    expect(snapSmoothJoins(corner, poly, [0, 20, 40], cfg)).toBe(0)
    expect(shape(corner)).toEqual(before)
  })

  it('lays a cubic’s arm along the line it continues', () => {
    // A line along y = 0 into a cubic leaving 8 degrees off the line's direction.
    const pts: number[] = []
    for (let k = 0; k <= 10; k++) pts.push(k, 0)
    const p = { x: 0, y: 0 }
    const c = bez([10, 0, 13, 0, 16, 1.5, 18, 4])
    for (let k = 1; k <= 12; k++) {
      evalCubic(c, k / 12, p)
      pts.push(p.x, p.y)
    }
    const poly = polyline(pts, new Array(23).fill(0.2), false)
    const t = Math.tan((8 * Math.PI) / 180)
    const path: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(10, 0), cub([13, 3 * t, 16, 1.5, 18, 4])],
      closed: false,
    }
    expect(snapSmoothJoins(path, poly, [0, 10, 22], cfg)).toBe(1)
    const s = path.segments[1] as Extract<FitSegment, { type: 'C' }>
    expect(s.y1).toBe(0)
    expect(s.x1).toBeGreaterThan(10)
    expect([s.x, s.y]).toEqual([18, 4])
  })
})

describe('snapAxisAligned', () => {
  /** inkvec's L-shaped boundary, the corner fitted `off` px off the axis. */
  function corner(off: number): { path: FitPath; poly: Polyline } {
    const pts: number[] = []
    for (let x = 0; x <= 10; x++) pts.push(x, 5)
    for (let y = 6; y <= 10; y++) pts.push(10, y)
    return {
      path: {
        x0: 0,
        y0: 5,
        segments: [lineTo(10, 5 + off), lineTo(10, 10)],
        closed: false,
      },
      poly: polyline(pts, new Array(16).fill(0.1), false),
    }
  }

  it('snaps a line off the axis by less than its noise', () => {
    const { path, poly } = corner(0.02)
    expect(snapAxisAligned(path, poly, [0, 10, 15], fitConfig(256, 0.1, 2))).toBe(1)
    expect([path.segments[0].x, path.segments[0].y]).toEqual([10, 5])
  })

  it('keeps a line off the axis by more than its noise', () => {
    const { path, poly } = corner(0.5)
    expect(snapAxisAligned(path, poly, [0, 10, 15], fitConfig(256, 0.1, 2))).toBe(0)
    expect([path.segments[0].x, path.segments[0].y]).toEqual([10, 5.5])
  })
})

describe('postFitPasses', () => {
  /** The halves of {@link oneCubic} as a fitted open edge. */
  function halvesEdge(): { edge: FittedEdge; poly: Polyline } {
    const { poly, halves } = oneCubic()
    return {
      edge: { x0: 0, y0: 0, segments: [...halves], closed: false, params: 14, chi2: 0 },
      poly,
    }
  }

  it('merges an open edge, keeps its ends exactly and recounts it', () => {
    const { edge, poly } = halvesEdge()
    const out = postFitPasses(edge, poly.points, poly.sigma, cfg)
    expect(out).not.toBe(edge)
    expect(out.segments.length).toBe(1)
    expect([out.x0, out.y0]).toEqual([0, 0])
    expect([segsOf(out)[0].x, segsOf(out)[0].y]).toEqual([24, 3])
    expect(out.params).toBe(8)
    expect(out.chi2).toBe(chi2(poly.points, poly.sigma, 0, 0, segsOf(out)))
    // The edge it came from is untouched.
    expect(edge.segments.length).toBe(2)
  })

  it('recovers the vertices the fit chose from the geometry', () => {
    const { edge, poly } = halvesEdge()
    expect(edgeVertices(edge, poly.points)).toEqual([0, 20, 40])
  })

  it('returns the edge itself for a forced vertex, a primitive or nothing to do', () => {
    const { edge, poly } = halvesEdge()
    expect(postFitPasses(edge, poly.points, poly.sigma, cfg, { forced: [20] })).toBe(edge)
    const prim: FittedEdge = { ...edge, primitive: { kind: 'circle', cx: 0, cy: 0, r: 1 } }
    expect(postFitPasses(prim, poly.points, poly.sigma, cfg)).toBe(prim)
    const single: FittedEdge = { ...edge, segments: [cub([6, 9, 17, 11, 24, 3])] }
    expect(postFitPasses(single, poly.points, poly.sigma, cfg)).toBe(single)
  })

  it('keeps a forced vertex a segment end, exactly where it was', () => {
    // A corner chamfered by a short cubic, the chamfer's start forced.
    const pts = new Float64Array([0, 0, 3, 0, 6, 0, 9, 0, 10, 1, 10, 4, 10, 7, 10, 10])
    const sigma = new Float64Array(8).fill(0.1)
    const edge: FittedEdge = {
      x0: 0,
      y0: 0,
      segments: [lineTo(9, 0), cub([9.55, 0, 10, 0.45, 10, 1]), lineTo(10, 10)],
      closed: false,
      params: 12,
      chi2: 0,
    }
    const free = postFitPasses(edge, pts, sigma, cfg)
    expect(segsOf(free).some((s) => s.x === 9 && s.y === 0)).toBe(false)
    const forced = postFitPasses(edge, pts, sigma, cfg, { forced: [3] })
    expect(segsOf(forced).some((s) => s.x === 9 && s.y === 0)).toBe(true)
    for (const out of [free, forced]) {
      expect([out.x0, out.y0]).toEqual([0, 0])
      const last = segsOf(out)[out.segments.length - 1]
      expect([last.x, last.y]).toEqual([10, 10])
    }
  })

  it('merges across a closed edge’s first point and keeps the ring closed', () => {
    // 64 points round a circle of radius 10, cut at point 12, drawn as eight
    // 45-degree cubics; two of the runs straddle point 0.
    const n = 64
    const pts = new Float64Array(2 * n)
    for (let k = 0; k < n; k++) {
      const a = (2 * Math.PI * k) / n
      pts[2 * k] = 10 * Math.cos(a)
      pts[2 * k + 1] = 10 * Math.sin(a)
    }
    const sigma = new Float64Array(n).fill(0.15)
    const arm = (4 / 3) * Math.tan(Math.PI / 16) * 10
    const segments: FitSegment[] = []
    const verts: number[] = []
    for (let q = 0; q < 8; q++) {
      const i = (12 + 8 * q) % n
      const j = (12 + 8 * (q + 1)) % n
      const a0 = (2 * Math.PI * i) / n
      const a1 = (2 * Math.PI * j) / n
      segments.push(
        cubicTo(
          pts[2 * i] - arm * Math.sin(a0),
          pts[2 * i + 1] + arm * Math.cos(a0),
          pts[2 * j] + arm * Math.sin(a1),
          pts[2 * j + 1] - arm * Math.cos(a1),
          pts[2 * j],
          pts[2 * j + 1],
        ),
      )
      verts.push(i)
    }
    verts.push(12)
    const edge: FittedEdge = {
      x0: pts[24],
      y0: pts[25],
      segments,
      closed: true,
      params: 50,
      chi2: 0,
    }
    expect(edgeVertices(edge, pts)).toEqual(verts)
    const out = postFitPasses(edge, pts, sigma, cfg, { vertices: verts })
    // Merged in place, on the loop opened at its cut, wrapping runs included.
    const wrappedOnly: FitPath = {
      x0: pts[24],
      y0: pts[25],
      segments: segments.slice(),
      closed: true,
    }
    mergeFreeCubics(wrappedOnly, polyline(pts, sigma, true), verts.slice(), cfg)
    expect(out.segments.length).toBeLessThan(wrappedOnly.segments.length)
    expect([out.x0, out.y0]).toEqual([pts[24], pts[25]])
    const last = segsOf(out)[out.segments.length - 1]
    expect([last.x, last.y]).toEqual([pts[24], pts[25]])
    expect(out.closed).toBe(true)
  })

  it('is deterministic', () => {
    const run = () => {
      const poly = roundedL()
      const v = [0, 2, 5, 9, 12, 14, 17, 20, 24, 28]
      const edge: FittedEdge = {
        x0: poly.points[0],
        y0: poly.points[1],
        segments: v.slice(1).map((i) => lineTo(...at(poly, i))),
        closed: false,
        params: 20,
        chi2: 0,
      }
      return withCostModel(STANDARD_COST_MODEL, () =>
        postFitPasses(edge, poly.points, poly.sigma, cfg, { smoothJoins: true, axisLines: true }),
      )
    }
    expect(run()).toEqual(run())
  })
})
