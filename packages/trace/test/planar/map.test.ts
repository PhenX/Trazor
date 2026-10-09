import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { LabelMap } from '@trazor/core'
import { splitFaces } from '../../src/planar/faces'
import { buildPlanarMap } from '../../src/planar/map'
import { CLEAR, OUTSIDE } from '../../src/planar/types'
import type { Faces, PlanarMap } from '../../src/planar/types'

/** Rows of digits → a label map; `.` is transparent ({@link CLEAR}). */
function labelsOf(rows: string[]): LabelMap {
  const height = rows.length
  const width = rows[0].length
  const data = new Int32Array(width * height)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const l = ch === '.' ? CLEAR : Number(ch)
      data[y * width + x] = l
      count = Math.max(count, l + 1)
    }
  }
  return { width, height, data, count }
}

function mapOf(rows: string[]): PlanarMap {
  return buildPlanarMap(splitFaces(labelsOf(rows)))
}

/** Faces taken as given (ids need not be 4-connected), each face its own label. */
function facesOf(ids: number[], width: number, height: number): Faces {
  const count = Math.max(...ids) + 1
  const area = new Uint32Array(count)
  for (const id of ids) area[id]++
  return {
    width,
    height,
    ids: Int32Array.from(ids),
    count,
    label: Int32Array.from({ length: count }, (_, i) => i),
    area,
  }
}

/** Face of pixel `(x, y)`, OUTSIDE beyond the frame. */
function faceAt(faces: Faces, x: number, y: number): number {
  return x < 0 || y < 0 || x >= faces.width || y >= faces.height
    ? OUTSIDE
    : faces.ids[y * faces.width + x]
}

/**
 * The faces on the left and the right of a unit lattice step from `(x, y)` by `(dx, dy)`,
 * walking it in the y-down frame (screen view).
 */
function sidesOfStep(faces: Faces, x: number, y: number, dx: number, dy: number): [number, number] {
  if (dx === 1) return [faceAt(faces, x, y - 1), faceAt(faces, x, y)]
  if (dx === -1) return [faceAt(faces, x - 1, y), faceAt(faces, x - 1, y - 1)]
  if (dy === 1) return [faceAt(faces, x, y), faceAt(faces, x - 1, y)]
  return [faceAt(faces, x - 1, y - 1), faceAt(faces, x, y - 1)]
}

/** Every crack of a face map (a pixel side between two different faces, frame included). */
function cracks(faces: Faces): Set<string> {
  const out = new Set<string>()
  const { width: w, height: h } = faces
  for (let y = 0; y < h; y++) {
    for (let x = 0; x <= w; x++) {
      if (faceAt(faces, x - 1, y) !== faceAt(faces, x, y)) out.add(`${x},${y},${x},${y + 1}`)
    }
  }
  for (let y = 0; y <= h; y++) {
    for (let x = 0; x < w; x++) {
      if (faceAt(faces, x, y - 1) !== faceAt(faces, x, y)) out.add(`${x},${y},${x + 1},${y}`)
    }
  }
  return out
}

/** Key of the unit step between two lattice points, independent of its direction. */
function stepKey(x0: number, y0: number, x1: number, y1: number): string {
  return x0 < x1 || y0 < y1 ? `${x0},${y0},${x1},${y1}` : `${x1},${y1},${x0},${y0}`
}

/** Direction class of an end's outward step, counter-clockwise on screen from +x. */
function dirClass(dx: number, dy: number): number {
  return dx > 0 ? 0 : dy < 0 ? 1 : dx < 0 ? 2 : 3
}

/** Every way `map` breaks the structural invariants of a planar map (none when it keeps them). */
function mapProblems(map: PlanarMap): string[] {
  const { faces, width: w, height: h } = map
  const problems: string[] = []
  const fail = (what: string): void => {
    problems.push(what)
  }
  const seen = new Set<string>()
  for (let e = 0; e < map.edges.length; e++) {
    const edge = map.edges[e]
    const n = edge.points.length / 2
    if (edge.sigma.length !== n || edge.fixed.length !== n) fail(`edge ${e}: per-point arrays`)
    if (edge.left === edge.right) fail(`edge ${e}: one face on both sides`)
    if (!edge.sigma.every((s) => s === 0.5)) fail(`edge ${e}: sigma`)
    const steps = edge.closed ? n : n - 1
    for (let p = 0; p < steps; p++) {
      const q = (p + 1) % n
      const x0 = edge.points[2 * p]
      const y0 = edge.points[2 * p + 1]
      const x1 = edge.points[2 * q]
      const y1 = edge.points[2 * q + 1]
      if (Math.abs(x1 - x0) + Math.abs(y1 - y0) !== 1) fail(`edge ${e}: step ${p} not a unit step`)
      // Walking the stored direction, `left` is on the left in the y-down frame.
      const [l, r] = sidesOfStep(faces, x0, y0, x1 - x0, y1 - y0)
      if (l !== edge.left || r !== edge.right) fail(`edge ${e}: step ${p} has ${l}|${r}`)
      const key = stepKey(x0, y0, x1, y1)
      if (seen.has(key)) fail(`crack ${key} stored twice`)
      seen.add(key)
    }
    for (let p = 0; p < n; p++) {
      const x = edge.points[2 * p]
      const y = edge.points[2 * p + 1]
      if (!Number.isInteger(x) || !Number.isInteger(y))
        fail(`edge ${e}: point ${p} off the lattice`)
      const onFrame = x === 0 || x === w || y === 0 || y === h
      const isNode = !edge.closed && (p === 0 || p === n - 1)
      if (edge.fixed[p] !== (onFrame || isNode ? 1 : 0)) fail(`edge ${e}: fixed[${p}]`)
    }
    if (edge.closed) {
      if (edge.start !== -1 || edge.end !== -1) fail(`closed edge ${e} has nodes`)
      if (n < 4) fail(`closed edge ${e} has ${n} points`)
    } else {
      const s = map.nodes[edge.start]
      const t = map.nodes[edge.end]
      if (edge.points[0] !== s.x || edge.points[1] !== s.y) fail(`edge ${e}: start off its node`)
      if (edge.points[2 * n - 2] !== t.x || edge.points[2 * n - 1] !== t.y) {
        fail(`edge ${e}: end off its node`)
      }
      if (!s.ends.includes(2 * e) || !t.ends.includes(2 * e + 1)) fail(`edge ${e}: ends unlisted`)
    }
  }
  // Every crack lies on exactly one edge, once.
  const all = cracks(faces)
  if (seen.size !== all.size || [...all].some((c) => !seen.has(c))) fail('cracks not covered')
  const endsSeen = new Set<number>()
  for (let v = 0; v < map.nodes.length; v++) {
    const node = map.nodes[v]
    if (node.ends.length < 3) fail(`node ${v} has ${node.ends.length} ends`)
    const classes = node.ends.map((end) => {
      if (endsSeen.has(end)) fail(`end ${end} at two nodes`)
      endsSeen.add(end)
      const edge = map.edges[end >> 1]
      const n = edge.points.length / 2
      const [a, b] = end & 1 ? [n - 1, n - 2] : [0, 1]
      if ((end & 1 ? edge.end : edge.start) !== v) fail(`end ${end} listed at node ${v}`)
      const dx = edge.points[2 * b] - edge.points[2 * a]
      const dy = edge.points[2 * b + 1] - edge.points[2 * a + 1]
      return dirClass(dx, dy)
    })
    // Counter-clockwise on screen, from +x.
    for (let k = 1; k < classes.length; k++) {
      if (classes[k] <= classes[k - 1]) fail(`node ${v}: ends out of order`)
    }
  }
  if (endsSeen.size !== 2 * map.edges.filter((e) => !e.closed).length) fail('open ends unlisted')
  return problems
}

/** Edges ending at `(x, y)`, and edges carrying it at all (inkvec `at_point`). */
function atPoint(map: PlanarMap, x: number, y: number): [number, number] {
  let ending = 0
  let carrying = 0
  for (const e of map.edges) {
    const n = e.points.length / 2
    const at = (p: number): boolean => e.points[2 * p] === x && e.points[2 * p + 1] === y
    if (!e.closed && (at(0) || at(n - 1))) ending++
    let any = false
    for (let p = 0; p < n; p++) any ||= at(p)
    if (any) carrying++
  }
  return [ending, carrying]
}

function pointsOf(map: PlanarMap, e: number): number[][] {
  const pts = map.edges[e].points
  const out: number[][] = []
  for (let p = 0; p < pts.length; p += 2) out.push([pts[p], pts[p + 1]])
  return out
}

describe('buildPlanarMap', () => {
  it('stores an island as one closed edge, walked anticlockwise with the island on its left', () => {
    const map = mapOf(['0000', '0110', '0110', '0000'])
    expect(mapProblems(map)).toEqual([])
    expect(map.nodes).toEqual([])
    expect(map.edges.length).toBe(2)
    const [frame, island] = map.edges
    expect([frame.left, frame.right]).toEqual([0, OUTSIDE])
    expect(frame.closed).toBe(true)
    expect(Array.from(frame.fixed).every((f) => f === 1)).toBe(true)
    expect([island.left, island.right]).toEqual([1, 0])
    expect(island.closed).toBe(true)
    expect(pointsOf(map, 1)).toEqual([
      [1, 1],
      [1, 2],
      [1, 3],
      [2, 3],
      [3, 3],
      [3, 2],
      [3, 1],
      [2, 1],
    ])
    expect(Array.from(island.fixed).every((f) => f === 0)).toBe(true)
  })

  it('closes faces that touch the frame against OUTSIDE', () => {
    const map = mapOf(['0011', '0011'])
    expect(mapProblems(map)).toEqual([])
    expect(map.nodes).toEqual([
      { x: 2, y: 0, ends: [4, 2, 0] },
      { x: 2, y: 2, ends: [5, 1, 3] },
    ])
    expect(map.edges.map((e) => [e.left, e.right, e.start, e.end])).toEqual([
      [1, 0, 0, 1],
      [0, OUTSIDE, 0, 1],
      [OUTSIDE, 1, 0, 1],
    ])
    expect(pointsOf(map, 0)).toEqual([
      [2, 0],
      [2, 1],
      [2, 2],
    ])
    expect(pointsOf(map, 1)).toEqual([
      [2, 0],
      [1, 0],
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 2],
      [2, 2],
    ])
    // The interior boundary moves; only its nodes are fixed.
    expect(Array.from(map.edges[0].fixed)).toEqual([1, 0, 1])
    expect(Array.from(map.edges[2].fixed).every((f) => f === 1)).toBe(true)
  })

  it('meets three faces at one node and stores each boundary between two of them once', () => {
    const map = mapOf(['0011', '0011', '2222', '2222'])
    expect(mapProblems(map)).toEqual([])
    const centre = map.nodes.findIndex((n) => n.x === 2 && n.y === 2)
    expect(centre).toBeGreaterThanOrEqual(0)
    expect(map.nodes[centre].ends.length).toBe(3)
    const pairs = map.edges.map((e) =>
      [Math.min(e.left, e.right), Math.max(e.left, e.right)].join(),
    )
    for (const pair of ['0,1', '0,2', '1,2']) expect(pairs.filter((p) => p === pair).length).toBe(1)
    // The three interior boundaries all end at the centre.
    const inner = map.edges.filter((e) => e.left !== OUTSIDE && e.right !== OUTSIDE)
    expect(inner.length).toBe(3)
    expect(inner.every((e) => e.start === centre || e.end === centre)).toBe(true)
  })

  it('separates a hole from its surround with two closed edges', () => {
    const map = mapOf(['00000', '01110', '01210', '01110', '00000'])
    expect(mapProblems(map)).toEqual([])
    expect(map.nodes).toEqual([])
    expect(map.edges.map((e) => [e.left, e.right, e.closed])).toEqual([
      [0, OUTSIDE, true],
      [1, 0, true],
      [2, 1, true],
    ])
  })

  it('keeps a checkerboard corner a four-way junction', () => {
    const map = mapOf(['01', '10'])
    expect(mapProblems(map)).toEqual([])
    expect(map.faces.count).toBe(4)
    const centre = map.nodes.find((n) => n.x === 1 && n.y === 1)
    expect(centre?.ends.length).toBe(4)
    expect(atPoint(map, 1, 1)).toEqual([4, 4])
  })

  it('keeps a corner of four different faces a junction', () => {
    // inkvec `four_inks_meeting_at_a_corner_stay_a_junction`.
    const map = buildPlanarMap(facesOf([1, 0, 3, 2], 2, 2))
    expect(mapProblems(map)).toEqual([])
    expect(atPoint(map, 1, 1)[0]).toBe(4)
  })

  it('gives each of two shapes touching at a one-face diagonal its own copy of the corner', () => {
    // inkvec `a_corner_two_shapes_share_becomes_two_points` and
    // `splitting_gives_each_shape_its_own_copy_of_the_corner`: the 0s are one face meeting at
    // the centre, 1 and 2 two shapes that touch there and nowhere else.
    const map = buildPlanarMap(facesOf([1, 0, 0, 2], 2, 2))
    expect(mapProblems(map)).toEqual([])
    expect(atPoint(map, 1, 1)).toEqual([0, 2])
    expect(map.nodes.every((n) => n.x !== 1 || n.y !== 1)).toBe(true)
    expect(map.edges.every((e) => e.left !== e.right)).toBe(true)
  })

  it('splits a saddle whose cut face meets the corner beside it at a second saddle', () => {
    // B (2) sits under A (0) between two islands, D (1) and C (3): both of B's top corners are
    // saddles cutting B from an island, and the crack between them is B's at both.
    const map = mapOf(['00000', '01030', '00200', '00000'])
    expect(mapProblems(map)).toEqual([])
    expect(map.nodes).toEqual([])
    expect(map.edges.every((e) => e.closed)).toBe(true)
    expect(map.edges.map((e) => [e.left, e.right])).toEqual([
      [0, OUTSIDE],
      [1, 0],
      [2, 0],
      [3, 0],
    ])
    expect(pointsOf(map, 3)).toEqual([
      [2, 2],
      [2, 3],
      [3, 3],
      [3, 2],
    ])
    expect(atPoint(map, 2, 2)).toEqual([0, 2])
    expect(atPoint(map, 3, 2)).toEqual([0, 2])
  })

  it('treats transparency as a face of its own', () => {
    const map = mapOf(['....', '.11.', '.11.', '....'])
    expect(mapProblems(map)).toEqual([])
    expect(Array.from(map.faces.label)).toEqual([CLEAR, 1])
    expect(map.edges.map((e) => [e.left, e.right])).toEqual([
      [0, OUTSIDE],
      [1, 0],
    ])
  })

  it('gives every component of one label its own face and boundary', () => {
    const map = mapOf(['00000', '01010', '00000'])
    expect(mapProblems(map)).toEqual([])
    expect(map.faces.count).toBe(3)
    expect(Array.from(map.faces.label)).toEqual([0, 1, 1])
    expect(map.edges.map((e) => [e.left, e.right])).toEqual([
      [0, OUTSIDE],
      [1, 0],
      [2, 0],
    ])
  })

  it('handles one face, one pixel and empty images', () => {
    const one = mapOf(['000', '000'])
    expect(mapProblems(one)).toEqual([])
    expect(one.edges.length).toBe(1)
    expect(pointsOf(one, 0).length).toBe(10)
    const pixel = mapOf(['5'])
    expect(mapProblems(pixel)).toEqual([])
    expect(pointsOf(pixel, 0)).toEqual([
      [0, 0],
      [0, 1],
      [1, 1],
      [1, 0],
    ])
    const empty = buildPlanarMap(facesOf([0], 1, 1))
    expect(empty.edges.length).toBe(1)
    const none = buildPlanarMap(
      splitFaces({ width: 0, height: 3, data: new Int32Array(0), count: 0 }),
    )
    expect(none.edges).toEqual([])
    expect(none.nodes).toEqual([])
  })

  it('keeps every invariant on random maps', () => {
    const rand = mulberry32(11)
    for (const [w, h] of [
      [1, 1],
      [1, 7],
      [7, 1],
      [2, 2],
      [6, 5],
      [17, 13],
      [31, 24],
    ]) {
      for (let k = 2; k <= 5; k++) {
        const noise = new Int32Array(w * h)
        const blobs = new Int32Array(w * h)
        for (let p = 0; p < w * h; p++) {
          const x = p % w
          const y = (p - x) / w
          noise[p] = Math.floor(rand() * k) - 1
          blobs[p] = rand() < 0.15 ? Math.floor(rand() * k) : ((x >> 2) ^ (y >> 1)) % k
        }
        for (const data of [noise, blobs]) {
          const map = buildPlanarMap(splitFaces({ width: w, height: h, data, count: k }))
          expect(mapProblems(map)).toEqual([])
        }
      }
    }
  })

  it('is deterministic', () => {
    const rand = mulberry32(3)
    const data = Int32Array.from({ length: 23 * 19 }, () => Math.floor(rand() * 3))
    const faces = splitFaces({ width: 23, height: 19, data, count: 3 })
    expect(buildPlanarMap(faces)).toEqual(buildPlanarMap(faces))
  })
})
