import { describe, expect, it } from 'vitest'
import type { BinaryMask } from '@vectorizer/core'
import { decomposeMask } from '@vectorizer/trace'

function maskOf(rows: string[]): BinaryMask {
  const height = rows.length
  const width = rows[0].length
  const data = new Uint8Array(width * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rows[y][x] === '#') data[y * width + x] = 1
    }
  }
  return { width, height, data }
}

describe('decomposeMask', () => {
  it('traces a single pixel as a unit square with positive area', () => {
    const paths = decomposeMask(maskOf(['#']), 'minority', 0)
    expect(paths).toHaveLength(1)
    expect(paths[0].area).toBe(1)
    expect(paths[0].points).toHaveLength(8)
    const pts = paths[0].points
    const set = new Set<string>()
    for (let i = 0; i < pts.length; i += 2) set.add(`${pts[i]},${pts[i + 1]}`)
    expect(set).toEqual(new Set(['0,0', '1,0', '1,1', '0,1']))
  })

  it('finds outer boundary and hole with opposite signs', () => {
    const paths = decomposeMask(
      maskOf(['#####', '#...#', '#.#.#', '#...#', '#####'].map((r) => r.replace(/\./g, ' '))),
      'minority',
      0,
    )
    const positives = paths.filter((p) => p.area > 0)
    const negatives = paths.filter((p) => p.area < 0)
    // Outer boundary encloses 25 (holes included geometrically); dot inside is 1.
    expect(positives.map((p) => p.area).toSorted((a, b) => b - a)).toEqual([25, 1])
    expect(negatives).toHaveLength(1)
    expect(negatives[0].area).toBe(-9)
  })

  it('area sums are consistent with pixel counts', () => {
    const mask = maskOf(
      ['###..', '###..', '..###', '..###', '.....'].map((r) => r.replace(/\./g, ' ')),
    )
    const paths = decomposeMask(mask, 'minority', 0)
    const total = paths.reduce((s, p) => s + p.area, 0)
    let pixels = 0
    for (const v of mask.data) pixels += v
    expect(total).toBe(pixels)
  })

  it('respects minArea by dropping specks', () => {
    const paths = decomposeMask(
      maskOf(['#....', '.....', '..###', '..###', '.....'].map((r) => r.replace(/\./g, ' '))),
      'minority',
      2,
    )
    expect(paths).toHaveLength(1)
    expect(paths[0].area).toBe(6)
  })

  it('turn policy splits or joins diagonal checkerboard pixels', () => {
    const rows = ['#.', '.#'].map((r) => r.replace(/\./g, ' '))
    const joined = decomposeMask(maskOf(rows), 'black', 0)
    const split = decomposeMask(maskOf(rows), 'white', 0)
    expect(joined).toHaveLength(1)
    expect(joined[0].area).toBe(2)
    expect(split).toHaveLength(2)
  })
})
