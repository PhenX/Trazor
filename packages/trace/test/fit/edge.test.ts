import { describe, expect, it } from 'vitest'
import type { FitConfig, FittedEdge, PlanarMap } from '../../src/planar/types'
import { fitConfig, OUTSIDE, syncNodes } from '../../src/planar/types'
import { costFloor, descriptionCost, primitiveOffer } from '../../src/fit/choice'
import { fitEdge, fitEdges, fitRun, shippingPostFit } from '../../src/fit/edge'
import type { FitSegment } from '../../src/fit/curves'
import { fitPolyline, optimalMultimodel } from '../../src/fit/multimodel'
import { polyline } from '../../src/fit/objective'
import type { FitPath } from '../../src/fit/objective'
import { handMap, labelsFrom, mapOfLabels } from '../solve/solve-helpers'
import { lcg } from './fit-helpers'

const CFG: FitConfig = fitConfig(128)
const SIGMA = 0.05

/** Gaussian deviates from a seeded generator (Box–Muller). */
function gaussian(seed: number): () => number {
  const u = lcg(seed)
  return () => Math.sqrt(-2 * Math.log(Math.max(u(), 1e-300))) * Math.cos(2 * Math.PI * u())
}

/** `n` points round `curve(t)`, `t = 2πk/n`, each moved by Gaussian noise of deviation `noise`. */
function ring(
  n: number,
  curve: (t: number) => [number, number],
  noise = 0,
  seed = 1,
): Float64Array {
  const g = gaussian(seed)
  const out = new Float64Array(2 * n)
  for (let k = 0; k < n; k++) {
    const [x, y] = curve((2 * Math.PI * k) / n)
    out[2 * k] = x + noise * g()
    out[2 * k + 1] = y + noise * g()
  }
  return out
}

/** A rounded rectangle's outline every `step` px of arc length, clockwise on screen from its top side. */
function roundRectRing(
  cx: number,
  cy: number,
  w: number,
  h: number,
  r: number,
  step: number,
  noise: number,
): Float64Array {
  const sw = w - 2 * r
  const sh = h - 2 * r
  const quarter = (Math.PI * r) / 2
  const total = 2 * (sw + sh) + 4 * quarter
  const n = Math.round(total / step)
  const g = gaussian(7)
  const out = new Float64Array(2 * n)
  const corners: [number, number][] = [
    [cx + sw / 2, cy - sh / 2],
    [cx + sw / 2, cy + sh / 2],
    [cx - sw / 2, cy + sh / 2],
    [cx - sw / 2, cy - sh / 2],
  ]
  const sides = [sw, sh, sw, sh]
  for (let k = 0; k < n; k++) {
    let s = (k * total) / n
    let x = 0
    let y = 0
    for (let q = 0; q < 4; q++) {
      // Side q, then the corner after it; side 0 runs right along the top.
      const [ax, ay] = corners[(q + 3) % 4]
      const dir = [
        [1, 0],
        [0, 1],
        [-1, 0],
        [0, -1],
      ][q]
      if (s <= sides[q]) {
        // The outward normal of a clockwise-on-screen side is (dy, −dx).
        x = ax + dir[0] * s + dir[1] * r
        y = ay + dir[1] * s - dir[0] * r
        break
      }
      s -= sides[q]
      if (s <= quarter) {
        const [ox, oy] = corners[q]
        const a = -Math.PI / 2 + (q * Math.PI) / 2 + s / r
        x = ox + r * Math.cos(a)
        y = oy + r * Math.sin(a)
        break
      }
      s -= quarter
    }
    out[2 * k] = x + noise * g()
    out[2 * k + 1] = y + noise * g()
  }
  return out
}

/** A map holding one closed edge with these points and σ. */
function closedEdgeMap(points: Float64Array, sigma = SIGMA): PlanarMap {
  const map = handMap(64, 64, [{ points: Array.from(points), left: 1, right: 0, closed: true }], [])
  map.edges[0].sigma.fill(sigma)
  return map
}

/** An edge's segments as the fit writes them: `L`, `C` and `A`, each with an end point. */
function segmentsOf(fit: FittedEdge): FitSegment[] {
  return fit.segments as FitSegment[]
}

/** The end of an edge's path. */
function endOf(fit: FittedEdge): [number, number] {
  const segs = segmentsOf(fit)
  const last = segs[segs.length - 1]
  return [last.x, last.y]
}

const blob = (t: number): [number, number] => {
  const r = 12 + 2.5 * Math.cos(3 * t) + 1.2 * Math.sin(2 * t)
  return [40 + r * Math.cos(t), 40 + r * Math.sin(t)]
}

const star = (t: number): [number, number] => {
  const r = 12 + 4 * Math.cos(5 * t)
  return [40 + r * Math.cos(t), 40 + r * Math.sin(t)]
}

describe('fitEdge on closed edges', () => {
  it('fits a ring sampled from a circle as a circle', () => {
    const map = closedEdgeMap(
      ring(72, (t) => [31.4 + 10.3 * Math.cos(t), 30.2 + 10.3 * Math.sin(t)], 0.03),
    )
    const fit = fitEdge(map, 0, CFG)
    expect(fit.primitive?.kind).toBe('circle')
    const c = fit.primitive as Extract<FittedEdge['primitive'], { kind: 'circle' }>
    expect(Math.abs(c.r - 10.3)).toBeLessThan(0.03)
    expect(Math.hypot(c.cx - 31.4, c.cy - 30.2)).toBeLessThan(0.03)
    expect(fit.params).toBe(3)
    expect(fit.closed).toBe(true)
    expect(fit.segments.every((s) => s.type === 'A')).toBe(true)
    expect(endOf(fit)).toEqual([fit.x0, fit.y0])
    // The start lies on the circle.
    expect(Math.hypot(fit.x0 - c.cx, fit.y0 - c.cy)).toBeCloseTo(c.r, 9)
  })

  it('fits a rounded rectangle as a rect with its corner radius', () => {
    const map = closedEdgeMap(roundRectRing(32.5, 28.25, 30, 20, 4, 0.8, 0.03))
    const fit = fitEdge(map, 0, CFG)
    expect(fit.primitive?.kind).toBe('rect')
    const rr = fit.primitive as Extract<FittedEdge['primitive'], { kind: 'rect' }>
    expect(Math.abs(rr.r - 4)).toBeLessThan(0.15)
    expect(Math.abs(rr.w - 30)).toBeLessThan(0.1)
    expect(Math.abs(rr.h - 20)).toBeLessThan(0.1)
    expect(Math.hypot(rr.cx - 32.5, rr.cy - 28.25)).toBeLessThan(0.05)
    expect(rr.rotation).toBe(0)
    expect(fit.params).toBe(6)
    expect(endOf(fit)).toEqual([fit.x0, fit.y0])
  })

  it('fits a blob as segments', () => {
    const map = closedEdgeMap(ring(90, blob, 0.03))
    const e = map.edges[0]
    // The program cuts the ring away from its first point.
    expect(optimalMultimodel(polyline(e.points, e.sigma, true), CFG).vertices[0]).not.toBe(0)
    const fit = fitEdge(map, 0, CFG)
    expect(fit.primitive).toBeUndefined()
    expect(fit.closed).toBe(true)
    expect(fit.segments.length).toBeGreaterThan(2)
    expect(endOf(fit)).toEqual([fit.x0, fit.y0])
    expect(fit.params).toBeGreaterThan(6)
  })

  it('comes back as segments when a primitive passes but the curve is cheaper, its cut away from point 0', () => {
    // An egg within a few percent of an ellipse: the ellipse passes the gate
    // but the curve describes the ring more cheaply. The program cuts the ring
    // at point 58, so its χ² must be read from there.
    const points = ring(90, (t) => [
      40.3 + 12 * Math.cos(t) * (1 + 0.05 * Math.cos(t)),
      40.7 + 10 * Math.sin(t),
    ])
    const map = closedEdgeMap(points)
    const e = map.edges[0]
    expect(optimalMultimodel(polyline(e.points, e.sigma, true), CFG).vertices[0]).not.toBe(0)
    const offer = primitiveOffer(e.points, e.sigma, true, CFG)
    expect(offer?.primitive?.kind).toBe('ellipse')
    const fit = fitEdge(map, 0, CFG)
    expect(fit.primitive).toBeUndefined()
    expect(fit.segments.length).toBeGreaterThan(1)
    expect(descriptionCost(fit, CFG)).toBeLessThan(offer!.cost)
  })

  it('runs the shipping post-fit passes inside the program', () => {
    const points = ring(90, blob, 0.03)
    const sigma = new Float64Array(90).fill(SIGMA)
    const fit = fitEdge(closedEdgeMap(points), 0, CFG)
    const plain = fitPolyline(points, sigma, true, CFG)
    expect(fit).toEqual(fitPolyline(points, sigma, true, CFG, { postFit: shippingPostFit }))
    // The free-cubic merge removes segments the plain program kept, and the cost falls.
    expect(fit.segments.length).toBeLessThan(plain.segments.length)
    expect(descriptionCost(fit, CFG)).toBeLessThan(descriptionCost(plain, CFG))
  })

  it('does not depend on where a closed edge lists its first point', () => {
    for (const [curve, n] of [
      [blob, 90],
      [star, 120],
    ] as const) {
      const base = ring(n, curve)
      const describeFit = (fit: FittedEdge): string[] =>
        segmentsOf(fit)
          .map((s) => `${s.type} ${s.x.toFixed(6)} ${s.y.toFixed(6)}`)
          .toSorted()
      const want = fitEdge(closedEdgeMap(base), 0, CFG)
      for (const shift of [13, 37, 61]) {
        const rotated = new Float64Array(2 * n)
        for (let k = 0; k < n; k++) {
          rotated[2 * k] = base[2 * ((k + shift) % n)]
          rotated[2 * k + 1] = base[2 * ((k + shift) % n) + 1]
        }
        const got = fitEdge(closedEdgeMap(rotated), 0, CFG)
        expect(got.params).toBe(want.params)
        expect(got.chi2).toBeCloseTo(want.chi2, 6)
        expect(describeFit(got)).toEqual(describeFit(want))
      }
    }
  })

  it('keeps forced vertices and considers no primitive', () => {
    const points = ring(72, (t) => [31.4 + 10.3 * Math.cos(t), 30.2 + 10.3 * Math.sin(t)], 0.03)
    const map = closedEdgeMap(points)
    const fit = fitEdge(map, 0, CFG, { forced: [5, 40] })
    expect(fit.primitive).toBeUndefined()
    expect(fit.closed).toBe(true)
    expect(endOf(fit)).toEqual([fit.x0, fit.y0])
    // Cut at the first pin; the second is a segment end too, both on the measured points.
    const ends = [[fit.x0, fit.y0], ...segmentsOf(fit).map((s) => [s.x, s.y])]
    for (const k of [5, 40]) {
      expect(ends.some(([x, y]) => x === points[2 * k] && y === points[2 * k + 1])).toBe(true)
    }
    const sigma = new Float64Array(72).fill(SIGMA)
    expect(fit).toEqual(
      fitPolyline(points, sigma, true, CFG, { forced: [5, 40], postFit: shippingPostFit }),
    )
  })
})

describe('fitEdge on the image frame', () => {
  it('describes the frame as its rectangle, proved cheapest without the program', () => {
    const map = mapOfLabels(
      labelsFrom(24, 16, (x, y) => (x >= 6 && x < 15 && y >= 4 && y < 11 ? 1 : 0)),
    )
    const k = map.edges.findIndex((e) => e.left === OUTSIDE || e.right === OUTSIDE)
    const e = map.edges[k]
    expect(e.closed).toBe(true)
    // The skip condition of `describe`: the rectangle is below the floor of every path.
    const offer = primitiveOffer(e.points, e.sigma, true, CFG)
    expect(offer!.cost).toBeLessThan(costFloor(e.points, e.sigma, CFG))
    const fit = fitEdge(map, k, CFG)
    const rect = fit.primitive as Extract<FittedEdge['primitive'], { kind: 'rect' }>
    expect(rect.kind).toBe('rect')
    expect(rect.cx).toBeCloseTo(12, 9)
    expect(rect.cy).toBeCloseTo(8, 9)
    expect(rect.w).toBeCloseTo(24, 9)
    expect(rect.h).toBeCloseTo(16, 9)
    expect(rect.r).toBe(0)
    expect(rect.rotation).toBe(0)
    expect(fit.params).toBe(4)
    expect(fit.segments.every((s) => s.type === 'L')).toBe(true)
    expect(endOf(fit)).toEqual([fit.x0, fit.y0])
  })
})

describe('fitEdge on open edges', () => {
  /** Three faces meeting in a T, nodes moved off the lattice as the junction stage moves them. */
  function threeFaces(): PlanarMap {
    const map = mapOfLabels(labelsFrom(20, 14, (x, y) => (x < 8 ? 0 : y < 6 ? 1 : 2)))
    // Frame nodes slide along the frame; the inner junction moves freely.
    for (const node of map.nodes) {
      if (node.y === 0 || node.y === 14) node.x += 0.37
      else if (node.x === 20) node.y -= 0.21
      else {
        node.x += 0.29
        node.y -= 0.13
      }
    }
    return map
  }

  it('ends exactly on its nodes', () => {
    const map = threeFaces()
    syncNodes(map)
    expect(map.edges.some((e) => !e.closed)).toBe(true)
    map.edges.forEach((e, k) => {
      if (e.closed) return
      const fit = fitEdge(map, k, CFG)
      expect(fit.closed).toBe(false)
      expect([fit.x0, fit.y0]).toEqual([map.nodes[e.start].x, map.nodes[e.start].y])
      expect(endOf(fit)).toEqual([map.nodes[e.end].x, map.nodes[e.end].y])
    })
  })

  it("ends on its nodes' positions even when its own end points lag behind them", () => {
    const map = threeFaces()
    const before = map.edges.map((e) => e.points.slice())
    map.edges.forEach((e, k) => {
      if (e.closed) return
      const fit = fitEdge(map, k, CFG)
      expect([fit.x0, fit.y0]).toEqual([map.nodes[e.start].x, map.nodes[e.start].y])
      expect(endOf(fit)).toEqual([map.nodes[e.end].x, map.nodes[e.end].y])
    })
    // The map is read, never written.
    map.edges.forEach((e, k) => expect(e.points).toEqual(before[k]))
  })

  it('ends exactly on its nodes along a curve', () => {
    // A half circle between two nodes, sampled with noise.
    const g = gaussian(3)
    const pts: number[] = []
    const n = 50
    for (let k = 0; k < n; k++) {
      const t = Math.PI + (Math.PI * k) / (n - 1)
      const noise = k === 0 || k === n - 1 ? 0 : 0.03
      pts.push(30 + 12 * Math.cos(t) + noise * g(), 30 + 12 * Math.sin(t) + noise * g())
    }
    const map = handMap(
      64,
      64,
      [{ points: pts, left: 0, right: 1, start: 0, end: 1 }],
      [
        [pts[0], pts[1]],
        [pts[2 * n - 2], pts[2 * n - 1]],
      ],
    )
    map.edges[0].sigma.fill(SIGMA)
    const fit = fitEdge(map, 0, CFG)
    expect(fit.primitive).toBeUndefined()
    expect([fit.x0, fit.y0]).toEqual([pts[0], pts[1]])
    expect(endOf(fit)).toEqual([pts[2 * n - 2], pts[2 * n - 1]])
    // A few segments, not one per point.
    expect(fit.segments.length).toBeLessThanOrEqual(4)
  })

  it('keeps a forced vertex as a segment end', () => {
    const n = 20
    const pts: number[] = []
    for (let k = 0; k < n; k++) pts.push(k, 0.5 * k + 0.03 * Math.sin(1.7 * k))
    const map = handMap(
      32,
      32,
      [{ points: pts, left: 0, right: 1, start: 0, end: 1 }],
      [
        [pts[0], pts[1]],
        [pts[2 * n - 2], pts[2 * n - 1]],
      ],
    )
    map.edges[0].sigma.fill(0.1)
    expect(fitEdge(map, 0, CFG).segments.length).toBe(1)
    const pinned = fitEdge(map, 0, CFG, { forced: [10] })
    expect(pinned.segments.length).toBe(2)
    expect(pinned.segments[0].type).toBe('L')
    expect((pinned.segments[0] as { x: number }).x).toBeCloseTo(10, 6)
    expect(endOf(pinned)).toEqual([pts[2 * n - 2], pts[2 * n - 1]])
    // Forcing only the ends is no constraint.
    expect(fitEdge(map, 0, CFG, { forced: [0, n - 1] })).toEqual(fitEdge(map, 0, CFG))
  })
})

describe('fitEdges', () => {
  it('fits every edge as fitEdge does, with its own λ scale', () => {
    const map = mapOfLabels(
      labelsFrom(28, 20, (x, y) => {
        if (Math.hypot(x + 0.5 - 9, y + 0.5 - 10) < 6) return 1
        return x < 18 ? 0 : 2
      }),
    )
    const scales = map.edges.map((_, k) => 1 + (k % 3))
    const all = fitEdges(map, CFG, { lambdaScales: scales })
    expect(all.length).toBe(map.edges.length)
    all.forEach((fit, k) => expect(fit).toEqual(fitEdge(map, k, CFG, { lambdaScale: scales[k] })))
    expect(fitEdges(map, CFG)).toEqual(map.edges.map((_, k) => fitEdge(map, k, CFG)))
  })

  it('spends no more parameters at a higher λ', () => {
    const n = 60
    const pts: number[] = []
    for (let k = 0; k < n; k++) pts.push(k * 0.5, 10 + 1.2 * Math.sin(k * 0.35))
    const map = handMap(
      40,
      24,
      [{ points: pts, left: 0, right: 1, start: 0, end: 1 }],
      [
        [pts[0], pts[1]],
        [pts[2 * n - 2], pts[2 * n - 1]],
      ],
    )
    map.edges[0].sigma.fill(0.05)
    let last = Infinity
    for (const lambdaScale of [0.25, 1, 4, 16]) {
      const fit = fitEdge(map, 0, CFG, { lambdaScale })
      expect(fit.params).toBeLessThanOrEqual(last)
      last = fit.params
    }
    expect(fitEdge(map, 0, CFG, { lambdaScale: 2 })).toEqual(
      fitEdge(map, 0, { tau: CFG.tau, lambda: 2 * CFG.lambda }),
    )
  })

  it('is deterministic', () => {
    const build = () =>
      mapOfLabels(
        labelsFrom(32, 24, (x, y) => {
          if (Math.hypot(x + 0.5 - 10, y + 0.5 - 12) < 7) return 1
          if (x > 18 && y > 4 && y < 18) return 2
          return 0
        }),
      )
    const a = fitEdges(build(), CFG)
    const b = fitEdges(build(), CFG)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('fitRun', () => {
  it('pins both ends of an open run exactly, with per-point σ', () => {
    const n = 40
    const points = new Float64Array(2 * n)
    const sigma = new Float64Array(n)
    const g = gaussian(9)
    for (let k = 0; k < n; k++) {
      points[2 * k] = 3.1 + 0.7 * k + 0.02 * g()
      points[2 * k + 1] = 5.3 + 4 * Math.sin(0.12 * k) + 0.02 * g()
      sigma[k] = 0.05 + 0.1 * (k % 3)
    }
    const fit = fitRun(points, sigma, CFG)
    expect(fit.closed).toBe(false)
    expect(fit.primitive).toBeUndefined()
    expect([fit.x0, fit.y0]).toEqual([points[0], points[1]])
    expect(endOf(fit)).toEqual([points[2 * n - 2], points[2 * n - 1]])
    expect(fit).toEqual(fitPolyline(points, sigma, false, CFG, { postFit: shippingPostFit }))
  })
})

describe('shippingPostFit', () => {
  it('leaves the path it is handed untouched', () => {
    // A chamfered square corner, as the program draws it: line, short cubic, line.
    const pts: number[] = []
    for (let k = 0; k <= 15; k++) pts.push(k, 0)
    pts.push(15.6, 0.4)
    for (let k = 1; k <= 16; k++) pts.push(16, k)
    const n = pts.length / 2
    const poly = polyline(Float64Array.from(pts), new Float64Array(n).fill(0.02), false)
    const path: FitPath = {
      x0: 0,
      y0: 0,
      segments: [
        { type: 'L', x: 15, y: 0 },
        { type: 'C', x1: 15.4, y1: 0, x2: 16, y2: 0.6, x: 16, y: 1 },
        { type: 'L', x: 16, y: 16 },
      ],
      closed: false,
    }
    const snapshot = JSON.stringify(path)
    const out = shippingPostFit(path, poly, [0, 15, 17, n - 1], CFG, null)
    expect(JSON.stringify(path)).toBe(snapshot)
    // The chamfer is sharpened into the corner the two lines meet at.
    expect(out.segments.map((s) => s.type)).toEqual(['L', 'L'])
    expect(out.segments[0]).toEqual({ type: 'L', x: 16, y: 0 })
    expect(out.segments[1]).toEqual({ type: 'L', x: 16, y: 16 })
    expect(out.closed).toBe(false)
  })

  it("sharpens a closed ring's chamfers as a ring, the one at the program's cut included", () => {
    // A 20 px square with every corner cut by a 1 px chamfer, sampled every 0.5 px.
    const [x0, y0, s, c] = [10.2, 10.6, 20, 1]
    const corners = [
      [x0 + c, y0],
      [x0 + s - c, y0],
      [x0 + s, y0 + c],
      [x0 + s, y0 + s - c],
      [x0 + s - c, y0 + s],
      [x0 + c, y0 + s],
      [x0, y0 + s - c],
      [x0, y0 + c],
    ]
    const pts: number[] = []
    for (let i = 0; i < 8; i++) {
      const [ax, ay] = corners[i]
      const [bx, by] = corners[(i + 1) % 8]
      const m = Math.max(1, Math.round(Math.hypot(bx - ax, by - ay) / 0.5))
      for (let k = 0; k < m; k++) pts.push(ax + ((bx - ax) * k) / m, ay + ((by - ay) * k) / m)
    }
    const square = [
      [x0, y0],
      [x0 + s, y0],
      [x0 + s, y0 + s],
      [x0, y0 + s],
    ]
    const n = pts.length / 2
    for (const shift of [0, 5, 17]) {
      const points = new Float64Array(2 * n)
      for (let k = 0; k < n; k++) {
        points[2 * k] = pts[2 * ((k + shift) % n)]
        points[2 * k + 1] = pts[2 * ((k + shift) % n) + 1]
      }
      const sigma = new Float64Array(n).fill(SIGMA)
      const plain = fitPolyline(points, sigma, true, CFG)
      expect(plain.segments.length).toBe(8)
      const fit = fitPolyline(points, sigma, true, CFG, { postFit: shippingPostFit })
      expect(fit.closed).toBe(true)
      expect(fit.segments.map((q) => q.type)).toEqual(['L', 'L', 'L', 'L'])
      expect(endOf(fit)).toEqual([fit.x0, fit.y0])
      for (const q of segmentsOf(fit)) {
        const d = Math.min(...square.map(([x, y]) => Math.hypot(q.x - x, q.y - y)))
        expect(d).toBeLessThan(1e-6)
      }
    }
  })
})
