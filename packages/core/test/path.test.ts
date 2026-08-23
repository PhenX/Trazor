import { describe, expect, it } from 'vitest'
import { countPathNodes, pathBounds } from '../src/index'
import type { PathCommand } from '../src/index'

describe('countPathNodes', () => {
  it('counts M/L/Q/C/A as one node each and Z as zero', () => {
    const cmds: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 1, y: 0 },
      { type: 'A', rx: 1, ry: 1, rotation: 0, largeArc: false, sweep: true, x: 1, y: 2 },
      { type: 'Z' },
    ]
    expect(countPathNodes(cmds)).toBe(3)
  })
})

describe('pathBounds with arcs', () => {
  it('covers a semicircle exactly (endpoints plus the swept extreme)', () => {
    // Upper semicircle of radius 10 about the origin (sweep through (0,10)).
    const b = pathBounds([
      { type: 'M', x: 10, y: 0 },
      { type: 'A', rx: 10, ry: 10, rotation: 0, largeArc: false, sweep: true, x: -10, y: 0 },
    ])
    expect(b).not.toBeNull()
    if (b === null) return
    expect(b.minX).toBeCloseTo(-10, 6)
    expect(b.maxX).toBeCloseTo(10, 6)
    expect(b.minY).toBeCloseTo(0, 6)
    expect(b.maxY).toBeCloseTo(10, 6)
  })

  it('does not include the opposite extreme for the other sweep direction', () => {
    const b = pathBounds([
      { type: 'M', x: 10, y: 0 },
      { type: 'A', rx: 10, ry: 10, rotation: 0, largeArc: false, sweep: false, x: -10, y: 0 },
    ])
    if (b === null) throw new Error('null bounds')
    expect(b.minY).toBeCloseTo(-10, 6)
    expect(b.maxY).toBeCloseTo(0, 6)
  })

  it('falls back to endpoints for a degenerate (zero-radius) arc', () => {
    const b = pathBounds([
      { type: 'M', x: 2, y: 3 },
      { type: 'A', rx: 0, ry: 0, rotation: 0, largeArc: false, sweep: true, x: 8, y: 5 },
    ])
    if (b === null) throw new Error('null bounds')
    expect(b).toEqual({ minX: 2, minY: 3, maxX: 8, maxY: 5 })
  })
})
