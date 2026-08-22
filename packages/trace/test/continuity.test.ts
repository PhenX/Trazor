import { describe, expect, it } from 'vitest'
import type { BinaryMask, PathCommand } from '@vectorizer/core'
import { traceMask } from '@vectorizer/trace'

function circleMask(size: number, r: number): BinaryMask {
  const data = new Uint8Array(size * size)
  const c = size / 2
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - c
      const dy = y + 0.5 - c
      if (dx * dx + dy * dy <= r * r) data[y * size + x] = 1
    }
  }
  return { width: size, height: size, data }
}

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
}

interface Seg {
  p0: [number, number]
  /** Unit tangent leaving p0, and unit tangent arriving at p3. */
  tOut: [number, number]
  tIn: [number, number]
  p3: [number, number]
  kind: 'line' | 'cubic'
}

function norm(x: number, y: number): [number, number] {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

/** Split a closed command list into segments carrying their end tangents. */
function segments(commands: PathCommand[]): Seg[] {
  const start = commands[0]
  if (start.type !== 'M') throw new Error('path must start with M')
  let cx = start.x
  let cy = start.y
  const segs: Seg[] = []
  for (const c of commands) {
    if (c.type === 'L') {
      segs.push({
        p0: [cx, cy],
        tOut: norm(c.x - cx, c.y - cy),
        tIn: norm(c.x - cx, c.y - cy),
        p3: [c.x, c.y],
        kind: 'line',
      })
      cx = c.x
      cy = c.y
    } else if (c.type === 'C') {
      segs.push({
        p0: [cx, cy],
        tOut: norm(c.x1 - cx, c.y1 - cy),
        tIn: norm(c.x - c.x2, c.y - c.y2),
        p3: [c.x, c.y],
        kind: 'cubic',
      })
      cx = c.x
      cy = c.y
    }
  }
  return segs
}

/** Angle (degrees) between two unit vectors. */
function angleBetween(a: [number, number], b: [number, number]): number {
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1]))
  return (Math.acos(dot) * 180) / Math.PI
}

describe('curve continuity', () => {
  it('a traced circle is all cubics and G1-continuous at every join', () => {
    const shapes = traceMask(circleMask(100, 40), OPTS)
    expect(shapes).toHaveLength(1)
    const segs = segments(shapes[0].commands)
    expect(segs.length).toBeGreaterThan(2)
    // A smooth circle has no corners.
    expect(segs.every((s) => s.kind === 'cubic')).toBe(true)
    // Tangent leaving each join matches the tangent arriving at it (wrap included).
    for (let i = 0; i < segs.length; i++) {
      const prev = segs[(i + segs.length - 1) % segs.length]
      expect(angleBetween(prev.tIn, segs[i].tOut)).toBeLessThan(2)
    }
  })

  it('keeps G1 at smooth joins even with curve optimization off', () => {
    const shapes = traceMask(circleMask(120, 50), { ...OPTS, curveOptimize: false })
    const segs = segments(shapes[0].commands).filter((s) => s.kind === 'cubic')
    expect(segs.length).toBeGreaterThan(4)
    // Consecutive cubic pieces meet tangent-continuously.
    const joinAngles: number[] = []
    for (let i = 1; i < segs.length; i++) {
      if (segs[i - 1].p3[0] === segs[i].p0[0] && segs[i - 1].p3[1] === segs[i].p0[1]) {
        joinAngles.push(angleBetween(segs[i - 1].tIn, segs[i].tOut))
      }
    }
    expect(joinAngles.length).toBeGreaterThan(3)
    expect(Math.max(...joinAngles)).toBeLessThan(2)
  })
})
