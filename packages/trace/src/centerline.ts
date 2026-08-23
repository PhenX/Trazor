import type { BinaryMask, PathCommand } from '@vectorizer/core'
import { interiorAngleDeg, polylineLengthFlat } from '@vectorizer/core'
import { fitOpenPolyline } from './fit'
import { simplifyOpen } from './simplify'

export interface CenterlineOptions {
  /** Skeleton branches shorter than this (px) hanging off a junction are noise. */
  pruneLength: number
  /** Interior angle (deg) below which a vertex is kept as a hard corner. */
  cornerThreshold: number
  /** Max Bézier fitting deviation (px). */
  fitTolerance: number
  /** Pre-fit Douglas-Peucker epsilon (px). */
  simplifyTolerance: number
  /** 0..1 → light corner-preserving smoothing passes before fitting. */
  smoothing: number
  /**
   * Distance-to-background field at skeleton resolution (a chamfer transform,
   * indexed y*width+x). When present, each stroke reports its own width as the
   * median of 2×distance along its skeleton pixels, so a drawing with varying
   * line weight keeps that variation instead of one global average.
   */
  distanceField?: Float32Array
}

export interface StrokePath {
  commands: PathCommand[]
  closed: boolean
  length: number
  /** Median stroke width (px) along this chain; set only when `distanceField` is given. */
  width?: number
}

/**
 * Convert a thinned 1px-wide skeleton into smooth open strokes: build the
 * pixel graph (endpoints / corridors / junctions, redundant diagonals
 * suppressed), walk chains, prune short spurs, merge the straightest
 * continuations through junctions so crossing lines stay continuous, then
 * simplify + fit each chain with Schneider cubics.
 */
export function traceCenterline(skeleton: BinaryMask, opts: CenterlineOptions): StrokePath[] {
  const { width: w, height: h, data } = skeleton
  const at = (x: number, y: number): number =>
    x >= 0 && x < w && y >= 0 && y < h ? data[y * w + x] : 0

  // Condensed 8-neighborhood: a diagonal neighbor is redundant when either of
  // its orthogonal companions is set (an L-route exists), which prevents fake
  // junctions next to right-angle corners.
  const neighbors = (x: number, y: number, out: number[]): number => {
    let n = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue
        if (at(x + dx, y + dy) === 0) continue
        if (dx !== 0 && dy !== 0 && (at(x + dx, y) !== 0 || at(x, y + dy) !== 0)) continue
        out[n * 2] = x + dx
        out[n * 2 + 1] = y + dy
        n++
      }
    }
    return n
  }

  const idx = (x: number, y: number): number => y * w + x
  const deg = new Int8Array(w * h)
  const scratch: number[] = new Array(16)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y)] !== 0) deg[idx(x, y)] = neighbors(x, y, scratch) as number
    }
  }

  // Directed visit flags: bit per (pixel, neighbor direction).
  const visited = new Uint16Array(w * h)
  const markVisited = (x1: number, y1: number, x2: number, y2: number): void => {
    visited[idx(x1, y1)] |= 1 << dirBit(x2 - x1, y2 - y1)
    visited[idx(x2, y2)] |= 1 << dirBit(x1 - x2, y1 - y2)
  }
  const isVisited = (x1: number, y1: number, x2: number, y2: number): boolean =>
    (visited[idx(x1, y1)] & (1 << dirBit(x2 - x1, y2 - y1))) !== 0

  interface Chain {
    points: number[]
    /** Terminal kinds: 0 endpoint, 1 junction. */
    startKind: number
    endKind: number
    closed: boolean
    merged: boolean
  }
  const chains: Chain[] = []

  const isNode = (x: number, y: number): boolean => deg[idx(x, y)] !== 2

  const walk = (sx: number, sy: number, nx: number, ny: number): Chain => {
    const points = [sx + 0.5, sy + 0.5]
    let px = sx
    let py = sy
    let x = nx
    let y = ny
    markVisited(px, py, x, y)
    for (;;) {
      points.push(x + 0.5, y + 0.5)
      if (isNode(x, y) || (x === sx && y === sy)) break
      const n = neighbors(x, y, scratch)
      let fx = -1
      let fy = -1
      for (let i = 0; i < n; i++) {
        const cx = scratch[i * 2]
        const cy = scratch[i * 2 + 1]
        if (cx === px && cy === py) continue
        fx = cx
        fy = cy
        break
      }
      if (fx === -1) break // isolated stub
      markVisited(x, y, fx, fy)
      px = x
      py = y
      x = fx
      y = fy
    }
    const closed = x === sx && y === sy && points.length > 4
    return {
      points,
      startKind: deg[idx(sx, sy)] >= 3 ? 1 : 0,
      endKind: closed ? 1 : deg[idx(x, y)] >= 3 ? 1 : 0,
      closed,
      merged: false,
    }
  }

  // Chains from every node (endpoint or junction). walk() reuses the shared
  // scratch buffer, so the neighbor list must be snapshotted before walking.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y)] === 0 || !isNode(x, y)) continue
      const n = neighbors(x, y, scratch)
      const local = scratch.slice(0, n * 2)
      for (let i = 0; i < n; i++) {
        const cx = local[i * 2]
        const cy = local[i * 2 + 1]
        if (!isVisited(x, y, cx, cy)) chains.push(walk(x, y, cx, cy))
      }
    }
  }
  // Leftover pure cycles.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[idx(x, y)] === 0 || deg[idx(x, y)] !== 2) continue
      const n = neighbors(x, y, scratch)
      const local = scratch.slice(0, n * 2)
      for (let i = 0; i < n; i++) {
        const cx = local[i * 2]
        const cy = local[i * 2 + 1]
        if (!isVisited(x, y, cx, cy)) {
          const chain = walk(x, y, cx, cy)
          chain.closed = true
          chains.push(chain)
        }
      }
    }
  }

  // Prune short spurs: endpoint-to-junction whiskers below pruneLength.
  const kept = chains.filter((c) => {
    if (c.closed) return true
    const len = polylineLengthFlat(c.points)
    const isSpur = (c.startKind === 0) !== (c.endKind === 0) && len < opts.pruneLength
    const isCrumb = c.startKind === 0 && c.endKind === 0 && len < Math.min(2, opts.pruneLength)
    return !isSpur && !isCrumb
  })

  // Merge the straightest continuations through junctions.
  mergeThroughJunctions(kept)

  const strokes: StrokePath[] = []
  for (const chain of kept) {
    if (chain.merged) continue
    // Per-chain width from the dense skeleton pixels (before simplification).
    const width = opts.distanceField
      ? medianStrokeWidth(chain.points, opts.distanceField, w, h)
      : undefined
    // Smooth on the dense pixel chain (local, sub-pixel), THEN simplify —
    // the other order would average far-apart survivors and melt corners.
    let pts = chain.points
    if (opts.smoothing > 0) pts = smoothChain(pts, Math.round(opts.smoothing * 2), chain.closed)
    if (opts.simplifyTolerance > 0) pts = simplifyOpen(pts, opts.simplifyTolerance)
    if (pts.length < 4) continue

    const corners: number[] = []
    const n = pts.length >> 1
    for (let i = 1; i < n - 1; i++) {
      const angle = interiorAngleDeg(
        pts[(i - 1) * 2],
        pts[(i - 1) * 2 + 1],
        pts[i * 2],
        pts[i * 2 + 1],
        pts[(i + 1) * 2],
        pts[(i + 1) * 2 + 1],
      )
      if (angle < opts.cornerThreshold) corners.push(i)
    }

    const commands: PathCommand[] = [{ type: 'M', x: pts[0], y: pts[1] }]
    commands.push(...fitOpenPolyline(pts, opts.fitTolerance, corners))
    if (chain.closed) commands.push({ type: 'Z' })
    strokes.push({ commands, closed: chain.closed, length: polylineLengthFlat(pts), width })
  }
  strokes.sort((a, b) => b.length - a.length)
  return strokes

  function mergeThroughJunctions(list: Chain[]): void {
    interface End {
      chain: Chain
      atStart: boolean
      key: number
      dirX: number
      dirY: number
    }
    const byJunction = new Map<number, End[]>()
    for (const chain of list) {
      if (chain.closed) continue
      const p = chain.points
      const n = p.length >> 1
      if (n < 2) continue
      if (chain.startKind === 1) {
        const key = idx(Math.floor(p[0]), Math.floor(p[1]))
        const span = Math.min(3, n - 1)
        byJunction.set(key, [
          ...(byJunction.get(key) ?? []),
          {
            chain,
            atStart: true,
            key,
            dirX: p[span * 2] - p[0],
            dirY: p[span * 2 + 1] - p[1],
          },
        ])
      }
      if (chain.endKind === 1) {
        const key = idx(Math.floor(p[(n - 1) * 2]), Math.floor(p[(n - 1) * 2 + 1]))
        const span = Math.min(3, n - 1)
        byJunction.set(key, [
          ...(byJunction.get(key) ?? []),
          {
            chain,
            atStart: false,
            key,
            dirX: p[(n - 1 - span) * 2] - p[(n - 1) * 2],
            dirY: p[(n - 1 - span) * 2 + 1] - p[(n - 1) * 2 + 1],
          },
        ])
      }
    }

    // A chain may take part in at most ONE merge per pass: mergePair reorients
    // the survivor's point array, which invalidates the direction/atStart data
    // captured in every other End record of that chain — pairing it again with
    // stale records would splice at the wrong end and fabricate phantom
    // segments across empty space.
    const consumed = new Set<Chain>()
    for (const ends of byJunction.values()) {
      // Greedily pair the most opposed directions (angle closest to 180°).
      const available = ends.filter((e) => !e.chain.merged && !consumed.has(e.chain))
      const pairs: [End, End, number][] = []
      for (let i = 0; i < available.length; i++) {
        for (let j = i + 1; j < available.length; j++) {
          const a = available[i]
          const b = available[j]
          if (a.chain === b.chain) continue
          const la = Math.hypot(a.dirX, a.dirY) || 1
          const lb = Math.hypot(b.dirX, b.dirY) || 1
          const cos = (a.dirX * b.dirX + a.dirY * b.dirY) / (la * lb)
          pairs.push([a, b, cos])
        }
      }
      pairs.sort((p1, p2) => p1[2] - p2[2]) // most negative cos = straightest
      for (const [a, b, cos] of pairs) {
        if (cos > -0.5) break // require > 120° continuation
        if (consumed.has(a.chain) || consumed.has(b.chain)) continue
        if (a.chain.merged || b.chain.merged) continue
        mergePair(a, b)
        consumed.add(a.chain)
        consumed.add(b.chain)
      }
    }
  }

  function mergePair(
    a: { chain: Chain; atStart: boolean },
    b: { chain: Chain; atStart: boolean },
  ): void {
    // Orient A to END at the junction and B to START at it; B absorbs into A.
    const aPts = a.atStart ? reverseFlat(a.chain.points) : a.chain.points.slice()
    const bPts = b.atStart ? b.chain.points.slice() : reverseFlat(b.chain.points)
    // Drop B's duplicated junction point.
    const mergedPts = aPts.concat(bPts.slice(2))
    const survivor = a.chain
    survivor.points = mergedPts
    survivor.startKind = a.atStart ? a.chain.endKind : a.chain.startKind
    survivor.endKind = b.atStart ? b.chain.endKind : b.chain.startKind
    b.chain.merged = true
  }
}

/**
 * Median of 2×distance along a chain's skeleton pixels (points at +0.5 centers).
 * A robust per-stroke width estimate; returns undefined when nothing samples.
 */
function medianStrokeWidth(
  points: number[],
  field: Float32Array,
  w: number,
  h: number,
): number | undefined {
  const n = points.length >> 1
  const vals = new Float64Array(n)
  let cnt = 0
  for (let i = 0; i < n; i++) {
    const x = Math.floor(points[i * 2])
    const y = Math.floor(points[i * 2 + 1])
    if (x < 0 || y < 0 || x >= w || y >= h) continue
    vals[cnt++] = 2 * field[y * w + x]
  }
  if (cnt === 0) return undefined
  const view = vals.subarray(0, cnt)
  view.sort()
  const mid = cnt >> 1
  return cnt % 2 === 1 ? view[mid] : (view[mid - 1] + view[mid]) / 2
}

/** Bit index for a neighbor offset (dx, dy ∈ {-1,0,1}). */
function dirBit(dx: number, dy: number): number {
  return (dy + 1) * 3 + (dx + 1)
}

function reverseFlat(points: number[]): number[] {
  const n = points.length >> 1
  const out = new Array<number>(points.length)
  for (let i = 0; i < n; i++) {
    out[i * 2] = points[(n - 1 - i) * 2]
    out[i * 2 + 1] = points[(n - 1 - i) * 2 + 1]
  }
  return out
}

/** Corner-preserving local averaging (endpoints pinned). */
function smoothChain(points: number[], passes: number, closed: boolean): number[] {
  if (passes <= 0) return points
  let pts = points.slice()
  const n = pts.length >> 1
  if (n < 3) return pts
  for (let pass = 0; pass < passes; pass++) {
    const out = pts.slice()
    const from = closed ? 0 : 1
    const to = closed ? n : n - 1
    for (let i = from; i < to; i++) {
      const ip = (i + n - 1) % n
      const inx = (i + 1) % n
      out[i * 2] = pts[ip * 2] * 0.25 + pts[i * 2] * 0.5 + pts[inx * 2] * 0.25
      out[i * 2 + 1] = pts[ip * 2 + 1] * 0.25 + pts[i * 2 + 1] * 0.5 + pts[inx * 2 + 1] * 0.25
    }
    pts = out
  }
  return pts
}
