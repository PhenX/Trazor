import type { FlatPoints } from '../paths'
import type { PathSums, QuadForm } from './sums'
import { addQuadForms, evalQuadForm, lineQuadForm, pointSlope } from './sums'

/**
 * Vertex adjustment (Selinger 2003, §2.3.1): each polygon vertex moves to the
 * point minimizing the summed squared distance to the best-fit lines of its
 * two incident edges, constrained to the unit square centered on the original
 * lattice vertex.
 *
 * `vertexIdx` are ascending path indices into `points` (the extended array for
 * closed rings, where the last point repeats the first). For closed rings the
 * first and last vertex are the same path point; pass `closed: true` so the
 * shared vertex is adjusted against the wrap-around edge pair. For open chains
 * the endpoints stay exactly at their lattice positions.
 */
export function adjustVertices(
  points: FlatPoints,
  sums: PathSums,
  vertexIdx: number[],
  closed: boolean,
): FlatPoints {
  const m = vertexIdx.length
  const out: FlatPoints = new Array(m * 2)

  // Best-fit line per polygon edge k: subpath [vertexIdx[k], vertexIdx[k+1]].
  const edgeCount = m - 1
  const edgeQ: QuadForm[] = new Array(edgeCount)
  for (let k = 0; k < edgeCount; k++) {
    const { cx, cy, dx, dy } = pointSlope(points, sums, vertexIdx[k], vertexIdx[k + 1])
    edgeQ[k] = lineQuadForm(cx, cy, dx, dy)
  }

  for (let k = 0; k < m; k++) {
    const wx = points[vertexIdx[k] * 2]
    const wy = points[vertexIdx[k] * 2 + 1]

    let qPrev: QuadForm | null = null
    let qNext: QuadForm | null = null
    if (k > 0) qPrev = edgeQ[k - 1]
    else if (closed) qPrev = edgeQ[edgeCount - 1]
    if (k < edgeCount) qNext = edgeQ[k]
    else if (closed) qNext = edgeQ[0]

    if (!qPrev || !qNext) {
      // Open-chain endpoint: pinned.
      out[k * 2] = wx
      out[k * 2 + 1] = wy
      continue
    }

    const Q = addQuadForms(qPrev, qNext)
    const [x, y] = minimizeInUnitSquare(Q, wx, wy)
    out[k * 2] = x
    out[k * 2 + 1] = y
  }

  if (closed) {
    // Keep the ring watertight: last vertex mirrors the first.
    out[(m - 1) * 2] = out[0]
    out[(m - 1) * 2 + 1] = out[1]
  }
  return out
}

/** Minimize the quadratic form over the unit square centered at (wx, wy). */
function minimizeInUnitSquare(Q: QuadForm, wx: number, wy: number): [number, number] {
  // Unconstrained minimum: ∇q = 0.
  const a = 2 * Q[0]
  const b = Q[1] + Q[3]
  const c = Q[2] + Q[6]
  const d = b
  const e = 2 * Q[4]
  const f = Q[5] + Q[7]
  const det = a * e - b * d
  if (Math.abs(det) > 1e-9) {
    const x = (-c * e + f * b) / det
    const y = (-a * f + c * d) / det
    if (Math.abs(x - wx) <= 0.5 && Math.abs(y - wy) <= 0.5) return [x, y]
  }

  // Constrained: best point among the square's edges and corners and center.
  let bestX = wx
  let bestY = wy
  let best = evalQuadForm(Q, wx, wy)
  const consider = (x: number, y: number) => {
    const v = evalQuadForm(Q, x, y)
    if (v < best) {
      best = v
      bestX = x
      bestY = y
    }
  }

  // Fixed x edges: minimize the 1D quadratic in y, then clamp.
  for (const x of [wx - 0.5, wx + 0.5]) {
    // q(y) = Q4 y² + (b·x + f') y + …; derivative: 2·Q4·y + (Q1+Q3)x + (Q5+Q7) = 0
    if (Math.abs(e) > 1e-12) {
      const y = clamp((-b * x - f) / e, wy - 0.5, wy + 0.5)
      consider(x, y)
    }
    consider(x, wy - 0.5)
    consider(x, wy + 0.5)
  }
  for (const y of [wy - 0.5, wy + 0.5]) {
    if (Math.abs(a) > 1e-12) {
      const x = clamp((-d * y - c) / a, wx - 0.5, wx + 0.5)
      consider(x, y)
    }
    consider(wx - 0.5, y)
    consider(wx + 0.5, y)
  }
  return [bestX, bestY]
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}
