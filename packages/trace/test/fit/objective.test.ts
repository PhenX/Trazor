import { describe, expect, it } from 'vitest'
import { fitConfig } from '../../src/planar/types'
import { chi2, circularArc, cubicTo, lineTo, maxDeviation, sampleRun } from '../../src/fit/curves'
import type { FitSegment } from '../../src/fit/curves'
import type { FitPath, Polyline } from '../../src/fit/objective'
import {
  adjustVertices,
  adjustVerticesAt,
  arcLengths,
  farthestFromCentroid,
  fittedEdge,
  lineDistance,
  maxNormalizedDeviation,
  MIN_SIGMA,
  optimalPolygon,
  pathChi2,
  pathCost,
  pathEnd,
  pathMaxDeviation,
  pathParams,
  pinEnd,
  polyline,
  PrefixSums,
  reversePath,
  segmentCost,
  spansLoop,
  translatePath,
  uniformPolyline,
} from '../../src/fit/objective'
import { circlePoints, flat, lcg, near, run } from './fit-helpers'

const cfg1 = { tau: 2, lambda: 1 }

/** Points of a straight line, `n` of them from `(x0, y0)` to `(x1, y1)`. */
function line(n: number, x0: number, y0: number, x1: number, y1: number): [number, number][] {
  return run([x0, y0], [x1, y1], n - 1)
}

/** Exhaustive minimum of the line objective over every segmentation of an open polyline. */
function bruteForceMin(poly: Polyline, cfg: { tau: number; lambda: number }): number {
  const n = poly.points.length / 2
  const interior = n - 2
  let best = Infinity
  for (let mask = 0; mask < 1 << interior; mask++) {
    const verts = [0]
    for (let b = 0; b < interior; b++) if (mask & (1 << b)) verts.push(b + 1)
    verts.push(n - 1)
    let total = 0
    for (let q = 0; q + 1 < verts.length; q++)
      total += segmentCost(poly, verts[q], verts[q + 1], cfg)
    best = Math.min(best, total)
  }
  return best
}

/** Smooth low-frequency displacement, as a boundary perturbation would be. */
function perturbSmooth(pts: [number, number][], amplitude: number, seed: number) {
  const phase = seed * 0.7
  return pts.map(([x, y], k): [number, number] => {
    const t = k * 0.35 + phase
    return [
      x + amplitude * (Math.sin(t) + 0.5 * Math.sin(2.3 * t)),
      y + amplitude * (Math.cos(t) + 0.5 * Math.cos(1.7 * t)),
    ]
  })
}

describe('polyline', () => {
  it('clamps σ, insists on one σ per point and measures arc length', () => {
    const p = polyline([0, 0, 3, 4, 3, 10], [0, 0.5, -1], false)
    expect([...p.sigma]).toEqual([MIN_SIGMA, 0.5, MIN_SIGMA])
    expect(() => polyline([0, 0, 1, 1], [0.1], false)).toThrow('sigma must be per-point')
    expect([...arcLengths(p.points)]).toEqual([0, 5, 11])
    expect([...uniformPolyline([0, 0, 1, 1], 0.3, true).sigma]).toEqual([0.3, 0.3])
  })
})

describe('PrefixSums.chi2Line', () => {
  it('is the weighted total-least-squares residual, against brute force', () => {
    const rnd = lcg(1)
    for (let c = 0; c < 40; c++) {
      const n = 3 + Math.floor(rnd() * 30)
      const angle = rnd() * Math.PI
      const pts: [number, number][] = []
      const sigma: number[] = []
      for (let k = 0; k < n; k++) {
        const t = 20 * rnd() - 10
        const off = 0.5 * (rnd() - 0.5)
        pts.push([
          50 + t * Math.cos(angle) - off * Math.sin(angle),
          -30 + t * Math.sin(angle) + off * Math.cos(angle),
        ])
        sigma.push(0.05 + rnd())
      }
      const poly = polyline(flat(pts), sigma, false)
      const pre = new PrefixSums(poly.points, poly.sigma)
      const i = Math.floor(rnd() * (n - 2))
      const j = i + 2 + Math.floor(rnd() * (n - i - 2))
      // The best line passes through the weighted centroid; search its direction.
      let w = 0
      let mx = 0
      let my = 0
      for (let k = i; k <= j; k++) {
        const wk = 1 / (sigma[k] * sigma[k])
        w += wk
        mx += wk * pts[k][0]
        my += wk * pts[k][1]
      }
      mx /= w
      my /= w
      const resid = (phi: number) => {
        let sum = 0
        for (let k = i; k <= j; k++) {
          const d = -(pts[k][0] - mx) * Math.sin(phi) + (pts[k][1] - my) * Math.cos(phi)
          sum += (d * d) / (sigma[k] * sigma[k])
        }
        return sum
      }
      let best = Infinity
      let bestPhi = 0
      for (let s = 0; s < 3600; s++) {
        const phi = (s / 3600) * Math.PI
        if (resid(phi) < best) {
          best = resid(phi)
          bestPhi = phi
        }
      }
      for (let h = Math.PI / 3600; h > 1e-12; h /= 2) {
        for (const phi of [bestPhi - h, bestPhi + h]) {
          if (resid(phi) < best) {
            best = resid(phi)
            bestPhi = phi
          }
        }
      }
      const got = pre.chi2Line(i, j)
      expect(got).toBeLessThanOrEqual(best + 1e-9 * Math.max(1, best))
      expect(near(got, best, 1e-6)).toBe(true)
    }
  })

  it('is zero for one point and for exactly collinear points', () => {
    const p = uniformPolyline(flat(line(10, 0, 0, 9, 4.5)), 0.1, false)
    const pre = new PrefixSums(p.points, p.sigma)
    expect(pre.chi2Line(3, 3)).toBe(0)
    expect(pre.chi2Line(0, 9)).toBeLessThan(1e-9)
  })
})

describe('optimalPolygon', () => {
  it('matches exhaustive search on small inputs', () => {
    const cases: [number, number][][] = [
      line(10, 0, 0, 20, 6),
      circlePoints(12, 0, 0, 10),
      [...line(6, 0, 0, 10, 0), ...line(6, 10, 0, 10, 10)],
      Array.from({ length: 12 }, (_, k): [number, number] => [k, Math.floor(k / 3)]),
    ]
    for (const pts of cases) {
      const poly = uniformPolyline(flat(pts), 0.5, false)
      const got = optimalPolygon(poly, cfg1)
      expect(Math.abs(got.cost - bruteForceMin(poly, cfg1))).toBeLessThan(1e-9)
    }
  })

  it('collapses a straight line to one segment', () => {
    const poly = uniformPolyline(flat(line(50, 0, 0, 100, 37)), 0.5, false)
    expect(optimalPolygon(poly, fitConfig(256)).vertices).toEqual([0, 49])
  })

  it('finds a corner exactly', () => {
    const pts = [...line(20, 0, 0, 10, 0), ...line(21, 10, 0, 10, 10)]
    const seg = optimalPolygon(uniformPolyline(flat(pts), 0.2, false), cfg1)
    expect(seg.vertices).toHaveLength(3)
    expect(seg.vertices[1]).toBe(19)
  })

  it('straightens a shallow staircase', () => {
    const pts = Array.from({ length: 60 }, (_, k): [number, number] => [k, Math.round(k * 0.2)])
    const seg = optimalPolygon(uniformPolyline(flat(pts), 0.5, false), cfg1)
    expect(seg.vertices.length - 1).toBeLessThanOrEqual(2)
  })

  it('keeps every chord within the τσ it promises', () => {
    const poly = uniformPolyline(flat(circlePoints(200, 0, 0, 50)), 0.4, false)
    const seg = optimalPolygon(poly, cfg1)
    expect(maxNormalizedDeviation(poly, seg)).toBeLessThanOrEqual(cfg1.tau + 1e-9)
  })

  it('simplifies a less certain boundary harder, and only where it is uncertain', () => {
    const pts = flat(circlePoints(400, 0, 0, 80))
    const tight = optimalPolygon(uniformPolyline(pts, 0.05, false), cfg1)
    const loose = optimalPolygon(uniformPolyline(pts, 0.8, false), cfg1)
    expect(loose.vertices.length).toBeLessThan(tight.vertices.length)
    const n = 240
    const sigma = Array.from({ length: n }, (_, k) => (k < n / 2 ? 0.05 : 1.5))
    const seg = optimalPolygon(polyline(flat(circlePoints(n, 0, 0, 60)), sigma, false), cfg1)
    const confident = seg.vertices.filter((i) => i < n / 2).length
    const faint = seg.vertices.filter((i) => i >= n / 2).length
    expect(confident).toBeGreaterThan(2 * faint)
  })

  it('does not split long straight edges by its search cut-off', () => {
    for (const sides of [4, 5, 6, 8]) {
      const pts: [number, number][] = []
      const r = 50
      for (let k = 0; k < sides; k++) {
        const a0 = (2 * Math.PI * k) / sides
        const a1 = (2 * Math.PI * (k + 1)) / sides
        const p0 = [r * Math.cos(a0), r * Math.sin(a0)]
        const p1 = [r * Math.cos(a1), r * Math.sin(a1)]
        for (let i = 0; i < 48; i++) {
          const t = i / 48
          const jitter = 0.05 * Math.sin(i * 2.399)
          const dx = p1[0] - p0[0]
          const dy = p1[1] - p0[1]
          const len = Math.max(Math.hypot(dx, dy), 1e-9)
          pts.push([p0[0] + dx * t - (dy / len) * jitter, p0[1] + dy * t + (dx / len) * jitter])
        }
      }
      const n = pts.length
      const perEdge = n / sides
      const sigma = Array.from({ length: n }, (_, k) =>
        k % perEdge < 2 || k % perEdge > perEdge - 3 ? 0.35 : 0.05,
      )
      const seg = optimalPolygon(polyline(flat(pts), sigma, false), fitConfig(256))
      expect(seg.vertices.length - 1).toBeLessThanOrEqual(sides + 1)
    }
  })

  it('keeps its segment count under smooth boundary noise', () => {
    const base = circlePoints(300, 0, 0, 90)
    const clean = optimalPolygon(uniformPolyline(flat(base), 0.5, false), cfg1).vertices.length - 1
    const growths: number[] = []
    for (let seed = 0; seed < 8; seed++) {
      const noisy = uniformPolyline(flat(perturbSmooth(base, 0.125, seed)), 0.5, false)
      growths.push(((optimalPolygon(noisy, cfg1).vertices.length - 1) / clean - 1) * 100)
    }
    growths.sort((a, b) => a - b)
    expect(growths[growths.length >> 1]).toBeLessThan(5)
  })

  it('survives degenerate input', () => {
    expect(optimalPolygon(uniformPolyline([], 0.5, false), fitConfig(256))).toEqual({
      vertices: [],
      cost: 0,
    })
    expect(optimalPolygon(uniformPolyline([1, 1], 0.5, false), fitConfig(256)).vertices).toEqual([
      0,
    ])
    expect(
      optimalPolygon(uniformPolyline([1, 1, 2, 2], 0.5, false), fitConfig(256)).vertices,
    ).toEqual([0, 1])
    const same = optimalPolygon(uniformPolyline(new Array(16).fill(3), 0.5, false), fitConfig(256))
    expect(same.vertices[0]).toBe(0)
    expect(same.vertices[same.vertices.length - 1]).toBe(7)
  })

  it('cuts a closed loop and returns valid indices with the cut at both ends', () => {
    const poly = uniformPolyline(flat(circlePoints(120, 5, 5, 40)), 0.3, true)
    const seg = optimalPolygon(poly, fitConfig(256))
    expect(seg.vertices.length - 1).toBeGreaterThanOrEqual(3)
    expect(seg.vertices.every((i) => i >= 0 && i < 120)).toBe(true)
    expect(seg.vertices[0]).toBe(seg.vertices[seg.vertices.length - 1])
  })

  it('gives the segmentation inkvec gives', () => {
    const rnd = lcg(7)
    const pts: [number, number][] = []
    const sigma: number[] = []
    for (let k = 0; k < 21; k++) {
      const x = 0.5 * k
      pts.push([x, 0.02 * x * x + 0.05 * (rnd() - 0.5)])
      sigma.push(0.1 + 0.05 * (k % 3))
    }
    const seg = optimalPolygon(polyline(flat(pts), sigma, false), cfg1)
    expect(seg.vertices).toEqual([0, 11, 20])
    expect(near(seg.cost, 5.49210560836724, 1e-12)).toBe(true)

    const ring = noisyRing()
    const rseg = optimalPolygon(ring, { tau: 2, lambda: 4 })
    expect(rseg.vertices).toEqual([47, 0, 9, 14, 18, 21, 24, 27, 30, 34, 39, 47])
    expect(near(rseg.cost, 115.03410095477079, 1e-12)).toBe(true)
    const adj = adjustVertices(ring, rseg.vertices, 0.75)
    const want = [
      -11.402620296787987, 16.8006555071456, -11.976745324932457, -16.445172238762535,
      -4.614776988502746, -19.74947467458082, 3.503598721359046, -20.081426525821428,
      11.972750635888552, -15.976283136501939, 17.889419778039297, -9.472784987470916,
      20.295837715163323, -0.07728597170031648, 17.90517876550255, 9.400849156293818,
      11.987100209912292, 16.03911765766383, 3.665256891607017, 20.00347448799391,
      -4.337649238008678, 19.82644996932249, -11.402620296787987, 16.8006555071456,
    ]
    want.forEach((v, k) => expect(near(adj[k], v, 1e-9)).toBe(true))
  })
})

/** 48 points of a noisy circle of radius 20 by the rational parametrization, closed. */
function noisyRing(): Polyline {
  const rnd = lcg(5)
  const pts: [number, number][] = []
  for (let k = 0; k < 48; k++) {
    const t = (k - 24) / 12
    const d = 1 + t * t
    const x = 20 * ((1 - t * t) / d) + 0.1 * (rnd() - 0.5)
    const y = 20 * ((2 * t) / d) + 0.1 * (rnd() - 0.5)
    pts.push([x, y])
  }
  return uniformPolyline(flat(pts), 0.2, true)
}

describe('corners', () => {
  /** An L whose corner sample is cut off by a chamfer: the vertical edge at x = `x`. */
  function chamferedL(x: number): Polyline {
    const pts = [
      ...run([0, 0], [10, 0], 10),
      ...Array.from({ length: 10 }, (_, k): [number, number] => [x, k + 1]),
    ]
    return uniformPolyline(flat(pts), 0.05, false)
  }

  it('move to the intersection of the fitted lines only within reach', () => {
    // 3·max(σ, 0.25) plus a right angle's chamfer allowance 1/sin 45°: 0.75 + 1.414 px.
    const near1 = adjustVerticesAt(chamferedL(11), [0, 10, 20], 0.75, () => true)
    expect([...near1]).toEqual([0, 0, 11, 0, 11, 10])
    const far = adjustVerticesAt(chamferedL(13), [0, 10, 20], 0.75, () => true)
    expect([far[2], far[3]]).toEqual([10, 0])
    // Unselected corners stay where they were measured.
    const none = adjustVerticesAt(chamferedL(11), [0, 10, 20], 0.75, () => false)
    expect([none[2], none[3]]).toEqual([10, 0])
  })

  it('wrap round an opened loop, moving only the corners asked for', () => {
    const c: [number, number][] = [
      [0, 0],
      [20, 0],
      [20, 20],
      [0, 20],
    ]
    const pts: [number, number][] = []
    for (let e = 0; e < 4; e++) pts.push(...run(c[e], c[(e + 1) % 4], 20).slice(0, 20))
    pts[0] = [0.5, 0.5]
    pts[20] = [19.5, 0.5]
    pts.push(pts[0])
    const poly = uniformPolyline(flat(pts), 0.05, true)
    const v = [0, 20, 40, 60, 80]
    expect(spansLoop(poly, v)).toBe(true)
    // Segments 0–2 are lines, 3 a curve: only line–line joins are corners.
    const lineSeg = [true, true, true, false]
    const pos = adjustVerticesAt(poly, v, 0.75, (k) => lineSeg[(k + 3) % 4] && lineSeg[k % 4])
    expect([pos[0], pos[1]]).toEqual([0.5, 0.5])
    expect(Math.hypot(pos[2] - 20, pos[3])).toBeLessThan(1e-9)
    expect(Math.hypot(pos[4] - 20, pos[5] - 20)).toBeLessThan(1e-9)
    expect([pos[8], pos[9]]).toEqual([pos[0], pos[1]])
  })

  it('recognize a loop by index or by coincident cut points', () => {
    const closed = uniformPolyline(flat(circlePoints(8, 0, 0, 5)), 0.1, true)
    expect(spansLoop(closed, [3, 6, 3])).toBe(true)
    expect(spansLoop(closed, [0, 7])).toBe(false)
    expect(spansLoop(closed, [3])).toBe(false)
    const open = uniformPolyline(flat(circlePoints(8, 0, 0, 5)), 0.1, false)
    expect(spansLoop(open, [3, 6, 3])).toBe(false)
  })

  it('pick the farthest point from the centroid as the cut', () => {
    const pts = flat([
      [0, 0],
      [1, 0],
      [5, 1],
      [1, 1],
    ])
    expect(farthestFromCentroid(pts)).toBe(2)
  })
})

describe('deviation', () => {
  it('measures to the chord line in σ units', () => {
    expect(lineDistance({ x: 5, y: 3 }, { x: 0, y: 0 }, { x: 10, y: 0 })).toBe(3)
    expect(lineDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 })).toBe(5)
    const poly = polyline([0, 0, 5, 0.2, 10, 0], [0.1, 0.1, 0.1], false)
    expect(maxNormalizedDeviation(poly, { vertices: [0, 2], cost: 0 })).toBeCloseTo(2, 12)
    expect(maxNormalizedDeviation(poly, { vertices: [0, 1, 2], cost: 0 })).toBe(0)
  })
})

describe('fitted paths', () => {
  const segs: FitSegment[] = [
    lineTo(10, 0),
    cubicTo(10, 3, 12, 6, 15, 9),
    circularArc(5, false, true, 20, 14),
  ]
  const path: FitPath = { x0: 0, y0: 0, segments: segs, closed: false }

  it('count the start point once and every segment', () => {
    expect(pathParams(path)).toBe(2 + 2 + 6 + 5)
    expect(pathParams({ x0: 0, y0: 0, segments: [], closed: false })).toBe(2)
    const e = fittedEdge(path, 3.5)
    expect(e.params).toBe(15)
    expect(e.chi2).toBe(3.5)
    expect([e.x0, e.y0]).toEqual([0, 0])
  })

  it('reverse into the same geometry', () => {
    const rev = reversePath(path)
    expect([rev.x0, rev.y0]).toEqual([20, 14])
    expect(pathEnd(rev)).toEqual({ x: 0, y: 0 })
    expect(rev.segments[1]).toEqual({ type: 'C', x1: 12, y1: 6, x2: 10, y2: 3, x: 10, y: 0 })
    expect(rev.segments[0]).toMatchObject({ type: 'A', sweep: false, x: 15, y: 9 })
    expect(reversePath(rev)).toEqual(path)
    // Points along the forward path lie on the reversed one, read the other way.
    const pts = sampleRun(0, 0, segs, 0.5)
    const back = new Float64Array(pts.length)
    for (let k = 0; k < pts.length; k += 2) {
      back[k] = pts[pts.length - 2 - k]
      back[k + 1] = pts[pts.length - 1 - k]
    }
    expect(maxDeviation(pts, 0, 0, segs)).toBeLessThan(2e-3)
    expect(maxDeviation(back, rev.x0, rev.y0, rev.segments)).toBeLessThan(2e-3)
    expect(
      pathMaxDeviation(polyline(back, new Float64Array(back.length / 2).fill(1), false), rev),
    ).toBeLessThan(1e-3)
  })

  it('translate and pin their ends', () => {
    const t = translatePath(path, 1, -2)
    expect([t.x0, t.y0]).toEqual([1, -2])
    expect(t.segments[1]).toEqual({ type: 'C', x1: 11, y1: 1, x2: 13, y2: 4, x: 16, y: 7 })
    expect(t.segments[2]).toMatchObject({ type: 'A', rx: 5, x: 21, y: 12 })
    const copy = [...segs]
    pinEnd(copy, 21, 15)
    expect(copy[2]).toMatchObject({ type: 'A', rx: 5, sweep: true, x: 21, y: 15 })
    expect(segs[2]).toMatchObject({ x: 20, y: 14 })
  })

  it('score exact nearest distances', () => {
    const p: FitPath = {
      x0: 0,
      y0: 0,
      segments: [lineTo(10, 0), cubicTo(10, 3, 10, 6, 10, 9)],
      closed: false,
    }
    const data: [number, number, number, number][] = [
      [2, 1, 0.5, 1],
      [5, -2, 1, 4],
      [-3, 4, 2, 25],
      [8, 5, 0.25, 4],
      [10, 12, 1, 9],
    ]
    const poly = polyline(
      flat(data.map((d): [number, number] => [d[0], d[1]])),
      data.map((d) => d[2]),
      false,
    )
    const want = data.reduce((s, d) => s + d[3] / (d[2] * d[2]), 0)
    expect(want).toBeCloseTo(4 + 4 + 6.25 + 64 + 9, 12)
    expect(pathChi2(poly, p)).toBeCloseTo(want, 6)
    expect(pathMaxDeviation(poly, p)).toBeCloseTo(5, 6)
    for (const lambda of [0.5, 2]) {
      expect(pathCost(poly, p, { tau: 2, lambda })).toBeCloseTo(0.5 * want + lambda * 8, 6)
    }
    // An arc is scored as drawn, not as its chord.
    const arc: FitPath = {
      x0: 5,
      y0: 0,
      segments: [circularArc(5, false, true, 0, 5)],
      closed: false,
    }
    const s = Math.SQRT1_2 * 5
    const apoly = polyline([0, 0, s, s], [1, 1], false)
    expect(Math.abs(pathChi2(apoly, arc) - 25)).toBeLessThan(1e-3)
    expect(Math.abs(pathMaxDeviation(apoly, arc) - 5)).toBeLessThan(1e-4)
    const empty: FitPath = { x0: 0, y0: 0, segments: [], closed: false }
    expect(pathChi2(poly, empty)).toBe(Infinity)
    expect(pathMaxDeviation(poly, empty)).toBe(Infinity)
  })

  it('give the residuals inkvec gives', () => {
    const rnd = lcg(7)
    const pts: [number, number][] = []
    const sigma: number[] = []
    for (let k = 0; k < 21; k++) {
      const x = 0.5 * k
      pts.push([x, 0.02 * x * x + 0.05 * (rnd() - 0.5)])
      sigma.push(0.1 + 0.05 * (k % 3))
    }
    const poly = polyline(flat(pts), sigma, false)
    const p: FitPath = {
      x0: 0,
      y0: 0,
      segments: [
        lineTo(3, 0.2),
        cubicTo(4.5, 0.25, 6, 0.6, 7, 1),
        circularArc(9, false, false, 10, 2),
      ],
      closed: false,
    }
    expect(near(pathChi2(poly, p), 9.81491234166923, 1e-9)).toBe(true)
    expect(near(pathMaxDeviation(poly, p), 0.2084005377102151, 1e-9)).toBe(true)
    expect(near(pathCost(poly, p, { tau: 2, lambda: 3 }), 43.907456170834614, 1e-9)).toBe(true)
    expect(near(chi2(poly.points, poly.sigma, 0, 0, p.segments), 9.749736302568333, 1e-9)).toBe(
      true,
    )
    expect(near(maxDeviation(poly.points, 0, 0, p.segments), 0.2076046759559346, 1e-9)).toBe(true)
  })
})
