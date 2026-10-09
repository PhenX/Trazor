import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { PlanarMap } from '../../src/planar/types'
import { buildUnknowns } from '../../src/solve/band'
import type { Unknowns } from '../../src/solve/band'
import { FoldCounter, boundarySegments, foldGuard, segmentsCross } from '../../src/solve/folds'
import { handMap } from './solve-helpers'
import type { HandEdge } from './solve-helpers'

/**
 * The fold count by a per-cell hash grid: every segment bucketed in each 1-px
 * cell of its range (unless the range spans more than 64 cells), each pair
 * sharing a cell tested once. The reference the spatial join must equal.
 */
function referenceCount(map: PlanarMap, u: Unknowns, pos: Float64Array): number {
  const segs = boundarySegments(map, u)
  const cells = new Map<number, number[]>()
  for (let s = 0; s < segs.count; s++) {
    const a = segs.a[s]
    const b = segs.b[s]
    const x0 = Math.floor(Math.min(pos[2 * a], pos[2 * b])) - 1
    const x1 = Math.ceil(Math.max(pos[2 * a], pos[2 * b]))
    const y0 = Math.floor(Math.min(pos[2 * a + 1], pos[2 * b + 1])) - 1
    const y1 = Math.ceil(Math.max(pos[2 * a + 1], pos[2 * b + 1]))
    if ((x1 - x0) * (y1 - y0) > 64) continue
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = (x + 4096) * 8192 + (y + 4096)
        const list = cells.get(key)
        if (list === undefined) cells.set(key, [s])
        else list.push(s)
      }
    }
  }
  const tested = new Set<number>()
  let found = 0
  for (const list of cells.values()) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const s = Math.min(list[i], list[j])
        const t = Math.max(list[i], list[j])
        const key = s * segs.count + t
        if (tested.has(key)) continue
        tested.add(key)
        const [p, q, r, v] = [segs.a[s], segs.b[s], segs.a[t], segs.b[t]]
        if (p === r || p === v || q === r || q === v) continue
        const hit = segmentsCross(
          pos[2 * p],
          pos[2 * p + 1],
          pos[2 * q],
          pos[2 * q + 1],
          pos[2 * r],
          pos[2 * r + 1],
          pos[2 * v],
          pos[2 * v + 1],
        )
        if (hit) found++
      }
    }
  }
  return found
}

/**
 * A random map: wiggly open chains between six shared nodes and three closed
 * rings, packed into a small image. With `snap`, coordinates are on the
 * half-pixel grid, so collinear overlaps, touches and points on gridlines are
 * common.
 */
function randomMap(rnd: () => number, size: number, snap: boolean): PlanarMap {
  const q = (v: number): number => (snap ? Math.round(v * 2) / 2 : v)
  const nodes: [number, number][] = Array.from({ length: 6 }, () => [
    q(rnd() * size),
    q(rnd() * size),
  ])
  const edges: HandEdge[] = []
  for (let k = 0; k < 8; k++) {
    const a = k % 6
    const b = (k * 5 + 1) % 6
    const [ax, ay] = nodes[a]
    const [bx, by] = nodes[b]
    const m = 3 + Math.floor(rnd() * 12)
    const points = [ax, ay]
    for (let i = 1; i < m; i++) {
      const t = i / m
      points.push(
        q(ax + (bx - ax) * t + (rnd() - 0.5) * 3),
        q(ay + (by - ay) * t + (rnd() - 0.5) * 3),
      )
    }
    points.push(bx, by)
    edges.push({ points, left: 0, right: 1, start: a, end: b })
  }
  for (let r = 0; r < 3; r++) {
    const cx = rnd() * size
    const cy = rnd() * size
    const m = 4 + Math.floor(rnd() * 10)
    const points: number[] = []
    for (let i = 0; i < m; i++) {
      const a = (i / m) * 2 * Math.PI
      const rad = 1 + rnd() * 3
      points.push(q(cx + rad * Math.cos(a)), q(cy + rad * Math.sin(a)))
    }
    edges.push({ points, left: 0, right: 1, closed: true })
  }
  return handMap(size + 1, size + 1, edges, nodes)
}

/** Crossing pairs of a map of `edges` at its own positions. */
function crossingCount(edges: HandEdge[], nodes: [number, number][], w: number, h: number): number {
  const map = handMap(w, h, edges, nodes)
  const u = buildUnknowns(map)
  return new FoldCounter(map, u, u.start, u.start).count(u.start)
}

describe('segmentsCross', () => {
  const cross = (s: number[], t: number[]): boolean =>
    segmentsCross(s[0], s[1], s[2], s[3], t[0], t[1], t[2], t[3])

  it('decides crossings and touches exactly', () => {
    // A proper X, in all four orientations.
    for (const [s, t] of [
      [
        [0, 0, 2, 2],
        [0, 2, 2, 0],
      ],
      [
        [2, 2, 0, 0],
        [0, 2, 2, 0],
      ],
      [
        [0, 0, 2, 2],
        [2, 0, 0, 2],
      ],
      [
        [0, 2, 2, 0],
        [0, 0, 2, 2],
      ],
    ]) {
      expect(cross(s, t)).toBe(true)
    }
    // Disjoint, parallel, and one ending short of the other.
    expect(cross([0, 0, 2, 2], [3, 0, 5, 2])).toBe(false)
    expect(cross([0, 0, 2, 0], [0, 1, 2, 1])).toBe(false)
    expect(cross([0, 0, 2, 2], [2, 0, 1.2, 0.8])).toBe(false)
    // Ending on the other's line beyond its end: no touch.
    expect(cross([0, 0, 1, 0], [3, 1, 2, 0])).toBe(false)
    // Collinear: an overlap folds back on itself and counts; apart does not.
    expect(cross([0, 0, 2, 0], [1, 0, 3, 0])).toBe(true)
    expect(cross([0, 0, 1, 0], [2, 0, 3, 0])).toBe(false)
    // A touch counts: an end on the other's interior (a T), and coinciding ends.
    expect(cross([0, 0, 2, 0], [1, 0, 1, 1])).toBe(true)
    expect(cross([0, 0, 2, 0], [0, 0, 0, 1])).toBe(true)
    expect(cross([1, 0, 2, 0], [0, 0, 1, 0])).toBe(true)
  })
})

describe('FoldCounter', () => {
  it('counts what the per-cell hash grid counts on random maps', () => {
    const rnd = mulberry32(7)
    let crossingMaps = 0
    for (let trial = 0; trial < 200; trial++) {
      const snap = trial % 2 === 0
      const size = [6, 12, 30][trial % 3]
      const map = randomMap(rnd, size, snap)
      const u = buildUnknowns(map)
      // A solution up to a pixel from the start, as the solve produces.
      const sol = u.start.slice()
      for (let v = 0; v < u.count; v++) {
        const a = rnd() * 2 * Math.PI
        const r = rnd()
        let x = u.start[2 * v] + r * Math.cos(a)
        let y = u.start[2 * v + 1] + r * Math.sin(a)
        if (snap) {
          x = Math.round(x * 2) / 2
          y = Math.round(y * 2) / 2
        }
        sol[2 * v] = x
        sol[2 * v + 1] = y
      }
      const fc = new FoldCounter(map, u, u.start, sol)
      let scale = 1
      for (let k = 0; k < 5; k++) {
        const pos = u.start.map((s, i) => s + (sol[i] - s) * scale)
        const want = referenceCount(map, u, pos)
        expect(fc.count(pos), `trial ${trial} scale ${scale}`).toBe(want)
        if (want > 0) crossingMaps++
        scale *= 0.5
      }
      expect(fc.count(u.start)).toBe(referenceCount(map, u, u.start))
      expect(fc.count(sol)).toBe(referenceCount(map, u, sol))
    }
    // The random maps must exercise crossings, not only their absence.
    expect(crossingMaps).toBeGreaterThan(100)
  })

  it('counts what the hash grid counts on degenerate segments', () => {
    // A segment far over the 64-cell limit (never counted), a zero-length one,
    // collinear overlaps, a touch on a gridline, a ring far from the origin.
    const edges: HandEdge[] = [
      { points: [0.5, 0.5, 90.5, 0.7, 1.5, 1.5], left: 0, right: 1, start: 0, end: 1 },
      { points: [2.5, 2.5, 2.5, 2.5, 4.5, 2.5], left: 0, right: 1, start: 2, end: 3 },
      { points: [3.5, 2.5, 5.5, 2.5], left: 0, right: 1, start: 4, end: 5 },
      { points: [4, 1, 4, 2.5, 4, 5], left: 0, right: 1, start: 6, end: 7 },
      { points: [1.5, -2.5, 1.5, 5.5], left: 0, right: 1, start: 8, end: 9 },
      { points: [301, 301, 303, 301, 301, 303, 303, 303], left: 0, right: 1, closed: true },
    ]
    const nodes: [number, number][] = []
    for (const e of edges) {
      if (e.closed) continue
      const n = e.points.length
      nodes.push([e.points[0], e.points[1]], [e.points[n - 2], e.points[n - 1]])
    }
    const map = handMap(400, 400, edges, nodes)
    const u = buildUnknowns(map)
    const want = referenceCount(map, u, u.start)
    expect(want).toBeGreaterThan(0)
    expect(new FoldCounter(map, u, u.start, u.start).count(u.start)).toBe(want)
  })

  it('finds folds between and within boundaries', () => {
    const square: HandEdge = { points: [1, 1, 3, 1, 3, 3, 1, 3], left: 0, right: 1, closed: true }
    expect(crossingCount([square], [], 6, 6)).toBe(0)
    // A bow tie: the closing segment crosses the second.
    const bow = [1, 1, 3, 1, 1, 3, 3, 3]
    expect(crossingCount([{ points: bow, left: 0, right: 1, closed: true }], [], 6, 6)).toBe(1)
    // The same far from the origin.
    const far = bow.map((v) => v + 40)
    expect(crossingCount([{ points: far, left: 0, right: 1, closed: true }], [], 50, 50)).toBe(1)
    // Open, it is a Z and does not cross itself.
    expect(
      crossingCount(
        [{ points: bow, left: 0, right: 1, start: 0, end: 1 }],
        [
          [1, 1],
          [3, 3],
        ],
        6,
        6,
      ),
    ).toBe(0)
    // Two boundaries crossing once.
    expect(
      crossingCount(
        [
          { points: [0.2, 1.1, 1.4, 1.2, 2.6, 1.3], left: 0, right: 1, start: 0, end: 1 },
          { points: [1.3, 0.1, 1.35, 2.4], left: 0, right: 1, start: 2, end: 3 },
        ],
        [
          [0.2, 1.1],
          [2.6, 1.3],
          [1.3, 0.1],
          [1.35, 2.4],
        ],
        4,
        4,
      ),
    ).toBe(1)
    // Two sharing only their end node do not cross.
    expect(
      crossingCount(
        [
          { points: [0.2, 0.2, 1.4, 1.2], left: 0, right: 1, start: 0, end: 1 },
          { points: [2.6, 0.3, 1.4, 1.2], left: 0, right: 1, start: 2, end: 1 },
        ],
        [
          [0.2, 0.2],
          [1.4, 1.2],
          [2.6, 0.3],
        ],
        4,
        4,
      ),
    ).toBe(0)
  })
})

describe('foldGuard', () => {
  it('backs off only the boundaries that fold', () => {
    // A and B are a pixel apart; the solve pulled one end of B through A, and
    // moved C, far away, as well.
    const map = handMap(
      12,
      12,
      [
        { points: [0, 0, 4, 0], left: 0, right: 1, start: 0, end: 1 },
        { points: [0, 1, 4, 1], left: 0, right: 1, start: 2, end: 3 },
        { points: [0, 10, 4, 10], left: 0, right: 1, start: 4, end: 5 },
      ],
      [
        [0, 0],
        [4, 0],
        [0, 1],
        [4, 1],
        [0, 10],
        [4, 10],
      ],
    )
    const u = buildUnknowns(map)
    const pos = u.start.slice()
    const b0 = u.of[1][0]
    const c0 = u.of[2][0]
    const c1 = u.of[2][1]
    const a0 = u.of[0][0]
    pos[2 * b0 + 1] = -0.5
    pos[2 * c0 + 1] = 10.3
    pos[2 * c1 + 1] = 10.3
    const { pos: cur, scale, rounds } = foldGuard(map, u, pos)
    // B's end is halved back once, from y = −0.5 to y = 0.25, where B no longer
    // crosses A (at a half it would still: 1 − 1.5·s < 0 for s > 2/3).
    expect([cur[2 * b0], cur[2 * b0 + 1]]).toEqual([0, 0.25])
    expect(rounds).toBe(1)
    // C keeps all of its displacement; A never moved.
    expect(cur[2 * c0 + 1]).toBe(10.3)
    expect(cur[2 * c1 + 1]).toBe(10.3)
    expect([cur[2 * a0], cur[2 * a0 + 1]]).toEqual([0, 0])
    // The kept share: (0.3 + 0.3 + 0.75) of (0.3 + 0.3 + 1.5).
    expect(scale).toBeCloseTo(1.35 / 2.1, 12)
    const f = new FoldCounter(map, u, u.start, pos)
    expect(f.newCrossings(u.start, cur).length).toBe(0)
    expect(f.newCrossings(u.start, pos).length).toBe(2)
  })

  it('reverts a boundary that folds at every scale', () => {
    // B's end pushed all the way across A: halving it to a sixteenth still
    // crosses, so B goes back to where it started.
    const map = handMap(
      8,
      8,
      [
        { points: [0, 0, 4, 0], left: 0, right: 1, start: 0, end: 1 },
        { points: [0, 0.01, 4, 1], left: 0, right: 1, start: 2, end: 3 },
      ],
      [
        [0, 0],
        [4, 0],
        [0, 0.01],
        [4, 1],
      ],
    )
    const u = buildUnknowns(map)
    const pos = u.start.slice()
    pos[2 * u.of[1][0] + 1] = -0.99
    const { pos: cur, scale } = foldGuard(map, u, pos)
    expect(Array.from(cur)).toEqual(Array.from(u.start))
    expect(scale).toBe(0)
  })

  it('keeps a crossing that was there at the start', () => {
    // Two boundaries crossing already; the solve moves both a little along
    // themselves without making any new pair cross.
    const map = handMap(
      6,
      6,
      [
        { points: [0, 1, 2, 1.5, 4, 2], left: 0, right: 1, start: 0, end: 1 },
        { points: [2, 0, 2.2, 2, 2.4, 4], left: 0, right: 1, start: 2, end: 3 },
      ],
      [
        [0, 1],
        [4, 2],
        [2, 0],
        [2.4, 4],
      ],
    )
    const u = buildUnknowns(map)
    const pos = u.start.slice()
    for (let k = 0; k < pos.length; k++) pos[k] += 0.05
    const { pos: cur, scale } = foldGuard(map, u, pos)
    expect(Array.from(cur)).toEqual(Array.from(pos))
    expect(scale).toBe(1)
  })
})
