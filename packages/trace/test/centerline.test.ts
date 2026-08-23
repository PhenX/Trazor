import { describe, expect, it } from 'vitest'
import type { BinaryMask } from '@vectorizer/core'
import { traceCenterline } from '@vectorizer/trace'

function skeletonOf(rows: string[]): BinaryMask {
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

const OPTS = {
  pruneLength: 4,
  cornerThreshold: 100,
  fitTolerance: 1,
  simplifyTolerance: 0.4,
  smoothing: 0.5,
}

describe('traceCenterline', () => {
  it('traces a straight line as one compact stroke', () => {
    const rows = ['.'.repeat(30), '.' + '#'.repeat(28) + '.', '.'.repeat(30)].map((r) =>
      r.replace(/\./g, ' '),
    )
    const strokes = traceCenterline(skeletonOf(rows), OPTS)
    expect(strokes).toHaveLength(1)
    expect(strokes[0].closed).toBe(false)
    expect(strokes[0].commands.length).toBeLessThanOrEqual(3)
    expect(strokes[0].length).toBeGreaterThan(25)
  })

  it('merges straight continuations through a crossing', () => {
    const size = 21
    const rows: string[] = []
    for (let y = 0; y < size; y++) {
      let row = ''
      for (let x = 0; x < size; x++) {
        row += y === 10 || x === 10 ? '#' : ' '
      }
      rows.push(row)
    }
    const strokes = traceCenterline(skeletonOf(rows), OPTS)
    // A cross is two strokes (h+v), not four half-arms.
    expect(strokes).toHaveLength(2)
    for (const s of strokes) expect(s.length).toBeGreaterThan(16)
  })

  it('prunes short spurs', () => {
    const rows = [
      '                    ',
      ' ################   ',
      '        #           ',
      '        #           ',
      '                    ',
    ]
    const strokes = traceCenterline(skeletonOf(rows), { ...OPTS, pruneLength: 5 })
    expect(strokes).toHaveLength(1)
    expect(strokes[0].length).toBeGreaterThan(12)
  })

  it('keeps a hard corner when the angle is below the threshold', () => {
    const rows: string[] = []
    for (let y = 0; y < 16; y++) {
      let row = ''
      for (let x = 0; x < 16; x++) {
        row += (y === 13 && x >= 2 && x <= 13) || (x === 13 && y >= 2 && y <= 13) ? '#' : ' '
      }
      rows.push(row)
    }
    const strokes = traceCenterline(skeletonOf(rows), OPTS)
    expect(strokes).toHaveLength(1)
    // Some anchor should sit near the corner (13.5, 13.5).
    const nearCorner = strokes[0].commands.some(
      (c) => c.type !== 'Z' && Math.hypot(c.x - 13.5, c.y - 13.5) < 1.5,
    )
    expect(nearCorner).toBe(true)
  })

  it('traces a closed ring as a closed stroke', () => {
    const rows: string[] = []
    for (let y = 0; y < 12; y++) {
      let row = ''
      for (let x = 0; x < 12; x++) {
        const on =
          (y === 2 && x >= 2 && x <= 9) ||
          (y === 9 && x >= 2 && x <= 9) ||
          (x === 2 && y >= 2 && y <= 9) ||
          (x === 9 && y >= 2 && y <= 9)
        row += on ? '#' : ' '
      }
      rows.push(row)
    }
    const strokes = traceCenterline(skeletonOf(rows), OPTS)
    expect(strokes).toHaveLength(1)
    expect(strokes[0].closed).toBe(true)
  })

  it('reports per-stroke width from the distance field', () => {
    // Two straight skeletons: a thin one (field 1.5 ⇒ width 3) and a thick one
    // (field 4 ⇒ width 8). A single global average would blur the two.
    const w = 30
    const h = 16
    const data = new Uint8Array(w * h)
    const field = new Float32Array(w * h)
    for (let x = 2; x <= 27; x++) {
      data[3 * w + x] = 1
      field[3 * w + x] = 1.5
      data[12 * w + x] = 1
      field[12 * w + x] = 4
    }
    const strokes = traceCenterline(
      { width: w, height: h, data },
      { ...OPTS, distanceField: field },
    )
    expect(strokes).toHaveLength(2)
    const widths = strokes.map((s) => s.width ?? -1).sort((a, b) => a - b)
    expect(widths[0]).toBeCloseTo(3, 5)
    expect(widths[1]).toBeCloseTo(8, 5)

    // Without a field, width is left unset.
    const plain = traceCenterline({ width: w, height: h, data }, OPTS)
    expect(plain.every((s) => s.width === undefined)).toBe(true)
  })
})
