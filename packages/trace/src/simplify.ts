import { distToSegment } from '@vectorizer/core'

/**
 * Douglas-Peucker simplification (1973) of an open polyline (flat xy),
 * iterative to survive long inputs. Returns a new flat array.
 */
export function simplifyOpen(points: number[], eps: number): number[] {
  const n = points.length >> 1
  if (n <= 2 || eps <= 0) return points.slice()
  const keep = new Uint8Array(n)
  keep[0] = 1
  keep[n - 1] = 1
  const stack: number[] = [0, n - 1]
  while (stack.length > 0) {
    const last = stack.pop() as number
    const first = stack.pop() as number
    let maxDist = -1
    let maxIdx = -1
    const ax = points[first * 2]
    const ay = points[first * 2 + 1]
    const bx = points[last * 2]
    const by = points[last * 2 + 1]
    for (let i = first + 1; i < last; i++) {
      const d = distToSegment(points[i * 2], points[i * 2 + 1], ax, ay, bx, by)
      if (d > maxDist) {
        maxDist = d
        maxIdx = i
      }
    }
    if (maxDist > eps && maxIdx > 0) {
      keep[maxIdx] = 1
      stack.push(first, maxIdx, maxIdx, last)
    }
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(points[i * 2], points[i * 2 + 1])
  }
  return out
}
