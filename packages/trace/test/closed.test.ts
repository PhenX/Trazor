import { describe, expect, it } from 'vitest'
import type { BinaryMask, PathCommand } from '@trazor/core'
import { optimalPolyline, traceMask } from '@trazor/trace'

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

function rectMask(
  w: number,
  h: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): BinaryMask {
  const data = new Uint8Array(w * h)
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) data[y * w + x] = 1
  }
  return { width: w, height: h, data }
}

const OPTS = {
  curveMode: 'spline' as const,
  smoothing: 0.75,
  curveOptimize: true,
  optTolerance: 0.2,
  turnPolicy: 'minority' as const,
  minArea: 1,
}

function anchors(commands: PathCommand[]): [number, number][] {
  const out: [number, number][] = []
  for (const c of commands) {
    if (c.type !== 'Z') out.push([c.x, c.y])
  }
  return out
}

describe('optimalPolyline', () => {
  it('reduces a perfect staircase diagonal to a single segment', () => {
    const pts: number[] = []
    let x = 0
    let y = 0
    pts.push(x, y)
    for (let i = 0; i < 20; i++) {
      x += 1
      pts.push(x, y)
      y += 1
      pts.push(x, y)
    }
    const idx = optimalPolyline(pts)
    expect(idx.length).toBeLessThanOrEqual(3)
    expect(idx[0]).toBe(0)
    expect(idx[idx.length - 1]).toBe((pts.length >> 1) - 1)
  })

  it('keeps the corner of an L path', () => {
    const pts: number[] = []
    for (let x = 0; x <= 10; x++) pts.push(x, 0)
    for (let y = 1; y <= 10; y++) pts.push(10, y)
    const idx = optimalPolyline(pts)
    expect(idx.length).toBe(3)
    expect(idx[1]).toBe(10)
  })
})

describe('traceMask', () => {
  it('traces a rectangle to four sharp corners', () => {
    const shapes = traceMask(rectMask(30, 20, 5, 5, 25, 15), OPTS)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].holeCount).toBe(0)
    expect(shapes[0].area).toBe(20 * 10)
    const pts = anchors(shapes[0].commands)
    // Every anchor must sit on the rectangle's boundary (±0.6 adjust slack).
    for (const [x, y] of pts) {
      const onX = Math.abs(x - 5) < 0.6 || Math.abs(x - 25) < 0.6
      const onY = Math.abs(y - 5) < 0.6 || Math.abs(y - 15) < 0.6
      expect(onX || onY).toBe(true)
    }
    // And the four corners must be represented sharply.
    for (const [cx, cy] of [
      [5, 5],
      [25, 5],
      [25, 15],
      [5, 15],
    ]) {
      const hit = pts.some(([x, y]) => Math.abs(x - cx) < 0.6 && Math.abs(y - cy) < 0.6)
      expect(hit).toBe(true)
    }
  })

  it('traces a circle into few smooth cubics that stay on the radius', () => {
    const size = 60
    const r = 22
    const shapes = traceMask(circleMask(size, r), OPTS)
    expect(shapes).toHaveLength(1)
    const cmds = shapes[0].commands
    const curveCount = cmds.filter((c) => c.type === 'C').length
    const lineCount = cmds.filter((c) => c.type === 'L').length
    expect(curveCount).toBeGreaterThan(0)
    expect(curveCount).toBeLessThanOrEqual(16)
    // A circle should be essentially corner-free.
    expect(lineCount).toBeLessThanOrEqual(2)
    for (const [x, y] of anchors(cmds)) {
      const d = Math.hypot(x - size / 2, y - size / 2)
      expect(Math.abs(d - r)).toBeLessThan(1.6)
    }
  })

  it('groups holes under their enclosing shape', () => {
    const mask = rectMask(30, 30, 2, 2, 28, 28)
    // punch a hole
    for (let y = 10; y < 20; y++) {
      for (let x = 10; x < 20; x++) mask.data[y * 30 + x] = 0
    }
    const shapes = traceMask(mask, OPTS)
    expect(shapes).toHaveLength(1)
    expect(shapes[0].holeCount).toBe(1)
    // Two subpaths: two M commands.
    expect(shapes[0].commands.filter((c) => c.type === 'M')).toHaveLength(2)
  })

  it('closes spline subpaths exactly where they start', () => {
    const shapes = traceMask(circleMask(40, 15), OPTS)
    const cmds = shapes[0].commands
    const m = cmds[0] as Extract<PathCommand, { type: 'M' }>
    expect(m.type).toBe('M')
    let lastX = NaN
    let lastY = NaN
    for (const c of cmds) {
      if (c.type !== 'Z' && c.type !== 'M') {
        lastX = c.x
        lastY = c.y
      }
    }
    expect(lastX).toBeCloseTo(m.x, 6)
    expect(lastY).toBeCloseTo(m.y, 6)
  })

  it('is deterministic', () => {
    const a = JSON.stringify(traceMask(circleMask(50, 18), OPTS))
    const b = JSON.stringify(traceMask(circleMask(50, 18), OPTS))
    expect(a).toBe(b)
  })

  it('pixel mode reproduces exact rectilinear geometry', () => {
    const shapes = traceMask(rectMask(10, 10, 2, 3, 7, 8), { ...OPTS, curveMode: 'pixel' })
    expect(shapes).toHaveLength(1)
    const pts = anchors(shapes[0].commands)
    expect(pts).toHaveLength(4)
    const set = new Set(pts.map(([x, y]) => `${x},${y}`))
    expect(set).toEqual(new Set(['2,3', '7,3', '7,8', '2,8']))
  })
})

describe('adaptive corners', () => {
  const SHARP = { ...OPTS, cornerThreshold: 100 }
  const squareCorners: [number, number][] = [
    [4, 4],
    [10, 4],
    [10, 10],
    [4, 10],
  ]
  // A 6 px square: at default smoothing the α metric rounds corners this small.
  const smallSquare = (): BinaryMask => rectMask(16, 16, 4, 4, 10, 10)

  function sharpCornerCount(commands: PathCommand[], corners: [number, number][]): number {
    const pts = anchors(commands)
    let hit = 0
    for (const [cx, cy] of corners) {
      if (pts.some(([x, y]) => Math.abs(x - cx) < 0.6 && Math.abs(y - cy) < 0.6)) hit++
    }
    return hit
  }

  it('keeps a small square’s corners sharp when cornerThreshold is set', () => {
    const shapes = traceMask(smallSquare(), SHARP)
    expect(shapes).toHaveLength(1)
    expect(sharpCornerCount(shapes[0].commands, squareCorners)).toBe(4)
  })

  it('rounds the same small corners without a threshold (opt-in, legacy behavior)', () => {
    const shapes = traceMask(smallSquare(), OPTS)
    expect(sharpCornerCount(shapes[0].commands, squareCorners)).toBeLessThan(4)
  })

  it('keeps a circle smooth even with cornerThreshold set', () => {
    const cmds = traceMask(circleMask(60, 22), SHARP)[0].commands
    expect(cmds.filter((c) => c.type === 'L').length).toBeLessThanOrEqual(2)
    for (const [x, y] of anchors(cmds)) {
      expect(Math.abs(Math.hypot(x - 30, y - 30) - 22)).toBeLessThan(1.6)
    }
  })

  it('does not add corners versus the legacy trace of a curved shape (scale gate)', () => {
    const mask = circleMask(48, 18)
    const legacy = traceMask(mask, OPTS)[0].commands.filter((c) => c.type === 'L').length
    const adaptive = traceMask(mask, SHARP)[0].commands.filter((c) => c.type === 'L').length
    expect(adaptive).toBeLessThanOrEqual(legacy)
  })

  it('is deterministic with adaptive corners', () => {
    const a = JSON.stringify(traceMask(smallSquare(), SHARP))
    const b = JSON.stringify(traceMask(smallSquare(), SHARP))
    expect(a).toBe(b)
  })
})
