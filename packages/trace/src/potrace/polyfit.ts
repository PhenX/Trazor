import type { FlatPoints } from '../paths'
import { chordPenalty, computeSums } from './sums'

/**
 * Optimal polyline over a lattice path with unit axis steps (open, endpoints
 * anchored): Selinger 2003 §2.2. First the maximal straight reach lon[i] via
 * the constraint-vector walk (§2.2.1), then a two-phase dynamic program that
 * minimizes the number of segments first and the chord penalty second
 * (§2.2.2-2.2.3). Closed rings are handled by the caller anchoring the cycle
 * at a guaranteed corner and appending the start point at the end.
 */
export function optimalPolyline(points: FlatPoints): number[] {
  const n = points.length >> 1
  if (n <= 2) return n === 2 ? [0, 1] : [0]

  const reach = straightReach(points)
  const sums = computeSums(points)

  // Minimal segment count via greedy furthest hops.
  let m = 0
  {
    let i = 0
    while (i < n - 1) {
      i = reach[i]
      m++
    }
  }

  // Left bound: furthest index attainable at slot k.
  const left = new Int32Array(m + 1)
  {
    let i = 0
    for (let k = 1; k <= m; k++) {
      i = reach[i]
      left[k] = i
    }
  }

  // earliest[j]: smallest i with reach[i] >= j (monotone ⇒ two-pointer).
  const earliest = new Int32Array(n)
  {
    let i = 0
    for (let j = 1; j < n; j++) {
      while (reach[i] < j) i++
      earliest[j] = i
    }
  }

  // Right bound: earliest index at slot k that still reaches the end in time.
  const right = new Int32Array(m + 1)
  right[m] = n - 1
  for (let k = m - 1; k >= 0; k--) right[k] = earliest[right[k + 1]]

  // DP over slots, windows [right[k], left[k]].
  let penPrev = new Float64Array(n).fill(Infinity)
  let penCur = new Float64Array(n).fill(Infinity)
  penPrev[0] = 0
  const prev: Int32Array[] = []
  for (let k = 1; k <= m; k++) {
    const lo = right[k]
    const hi = k === m ? n - 1 : left[k]
    const prevLo = right[k - 1]
    const prevHi = left[k - 1]
    const prevPtr = new Int32Array(hi - lo + 1).fill(-1)
    penCur.fill(Infinity, lo, hi + 1)
    for (let j = Math.max(lo, k === m ? n - 1 : lo); j <= hi; j++) {
      let best = Infinity
      let bestI = -1
      const iHi = Math.min(prevHi, j - 1)
      for (let i = prevLo; i <= iHi; i++) {
        if (reach[i] < j) continue
        const base = penPrev[i]
        if (base === Infinity) continue
        const p = base + chordPenalty(points, sums, i, j)
        if (p < best) {
          best = p
          bestI = i
        }
      }
      penCur[j] = best
      prevPtr[j - lo] = bestI
    }
    prev.push(prevPtr)
    const tmp = penPrev
    penPrev = penCur
    penCur = tmp
  }

  // Reconstruct.
  const out: number[] = [n - 1]
  let j = n - 1
  for (let k = m; k >= 1; k--) {
    const lo = right[k]
    const i = prev[k - 1][j - lo]
    if (i < 0) {
      // Should not happen; fall back to a straight chord.
      out.push(0)
      break
    }
    out.push(i)
    j = i
  }
  out.reverse()
  if (out[0] !== 0) out.unshift(0)
  return out
}

/** Direction index (0..3) of a unit axis step. */
function dirIndex(dx: number, dy: number): number {
  return (3 + 3 * Math.sign(dx) + Math.sign(dy)) / 2
}

/**
 * lon[i]: the furthest j ≥ i such that the subpath i..j is straight in the
 * Selinger sense, then converted into the polygon-segment reach
 * reach[i] = clamp(lon[i-1] − 1). Constraint-vector walk with next-corner
 * jumps, faithful to the paper.
 */
export function straightReach(points: FlatPoints): Int32Array {
  const n = points.length >> 1
  const px = (i: number) => points[i * 2]
  const py = (i: number) => points[i * 2 + 1]

  const segDir = new Int8Array(Math.max(0, n - 1))
  for (let i = 0; i < n - 1; i++) {
    segDir[i] = dirIndex(px(i + 1) - px(i), py(i + 1) - py(i))
  }

  // nc[i]: first k > i where the run direction changes (or the last point).
  const nc = new Int32Array(Math.max(0, n - 1))
  if (n >= 2) {
    nc[n - 2] = n - 1
    for (let i = n - 3; i >= 0; i--) {
      nc[i] = segDir[i + 1] !== segDir[i] ? i + 1 : nc[i + 1]
    }
  }

  const pivk = new Int32Array(n)
  pivk[n - 1] = n - 1
  const ct = new Int32Array(4)

  for (let i = n - 2; i >= 0; i--) {
    ct[0] = ct[1] = ct[2] = ct[3] = 0
    ct[segDir[i]]++
    let c0x = 0
    let c0y = 0
    let c1x = 0
    let c1y = 0
    let k1 = i
    let k = nc[i]
    let found = false
    let violated = false

    for (;;) {
      const d = dirIndex(Math.sign(px(k) - px(k1)), Math.sign(py(k) - py(k1)))
      ct[d]++
      if (ct[0] !== 0 && ct[1] !== 0 && ct[2] !== 0 && ct[3] !== 0) {
        pivk[i] = k1
        found = true
        break
      }
      const curX = px(k) - px(i)
      const curY = py(k) - py(i)
      if (c0x * curY - c0y * curX < 0 || c1x * curY - c1y * curX > 0) {
        violated = true
        break
      }
      if (Math.abs(curX) > 1 || Math.abs(curY) > 1) {
        const off0x = curX + (curY >= 0 && (curY > 0 || curX < 0) ? 1 : -1)
        const off0y = curY + (curX <= 0 && (curX < 0 || curY < 0) ? 1 : -1)
        if (c0x * off0y - c0y * off0x >= 0) {
          c0x = off0x
          c0y = off0y
        }
        const off1x = curX + (curY <= 0 && (curY < 0 || curX < 0) ? 1 : -1)
        const off1y = curY + (curX >= 0 && (curX > 0 || curY < 0) ? 1 : -1)
        if (c1x * off1y - c1y * off1x <= 0) {
          c1x = off1x
          c1y = off1y
        }
      }
      k1 = k
      if (k1 === n - 1) {
        pivk[i] = n - 1
        found = true
        break
      }
      k = nc[k1]
    }

    if (!found && violated) {
      // Fine search: walk from k1 toward k while the constraints allow.
      const dkx = Math.sign(px(k) - px(k1))
      const dky = Math.sign(py(k) - py(k1))
      const curX = px(k1) - px(i)
      const curY = py(k1) - py(i)
      const a = c0x * curY - c0y * curX
      const b = c0x * dky - c0y * dkx
      const c = c1x * curY - c1y * curX
      const d = c1x * dky - c1y * dkx
      let j = 10000000
      if (b < 0) j = Math.floor(a / -b)
      if (d > 0) j = Math.min(j, Math.floor(-c / d))
      pivk[i] = Math.min(n - 1, Math.max(k1, k1 + j))
    }
  }

  // Monotone cleanup: lon[i] may not overtake lon[i+1].
  const lon = new Int32Array(n)
  lon[n - 1] = n - 1
  let j = pivk[n - 1]
  for (let i = n - 2; i >= 0; i--) {
    if (pivk[i] >= i + 1 && pivk[i] <= j) j = pivk[i]
    lon[i] = j
  }

  // Polygon segment reach with one point of slack (paper: clip0[i] = lon[i−1] − 1).
  // The slack must not exclude the anchored terminal point: when the straight
  // range covers the whole tail, the final vertex stays directly reachable.
  const reach = new Int32Array(n)
  for (let i = 0; i < n; i++) {
    const base = i === 0 ? lon[0] : lon[i - 1]
    reach[i] = base >= n - 1 ? n - 1 : Math.min(n - 1, Math.max(i + 1, base - 1))
  }
  reach[n - 1] = n - 1
  return reach
}
