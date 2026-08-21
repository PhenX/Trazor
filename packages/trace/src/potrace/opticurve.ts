import type { PathCommand } from '@vectorizer/core'
import { cubicAt } from '../paths'
import type { Cubic } from '../fit'
import { distanceToCubic, fitCubicSegment } from '../fit'
import type { CurvePiece } from './smooth'

/**
 * Curve optimization in the spirit of Selinger 2003 §2.4: replace runs of
 * consecutive smooth cubic pieces by a single cubic when it stays within
 * `optTolerance` of the original pieces, preserving end tangents. This
 * implementation merges greedily (longest run first) with sampled deviation
 * checks instead of the paper's closed-form pentagon test — simpler, and the
 * tolerance semantics are the same.
 */
export function assemblePieces(
  startX: number,
  startY: number,
  pieces: CurvePiece[],
  optimize: boolean,
  optTolerance: number,
): PathCommand[] {
  const out: PathCommand[] = []
  let ax = startX
  let ay = startY
  let i = 0
  while (i < pieces.length) {
    const piece = pieces[i]
    if (piece.corner) {
      out.push({ type: 'L', x: piece.vx, y: piece.vy })
      out.push({ type: 'L', x: piece.ex, y: piece.ey })
      ax = piece.ex
      ay = piece.ey
      i++
      continue
    }
    // Collect the maximal run of smooth pieces.
    let runEnd = i
    while (runEnd + 1 < pieces.length && !pieces[runEnd + 1].corner) runEnd++
    emitRun(pieces, i, runEnd, ax, ay, optimize, optTolerance, out)
    ax = pieces[runEnd].ex
    ay = pieces[runEnd].ey
    i = runEnd + 1
  }
  return out
}

const MAX_MERGE = 24

function emitRun(
  pieces: CurvePiece[],
  from: number,
  to: number,
  startX: number,
  startY: number,
  optimize: boolean,
  tol: number,
  out: PathCommand[],
): void {
  let ax = startX
  let ay = startY
  let i = from
  while (i <= to) {
    let merged = false
    if (optimize && tol > 0) {
      const maxJ = Math.min(to, i + MAX_MERGE - 1)
      for (let j = maxJ; j > i; j--) {
        const cubic = tryMerge(pieces, i, j, ax, ay, tol)
        if (cubic) {
          out.push({
            type: 'C',
            x1: cubic.c1x,
            y1: cubic.c1y,
            x2: cubic.c2x,
            y2: cubic.c2y,
            x: cubic.p3x,
            y: cubic.p3y,
          })
          ax = cubic.p3x
          ay = cubic.p3y
          i = j + 1
          merged = true
          break
        }
      }
    }
    if (!merged) {
      const p = pieces[i]
      out.push({ type: 'C', x1: p.c1x, y1: p.c1y, x2: p.c2x, y2: p.c2y, x: p.ex, y: p.ey })
      ax = p.ex
      ay = p.ey
      i++
    }
  }
}

/** Attempt to replace pieces [i..j] (all smooth) by one cubic within tol. */
function tryMerge(
  pieces: CurvePiece[],
  i: number,
  j: number,
  startX: number,
  startY: number,
  tol: number,
): Cubic | null {
  // Guard: consistent turning and total angle below ~179°.
  let prevDx = pieces[i].ex - startX
  let prevDy = pieces[i].ey - startY
  let sign = 0
  let totalAngle = 0
  let sx = pieces[i].ex
  let sy = pieces[i].ey
  for (let k = i + 1; k <= j; k++) {
    const dx = pieces[k].ex - sx
    const dy = pieces[k].ey - sy
    const cross = prevDx * dy - prevDy * dx
    const s = Math.sign(cross)
    if (s !== 0) {
      if (sign === 0) sign = s
      else if (s !== sign) return null
    }
    const dot = prevDx * dx + prevDy * dy
    totalAngle += Math.abs(Math.atan2(Math.abs(cross), dot))
    if (totalAngle > Math.PI * 0.994) return null
    prevDx = dx
    prevDy = dy
    sx = pieces[k].ex
    sy = pieces[k].ey
  }

  // Sample the original pieces densely.
  const samples: number[] = [startX, startY]
  let ax = startX
  let ay = startY
  for (let k = i; k <= j; k++) {
    const p = pieces[k]
    for (let s = 1; s <= 8; s++) {
      const [x, y] = cubicAt(ax, ay, p.c1x, p.c1y, p.c2x, p.c2y, p.ex, p.ey, s / 8)
      samples.push(x, y)
    }
    ax = p.ex
    ay = p.ey
  }

  // End tangents from the first/last original controls.
  let t0x = pieces[i].c1x - startX
  let t0y = pieces[i].c1y - startY
  let l0 = Math.hypot(t0x, t0y)
  if (l0 < 1e-9) {
    t0x = samples[2] - startX
    t0y = samples[3] - startY
    l0 = Math.hypot(t0x, t0y) || 1
  }
  const last = pieces[j]
  let t1x = last.c2x - last.ex
  let t1y = last.c2y - last.ey
  let l1 = Math.hypot(t1x, t1y)
  if (l1 < 1e-9) {
    const m = samples.length
    t1x = samples[m - 4] - last.ex
    t1y = samples[m - 3] - last.ey
    l1 = Math.hypot(t1x, t1y) || 1
  }

  const count = samples.length >> 1
  const u = new Float64Array(count)
  for (let k = 1; k < count; k++) {
    u[k] =
      u[k - 1] +
      Math.hypot(
        samples[k * 2] - samples[(k - 1) * 2],
        samples[k * 2 + 1] - samples[(k - 1) * 2 + 1],
      )
  }
  const total = u[count - 1] || 1
  for (let k = 0; k < count; k++) u[k] /= total

  const cubic = fitCubicSegment(samples, 0, count - 1, u, t0x / l0, t0y / l0, t1x / l1, t1y / l1)

  // Deviation of the old shape from the merged curve.
  for (let k = 1; k < count - 1; k += 2) {
    if (distanceToCubic(cubic, samples[k * 2], samples[k * 2 + 1]) > tol) return null
  }
  // Also keep the original vertices (routing points) within a loose bound —
  // prevents flattening pronounced bumps whose sample chords look mergeable.
  for (let k = i; k <= j; k++) {
    if (distanceToCubic(cubic, pieces[k].ex, pieces[k].ey) > tol) return null
  }
  return cubic
}
