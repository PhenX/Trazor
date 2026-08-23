import { describe, expect, it } from 'vitest'
import { detectEdges } from '../src/index'
import { rasterOf } from './helpers'
import type { Rgba } from './helpers'

describe('detectEdges', () => {
  it('marks a band on both sides of a hard color boundary', () => {
    // Left half black, right half white; boundary between x=2 and x=3.
    const img = rasterOf(6, 1, (x) => (x < 3 ? [0, 0, 0, 255] : [255, 255, 255, 255]) as Rgba)
    const edges = detectEdges(img, 40)
    // The two pixels straddling the seam are edges; the far interiors are not.
    expect(edges.data[2]).toBe(1)
    expect(edges.data[3]).toBe(1)
    expect(edges.data[0]).toBe(0)
    expect(edges.data[5]).toBe(0)
  })

  it('marks nothing on a flat field', () => {
    const img = rasterOf(8, 8, () => [120, 130, 140, 255] as Rgba)
    const edges = detectEdges(img, 40)
    expect([...edges.data].every((v) => v === 0)).toBe(true)
  })

  it('ignores transitions below the threshold', () => {
    // A 10-level step summed across channels is 30 < 40 ⇒ not an edge.
    const img = rasterOf(4, 1, (x) => (x < 2 ? [100, 100, 100, 255] : [110, 110, 110, 255]) as Rgba)
    const edges = detectEdges(img, 40)
    expect([...edges.data]).toEqual([0, 0, 0, 0])
  })
})
