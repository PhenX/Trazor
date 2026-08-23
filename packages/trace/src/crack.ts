import type { BinaryMask, TurnPolicy } from '@trazor/core'
import { signedAreaFlat } from '@trazor/core'
import type { FlatPoints } from './paths'

/**
 * Path decomposition (Selinger 2003, §2.1): closed boundary paths along pixel
 * "cracks", extracted in scan order from a working copy that is XOR-flipped
 * after each path, so hole boundaries surface as their own paths with opposite
 * orientation.
 */
export interface CrackPath {
  /** Closed lattice ring [x0,y0, x1,y1, …]; consecutive points differ by one unit step; last connects back to first. */
  points: FlatPoints
  /** Signed area: positive = boundary of a filled region, negative = hole boundary. */
  area: number
  /** A pixel whose square lies inside the region this path encloses (shape interior for positive paths, hole interior for negative ones). */
  interiorX: number
  interiorY: number
}

const DIRS = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
] as const

export function decomposeMask(
  mask: BinaryMask,
  turnPolicy: TurnPolicy,
  minArea: number,
): CrackPath[] {
  const { width: w, height: h } = mask
  const work = new Uint8Array(mask.data)
  const at = (x: number, y: number): number =>
    x >= 0 && x < w && y >= 0 && y < h ? work[y * w + x] : 0

  const paths: CrackPath[] = []
  // Per-pixel-row toggle columns for the XOR flip of the traced region.
  const rowToggles: number[][] = []

  for (let y = 0; y < h; y++) {
    const row = y * w
    for (let x = 0; x < w; x++) {
      if (work[row + x] !== 1) continue
      // Scan-order invariant: everything above and left has been flipped away,
      // so this pixel's top edge is a boundary crack and its top-left corner is
      // a genuine convex corner of the path (used later to anchor the cycle).
      const path = trace(x, y)
      // Traversal is always clockwise (ink-on-right in the working bitmap), so
      // the sign comes from the ORIGINAL color of the seed pixel: filled ⇒
      // outer boundary (+), empty ⇒ hole boundary (−). (Potrace's path sign.)
      const geoArea = Math.abs(signedAreaFlat(path))
      const isInk = mask.data[row + x] === 1
      xorFlip(path)
      if (geoArea >= minArea) {
        paths.push({ points: path, area: isInk ? geoArea : -geoArea, interiorX: x, interiorY: y })
      }
    }
  }
  return paths

  function trace(x0: number, y0: number): FlatPoints {
    const points: FlatPoints = []
    let cx = x0
    let cy = y0
    let dir = 0 // start heading +x along the top edge, ink on the right
    do {
      points.push(cx, cy)
      const [dx, dy] = DIRS[dir]
      // Pixels ahead-left / ahead-right of the crack from (cx,cy) toward dir;
      // the ±(d±1)/2 offsets are integer for unit directions.
      const l = at(cx + (dx + dy - 1) / 2, cy + (dy - dx - 1) / 2)
      const r = at(cx + (dx - dy - 1) / 2, cy + (dy + dx - 1) / 2)

      if (r === 1 && l === 0) {
        // straight
      } else if (r === 1 && l === 1) {
        dir = (dir + 3) & 3 // turn left
      } else if (r === 0 && l === 0) {
        dir = (dir + 1) & 3 // turn right
      } else {
        dir = turnAtSaddle(cx, cy, dir) // r white, l black: ambiguous
      }
      const [ndx, ndy] = DIRS[dir]
      cx += ndx
      cy += ndy
    } while (cx !== x0 || cy !== y0)
    return points
  }

  function turnAtSaddle(cx: number, cy: number, dir: number): number {
    const left = (dir + 3) & 3
    const right = (dir + 1) & 3
    switch (turnPolicy) {
      case 'left':
        return left
      case 'right':
        return right
      case 'black':
        return left // connects the diagonal ink pixels
      case 'white':
        return right // connects the diagonal background pixels
      case 'majority':
        return majorityAt(cx, cy) ? left : right
      case 'minority':
        return majorityAt(cx, cy) ? right : left
    }
  }

  /** Majority ink over growing square rings around a corner (Selinger 2003). */
  function majorityAt(cx: number, cy: number): boolean {
    for (let i = 2; i < 5; i++) {
      let ct = 0
      for (let a = -i + 1; a <= i - 1; a++) {
        ct += at(cx + a, cy + i - 1) ? 1 : -1
        ct += at(cx + i - 1, cy + a - 1) ? 1 : -1
        ct += at(cx + a - 1, cy - i) ? 1 : -1
        ct += at(cx - i, cy + a) ? 1 : -1
      }
      if (ct > 0) return true
      if (ct < 0) return false
    }
    return false
  }

  /** Toggle every pixel enclosed by the ring (even-odd over vertical cracks). */
  function xorFlip(points: FlatPoints): void {
    rowToggles.length = 0
    const n = points.length
    for (let i = 0; i < n; i += 2) {
      const x = points[i]
      const y = points[i + 1]
      const ny = points[(i + 3) % n]
      if (ny !== y) {
        // vertical crack at column x crossing pixel-row min(y, ny)
        const rowY = Math.min(y, ny)
        ;(rowToggles[rowY] ??= []).push(x)
      }
    }
    for (let ry = 0; ry < rowToggles.length; ry++) {
      const xs = rowToggles[ry]
      if (!xs) continue
      xs.sort((a, b) => a - b)
      const base = ry * w
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = xs[k]; x < xs[k + 1]; x++) {
          work[base + x] ^= 1
        }
      }
    }
  }
}

/**
 * Even-odd point-in-ring test with the query at pixel-center coordinates
 * (half-integers) against an integer lattice ring — never degenerate.
 */
export function ringContains(points: FlatPoints, px: number, py: number): boolean {
  let inside = false
  const n = points.length
  let x1 = points[n - 2]
  let y1 = points[n - 1]
  for (let i = 0; i < n; i += 2) {
    const x2 = points[i]
    const y2 = points[i + 1]
    if (y1 !== y2) {
      const ymin = Math.min(y1, y2)
      const ymax = Math.max(y1, y2)
      if (py > ymin && py < ymax && x1 < px) inside = !inside
    }
    x1 = x2
    y1 = y2
  }
  return inside
}

/** Axis-aligned bounds of a flat point ring. */
export function ringBounds(points: FlatPoints): [number, number, number, number] {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i]
    const y = points[i + 1]
    if (x < minX) minX = x
    if (y < minY) minY = y
    if (x > maxX) maxX = x
    if (y > maxY) maxY = y
  }
  return [minX, minY, maxX, maxY]
}
