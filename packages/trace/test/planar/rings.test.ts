import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { LabelMap } from '@trazor/core'
import { splitFaces } from '../../src/planar/faces'
import { buildPlanarMap } from '../../src/planar/map'
import {
  faceNesting,
  faceRings,
  pointInPolygon,
  polygonArea,
  ringPolygon,
} from '../../src/planar/rings'
import { CLEAR, OUTSIDE } from '../../src/planar/types'
import type { Faces, FaceRing, PlanarMap } from '../../src/planar/types'

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

/** The face of a pixel's first pixel in raster order. */
function firstPixels(faces: Faces): number[] {
  const first = new Array<number>(faces.count).fill(-1)
  for (let p = 0; p < faces.ids.length; p++) if (first[faces.ids[p]] < 0) first[faces.ids[p]] = p
  return first
}

/** The node a ring entry's walk starts at and the one it ends at. */
function walkEnds(map: PlanarMap, k: number, reversed: boolean): [number, number] {
  const e = map.edges[k]
  return reversed ? [e.end, e.start] : [e.start, e.end]
}

/** Every way `rings` break the invariants of a face's rings (none when they keep them). */
function ringProblems(map: PlanarMap, rings: FaceRing[][]): string[] {
  const { faces, edges } = map
  const problems: string[] = []
  const fail = (what: string): void => {
    problems.push(what)
  }
  if (rings.length !== faces.count) fail('one ring list per face')
  const used = new Set<number>()
  for (let f = 0; f < faces.count; f++) {
    const fr = rings[f]
    if (fr.filter((r) => r.outer).length !== 1 || !fr[0]?.outer) fail(`face ${f}: outline`)
    let signed = 0
    let unsigned = 0
    for (const ring of fr) {
      if (ring.edges.length !== ring.reversed.length || ring.edges.length === 0) {
        fail(`face ${f}: ring arrays`)
      }
      for (let t = 0; t < ring.edges.length; t++) {
        const k = ring.edges[t]
        const rev = ring.reversed[t]
        const e = edges[k]
        // The face is on the walk's left.
        if ((rev ? e.right : e.left) !== f)
          fail(`face ${f}: edge ${k} walked with the face on its right`)
        const side = 2 * k + (rev ? 1 : 0)
        if (used.has(side)) fail(`side ${side} walked twice`)
        used.add(side)
        if (e.closed && ring.edges.length !== 1)
          fail(`face ${f}: closed edge ${k} inside a longer ring`)
        if (!e.closed) {
          // The walk closes: each edge starts where the previous one ended.
          const [, to] = walkEnds(map, k, rev)
          const nt = (t + 1) % ring.edges.length
          const [from] = walkEnds(map, ring.edges[nt], ring.reversed[nt])
          if (from !== to) fail(`face ${f}: ring breaks after edge ${k}`)
        }
      }
      const area = polygonArea(ringPolygon(map, ring))
      // Face on the left: the outline anticlockwise on screen (negative), holes clockwise.
      if (ring.outer ? area >= 0 : area <= 0) fail(`face ${f}: ring of area ${area}`)
      signed += area
      unsigned += ring.outer ? Math.abs(area) : -Math.abs(area)
    }
    // The rings enclose exactly the face's pixels, holes subtracted.
    if (signed !== -faces.area[f] || unsigned !== faces.area[f]) {
      fail(`face ${f}: rings enclose ${unsigned}, not ${faces.area[f]}`)
    }
  }
  // Every edge side that faces a face is walked exactly once.
  let sides = 0
  for (const e of edges) sides += (e.left !== OUTSIDE ? 1 : 0) + (e.right !== OUTSIDE ? 1 : 0)
  if (used.size !== sides) fail(`${used.size} of ${sides} edge sides walked`)
  return problems
}

/** Pixel centres outside their own face's outline or in one of its holes, or in another face. */
function containmentProblems(map: PlanarMap, rings: FaceRing[][]): string[] {
  const { faces } = map
  const problems: string[] = []
  const polys = rings.map((fr) => fr.map((r) => ringPolygon(map, r)))
  for (let p = 0; p < faces.ids.length; p++) {
    const x = (p % faces.width) + 0.5
    const y = Math.floor(p / faces.width) + 0.5
    for (let f = 0; f < faces.count; f++) {
      const inside =
        pointInPolygon(x, y, polys[f][0]) && !polys[f].slice(1).some((h) => pointInPolygon(x, y, h))
      if (inside !== (faces.ids[p] === f)) problems.push(`pixel ${p} and face ${f}`)
    }
  }
  return problems
}

/**
 * Nesting by brute force: a face's parent owns the smallest hole ring around its first pixel's
 * centre.
 */
function bruteParents(map: PlanarMap, rings: FaceRing[][]): number[] {
  const { faces } = map
  const first = firstPixels(faces)
  const holes: { face: number; poly: Float64Array; area: number }[] = []
  for (let f = 0; f < faces.count; f++) {
    for (const r of rings[f]) {
      if (r.outer) continue
      const poly = ringPolygon(map, r)
      holes.push({ face: f, poly, area: polygonArea(poly) })
    }
  }
  return first.map((p, f) => {
    const x = (p % faces.width) + 0.5
    const y = Math.floor(p / faces.width) + 0.5
    let best = -1
    let bestArea = Infinity
    for (const h of holes) {
      if (h.face !== f && h.area < bestArea && pointInPolygon(x, y, h.poly)) {
        best = h.face
        bestArea = h.area
      }
    }
    return best
  })
}

/** Ways {@link faceNesting} disagrees with brute force or with its own depth rules. */
function nestingProblems(map: PlanarMap, rings: FaceRing[][]): string[] {
  const nest = faceNesting(map, rings)
  const problems: string[] = []
  const brute = bruteParents(map, rings)
  for (let f = 0; f < map.faces.count; f++) {
    const p = nest.parent[f]
    if (p !== brute[f]) problems.push(`face ${f}: parent ${p}, brute force ${brute[f]}`)
    if (nest.depth[f] !== (p < 0 ? 0 : nest.depth[p] + 1)) problems.push(`face ${f}: depth`)
    const depths = Array.from(nest.ringDepth[f])
    if (depths.length !== rings[f].length) problems.push(`face ${f}: ring depths`)
    for (let r = 0; r < depths.length; r++) {
      if (depths[r] !== 2 * nest.depth[f] + (rings[f][r].outer ? 0 : 1)) {
        problems.push(`face ${f}: ring ${r} depth`)
      }
      // Even depth runs anticlockwise (negative), odd clockwise: nonzero paints what evenodd does.
      const area = polygonArea(ringPolygon(map, rings[f][r]))
      if (area < 0 !== (depths[r] % 2 === 0)) problems.push(`face ${f}: ring ${r} winding`)
    }
  }
  return problems
}

/** The rings of `map` and every invariant they, their containment or their nesting break. */
function analyze(map: PlanarMap): { rings: FaceRing[][]; problems: string[] } {
  const rings = faceRings(map)
  const problems = [
    ...ringProblems(map, rings),
    ...containmentProblems(map, rings),
    ...nestingProblems(map, rings),
  ]
  return { rings, problems }
}

describe('faceRings', () => {
  it('gives an island one ring and its surround an outline and a hole on the same edge', () => {
    const map = mapOf(['0000', '0110', '0110', '0000'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(rings).toEqual([
      [
        { edges: [0], reversed: [false], outer: true },
        { edges: [1], reversed: [true], outer: false },
      ],
      [{ edges: [1], reversed: [false], outer: true }],
    ])
    expect(Array.from(ringPolygon(map, rings[1][0]))).toEqual([
      1, 1, 1, 2, 1, 3, 2, 3, 3, 3, 3, 2, 3, 1, 2, 1,
    ])
    expect(Array.from(ringPolygon(map, rings[0][1]))).toEqual([
      1, 1, 2, 1, 3, 1, 3, 2, 3, 3, 2, 3, 1, 3, 1, 2,
    ])
    const nest = faceNesting(map, rings)
    expect(Array.from(nest.parent)).toEqual([-1, 0])
    expect(Array.from(nest.depth)).toEqual([0, 1])
    expect(nest.ringDepth.map((d) => Array.from(d))).toEqual([[0, 1], [2]])
  })

  it('makes both faces of a three-way junction reference the edge they share', () => {
    const map = mapOf(['0011', '0011', '2222', '2222'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    const shared = map.edges.findIndex(
      (e) => e.left !== OUTSIDE && e.right !== OUTSIDE && e.left + e.right === 1,
    )
    const e = map.edges[shared]
    const use = (f: number): boolean[] =>
      rings[f].flatMap((r) => r.edges.flatMap((k, t) => (k === shared ? [r.reversed[t]] : [])))
    expect(use(e.left)).toEqual([false])
    expect(use(e.right)).toEqual([true])
    expect(use(2)).toEqual([])
    for (const fr of rings) expect(fr.length).toBe(1)
  })

  it('nests a donut and the face in its hole', () => {
    const map = mapOf(['00000', '01110', '01210', '01110', '00000'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(rings.map((fr) => fr.length)).toEqual([2, 2, 1])
    const nest = faceNesting(map, rings)
    expect(Array.from(nest.parent)).toEqual([-1, 0, 1])
    expect(Array.from(nest.depth)).toEqual([0, 1, 2])
    expect(nest.ringDepth.map((d) => Array.from(d))).toEqual([[0, 1], [2, 3], [4]])
  })

  it('gives sibling pockets the face they sit in as parent', () => {
    // Two pockets in a field of 1s, each holding a 2 beside a 0: four faces in two holes.
    const map = mapOf([
      '0000000000',
      '0111111110',
      '0120110210',
      '0120110210',
      '0111111110',
      '0000000000',
    ])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(rings[1].length).toBe(3)
    expect(Array.from(faceNesting(map, rings).parent)).toEqual([-1, 0, 1, 1, 1, 1])
  })

  it('finds a parent the face does not touch', () => {
    // 4 is enclosed by 2 and 3 together, neither of which contains it: its parent is 1.
    const map = mapOf(['0000000', '0111110', '0122310', '0124310', '0122310', '0111110', '0000000'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    const nest = faceNesting(map, rings)
    const four = map.faces.ids[3 * 7 + 3]
    expect(map.faces.label[four]).toBe(4)
    expect(map.faces.label[nest.parent[four]]).toBe(1)
    expect(nest.depth[four]).toBe(2)
  })

  it('makes faces touching the frame roots, and the faces only they enclose together', () => {
    // 3 touches the frame and cuts the 0s' ring around the 1s, so no single face encloses the
    // 1s: they are a root as well; the 2 sits in their hole.
    const map = mapOf(['00000', '01110', '01210', '31110', '33000'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(Array.from(map.faces.label)).toEqual([0, 1, 2, 3])
    expect(Array.from(faceNesting(map, rings).parent)).toEqual([-1, -1, 1, -1])
    expect(rings.map((fr) => fr.length)).toEqual([1, 2, 1, 1])
  })

  it('nests opaque shapes in a transparent background', () => {
    const map = mapOf(['......', '.11...', '.11.2.', '......'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(Array.from(map.faces.label)).toEqual([CLEAR, 1, 2])
    expect(rings[0].length).toBe(3)
    expect(Array.from(faceNesting(map, rings).parent)).toEqual([-1, 0, 0])
  })

  it('closes the rings of a checkerboard through its four-way junction', () => {
    const map = mapOf(['010', '101', '010'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(rings.every((fr) => fr.length === 1)).toBe(true)
    expect(Array.from(faceNesting(map, rings).parent).every((p) => p === -1)).toBe(true)
  })

  it('keeps a ring for both shapes at a split saddle', () => {
    // inkvec `splitting_gives_each_shape_its_own_copy_of_the_corner`: faces 1 and 2 keep their
    // rings, and face 0 (one face on the diagonal) one outline through both copies.
    const map = buildPlanarMap(facesOf([1, 0, 0, 2], 2, 2))
    const rings = faceRings(map)
    expect(ringProblems(map, rings)).toEqual([])
    for (const f of [1, 2]) expect(rings[f].length).toBe(1)
    expect(rings[0].length).toBe(1)
  })

  it('gives a face one hole per island at adjacent saddles', () => {
    const map = mapOf(['00000', '01030', '00200', '00000'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    expect(rings[0].length).toBe(4)
    expect(rings[0].slice(1).every((r) => r.edges.length === 1 && !r.outer)).toBe(true)
    expect(Array.from(faceNesting(map, rings).parent)).toEqual([-1, 0, 0, 0])
  })

  it('walks a face that touches itself at a corner once per corner side', () => {
    // A ring of 1s whose hole (0 inside) touches the outside (2 in the corner) diagonally.
    const map = mapOf(['111', '101', '112'])
    const { rings, problems } = analyze(map)
    expect(problems).toEqual([])
    const one = map.faces.ids[0]
    expect(rings[one].length).toBe(2)
  })

  it('closes rings where both diagonals of a corner are one face each', () => {
    // Face ids that are not 4-connected: 0 on one diagonal, 1 on the other. The corner stays a
    // junction, and each face's walk keeps to its own corner of it.
    const map = buildPlanarMap(facesOf([0, 1, 1, 0], 2, 2))
    const rings = faceRings(map)
    const areas = rings.map((fr) => fr.map((r) => polygonArea(ringPolygon(map, r))))
    expect(areas).toEqual([
      [-1, -1],
      [-1, -1],
    ])
  })

  it('reads the same rings after the points move', () => {
    const rand = mulberry32(5)
    const data = Int32Array.from({ length: 15 * 12 }, (_, p) =>
      rand() < 0.2 ? 3 : (((p % 15) >> 2) + (Math.floor(p / 15) >> 2)) % 3,
    )
    const map = buildPlanarMap(splitFaces({ width: 15, height: 12, data, count: 4 }))
    const before = faceRings(map)
    const nestBefore = faceNesting(map, before)
    for (const e of map.edges) {
      for (let p = 0; p < e.fixed.length; p++) {
        if (e.fixed[p]) continue
        e.points[2 * p] += 0.4 * (rand() - 0.5)
        e.points[2 * p + 1] += 0.4 * (rand() - 0.5)
      }
    }
    const after = faceRings(map)
    expect(after).toEqual(before)
    expect(faceNesting(map, after)).toEqual(nestBefore)
  })

  it('keeps every invariant on random maps', () => {
    const rand = mulberry32(13)
    for (const [w, h] of [
      [1, 1],
      [1, 6],
      [6, 1],
      [3, 3],
      [8, 7],
      [15, 11],
    ]) {
      for (let k = 2; k <= 4; k++) {
        const noise = new Int32Array(w * h)
        const blobs = new Int32Array(w * h)
        for (let p = 0; p < w * h; p++) {
          const x = p % w
          const y = (p - x) / w
          noise[p] = Math.floor(rand() * k) - 1
          blobs[p] = rand() < 0.2 ? Math.floor(rand() * k) : ((x >> 2) + (y >> 2)) % k
        }
        for (const data of [noise, blobs]) {
          const map = buildPlanarMap(splitFaces({ width: w, height: h, data, count: k }))
          expect(analyze(map).problems).toEqual([])
        }
      }
    }
  })

  it('is deterministic', () => {
    const rand = mulberry32(17)
    const data = Int32Array.from({ length: 20 * 16 }, () => Math.floor(rand() * 3))
    const map = buildPlanarMap(splitFaces({ width: 20, height: 16, data, count: 3 }))
    const a = faceRings(map)
    const b = faceRings(map)
    expect(a).toEqual(b)
    expect(faceNesting(map, a)).toEqual(faceNesting(map, b))
  })
})

describe('polygonArea and pointInPolygon', () => {
  it('measure a unit square either way round', () => {
    const ccw = Float64Array.from([0, 0, 0, 1, 1, 1, 1, 0])
    const cw = Float64Array.from([0, 0, 1, 0, 1, 1, 0, 1])
    expect(polygonArea(ccw)).toBe(-1)
    expect(polygonArea(cw)).toBe(1)
    expect(pointInPolygon(0.5, 0.5, ccw)).toBe(true)
    expect(pointInPolygon(1.5, 0.5, cw)).toBe(false)
    expect(polygonArea(Float64Array.from([0, 0, 1, 1]))).toBe(0)
    expect(pointInPolygon(0.5, 0.5, Float64Array.from([0, 0, 1, 1]))).toBe(false)
  })
})
