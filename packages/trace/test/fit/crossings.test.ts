import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { PathCommand } from '@trazor/core'
import type { FaceRing, FittedEdge } from '../../src/planar/types'
import {
  CROSSING_LIMIT,
  FLATTEN,
  boxPairs,
  cubicSelfIntersects,
  edgeCrossings,
  flattenEdge,
  locatedCrossings,
  orient2d,
  ringCrossings,
  ringPath,
  segmentsIntersect,
  selfCrossings,
} from '../../src/fit/crossings'
import type { FlatPath } from '../../src/fit/crossings'

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
const A = (
  rx: number,
  ry: number,
  rotation: number,
  largeArc: boolean,
  sweep: boolean,
  x: number,
  y: number,
): PathCommand => ({ type: 'A', rx, ry, rotation, largeArc, sweep, x, y })

function fitted(x0: number, y0: number, segments: PathCommand[], closed = false): FittedEdge {
  return { x0, y0, segments, closed, params: 0, chi2: 0 }
}

function flat(x0: number, y0: number, segments: PathCommand[], closed = false): FlatPath {
  return flattenEdge(fitted(x0, y0, segments, closed))
}

function ring(edges: number[], reversed: boolean[] = edges.map(() => false)): FaceRing {
  return { edges, reversed, outer: true }
}

const pairsOf = (found: { i: number; j: number }[]): [number, number][] =>
  found.map((c) => [c.i, c.j])

// --- exact arithmetic for the predicate's ground truth ---------------------------

/** `v · 2^1074` as an exact integer: every finite double is a multiple of `2^−1074`. */
function big(v: number): bigint {
  const view = new DataView(new ArrayBuffer(8))
  view.setFloat64(0, v)
  const hi = view.getUint32(0)
  const lo = view.getUint32(4)
  const exp = (hi >>> 20) & 0x7ff
  let mant = (BigInt(hi & 0xfffff) << 32n) | BigInt(lo)
  if (exp !== 0) mant = (mant | (1n << 52n)) << BigInt(exp - 1)
  return hi >>> 31 ? -mant : mant
}

function exactSign(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  const d = (big(ax) - big(cx)) * (big(by) - big(cy)) - (big(ay) - big(cy)) * (big(bx) - big(cx))
  return d > 0n ? 1 : d < 0n ? -1 : 0
}

const sign = (v: number): number => (v > 0 ? 1 : v < 0 ? -1 : 0)

describe('orient2d', () => {
  it('has the sign of the turn', () => {
    expect(orient2d(0, 0, 1, 0, 0, 1)).toBeGreaterThan(0)
    expect(orient2d(0, 0, 1, 0, 0, -1)).toBeLessThan(0)
    expect(orient2d(0, 0, 1, 0, 2, 0)).toBe(0)
  })

  it('reports exact collinearity in every order', () => {
    // Collinear in exact arithmetic, where the naive determinant is not reliably zero.
    expect(orient2d(0.5, 0.5, 12, 12, 24, 24)).toBe(0)
    expect(orient2d(24, 24, 12, 12, 0.5, 0.5)).toBe(0)
    expect(orient2d(12, 12, 0.5, 0.5, 24, 24)).toBe(0)
  })

  it('agrees with exact arithmetic on a grid of points an ulp apart', () => {
    // Points within 64 ulps of (0.5, 0.5) against the line through (12, 12) and (24, 24):
    // the configuration where the naive sign is a scatter (Kettner et al. 2008).
    const ulp = 2 ** -53
    let naiveWrong = 0
    for (let i = 0; i < 64; i++) {
      for (let j = 0; j < 64; j++) {
        const ax = 0.5 + i * ulp
        const ay = 0.5 + j * ulp
        const exact = exactSign(ax, ay, 12, 12, 24, 24)
        expect(sign(orient2d(ax, ay, 12, 12, 24, 24))).toBe(exact)
        const naive = (12 - ax) * (24 - ay) - (12 - ay) * (24 - ax)
        if (sign(naive) !== exact) naiveWrong++
      }
    }
    expect(naiveWrong).toBeGreaterThan(0)
  })

  it('agrees with exact arithmetic on near-collinear triples of every scale', () => {
    const rnd = mulberry32(11)
    for (let trial = 0; trial < 3000; trial++) {
      const scale = 2 ** Math.floor(rnd() * 60 - 20)
      const ax = (rnd() - 0.5) * scale
      const ay = (rnd() - 0.5) * scale
      const bx = (rnd() - 0.5) * scale
      const by = (rnd() - 0.5) * scale
      const t = rnd() * 3 - 1
      const k = Math.floor(rnd() * 5) - 2
      const cx = ax + t * (bx - ax) + k * Number.EPSILON * Math.abs(ax)
      const cy = ay + t * (by - ay)
      const exact = exactSign(ax, ay, bx, by, cx, cy)
      expect(sign(orient2d(ax, ay, bx, by, cx, cy))).toBe(exact)
      expect(sign(orient2d(bx, by, cx, cy, ax, ay))).toBe(exact)
      expect(sign(orient2d(bx, by, ax, ay, cx, cy))).toBe(0 - exact)
    }
  })
})

describe('segmentsIntersect', () => {
  it('decides crossings and every degenerate meeting exactly', () => {
    expect(segmentsIntersect(0, 0, 10, 10, 0, 10, 10, 0)).toBe(true)
    expect(segmentsIntersect(0, 0, 10, 10, 0, 5, 1, 5.5)).toBe(false)
    // A shared end point.
    expect(segmentsIntersect(0, 0, 10, 10, 10, 10, 20, 0)).toBe(true)
    // A collinear overlap, and collinear pieces apart.
    expect(segmentsIntersect(0, 0, 10, 10, 5, 5, 15, 15)).toBe(true)
    expect(segmentsIntersect(0, 0, 10, 10, 11, 11, 15, 15)).toBe(false)
    // An end point on the other's interior.
    expect(segmentsIntersect(0, 0, 10, 10, 5, 5, 9, 0)).toBe(true)
    // A point, on and off the other.
    expect(segmentsIntersect(3, 3, 3, 3, 0, 0, 10, 10)).toBe(true)
    expect(segmentsIntersect(3, 4, 3, 4, 0, 0, 10, 10)).toBe(false)
  })
})

describe('cubicSelfIntersects', () => {
  it('passes an S curve and a quarter circle', () => {
    expect(cubicSelfIntersects(0, 0, 30, 0, 70, 100, 100, 100)).toBe(false)
    const k = (4 / 3) * (Math.SQRT2 - 1)
    expect(cubicSelfIntersects(40, 0, 40, k * 40, k * 40, 40, 0, 40)).toBe(false)
  })

  it('finds crossed arms that loop, and keeps crossed arms that do not', () => {
    expect(cubicSelfIntersects(0, 0, 80, 50, -70, 50, 10, 0)).toBe(true)
    expect(cubicSelfIntersects(0, 0, 100, 20, 0, 20, 100, 0)).toBe(false)
  })

  it('does not call a closed teardrop a loop', () => {
    expect(cubicSelfIntersects(0, 0, 120, 60, -120, 60, 0, 0)).toBe(false)
  })

  it('agrees with dense sampling across the loop boundary', () => {
    const brute = (p: number[]): boolean => {
      const n = 400
      const pts: number[] = []
      for (let k = 0; k <= n; k++) {
        const t = k / n
        const u = 1 - t
        const b = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]
        pts.push(
          b[0] * p[0] + b[1] * p[2] + b[2] * p[4] + b[3] * p[6],
          b[0] * p[1] + b[1] * p[3] + b[2] * p[5] + b[3] * p[7],
        )
      }
      for (let a = 0; a < n; a++) {
        for (let b = a + 2; b < n; b++) {
          const [ax, ay, bx, by] = pts.slice(2 * a, 2 * a + 4)
          const [cx, cy, dx, dy] = pts.slice(2 * b, 2 * b + 4)
          if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true
        }
      }
      return false
    }
    let loops = 0
    for (let k = 0; k < 16; k++) {
      const arm = 20 + 30 * k
      const p = [0, 0, arm, 40, 100 - arm, 40, 100, 0]
      const closed = cubicSelfIntersects(p[0], p[1], p[2], p[3], p[4], p[5], p[6], p[7])
      expect(closed, `arm ${arm}`).toBe(brute(p))
      if (closed) loops++
    }
    expect(loops).toBeGreaterThan(0)
  })
})

describe('flattenEdge', () => {
  it('flattens a line to its end and a cubic to FLATTEN pieces on the curve', () => {
    const f = flat(0, 0, [L(10, 0), C(15, 0, 20, 5, 20, 10)])
    expect(f.count).toBe(2)
    expect(Array.from(f.offsets)).toEqual([0, 2, 2 + FLATTEN + 1])
    expect(Array.from(f.xy.subarray(0, 4))).toEqual([0, 0, 10, 0])
    // The cubic's run starts where the line ends and lands exactly on its end point.
    expect(f.xy[4]).toBe(10)
    expect(f.xy[5]).toBe(0)
    expect(f.xy[2 * (f.offsets[2] - 1)]).toBe(20)
    expect(f.xy[2 * (f.offsets[2] - 1) + 1]).toBe(10)
    for (let k = 0; k <= FLATTEN; k++) {
      const t = k / FLATTEN
      const u = 1 - t
      const x = u * u * u * 10 + 3 * u * u * t * 15 + 3 * u * t * t * 20 + t * t * t * 20
      const y = 3 * u * t * t * 5 + t * t * t * 10
      expect(f.xy[2 * (2 + k)]).toBeCloseTo(x, 12)
      expect(f.xy[2 * (2 + k) + 1]).toBeCloseTo(y, 12)
    }
    expect(Array.from(f.boxes.subarray(4, 8))).toEqual([10, 0, 20, 10])
    expect(Array.from(f.loops)).toEqual([0, 0])
  })

  it('flattens an arc up to nearly a full turn, on its circle, FLATTEN pieces a quarter turn', () => {
    // From 1° to 359° round (0, 0), radius 10: the large arc, in increasing angle.
    const deg = Math.PI / 180
    const f = flat(10 * Math.cos(deg), 10 * Math.sin(deg), [
      A(10, 10, 0, true, true, 10 * Math.cos(359 * deg), 10 * Math.sin(359 * deg)),
    ])
    const pieces = f.offsets[1] - f.offsets[0] - 1
    expect(pieces).toBe(Math.ceil((FLATTEN * 358 * deg) / (Math.PI / 2)))
    let leftmost = Infinity
    for (let p = 0; p <= pieces; p++) {
      expect(Math.hypot(f.xy[2 * p], f.xy[2 * p + 1])).toBeCloseTo(10, 9)
      leftmost = Math.min(leftmost, f.xy[2 * p])
    }
    // The run goes round through (−10, 0), not across the chord.
    expect(leftmost).toBeLessThan(-9.99)
    // A short arc still gets FLATTEN pieces.
    const short = flat(10, 0, [
      A(10, 10, 0, false, true, 10 * Math.cos(10 * deg), 10 * Math.sin(10 * deg)),
    ])
    expect(short.offsets[1] - 1).toBe(FLATTEN)
  })

  it('reads an elliptical arc rotation in degrees', () => {
    // Half of an ellipse with radii 20 and 10, its major axis at 30°, centred at the origin.
    const phi = (30 * Math.PI) / 180
    const ex = 20 * Math.cos(phi)
    const ey = 20 * Math.sin(phi)
    const f = flat(ex, ey, [A(20, 10, 30, false, true, -ex, -ey)])
    for (let p = 0; p < f.offsets[1]; p++) {
      const x = f.xy[2 * p]
      const y = f.xy[2 * p + 1]
      const u = Math.cos(phi) * x + Math.sin(phi) * y
      const v = -Math.sin(phi) * x + Math.cos(phi) * y
      expect((u / 20) ** 2 + (v / 10) ** 2).toBeCloseTo(1, 9)
    }
  })

  it('draws a zero-radius arc as a line and raises a quadratic to its cubic', () => {
    const zero = flat(0, 0, [A(0, 5, 0, false, true, 4, 3)])
    expect(Array.from(zero.xy)).toEqual([0, 0, 4, 3])
    const q = flat(0, 0, [{ type: 'Q', x1: 10, y1: 10, x: 20, y: 0 }])
    // The quadratic's midpoint: ¼·P0 + ½·Q + ¼·P2.
    const mid = FLATTEN / 2
    expect(q.xy[2 * mid]).toBeCloseTo(10, 12)
    expect(q.xy[2 * mid + 1]).toBeCloseTo(5, 12)
  })

  it('refuses a move or a close inside an edge', () => {
    expect(() => flat(0, 0, [L(1, 0), { type: 'Z' }])).toThrow(/L, C and A/)
  })
})

describe('selfCrossings', () => {
  it('passes a simple square', () => {
    const f = flat(0, 0, [L(10, 0), L(10, 10), L(0, 10), L(0, 0)], true)
    expect(selfCrossings(f)).toEqual([])
  })

  it('does not report segments touching where they join, the last back at the first', () => {
    const f = flat(0, 0, [L(10, 0), L(5, 8), L(0, 0)], true)
    expect(selfCrossings(f)).toEqual([])
  })

  it('finds a figure of eight and where its legs cross', () => {
    const f = flat(0, 0, [L(10, 10), L(0, 10), L(10, 0)])
    const found = selfCrossings(f, 8)
    expect(pairsOf(found)).toEqual([[0, 2]])
    expect(Math.hypot(found[0].x - 5, found[0].y - 5)).toBeLessThan(1e-12)
  })

  it('places a crossing on both curves at a thin neck, and on a collinear overlap', () => {
    // Two cubics bowed across each other, mirror images about y = 0.5.
    const neck = flat(0, 0, [C(10, 3, 20, 3, 30, 0), L(30, 1), C(20, -2, 10, -2, 0, 1)], true)
    const found = selfCrossings(neck, 32)
    expect(found.length).toBeGreaterThan(0)
    for (const c of found) expect(Math.abs(c.y - 0.5)).toBeLessThan(0.35)
    // A line doubling back over itself reports a point on the shared stretch.
    const back = flat(0, 0, [L(10, 0), L(10, 2), L(4, 0), L(2, 0)])
    const at = selfCrossings(back, 8).find((c) => c.i === 0 && c.j === 3)
    expect(at).toBeDefined()
    expect(Math.abs(at!.y)).toBeLessThan(1e-12)
    expect(at!.x).toBeGreaterThanOrEqual(2)
    expect(at!.x).toBeLessThanOrEqual(4)
  })

  it('finds a cubic looping on itself, alone or among others, at its midpoint', () => {
    const alone = selfCrossings(flat(0, 0, [C(80, 50, -70, 50, 10, 0)]))
    expect(pairsOf(alone)).toEqual([[0, 0]])
    expect(alone[0].x).toBeCloseTo(0.375 * 80 + 0.375 * -70 + 0.125 * 10, 12)
    expect(alone[0].y).toBeCloseTo(0.375 * 50 + 0.375 * 50, 12)
    const among = selfCrossings(flat(-20, 0, [L(0, 0), C(80, 50, -70, 50, 10, 0), L(10, -20)]))
    expect(among.some((c) => c.i === 1 && c.j === 1)).toBe(true)
  })

  it('passes a closed teardrop, a lens of two cubics and a circle of two arcs', () => {
    expect(selfCrossings(flat(0, 0, [C(120, 60, -120, 60, 0, 0)], true))).toEqual([])
    const lens = flat(0, 0, [C(10, -6, 20, -6, 30, 0), C(20, 6, 10, 6, 0, 0)], true)
    expect(selfCrossings(lens)).toEqual([])
    const circle = flat(
      10,
      0,
      [A(10, 10, 0, false, true, -10, 0), A(10, 10, 0, false, true, 10, 0)],
      true,
    )
    expect(selfCrossings(circle)).toEqual([])
    // A rounded rectangle: lines and quarter arcs.
    const r = 3
    const rrect = flat(r, 0, [
      L(20 - r, 0),
      A(r, r, 0, false, true, 20, r),
      L(20, 10 - r),
      A(r, r, 0, false, true, 20 - r, 10),
      L(r, 10),
      A(r, r, 0, false, true, 0, 10 - r),
      L(0, r),
      A(r, r, 0, false, true, r, 0),
    ])
    expect(selfCrossings(rrect)).toEqual([])
  })

  it('stops at the limit, in order of the first segment, then the second', () => {
    // A zigzag back across a long base line crosses it once per tooth.
    const segs: PathCommand[] = [L(100, 0)]
    for (let k = 0; k < 10; k++) segs.push(L(95 - 10 * k, k % 2 === 0 ? 5 : -5))
    const f = flat(0, 0, segs)
    const all = selfCrossings(f, Infinity)
    expect(all.length).toBeGreaterThan(3)
    const sorted = [...all].sort((p, q) => p.i - q.i || p.j - q.j)
    expect(all).toEqual(sorted)
    expect(selfCrossings(f, 3)).toEqual(all.slice(0, 3))
    expect(selfCrossings(f, 0)).toEqual([])
  })
})

describe('edgeCrossings', () => {
  // `a` runs into the node (10, 0) along the x axis; `b` leaves it.
  const a = flat(0, 0, [L(10, 0)])

  it('does not report two edges that only touch at the node they share', () => {
    const b = flat(10, 0, [C(8, -1, 6, -2, 4, -3)])
    expect(edgeCrossings(a, b)).toEqual([])
    expect(edgeCrossings(b, a)).toEqual([])
  })

  it('finds a cubic doubling back across the line feeding the node', () => {
    // Below the axis, then up across it at t = (3 − √5)/2, about 1.4 px from the node.
    const b = flat(10, 0, [C(8, -1, 8, 1, 10, 3)])
    const found = edgeCrossings(a, b)
    expect(found.map((c) => [c.a, c.b])).toEqual([[0, 0]])
    const t = (3 - Math.sqrt(5)) / 2
    const u = 1 - t
    const x = u * u * u * 10 + 3 * u * u * t * 8 + 3 * u * t * t * 8 + t * t * t * 10
    expect(Math.abs(found[0].y)).toBeLessThan(1e-12)
    expect(Math.abs(found[0].x - x)).toBeLessThan(0.02)
    // The same crossing from the other side.
    const back = edgeCrossings(b, a)
    expect(back.map((c) => [c.a, c.b])).toEqual([[0, 0]])
    expect(back[0].x).toBeCloseTo(found[0].x, 9)
  })

  it('does not report two edges between the same two nodes', () => {
    const top = flat(0, 0, [C(10, -5, 20, -5, 30, 0)])
    const bottom = flat(30, 0, [C(20, 5, 10, 5, 0, 0)])
    expect(edgeCrossings(top, bottom)).toEqual([])
    expect(edgeCrossings(top, flat(0, 0, [C(10, 5, 20, 5, 30, 0)]))).toEqual([])
  })

  it('reports a collinear overlap at the middle of the shared stretch', () => {
    const p = flat(0, 0, [L(4, 0), L(10, 0)])
    const q = flat(20, 0, [L(12, 0), L(6, 0)])
    const found = edgeCrossings(p, q)
    expect(found.map((c) => [c.a, c.b])).toEqual([[1, 1]])
    expect(found[0]).toMatchObject({ x: 8, y: 0 })
  })

  it('finds an arc crossed across its body, far from its chord', () => {
    // 300° of a circle of radius 10, through (−10, 0), closed by its chord at x ≈ 8.66.
    const deg = Math.PI / 180
    const px = 10 * Math.cos(30 * deg)
    const pacman = flat(px, 5, [A(10, 10, 0, true, true, px, -5), L(px, 5)], true)
    const found = edgeCrossings(pacman, flat(-12, 0, [L(-8, 0)]))
    expect(found.map((c) => [c.a, c.b])).toEqual([[0, 0]])
    expect(found[0].x).toBeLessThanOrEqual(-9.98)
    expect(found[0].x).toBeGreaterThanOrEqual(-10)
  })
})

describe('ringPath and ringCrossings', () => {
  it('names each segment by its edge and its index in that edge, walked reversed', () => {
    const a = flat(0, 0, [L(1, 0), L(2, 0)])
    const b = flat(0, 0, [L(0, 1), L(1, 1), L(2, 0)])
    const path = ringPath(ring([0, 1], [false, true]), [a, b])
    expect(path.count).toBe(5)
    expect(Array.from(path.edge)).toEqual([0, 0, 1, 1, 1])
    expect(Array.from(path.segment)).toEqual([0, 1, 2, 1, 0])
    // Ring segment 2 is b's last segment walked back: (2, 0) to (1, 1).
    const end = path.offsets[3] - 1
    expect([path.xy[2 * end], path.xy[2 * end + 1]]).toEqual([1, 1])
    const start = path.offsets[2]
    expect([path.xy[2 * start], path.xy[2 * start + 1]]).toEqual([2, 0])
  })

  it('passes a simple ring over three edges, one walked reversed', () => {
    const flats = [
      flat(0, 0, [L(10, 0), C(14, 2, 14, 8, 10, 10)]),
      flat(0, 10, [C(-3, 7, -3, 3, 0, 0)]),
      flat(0, 10, [L(5, 11), L(10, 10)]),
    ]
    // Round (0, 0) → (10, 10) by edge 0, back to (0, 10) along edge 2 reversed, home by edge 1.
    expect(ringCrossings(ring([0, 2, 1], [false, true, false]), flats)).toEqual([])
  })

  it('finds a figure of eight between two edges and names both sides', () => {
    const flats = [flat(0, 0, [L(10, 10), L(0, 10)]), flat(0, 0, [L(10, 0), L(0, 10)])]
    const found = ringCrossings(ring([0, 1], [false, true]), flats)
    expect(found).toHaveLength(1)
    expect(found[0]).toMatchObject({ i: 0, j: 2, edgeI: 0, segmentI: 0, edgeJ: 1, segmentJ: 1 })
    expect(Math.hypot(found[0].x - 5, found[0].y - 5)).toBeLessThan(1e-12)
  })

  it('finds the cusp where an edge doubles back across the edge feeding its node', () => {
    const into = flat(0, 0, [L(10, 0)])
    const home = flat(10, 3, [L(10, 8), L(0, 8), L(0, 0)])
    const crossing = [into, flat(10, 0, [C(8, -1, 8, 1, 10, 3)]), home]
    const found = ringCrossings(ring([0, 1, 2]), crossing)
    expect(found.map((c) => [c.edgeI, c.segmentI, c.edgeJ, c.segmentJ])).toEqual([[0, 0, 1, 0]])
    const clean = [into, flat(10, 0, [C(11, 1, 11, 2, 10, 3)]), home]
    expect(ringCrossings(ring([0, 1, 2]), clean)).toEqual([])
  })

  it('passes a pinch where the ring touches itself at a node, and finds one crossing there', () => {
    // Two triangles meeting at the node (0, 0), each an edge from the node back to it.
    const right = flat(0, 0, [L(10, -5), L(10, 5), L(0, 0)])
    const left = flat(0, 0, [L(-10, 5), L(-10, -5), L(0, 0)])
    expect(ringCrossings(ring([0, 1]), [right, left])).toEqual([])
    // The left loop comes home from inside the right one.
    const across = flat(0, 0, [L(-10, 5), L(-10, -5), L(5, -1), L(0, 0)])
    const found = ringCrossings(ring([0, 1]), [right, across])
    expect(found.length).toBeGreaterThan(0)
    expect(found.every((c) => c.edgeI !== c.edgeJ || c.edgeI === 1)).toBe(true)
  })

  it('finds two edges bulging across each other at a thin neck', () => {
    const flats = [
      flat(0, 0, [C(10, 3, 20, 3, 30, 0)]),
      flat(30, 0, [L(30, 1)]),
      flat(0, 1, [C(10, -2, 20, -2, 30, 1)]),
      flat(0, 1, [L(0, 0)]),
    ]
    const found = ringCrossings(ring([0, 1, 2, 3], [false, false, true, false]), flats)
    expect(found.length).toBeGreaterThan(0)
    expect(found[0]).toMatchObject({ edgeI: 0, segmentI: 0, edgeJ: 2, segmentJ: 0 })
    expect(Math.abs(found[0].y - 0.5)).toBeLessThan(0.35)
  })

  it('tests only the pairs touching one edge when asked', () => {
    // Edges 0 and 2 cross; edge 1 crosses nothing.
    const flats = [
      flat(0, 0, [L(10, 10), L(0, 10)]),
      flat(0, 10, [L(-1, 5)]),
      flat(-1, 5, [L(10, 0), L(0, 0)]),
    ]
    const r = ring([0, 1, 2])
    expect(ringCrossings(r, flats).length).toBeGreaterThan(0)
    expect(ringCrossings(r, flats, { touching: 1 })).toEqual([])
    expect(ringCrossings(r, flats, { touching: 2 })).toEqual(ringCrossings(r, flats))
  })
})

describe('locatedCrossings', () => {
  const flats = [
    flat(0, 0, [L(10, 10), L(0, 10)]),
    flat(0, 0, [L(10, 0), L(0, 10)]),
    flat(20, 0, [L(30, 0), L(30, 10), L(20, 10)]),
    flat(20, 10, [L(20, 0)]),
  ]
  const rings = [ring([2, 3]), ring([0, 1], [false, true])]

  it('lists both sides of each crossing, sorted by edge, then segment, then x', () => {
    const hits = locatedCrossings(rings, flats)
    expect(hits.map((h) => [h.edge, h.segment])).toEqual([
      [0, 0],
      [1, 1],
    ])
    for (const h of hits) expect(Math.hypot(h.x - 5, h.y - 5)).toBeLessThan(1e-12)
  })

  it('tests only the rings walking a changed edge', () => {
    expect(locatedCrossings(rings, flats, { changed: new Set([2]) })).toEqual([])
    expect(locatedCrossings(rings, flats, { changed: new Set([1]) })).toHaveLength(2)
  })
})

describe('boxPairs', () => {
  function brute(boxes: Float64Array, n: number): number[] {
    const out: number[] = []
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const [ax0, ay0, ax1, ay1] = boxes.subarray(4 * i, 4 * i + 4)
        const [bx0, by0, bx1, by1] = boxes.subarray(4 * j, 4 * j + 4)
        if (ax0 <= bx1 && bx0 <= ax1 && ay0 <= by1 && by0 <= ay1) out.push(i, j)
      }
    }
    return out
  }

  it('finds exactly the pairs an all-pairs scan finds, in its order', () => {
    const rnd = mulberry32(3)
    for (const n of [5, 30, 300, 2000]) {
      const boxes = new Float64Array(4 * n)
      for (let k = 0; k < n; k++) {
        const x = Math.round(rnd() * 1000)
        const y = Math.round(rnd() * 600)
        // Mostly small boxes, a few long ones, edges on integers so many only touch.
        const w = Math.round(rnd() ** 4 * 300)
        const h = Math.round(rnd() ** 4 * 300)
        boxes.set([x, y, x + w, y + h], 4 * k)
      }
      expect(Array.from(boxPairs(boxes, n))).toEqual(brute(boxes, n))
    }
  })

  it('handles degenerate layouts: one point, one vertical line', () => {
    const n = 40
    const point = new Float64Array(4 * n).fill(3)
    expect(Array.from(boxPairs(point, n))).toEqual(brute(point, n))
    const column = new Float64Array(4 * n)
    for (let k = 0; k < n; k++) column.set([7, k, 7, k + 1], 4 * k)
    expect(Array.from(boxPairs(column, n))).toEqual(brute(column, n))
  })
})

describe('a cartoon-sized ring', () => {
  /**
   * A ring of `n` edges round a circle of radius 2000, each a line to the mid
   * angle and a cubic on to the next node; edge `m` carries a figure of eight of
   * its own, and edge `m + 5` spikes inward and comes back out across the end of
   * edge `m + 4`.
   */
  function bigRing(n: number, m: number): FlatPath[] {
    const R = 2000
    const at = (a: number): [number, number] => [R * Math.cos(a), R * Math.sin(a)]
    const step = (2 * Math.PI) / n
    const arm = (4 / 3) * Math.tan(step / 8) * R
    const flats: FlatPath[] = []
    for (let k = 0; k < n; k++) {
      const a0 = k * step
      const [x0, y0] = at(a0)
      const [xm, ym] = at(a0 + step / 2)
      const [x1, y1] = at(a0 + step)
      const tm = [-Math.sin(a0 + step / 2), Math.cos(a0 + step / 2)]
      const t1 = [-Math.sin(a0 + step), Math.cos(a0 + step)]
      if (k === m) {
        // P → A → B → next node, with A beyond B along the chord: P–A crosses B–next.
        const cx = x1 - x0
        const cy = y1 - y0
        const nx = -cy * 0.3
        const ny = cx * 0.3
        flats.push(
          flat(x0, y0, [
            L(x0 + 0.75 * cx + nx, y0 + 0.75 * cy + ny),
            L(x0 + 0.25 * cx + nx, y0 + 0.25 * cy + ny),
            L(x1, y1),
          ]),
        )
      } else if (k === m + 5) {
        // In, then back out across the previous edge's last cubic, then on.
        const [xi, yi] = at(a0 - step / 4)
        const [xo, yo] = at(a0 - step / 8)
        flats.push(
          flat(x0, y0, [
            L(0.99 * xi, 0.99 * yi),
            L(1.001 * xo, 1.001 * yo),
            L(xm, ym),
            C(xm + arm * tm[0], ym + arm * tm[1], x1 - arm * t1[0], y1 - arm * t1[1], x1, y1),
          ]),
        )
      } else {
        flats.push(
          flat(x0, y0, [
            L(xm, ym),
            C(xm + arm * tm[0], ym + arm * tm[1], x1 - arm * t1[0], y1 - arm * t1[1], x1, y1),
          ]),
        )
      }
    }
    return flats
  }

  it('finds the two planted crossings among thousands of segments, the same every run', () => {
    const n = 2500
    const m = 1234
    const flats = bigRing(n, m)
    const r = ring(Array.from({ length: n }, (_, k) => k))
    const found = ringCrossings(r, flats, { limit: Infinity })
    const named = found.map((c) => [c.edgeI, c.segmentI, c.edgeJ, c.segmentJ])
    expect(named).toEqual([
      [m, 0, m, 2],
      [m + 4, 1, m + 5, 1],
    ])
    expect(ringCrossings(r, flats, { limit: Infinity })).toEqual(found)
    expect(locatedCrossings([r], flats)).toEqual(locatedCrossings([r], bigRing(n, m)))
    expect(found.length).toBeLessThan(CROSSING_LIMIT)
  })
})
