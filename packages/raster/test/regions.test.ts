import { describe, expect, it } from 'vitest'
import type { LabelMap } from '@vectorizer/core'
import { extractLabelMask, maskArea, mergeSmallRegions } from '../src/index'
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

  it('still merges a small region the protect mask does not cover', () => {
    const rows = [
      [0, 0, 0, 1],
      [0, 2, 2, 1],
      [0, 0, 0, 1],
    ]
    const labels = labelMap(4, 3, rows, 3)
    const protect = { width: 4, height: 3, data: new Uint8Array(12) }
    protect.data[0] = 1 // marks a background pixel, not region 2
    mergeSmallRegions(labels, 3, { protect })
    expect([...labels.data]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1])
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
