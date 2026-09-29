import { describe, expect, it } from 'vitest'
import { countPathNodes, scalePathCommands } from '../src/index'
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

describe('scalePathCommands', () => {
  it('scales every coordinate and arc radius, keeping rotation and flags', () => {
    const cmds: PathCommand[] = [
      { type: 'M', x: 2, y: 4 },
      { type: 'L', x: 6, y: 4 },
      { type: 'Q', x1: 8, y1: 4, x: 8, y: 6 },
      { type: 'C', x1: 8, y1: 8, x2: 6, y2: 10, x: 4, y: 10 },
      { type: 'A', rx: 2, ry: 3, rotation: 30, largeArc: true, sweep: false, x: 2, y: 4 },
      { type: 'Z' },
    ]
    expect(scalePathCommands(cmds, 0.5)).toEqual([
      { type: 'M', x: 1, y: 2 },
      { type: 'L', x: 3, y: 2 },
      { type: 'Q', x1: 4, y1: 2, x: 4, y: 3 },
      { type: 'C', x1: 4, y1: 4, x2: 3, y2: 5, x: 2, y: 5 },
      { type: 'A', rx: 1, ry: 1.5, rotation: 30, largeArc: true, sweep: false, x: 1, y: 2 },
      { type: 'Z' },
    ])
  })
})
