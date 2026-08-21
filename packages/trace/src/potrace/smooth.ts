import type { FlatPoints } from '../paths'

/**
 * One piece of the smoothed outline, spanning from the previous segment's end
 * anchor to `ex,ey` (the midpoint of the edge after this vertex, or the exact
 * chain endpoint). Corners route through the vertex with two straight lines.
 */
export interface CurvePiece {
  corner: boolean
  /** Vertex position (corner routing point). */
  vx: number
  vy: number
  /** Cubic controls (curve pieces only). */
  c1x: number
  c1y: number
  c2x: number
  c2y: number
  /** End anchor of this piece. */
  ex: number
  ey: number
}

/**
 * Corner analysis and curve generation (Selinger 2003, §2.3.2). For each
 * vertex b between neighbors a and c the smoothness α is derived from how far
 * b sticks out of the chord a–c; α ≥ alphamax keeps a sharp corner, smaller α
 * produces a cubic through the two adjacent edge midpoints with controls
 * sliding from the midpoints toward b.
 */
export function smoothVertex(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
  alphamax: number,
): CurvePiece {
  const denom = Math.abs(cx - ax) + Math.abs(cy - ay)
  let alpha: number
  if (denom !== 0) {
    const dpara = Math.abs((bx - ax) * (cy - ay) - (cx - ax) * (by - ay))
    const dd = dpara / denom
    alpha = dd > 1 ? 1 - 1 / dd : 0
    alpha = alpha / 0.75
  } else {
    alpha = 4 / 3
  }

  const zax = (ax + bx) / 2
  const zay = (ay + by) / 2
  const zcx = (bx + cx) / 2
  const zcy = (by + cy) / 2

  if (alpha >= alphamax) {
    return { corner: true, vx: bx, vy: by, c1x: 0, c1y: 0, c2x: 0, c2y: 0, ex: zcx, ey: zcy }
  }

  const a = alpha < 0.55 ? 0.55 : alpha > 1 ? 1 : alpha
  return {
    corner: false,
    vx: bx,
    vy: by,
    c1x: zax + a * (bx - zax),
    c1y: zay + a * (by - zay),
    c2x: zcx + a * (bx - zcx),
    c2y: zcy + a * (by - zcy),
    ex: zcx,
    ey: zcy,
  }
}

/**
 * Smooth a closed vertex ring. `vertices` is a flat ring WITHOUT the duplicate
 * end point. Returns the pieces in vertex order; piece i spans mid(v[i-1],v[i])
 * → mid(v[i],v[i+1]).
 */
export function smoothClosed(vertices: FlatPoints, alphamax: number): CurvePiece[] {
  const m = vertices.length >> 1
  const pieces: CurvePiece[] = new Array(m)
  for (let i = 0; i < m; i++) {
    const ip = (i + m - 1) % m
    const inx = (i + 1) % m
    pieces[i] = smoothVertex(
      vertices[ip * 2],
      vertices[ip * 2 + 1],
      vertices[i * 2],
      vertices[i * 2 + 1],
      vertices[inx * 2],
      vertices[inx * 2 + 1],
      alphamax,
    )
  }
  return pieces
}

/**
 * Smooth an open chain with exact endpoints. Returns interior pieces only
 * (vertices 1..m-2); the caller connects v0 → mid(v0,v1) and
 * mid(v[m-2],v[m-1]) → v[m-1] with straight lines.
 */
export function smoothOpen(vertices: FlatPoints, alphamax: number): CurvePiece[] {
  const m = vertices.length >> 1
  const pieces: CurvePiece[] = []
  for (let i = 1; i < m - 1; i++) {
    pieces.push(
      smoothVertex(
        vertices[(i - 1) * 2],
        vertices[(i - 1) * 2 + 1],
        vertices[i * 2],
        vertices[i * 2 + 1],
        vertices[(i + 1) * 2],
        vertices[(i + 1) * 2 + 1],
        alphamax,
      ),
    )
  }
  return pieces
}
