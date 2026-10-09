import { describe, expect, it } from 'vitest'
import { mulberry32 } from '@trazor/core'
import type { LabelMap } from '@trazor/core'
import { splitFaces } from '../../src/planar/faces'
import { CLEAR } from '../../src/planar/types'

/** Rows of digits → a label map; `.` is transparent ({@link CLEAR}). */
function labelsOf(rows: string[]): LabelMap {
  const height = rows.length
  const width = height > 0 ? rows[0].length : 0
  const data = new Int32Array(width * height)
  let count = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x]
      const l = ch === '.' ? CLEAR : Number(ch)
      data[y * width + x] = l
      count = Math.max(count, l + 1)
    }
  }
  return { width, height, data, count }
}

function mapOf(data: number[], width: number, height: number): LabelMap {
  return { width, height, data: Int32Array.from(data), count: Math.max(0, ...data) + 1 }
}

/**
 * The reference split: a flood fill seeded in raster order, 4-neighbours of the same label
 * (inkvec's `split_within`, the oracle its run-based components are held equal to).
 */
function floodFill(labels: LabelMap): { ids: Int32Array; label: number[] } {
  const { width: w, height: h, data } = labels
  const ids = new Int32Array(w * h).fill(-1)
  const label: number[] = []
  const stack: number[] = []
  for (let seed = 0; seed < w * h; seed++) {
    if (ids[seed] >= 0) continue
    const id = label.length
    const lab = data[seed]
    label.push(lab)
    ids[seed] = id
    stack.push(seed)
    while (stack.length > 0) {
      const p = stack.pop() as number
      const x = p % w
      const y = (p - x) / w
      const visit = (q: number): void => {
        if (ids[q] < 0 && data[q] === lab) {
          ids[q] = id
          stack.push(q)
        }
      }
      if (x > 0) visit(p - 1)
      if (x + 1 < w) visit(p + 1)
      if (y > 0) visit(p - w)
      if (y + 1 < h) visit(p + w)
    }
  }
  return { ids, label }
}

/** Deterministic label maps: noise, blocks with repeated rows, transparency, a spiral. */
function randomMaps(): LabelMap[] {
  const rand = mulberry32(7)
  const out: LabelMap[] = []
  for (const [w, h] of [
    [1, 1],
    [1, 9],
    [9, 1],
    [5, 4],
    [17, 11],
    [40, 33],
  ]) {
    for (let k = 1; k <= 5; k++) {
      const noise: number[] = []
      const blocks: number[] = []
      const clear: number[] = []
      for (let p = 0; p < w * h; p++) {
        const x = p % w
        const y = (p - x) / w
        noise.push(Math.floor(rand() * k))
        blocks.push((Math.floor(x / 3) + Math.floor(y / 2)) % k)
        clear.push(rand() < 0.3 ? CLEAR : Math.floor(rand() * k))
      }
      out.push(mapOf(noise, w, h), mapOf(blocks, w, h), mapOf(clear, w, h))
    }
  }
  // A spiral of two labels: one component whose runs join only far down the image.
  const n = 9
  const spiral: number[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) spiral.push(Math.min(x, y, n - 1 - x, n - 1 - y) % 2)
  }
  out.push(mapOf(spiral, n, n))
  return out
}

describe('splitFaces', () => {
  it('splits a label that appears twice into two faces', () => {
    // inkvec `test_split_components_disjoint`: the two 1-regions are separate faces.
    const faces = splitFaces(mapOf([1, 1, 0, 1, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 4, 4))
    expect(faces.count).toBe(3)
    expect(faces.ids[0]).not.toBe(faces.ids[3])
    expect(Array.from(faces.label)).toEqual([1, 0, 1])
    expect(Array.from(faces.area)).toEqual([4, 10, 2])
  })

  it('keeps pixels that touch only at a corner apart', () => {
    const faces = splitFaces(labelsOf(['010', '101', '010']))
    expect(faces.count).toBe(9)
    expect(Array.from(faces.ids)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8])
    // A staircase of one label: every step meets the next only at a corner.
    const stairs = splitFaces(labelsOf(['1000', '0100', '0010', '0001']))
    expect(stairs.count).toBe(6)
    const ones = [0, 5, 10, 15].map((p) => stairs.ids[p])
    expect(new Set(ones).size).toBe(4)
  })

  it('gives transparent pixels faces of their own, one per component', () => {
    const faces = splitFaces(labelsOf(['..11', '.11.', '11..']))
    expect(faces.count).toBe(3)
    expect(Array.from(faces.label)).toEqual([CLEAR, 1, CLEAR])
    expect(Array.from(faces.area)).toEqual([3, 6, 3])
    expect(Array.from(faces.ids)).toEqual([0, 0, 1, 1, 0, 1, 1, 2, 1, 1, 2, 2])
  })

  it('numbers faces in raster order of their first pixel', () => {
    for (const labels of randomMaps()) {
      const { ids, count } = splitFaces(labels)
      // Scanning in raster order, every id is either one already seen or the next new one.
      let next = 0
      let ordered = true
      for (const id of ids) {
        if (id === next) next++
        else ordered &&= id < next
      }
      expect(ordered).toBe(true)
      expect(next).toBe(count)
    }
  })

  it('equals a flood fill seeded in raster order, id for id', () => {
    for (const labels of randomMaps()) {
      const faces = splitFaces(labels)
      const ref = floodFill(labels)
      expect(Array.from(faces.ids)).toEqual(Array.from(ref.ids))
      expect(Array.from(faces.label)).toEqual(ref.label)
      const area = new Array(faces.count).fill(0)
      for (const id of ref.ids) area[id]++
      expect(Array.from(faces.area)).toEqual(area)
    }
  })

  it('handles empty images', () => {
    for (const [w, h] of [
      [0, 0],
      [0, 4],
      [4, 0],
    ]) {
      const faces = splitFaces({ width: w, height: h, data: new Int32Array(0), count: 0 })
      expect(faces.count).toBe(0)
      expect(faces.ids.length).toBe(0)
    }
  })

  it('is deterministic', () => {
    const labels = randomMaps()[20]
    expect(splitFaces(labels)).toEqual(splitFaces(labels))
  })
})
