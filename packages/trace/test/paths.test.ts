import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { reverseCommands } from '../src/index'

describe('reverseCommands', () => {
  it('reverses a line/cubic subpath, swapping cubic control points', () => {
    const cmds: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'C', x1: 12, y1: 2, x2: 14, y2: 6, x: 14, y: 8 },
      { type: 'Z' },
    ]
    expect(reverseCommands(cmds)).toEqual([
      { type: 'M', x: 14, y: 8 },
      { type: 'C', x1: 14, y1: 6, x2: 12, y2: 2, x: 10, y: 0 },
      { type: 'L', x: 0, y: 0 },
      { type: 'Z' },
    ])
  })

  it('reverses an arc by flipping the sweep flag and swapping endpoints', () => {
    const cmds: PathCommand[] = [
      { type: 'M', x: 10, y: 0 },
      { type: 'A', rx: 10, ry: 10, rotation: 0, largeArc: false, sweep: true, x: -10, y: 0 },
    ]
    expect(reverseCommands(cmds)).toEqual([
      { type: 'M', x: -10, y: 0 },
      { type: 'A', rx: 10, ry: 10, rotation: 0, largeArc: false, sweep: false, x: 10, y: 0 },
    ])
  })
})
