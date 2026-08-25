import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@trazor/core'
import {
  clearBorderLabel,
  dissolveThinBands,
  extractLabelMask,
  findEnclosedComponents,
  maskArea,
  mergeSmallRegions,
  smoothLabelsSpatial,
} from '../src/index'
import { maskOf } from './helpers'

function labelMap(width: number, height: number, rows: number[][], count: number): LabelMap {
  const data = new Int32Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = rows[y][x]
  }
  return { width, height, data, count }
}

describe('mergeSmallRegions', () => {
  it('absorbs single-pixel speckles and returns the same object', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 1, 0, 0],
      [0, 0, 0, 1],
      [0, 0, 0, 0],
    ]
    const labels = labelMap(4, 4, rows, 2)
    const out = mergeSmallRegions(labels, 2)
    expect(out).toBe(labels)
    for (const v of out.data) expect(v).toBe(0)
  })

  it('merges into the most frequent 4-neighbor label', () => {
    const rows = [
      [0, 0, 0, 1],
      [0, 2, 2, 1],
      [0, 0, 0, 1],
    ]
    const labels = labelMap(4, 3, rows, 3)
    mergeSmallRegions(labels, 3)
    // Region 2 (2 px) borders label 0 five times and label 1 once.
    expect([...labels.data]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('keeps a small region that is high-contrast against its target', () => {
    const rows = [
      [0, 0, 0, 1],
      [0, 2, 2, 1],
      [0, 0, 0, 1],
    ]
    const labels = labelMap(4, 3, rows, 3)
    // Label 2 (would merge into 0) is far from 0 in Oklab ⇒ kept as a detail.
    const oklab = new Float32Array([0, 0, 0, 0.5, 0, 0, 1, 0, 0])
    mergeSmallRegions(labels, 3, { oklab, keepContrast: 0.1 })
    expect(labels.data[1 * 4 + 1]).toBe(2)
    expect(labels.data[1 * 4 + 2]).toBe(2)
  })

  it('still merges a small low-contrast region under contrast mode', () => {
    const rows = [
      [0, 0, 0, 1],
      [0, 2, 2, 1],
      [0, 0, 0, 1],
    ]
    const labels = labelMap(4, 3, rows, 3)
    // Label 2 is barely different from 0 ⇒ noise, merged away as usual.
    const oklab = new Float32Array([0, 0, 0, 0.5, 0, 0, 0.05, 0, 0])
    mergeSmallRegions(labels, 3, { oklab, keepContrast: 0.1 })
    expect([...labels.data]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
  })

  it('keeps a small region marked by the protect mask', () => {
    const rows = [
      [0, 0, 0, 1],
      [0, 2, 2, 1],
      [0, 0, 0, 1],
    ]
    const labels = labelMap(4, 3, rows, 3)
    const protect = { width: 4, height: 3, data: new Uint8Array(12) }
    protect.data[1 * 4 + 1] = 1 // one pixel of region 2 sits on a predicted edge
    mergeSmallRegions(labels, 3, { protect })
    expect(labels.data[1 * 4 + 1]).toBe(2)
    expect(labels.data[1 * 4 + 2]).toBe(2)
  })

  it('still merges a small region the protect mask does not reach', () => {
    const rows = [
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 2, 2, 0, 1],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ]
    const labels = labelMap(6, 6, rows, 3)
    const protect = { width: 6, height: 6, data: new Uint8Array(36) }
    protect.data[0] = 1 // far corner: outside region 2's 8-neighborhood
    mergeSmallRegions(labels, 3, { protect })
    expect(labels.data[2 * 6 + 2]).toBe(0)
    expect(labels.data[2 * 6 + 3]).toBe(0)
  })

  it('keeps an unprotected component whose 8-neighborhood reaches a protected pixel', () => {
    // A hairline: two 1px pixels connected only diagonally (like adjacent
    // Bresenham steps), with the protect mask marking just one of them (the
    // stroke validation misses crossing pixels whose sides straddle a
    // boundary). The unmarked pixel must survive via the 8-neighborhood.
    const rows = [
      [0, 0, 0, 0],
      [0, 2, 0, 1],
      [0, 0, 2, 0],
      [0, 0, 0, 0],
    ]
    const labels = labelMap(4, 4, rows, 3)
    const protect = { width: 4, height: 4, data: new Uint8Array(16) }
    protect.data[1 * 4 + 1] = 1 // only the upper-left hairline pixel is marked
    mergeSmallRegions(labels, 2, { protect })
    expect(labels.data[1 * 4 + 1]).toBe(2)
    expect(labels.data[2 * 4 + 2]).toBe(2) // diagonal neighbor of a protected pixel
    // The isolated label-1 speck, nowhere near a protected pixel, still merges.
    expect(labels.data[1 * 4 + 3]).toBe(0)
  })

  it('keeps -1 pixels and regions surrounded only by -1', () => {
    const rows = [
      [-1, -1, -1, -1],
      [-1, 3, -1, 0],
      [-1, -1, -1, 0],
    ]
    const labels = labelMap(4, 3, rows, 4)
    mergeSmallRegions(labels, 4)
    expect(labels.data[1 * 4 + 1]).toBe(3) // no non-(-1) neighbor: unchanged
    expect(labels.data[0]).toBe(-1)
    expect(labels.data[1 * 4 + 3]).toBe(0)
  })

  it('cascades merges across rounds until stable', () => {
    const rows = [[0, 1, 2, 2, 2]]
    const labels = labelMap(5, 1, rows, 3)
    mergeSmallRegions(labels, 3)
    expect([...labels.data]).toEqual([2, 2, 2, 2, 2])
  })

  it('does nothing when minArea <= 1', () => {
    const rows = [[0, 1, 0]]
    const labels = labelMap(3, 1, rows, 2)
    mergeSmallRegions(labels, 1)
    expect([...labels.data]).toEqual([0, 1, 0])
  })

  it('does not merge regions at or above minArea', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 1, 1, 0],
      [0, 1, 1, 0],
      [0, 0, 0, 0],
    ]
    const labels = labelMap(4, 4, rows, 2)
    mergeSmallRegions(labels, 4)
    expect(labels.data[1 * 4 + 1]).toBe(1)
    expect(labels.data[2 * 4 + 2]).toBe(1)
  })
})

describe('dissolveThinBands', () => {
  it('dissolves a 1px mislabeled band into the regions it borders', () => {
    // Label 2 is a hairline column wedged between region 0 (left) and 1 (right).
    const rows = [
      [0, 0, 2, 1, 1, 1],
      [0, 0, 2, 1, 1, 1],
      [0, 0, 2, 1, 1, 1],
    ]
    const labels = labelMap(6, 3, rows, 3)
    dissolveThinBands(labels, 2)
    expect([...labels.data].some((v) => v === 2)).toBe(false) // the band is gone
    expect(labels.data[1 * 6 + 0]).toBe(0) // the two real regions survive
    expect(labels.data[1 * 6 + 5]).toBe(1)
  })

  it('leaves a coherent 2×2 region intact', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 2, 2, 0],
      [0, 2, 2, 0],
      [0, 0, 0, 0],
    ]
    const labels = labelMap(4, 4, rows, 2)
    dissolveThinBands(labels, 2)
    expect(labels.data[1 * 4 + 1]).toBe(2)
    expect(labels.data[2 * 4 + 2]).toBe(2)
  })

  it('is a no-op for rounds <= 0', () => {
    const rows = [
      [0, 2, 1],
      [0, 2, 1],
      [0, 2, 1],
    ]
    const labels = labelMap(3, 3, rows, 3)
    dissolveThinBands(labels, 0)
    expect([...labels.data]).toEqual([0, 2, 1, 0, 2, 1, 0, 2, 1])
  })

  it('never reassigns a protected pixel', () => {
    const rows = [
      [0, 0, 2, 1, 1],
      [0, 0, 2, 1, 1],
      [0, 0, 2, 1, 1],
    ]
    const labels = labelMap(5, 3, rows, 3)
    const protect = { width: 5, height: 3, data: new Uint8Array(15) }
    protect.data[1 * 5 + 2] = 1
    dissolveThinBands(labels, 2, protect)
    expect(labels.data[1 * 5 + 2]).toBe(2)
  })

  it('keeps a band with no labeled neighbors, and -1 stays -1', () => {
    const rows = [
      [-1, 2, -1],
      [-1, 2, -1],
      [-1, 2, -1],
    ]
    const labels = labelMap(3, 3, rows, 3)
    dissolveThinBands(labels, 2)
    expect([...labels.data]).toEqual([-1, 2, -1, -1, 2, -1, -1, 2, -1])
  })
})

describe('smoothLabelsSpatial', () => {
  // An Oklab image where every pixel takes its label's palette color.
  function oklabOf(data: Int32Array, palette: number[][]): Float32Array {
    const out = new Float32Array(data.length * 3)
    for (let i = 0; i < data.length; i++) {
      const c = palette[data[i]]
      out[i * 3] = c[0]
      out[i * 3 + 1] = c[1]
      out[i * 3 + 2] = c[2]
    }
    return out
  }

  it('re-assigns a rim-mixture band to the region it borders', () => {
    const rows = [
      [0, 0, 2, 1, 1, 1],
      [0, 0, 2, 1, 1, 1],
      [0, 0, 2, 1, 1, 1],
    ]
    const labels = labelMap(6, 3, rows, 3)
    const pal = [
      [0.5, 0.2, 0], // 0 red
      [0.5, -0.2, 0], // 1 blue
      [0.5, 0, 0], // 2 the rim mixture between them
    ]
    smoothLabelsSpatial(labels, oklabOf(labels.data, pal), new Float32Array(pal.flat()), 0.05, 3)
    expect([...labels.data].some((v) => v === 2)).toBe(false) // the invented band is gone
    expect(labels.data[1 * 6 + 0]).toBe(0)
    expect(labels.data[1 * 6 + 5]).toBe(1)
  })

  it('keeps a high-contrast 2×2 region against the coherence pull', () => {
    const rows = [
      [0, 0, 0, 0],
      [0, 2, 2, 0],
      [0, 2, 2, 0],
      [0, 0, 0, 0],
    ]
    const labels = labelMap(4, 4, rows, 3)
    const pal = [
      [0.5, 0.2, 0], // 0
      [0, 0, 0], // 1 (unused)
      [0.5, 0, 0.3], // 2 — far from 0
    ]
    smoothLabelsSpatial(labels, oklabOf(labels.data, pal), new Float32Array(pal.flat()), 0.05, 3)
    expect(labels.data[1 * 4 + 1]).toBe(2)
    expect(labels.data[2 * 4 + 2]).toBe(2)
  })

  it('is a no-op for lambda or rounds <= 0', () => {
    const rows = [
      [0, 2, 1],
      [0, 2, 1],
      [0, 2, 1],
    ]
    const pal = [
      [0.5, 0.2, 0],
      [0.5, -0.2, 0],
      [0.5, 0, 0],
    ]
    const flat = [0, 2, 1, 0, 2, 1, 0, 2, 1]
    const a = labelMap(3, 3, rows, 3)
    smoothLabelsSpatial(a, oklabOf(a.data, pal), new Float32Array(pal.flat()), 0, 3)
    expect([...a.data]).toEqual(flat)
    const b = labelMap(3, 3, rows, 3)
    smoothLabelsSpatial(b, oklabOf(b.data, pal), new Float32Array(pal.flat()), 0.05, 0)
    expect([...b.data]).toEqual(flat)
  })
})

describe('clearBorderLabel', () => {
  it('clears the border-connected background but keeps enclosed same-color regions', () => {
    // Label 0 is the surrounding background AND the center pixel; label 1 is a
    // ring enclosing that center 0 (like white text inside a colored banner).
    const rows = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ]
    const labels = labelMap(5, 5, rows, 2)
    const cleared = clearBorderLabel(labels, 0)
    expect(cleared).toBe(16) // the border frame, not the enclosed pixel
    expect(labels.data[2 * 5 + 2]).toBe(0) // enclosed region survives
    // Every border-frame pixel became -1.
    expect(labels.data[0]).toBe(-1)
    expect(labels.data[5 * 5 - 1]).toBe(-1)
    // The ring is untouched.
    expect(labels.data[1 * 5 + 1]).toBe(1)
  })

  it('is a no-op for a label not on the border', () => {
    const rows = [
      [1, 1, 1],
      [1, 0, 1],
      [1, 1, 1],
    ]
    const labels = labelMap(3, 3, rows, 2)
    expect(clearBorderLabel(labels, 0)).toBe(0)
    expect(labels.data[1 * 3 + 1]).toBe(0)
  })
})

describe('extractLabelMask / maskArea', () => {
  it('extracts one label as a binary mask', () => {
    const rows = [
      [0, 1, 1],
      [2, 1, 0],
    ]
    const labels = labelMap(3, 2, rows, 3)
    const mask = extractLabelMask(labels, 1)
    expect([...mask.data]).toEqual([0, 1, 1, 0, 1, 0])
    expect(maskArea(mask)).toBe(3)
  })

  it('counts foreground pixels', () => {
    expect(maskArea(maskOf(5, 5, (x, y) => x === y))).toBe(5)
    expect(maskArea(maskOf(3, 3, () => false))).toBe(0)
  })
})

describe('findEnclosedComponents', () => {
  it('returns only the innermost island — its container borders two labels', () => {
    // label 2 (center) inside a label 1 field inside label 0 (background/border).
    const rows = [
      [0, 0, 0, 0, 0, 0, 0],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 2, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 1, 1, 1, 1, 1, 0],
      [0, 0, 0, 0, 0, 0, 0],
    ]
    const labels = labelMap(7, 7, rows, 3)
    const found = findEnclosedComponents(labels)
    // The label 1 field borders both label 0 (outside) and label 2 (its own
    // island), so it is not single-surround enclosed; only label 2 is. Label 0
    // touches the border. So just the pupil comes back, surrounded by label 1.
    expect(found.map((c) => [c.label, c.surround, c.pixels.length])).toEqual([[2, 1, 1]])
  })

  it('finds several leaf islands, each with its surround, in row-major order', () => {
    const rows = [
      [0, 0, 0, 0, 0, 0],
      [0, 1, 1, 0, 0, 0],
      [0, 1, 1, 0, 0, 0],
      [0, 0, 0, 2, 2, 0],
      [0, 0, 0, 2, 2, 0],
      [0, 0, 0, 0, 0, 0],
    ]
    const labels = labelMap(6, 6, rows, 3)
    expect(
      findEnclosedComponents(labels).map((c) => [c.label, c.surround, c.pixels.length]),
    ).toEqual([
      [1, 0, 4],
      [2, 0, 4],
    ])
  })

  it('does not enclose a region bordered by two different labels', () => {
    const rows = [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 2, 0],
      [0, 1, 1, 2, 0],
      [0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0],
    ]
    const labels = labelMap(5, 5, rows, 3)
    // label 1 touches 0 and 2; label 2 touches 1 and 0 — neither is enclosed.
    expect(findEnclosedComponents(labels)).toEqual([])
  })

  it('does not enclose a region that touches the unlabeled exterior', () => {
    const rows = [
      [-1, -1, -1, -1, -1],
      [-1, 1, 1, 1, -1],
      [-1, 1, 1, 1, -1],
      [-1, 1, 1, 1, -1],
      [-1, -1, -1, -1, -1],
    ]
    const labels = labelMap(5, 5, rows, 2)
    expect(findEnclosedComponents(labels)).toEqual([])
  })
})
