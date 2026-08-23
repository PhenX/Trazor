import type { PathCommand } from '@trazor/core'
import { describe, expect, it } from 'vitest'
import { cleanCommands } from '../src/clean'

describe('cleanCommands', () => {
  it('drops a vertex that lies exactly on a straight edge', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 }, // collinear on the top edge
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
    ]
    expect(cleanCommands(commands, 2)).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
    ])
  })

  it('collapses a run of several collinear vertices', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 2, y: 0 },
      { type: 'L', x: 4, y: 0 },
      { type: 'L', x: 6, y: 0 },
      { type: 'L', x: 6, y: 6 },
      { type: 'Z' },
    ]
    expect(cleanCommands(commands, 2)).toEqual([
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 6, y: 0 },
      { type: 'L', x: 6, y: 6 },
      { type: 'Z' },
    ])
  })

  it('keeps a vertex that is only nearly collinear', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0.1 },
      { type: 'L', x: 10, y: 0 },
      { type: 'Z' },
    ]
    expect(cleanCommands(commands, 2)).toEqual(commands)
  })

  it('never removes a curve anchor', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'Q', x1: 8, y1: 0, x: 10, y: 2 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
    ]
    // (5,0) leads into a curve, so it is not a line-line join and stays.
    expect(cleanCommands(commands, 2)).toEqual(commands)
  })

  it('cleans each subpath independently', () => {
    const commands: PathCommand[] = [
      { type: 'M', x: 0, y: 0 },
      { type: 'L', x: 5, y: 0 },
      { type: 'L', x: 10, y: 0 },
      { type: 'L', x: 10, y: 10 },
      { type: 'Z' },
      { type: 'M', x: 20, y: 20 },
      { type: 'L', x: 25, y: 20 },
      { type: 'L', x: 30, y: 20 },
      { type: 'Z' },
    ]
    const cleaned = cleanCommands(commands, 2)
    expect(cleaned.filter((c) => c.type === 'M')).toHaveLength(2)
    expect(cleaned.filter((c) => c.type === 'L')).toHaveLength(3)
  })
})
