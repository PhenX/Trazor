import { describe, expect, it } from 'vitest'
import { countPathNodes } from '../src/index'
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
